# HARNESS-RESEARCH.md — Cómo ejecutar el loop ADLC de forma automática

> Investigación de fuentes primarias realizada el 2026-09-16 para responder una sola pregunta:
> **¿con qué se ejecuta `workflow-spec.json` como máquina de estados real, con un modelo distinto por fase y un gate humano que puede durar días?**
>
> Toda afirmación no obvia tiene URL de fuente primaria. Las inferencias propias están marcadas como **[inferencia]**.

---

## Resumen ejecutivo

1. **No hay que construir un harness desde cero, pero tampoco existe uno que ejecute este spec.** opencode ya resuelve cuatro de los cinco requisitos duros: modelo por fase declarado en el repo, override de agente/modelo por invocación, salida estructurada validable contra un JSON Schema, y dos ramas concurrentes reales. Lo que opencode **no** tiene es un gate humano bloqueante: su modelo de sesión sólo conoce tres estados — `idle`, `busy`, `retry` (`packages/schema/src/session-status-event.ts`) — y ninguna noción de "pausado esperando a un humano".
2. **El gate humano bloqueante no necesita un proceso esperando.** Necesita un archivo de estado en disco y un ejecutor que se **niegue** a salir de `awaiting_gdr` sin un GDR válido. Esto es más simple y más robusto que cualquier workflow engine, y es exactamente lo que la sección `expression_language` del spec ya anticipa ("un evaluador de menos de 50 líneas en cualquier lenguaje").
3. **La pieza que falta escribir es un driver de ~200 líneas**, no una plataforma. Traduce fase → invocación `opencode run --agent`, valida el output contra el `output_schema` del spec, evalúa las expresiones `when`, y para en el gate.
4. **La durabilidad barata ya existe y no se está usando:** opencode persiste las sesiones en SQLite y `opencode run --session <id> --continue` las retoma tras un restart; el costo y los tokens de cada turno quedan en el mensaje de asistente (`cost`, `tokens.input/output/reasoning/cache`).
5. **Corrección a una premisa plausible:** un plugin de opencode **no** puede cambiar el modelo de una llamada. El hook `chat.params` sólo expone `temperature`, `topP`, `topK`, `maxOutputTokens` y `options`. El routing de modelos tiene que vivir en el frontmatter del agente o en el `model` del prompt. Un plugin **sí** puede denegar un tool call (`permission.ask`, `tool.execute.before`) y **sí** puede disparar un prompt nuevo (recibe el cliente SDK), pero no puede re-rutear el modelo.
6. **Nada off-the-shelf ejecuta este spec.** Lo más cercano es Kiro Crew Task Runner (spec en markdown → tareas, gates de aprobación, checkpointing, resume) y BMAD `bmad-build-auto` (máquina de estados en el frontmatter del spec). Ninguno lee un JSON Schema externo ni permite fijar el modelo por fase. Ver `## Lo que NO existe`.
7. **Veredicto para un usuario solo:** Markdown agents + driver en shell/Node + journal en Git. Temporal, LangGraph Platform e Inngest Cloud están sobre-dimensionados. DBOS es la única pieza de durabilidad que vale la pena considerar **si** el proyecto termina teniendo Postgres — y el propio `generation_target` de BET-2026-001 ya lo incluye.

---

## El problema, precisado

El loop ya existe como **especificación ejecutable**: `docs/adlc/toolkit/04-MVP-Agentic-Loop/workflow-spec.json` (dialecto JSON Schema 2020-12, `spec_version: 1.0.0`). El harness no es un diseño, es un **intérprete** de ese archivo. Los requisitos duros, leídos del propio spec, son cinco:

**(a) Gate humano bloqueante.** `govern_gate` es el único estado con `type: "gate"`, `gate.kind == "human_judgment"` y `gate.blocking: true`. El `global_rules.human_gate_policy` es explícito: *"Ningún agente puede emitir un gdr válido"* — `puntuacion` y `veredicto` sólo son válidos si vienen literalmente del `owner_governor` identificado en `bet.owner_governor`. Además, el `$defs.gdr` delega la validación al orquestador: un `ADVANCE` sólo es válido si ninguna dimensión vale 1 y las tres valen 3 o 4 (`verdict_matrix`). El proceso puede estar parado días, el estado tiene que sobrevivir un restart, y el loop tiene que retomar cuando el humano escribe el GDR.

**(b) Dos ramas realmente concurrentes.** `parallel_gen_val` es `type: "concurrent"` con `concurrency.mode: "parallel"`, dos branches (`generate`, `validate`) y un `join` de tipo `all`. El `global_rules.concurrency_policy` cierra la puerta a la interpretación secuencial: *"Un orquestador que ejecute las dos ramas en serie — primero todo Generate, después todo Validate — está violando este spec aunque los nombres de los pasos coincidan."*

**(c) Feedback interno sin transición de estado.** Dentro de `parallel_gen_val` hay `internal_feedback` con eventos `validator.defect_reported` y `generator.incremental_fix_applied`, y la constraint del branch validate es *"Empieza sobre los primeros artefactos disponibles de 'generate', no espera una entrega 'completa'"*. El único escape del estado es `generation_target_ambiguo` (escala a `hypothesis_draft`), y sólo aplica cuando `brecha_explicita == true`.

**(d) Modelo por fase declarado en el repositorio.** No hay campo de modelo en el spec — el spec es "agnóstico a proveedor de IA" por diseño. El requisito del dueño es que la declaración viva en control de versiones, junto al repo, y no en una UI.

**(e) Durabilidad entre restarts.** Se desprende de (a): el estado del run (`hypothesis_draft` → … → `govern_gate`) tiene que reconstruirse desde disco. Adicionalmente, `continuous_observe` es un segundo punto de pausa, más blando, y `rollback_monitor` es un proceso de fondo que evalúa `triggers_rollback` contra cada `telemetry_report` **sin gate humano**.

**Contratos de rol**: cada fase invoca un contrato distinto de `agent-roles.md`, con su system prompt completo y sus pre/postcondiciones. Los cinco contratos ya tienen prompt listo para pegar; el harness no tiene que inventarlos, tiene que **encadenarlos** (sección `## Cómo se encadenan los cinco contratos`, líneas 660-672).

---

## Opciones evaluadas

### A1 · opencode: Markdown agents + driver externo (la base)

**Qué es.** opencode se configura con agentes Markdown en `.opencode/agents/*.md` (o `.opencode/agent/*.md`; el glob real de carga es `{agent,agents}/**/*.md` — ver `packages/opencode/src/config/agent.ts`, así que ambos nombres funcionan y la aparente discrepancia entre `/docs/agents/` y `/docs/cli/` no es tal). El frontmatter acepta `description`, `mode`, `model`, `temperature`, `top_p`, `steps`, `permission`, `hidden`. El nombre del archivo es el nombre del agente.
Fuente: https://opencode.ai/docs/agents/ · https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/config/agent.ts

**Gate humano bloqueante.** No viene resuelto: hay que construirlo. Pero los materiales están:
- `SessionStatus` sólo admite `idle | retry | busy`. **No existe** un estado durable de espera.
  Fuente: https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-status-event.ts
- El control real está en `permission`. `edit` acepta un objeto glob→acción y *"the last matching rule wins"*. Denegar `"docs/adlc/harness/runs/**": "deny"` convierte la regla del spec (*"ningún agente puede rellenar puntuacion o veredicto"*) en una restricción técnica, no en una instrucción de prompt.
  Fuente: https://opencode.ai/docs/agents/#permissions · https://opencode.ai/docs/permissions/
