# 04 · MVP Agentic Loop — Guía Operativa del Workflow Ejecutable

> Esta guía explica cómo interpretar y ejecutar [`workflow-spec.json`](workflow-spec.json): la especificación declarativa de la máquina de estados del loop `Intent ⇄ Generate ⇄ Validate ⇄ Govern ⇄ Deploy ⇄ Observe`, agnóstica a stack tecnológico, proveedor de nube y herramienta de IA. Donde [`agent-roles.md`](agent-roles.md) define **quién** — qué agente, con qué contrato y qué system prompt — produce y consume cada artefacto, este documento define **cómo se ejecuta el loop completo como proceso**: qué estado sigue a cuál, bajo qué condición, con qué schema de entrada y de salida, y de qué dos formas concretas un equipo puede correrlo hoy — a mano, con agentes en un IDE, o automatizado en un runner.

## Por qué este documento existe

Las tres plantillas de `03-Plantillas-Operativas/` definen qué artefacto gobierna cada fase del loop, y `agent-roles.md` define los cinco contratos de agente que producen y consumen esos artefactos. Ninguno de los dos documentos, sin embargo, responde una pregunta operativa concreta: dado un repositorio real, con un Bet Register real, ¿qué comando se corre, en qué orden, y quién — o qué proceso — decide cuándo una Bet pasa de un estado al siguiente? Un equipo que adopta las plantillas y los cinco roles pero improvisa el "pegamento" entre ellos termina, en la práctica, con cinco agentes bien definidos que nadie coordina de forma consistente: el mismo problema de ambigüedad de fronteras que `agent-roles.md` resuelve entre roles, pero ahora a nivel del proceso completo.

`workflow-spec.json` resuelve esa ambigüedad siendo una fuente única y ejecutable de verdad sobre la forma del loop: ocho estados, sus transiciones, sus condiciones y sus contratos de datos, expresados en un formato que tanto un humano como un script pueden leer sin ambigüedad. Este documento es el manual de esa fuente de verdad: primero explica su estructura interna, después muestra cómo un equipo la usa manualmente con agentes conversacionales en Cursor o Claude Code, y por último muestra cómo automatizarla en un pipeline de CI o en un runner propio — sin asumir en ningún momento un proveedor de nube, un lenguaje de programación o una plataforma de agentes específica.

## 1. Cómo funciona `workflow-spec.json` y cómo interpretarlo

### 1.1 Estructura de alto nivel

El documento tiene siete secciones de nivel superior, en este orden de lectura recomendado:

1. **`terminology`, `roles`, `artifacts`** — el glosario y las referencias cruzadas hacia `01-Fundamentos-y-Manifiesto.md`, `agent-roles.md` y las tres plantillas de `03-Plantillas-Operativas/`. Ningún término ni ningún rol se redefine aquí: el spec apunta a la fuente canónica en lugar de duplicarla, para que una actualización de contrato en `agent-roles.md` no deje al spec desincronizado en silencio.
2. **`$defs`** — los schemas reutilizables de cada artefacto que circula por el loop: una entrada de Bet Register (`bet_register_entry`), un Risk Envelope (`risk_envelope`), un Manifiesto de Generación (`generation_manifest`), un reporte de Validate (`validation_report`), un Governance Decision Record (`gdr`), un reporte de telemetría de Observe (`telemetry_report`) y una decisión de Observe (`observe_decision`). Cada `$def` es un fragmento de JSON Schema (dialecto `2020-12`, declarado en `schema_dialect`) que los `input_schema` y `output_schema` de los estados referencian con `$ref`.
3. **`initial_state` y `final_states`** — toda ejecución del loop para una Bet nueva arranca en `hypothesis_draft`; toda ejecución termina, sin excepción, en `resolved` o en `killed`.
4. **`states`** — el corazón del documento: un objeto con ocho claves, una por estado (`hypothesis_draft`, `parallel_gen_val`, `govern_gate`, `canary_deploy`, `continuous_observe`, `redirect`, `killed`, `resolved`). Cada estado se explica en la sección 1.2.
5. **`monitors`** — procesos de fondo que corren en paralelo a los estados normales, no como parte de la secuencia principal. El MVP define exactamente uno: `rollback_monitor`, explicado en la sección 1.3.
6. **`global_rules`** — cuatro reglas que no pertenecen a ningún estado individual sino al comportamiento del loop completo (política de concurrencia, política de gate humano, política de rollback, y `validation_debt_surface`: cómo cualquier señal de **Validation Debt** que el `validation_report` reporte en `senales_validation_debt` debe volcarse al Semáforo de Riesgo de `validation-debt-tracker.md`, en lugar de quedar aislada dentro del spec).
7. **`expression_language`** — la gramática mínima que necesita soportar cualquier orquestador para evaluar las condiciones (`when`) de las transiciones y de las reglas del monitor. Deliberadamente pequeña: acceso a campos por ruta de punto, los seis comparadores estándar, `in` sobre listas literales, y los conectores `and` / `or` / `not`. No se requiere ningún motor de reglas de terceros — la gramática completa cabe en un evaluador de menos de 50 líneas en cualquier lenguaje, precisamente para no comprometer la neutralidad de stack del toolkit.

