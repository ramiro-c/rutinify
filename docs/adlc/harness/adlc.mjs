#!/usr/bin/env node
/**
 * ADLC harness — intérprete del workflow-spec.json.
 *
 * El cerebro NO es este archivo: es
 * docs/adlc/toolkit/04-MVP-Agentic-Loop/workflow-spec.json.
 * Esto sólo lo ejecuta. Si este driver y el spec discrepan, gana el spec.
 *
 * Uso:
 *   node adlc.mjs start   <BET-ID>       arranca o continúa hasta el próximo punto de pausa
 *   node adlc.mjs resume  <BET-ID>       continúa después de que el humano hizo su parte
 *   node adlc.mjs status  [BET-ID]       en qué estado está y qué está esperando
 *   node adlc.mjs log     <BET-ID>       historial de transiciones, con costo por transición
 *   node adlc.mjs gdr     <BET-ID>       imprime la plantilla del GDR que tenés que completar
 *   node adlc.mjs observe <BET-ID> [--input <archivo.json>]
 *                                        corre Observe (o importa una medición real) y
 *                                        evalúa el rollback_monitor
 *   node adlc.mjs verify-runs            notaría de artefactos: revisa los JSON y JSONL de
 *                                        runs/ contra el spec y falla si alguno está corrupto.
 *                                        Sin LLM, sin red, sólo lectura
 *   node adlc.mjs selftest               ejercita el spec y las reglas del driver, sin
 *                                        invocar ningún modelo
 */

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { readFile, writeFile, appendFile, rename, mkdir, readdir, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const DIALECT = 'https://json-schema.org/draft/2020-12/schema'

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  c: (s) => `\x1b[36m${s}\x1b[0m`,
}

function die(msg, code = 1) {
  console.error(`\n${C.r('✗')} ${msg}\n`)
  process.exit(code)
}

function ok(msg) {
  console.log(`${C.g('✓')} ${msg}`)
}

function info(msg) {
  console.log(`${C.dim('·')} ${msg}`)
}

/** Punto de pausa: el proceso termina, el estado queda en disco. */
function parked(j, artifact) {
  console.log(`\n${C.b('GATE HUMANO')} — el harness no avanza hasta que completes ${C.b(artifact)}.`)
  console.log(`\n  ${j.awaiting.instruction}\n`)
  process.exit(0)
}

// ---------------------------------------------------------------- spec + config

const loadJson = async (p) => JSON.parse(await readFile(p, 'utf8'))

const cfg = await loadJson(path.resolve(HERE, 'phases.json'))
const phases = cfg.phases
const S = await loadJson(path.resolve(HERE, cfg.spec))
const RUNS = path.resolve(REPO, cfg.runs_dir)
const BET_DIR = path.resolve(REPO, cfg.bet_dir)

const runPath = (betId, suffix) => path.join(RUNS, `${betId}${suffix}`)
const JOURNAL = (betId) => runPath(betId, '.json')
const GDR = (betId) => runPath(betId, '.gdr.json')
const OBSERVE = (betId) => runPath(betId, '.observe.json')
const FEEDBACK = (betId) => runPath(betId, '.feedback.jsonl')
const ROLLBACK_LOG = path.join(RUNS, 'rollback-events.jsonl')

// ---------------------------------------------------------------- ajv

const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false })
addFormats(ajv)

/**
 * Compila un nodo de schema del spec. Le inyecta el `$defs` del spec como propio,
 * así los `#/$defs/...` resuelven sin importar si el nodo venía por $ref o inline.
 */
function compileNode(node) {
  if (!node) throw new Error('nodo de schema ausente')
  const wrapped = node.$ref
    ? { $schema: DIALECT, $defs: S.$defs, $ref: node.$ref }
    : { $schema: DIALECT, $defs: S.$defs, ...node }
  return ajv.compile(wrapped)
}

const validatorCache = new Map()
function validatorFor(node) {
  const key = JSON.stringify(node)
  if (!validatorCache.has(key)) validatorCache.set(key, compileNode(node))
  return validatorCache.get(key)
}

function validateOrThrow(node, data, label) {
  const v = validatorFor(node)
  if (v(data)) return
  const lines = (v.errors ?? []).map(
    (e) => `    ${C.r(e.instancePath || '/')} ${e.message} ${C.dim(JSON.stringify(e.params))}`,
  )
  die(`${label} no valida contra el schema:\n${lines.join('\n')}`)
}

// ---------------------------------------------------------------- expression language

/**
 * Evaluador del `expression_language` del spec: rutas con punto, ==, !=, >=, <=, >, <,
 * `in` sobre listas literales, and / or / not. ~40 líneas, como promete el spec.
 */
function evalWhen(expr, ctx) {
  const tokens = []
  const re = /\s*(\[[^\]]*\]|'[^']*'|"[^"]*"|[A-Za-z_][\w.]*|==|!=|>=|<=|>|<|\d+(?:\.\d+)?|\(|\))/g
  let m
  while ((m = re.exec(expr))) tokens.push(m[1])
  let i = 0

  const peek = () => tokens[i]
  const eat = (t) => {
    if (peek() === t) return tokens[i++]
    throw new Error(`se esperaba ${t}, se encontró ${peek() ?? 'fin'}`)
  }
  const atEnd = () => i >= tokens.length

  const literal = (tok) => {
    if (tok === 'true') return true
    if (tok === 'false') return false
    if (tok === 'null') return null
    if (/^-?\d/.test(tok)) return Number(tok)
    if (/^['"]/.test(tok)) return tok.slice(1, -1)
    if (tok.startsWith('[')) {
      return tok
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => literal(s))
    }
    const segs = tok.split('.')
    let v = ctx
    for (const s of segs) v = v == null ? undefined : v[s]
    return v
  }

  const operand = () => {
    if (peek() === '(') {
      eat('(')
      const v = orExpr()
      eat(')')
      return v
    }
    return literal(tokens[i++])
  }

  const comparison = () => {
    const left = operand()
    const op = peek()
    if (op === 'in') {
      i++
      const list = operand()
      return Array.isArray(list) && list.includes(left)
    }
    if (['==', '!=', '>=', '<=', '>', '<'].includes(op)) {
      i++
      const right = operand()
      switch (op) {
        case '==':
          return left === right
        case '!=':
          return left !== right
        case '>=':
          return left >= right
        case '<=':
          return left <= right
        case '>':
          return left > right
        case '<':
          return left < right
      }
    }
    return left
  }

  const notExpr = () => (peek() === 'not' ? (i++, !notExpr()) : comparison())
  const andExpr = () => {
    let v = notExpr()
    while (peek() === 'and') (i++, v = notExpr() && v)
    return v
  }
  function orExpr() {
    let v = andExpr()
    while (peek() === 'or') (i++, v = andExpr() || v)
    return v
  }

  const result = orExpr()
  if (!atEnd()) throw new Error(`sobró texto sin consumir en "${expr}": ${tokens.slice(i).join(' ')}`)
  return result
}

/** Resuelve la transición que dispara, evaluando los `when` del spec en orden. */
function pickTransition(stateName, on, ctx) {
  const state = S.states[stateName]
  const candidates = (state.transitions ?? []).filter((t) => t.on === on)
  for (const t of candidates) {
    let fires = false
    try {
      fires = evalWhen(t.when, ctx)
    } catch (e) {
      die(`la expresión when de ${stateName}/${t.on} no es evaluable: ${e.message}`)
    }
    if (fires) return t
  }
  return null
}

// ---------------------------------------------------------------- sesiones opencode

const AGENT_DIR = path.resolve(REPO, '.opencode', 'agents')
const modelCache = new Map()

async function agentModel(agent) {
  if (modelCache.has(agent)) return modelCache.get(agent)
  let model = '?'
  try {
    const md = await readFile(path.join(AGENT_DIR, `${agent}.md`), 'utf8')
    model = /^model:\s*(.+)$/m.exec(md)?.[1]?.trim() ?? '?'
  } catch {
    /* agente ausente: se reporta al invocar */
  }
  modelCache.set(agent, model)
  return model
}

/**
 * El plugin de Warp inyecta secuencias OSC-777 en stdout, pegadas al inicio de las
 * líneas de JSON, sin separador. Sin esto, el parseo línea por línea falla.
 */
const stripOsc = (s) =>
  s
    .replace(/\x1b\]777;[^\x07\x1b]*\x07/g, '')
    .replace(/\x1b\]777;[^\x07\x1b]*\x1b\\/g, '')
    .replace(/[\x07\x08]/g, '')

function runOpencode({ agent, prompt, title }) {
  return new Promise((resolve, reject) => {
    const args = [
      'run',
      '--agent',
      agent,
      '--format',
      'json',
      '--auto',
      '--title',
      title,
      prompt,
    ]
    const child = spawn('opencode', args, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) => {
      const events = []
      for (const rawLine of out.split('\n')) {
        const line = stripOsc(rawLine).trim()
        if (!line.startsWith('{')) continue
        try {
          events.push(JSON.parse(line))
        } catch {
          /* línea partida o ruido: se ignora */
        }
      }
      const text = events
        .filter((e) => e.type === 'text')
        .map((e) => e.part?.text ?? '')
        .join('')
      const finishes = events.filter((e) => e.type === 'step_finish')
      const last = finishes[finishes.length - 1]
      const errors = events.filter((e) => e.type === 'error')
      resolve({
        code,
        text,
        err,
        sessionId: events.find((e) => e.sessionID)?.sessionID ?? null,
        cost: finishes.reduce((a, e) => a + (e.part?.cost ?? 0), 0),
        tokens: last?.part?.tokens ?? null,
        steps: finishes.length,
        errors: errors.map((e) => e.part?.error?.data?.message ?? e.part?.error?.name ?? 'error'),
      })
    })
  })
}

/**
 * Lo que el Architect necesita saber cuando vuelve desde un redirect. Sin esto re-emite la
 * misma Bet y el ciclo se repite para siempre: el escape del spec (`generation_target_ambiguo`)
 * volveria a dispararse en la proxima ronda.
 */
async function readRedirectContext(betId) {
  try {
    const c = JSON.parse(await readFile(runPath(betId, '.redirect-context.json'), 'utf8'))
    return JSON.stringify(c, null, 2)
  } catch {
    return '(sin redirect previo: esta es la primera formulación de la Bet)'
  }
}

