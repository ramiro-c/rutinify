#!/usr/bin/env node
/**
 * Backend de referencia del sync celular ↔ desktop (BET-2026-001).
 *
 * Implementa el contrato de db/sync-protocol.md con cero dependencias:
 * solo node:http, node:fs y node:url. Pensado para el blast radius de la
 * Bet (1 usuario, 2 dispositivos): persistencia en un JSON local, sin
 * base de datos que operar. Para Postgres real, db/schema.sql documenta
 * el UPSERT LWW equivalente.
 *
 * Endpoints:
 *   GET  /sync   -> { cells, notes } (requiere Bearer si SYNC_API_TOKEN está seteado)
 *   POST /sync   -> merge LWW del cuerpo contra el estado, persiste y responde el convergido
 *   GET  /health -> { ok: true }
 *
 * Configuración por variables de entorno:
 *   SYNC_PORT       puerto de escucha (default 8787)
 *   SYNC_API_TOKEN  Bearer esperado; si está vacío el servidor arranca abierto (solo red local)
 *   SYNC_DATA_PATH  ruta del JSON de persistencia (default ./data/sync-state.json)
 *
 * Uso:
 *   node server/sync-server.mjs
 *   VITE_SYNC_URL=http://<host>:8787 VITE_API_TOKEN=<token> bun run dev
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function isValidCellEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return (
    typeof entry.exercise_id === 'string' &&
    typeof entry.week === 'number' &&
    Number.isInteger(entry.week) &&
    entry.week >= 1 &&
    entry.week <= 4 &&
    typeof entry.set_index === 'number' &&
    Number.isInteger(entry.set_index) &&
    entry.set_index >= 0 &&
    (typeof entry.weight === 'number' || entry.weight === null) &&
    (typeof entry.reps === 'number' || entry.reps === null) &&
    isIsoDate(entry.updated_at)
  );
}

export function isValidNoteEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return (
    typeof entry.exercise_id === 'string' &&
    typeof entry.week === 'number' &&
    Number.isInteger(entry.week) &&
    entry.week >= 1 &&
    entry.week <= 4 &&
    typeof entry.text === 'string' &&
    isIsoDate(entry.updated_at)
  );
}

/** Clave estable de cada clase: idéntica a la PK de db/schema.sql. */
export function cellKey(cell) {
  return `${cell.exercise_id}|${cell.week}|${cell.set_index}`;
}

export function noteKey(note) {
  return `${note.exercise_id}|${note.week}`;
}

/**
 * Merge last-write-wins: gana el registro con updated_at mayor.
 * Entradas sin forma válida se descartan sin contaminar el estado.
 * Idempotente: fusionar dos veces el mismo snapshot no cambia nada.
 */
export function mergeSnapshot(local, incoming) {
  const raw = incoming && typeof incoming === 'object' ? incoming : {};
  const remoteCells = Array.isArray(raw.cells) ? raw.cells.filter(isValidCellEntry) : [];
  const remoteNotes = Array.isArray(raw.notes) ? raw.notes.filter(isValidNoteEntry) : [];

  const cellsByKey = new Map();
  for (const cell of local.cells) cellsByKey.set(cellKey(cell), cell);
  for (const cell of remoteCells) {
    const prev = cellsByKey.get(cellKey(cell));
    if (!prev || cell.updated_at > prev.updated_at) cellsByKey.set(cellKey(cell), cell);
  }

  const notesByKey = new Map();
  for (const note of local.notes) notesByKey.set(noteKey(note), note);
  for (const note of remoteNotes) {
    const prev = notesByKey.get(noteKey(note));
    if (!prev || note.updated_at > prev.updated_at) notesByKey.set(noteKey(note), note);
  }

  return { cells: [...cellsByKey.values()], notes: [...notesByKey.values()] };
}

function emptyState() {
  return { cells: [], notes: [] };
}

function loadState(dataPath) {
  try {
    const raw = readFileSync(dataPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      cells: Array.isArray(parsed.cells) ? parsed.cells.filter(isValidCellEntry) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter(isValidNoteEntry) : [],
    };
  } catch {
    return emptyState();
  }
}

function saveState(dataPath, state) {
  mkdirSync(dirname(dataPath), { recursive: true });
  writeFileSync(dataPath, JSON.stringify(state, null, 2));
}

function readJsonBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        rejectPromise(new Error('cuerpo demasiado grande (límite 1 MB)'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolvePromise(body ? JSON.parse(body) : {});
      } catch {
        rejectPromise(new Error('cuerpo no es JSON válido'));
      }
    });
    req.on('error', rejectPromise);
  });
}

export function createSyncServer(options = {}) {
  const token = options.token ?? process.env.SYNC_API_TOKEN ?? '';
  const dataPath = resolve(
    options.dataPath ?? process.env.SYNC_DATA_PATH ?? './data/sync-state.json'
  );
  let state = loadState(dataPath);

  const server = createServer(async (req, res) => {
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (token) {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${token}`) {
        send(401, { error: 'falta o es inválido el header Authorization Bearer' });
        return;
      }
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      send(200, { ok: true });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/sync') {
      send(200, state);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/sync') {
      try {
        const incoming = await readJsonBody(req);
        state = mergeSnapshot(state, incoming);
        saveState(dataPath, state);
        send(200, state);
      } catch (err) {
        send(400, { error: err instanceof Error ? err.message : 'request inválido' });
      }
      return;
    }
    send(404, { error: 'ruta desconocida (ver db/sync-protocol.md)' });
  });

  return server;
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const port = Number(process.env.SYNC_PORT ?? 8787);
  const server = createSyncServer();
  server.listen(port, () => {
    const token = process.env.SYNC_API_TOKEN ?? '';
    // eslint-disable-next-line no-console
    console.log(
      `[sync-server] escuchando en :${port} ` +
        (token ? '(auth Bearer activa)' : '(SIN token: solo red local)') +
        ' — contrato en db/sync-protocol.md'
    );
  });
}