### 1.2 Anatomía de un estado

Cada uno de los ocho objetos dentro de `states` sigue la misma forma, y entenderla una vez alcanza para leer los ocho:

| Campo | Qué significa |
|---|---|
| `phase` | A qué fase o fases del loop (`Intent`, `Generate`, `Validate`, `Govern`, `Deploy`, `Observe`) corresponde este estado. `parallel_gen_val` es el único con dos fases simultáneas, porque es el único estado formalmente concurrente. |
| `bet_register_status` | A qué valor del campo `status` de `bet-register-template.md` corresponde este estado. Permite que el Bet Register siga siendo la fuente de verdad legible para humanos, mientras el spec aporta la granularidad ejecutable que ese campo por sí solo no expresa (por ejemplo, `calibrating` cubre tanto `canary_deploy` como `continuous_observe`). |
| `type` | `task` (un agente ejecuta y produce una salida), `concurrent` (varias ramas corren en paralelo dentro del mismo estado), `gate` (requiere un veredicto humano bloqueante antes de continuar), `continuous` (no termina por sí mismo, se bifurca cuando una condición de la señal se cumple), `transitional` (existe solo para reencauzar, nunca para permanecer) o `terminal` (no tiene transiciones salientes). |
| `agent_roles` | Cuáles de los cinco roles de `agent-roles.md` actúan en este estado. Un estado con `agent_roles: []` (`killed`, `resolved`) no requiere ejecutar ningún agente: solo archivar el resultado final. |
| `input_schema` / `output_schema` | Los contratos formales de qué tiene que existir para que el estado empiece a ejecutarse, y qué tiene que producirse para que se considere completo. Son las precondiciones y postcondiciones de `agent-roles.md`, expresadas como JSON Schema en lugar de en prosa. |
| `transitions` | Una lista de posibles movimientos hacia otro estado, cada uno con un evento (`on`), un destino (`to`), una condición (`when`, en el lenguaje de expresiones de la sección 1.1) y una descripción en prosa de por qué existe esa transición. |

Los ocho estados replican exactamente la máquina de estados de `02-Infografias-y-Diagramas.md` (infografía 3): `Hypothesis Draft`, `Parallel Gen/Val`, `Govern Gate`, `Canary Deploy`, `Continuous Observe`, `Redirect` y `Resolved` tienen su contraparte directa (`hypothesis_draft`, `parallel_gen_val`, `govern_gate`, `canary_deploy`, `continuous_observe`, `redirect`, `resolved`); `killed` es la resolución operativa terminal que, según `bet-register-template.md`, no aparece como nodo propio en esa infografía pero sí como valor válido de `status`. El spec no inventa estados nuevos: los hace ejecutables.

### 1.3 Los tres requisitos no negociables del MVP, y dónde viven en el spec

**Concurrencia entre `generate` y `validate`.** Vive en `states.parallel_gen_val.concurrency`. El campo `mode: "parallel"` declara que las dos ramas —`generate` (Generator Agent) y `validate` (Validator Agent)— corren simultáneas sobre la misma superficie de cambio, con un objeto `internal_feedback` que documenta que el Validator reporta fallas al Generator **dentro del mismo estado**, sin disparar ninguna transición, hasta que ambas ramas satisfacen la condición de `join`. La única transición que sale de este estado antes del `join` completo es `generation_target_ambiguo`, reservada para el caso límite en que la ambigüedad no es de código sino de la Bet misma.

