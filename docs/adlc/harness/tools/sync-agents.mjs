#!/usr/bin/env node
// Genera los agentes de opencode del loop ADLC a partir de los contratos de rol.
//
// Fuente de verdad: docs/adlc/toolkit/04-MVP-Agentic-Loop/agent-roles.md
// Salida:           .opencode/agents/adlc-<slug>.md
//
// El cuerpo de cada agente es la seccion de agent-roles.md PEGADA VERBATIM: no se
// reescribe nada a mano. El frontmatter (modelo por fase, permisos) es lo unico que
// agrega este script. Editar un agente a mano es un error: se pisa en el proximo sync.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..");
const ROLES_MD = path.join(
  REPO,
  "docs/adlc/toolkit/04-MVP-Agentic-Loop/agent-roles.md",
);
const OUT_DIR = path.join(REPO, ".opencode/agents");

// Un modelo por fase, declarado en el repo y versionado con el codigo.
// Cambiar el modelo de una fase = tocar una linea de esta tabla y correr el sync.
//
// Cada rol declara DOS modelos: `model` (el que se usa por defecto) y `free` (el mismo rol
// con un modelo gratuito, para correr el loop entero sin gastar). `--free` elige el segundo.
// Volver a los modelos de verdad es correr el sync sin el flag: no se pierde nada.
//
// REGLA DURA: el Validator usa a proposito una FAMILIA DISTINTA a la del Generator: un
// validador adversarial que comparte el modelo del generador comparte tambien sus puntos
// ciegos, y termina confirmando lo que ya parece correcto en vez de intentar falsificarlo.
// Al cambiar cualquiera de los dos modelos, esta regla es lo primero que hay que revisar.
const ROLES = [
  {
    slug: "architect",
    section: 1,
    title: "ADLC Architect / Intent Enframing Agent",
    description:
      "ADLC Intent (Architect): convierte un problema difuso en una entrada de Bet Register. No decide riesgo, deadline ni owner, y no escribe codigo.",
    model: "opencode-go/glm-5.3",
    free: "opencode/big-pickle",
    temperature: 0.2,
    bash: "deny",
    rationale: "razonamiento fuerte: es el unico rol que trabaja antes de que exista codigo",
  },
  {
    slug: "generator",
    section: 2,
    title: "ADLC Generator Agent",
    description:
      "ADLC Generate: produce la superficie completa del generation_target sin placeholders, en paralelo a la validacion.",
    model: "opencode-go/muse-spark-1.3-contributor",
    free: "opencode/muse-spark-1.3-contributor-free",
    temperature: 0.1,
    bash: "allow",
    rationale:
      "el muse pago es el gemelo del unico modelo (aunque gratis) que completo la tarea real de punta a punta: 450s, 8 archivos y generation_manifest valido; ya no hay que elegir entre que complete la tarea y que sea pago",
  },
  {
    slug: "validator",
    section: 3,
    title: "ADLC Validator Agent (Adversarial & Continuous)",
    description:
      "ADLC Validate: intenta falsificar la Hipotesis y romper el codigo en paralelo a la generacion. Reporta, no corrige.",
    model: "opencode-go/deepseek-v4-pro",
    free: "opencode/big-pickle",
    temperature: 0.2,
    bash: "allow",
    rationale:
      "regla dura: el Validator debe ser de FAMILIA DISTINTA a la del Generator (muse != deepseek), para no compartir puntos ciegos; deepseek-pro es el mas capaz del set deepseek y este rol es adversarial, no mecanico",
  },
  {
    slug: "governor-interface",
    section: 4,
    title: "ADLC Human Governor Interface",
    description:
      "ADLC Govern: consolida la evidencia tecnica en un paquete de decision legible. No puntua, no sugiere veredicto.",
    model: "opencode-go/glm-5.2",
    free: "opencode/ling-3.0-flash-fin-free",
    temperature: 0.1,
    bash: "deny",
    rationale: "empaquetado y redaccion: no necesita capacidad de ejecucion",
  },
  {
    slug: "deploy-observe",
    section: 5,
    title: "ADLC Deploy & Observe Agent",
    description:
      "ADLC Deploy y Observe: orquesta el canary dentro del Risk Envelope autorizado y emite telemetria estructurada.",
    model: "opencode-go/deepseek-v4.1-flash",
    free: "opencode/nemotron-3.5-lightning-free",
    temperature: 0.1,
    bash: "allow",
    rationale: "fase mecanica y repetitiva: el modelo mas barato del set",
  },
];

// Ningun agente puede tocar el journal ni el GDR. Esto convierte la regla del spec
// ("ningun agente puede emitir un gdr valido") en una restriccion tecnica en vez de
// una instruccion de prompt que el modelo puede ignorar.
const DENY_RUNS = {
  "docs/adlc/harness/runs/*": "deny",
  "docs/adlc/harness/runs/**": "deny",
  "**/docs/adlc/harness/runs/**": "deny",
};

const FREE = process.argv.includes("--free");
const modelOf = (role) => (FREE ? role.free : role.model);

function frontmatter(role) {
  const lines = [
    "---",
    `description: ${role.description}`,
    `model: ${modelOf(role)}`,
    `temperature: ${role.temperature}`,
    "permission:",
    "  edit:",
    '    "*": allow',
    ...Object.keys(DENY_RUNS).map((p) => `    "${p}": deny`),
    `  bash: ${role.bash}`,
    "  task: deny",
    "  webfetch: deny",
    "---",
  ];
  return lines.join("\n");
}

function extractSection(text, section) {
  const lines = text.split("\n");
  const isBoundary = (line) => /^## (\d+\.|Cómo se encadenan)/.test(line);

  const start = lines.findIndex((l) => l.startsWith(`## ${section}. `));
  if (start === -1) throw new Error(`No encontre la seccion ## ${section}. en agent-roles.md`);

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isBoundary(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trimEnd();
}

const roles = await readFile(ROLES_MD, "utf8");
await mkdir(OUT_DIR, { recursive: true });

const written = [];
for (const role of ROLES) {
  const body = extractSection(roles, role.section);
  const banner = [
    `<!-- GENERADO POR docs/adlc/harness/tools/sync-agents.mjs — NO EDITAR A MANO.`,
    `     Cuerpo verbatim de docs/adlc/toolkit/04-MVP-Agentic-Loop/agent-roles.md, seccion ${role.section}.`,
    `     Modelo (${modelOf(role)}): ${role.rationale}.`,
    `     Para cambiar el modelo de esta fase, editar la tabla ROLES del script y correr:`,
    `       node docs/adlc/harness/tools/sync-agents.mjs -->`,
    "",
  ].join("\n");

  const out = `${frontmatter(role)}\n\n${banner}${body}\n`;
  const file = path.join(OUT_DIR, `adlc-${role.slug}.md`);
  await writeFile(file, out, "utf8");
  written.push({ file: path.relative(REPO, file), model: modelOf(role), lines: out.split("\n").length });
}

console.log(
  `Sincronizados ${written.length} agentes desde ${path.relative(REPO, ROLES_MD)}` +
    `${FREE ? " [MODO GRATIS]" : ""}:\n`,
);
for (const w of written) {
  console.log(`  ${w.file.padEnd(38)} ${w.model.padEnd(30)} ${w.lines} lineas`);
}