async function invokePhase({ agent, promptFile, betId, title, bet }) {
  const model = await agentModel(agent)
  const template = await readFile(path.resolve(HERE, promptFile), 'utf8')
  const prompt = template
    .replaceAll('{{bet_id}}', betId)
    .replaceAll('{{runs_dir}}', path.relative(REPO, RUNS))
    .replaceAll('{{bet_file}}', path.relative(REPO, betFilePath(betId)))
    .replaceAll('{{owner_governor}}', bet?.owner_governor ?? '(sin definir)')
    .replaceAll('{{redirect_context}}', await readRedirectContext(betId))

  console.log(`\n${C.c('▸')} ${C.b(agent)} ${C.dim(`(${model})`)} ${C.dim(`— ${title}`)}`)
  const t0 = Date.now()
  const r = await runOpencode({ agent, prompt, title: `adlc/${betId}/${title}` })
  const secs = ((Date.now() - t0) / 1000).toFixed(1)

  if (r.code !== 0) {
    die(`${agent} salió con código ${r.code}.\n${r.err.trim() || r.text.slice(-1500)}`)
  }
  if (r.errors.length) die(`${agent} reportó un error: ${r.errors.join('; ')}`)
  info(
    `${secs}s · $${r.cost.toFixed(4)} · ${r.tokens?.input ?? '?'}→${r.tokens?.output ?? '?'} tok` +
      (r.sessionId ? ` · sesión ${r.sessionId}` : ''),
  )
  return r
}

/**
 * Extrae TODOS los objetos JSON del texto (bloques cercados + balanceados), del mas largo al
 * mas corto. Existe porque un agente puede narrar, resumir y hasta auto-compactarse ANTES de
 * emitir su JSON final: quedarse con el primer `{` del texto agarra un objeto cualquiera.
 * El objeto real es, casi siempre, el mas grande del texto.
 */
function extractJsonCandidates(text) {
  const body = text ?? ''
  const found = []

  const fenceRe = /```(?:json)?\s*\n([\s\S]*?)```/g
  let m
  while ((m = fenceRe.exec(body))) {
    try {
      found.push(JSON.parse(m[1].trim()))
    } catch {}
  }

  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '{') continue
    let depth = 0
    let inStr = false
    let esc = false
    for (let k = i; k < body.length; k++) {
      const ch = body[k]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          try {
            found.push(JSON.parse(body.slice(i, k + 1)))
          } catch {}
          i = k
          break
        }
      }
    }
  }

  return found.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)
}

/** El objeto JSON mas probable del texto: el mas largo de los parseables. */
function extractJson(text) {
  const [first] = extractJsonCandidates(text)
  return first === undefined ? null : JSON.stringify(first)
}

/** Volca el texto crudo a dumpPath y devuelve la ruta relativa (o un motivo). */
function writeRaw(text, dumpPath) {
  if (!dumpPath) return 'no guardado'
  try {
    writeFileSync(dumpPath, text ?? '')
    return path.relative(REPO, dumpPath)
  } catch {
    return 'no se pudo guardar'
  }
}

function parseJsonOrDie(text, label, dumpPath) {
  const r = tryParseJson(text, dumpPath)
  if (r.error) die(`${label} ${r.error}`)
  return r.value
}

/**
 * Igual que parseJsonOrDie pero SIN matar el proceso: devuelve { value, candidates, dump } o
 * { error }. Volca SIEMPRE el crudo: el fallo mas probable no es "no hay JSON" sino "JSON
 * valido con la forma equivocada", y ahi el mensaje del schema no alcanza para diagnosticar.
 */
function tryParseJson(text, dumpPath) {
  const dump = writeRaw(text, dumpPath)
  const candidates = extractJsonCandidates(text)
  if (!candidates.length) {
    return {
      error: `no devolvió JSON parseable (${(text ?? '').length} caracteres, crudo en ${dump})`,
    }
  }
  return { value: candidates[0], candidates, dump }
}

// ---------------------------------------------------------------- Bet Register

const betFilePath = (betId) => path.join(BET_DIR, `${betId}.md`)