**Gate humano bloqueante en `govern`.** Vive en `states.govern_gate.gate`. El campo `kind: "human_judgment"` y `blocking: true` son literales: ningún orquestador que implemente este spec puede sintetizar un `gdr` válido con un agente. El campo `verdict_schema` apunta al `$defs/gdr`, que exige `puntuacion` (las tres dimensiones de `governance-rubric.md`, cada una de 1 a 4) y `veredicto` (`ADVANCE | REDIRECT | KILL`) como campos obligatorios y sin valor por defecto — un GDR sin esos campos completados por el `owner_governor` real de la Bet no es un GDR válido según este schema, es un documento incompleto.

**Reglas de rollback automático en `deploy` ligadas a `observe`.** Viven en el objeto `monitors[0]` (`rollback_monitor`), no dentro de un solo estado, porque el monitor está activo (`active_during_states`) tanto en `canary_deploy` como en `continuous_observe`: la reversión tiene que poder dispararse desde el primer punto de tráfico expuesto, no solo una vez que el estado formal cambió a observación continua. El monitor evalúa `bet.risk_envelope.triggers_rollback` contra cada `telemetry_report` nuevo que produce `continuous_observe`, y su acción (`automatic_rollback`) es, por diseño, la única acción de este MVP que se ejecuta sin ningún gate humano — exactamente como especifica `agent-roles.md` sección 5: "el rollback tiene que ejecutarse sin esperar a que un humano lo note". Lo que sí requiere volver a pasar por `govern_gate` con un GDR nuevo es cualquier intento de reanudar la promoción de etapas después de un rollback, o cualquier cambio al Risk Envelope mismo — eso queda explícito en `resume_condition`.

### 1.4 Los schemas de entrada y salida de cada estado, de un vistazo

| Estado | Input schema (resumen) | Output schema (resumen) |
|---|---|---|
| `hypothesis_draft` | Problema original en texto libre + Bet Register actual + GDR de `REDIRECT` previo, si existe | Una `bet_register_entry` completa con `status: "active"` |
| `parallel_gen_val` | Una `bet_register_entry` con `status: "active"` | `generation_manifest` + `validation_report` |
| `govern_gate` | Bet + `generation_manifest` + `validation_report` + contexto externo adjunto, si el humano lo provee | Un `gdr` completo y válido |
| `canary_deploy` | Bet + `gdr` con `veredicto: "ADVANCE"` | Historial de etapas de canary ejecutadas |
| `continuous_observe` | Bet en `calibrating` | `telemetry_report` periódico |
| `redirect` | Bet + GDR de `REDIRECT` u `observe_decision` de redirect, según de dónde venga | Una `bet_register_entry` reformulada, de vuelta a `status: "draft"` |
| `killed` | Bet + `gdr` con `veredicto: "KILL"` | Registro del aprendizaje archivado |
| `resolved` | Bet + `observe_decision` de `resolved` | Resultado final (`confirmada` / `refutada`) + hipótesis nuevas propuestas para Intent |

Cada fila de esta tabla es un resumen de lectura rápida; el schema completo, con todos los campos obligatorios y sus tipos, está en el `input_schema` y `output_schema` literales de cada estado dentro de `workflow-spec.json`.

## 2. Cómo ejecutar el MVP manualmente con agentes en Cursor o Claude Code

Correr el loop a mano no significa improvisar sobre la marcha: significa usar `workflow-spec.json` como checklist ejecutable y `agent-roles.md` como fuente de los system prompts, con un humano moviendo manualmente a la Bet de un estado al siguiente. Esta sección describe el procedimiento completo, estado por estado, agnóstico a si el agente conversacional es Cursor, Claude Code, o cualquier otro asistente que acepte un system prompt y archivos de contexto.

### 2.1 Preparación: dónde vive cada artefacto

Antes de empezar, un equipo necesita un lugar físico —una carpeta del repositorio, o del vault, según el contexto— donde persistir el estado de cada Bet entre sesiones de agente, porque una conversación con un agente conversacional no sobrevive por sí sola entre una fase y la siguiente. La convención más simple, sin imponer ninguna herramienta:

- `bet-register/BET-AAAA-NNN.md` — la entrada de Bet Register de esa Bet, siguiendo `bet-register-template.md`. Su campo `status` en el frontmatter es, en todo momento, la fuente de verdad legible de en qué estado de `workflow-spec.json` está la Bet (ver la columna `bet_register_status` de la tabla de la sección 1.2).
- `bet-register/BET-AAAA-NNN/generation-manifest.md` — la salida del Generator Agent para esta Bet, cuando exista.
- `bet-register/BET-AAAA-NNN/validation-report.md` — la salida del Validator Agent para esta Bet, cuando exista.
- `bet-register/BET-AAAA-NNN/gdr/GDR-AAAA-NNN.md` — cada GDR emitido para esta Bet, siguiendo la plantilla de `governance-rubric.md` sección 4. Puede haber más de uno por Bet si hubo iteraciones de `Redirect`.
- `bet-register/BET-AAAA-NNN/telemetry/` — los reportes periódicos de `continuous_observe`, uno por fecha o por corte de auditoría.