- Los plugins pueden bloquear un tool call: el hook `"permission.ask"` recibe `(Permission, { status: "ask" | "deny" | "allow" })` y `tool.execute.before` puede lanzar una excepción (el ejemplo oficial de `.env` protection hace exactamente eso).
  Fuente: https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts
- El plugin **sí** puede disparar un prompt nuevo: su input incluye `client: ReturnType<typeof createOpencodeClient>`, y ese cliente expone `session.prompt`. Es la vía programática para "disparar una transición", aunque no hay un hook dedicado a eso. **[inferencia: el mecanismo existe, el diseño de usarlo así es mío]**

**Modelo por fase.** Resuelto y versionado: `model: <provider>/<model-id>` en el frontmatter del agente. Además hay override por invocación: `opencode run --model` / `--agent`, y a nivel SDK/HTTP `POST /session/:id/message` con body `{ agent?, model?, parts }`.
Fuente: https://opencode.ai/docs/agents/#model · https://opencode.ai/docs/server/#messages · https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/cli/cmd/run.ts (`client.session.prompt({ sessionID, agent, model, variant, parts })`)

**Concurrencia real.** Verificada en el runtime, no inferida. Las llamadas a tools de un mismo mensaje del asistente corren en fibers separados: `const toolFibers = yield * FiberSet.make(...)` y `FiberSet.run(toolFibers)` en el runner, más `Effect.forEach(..., { concurrency: "unbounded" })`.
Fuente: https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/runner/llm.ts · https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/processor.ts
El tool `task` acepta `subagent_type` y `task_id` (para reanudar el mismo subagente), y tiene un modo `background` experimental (`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`). El subagente usa su propio modelo si lo tiene: `const model = next.model ?? { modelID: msg.info.modelID, providerID: msg.info.providerID }`.
Fuente: https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/task.ts

**Cómo se fuerza un subagente específico.** No hay API de "invocá el subagente X por nombre" desde el driver; el modelo elige. Lo que sí se puede: (1) `permission.task` con globs — y *"when set to `deny`, the subagent is removed from the Task tool description entirely"*; (2) `@`-mention explícito en el prompt; (3) `hidden: true` para que sólo sea invocable programáticamente. Con `task: { "*": "deny", "adlc-generator": "allow" }` el espacio de elección del modelo queda reducido a uno.
Fuente: https://opencode.ai/docs/agents/#task-permissions

**Salida estructurada.** El SDK acepta `body.format = { type: "json_schema", schema }` con `retryCount` (default 2) y devuelve `result.data.info.structured_output`, con `StructuredOutputError` si falla. Esto se mapea 1:1 con los `output_schema` del spec.
Fuente: https://opencode.ai/docs/sdk/#structured-output
Limitación: el CLI `opencode run` **no** expone un flag de schema; sólo `--format default|json`. Con CLI hay que pedir JSON en el prompt y validar afuera.

**Costo y tokens.** El mensaje de asistente lleva `cost: Schema.Finite` y `tokens: { input, output, reasoning, cache: { read, write } }`. Se leen después del turno vía `session.messages()` / `GET /session/:id/message`.
Fuente: https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-message.ts · https://opencode.ai/docs/sdk/#sessions
Contra: `--format json` **no** emite costo ni tokens. Emite exactamente seis tipos de evento (`tool_use`, `step_start`, `step_finish`, `text`, `reasoning`, `error`), cada uno `{ type, timestamp, sessionID, ...data }`, y corta cuando llega `session.status` con `status.type === "idle"`. Para costos: `session.messages()` o `opencode stats --project`.
Fuente: https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/cli/cmd/run.ts (función `emit` y el loop de eventos) · https://opencode.ai/docs/cli/#stats

**Durabilidad.** Sesiones persistidas; `opencode run --session <id>` / `--continue` / `--fork` retoman. Existe un `durable-event-manifest.ts` y un marcador `Event.durable` con `{ aggregateID, seq, version }` que indica que hay eventos persistidos con secuencia. **[inferencia: eso evidencia que el estado de sesión es replayable, pero no encontré documentación de que exista una primitiva de "esperar a un humano". Lo trato como no soportado.]**
Fuente: https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/durable-event-manifest.ts · https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/event.ts

**Qué te ata.** opencode. El driver habla HTTP contra `/doc` (OpenAPI 3.1) o el SDK; los agentes son archivos tuyos. Costo de salida: bajo. Pero el formato de sesión y el esquema de eventos son suyos.

**Costo.** El software es gratis; pagás tokens.

### A2 · opencode: dos procesos concurrentes sobre el mismo worktree

**Qué es.** Variante de A1 para `parallel_gen_val`: `opencode run --agent adlc-generator` y `opencode run --agent adlc-validator` en paralelo, compartiendo el worktree, con un canal de feedback acotado (un `feedback.jsonl`).

**Qué resuelve.** Da concurrencia **sin depender de que el modelo decida paralelizar**, que es la crítica que el propio spec hace a la ejecución secuencial. Cada proceso tiene su sesión, su modelo y su presupuesto de tokens.

**Riesgo real.** Escritura concurrente sobre los mismos archivos. La mitigación es de contrato, no de runtime: el Generator es dueño de `src/**`, el Validator de `tests/**` y de su reporte. ¿Es seguro correr dos sesiones sobre un mismo repositorio? No encontré documentación que lo garantice ni que lo prohíba; hay primitivas de worktree (`context.worktree`, `experimental_workspace`, `OPENCODE_EXPERIMENTAL_WORKSPACES`) que sugieren que el aislamiento por worktree es el camino previsto. **[inferencia: para dos ramas que tocan árboles de archivos disjuntos, dos procesos sobre un worktree es aceptable; para ramas que se pisan, no.]**
Fuente: https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts (tipo `WorkspaceAdapter`) · https://opencode.ai/docs/cli/ (`OPENCODE_EXPERIMENTAL_WORKSPACES`)

### B1 · Claude Agent SDK (TypeScript / Python)

**Qué es.** La librería que expone el loop de Claude Code. Subagentes programáticos con `agents: { nombre: AgentDefinition }`, cada uno con `prompt`, `tools`, `disallowedTools` y **`model`** propio.
Fuente: https://docs.claude.com/en/api/agent-sdk/subagents