/** Frontmatter mínimo: alcanza para las claves del Bet Register (una por línea). */
async function readBet(betId) {
  let md
  try {
    md = await readFile(betFilePath(betId), 'utf8')
  } catch {
    die(`no existe la Bet ${C.b(betId)} en ${path.relative(REPO, betFilePath(betId))}`)
  }
  const fm = /^---\n([\s\S]*?)\n---/.exec(md)
  if (!fm) die(`la Bet ${betId} no tiene frontmatter YAML`)
  const fields = {}
  for (const line of fm[1].split('\n')) {
    const m = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(line)
    if (m) fields[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return { ...fields, file: betFilePath(betId), raw: md }
}

/** Bets que existen como archivo pero puede que nunca hayan entrado al harness. */
async function listBets() {
  try {
    const files = (await readdir(BET_DIR)).filter((f) => /^BET-\d{4}-\d{3}\.md$/.test(f))
    const out = []
    for (const f of files) {
      const id = f.replace(/\.md$/, '')
      const fm = /^---\n([\s\S]*?)\n---/.exec(await readFile(path.join(BET_DIR, f), 'utf8'))
      const status = /^status:\s*(.*)$/m.exec(fm?.[1] ?? '')?.[1]?.trim() ?? 'sin status'
      out.push({ id, status })
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
  } catch {
    return []
  }
}

/**
 * El spec define `bet_register_status` por estado. El driver es el único que escribe
 * transiciones, así que mantiene ese campo sincronizado. No toca nada fuera del frontmatter.
 */
async function setBetStatus(betId, status) {
  const bet = await readBet(betId)
  if (bet.status === status) return false
  const updated = bet.raw.replace(
    /^(---\n[\s\S]*?^status:\s*).*$/m,
    (_all, head) => `${head}${status}`,
  )
  if (updated === bet.raw) {
    console.log(C.y(`!`) + ` no pude actualizar status en ${path.relative(REPO, bet.file)}`)
    return false
  }
  await writeFile(bet.file, updated)
  info(`Bet Register: status ${C.dim(bet.status)} → ${C.b(status)}`)
  return true
}

// ---------------------------------------------------------------- journal

async function loadJournal(betId) {
  try {
    return JSON.parse(await readFile(JOURNAL(betId), 'utf8'))
  } catch {
    return null
  }
}

async function saveJournal(j) {
  await mkdir(RUNS, { recursive: true })
  const { raw, ...clean } = j
  await writeFile(JOURNAL(j.bet_id), JSON.stringify(clean, null, 2) + '\n')
}

async function newJournal(betId) {
  const initialState = S.initial_state
  const j = {
    bet_id: betId,
    state: initialState,
    phase: S.states[initialState].phase,
    bet_register_status: S.states[initialState].bet_register_status,
    since: new Date().toISOString(),
    round: 0,
    artifacts: {},
    awaiting: null,
    totals: { cost_usd: 0, runs: 0, tokens: { input: 0, output: 0 } },
    history: [],
  }
  await saveJournal(j)
  return j
}

function recordRun(j, { from, to, on, agent, model, result, note }) {
  const entry = {
    at: new Date().toISOString(),
    from,
    to,
    on,
    agent,
    model,
    session_id: result?.sessionId ?? null,
    cost_usd: Number((result?.cost ?? 0).toFixed(6)),
    tokens: result?.tokens
      ? { input: result.tokens.input, output: result.tokens.output }
      : null,
    note: note ?? null,
  }
  j.history.push(entry)
  j.totals.cost_usd = Number((j.totals.cost_usd + (entry.cost_usd ?? 0)).toFixed(6))
  if (result) {
    j.totals.runs += 1
    j.totals.tokens.input += result.tokens?.input ?? 0
    j.totals.tokens.output += result.tokens?.output ?? 0
  }
  return entry
}

async function transition(j, { on, ctx, agent, model, result, note }) {
  const t = pickTransition(j.state, on, ctx)
  if (!t) {
    die(
      `ninguna transición de ${j.state} matchea on="${on}".\n` +
        `  Contexto evaluado: ${JSON.stringify(ctx)}\n` +
        `  Transiciones declaradas: ${(S.states[j.state].transitions ?? [])
          .map((x) => `${x.on} (when: ${x.when})`)
          .join(' | ')}`,
    )
  }
  const from = j.state
  const entry = recordRun(j, { from, to: t.to, on: t.on, agent, model, result, note })
  j.state = t.to
  j.phase = S.states[t.to].phase
  j.bet_register_status = S.states[t.to].bet_register_status
  j.since = entry.at
  j.round = 0
  j.awaiting = null
  console.log(`\n${C.g('→')} ${C.b(from)} → ${C.b(t.to)} ${C.dim(`on ${t.on}`)}`)
  console.log(`  ${C.dim(t.description ?? '')}`)
  await setBetStatus(j.bet_id, j.bet_register_status)
  await saveJournal(j)
  return t
}

// ---------------------------------------------------------------- artifact helpers

async function writeArtifact(betId, suffix, data) {
  // JSON.stringify(undefined) devuelve undefined, y writeFile escribiria el texto
  // "undefined": un artefacto ilegible que recien explota mucho despues, al releerlo.
  if (data === undefined) die(`writeArtifact(${suffix}) recibio undefined: el artefacto quedaria ilegible`)
  const p = runPath(betId, suffix)
  await writeFile(p, JSON.stringify(data, null, 2) + '\n')
  info(`artefacto: ${path.relative(REPO, p)}`)
  return p
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- feedback Validator → Generator

async function openDefects(betId) {
  const p = FEEDBACK(betId)
  if (!(await exists(p))) return []
  const status = new Map()
  for (const line of (await readFile(p, 'utf8')).split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    let o
    try {
      o = JSON.parse(t)
    } catch {
      continue
    }
    const key = `${o.target}|${o.repro ?? ''}`
    if (o.kind === 'defect') status.set(key, { ...o, key })
    else if (o.kind === 'fix' && status.has(key)) status.get(key).status = 'fixed'
  }
  return [...status.values()].filter((d) => d.status === 'open')
}

async function touchFeedback(betId) {
  const p = FEEDBACK(betId)
  if (!(await exists(p))) await writeFile(p, '')
}

// ---------------------------------------------------------------- verdict matrix

/** Devuelve el mensaje de incoherencia, o null si el veredicto respeta el matrix del spec. */
function verdictMismatch(gdr) {
  const dims = ['alineacion_con_intencion', 'contexto_externo', 'risk_envelope']
  const raw = dims.map((d) => gdr?.puntuacion?.[d])

  const invalid = dims
    .map((d, i) => ({ d, v: raw[i] }))
    .filter((x) => !Number.isInteger(x.v) || x.v < 1 || x.v > 4)
  if (invalid.length) {
    return (
      `GDR inválido: ${invalid.map((x) => `${x.d}=${JSON.stringify(x.v)}`).join(', ')} —\n` +
      `  governance-rubric.md puntúa las tres dimensiones en una escala 1-4.`
    )
  }

  const min = Math.min(...raw)
  const detail = dims.map((d, i) => `${d}=${raw[i]}`).join(' ')
  const matrix = S.states.govern_gate.gate.verdict_matrix
  const expected = min === 1 ? 'KILL' : min === 2 ? 'REDIRECT' : 'ADVANCE'
  if (expected === gdr.veredicto) return null
  return (
    `GDR incoherente: ${detail}\n` +
    `  El verdict_matrix del spec exige ${expected} para esa puntuación, pero el GDR dice ${gdr.veredicto}.\n` +
    `  ADVANCE: ${matrix.ADVANCE}\n` +
    `  REDIRECT: ${matrix.REDIRECT}\n` +
    `  KILL: ${matrix.KILL}`
  )
}

function checkVerdictMatrix(gdr) {
  const problem = verdictMismatch(gdr)
  if (problem) die(problem)
}

// ---------------------------------------------------------------- rollback monitor (sin LLM)

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'por', 'y', 'o', 'a', 'un', 'una', 'al'])
const tokensOf = (s) => norm(s).split('_').filter((t) => t && !STOPWORDS.has(t))

/**
 * "tasa de error" (el Risk Envelope) y "tasa_error" (la telemetría) son la misma métrica.
 * Un match por substring no alcanza: se comparan conjuntos de tokens.
 */
function nameMatch(a, b) {
  const ta = tokensOf(a)
  const tb = tokensOf(b)
  if (!ta.length || !tb.length) return false
  const setB = new Set(tb)
  const inter = ta.filter((t) => setB.has(t)).length
  if (!inter) return false
  const smaller = Math.min(ta.length, tb.length)
  return inter === smaller || inter / smaller >= 0.5
}

function numFrom(v) {
  if (typeof v === 'number') return v
  const m = String(v).match(/-?\d+(?:[.,]\d+)?/)
  return m ? Number(m[0].replace(',', '.')) : null
}

function candidates(telemetry) {
  const list = []
  for (const [k, v] of Object.entries(telemetry.senal_tecnica ?? {})) {
    list.push({ name: k, value: numFrom(v) })
  }
  for (const s of telemetry.senal_negocio ?? []) {
    list.push({ name: s.metrica, value: numFrom(s.valor_actual) })
  }
  return list
}

/**
 * Aritmética pura, sin LLM: un monitor de rollback que depende de un LLM puede
 * alucinar que todo está bien.
 */
function evaluateRollback(bet, telemetry) {
  const triggers = bet.risk_envelope?.triggers_rollback ?? []
  const cands = candidates(telemetry)
  const fired = []
  const near = []
  const unevaluable = []

  for (const t of triggers) {
    const match = cands.find((c) => nameMatch(c.name, t.metrica))
    if (!match || match.value == null) {
      unevaluable.push({ trigger: t, reason: match ? 'valor no numérico' : 'métrica no reportada' })
      continue
    }
    const { value } = match
    const crossed =
      (t.comparador === '>' && value > t.umbral) ||
      (t.comparador === '>=' && value >= t.umbral) ||
      (t.comparador === '<' && value < t.umbral) ||
      (t.comparador === '<=' && value <= t.umbral) ||
      (t.comparador === '==' && value === t.umbral)

    const distance = t.umbral === 0 ? 1 : Math.abs(value - t.umbral) / Math.abs(t.umbral)
    if (crossed) fired.push({ trigger: t, value, metric: match.name })
    else if (distance <= 0.2) near.push({ trigger: t, value, metric: match.name, distance })
  }
  return { fired, near, unevaluable }
}

async function applyRollbackMonitor(j, bet, telemetry, source) {
  const { fired, near, unevaluable } = evaluateRollback(bet, telemetry)

  if (fired.length) {
    for (const f of fired) {
      const payload = {
        bet_id: j.bet_id,
        trigger_disparado: f.trigger,
        valor_observado: f.value,
        timestamp: new Date().toISOString(),
        estado_post_reversion: 'canary revertido a 0% de exposición',
        metrica_reportada_como: f.metric,
        fuente: source,
      }
      await mkdir(RUNS, { recursive: true })
      await appendFile(ROLLBACK_LOG, JSON.stringify(payload) + '\n')
      j.history.push({
        at: payload.timestamp,
        from: j.state,
        to: j.state,
        on: 'rollback.triggered',
        note: `rollback_monitor: ${f.metric}=${f.value} ${f.trigger.comparador} ${f.trigger.umbral} (${f.trigger.ventana})`,
      })
      console.log(
        `\n${C.r('■ ROLLBACK')} ${f.metric}=${f.value} viola ${f.trigger.comparador} ${f.trigger.umbral} ` +
          `en ventana ${f.trigger.ventana} → ${C.b('reversión automática, sin gate humano')}`,
      )
    }
    console.log(
      C.dim(
        `\n  El monitor NO reintenta la promoción de etapa. Hace falta un GDR nuevo desde govern_gate.\n` +
          `  Evento en ${path.relative(REPO, ROLLBACK_LOG)}`,
      ),
    )
  }

  for (const n of near) {
    console.log(
      `\n${C.y('▲ near_threshold')} ${n.metric}=${n.value} a ${(n.distance * 100).toFixed(0)}% del umbral ` +
        `${n.trigger.comparador} ${n.trigger.umbral}. Alerta temprana, sin rollback preventivo.`,
    )
    j.history.push({
      at: new Date().toISOString(),
      from: j.state,
      to: j.state,
      on: 'rollback.near_threshold',
      note: `${n.metric}=${n.value}`,
    })
  }

  for (const u of unevaluable) {
    console.log(
      `${C.y('!')} trigger de rollback ${C.b('NO EVALUABLE')}: "${u.trigger.metrica}" ` +
        `${u.trigger.comparador} ${u.trigger.umbral} — ${u.reason}. La telemetría no lo cubre.`,
    )
  }

  await saveJournal(j)
  return { fired: fired.length, near: near.length, unevaluable: unevaluable.length }
}

// ---------------------------------------------------------------- steps por estado

async function stepHypothesisDraft(j, { gdr } = {}) {
  const bet = await readBet(j.bet_id)
  const st = S.states[j.state]

  // No re-invocar al Architect si ya emitió el borrador y seguimos esperando al humano.
  if (
    j.awaiting?.artifact === 'bet_confirmation' &&
    (await exists(runPath(j.bet_id, '.bet-draft.json')))
  ) {
    return parked(j, 'bet_confirmation')
  }

  if (st.type === 'transitional' || j.state === 'redirect') {
    console.log(
      C.dim(
        `\n  Redirect es un estado de tránsito: la Bet vuelve a Hypothesis Draft con el\n` +
          `  contexto de la iteración anterior. El Architect NO toca artefactos ya generados.`,
      ),
    )
  }

  const r = await invokePhase({
    agent: phases[j.state].agent,
    promptFile: phases[j.state].prompt,
    betId: j.bet_id,
    title: `${j.state}`,
    bet,
  })

  const draft = parseJsonOrDie(
    r.text,
    phases[j.state].agent,
    runPath(j.bet_id, `.${j.state}-raw.log`),
  )
  validateOrThrow(st.output_schema, draft, `borrador de Bet Register`)
  await writeArtifact(j.bet_id, '.bet-draft.json', draft)

  const pendientes = Object.entries(draft)
    .filter(([, v]) => typeof v === 'string' && v.includes('A COMPLETAR POR EL HUMANO'))
    .map(([k]) => k)
  const missing = (st.output_schema.$ref === '#/$defs/bet_register_entry'
    ? ['owner_governor', 'deadline', 'risk_envelope']
    : []
  ).concat(pendientes)

  const entry = recordRun(j, {
    from: j.state,
    to: j.state,
    on: 'architect_draft_emitted',
    agent: phases[j.state].agent,
    model: await agentModel(phases[j.state].agent),
    result: r,
  })

  if (j.state === 'redirect') {
    await transition(j, {
      on: 'new_iteration_started',
      ctx: { bet: { ...bet, ...draft, status: bet.status } },
      agent: phases[j.state].agent,
      model: entry.model,
      result: null,
    })
    return
  }

  j.awaiting = {
    artifact: 'bet_confirmation',
    actor: draft.owner_governor ?? bet.owner_governor ?? '(humano)',
    instruction:
      `Revisá el borrador en ${path.relative(REPO, runPath(j.bet_id, '.bet-draft.json'))}, ` +
      `volcá los campos que faltan (${[...new Set(missing)].join(', ')}) y poné status: active ` +
      `en ${path.relative(REPO, betFilePath(j.bet_id))}. Después: adlc resume ${j.bet_id}`,
  }
  await saveJournal(j)
  console.log(
    C.dim(
      `\n  La Bet es un borrador y no puede pasar a Generate.\n` +
        `  Regla del spec: ${S.global_rules.human_gate_policy.slice(0, 150)}...`,
    ),
  )
  parked(j, 'bet_confirmation')
}

async function stepParallelGenVal(j) {
  const cfg = phases.parallel_gen_val
  const bet = await readBet(j.bet_id)
  const st = S.states.parallel_gen_val
  const branch = (id) => st.concurrency.branches.find((b) => b.id === id)

  await touchFeedback(j.bet_id)
  const maxRounds = cfg.max_feedback_rounds ?? 1

  // Guarda de re-entrada: si una corrida anterior ya dejo los dos artefactos validos en
  // disco, no volvemos a invocar a los agentes. Son gratis pero lentos e intermitentes, y
  // `resume` tiene que poder avanzar sobre el trabajo ya hecho.
  const artefactoValido = async (suffix, schemaNode) => {
    try {
      const v = JSON.parse(await readFile(runPath(j.bet_id, suffix), 'utf8'))
      return validatorFor(schemaNode)(v) ? v : null
    } catch {
      return null
    }
  }
  const previoManifest = await artefactoValido('.manifest.json', branch('generate').schema)
  const previoReporte = await artefactoValido('.validation.json', branch('validate').schema)
  const yaListo = previoManifest != null && previoReporte != null
  if (yaListo) {
    ok('los dos artefactos ya están en disco y validan: se reusan y no se invoca a los agentes')
    j.artifacts.generation_manifest = path.relative(REPO, runPath(j.bet_id, '.manifest.json'))
    j.artifacts.validation_report = path.relative(REPO, runPath(j.bet_id, '.validation.json'))
  }

  for (let round = 1; round <= maxRounds && !yaListo; round++) {
    j.round = round
    const roundTag = round === 1 ? '' : ` (ronda ${round}: consumiendo feedback)`
    console.log(
      `\n${C.b(`parallel_gen_val`)} ${C.dim(`ronda ${round}/${maxRounds} — dos ramas concurrentes${roundTag}`)}`,
    )

    const settled = await Promise.allSettled([
      invokePhase({
        agent: cfg.branches.generate.agent,
        promptFile: cfg.branches.generate.prompt,
        betId: j.bet_id,
        title: `generate-r${round}`,
        bet,
      }),
      invokePhase({
        agent: cfg.branches.validate.agent,
        promptFile: cfg.branches.validate.prompt,
        betId: j.bet_id,
        title: `validate-r${round}`,
        bet,
      }),
    ])

    // Las dos ramas son independientes: si una falla, la otra NO se descarta.
    // Primero se persiste lo que sí llegó; recién después se reporta lo que falló.
    const vacio = { text: '', cost: 0, tokens: null, sessionID: null, seconds: 0 }
    const gen = settled[0].status === 'fulfilled' ? settled[0].value : vacio
    const val = settled[1].status === 'fulfilled' ? settled[1].value : vacio
    const fallas = []
    const ramas = [
      ['generate', settled[0], cfg.branches.generate, 'generation_manifest', '.manifest.json'],
      ['validate', settled[1], cfg.branches.validate, 'validation_report', '.validation.json'],
    ]

    for (const [id, res, _cfgBranch, schemaName, file] of ramas) {
      if (res.status === 'rejected') {
        fallas.push(`${id}: la invocación falló — ${res.reason?.message ?? res.reason}`)
        continue
      }
      const dump = writeRaw(res.value.text, runPath(j.bet_id, `.${id}-r${round}-raw.log`))
      const cands = extractJsonCandidates(res.value.text)
      if (!cands.length) {
        fallas.push(
          `${id}: no devolvió ningún JSON parseable (${(res.value.text ?? '').length} caracteres, crudo en ${dump})`,
        )
        continue
      }
      // El agente puede narrar, resumir y hasta auto-compactarse ANTES de emitir su JSON.
      // Probamos TODOS los objetos del texto y nos quedamos con el primero que valide.
      const valida = validatorFor(branch(id).schema)
      let parsed = null
      let detalle = ''
      for (const c of cands) {
        if (valida(c)) {
          parsed = c
          break
        }
        detalle = (valida.errors ?? [])
          .map((e) => `${e.instancePath || '/'} ${e.message}`)
          .join('; ')
      }
      if (!parsed) {
        fallas.push(
          `${id}: ninguno de los ${cands.length} JSON del texto valida contra ${schemaName} — ${detalle} (crudo en ${dump})`,
        )
        continue
      }
      await writeArtifact(j.bet_id, file, parsed)
      j.artifacts[schemaName] = path.relative(REPO, runPath(j.bet_id, file))
      ok(`${id}: ${schemaName} guardado en ${j.artifacts[schemaName]}`)
    }

    if (fallas.length) {
      await saveJournal(j)
      console.log(`\n${C.y('!')} ronda ${round}: rama(s) incompleta(s)`)
      for (const f of fallas) console.log(`  ${C.dim(f)}`)
      die(
        `la ronda ${round} quedó incompleta. Lo que sí llegó quedó en docs/adlc/harness/runs/. ` +
          `Reintentá con: node adlc.mjs resume ${j.bet_id}`,
      )
    }

    recordRun(j, {
      from: j.state,
      to: j.state,
      on: 'validator.defect_reported',
      agent: cfg.branches.generate.agent,
      model: await agentModel(cfg.branches.generate.agent),
      result: gen,
      note: `ronda ${round}: generate`,
    })
    recordRun(j, {
      from: j.state,
      to: j.state,
      on: 'generator.incremental_fix_applied',
      agent: cfg.branches.validate.agent,
      model: await agentModel(cfg.branches.validate.agent),
      result: val,
      note: `ronda ${round}: validate`,
    })

    const open = await openDefects(j.bet_id)
    if (!open.length) {
      if (round > 1) ok(`sin defectos abiertos en el feedback: el loop interno convergió`)
      break
    }
    console.log(`\n${C.y('!')} ${open.length} defecto(s) abierto(s) en el feedback:`)
    for (const d of open) console.log(`  ${C.dim(d.severity ?? '?')} ${d.target} — ${d.repro ?? ''}`)
    if (round === maxRounds) {
      console.log(
        C.dim(
          `\n  Se agotaron las rondas de feedback (max_feedback_rounds=${maxRounds}). Los defectos\n` +
            `  abiertos quedan visibles para el Validator y para el Gobernador.`,
        ),
      )
    }
  }

  // El join del spec es prosa ("... is empty or all reviewed by human, and ... is set").
  // Se implementa acá, y el `when` de la transición se sigue evaluando contra el spec.
  j.artifacts.manifest = await loadJson(runPath(j.bet_id, '.manifest.json'))
  j.artifacts.validation = await loadJson(runPath(j.bet_id, '.validation.json'))
  j.artifacts.brecha_explicita =
    j.artifacts.validation.reporte_cobertura_hipotesis.brecha_explicita

  const ctx = {
    bet,
    generation_manifest: j.artifacts.manifest,
    validation_report: j.artifacts.validation,
  }

  // El `join` del spec esta escrito en PROSA ("... is empty or all reviewed by human, and
  // ... is set (true or false, nunca ausente)"), no en el expression_language: pasarlo por
  // evalWhen revienta con razon. Se evalua en codigo, que es equivalente, y el `when` de
  // cada transicion se sigue evaluando contra el spec mas abajo.
  const joinOk =
    j.artifacts.manifest != null &&
    j.artifacts.validation != null &&
    typeof j.artifacts.brecha_explicita === 'boolean'
  if (!joinOk) info('join del spec no satisfecho todavía')

  // Salida previa del estado: sólo si hay ambigüedad explícita del generation_target.
  const escape = pickTransition('parallel_gen_val', 'generation_target_ambiguo', {
    ...ctx,
    bet: { ...bet, status: bet.status },
  })
  if (escape) {
    console.log(
      `\n${C.y('▲')} el Validator declaró brecha explícita de cobertura de hipótesis` +
        ` ${C.dim('(generation_target ambiguo)')}`,
    )
    // El redirect existe para regenerar contra el target reformulado. Si dejaramos los
    // artefactos en su lugar, la guarda de re-entrada los reusaria, el `when` del escape
    // (`brecha_explicita == true and bet.status == 'active'`) volveria a dar verdadero y
    // el driver volveria a Intent en cada resume: loop infinito. Se archivan para que la
    // superficie se regenere en el proximo ciclo.
    const archivados = []
    for (const suffix of ['.manifest.json', '.validation.json']) {
      const to = suffix.replace(/\.json$/, `.r${j.round}-redirect.json`)
      try {
        await rename(runPath(j.bet_id, suffix), runPath(j.bet_id, to))
        archivados.push(to)
      } catch {}
    }
    if (archivados.length) {
      info(`artefactos archivados para el proximo ciclo: ${archivados.join(', ')}`)
    }
    // El redirect sólo sirve si el Architect sabe POR QUÉ volvió: le dejamos el reporte de
    // cobertura del Validator, que es la evidencia de que la superficie no responde al
    // generation_target tal como está formulado.
    const cov = j.artifacts.validation?.reporte_cobertura_hipotesis ?? {}
    await writeFile(
      runPath(j.bet_id, '.redirect-context.json'),
      JSON.stringify(
        {
          motivo: 'generation_target_ambiguo',
          bet_id: j.bet_id,
          brecha_explicita: cov.brecha_explicita ?? null,
          cobertura_tecnica: cov.cobertura_tecnica ?? null,
          cobertura_hipotesis: cov.cobertura_hipotesis ?? null,
          senales_validation_debt: j.artifacts.validation?.senales_validation_debt ?? [],
          nota:
            'La superficie generada no responde al generation_target de forma coherente. ' +
            'NO re-emitas la misma Bet: reformulá la Hipótesis, el Learning Objective o el ' +
            'generation_target a la luz de esta evidencia.',
        },
        null,
        2,
      ) + '\n',
    )
    info(
      `contexto del redirect escrito en ${path.relative(REPO, runPath(j.bet_id, '.redirect-context.json'))}`,
    )
    await transition(j, {
      on: 'generation_target_ambiguo',
      ctx: { ...ctx, bet: { ...bet, status: bet.status } },
      note: 'brecha_explicita == true',
    })
    return
  }

  if (j.artifacts.manifest.decisiones_no_cubiertas?.length) {
    console.log(
      `\n${C.y('!')} ${j.artifacts.manifest.decisiones_no_cubiertas.length} decisión(es) de diseño ` +
        `no cubiertas por la Bet: revisalas antes del GDR (${C.dim('.manifest.json')}).`,
    )
  }
  for (const s of j.artifacts.validation.senales_validation_debt ?? []) {
    console.log(`${C.y('!')} señal de Validation Debt: ${C.b(s)}`)
  }

  await transition(j, {
    on: 'generation_and_validation_complete',
    ctx,
    note: 'join satisfecho',
  })
}

async function stepGovernGate(j) {
  const cfg = phases.govern_gate
  const bet = await readBet(j.bet_id)
  const st = S.states.govern_gate

  if (!j.artifacts.manifest || !j.artifacts.validation) {
    die(`govern_gate requiere generation_manifest y validation_report. Faltan artefactos.`)
  }

  // El paquete es determinístico sobre los mismos dos artefactos: no se re-empaqueta.
  if (await exists(runPath(j.bet_id, '.govern-package.md'))) {
    j.awaiting ??= {
      artifact: 'gdr',
      actor: bet.owner_governor,
      instruction: `Corré ${C.b(`node adlc.mjs gdr ${j.bet_id}`)} y guardá el GDR en ${path.relative(REPO, GDR(j.bet_id))}.`,
    }
    await saveJournal(j)
    console.log(
      `\n  Paquete de decisión: ${path.relative(REPO, runPath(j.bet_id, '.govern-package.md'))}`,
    )
    return parked(j, 'gdr')
  }

  const r = await invokePhase({
    agent: cfg.agent,
    promptFile: cfg.prompt,
    betId: j.bet_id,
    title: 'govern-package',
    bet,
  })
  await writeFile(runPath(j.bet_id, '.govern-package.md'), r.text.trim() + '\n')
  recordRun(j, {
    from: j.state,
    to: j.state,
    on: 'govern_package_assembled',
    agent: cfg.agent,
    model: await agentModel(cfg.agent),
    result: r,
  })

  const scores = st.gate.verdict_schema.$ref
    ? S.$defs.gdr.properties.puntuacion.properties
    : null
  j.awaiting = {
    artifact: 'gdr',
    actor: bet.owner_governor,
    instruction:
      `Corré ${C.b(`node adlc.mjs gdr ${j.bet_id}`)} para la plantilla, completá las tres\n` +
      `  dimensiones y el veredicto, y guardalo en ${path.relative(REPO, GDR(j.bet_id))}.\n` +
      `  Después: ${C.b(`node adlc.mjs resume ${j.bet_id}`)}`,
  }
  await saveJournal(j)

  console.log(`\n${C.b('═══ GATE HUMANO BLOQUEANTE ═══')}`)
  console.log(`  Paquete de decisión: ${path.relative(REPO, runPath(j.bet_id, '.govern-package.md'))}`)
  console.log(`  Gobernador: ${C.b(bet.owner_governor)}`)
  console.log(`\n  ${j.awaiting.instruction}`)
  console.log(
    C.dim(
      `\n  Dimensiones a puntuar 1-4 (el driver valida la coherencia, no la opinión):\n` +
        Object.entries(scores ?? {})
          .map(([k]) => `    - ${k}`)
          .join('\n') +
        `\n\n  Ningún agente puede emitir el GDR: los 5 agentes ADLC tienen edit denegado sobre\n` +
        `  ${path.relative(REPO, RUNS)}/**.`,
    ),
  )
  process.exit(0)
}

async function stepCanaryDeploy(j) {
  const cfg = phases.canary_deploy
  const bet = await readBet(j.bet_id)
  const st = S.states.canary_deploy

  const gdr = await loadJson(GDR(j.bet_id))
  const r = await invokePhase({
    agent: cfg.agent,
    promptFile: cfg.prompt,
    betId: j.bet_id,
    title: 'canary-deploy',
    bet,
  })
  const out = parseJsonOrDie(r.text, cfg.agent, runPath(j.bet_id, '.canary-deploy-raw.log'))
  validateOrThrow(st.output_schema, out, 'output de canary_deploy')
  await writeArtifact(j.bet_id, '.deploy.json', out)

  const model = await agentModel(cfg.agent)
  recordRun(j, {
    from: j.state,
    to: j.state,
    on: 'canary_stage_recorded',
    agent: cfg.agent,
    model,
    result: r,
    note: `etapa_actual=${out.etapa_actual}`,
  })

  await transition(j, {
    on: 'traffic_exposed',
    ctx: { bet, gdr, ...out },
    agent: cfg.agent,
    model,
    note: `etapa_actual=${out.etapa_actual}`,
  })
}

async function stepContinuousObserve(j, { inputFile } = {}) {
  const cfg = phases.continuous_observe
  const bet = await readBet(j.bet_id)
  const st = S.states.continuous_observe
  let telemetry

  if (inputFile) {
    telemetry = await loadJson(path.resolve(inputFile))
    info(`telemetría importada de ${inputFile}`)
  } else {
    const r = await invokePhase({
      agent: cfg.agent,
      promptFile: cfg.prompt,
      betId: j.bet_id,
      title: 'observe',
      bet,
    })
    telemetry = parseJsonOrDie(r.text, cfg.agent, runPath(j.bet_id, '.observe-raw.log'))
    recordRun(j, {
      from: j.state,
      to: j.state,
      on: 'telemetry_reported',
      agent: cfg.agent,
      model: await agentModel(cfg.agent),
      result: r,
    })
  }

  validateOrThrow(st.output_schema, telemetry, 'telemetry_report')
  await mkdir(RUNS, { recursive: true })
  await appendFile(
    runPath(j.bet_id, '.telemetry.jsonl'),
    JSON.stringify(telemetry) + '\n',
  )
  info(`telemetría acumulada en ${path.relative(REPO, runPath(j.bet_id, '.telemetry.jsonl'))}`)

  console.log(
    `\n  señal técnica ${C.dim(JSON.stringify(telemetry.senal_tecnica ?? {}))}` +
      `\n  señal de negocio ${C.dim(
        (telemetry.senal_negocio ?? []).map((s) => `${s.metrica}=${s.valor_actual}`).join(', ') || '(vacía)',
      )}` +
      `\n  muestras acumuladas ${C.b(telemetry.muestras_acumuladas)}`,
  )
  if (!telemetry.senal_negocio?.length) {
    console.log(
      `\n${C.y('!')} no hay señal de negocio. El spec es explícito: la señal técnica no alcanza\n` +
        `  para resolver la Bet. Con sólo esto, la Bet no puede pasar a resolved.`,
    )
  }
  await applyRollbackMonitor(j, bet, telemetry, inputFile ?? `agente ${cfg.agent}`)

  // La decisión de Observe también es del owner_governor.
  if (!(await exists(OBSERVE(j.bet_id)))) {
    j.awaiting = {
      artifact: 'observe_decision',
      actor: bet.owner_governor,
      instruction:
        `Escribí la decisión de Observe en ${path.relative(REPO, OBSERVE(j.bet_id))} con\n` +
        `  {bet_id, decidido_por, fecha, decision: "resolved"|"redirect", resultado?:\n` +
        `  "confirmada"|"refutada", justificacion, hipotesis_nuevas_propuestas[]}.\n` +
        `  Después: ${C.b(`node adlc.mjs resume ${j.bet_id}`)}`,
    }
    await saveJournal(j)
    console.log(`\n${C.b('GATE HUMANO')} — ${j.awaiting.instruction}`)
    console.log(
      C.dim(
        `\n  Deadline de la Bet: ${bet.deadline}. Si la señal es insuficiente en esa fecha, la\n` +
          `  decisión válida es redirect o kill — el spec no permite extender sin una Bet nueva.`,
      ),
    )
    process.exit(0)
  }

  const decision = await loadJson(OBSERVE(j.bet_id))
  validateOrThrow(S.$defs.observe_decision, decision, 'observe_decision')
  if (decision.decidido_por !== bet.owner_governor) {
    die(
      `observe_decision.decidido_por ("${decision.decidido_por}") no coincide con\n` +
        `  bet.owner_governor ("${bet.owner_governor}"). Sólo el Gobernador decide.`,
    )
  }
  const ctx = { bet, observe_decision: decision, telemetry }
  const t = await transition(j, { on: 'observe_decision_recorded', ctx })

  if (t.to === 'resolved') {
    if (!decision.resultado) {
      die(
        `para cerrar como resolved hace falta el campo "resultado": "confirmada" | "refutada"\n` +
          `  en ${path.relative(REPO, OBSERVE(j.bet_id))}`,
      )
    }
    const out = {
      bet_id: j.bet_id,
      resultado: decision.resultado,
      hipotesis_nuevas_para_intent: decision.hipotesis_nuevas_propuestas ?? [],
    }
    validateOrThrow(S.states.resolved.output_schema, out, 'cierre de resolved')
    await writeArtifact(j.bet_id, '.resolved.json', out)
    console.log(`\n${C.g('BET RESUELTA')} resultado: ${C.b(out.resultado)}`)
    if (out.hipotesis_nuevas_para_intent.length) {
      console.log(`\n  Hipótesis nuevas para el próximo ciclo de Intent:`)
      for (const h of out.hipotesis_nuevas_para_intent) console.log(`    - ${h}`)
    }
  }
}

async function stepTerminal(j) {
  const st = S.states[j.state]
  console.log(`\n${C.b(`BET ${j.state.toUpperCase()}`)} ${C.dim(st.description.slice(0, 200))}`)
  const gdr = (await exists(GDR(j.bet_id))) ? await loadJson(GDR(j.bet_id)) : null
  if (j.state === 'killed' && gdr) {
    const out = {
      bet_id: j.bet_id,
      aprendizaje_archivado: gdr.razonamiento,
      gdr_ref: gdr.gdr_id,
    }
    validateOrThrow(S.states.killed.output_schema, out, 'cierre de killed')
    await writeArtifact(j.bet_id, '.killed.json', out)
    console.log(
      `\n${C.dim('KILL es una decisión de gobernanza, no un fallo del equipo de generación.')}`,
    )
  }
  await saveJournal(j)
}

// ---------------------------------------------------------------- dispatch

async function advance(j, { inputFile } = {}) {
  for (let i = 0; i < 12; i++) {
    const st = S.states[j.state]
    if (!st) die(`el estado "${j.state}" del journal no existe en el spec`)
    if (st.type === 'terminal') return stepTerminal(j)

    if (j.state === 'hypothesis_draft') return stepHypothesisDraft(j)
    if (j.state === 'redirect') return stepHypothesisDraft(j)
    if (j.state === 'parallel_gen_val') await stepParallelGenVal(j)
    else if (j.state === 'govern_gate') return stepGovernGate(j)
    else if (j.state === 'canary_deploy') await stepCanaryDeploy(j)
    else if (j.state === 'continuous_observe') return stepContinuousObserve(j, { inputFile })
    else die(`sin handler para el estado "${j.state}"`)
  }
  die('el loop no llegó a un punto de pausa en 12 pasos. Posible ciclo en el spec.')
}

async function cmdStart(betId) {
  let j = await loadJournal(betId)
  if (!j) {
    const bet = await readBet(betId)
    j = await newJournal(betId)
    ok(`journal creado: ${path.relative(REPO, JOURNAL(betId))}`)
    info(`Bet ${betId} · status ${bet.status} · owner ${bet.owner_governor}`)
  } else {
    info(`retomando desde ${C.b(j.state)} (desde ${j.since})`)
  }
  await advance(j)
}

async function cmdResume(betId) {
  const j = await loadJournal(betId)
  if (!j) die(`no hay journal para ${betId}. Corré primero: node adlc.mjs start ${betId}`)

  if (j.state === 'hypothesis_draft' || j.state === 'redirect') {
    const bet = await readBet(betId)
    const pending = (j.awaiting?.instruction && j.awaiting.artifact === 'bet_confirmation')
    if (bet.status !== 'active') {
      die(
        `la Bet sigue en status "${bet.status}" y el spec exige 'active' para entrar a\n` +
          `  parallel_gen_val (when: bet.status == 'active').\n\n` +
          (pending ? `  ${j.awaiting.instruction}\n` : ''),
      )
    }
    const ctx = { bet }
    await transition(j, {
      on: 'bet_confirmed_by_human',
      ctx,
      agent: null,
      model: null,
      result: null,
      note: 'confirmación humana: status active',
    })
    await advance(j)
    return
  }

  if (j.state === 'govern_gate') {
    const gdr = await checkGdrReady(betId)
    const bet = await readBet(betId)
    const ctx = { bet, gdr, generation_manifest: j.artifacts.manifest, validation_report: j.artifacts.validation }
    await transition(j, { on: 'gdr_issued', ctx, agent: null, model: null, result: null, note: `gdr ${gdr.gdr_id}` })
    await advance(j)
    return
  }

  if (j.state === 'continuous_observe') {
    const bet = await readBet(betId)
    if (!(await exists(OBSERVE(betId)))) {
      die(`falta ${path.relative(REPO, OBSERVE(betId))}.\n  ${j.awaiting?.instruction ?? ''}`)
    }
    const decision = await loadJson(OBSERVE(betId))
    validateOrThrow(S.$defs.observe_decision, decision, 'observe_decision')
    if (decision.decidido_por !== bet.owner_governor) {
      die(`observe_decision.decidido_por no coincide con bet.owner_governor (${bet.owner_governor})`)
    }
    const ctx = { bet, observe_decision: decision }
    const t = await transition(j, {
      on: 'observe_decision_recorded',
      ctx,
      agent: null,
      model: null,
      result: null,
    })
    if (t.to === 'resolved') {
      if (!decision.resultado) die(`falta "resultado": "confirmada" | "refutada" en observe_decision`)
      const out = {
        bet_id: betId,
        resultado: decision.resultado,
        hipotesis_nuevas_para_intent: decision.hipotesis_nuevas_propuestas ?? [],
      }
      validateOrThrow(S.states.resolved.output_schema, out, 'cierre de resolved')
      await writeArtifact(betId, '.resolved.json', out)
    }
    return
  }

  info(`el estado ${C.b(j.state)} no tiene un paso humano pendiente: continuando`)
  await advance(j)
}

/** El driver SE NIEGA a salir de govern_gate sin un GDR válido y coherente. */
async function checkGdrReady(betId) {
  const p = GDR(betId)
  const bet = await readBet(betId)
  if (!(await exists(p))) {
    die(
      `GATE HUMANO BLOQUEANTE: falta el GDR ${path.relative(REPO, p)}.\n\n` +
        `  ${j_instruction(betId)}\n\n` +
        `  Ningún agente puede emitirlo: ${S.global_rules.human_gate_policy}`,
    )
  }
  let gdr
  try {
    gdr = await loadJson(p)
  } catch (e) {
    die(`el GDR no es JSON válido: ${e.message}`)
  }
  validateOrThrow(S.states.govern_gate.gate.verdict_schema, gdr, 'gdr')
  if (gdr.bet_id !== betId) die(`el GDR es de "${gdr.bet_id}", no de "${betId}"`)
  if (gdr.governor !== bet.owner_governor) {
    die(
      `el GDR lo firma "${gdr.governor}" y el owner_governor de la Bet es ` +
        `"${bet.owner_governor}".\n  Sólo el Gobernador identificado en la Bet puede emitir el veredicto.`,
    )
  }
  checkVerdictMatrix(gdr)
  ok(`GDR válido y coherente: ${gdr.gdr_id} → ${C.b(gdr.veredicto)}`)
  return gdr
}

function j_instruction(betId) {
  return `Corré: node adlc.mjs gdr ${betId}`
}

async function cmdGdr(betId) {
  const bet = await readBet(betId)
  const template = {
    gdr_id: `GDR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-001`,
    bet_id: betId,
    governor: bet.owner_governor,
    decision_date: new Date().toISOString().slice(0, 10),
    puntuacion: {
      alineacion_con_intencion: 0,
      contexto_externo: 0,
      risk_envelope: 0,
    },
    veredicto: 'ADVANCE | REDIRECT | KILL',
    razonamiento: '<por qué, con la evidencia concreta que lo sostiene>',
  }
  const p = GDR(betId)
  console.log(`\n# Plantilla de GDR para ${betId} (owner_governor: ${bet.owner_governor})`)
  console.log(`# Escribila en: ${path.relative(REPO, p)}`)
  console.log(`# Después: node adlc.mjs resume ${betId}\n`)
  console.log(JSON.stringify(template, null, 2))
  console.log(
    C.dim(
      `\n# El driver valida, en este orden:\n` +
        `#   1. que el GDR valide contra $defs.gdr;\n` +
        `#   2. que gdr.governor == bet.owner_governor;\n` +
        `#   3. que el veredicto sea coherente con la puntuación (verdict_matrix del spec);\n` +
        `#   4. que una transición de govern_gate matchee contra ese veredicto.\n` +
        `# Si algo falla, el estado no avanza.`,
    ),
  )
}

async function cmdStatus(betId) {
  if (!betId) {
    await mkdir(RUNS, { recursive: true })
    const files = (await readdir(RUNS)).filter((f) => f.endsWith('.json') && !f.includes('.gdr'))
    const started = new Set(files.map((f) => f.replace(/\.json$/, '')))
    if (!files.length) {
      const bets = await listBets()
      if (bets.length) {
        console.log(C.dim('Ninguna Bet arrancó todavía en el harness.'))
        for (const b of bets) console.log(`  ${C.b(b.id)} ${C.dim(`· ${b.status}`)}`)
        console.log(C.dim(`\n  arrancá con: node adlc.mjs start ${bets[0].id}`))
      } else {
        console.log(C.dim(`no hay ninguna Bet en ${path.relative(REPO, BET_DIR)}`))
      }
      return
    }
    console.log(C.b('Bets en el harness:'))
    for (const f of files) {
      const j = await loadJson(path.join(RUNS, f))
      console.log(
        `  ${C.b(j.bet_id)} ${C.dim('·')} ${j.state} ${C.dim(`(${j.phase})`)} ` +
          `${C.dim('·')} $${j.totals.cost_usd.toFixed(4)} ${C.dim(`· ${j.totals.runs} runs`)}`,
      )
    }
    const unstarted = (await listBets()).filter((b) => !started.has(b.id))
    if (unstarted.length) {
      console.log(C.dim('\nSin arrancar:'))
      for (const b of unstarted) console.log(`  ${C.dim(`${b.id} · ${b.status}`)}`)
    }
    return
  }

  const j = await loadJournal(betId)
  if (!j) die(`no hay journal para ${betId}. Mirá los IDs disponibles con: node adlc.mjs status`)
  const bet = await readBet(betId)
  const st = S.states[j.state]

  console.log(`\n${C.b(betId)} ${C.dim('—')} ${C.b(j.state)} ${C.dim(`(fase ${j.phase})`)}`)
  console.log(`  ${C.dim(st.description.slice(0, 220))}`)
  console.log(
    `\n  Bet Register   status ${C.b(bet.status)} ${C.dim(`(el estado exige "${j.bet_register_status}")`)}` +
      (bet.status !== j.bet_register_status ? C.y('  ← desincronizado') : ` ${C.g('✓')}`),
  )
  console.log(`  owner_governor ${bet.owner_governor}   deadline ${bet.deadline}`)
  console.log(`  en este estado desde ${j.since}${j.round ? ` (ronda de feedback ${j.round})` : ''}`)

  if (j.awaiting) {
    console.log(`\n  ${C.y('ESPERANDO')} ${C.b(j.awaiting.artifact)} de ${j.awaiting.actor}`)
    console.log(`  ${j.awaiting.instruction}`)
  }

  console.log(`\n  Agentes por fase (modelo declarado en .opencode/agents/):`)
  for (const [name, cfg] of Object.entries(phases)) {
    const list = cfg.branches
      ? Object.values(cfg.branches).map((b) => b.agent)
      : cfg.agent
        ? [cfg.agent]
        : []
    for (const a of list) {
      console.log(`    ${name.padEnd(20)} ${C.c(a.padEnd(26))} ${C.dim(await agentModel(a))}`)
    }
  }

  const art = (suffix) => path.relative(REPO, runPath(betId, suffix))
  console.log(`\n  Artefactos:`)
  for (const [label, suffix] of [
    ['generation_manifest', '.manifest.json'],
    ['validation_report', '.validation.json'],
    ['feedback', '.feedback.jsonl'],
    ['govern_package', '.govern-package.md'],
    ['gdr (humano)', '.gdr.json'],
    ['deploy', '.deploy.json'],
    ['telemetry', '.telemetry.jsonl'],
    ['observe_decision (humano)', '.observe.json'],
  ]) {
    const present = await exists(runPath(betId, suffix))
    console.log(`    ${present ? C.g('✓') : C.dim('·')} ${label.padEnd(26)} ${C.dim(art(suffix))}`)
  }

  console.log(
    `\n  Costo acumulado ${C.b(`$${j.totals.cost_usd.toFixed(4)}`)} en ${j.totals.runs} invocaciones ` +
      `${C.dim(`(${j.totals.tokens.input}→${j.totals.tokens.output} tok)`)}`,
  )
  if (j.history.length) {
    console.log(`\n  Últimas transiciones (${j.history.length} en total):`)
    for (const h of j.history.slice(-6)) {
      console.log(
        `    ${C.dim(h.at)} ${h.from} → ${h.to} ${C.dim(`on ${h.on}`)}` +
          (h.cost_usd ? C.dim(` $${h.cost_usd.toFixed(4)}`) : ''),
      )
    }
  }
  console.log()
}

async function cmdLog(betId) {
  const j = await loadJournal(betId)
  if (!j) die(`no hay journal para ${betId}. Mirá los IDs disponibles con: node adlc.mjs status`)
  console.log(`\n${C.b(betId)} — ${j.history.length} transiciones\n`)
  for (const h of j.history) {
    console.log(
      `${C.dim(h.at)}  ${h.from.padEnd(20)} → ${h.to.padEnd(20)} ` +
        `${C.dim(`on ${h.on}`)}${h.agent ? ` ${C.c(h.agent)}` : ''}` +
        `${h.cost_usd ? C.dim(`  $${h.cost_usd.toFixed(4)}`) : ''}`,
    )
    if (h.note) console.log(`${' '.repeat(24)}${C.dim(h.note)}`)
  }
  console.log(
    `\n  costo total ${C.b(`$${j.totals.cost_usd.toFixed(4)}`)} · ${j.totals.runs} invocaciones`,
  )
  console.log()
}

async function cmdObserve(betId, flags) {
  const j = await loadJournal(betId)
  if (!j) die(`no hay journal para ${betId}. Mirá los IDs disponibles con: node adlc.mjs status`)
  if (j.state !== 'continuous_observe' && j.state !== 'canary_deploy') {
    if (j.state === 'resolved' || j.state === 'killed') {
      die(`la Bet ya está en un estado terminal (${j.state}). No se observa más.`)
    }
    info(`el estado actual es ${C.b(j.state)}; Observe corre en calibrating (canary_deploy / continuous_observe)`)
  }
  const inputFile = flags.input
  await stepContinuousObserve(j, { inputFile })
}

// ---------------------------------------------------------------- verify-runs (sin LLM)

/**
 * Mapa `tipo de artefacto → nodo de schema del spec`, derivado de la convención de nombres
 * real de runs/: `<BET-ID>.<tipo>[.<ronda>].json`. El `tipo` es el primer segmento después
 * del ID (por eso `.manifest.r0-redirect.json` sigue siendo un generation_manifest).
 *
 * Si un artefacto no está en este mapa, NO se lo da por validado ni se lo omite: se reporta
 * como JSON parseable sin schema conocido. Es la misma regla de honestidad del monitor de
 * rollback, que dice NO EVALUABLE en vez de inventar un valor.
 */
function artifactSchema(kind) {
  const branches = S.states.parallel_gen_val.concurrency.branches
  const branchSchema = (id) => branches.find((b) => b.id === id).schema
  switch (kind) {
    case 'bet-draft':
      return { label: 'borrador de Bet Register', node: S.states.hypothesis_draft.output_schema }
    case 'manifest':
      return { label: 'generation_manifest', node: branchSchema('generate') }
    case 'validation':
      return { label: 'validation_report', node: branchSchema('validate') }
    case 'gdr':
      return { label: 'gdr', node: S.states.govern_gate.gate.verdict_schema }
    case 'deploy':
      return { label: 'output de canary_deploy', node: S.states.canary_deploy.output_schema }
    case 'observe':
      return { label: 'observe_decision', node: S.$defs.observe_decision }
    case 'resolved':
      return { label: 'cierre de resolved', node: S.states.resolved.output_schema }
    case 'killed':
      return { label: 'cierre de killed', node: S.states.killed.output_schema }
    default:
      return null
  }
}

/** Extrae el `tipo` de `<BET-ID>.<tipo>[.<ronda>].json`; null si no sigue la convención. */
function artifactKind(file) {
  const m = /^BET-\d{4}-\d{3}\.([^.]+)/.exec(file.replace(/\.json$/, ''))
  return m ? m[1] : null
}

/**
 * Notaría de `runs/`, sólo lectura: no invoca modelos, no toca la red y no modifica ningún
 * artefacto. Existe para que CI falle cuando un artefacto commiteado quedó corrupto. `runs/`
 * es estado versionado, así que un JSON roto ahí es una mentira commiteada, no un detalle
 * cosmético. (Sí puede crear el directorio `runs/` si no existe, como cualquier comando del
 * driver: el dispatch lo hace antes de llegar acá.)
 */
async function cmdVerifyRuns() {
  await mkdir(RUNS, { recursive: true })
  const files = (await readdir(RUNS, { withFileTypes: true }))
    .filter((e) => e.isFile() && /\.(json|jsonl)$/.test(e.name))
    .map((e) => e.name)
    .sort()

  console.log(
    `\n${C.b('verify-runs')} ${C.dim(`— notaría de ${path.relative(REPO, RUNS)}/ (sin LLM, no modifica artefactos)`)}\n`,
  )

  let checked = 0
  let validated = 0
  let sinSchema = 0
  const corruptos = []

  for (const file of files) {
    const p = path.join(RUNS, file)
    const rel = path.relative(REPO, p)
    checked++

    if (file.endsWith('.jsonl')) {
      // JSONL: cada línea no vacía tiene que parsear por sí sola. Se reporta el número de
      // línea: sin eso, un JSONL de miles de líneas es indepurable.
      const lines = (await readFile(p, 'utf8')).split('\n')
      // El total se cuenta ANTES de escanear: si se contara dentro del loop, cortaría en la
      // primera línea mala y reportaría un archivo más corto de lo que es.
      const total = lines.filter((l) => l.trim()).length
      let bad = null
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        try {
          JSON.parse(line)
        } catch (e) {
          bad = { line: i + 1, msg: e.message }
          break
        }
      }
      if (bad) {
        corruptos.push(`${rel}: línea ${bad.line} no es JSON válido — ${bad.msg}`)
        console.log(`  ${C.r('✗')} ${rel} ${C.dim(`(${total} líneas JSONL, malformada la ${bad.line})`)}`)
      } else {
        sinSchema++
        console.log(`  ${C.y('·')} ${rel} ${C.dim(`JSONL parseable (${total} líneas), sin schema de línea conocido — chequeado, no validado`)}`)
      }
      continue
    }

    // JSON: primero parsea, después (si el driver conoce el schema) valida.
    let data
    try {
      data = JSON.parse(await readFile(p, 'utf8'))
    } catch (e) {
      corruptos.push(`${rel}: JSON inválido — ${e.message}`)
      console.log(`  ${C.r('✗')} ${rel} ${C.dim(`(no parsea: ${e.message})`)}`)
      continue
    }

    const kind = artifactKind(file)
    const known = kind ? artifactSchema(kind) : null
    if (!known) {
      sinSchema++
      console.log(`  ${C.y('·')} ${rel} ${C.dim('JSON parseable, sin schema conocido — chequeado, no validado')}`)
      continue
    }

    const v = validatorFor(known.node)
    if (v(data)) {
      validated++
      console.log(`  ${C.g('✓')} ${rel} ${C.dim(`valida contra ${known.label}`)}`)
    } else {
      const detalle = (v.errors ?? [])
        .map((e) => `${e.instancePath || '/'} ${e.message}`)
        .slice(0, 3)
        .join('; ')
      corruptos.push(`${rel}: no valida contra ${known.label} — ${detalle}`)
      console.log(`  ${C.r('✗')} ${rel} ${C.dim(`no valida contra ${known.label}: ${detalle}`)}`)
    }
  }

  console.log(
    `\n  ${C.b(checked)} artefacto(s) chequeado(s) · ${C.g(validated)} validado(s) · ` +
      `${C.y(sinSchema)} sin schema conocido · ` +
      `${corruptos.length ? C.r(`${corruptos.length} corrupto(s)`) : C.g('0 corrupto(s)')}`,
  )

  if (corruptos.length) {
    die(
      `${corruptos.length} artefacto(s) corrupto(s) en ${path.relative(REPO, RUNS)}/:\n` +
        corruptos.map((c) => `  - ${c}`).join('\n') +
        `\n\n  Un artefacto corrupto commiteado hace que el journal mienta sobre lo que pasó.\n` +
        `  Arreglá el archivo a mano, o regenerá el artefacto con: node adlc.mjs resume <BET-ID>`,
    )
  }
  const relRuns = `${path.relative(REPO, RUNS)}/`
  ok(
    sinSchema
      ? `ningún artefacto corrupto en ${relRuns} (${validated} validado(s) contra schema · ${sinSchema} sólo chequeado(s) por parseo)`
      : `todos los artefactos de ${relRuns} están sanos: validados contra schema`,
  )
}

// ---------------------------------------------------------------- selftest

async function cmdSelftest() {
  let pass = 0
  const fails = []
  const check = async (name, fn) => {
    try {
      await fn()
      pass++
      console.log(`  ${C.g('✓')} ${name}`)
    } catch (e) {
      fails.push({ name, msg: e.message })
      console.log(`  ${C.r('✗')} ${name}\n      ${C.dim(e.message)}`)
    }
  }
  const eq = (a, b, what) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(`${what}: esperaba ${JSON.stringify(b)}, obtuve ${JSON.stringify(a)}`)
    }
  }

  console.log(`\n${C.b('selftest')} ${C.dim('— nada de esto invoca un modelo')}\n`)

  await check('expression_language: acceso por ruta + ==', () =>
    eq(evalWhen("bet.status == 'active'", { bet: { status: 'active' } }), true, 'status'),
  )
  await check('expression_language: != null sobre artefactos', () =>
    eq(
      evalWhen('generation_manifest != null and validation_report != null', {
        generation_manifest: {},
        validation_report: {},
      }),
      true,
      'artefactos',
    ),
  )
  await check('expression_language: in sobre lista literal', () => {
    eq(evalWhen("gdr.veredicto in ['REDIRECT', 'KILL']", { gdr: { veredicto: 'REDIRECT' } }), true, 'in')
    eq(evalWhen("gdr.veredicto in ['REDIRECT', 'KILL']", { gdr: { veredicto: 'ADVANCE' } }), false, 'in')
  })
  await check('expression_language: not + >=', () =>
    eq(evalWhen('not (etapa_actual >= 1)', { etapa_actual: 1 }), false, 'not'),
  )
  await check('expression_language: ruta profunda', () =>
    eq(
      evalWhen('validation_report.reporte_cobertura_hipotesis.brecha_explicita == true', {
        validation_report: { reporte_cobertura_hipotesis: { brecha_explicita: true } },
      }),
      true,
      'profunda',
    ),
  )

  await check('TODOS los when del spec son evaluables (salvo el join, que es prosa)', () => {
    for (const [stateName, st] of Object.entries(S.states)) {
      for (const t of st.transitions ?? []) {
        evalWhen(t.when, {})
      }
    }
  })
  await check('el join del spec SÍ es prosa, como está documentado', () => {
    let threw = false
    try {
      evalWhen(S.states.parallel_gen_val.concurrency.join.condition, {})
    } catch {
      threw = true
    }
    if (!threw) throw new Error('el join se evaluó como expresión, revisá el spec')
  })
  await check('una expresión rota falla ruidosamente, no en silencio', () => {
    let threw = false
    try {
      evalWhen('bet.status ==', { bet: { status: 'active' } })
    } catch {
      threw = true
    }
    if (!threw) throw new Error('esperaba un error de parseo')
  })

  const gdr = (a, b, c, verdict) => ({
    gdr_id: 'GDR-TEST',
    bet_id: 'BET-2026-001',
    governor: 'Test',
    decision_date: '2026-09-16',
    puntuacion: { alineacion_con_intencion: a, contexto_externo: b, risk_envelope: c },
    veredicto: verdict,
    razonamiento: 'test',
  })
  await check('verdict_matrix: 3/3/4 → ADVANCE es coherente', () =>
    eq(verdictMismatch(gdr(3, 3, 4, 'ADVANCE')), null, 'advance ok'),
  )
  await check('verdict_matrix: 2/3/3 → ADVANCE es incoherente', () => {
    if (!verdictMismatch(gdr(2, 3, 3, 'ADVANCE'))) throw new Error('debió rechazarse')
  })
  await check('verdict_matrix: 2/3/3 → REDIRECT es coherente', () =>
    eq(verdictMismatch(gdr(2, 3, 3, 'REDIRECT')), null, 'redirect ok'),
  )
  await check('verdict_matrix: 1/4/4 → KILL es coherente', () =>
    eq(verdictMismatch(gdr(1, 4, 4, 'KILL')), null, 'kill ok'),
  )
  await check('verdict_matrix: 1/4/4 → ADVANCE es incoherente', () => {
    if (!verdictMismatch(gdr(1, 4, 4, 'ADVANCE'))) throw new Error('debió rechazarse')
  })
  await check('verdict_matrix: una dimensión en 0 no puede colarse como ADVANCE', () => {
    if (!verdictMismatch(gdr(0, 4, 4, 'ADVANCE'))) throw new Error('debió rechazarse')
  })

  await check('schema $defs.gdr acepta un GDR completo', () => {
    const v = validatorFor({ $ref: '#/$defs/gdr' })
    if (!v(gdr(3, 3, 4, 'ADVANCE'))) throw new Error(JSON.stringify(v.errors))
  })
  await check('schema $defs.gdr rechaza un GDR sin razonamiento', () => {
    const v = validatorFor({ $ref: '#/$defs/gdr' })
    const bad = gdr(3, 3, 4, 'ADVANCE')
    delete bad.razonamiento
    if (v(bad)) throw new Error('debió rechazarse')
  })
  await check('schema $defs.gdr rechaza puntuaciones fuera de 1-4', () => {
    const v = validatorFor({ $ref: '#/$defs/gdr' })
    if (v(gdr(5, 3, 4, 'ADVANCE'))) throw new Error('debió rechazarse')
  })
  await check('schema output_schema inline de canary_deploy compila y valida', () => {
    const v = validatorFor(S.states.canary_deploy.output_schema)
    const good = {
      bet_id: 'BET-2026-001',
      etapa_actual: 1,
      historial_etapas: [
        { etapa: 1, timestamp_inicio: '2026-09-16T10:00:00Z', estado: 'en_curso' },
      ],
    }
    if (!v(good)) throw new Error(JSON.stringify(v.errors))
    if (v({ bet_id: 'x', etapa_actual: 1 })) throw new Error('debió rechazarse sin historial')
  })
  await check('schema $defs.bet_register_entry rechaza un id con formato inválido', () => {
    const v = validatorFor({ $ref: '#/$defs/bet_register_entry' })
    const entry = {
      id: 'BET-26-1',
      status: 'draft',
      owner_governor: 'x',
      created_date: '2026-09-16',
      deadline: '2026-10-07',
      hipotesis: 'h',
      learning_objective: 'l',
      generation_target: {
        codigo_dominio: '',
        tests: '',
        documentacion: '',
        schema_migraciones: '',
        configuracion_despliegue: '',
      },
      resolution_signal: [
        { metrica: 'm', baseline: '0', umbral_exito: '4', fuente_instrumentacion: 'local' },
      ],
      risk_envelope: {
        blast_radius: '1 usuario',
        etapas_canary: [{ etapa: 1, exposicion: 'x', dwell_time_minimo: '1', condicion_de_avance: 'y' }],
        triggers_rollback: [
          { metrica: 'm', umbral: 1, comparador: '>', ventana: '1 hora', accion: 'automatic_rollback' },
        ],
      },
    }
    if (v(entry)) throw new Error('debió rechazarse el pattern del id')
  })

  const betFx = {
    risk_envelope: {
      triggers_rollback: [
        { metrica: 'tasa de error', umbral: 5, comparador: '>', ventana: '2 horas', accion: 'automatic_rollback' },
        { metrica: 'latencia p95', umbral: 800, comparador: '>', ventana: '30 min', accion: 'automatic_rollback' },
      ],
    },
  }
  await check('rollback_monitor: dispara con 8% sobre umbral de 5%', () => {
    const r = evaluateRollback(betFx, { senal_tecnica: { tasa_error: '8%' } })
    eq(r.fired.length, 1, 'fired')
    eq(r.fired[0].metric, 'tasa_error', 'metrica matcheada')
  })
  await check('rollback_monitor: NO dispara con 3% bajo umbral de 5%', () => {
    const r = evaluateRollback(betFx, { senal_tecnica: { tasa_error: '3%' } })
    eq(r.fired.length, 0, 'fired')
    eq(r.unevaluable.length, 1, 'latencia no reportada queda marcada')
  })
  await check('rollback_monitor: near_threshold dentro del 20% sin cruzar', () => {
    const r = evaluateRollback(betFx, { senal_tecnica: { tasa_error: '4.5%' } })
    eq(r.fired.length, 0, 'fired')
    eq(r.near.length, 1, 'near')
    eq(r.near[0].metric, 'tasa_error', 'metrica')
  })
  await check('rollback_monitor: matchea señal de negocio, no sólo técnica', () => {
    const bet = {
      risk_envelope: {
        triggers_rollback: [
          { metrica: 'sesiones registradas en la app', umbral: 4, comparador: '<', ventana: '1 semana', accion: 'automatic_rollback' },
        ],
      },
    }
    const r = evaluateRollback(bet, {
      senal_negocio: [{ metrica: 'Sesiones registradas en la app', valor_actual: '2' }],
    })
    eq(r.fired.length, 1, 'fired')
  })
  await check('rollback_monitor: nunca alucina, marca lo que no puede evaluar', () => {
    const r = evaluateRollback(betFx, { senal_negocio: [{ metrica: 'otra cosa', valor_actual: '1' }] })
    eq(r.fired.length, 0, 'fired')
    eq(r.unevaluable.length, 2, 'unevaluable')
  })

  await check('los 5 agentes ADLC existen y declaran un modelo', async () => {
    for (const a of [
      'adlc-architect',
      'adlc-generator',
      'adlc-validator',
      'adlc-governor-interface',
      'adlc-deploy-observe',
    ]) {
      const m = await agentModel(a)
      if (m === '?') throw new Error(`${a} no declara model: en su frontmatter`)
    }
  })
  await check('cada transición del spec apunta a un estado que existe', () => {
    for (const [stateName, st] of Object.entries(S.states)) {
      for (const t of st.transitions ?? []) {
        if (!S.states[t.to]) throw new Error(`${stateName} → ${t.to} no existe`)
      }
    }
  })
  await check('el gate es el único estado bloqueante y es human_judgment', () => {
    const gates = Object.entries(S.states).filter(([, st]) => st.type === 'gate')
    eq(gates.length, 1, 'cantidad de gates')
    eq(gates[0][0], 'govern_gate', 'cuál')
    eq(gates[0][1].gate.kind, 'human_judgment', 'kind')
    eq(gates[0][1].gate.blocking, true, 'blocking')
  })
  await check('ningún agente tiene permitido escribir en runs/', async () => {
    for (const f of await readdir(AGENT_DIR)) {
      if (!f.startsWith('adlc-')) continue
      const md = await readFile(path.join(AGENT_DIR, f), 'utf8')
      if (!/^\s*"[^"]*runs\/\*\*":\s*deny/m.test(md)) {
        throw new Error(`${f} no deniega la escritura en runs/`)
      }
    }
  })

  console.log(
    `\n  ${pass} pasaron, ${fails.length} fallaron\n` +
      (fails.length
        ? fails.map((f) => `  ${C.r('✗')} ${f.name}: ${f.msg}`).join('\n')
        : C.dim('  el driver ejecuta el spec, y no se puede convencer a sí mismo de que avanzó')),
  )
  if (fails.length) process.exit(1)
}