Ninguno de estos nombres de archivo es obligatorio por el spec: lo obligatorio es que el contenido de cada uno cumpla el `output_schema` del estado que lo produjo, para que el estado siguiente pueda usarlo como su `input_schema` sin adivinar campos faltantes.

### 2.2 Recorrido estado por estado

**`hypothesis_draft`.** Abrí una sesión nueva del agente conversacional y pegá el system prompt completo del Architect / Intent Enframing Agent de `agent-roles.md`, sección 1. Adjuntá el problema original en texto libre y, si existe, el Bet Register actual completo (para que el agente pueda detectar colisiones). El agente devuelve un borrador según el `input_schema` de `hypothesis_draft` en el spec. Un humano —el futuro `owner_governor`— revisa ese borrador contra el `output_schema` del estado (`bet_register_entry` completo): si falta `owner_governor`, `deadline` o cualquier componente del Risk Envelope, el borrador no está listo. Cuando el humano completa y confirma esos campos, la transición `bet_confirmed_by_human` se ejecuta: guardás el archivo con `status: active` y pasás al siguiente estado.

**`parallel_gen_val`.** Abrí dos sesiones de agente en paralelo — literalmente dos pestañas o dos chats simultáneos, no uno después del otro. En la primera, pegá el system prompt del Generator Agent (`agent-roles.md`, sección 2) junto con la `bet_register_entry` completa. En la segunda, pegá el system prompt del Validator Agent (`agent-roles.md`, sección 3) con la misma Bet. A medida que el Generator produce artefactos, compartilos con la sesión del Validator (copiando el código o los archivos generados a su contexto) para que empiece a validar sin esperar una entrega "completa" — esto es, literalmente, lo que hace ejecutable la concurrencia declarada en `concurrency.mode: "parallel"` del spec cuando se opera a mano: dos conversaciones humanas-mediadas corriendo al mismo tiempo, con el humano como el canal que retransmite información entre ellas en ambas direcciones. Cuando el Generator entrega su `generation_manifest` y el Validator entrega su `validation_report` con `reporte_cobertura_hipotesis.brecha_explicita` definido explícitamente (verdadero o falso, nunca ausente), la transición `generation_and_validation_complete` se ejecuta.

**`govern_gate`.** Esta es la única fase donde el agente conversacional no decide nada: abrí una tercera sesión con el system prompt del Human Governor Interface (`agent-roles.md`, sección 4) para que consolide `generation_manifest` y `validation_report` en un paquete legible — pero el veredicto (`ADVANCE`, `REDIRECT` o `KILL`) y la puntuación de las tres dimensiones las escribe el `owner_governor` humano, siguiendo la rúbrica completa de `governance-rubric.md` sección 2, no el agente. El GDR resultante, con la estructura exacta de `agent-roles.md` sección 4, se guarda como archivo y dispara una de las tres transiciones (`gdr_issued`) según su campo `veredicto`, evaluado contra `verdict_matrix` del spec.

**`canary_deploy` y `continuous_observe`.** Con un GDR de `ADVANCE` en mano, abrí una sesión con el system prompt del Deploy & Observe Agent (`agent-roles.md`, sección 5). Como este MVP es agnóstico a infraestructura, la orquestación real de feature flags o despliegues canary corre en las herramientas de infraestructura del equipo (lo que sea que usen para flags, canary y rollback); el rol del agente conversacional en este flujo manual es producir el plan de etapas, verificar que el Risk Envelope está completo antes de autorizar el primer paso de tráfico real, y redactar los `telemetry_report` periódicos a partir de los datos reales que el humano le pegue en el chat (dashboards, logs, métricas de negocio). El `rollback_monitor` del spec, en un flujo manual, se opera como una checklist explícita que el humano corre contra cada `telemetry_report` antes de promover una etapa — no hace falta automatizarlo para empezar, pero sí hace falta correrlo con la misma disciplina que si fuera un proceso automático, porque un trigger de rollback que un humano decide "revisar mañana" ya deja de ser un trigger automático en los hechos.