**Gate humano.** Tiene `canUseTool` (callback in-process) y `permissionMode` (`default | dontAsk | acceptEdits | bypassPermissions | plan | auto`). El callback **no** sobrevive un restart por sí solo. Lo que sí sobrevive: las sesiones se escriben en disco (`~/.claude/projects/<encoded-cwd>/*.jsonl`) y `resume: sessionId` las retoma — la propia doc lista *"Restart your process: you captured the ID before shutdown and want to restore the conversation"* como caso de uso. Para multi-host hay un adaptador `SessionStore`.
Fuente: https://docs.claude.com/en/api/agent-sdk/permissions · https://docs.claude.com/en/api/agent-sdk/sessions
Además, un subagente puede correr en background (`background: true`), y hay límites duros: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (default 3), `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20), `maxBudgetUsd`.

**Modelo por fase.** `AgentDefinition.model` (alias `opus`/`sonnet`/`haiku`/`inherit` o ID completo). Declarable en `.claude/agents/*.md` o programático; los programáticos ganan.
Fuente: https://docs.claude.com/en/api/agent-sdk/subagents (tabla `AgentDefinition configuration`)

**Costo / ataduras.** Costo ~0 (pagás tokens de Anthropic), pero te ata al ecosistema Claude y el default de modelo del subagente es un alias de Anthropic. Existe `maxBudgetUsd` contra `total_cost_usd`, con `ResultMessage.total_cost_usd` — el mejor reporte de costo entre todos los evaluados.
**Veredicto:** es la alternativa seriamente competitiva a opencode. Pierde sólo por lock-in de modelo único y por no reemplazar nada que ya tengas instalado.

### B2 · OpenAI Agents SDK

**Qué es.** `Agent` + `Runner`. `model` es propiedad de cada agente; `output_type` fuerza salida estructurada; `handoffs` y `agents-as-tools` cubren la orquestación.
Fuente: https://openai.github.io/openai-agents-python/agents/

**Gate humano — el mejor resuelto de los SDKs.** Las tools se marcan con `needs_approval`; el run pausa y expone `RunResult.interruptions`; `result.to_state()` → `RunState` con `to_json()` / `to_string()` y `from_json()` / `from_string()`. La doc titula una sección **"Long-running approvals"** y describe exactamente el caso: *"Use `state.to_json()` or `state.to_string()` to store pending work in a database or queue and recreate it later"*. Incluso advierte versionar el estado serializado (*"Versioning pending tasks"*) porque los agentes y modelos cambian mientras el gate está abierto.
Fuente: https://openai.github.io/openai-agents-python/human_in_the_loop/

**Contra.** Es un SDK, no un host de agentes: no tiene TUI, ni worktree, ni tools de edición de código de fábrica, ni un servidor de sesión. Construir el harness acá significa escribir todo el loop de tools de edición de código. **Descartada** para este caso por ese motivo — no por el gate humano, que es el mejor del grupo.

### B3 · LangGraph

**Qué es.** Grafos de estado en Python/TS. `model` por nodo (cada nodo instancia su propio LLM), `interrupt()` para pausar, checkpointer para persistir.

**Gate humano.** `interrupt(value)` suspende el grafo *"indefinitely"*, el checkpointer guarda el estado, `thread_id` es el puntero, y `Command(resume=...)` continúa. Con checkpointer durable (DB) sobrevive un restart. Documenta el caso de múltiples interrupts en branches paralelas con `resume_map` por `Interrupt.id` — que es literalmente el `join` de `parallel_gen_val` con dos ramas.
Fuente: https://docs.langchain.com/oss/python/langgraph/interrupts

**Advertencias operativas que la doc hace y que importan acá:** el nodo se re-ejecuta completo desde el principio al reanudar, así que *"side effects called before `interrupt` must be idempotent"*, y hay que evitar `while True` + `interrupt()` dentro de un nodo (re-ejecución exponencial). También: no envolver `interrupt()` en `try/except`.

**Costo.** El OSS es gratis y auto-hospedable. El plano gestionado hoy se factura como LangSmith: Developer $0/seat (1 seat, 5 000 base traces/mes), Plus $39/seat/mes, Enterprise custom; LCU a $1.50 y LSU a $1.00.
Fuente: https://www.langchain.com/pricing-langgraph-platform
**Veredicto:** es el encaje conceptual más limpio (grafo declarativo + interrupt + checkpointer ≈ el spec) pero **sobre-dimensionado**: agrega Python, un checkpointer, y el modelo de datos de LangGraph para un loop de 8 estados con un solo gate. Y no resuelve el routing de modelos mejor que el frontmatter de un agente.

### C1 · DBOS — la durabilidad mínima viable

**Qué es.** Librería de workflows durables sobre Postgres. *"There's no separate orchestration server and no infrastructure required besides Postgres."* Checkpoint por step en la base; recuperación desde el último step completado al arrancar.
Fuente: https://docs.dbos.dev/architecture

**Gate humano.** `DBOS.recv(timeout_seconds=...)` dentro del workflow espera un mensaje durablemente; `DBOS.send(workflow_id, msg)` lo resuelve desde, por ejemplo, un endpoint HTTP. La doc dice textualmente que el caso de uso es un humano que tarda *"hours or days"* y que *"its server can restart, its code can be upgraded, and it will recover and keep waiting"*. Además `DBOS.set_event` / `get_event` publican el estado del agente, con un ejemplo de endpoint `GET /agents/waiting` que lista los agentes esperando input humano — el "inbox del Gobernador" que el `govern_gate` necesita, ya resuelto.
Fuente: https://docs.dbos.dev/ai/hitl

**Versionado.** Soporta `patching` y `versioning` para desplegar cambios rompientes sin romper workflows en vuelo — el spec va a evolucionar, así que esto importa.
Fuente: https://docs.dbos.dev/architecture (sección "Upgrading Workflow Code")

**Costo / ataduras.** El OSS es gratis; el costo es un Postgres. Conductor (control plane, dashboards, recuperación distribuida) es opcional y para un solo proceso no hace falta. **Te ata a Postgres** y a un lenguaje por aplicación.
**Veredicto: única pieza de infraestructura que recomiendo considerar**, y sólo después de que el MVP funcione a mano.

### C2 · Restate

**Qué es.** Runtime durable (un binario, `restate-server`) con SDKs TS/Python/Java. Awakeables como promesas durables y suspensión de la invocación mientras espera (*"If you wait for more than a minute, the invocation will get suspended"*, *"no idle billing on serverless"*).
Fuente: https://docs.restate.dev/ai/patterns/human-in-the-loop · https://docs.restate.dev/use-cases/ai-agents

**Gate humano.** `ctx.awakeable()` → se notifica al aprobador con el ID → el agente suspende → `curl .../restate/awakeables/<id>/resolve --json 'true'` resuelve la promesa → el agente retoma. Con `orTimeout` o `restate.select` para timeouts, persistidos ambos.
**Costo.** Restate Cloud, BYOC o self-hosted (comparativa en `/hosting/overview`). El server es un binario vía npm.
**Veredicto:** más liviano que Temporal, con un modelo de suspensión elegante. Sigue siendo una pieza más de infraestructura para un loop que tal vez corra una vez por semana. **Viable, no recomendado como primer paso.**

### C3 · Temporal

**Gate humano.** Signals + `wf.condition(() => approvedForRelease)` para bloquear indefinidamente; Updates con validators que rechazan antes de escribir al History; `Signal-With-Start`; handlers `async`. Es la implementación de referencia del patrón.
Fuente: https://docs.temporal.io/develop/typescript/message-passing

**Versionado.** Sí — es el sistema con la historia de versionado más madura del grupo.
**Costo / atraso.** Requiere un servidor (`temporal server start-dev` en local; Temporal Cloud o un cluster con Cassandra/Postgres + Elasticsearch en producción). **Sobre-dimensionado y caro en complejidad para un usuario solo.** Descartado.

### C4 · Inngest

**Gate humano.** `step.waitForEvent("wait-for-approval", { event: "app/invoice.approved", timeout: "7d", match: "data.invoiceId" })`. Duradero, con timeout y matching. Advertencia real de la doc: *"a losing `step.waitForEvent()` is not cancelled: it remains an active pause and keeps the run in a Running state until its timeout is reached"*.
Fuente: https://www.inngest.com/docs/reference/functions/step-wait-for-event

**Contra.** Modelo event-driven con una cuenta/plano de control de Inngest (Cloud o self-host). Diseñado para equipos. **Viable pero desproporcionado**, y la semántica de eventos acopla el harness a un tercero que no aporta nada que un `while` sobre un archivo de estado no aporte.

### C5 · Prefect / Dagster

Orquestadores de datos. Los consulté y no los llevé a verificación profunda porque el encaje es malo por diseño: su unidad es el pipeline con DAG de tareas programadas, no el loop con un gate humano que abre y cierra según un artefacto que produce una persona. **Descartados sin verificación primaria; lo declaro explícitamente en vez de inventar una comparación.**

### D1 · LiteLLM Proxy — routing y contabilidad

**Qué es.** Un gateway OpenAI-compatible (`litellm --config config.yaml`) con `model_list` de alias. Ejemplo: un alias `adlc-govern` que apunta a un modelo fuerte y un alias `adlc-generate` que apunta a uno barato; el cliente pide `model: adlc-generate`. Soporta `fallbacks`, `context_window_fallbacks`, rate limits por deployment, virtual keys y spend tracking.
Fuente: https://docs.litellm.ai/docs/proxy/configs

**Cuándo vale la pena acá.** Sólo si querés cambiar de proveedor por fase sin tocar opencode, o si querés un único punto de contabilidad de gasto. **Para el caso de este repo es una capa innecesaria:** opencode ya resuelve el routing por fase en el frontmatter del agente y ya devuelve costo y tokens por turno. **[inferencia propia, basada en A1.]**

### D2 · models.dev / OpenRouter

`models.dev` es el catálogo del que opencode lee los modelos (`opencode models`, `--refresh`), y `opencode auth login` escribe credenciales de cualquier proveedor de ese catálogo. Eso ya da el multi-proveedor sin proxy.
Fuente: https://opencode.ai/docs/cli/#auth · https://opencode.ai/docs/cli/#models
OpenRouter no lo verifiqué en fuente primaria en esta pasada; **no lo recomiendo ni lo descarto en base a evidencia.**

### E1 · GitHub Actions como disparador no atendido

**Qué es.** El repo es público (`ramiro-c/rutinify`), lo que habilita lo interesante sin pagar.

**Cómo se estaciona un run esperando un humano — el hallazgo de esta lane.** `required reviewers` es una deployment protection rule nativa: un job que referencia un environment protegido queda en estado *Pending* hasta que un reviewer apruebe. Y `wait timer` acepta *"an integer between 1 and 43,200 (30 days)"* con la frase decisiva: **"Wait time will not count towards your billable time."** Hay además un botón explícito *"Start all waiting jobs"* en el run.
Fuente: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments · https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments
Límites a tener presentes: máximo 6 reviewers por environment, y en planes Free/Pro/Team los required reviewers y los wait timers **sólo están disponibles en repositorios públicos** — lo cual se cumple acá.

**Interpretación para este spec [inferencia].** Esto mapea `govern_gate` con notable exactitud: el job de Generate/Validate corre y termina; un job posterior con `environment: adlc-govern` queda Pending; el humano aprueba o rechaza (o escribe el GDR como comentario en un issue/PR); y el job que aplica la transición sólo corre después. Cero minutos facturados mientras espera, y la aprobación queda auditada en GitHub. `continuous_observe`, en cambio, encaja mejor en un `on: schedule: cron`.

**Contra.** El estado del loop vive en artifacts/commits, no en un proceso; y el secreto del proveedor tiene que estar como secret del repo. Es el mecanismo de parking más barato que encontré y el único con auditoría incluida.

### E2 · opencode GitHub agent

`opencode github install` crea un workflow; `opencode github run` ejecuta el agente con un `model` obligatorio y un `agent` (debe ser primary). Soporta eventos `issue_comment`, `pull_request_review_comment`, `issues`, `pull_request`, `schedule` y `workflow_dispatch`. Para `schedule`, `issues` y `workflow_dispatch` el `prompt` es obligatorio. Requiere `id-token: write` + la GitHub App, o `use_github_token: true` con `contents: write` / `pull-requests: write` / `issues: write`.
Fuente: https://opencode.ai/docs/github/ · https://opencode.ai/docs/cli/#github

Limitación honesta: configura **un** `model` y **un** `agent` por workflow. No hay estado entre fases; cada corrida es una sesión nueva. Sirve como disparador y como ejecutor de una fase, no como el loop.

### E3 · claude-code-action

Existe, es de Anthropic, MIT, corre en tu runner, soporta structured outputs, y tiene modos de revisión de PR, triage e implementación. **Pero** también configura por workflow, no por fase de un loop.
Fuente: https://github.com/anthropics/claude-code-action

### F · El toolset del Validator

Lo que un agente Validator puede llamar de verdad, y qué es un gate numérico:

- **Stryker Mutator (JS/TS).** *"StrykerJS supports most JavaScript projects, including TypeScript, React, Angular, VueJS, Svelte, and NodeJS."* Tiene un runner oficial de Vitest (`@stryker-mutator/vitest-runner`) y un checker de TypeScript. **El gate numérico es `thresholds`:** `mutation score < break` → *"Stryker will exit with exit code 1, indicating a build failure"*. Default `{ high: 80, low: 60, break: null }` (con `break: null` nunca falla el build). Con `coverageAnalysis: "perTest"` (default desde v5) distingue *Survived* de *NoCoverage*.
  Fuente: https://stryker-mutator.io/docs/stryker-js/introduction/ · https://stryker-mutator.io/docs/stryker-js/configuration/
  **Esto convierte el `reporte_regresion` y la severidad del `$defs.validation_report` en algo medible en vez de narrado, y es la respuesta concreta a "la cobertura técnica alta no es cobertura de hipótesis": un mutation score bajo con cobertura de línea alta es exactamente la firma de la resolución por proxy técnico.**
- **Playwright** (headless) para el `extremo_a_ejecutar` del `suite_tests`. Fuente: https://playwright.dev/docs/intro
- **Vitest** con cobertura v8/istanbul, para `cobertura_tecnica`. Fuente: https://vitest.dev/guide/coverage
- **Fuzzing**: no verifiqué una herramienta concreta en fuente primaria; el campo `fuzzing` del `output_schema` puede poblarse con property-based testing, pero **no lo afirmo sin fuente**.

Nota para el estado actual del repo: `package.json` no tiene vitest, playwright ni stryker en `devDependencies`, y no hay script `test`. El Validator arranca de cero en este repo.

### G · Harnesses de "SDLC agéntico" — la verificación honesta

**GitHub Agentic Workflows (`gh aw`).** Extensión oficial de GitHub (`gh extension install github/gh-aw`). Escribís un `.md` con frontmatter (`on`, `permissions`, `tools`, `safe-outputs`, `engine`, `max-ai-credits`) y `gh aw compile` lo compila a un `.lock.yml` de Actions. Motores soportados: Copilot (default), Claude Code, Codex, Gemini, Pi; hay definiciones importables no soportadas para OpenCode, Cursor, Kiro, Aider, Crush.
Fuente: https://github.github.com/gh-aw/ · https://github.github.com/gh-aw/reference/compilation-process/
**Por qué no alcanza:** cada workflow declara **un** engine y no hay máquina de estados entre fases; el "estado" es el trigger de GitHub. No ejecuta un `when` ni un `join`.

**GitHub Spec Kit.** Toolkit open source (MIT, `uv tool install specify-cli`) con procesos SDD, bug-fixing y assessments. Sus comandos son **skills que se invocan a mano en el chat del agente**: *"Invoke each `/speckit-*` skill in your agent's chat, one at a time, and review the result before continuing."*
Fuente: https://github.com/github/spec-kit
**Es el mismo modelo que ya tenés** (humano empujando fases), sólo con mejores plantillas. Sin routing de modelos, sin ejecución declarativa.

**BMAD-METHOD.** Metodología agéntica con 4 fases. Lo relevante: `bmad-build-auto` es "the single-iteration unattended worker", y el track autónomo *"operates as a state machine driven by the `status` frontmatter in the specification artifact"* (`draft → ready-for-dev → in-progress → done`). Tiene gates humanos vía `bmad-checkpoint-preview` (veredictos Approve / Rework / Discuss) y, en modo autónomo, *"If the agent hits an intent gap or ambiguity, it halts with a `blocked` status rather than asking for clarification"*.
Fuente: https://github.com/bmad-code-org/BMAD-METHOD · https://docs.bmad-method.org/reference/workflow-map/
**Por qué no alcanza:** su máquina de estados vive en el `status` de *su* spec, no en tu `workflow-spec.json`; no acepta un JSON Schema externo ni un `verdict_matrix` externo; no hay evidencia de modelo por fase. Y su propia crítica pública es que *"since BMAD is a methodology rather than a product, there is no unified UI, no version control integration, and no automated enforcement of the workflow"* **[fuente secundaria, de un blog; lo cito como opinión, no como hecho]**.

**Kiro Crew — Task Runner. Es lo más cercano que encontré.** Le das un spec en markdown: lo descompone en tareas ordenadas con dependencias, acceptance criteria y **approval gates**; corre cada paso en su propia sesión (`taskrunner:{task_id}:task{N}`); testea; un reviewer independiente lee el `git diff` real (no el autoreporte) en otra sesión y revierte + reintenta hasta 3 veces; checkpointa en `TASK_PROGRESS.md`; paraleliza lotes de 3 tareas sin dependencias cruzadas; pone cada run en su propia rama/worktree; y *"On gateway restart, any task with `status == "running"` is automatically transitioned to `"paused"`"* con resume manual. Los gates se marcan con `force_approval: true` y **bloquean incluso en YOLO mode**.
Fuente: https://kiro.dev/docs/crew/features/task-runner/
**Por qué no alcanza:** consume un spec en markdown, no tu JSON Schema; no encontré ninguna mención de selección de modelo por fase; y es producto de Kiro, no una librería que puedas apuntar a tu repo desde opencode.

**No verifiqué en fuente primaria y por lo tanto no afirmo nada sobre:** Sweep, Devin, Factory.ai, OpenHands, AutoGen/Magentic-One, CrewAI Flows. No los incluyo en la matriz porque no tengo evidencia primaria y el pedido era explícito: no inventar productos.

---

## Matriz comparativa

| Opción | Gate humano bloqueante | Modelo por fase | Concurrencia real | Durabilidad / restart | Esfuerzo inicial | Lock-in | Veredicto |
|---|---|---|---|---|---|---|---|
| **opencode: agents + driver propio** | **A construir** (journal en disco + `permission.edit: deny` + resume explícito) | **Sí** — `model:` en frontmatter, versionado | **Sí** — 2 procesos, o 2 `task` en un mensaje (`FiberSet`, concurrency unbounded) | Sesiones persistidas + `--session`/`--continue`; el journal lo mantenés vos | **Bajo** (~200 líneas de driver) | Bajo (archivos propios + HTTP `/doc`) | **RECOMENDADA (MVP)** |
| opencode + DBOS | **Sí** — `DBOS.recv` + `DBOS.send` desde HTTP | Sí (mismo frontmatter) | Sí | **Sí, completa** (checkpoint por step, recovery, patch/versioning) | Medio (Postgres + reescribir el driver) | Medio (Postgres + DBOS API) | **VIABLE — fase 2** |
| opencode + Restate | **Sí** — awakeable + suspend | Sí | Sí | Sí | Medio (binario + SDK + `deployments register`) | Medio | Viable, no primero |
| Claude Agent SDK | **Parcial** — `canUseTool` es in-process; `resume: sessionId` sobrevive el restart, el wait no | **Sí** — `AgentDefinition.model` | **Sí** — subagentes, `background`, cap de 20 concurrentes | Sesiones en `~/.claude/projects/*.jsonl` + `SessionStore` multi-host | Medio-alto (todo el loop de tools) | **Alto** (modelos Anthropic) | Viable como plan B |
| OpenAI Agents SDK | **La mejor del grupo** — `RunState.to_json()` + sección "Long-running approvals" | Sí — `Agent.model` | Sí — handoffs / agents-as-tools | Explícita y diseñada para esto | Alto (no trae host ni tools de edición) | Alto | **Descartada** (falta el host, no el gate) |
| LangGraph | **Sí** — `interrupt()` + checkpointer + `Command(resume=)` | Sí — por nodo | Sí — branches + `resume_map` por `Interrupt.id` | Sí, con checkpointer durable | Alto | Medio-alto | **Descartada por sobre-dimensionada** (8 estados, 1 gate) |
| Temporal | **Sí** — Signals + `wf.condition` | Sí (por Activity) | Sí | Sí, la más madura + versionado | **Muy alto** (cluster) | Alto | **Descartada — over-kill** |
| Inngest | **Sí** — `step.waitForEvent(timeout: "7d")` | Sí | Sí | Sí | Medio | Medio-alto | **Descartada — desproporcionada** |
| Prefect / Dagster | No verificado | — | — | — | — | — | **Descartadas sin verificación primaria** |
| GitHub Actions (environments) | **Sí, nativo** — required reviewers + Pending; wait timer hasta 30 días **sin facturar** | Por workflow (no por fase) | Jobs en paralelo, sí | Estado en artifacts/commits, no en un proceso | Bajo | Medio (GitHub) | **RECOMENDADA como disparador** |
| opencode GitHub / claude-code-action | No (cada corrida es una sesión nueva) | 1 modelo por workflow | No (una fase) | No | Bajo | Medio | Viable sólo como ejecutor de una fase |
| `gh aw` | No (el trigger es el estado) | 1 engine por workflow | Jobs en paralelo | No | Medio | Medio (GitHub) | Descartada como loop; sirve como runner |
| BMAD-METHOD | Parcial (`bmad-checkpoint-preview`; `blocked` en autónomo) | **No verificado** | Sí | `status` en frontmatter del spec | Medio | Bajo (archivos) | Descartada: no ejecuta *este* spec |
| Spec Kit | Manual (skills invocadas a mano) | No | No | No | Bajo | Bajo | Descartada |
| Kiro Crew Task Runner | **Sí** — `force_approval: true`, `running → paused` al reiniciar | **No verificado** | Sí — lotes de 3 | Sí (`TASK_PROGRESS.md`, ramas, retries) | N/A (es producto) | Alto (Kiro) | El más cercano, pero no ejecuta *este* spec |

---

## Arquitectura recomendada

### Principios que la restringen

La recomendación se deriva de los tres principios que el propio toolkit declara: **loops sobre gates** (el feedback del Validator llega *mientras* se genera, no después), **gobernanza sobre ejecución** (la frontera de lo que un agente puede decidir tiene que ser explícita), y **señal sobre suposición** (el estado del run es un hecho en disco, no algo que el modelo recuerda). A eso se suman dos hechos medidos: el spec ya es ilegible para un LLM pero perfectamente legible para un script; y su propia sección `expression_language` afirma que un evaluador de menos de 50 líneas alcanza.

**Conclusión: el harness es un intérprete de 200 líneas, no una plataforma.**

### Dónde vive cada cosa

```
.opencode/agents/
  adlc-architect.md            # model: el caro — Intent y Redirect
  adlc-generator.md            # model: el barato — Generate
  adlc-validator.md            # model: el barato — Validate
  adlc-governor-interface.md   # model: el caro — empaqueta, no puntúa
  adlc-deploy-observe.md       # model: el barato — Deploy y Observe

docs/adlc/harness/
  phases.yaml                  # fase -> agente (el modelo vive en el .md, no acá)
  adlc.mjs                     # el driver
  runs/
    BET-2026-001.json          # journal: estado + artefactos + historia
    BET-2026-001.gdr.yaml      # lo escribe SOLO el humano
    BET-2026-001.feedback.jsonl# canal Validator -> Generator dentro del estado
```

El **system prompt de cada `.md` es el de `agent-roles.md`, pegado tal cual**. No se reescribe: ya está escrito y es el contrato.

### El modelo por fase, declarado en el repo

El frontmatter del agente es la única fuente de verdad del modelo. Así el routing está versionado, y `phases.yaml` sólo dice *qué rol actúa en cada fase*:

```markdown
<!-- .opencode/agents/adlc-generator.md -->
---
description: ADLC Generator Agent — produce la superficie completa sin placeholders
mode: primary
model: deepseek/deepseek-v4-flash        # fase mecánica: barato
temperature: 0.1
permission:
  edit:
    "*": allow
    "docs/adlc/harness/runs/**": deny    # no puede tocar el journal ni el GDR
  bash:
    "*": ask
    "npm run build": allow
    "npx tsc *": allow
  task: deny                             # el Generator no delega
  webfetch: deny
---
<system prompt de agent-roles.md §2, completo>
```

```markdown
<!-- .opencode/agents/adlc-architect.md -->
---
description: ADLC Architect / Intent Enframing Agent
mode: primary
model: anthropic/claude-sonnet-4-20250514  # razonamiento fuerte
temperature: 0.2
permission:
  edit: { "*": allow, "docs/adlc/harness/runs/**": deny }
  bash: deny
  task: deny
---
<system prompt de agent-roles.md §1, completo>
```

```yaml
# docs/adlc/harness/phases.yaml
version: 1
spec: ../toolkit/04-MVP-Agentic-Loop/workflow-spec.json
phases:
  hypothesis_draft:    { agent: adlc-architect }
  parallel_gen_val:
    branches:
      generate:        { agent: adlc-generator }
      validate:        { agent: adlc-validator }
    feedback:          docs/adlc/harness/runs/{bet_id}.feedback.jsonl
  govern_gate:
    agent:             adlc-governor-interface
    blocking:          true
    required_artifact: gdr            # validado contra $defs.gdr + verdict_matrix
  canary_deploy:       { agent: adlc-deploy-observe }
  continuous_observe:  { agent: adlc-deploy-observe }
  redirect:            { agent: adlc-architect }
```

Cambiar el modelo de una fase = un commit que toca una línea del `.md`. No hay UI, no hay base de datos, no hay acción fuera del repo.

### El journal — la pieza que hace durable el gate

```jsonc
// docs/adlc/harness/runs/BET-2026-001.json
{
  "bet_id": "BET-2026-001",
  "state": "awaiting_gdr",
  "phase": "Govern",
  "since": "2026-09-16T21:40:00Z",
  "artifacts": {
    "generation_manifest": "runs/BET-2026-001.manifest.json",
    "validation_report":   "runs/BET-2026-001.validation.json"
  },
  "awaiting": {
    "artifact": "gdr",
    "actor": "Ramiro Cerdá",          // de bet.owner_governor
    "instruction": "Escribí runs/BET-2026-001.gdr.yaml y corré: adlc resume BET-2026-001"
  },
  "history": [
    { "at": "2026-09-16T20:02:00Z", "from": "hypothesis_draft", "to": "parallel_gen_val", "on": "bet_confirmed_by_human", "cost_usd": 0.41 },
    { "at": "2026-09-16T21:38:00Z", "from": "parallel_gen_val", "to": "govern_gate", "on": "generation_and_validation_complete", "cost_usd": 1.87 }
  ]
}
```

Este archivo, comiteado a Git, **es** la durabilidad. Sobrevive un restart del proceso porque no depende del proceso. Y el `history` con `cost_usd` por transición es la señal de resolución del propio harness.

### Cómo se invoca una fase

MVP (CLI). Sin schema nativo, así que se pide JSON y se valida afuera:

```bash
#!/usr/bin/env bash
# docs/adlc/harness/adlc.sh — versión mínima viable
set -euo pipefail
RUN="docs/adlc/harness/runs/${1}.json"
STATE=$(jq -r .state "$RUN")

case "$STATE" in

  hypothesis_draft)
    opencode run --agent adlc-architect \
      --file docs/adlc/BET-2026-001.md \
      --title "ADLC ${1} · Intent" \
      "Convertí el problema en un borrador de Bet Register. Devolvé SOLO el YAML del §2 de tu contrato, sin texto adicional."
    # validar contra $defs.bet_register_entry (ajv) antes de continuar
    jq '.state = "awaiting_human_confirmation"' "$RUN" | sponge "$RUN"
    echo "Borrador listo. Confirmá la Bet y volvé a correr."
    ;;

  parallel_gen_val)
    # Dos ramas reales, en paralelo, sobre el mismo worktree.
    opencode run --agent adlc-generator  --title "ADLC ${1} · Generate" \
      "$(cat docs/adlc/harness/prompts/generate.txt)" &
    GEN=$!
    opencode run --agent adlc-validator  --title "ADLC ${1} · Validate" \
      "$(cat docs/adlc/harness/prompts/validate.txt)" &
    VAL=$!
    wait "$GEN" "$VAL"
    # el join: las dos postcondiciones presentes y no nulas
    jq '.state = "govern_gate"' "$RUN" | sponge "$RUN"
    ;;

  govern_gate)
    # 1) el agente EMPAQUETA. No puntúa, no sugiere veredicto.
    opencode run --agent adlc-governor-interface --title "ADLC ${1} · Govern" \
      "Consolidá generation_manifest y validation_report en el paquete de decisión. No calcules puntuaciones."
    # 2) PARK. El driver se niega a seguir sin GDR.
    jq '.state = "awaiting_gdr" | .since = (now | todate)' "$RUN" | sponge "$RUN"
    cat <<'EOF'
Run estacionado. No hay proceso esperando: el estado está en el journal.
Cuando quieras decidir, escribí runs/<id>.gdr.yaml con las tres puntuaciones
y el veredicto, y corré:   adlc resume <id>
EOF
    exit 0
    ;;

  awaiting_gdr)
    echo "Bloqueado en govern_gate desde $(jq -r .since "$RUN"). Escribí el GDR y corré: adlc resume ${1}"
    exit 1
    ;;
esac
```

Y el resume, que es donde el `verdict_matrix` deja de ser prosa y pasa a ser código:

```bash
adlc_resume() {
  local id="$1" run="docs/adlc/harness/runs/$1.json"
  local gdr="docs/adlc/harness/runs/$1.gdr.yaml"

  [ "$(jq -r .state "$run")" = "awaiting_gdr" ] || { echo "no está en el gate"; exit 1; }

  # 1. schema del GDR ($defs.gdr)
  ajv validate -s <(jq '.$defs.gdr' "$SPEC") -d "$gdr" || exit 1

  # 2. verdict_matrix — la regla que el schema JSON NO puede expresar
  local a c r v
  a=$(yq .puntuacion.alineacion_con_intencion "$gdr")
  c=$(yq .puntuacion.contexto_externo        "$gdr")
  r=$(yq .puntuacion.risk_envelope           "$gdr")
  v=$(yq .veredicto                          "$gdr")

  local min=$(( a < c ? (a < r ? a : r) : (c < r ? c : r) ))
  if   [ "$min" -eq 1 ];            then [ "$v" = "KILL"    ] || { echo "GDR inválido: hay un 1, el veredicto debe ser KILL"; exit 1; }
  elif [ "$min" -eq 2 ];            then [ "$v" = "REDIRECT"] || { echo "GDR inválido: hay un 2, el veredicto debe ser REDIRECT"; exit 1; }
  else                                   [ "$v" = "ADVANCE" ] || { echo "GDR inválido: todo 3-4, el veredicto debe ser ADVANCE"; exit 1; }
  fi

  # 3. transición según el spec
  case "$v" in
    ADVANCE)  next=canary_deploy ;;
    REDIRECT) next=redirect ;;
    KILL)     next=killed ;;
  esac
  jq --arg n "$next" '.state = $n' "$run" | sponge "$run"
}
```

Tres cosas que este fragmento hace y que un prompt no puede hacer:
1. **Hace imposible que un agente emita el GDR.** No es una instrucción, es una denegación de `edit` sobre `docs/adlc/harness/runs/**` y un archivo que sólo el humano escribe.
2. **Hace imposible un GDR incoherente.** El `verdict_matrix` vive en código, no en la buena voluntad del Gobernador.
3. **Hace imposible que un run avance sin decisión.** `awaiting_gdr` no tiene transición propia: sólo `adlc resume` la produce.

### El gate humano, resuelto

El insight central de esta investigación: **un gate que dura días no necesita un proceso que lo espere.** Necesita (i) un estado en disco, (ii) un ejecutor que se niegue a avanzar sin el artefacto requerido, y (iii) una forma de despertarlo. El "despertar" puede ser un comando (`adlc resume`), un cron que mira si el GDR existe, o — si querés que sea desde el celular — un job de GitHub Actions contra un environment con `required reviewers`, aprovechando que el wait timer llega a 30 días y **no se factura**.

Esto es más robusto que un `while` con sleep: no hay proceso que pueda morir mal, no hay timeout que se dispare, no hay costo de cómputo ocioso, y el estado es auditable con `git log`.

### El feedback interno de `parallel_gen_val`

El canal es un archivo append-only. El Validator escribe una línea por defecto; el Generator lee antes de cada escritura.

```jsonc
// docs/adlc/harness/runs/BET-2026-001.feedback.jsonl
{"at":"2026-09-16T20:41:12Z","from":"validator","kind":"defect","target":"src/lib/csv.ts:88","repro":"'1,5,'","severity":"alta","status":"open"}
{"at":"2026-09-16T20:44:03Z","from":"generator","kind":"fix","target":"src/lib/csv.ts:88","repro":"cubre celda vacía al final","status":"fixed"}
```

Y el prompt del Generator lo obliga a consumirlo (es el contrato de `agent-roles.md` §2, "Feedback desde el Validator", traducido a mecánica):

> Antes de cada escritura, leé `runs/<bet_id>.feedback.jsonl` y resolvé toda entrada con `"kind":"defect"` y `"status":"open"`. Marcá cada una como `fixed` cuando la corrijas. No reinicies la superficie: corregí de forma incremental sobre lo ya generado.

El `join` se evalúa contra los dos artefactos, no contra el archivo de feedback — exactamente la condición del spec (`generation_manifest != null and validation_report != null`).

### `continuous_observe` y `rollback_monitor`

Es el otro punto de pausa, y es distinto: no bloquea. `continuous_observe` es `type: "continuous"` y corre mientras la Bet siga en `calibrating`. Su forma natural acá no es un agente en un loop, es **un proceso programado que emite `telemetry_report`**, y el `rollback_monitor` es un evaluador sin LLM que compara `valor_observado` contra cada `triggers_rollback` — la sección `near_threshold_alert` del spec dice explícitamente que la alerta temprana es dentro del 20% del umbral, lo cual es aritmética, no razonamiento. **Recomiendo implementar `rollback_monitor` como script puro, sin modelo.** Un monitor de rollback que depende de un LLM es un monitor que puede alucinar que todo está bien.

### Versión mínima viable vs. versión "real"

| | **MVV (recomendada)** | Versión "real" |
|---|---|---|
| Ejecución de fase | `opencode run --agent X --format json`, JSON pedido en el prompt | SDK: `session.prompt({ agent, model, parts, format: { type: "json_schema", schema } })` |
| Validación | `ajv` contra `$defs.*` del spec | Igual, pero el modelo ya devuelve `structured_output` validado con `retryCount` |
| Estado | `runs/<id>.json` comiteado | Igual + DBOS/Postgres para retries y recovery automáticos |
| Concurrencia | 2 procesos + `feedback.jsonl` | Igual, o `task` en background con `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` |
| Disparo | Comando manual, y `on: schedule` para Observe | Igual + environment con `required reviewers` para el gate |
| Costo | Tokens | Tokens + Postgres (+ Conductor si querés dashboard) |
| Esfuerzo | ~1 día | ~1 semana |

**Qué elegiría para un usuario solo: la MVV.** Tres razones concretas:
1. **No hay nada que ganar con durabilidad distribuida cuando hay un solo usuario y un solo proceso.** El único fallo que hay que sobrevivir es "cerré la terminal", y eso ya lo resuelve el journal en disco.
2. **El gate dura días, y la MVV no gasta nada mientras espera.** Temporal, Inngest, Restate y LangGraph Platform están diseñados para coordinar muchos workers; acá hay uno. Aplicarles la palabra "over-engineered" es quedarse corto: agregan un servicio que puede caerse **al problema de que algo esté esperando**.
3. **La MVV preserva la propiedad más valiosa del diseño: el estado es inspeccionable.** `git diff docs/adlc/harness/runs/` te dice exactamente en qué estado está cada Bet, qué produjo cada fase y cuánto costó. Ningún dashboard de un workflow engine te da eso con la misma fricción cero.

**Cuándo cambiarse a DBOS:** cuando el loop corra más de una Bet en paralelo, o cuando quieras que un crash a mitad de `parallel_gen_val` se recupere sin que vos lo notes, o cuando quieras un inbox de gobernanza con `DBOS.list_workflows(status="PENDING")`. El `generation_target` de BET-2026-001 ya incluye Postgres, así que la pieza está en camino de todos modos — y esa es la razón por la que DBOS y no Restate/Temporal: **no agrega un servidor, agrega una librería.**

---

## Lo que NO existe

Ningún producto encontrado ejecuta `workflow-spec.json` como está escrito. Puntualmente, no existe:

1. **Un ejecutor de máquinas de estados declaradas con el dialecto de este spec.** `gh aw` compila markdown a Actions, no interpreta un `states`/`transitions`. BMAD tiene una máquina de estados **suya**, en el `status` de **su** spec. Kiro descompone markdown en tareas. Ninguno lee un `$defs`, un `input_schema`, un `when`, un `join`, ni un `verdict_matrix` externos.
2. **Un gate humano bloqueante durable en opencode.** `SessionStatus` sólo conoce `idle | retry | busy`. Si querés que la sesión misma espere, no se puede. Lo que sí hay es sesiones persistidas y `--continue`.
3. **Routing de modelo por llamada desde un plugin de opencode.** `chat.params` no expone el modelo. El modelo se fija en el agente (frontmatter) o en el prompt (SDK/CLI).
4. **Un producto que combine "ejecuta un spec declarativo" + "modelo por fase" + "gate humano durable".** Cada evaluado tiene una o dos de las tres.

**Qué hay que escribir a mano, y cuánto pesa:**

| Pieza | Tamaño estimado | Por qué no se puede evitar |
|---|---|---|
| Evaluador de expresiones `when` | ~50 líneas | El spec lo pide y lo acota explícitamente (`expression_language`) |
| Cargador de spec + validador de artefactos contra `$defs` | ~120 líneas | Los `output_schema` son la postcondición de cada fase; sin esto no hay transición legítima |
| Driver de fases + journal | ~200 líneas | Es el intérprete. Es la pieza central |
| Validación del `verdict_matrix` | ~30 líneas | La regla no es expresable en JSON Schema y el spec la asigna al orquestador |
| Canal de feedback | ~30 líneas | El `internal_feedback` de `parallel_gen_val` |
| 5 agentes Markdown | ~0 (copiar y pegar `agent-roles.md`) + frontmatter | Los prompts ya existen |
| Integrador de `rollback_monitor` | ~60 líneas | Aritmética contra telemetría, sin LLM |

**Total: aproximadamente 500 líneas más los cinco archivos de agentes.** Nada de eso requiere un framework. Es la confirmación cuantitativa de la recomendación: **el harness es un script, y el valor está en el spec que ya escribiste, no en la plataforma que elijas.**

---

## Fuentes

### Lane A — opencode como harness
- https://opencode.ai/docs/agents/ — frontmatter de agentes, `model`, `temperature`, `steps`, `permission`, `mode`, `hidden`, `permission.task`
- https://opencode.ai/docs/cli/ — `run`, `--format json`, `--agent`, `--model`, `--session`, `--continue`, `--fork`, `--attach`, `stats`, `session`, `models`, variables de entorno
- https://opencode.ai/docs/sdk/ — `session.create`, `session.prompt`, `session.messages`, `event.subscribe`, structured output con `json_schema`
- https://opencode.ai/docs/server/ — endpoints HTTP, `POST /session/:id/message` con `{ agent?, model? }`, `/event` SSE, `/doc` (OpenAPI 3.1)
- https://opencode.ai/docs/plugins/ — lista de eventos y hooks
- https://opencode.ai/docs/permissions/ — `allow | ask | deny`, globs, `--auto`, `external_directory`
- https://opencode.ai/docs/custom-tools/ — `tool()` helper, `context.agent/sessionID/worktree`
- https://opencode.ai/docs/skills/ — descubrimiento de skills
- https://opencode.ai/docs/config/ — `opencode.json`, `$schema`
- https://opencode.ai/docs/github/ — `opencode github install/run`, eventos, `model`/`agent` obligatorios, secretos
- https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts — **la lista canónica de hooks**: `permission.ask`, `tool.execute.before/after`, `chat.message`, `chat.params`, `command.execute.before`, `tool.definition`, …
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/cli/cmd/run.ts — el esquema real de `--format json` (tipos `tool_use`, `step_start`, `step_finish`, `text`, `reasoning`, `error`) y el corte en `session.status == idle`
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/task.ts — `subagent_type`, `task_id`, `background`, `next.model ?? parent.model`, `ctx.ask({ permission: "task" })`
- https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-message.ts — `cost` y `tokens{input,output,reasoning,cache{read,write}}` en el mensaje de asistente
- https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-status-event.ts — **`SessionStatus = idle | retry | busy`**: no hay estado de espera
- https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/event.ts y `/durable-event-manifest.ts` — eventos durables con `{ aggregateID, seq, version }`
- https://github.com/anomalyco/opencode/blob/dev/packages/core/src/session/runner/llm.ts y `packages/opencode/src/session/processor.ts` — `FiberSet.run(toolFibers)` y `concurrency: "unbounded"`: concurrencia real de tool calls
- https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/config/agent.ts — el glob `{agent,agents}/**/*.md` (resuelve la discrepancia entre las dos páginas de docs)

### Lane B — SDKs de agentes
- https://docs.claude.com/en/api/agent-sdk/subagents — `AgentDefinition` con `model`, `tools`, `disallowedTools`, `maxTurns`, `background`; límites de profundidad/concurrencia/presupuesto
- https://docs.claude.com/en/api/agent-sdk/permissions — `canUseTool`, modos, orden de evaluación
- https://docs.claude.com/en/api/agent-sdk/sessions — `continue`/`resume`/`fork`, persistencia en `~/.claude/projects/*.jsonl`, `SessionStore`
- https://docs.claude.com/en/api/agent-sdk/overview — capacidades del SDK
- https://openai.github.io/openai-agents-python/human_in_the_loop/ — `needs_approval`, `RunState`, "Long-running approvals", "Versioning pending tasks"
- https://openai.github.io/openai-agents-python/agents/ — `model` por agente, `output_type`, hooks, handoffs
- https://docs.langchain.com/oss/python/langgraph/interrupts — `interrupt()`, checkpointer, `Command(resume=)`, `resume_map` por `Interrupt.id`, reglas de idempotencia
- https://www.langchain.com/pricing-langgraph-platform — planes LangSmith: Developer $0, Plus $39/seat, Enterprise; LCU $1.50 / LSU $1.00

### Lane C — ejecución durable
- https://docs.dbos.dev/ai/hitl — `DBOS.recv` / `DBOS.send`, `set_event`/`get_event`, inbox de agentes esperando input humano
- https://docs.dbos.dev/architecture — Postgres como único requisito, recovery por checkpoint, patching vs versioning, Conductor opcional
- https://docs.restate.dev/ai/patterns/human-in-the-loop — awakeables, suspensión sin billing ocioso, `orTimeout`
- https://docs.restate.dev/use-cases/ai-agents — recuperación, observabilidad, control de costo y concurrencia
- https://docs.temporal.io/develop/typescript/message-passing — Signals, `wf.condition`, Updates con validators, `Signal-With-Start`
- https://www.inngest.com/docs/reference/functions/step-wait-for-event — `step.waitForEvent` con `timeout`, `match`, `if`
- Prefect / Dagster: **sin verificación primaria** en esta pasada; declarados como descartados sin comparación

### Lane D — routing y contabilidad
- https://docs.litellm.ai/docs/proxy/configs — `model_list`, alias, `fallbacks`, spend tracking
- https://opencode.ai/docs/cli/#auth y /#models — catálogo `models.dev` y `opencode models --refresh`
- Costo/tokens por turno: ver `packages/schema/src/session-message.ts` y `opencode stats` (Lane A)

### Lane E — CI y disparadores no atendidos
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments — required reviewers (máx. 6), wait timer 1–43 200 min (**"Wait time will not count towards your billable time"**), disponibilidad en repos públicos
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments — aprobar/rechazar un job Pending, "Start all waiting jobs"
- https://github.com/anthropics/claude-code-action — acción oficial de Anthropic
- https://opencode.ai/docs/github/ — eventos soportados, secretos, OIDC vs `use_github_token`

### Lane F — mecánica del Validator
- https://stryker-mutator.io/docs/stryker-js/introduction/ — soporte de TS/React/Vue/Svelte, runner de Vitest
- https://stryker-mutator.io/docs/stryker-js/configuration/ — `thresholds.break` → exit code 1; `coverageAnalysis: "perTest"`
- https://playwright.dev/docs/intro — E2E headless
- https://vitest.dev/guide/coverage — cobertura v8/istanbul

### Lane G — harnesses de SDLC agéntico
- https://github.github.com/gh-aw/ y https://github.github.com/gh-aw/reference/compilation-process/ — `gh aw compile`, motores (Copilot/Claude Code/Codex/Gemini/Pi), `safe-outputs`, `max-ai-credits`, OpenCode como motor importado no soportado
- https://github.com/github/spec-kit — Spec Kit: invocación manual de skills en el chat
- https://github.com/bmad-code-org/BMAD-METHOD y https://docs.bmad-method.org/reference/workflow-map/ — 4 fases, `bmad-build-auto`, `bmad-checkpoint-preview`
- https://kiro.dev/docs/crew/features/task-runner/ — Task Runner: descomposición de spec, approval gates, reviewer independiente sobre `git diff`, `running → paused` al reiniciar, lotes paralelos de 3
- Sweep, Devin, Factory.ai, OpenHands, AutoGen/Magentic-One, CrewAI Flows: **no verificados en fuente primaria — omitidos deliberadamente**