// ---------------------------------------------------------------- main

const [, , cmd, betIdArg, ...rest] = process.argv
const flags = {}
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1] ?? true
}

// El BET-ID se acepta desnudo o como ruta al archivo de la Bet:
// 'BET-2026-001' == 'docs/adlc/BET-2026-001.md' == '/abs/BET-2026-001.md'
const betId = betIdArg ? betIdArg.split('/').pop().replace(/\.md$/i, '') : betIdArg

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  const usage = await readFile(fileURLToPath(import.meta.url), 'utf8')
  console.log(usage.split('*/')[0].split('/**')[1].replace(/^\s*\* ?/gm, '').trim())
  process.exit(0)
}

await mkdir(RUNS, { recursive: true })

switch (cmd) {
  case 'start':
    if (!betId) die('falta el BET-ID. Ej: node adlc.mjs start BET-2026-001')
    await cmdStart(betId)
    break
  case 'resume':
    if (!betId) die('falta el BET-ID')
    await cmdResume(betId)
    break
  case 'status':
    await cmdStatus(betId)
    break
  case 'log':
    if (!betId) die('falta el BET-ID')
    await cmdLog(betId)
    break
  case 'gdr':
    if (!betId) die('falta el BET-ID')
    await cmdGdr(betId)
    break
  case 'observe':
    if (!betId) die('falta el BET-ID')
    await cmdObserve(betId, flags)
    break
  case 'verify-runs':
    await cmdVerifyRuns()
    break
  case 'selftest':
    await cmdSelftest()
    break
  default:
    die(`comando desconocido: ${cmd}. Probá: node adlc.mjs help`)
}