**`resolved`, `redirect`, `killed`.** Cuando la señal acumulada en `telemetry_report` alcanza el volumen mínimo contra el `resolution_signal` de la Bet — o cuando llega la `deadline` sin señal suficiente —, el `owner_governor` registra un `observe_decision` con el formato del spec y mueve la Bet al estado terminal o de tránsito correspondiente. `redirect` nunca es un estado de descanso: su única acción válida es volver a abrir una sesión con el Architect, con el GDR o el `observe_decision` como contexto adicional, para iniciar inmediatamente una nueva iteración de `hypothesis_draft`.

## 3. Cómo automatizar el loop en CI o en un runner propio

Automatizar no significa eliminar al humano de `govern_gate` — significa que todo lo demás deja de depender de que alguien copie y pegue system prompts entre sesiones. La arquitectura mínima de un runner que implemente `workflow-spec.json` tiene cuatro piezas, ninguna atada a un proveedor específico:

### 3.1 Las cuatro piezas del runner

1. **Un almacén de estado por Bet.** Cualquier lugar donde persistir, por `bet_id`, cuál es el estado actual de la máquina y los artefactos producidos hasta el momento — un archivo en el repositorio (la propia `bet_register_entry` con su `status`, más los artefactos de la sección 2.1), una fila en una base de datos, o un objeto en cualquier almacenamiento clave-valor. El único requisito real es que sea legible tanto por el runner como por un humano que necesite auditar en qué estado está una Bet sin tener que reconstruirlo desde logs.
2. **Un despachador de agentes.** Un componente que, dado el estado actual y su `agent_roles`, invoca al agente correspondiente con el system prompt exacto de `agent-roles.md` y el `input_schema` del estado como contexto — sea vía la CLI de un asistente de código, una llamada a una API de modelo de lenguaje, o un harness de agentes propio. Este componente es intercambiable por diseño: el spec no le exige ningún proveedor, solo que reciba una entrada conforme al `input_schema` del estado y devuelva una salida conforme al `output_schema`.
3. **Un validador de schemas.** Un componente que valida cada salida de agente contra el `output_schema` del estado correspondiente antes de aceptarla como válida para avanzar — usando cualquier librería de validación de JSON Schema del ecosistema que el equipo ya use (hay implementaciones en prácticamente todos los lenguajes de programación mayores). Una salida que no valida no avanza de estado: se devuelve al agente con el error de validación como contexto adicional, de la misma forma en que un humano rechazaría un borrador incompleto en el flujo manual de la sección 2.
4. **Un evaluador de transiciones.** Un componente que, una vez que el `output_schema` de un estado valida correctamente, evalúa cada `when` de las `transitions` de ese estado contra el contexto acumulado (usando la gramática mínima de `expression_language`) y mueve la Bet al primer estado cuya condición se cumple.

### 3.2 El único punto que nunca se automatiza: `govern_gate`

Cualquier runner que implemente este spec tiene que tratar `govern_gate` como un punto de pausa real del pipeline, no como un paso más del despachador de agentes — es la traducción literal de `gate.blocking: true`. En términos de una plataforma de CI genérica, esto se implementa con el mecanismo de aprobación manual que esa plataforma ya ofrece (un ambiente protegido que requiere revisor humano, un paso de aprobación explícito en el pipeline, o un ticket que bloquea la siguiente etapa hasta que se resuelve) — el runner no necesita reinventar ese mecanismo, necesita conectarlo al momento exacto en que la Bet llega a `govern_gate`, y esperar a que el artefacto `gdr` resultante exista y valide contra `$defs/gdr` antes de continuar. El siguiente pseudocódigo, deliberadamente agnóstico a lenguaje y a plataforma de CI, ilustra la forma general del loop completo del runner:

