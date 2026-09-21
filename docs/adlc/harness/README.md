# Harness ADLC

Ejecutor del loop `Intent ⇄ Generate ⇄ Validate ⇄ Govern ⇄ Deploy ⇄ Observe` definido en
[`../toolkit/04-MVP-Agentic-Loop/workflow-spec.json`](../toolkit/04-MVP-Agentic-Loop/workflow-spec.json).

**El harness no define el loop: lo interpreta.** La fuente de verdad es el spec. Si el driver
y el spec se contradicen, el bug está en el driver. La regla que lo hace verificable: cada
transición pasa por `pickTransition()`, que evalúa los `when` del spec — el driver no tiene
transiciones propias, y si ninguna condición matchea, falla ruidosamente en vez de avanzar.

## El loop en un comando

```bash
cd docs/adlc/harness
npm install                                  # una sola vez (ajv)

node adlc.mjs start BET-2026-001             # corre hasta el próximo punto de pausa
node adlc.mjs status BET-2026-001            # en qué estado está y qué espera
node adlc.mjs resume BET-2026-001            # después de que hiciste tu parte
node adlc.mjs gdr BET-2026-001               # plantilla del GDR a completar
node adlc.mjs log BET-2026-001               # historial con costo por transición
node adlc.mjs observe BET-2026-001 --input medicion.json   # importa una medición real
node adlc.mjs selftest                       # 28 chequeos, sin invocar ningún modelo
```

`start` y `resume` corren hasta que el loop **se estaciona** en un punto donde hace falta una
decisión humana, o hasta un estado terminal. Estacionarse no es un error: sale con código 0.

## Los dos puntos donde te toca a vos

| Cuándo | Qué tenés que hacer |
|---|---|
| Después de Intent | Confirmar el borrador de Bet Register, completar `owner_governor`, `deadline` y el Risk Envelope, y poner `status: active` en el frontmatter de la Bet. |
| Después de Govern | Escribir el GDR en `runs/BET-XXXX-NNN.gdr.json`. Sólo vos podés hacerlo. |

En `govern_gate` el driver **se niega a avanzar** sin un GDR válido, y valida en este orden:
el archivo existe → es JSON → valida contra `$defs.gdr` → `bet_id` coincide →
`governor` coincide con el `owner_governor` de la Bet → el veredicto es coherente con las
puntuaciones (`verdict_matrix`). Los agentes no pueden escribir el GDR: el frontmatter de los
cinco les deniega `edit` sobre `runs/**`.

## Modelo por fase

Cada fase corre con un agente distinto y **el modelo vive en el agente**, no en este driver:
es la única fuente de verdad, y está versionada con el código.

| Fase | Agente | Modelo | Por qué |
|---|---|---|---|
| Intent, Redirect | `adlc-architect` | `opencode-go/glm-5.3` | Razonamiento fuerte: es el único rol que trabaja antes de que exista código. |
| Generate | `adlc-generator` | `opencode-go/muse-spark-1.3-contributor` | Especializado en código: su gemelo gratuito fue el único que completó la tarea real de punta a punta (450s, 8 archivos, `generation_manifest` válido). |
| Validate | `adlc-validator` | `opencode-go/deepseek-v4-pro` | **Familia distinta al Generator a propósito** (`muse-spark` ≠ `deepseek`): dos modelos de la misma familia comparten puntos ciegos, y este rol existe para intentar falsificar. |
| Govern | `adlc-governor-interface` | `opencode-go/glm-5.2` | Empaqueta y redacta; no puntúa ni ejecuta. |
| Deploy, Observe | `adlc-deploy-observe` | `opencode-go/deepseek-v4.1-flash` | Mecánico y repetitivo. |

Los agentes están en `.opencode/agents/adlc-*.md` y su cuerpo es el contrato de
`../toolkit/04-MVP-Agentic-Loop/agent-roles.md` **pegado verbatim**. No se editan a mano:

```bash
node tools/sync-agents.mjs                   # re-extrae los contratos y reescribe los agentes
opencode agent list                          # verifica que cargaron
```

Para cambiar el modelo de una fase, se cambia la tabla en `tools/sync-agents.mjs` y se corre
el sync. Para una prueba puntual, `opencode run --agent adlc-validator --model X` lo pisa sin
tocar el archivo.

## Dónde vive el estado

Todo el estado del loop está en `runs/`, y **se commitea a Git**. Eso es la durabilidad: el
journal sobrevive porque no depende de que un proceso siga vivo. Un gate que dura días no
necesita un proceso esperando — necesita un archivo y un ejecutor que se niegue a avanzar sin él.

```
runs/
  BET-2026-001.json             journal: estado, artefactos, historial con costo
  BET-2026-001.feedback.jsonl   canal Validator → Generator dentro de parallel_gen_val
  BET-2026-001.manifest.json    Manifiesto de Generación
  BET-2026-001.validation.json  reportes del Validator
  BET-2026-001.govern-package.md  paquete de decisión para el Gobernador
  BET-2026-001.gdr.json         GDR — lo escribe SOLO el humano
  BET-2026-001.telemetry.jsonl  mediciones de Observe
  BET-2026-001.observe.json     decisión de cierre — SOLO el humano
  rollback-events.jsonl         disparos y alertas del rollback_monitor
```

## El monitor de rollback no usa un LLM

`rollback_monitor` es aritmética pura sobre el Risk Envelope de la Bet: compara cada
`trigger_rollback` contra la telemetría, dispara `rollback.triggered` si cruza el umbral, y
`rollback.near_threshold` si está dentro del 20% sin cruzarlo. Un monitor de rollback que
depende de un LLM es un monitor que puede alucinar que todo está bien. Cuando una métrica no
se puede evaluar, lo dice en vez de inventar un valor. Tras un rollback, el monitor **no**
reintenta la promoción de etapa: eso requiere un GDR nuevo.

## Limitaciones conocidas (MVP)

- **`parallel_gen_val` lanza dos procesos `opencode run` en paralelo.** Hay un riesgo sin
  verificar de contención sobre la base de sesiones de opencode. Si aparece un fallo de
  locking, corré las rondas de a una y anotalo acá.
- **Una corrida por defecto por rama** (`max_feedback_rounds: 2` en `phases.json`). El
  feedback interno es un ciclo acotado, no un loop infinito.
- **`opencode run --format json` sí trae costo y tokens** (evento `step_finish`), así que el
  journal acumula costo real por transición. `opencode session list` no los trae.
- **Un plugin de Warp inyecta secuencias OSC-777 en stdout** y ensucia el nd-JSON. El parser
  las limpia; si aparece ruido nuevo, el punto de arreglo es `stripOsc()`.
- El driver no reintenta un paso fallido del agente. Falla, y volvés a correr `resume`.

## Cuándo migrar a DBOS

Cuando corran **más de una Bet en paralelo**, cuando un crash a mitad de `parallel_gen_val`
tenga que recuperarse sin intervención, o cuando quieras el inbox del Gobernador como
`DBOS.list_workflows(status="PENDING")`. El `generation_target` de BET-2026-001 ya incluye
Postgres, así que el costo de adopción es una librería, no un servidor.

El detalle de por qué esta arquitectura y no otra está en
[`../HARNESS-RESEARCH.md`](../HARNESS-RESEARCH.md).