```pseudocode
loop para cada bet_id con status distinto de "resolved" o "killed":
    estado_actual = leer_estado(bet_id)          // desde el almacén de estado
    definicion_estado = workflow_spec.states[estado_actual]

    si definicion_estado.type == "gate":
        si no existe un artefacto "gdr" válido para bet_id en este ciclo:
            marcar_pipeline_en_pausa(bet_id, motivo="esperando GDR humano")
            continuar con el siguiente bet_id      // no se invoca ningún agente acá
        contexto = cargar_gdr(bet_id)

    sino si definicion_estado.type == "concurrent":
        para cada rama en definicion_estado.concurrency.branches en paralelo:
            resultado_rama = despachar_agente(rama.agent_role, definicion_estado.input_schema, bet_id)
            validar_contra_schema(resultado_rama, rama.schema)
        contexto = combinar_resultados_de_ramas()
        si no se cumple definicion_estado.concurrency.join.condition:
            continuar esperando en el mismo estado

    sino:
        resultado = despachar_agente(definicion_estado.agent_roles, definicion_estado.input_schema, bet_id)
        validar_contra_schema(resultado, definicion_estado.output_schema)
        contexto = resultado

    para cada transicion en definicion_estado.transitions:
        si evaluar_expresion(transicion.when, contexto) == verdadero:
            escribir_estado(bet_id, transicion.to)
            emitir_evento(transicion.on, bet_id, contexto)
            romper el bucle de transiciones

para cada monitor en workflow_spec.monitors:
    si estado_actual(bet_id) está en monitor.active_during_states:
        telemetria = obtener_telemetria_mas_reciente(bet_id)
        para cada trigger en bet.risk_envelope.triggers_rollback:
            si evaluar_trigger(trigger, telemetria) == verdadero:
                ejecutar_accion(monitor.on_trigger.action, bet_id, trigger)   // reversión automática, sin gate
                emitir_evento(monitor.on_trigger.emits_event, bet_id)
                notificar(monitor.on_trigger.notifies, bet_id, trigger)
```

Este pseudocódigo no es una implementación de referencia para copiar y pegar: es la forma mínima que cualquier implementación real —en cualquier lenguaje, sobre cualquier plataforma de CI o cualquier runner propio— tiene que respetar para ser fiel al spec. Los tres bloques que nunca cambian de un equipo a otro son el que pausa en el gate sin invocar un agente, el que corre las dos ramas de `parallel_gen_val` en paralelo real y no en serie, y el que evalúa los triggers de rollback sin esperar una aprobación humana adicional — el resto (qué CLI o API se usa para "despachar_agente", dónde se persiste el estado, qué plataforma de CI aloja el pipeline) es, por diseño, una decisión de implementación que cada equipo toma con su propio stack.

### 3.3 Frecuencia de ejecución según el tipo de estado

No todos los estados necesitan la misma cadencia de ejecución del runner, y tratarlos todos igual desperdicia cómputo o introduce latencia innecesaria:

- **Estados de tipo `task`** (`hypothesis_draft`, `canary_deploy`) se disparan por evento: cuando un humano confirma un borrador, o cuando un GDR de `ADVANCE` se guarda. No necesitan un polling periódico.
- **El estado `concurrent`** (`parallel_gen_val`) se beneficia de una cadencia corta (minutos, no horas) mientras hay actividad de generación activa, para que la retroalimentación entre Generator y Validator sea lo más cercana a tiempo real posible — la latencia acá es, literalmente, lo que el principio de Concurrencia sobre Secuencia de `01-Fundamentos-y-Manifiesto.md` pide minimizar.
- **El estado `continuous`** (`continuous_observe`) y el `rollback_monitor` necesitan la cadencia más alta de las tres, acorde a la frecuencia con la que la instrumentación real del equipo emite datos — un rollback que se evalúa una vez por hora contra una ventana de trigger de "2 horas" no está protegiendo lo que el Risk Envelope prometió proteger.
- **El estado `gate`** (`govern_gate`) no tiene cadencia propia: su reloj lo pone el humano, no el runner. El runner solo necesita reaccionar al evento de que el GDR se guardó, sea que eso tarde minutos o días.

## Cómo se relaciona con el resto del toolkit

Este documento y `workflow-spec.json` son el nivel más operativo del toolkit: donde `01-Fundamentos-y-Manifiesto.md` explica el modelo y `02-Infografias-y-Diagramas.md` lo visualiza, `agent-roles.md` lo convierte en cinco contratos de agente y este par de archivos lo convierte en un proceso que corre, a mano o automatizado, sobre cualquier stack. Un equipo que ya tiene su Bet Register en marcha con las plantillas de `03-Plantillas-Operativas/` y los cinco roles de `agent-roles.md` operando con disciplina tiene, con este documento, la última pieza que falta para decir que corre el loop ADLC como un sistema, no como cinco buenas prácticas inconexas: una especificación que un runner puede ejecutar literalmente, y una guía para operarla tanto con agentes conversacionales en un IDE como con infraestructura de automatización propia.
