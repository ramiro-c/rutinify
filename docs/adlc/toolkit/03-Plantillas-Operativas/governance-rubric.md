# 03 · Plantilla Operativa — Rúbrica de Gobernanza Humana

> Esta plantilla operacionaliza la fase **Govern** del ADLC (ver [`01-Fundamentos-y-Manifiesto.md`](../01-Fundamentos-y-Manifiesto.md), sección 3.4, y la máquina de estados del ciclo de vida de una Bet en [`02-Infografias-y-Diagramas.md`](../02-Infografias-y-Diagramas.md), infografía 3). Govern es la fase que ADLC agrega al modelo, no la que le quita al SDLC clásico: es la que **verifica alineación**, no la que verifica calidad técnica. Esta plantilla es el protocolo que un humano sigue en el Govern Gate para tomar esa decisión de alineación de forma explícita, repetible y registrada — en lugar de una aprobación implícita que nadie puede reconstruir después.

## Por qué esta plantilla existe

Cuando Generate y Validate ya produjeron señal real sobre una Bet, queda una pregunta que ningún agente puede responder por diseño: ¿esta salida sirve a la intención que la originó, dado todo lo que pasa fuera del repositorio? Sin un protocolo explícito, esa pregunta tiende a resolverse de dos formas, ambas malas. La primera es que el Govern Gate colapsa en una revisión de código: el humano relee el diff línea por línea, encuentra que el código es correcto, y aprueba — confundiendo la verificación técnica que Validate ya hizo con la decisión de alineación que solo Govern puede tomar. La segunda es que el Govern Gate se convierte en un sello de goma: el humano aprueba por default porque la cola de decisiones pendientes crece más rápido que su capacidad de mirarlas con criterio, y la organización termina desplegando salidas agenciadas sin que nadie haya evaluado de verdad si sirven a la apuesta.

Esta rúbrica existe para que ninguna de las dos cosas pase. Obliga a responder tres preguntas antes de emitir un veredicto —¿esto está alineado con lo que dijimos que íbamos a aprender en Intent?, ¿qué hay fuera del repositorio que el agente no puede ver?, ¿cuánto riesgo estamos dispuestos a asumir y bajo qué límites?— y deja un registro escrito de la respuesta, para que la decisión de Govern se pueda auditar, discutir y aprender de ella tanto como se audita el código que Validate revisó. Un Govern Gate que aprueba por default sin esta disciplina es, en la práctica, la puerta de entrada más común de la **Validation Debt**: cada salida que avanza a Deploy sin que alguien haya verificado de verdad su alineación con la intención original queda indistinguible, en el Bet Register, de una salida genuinamente resuelta — hasta que Observe, meses después, revela que la señal real nunca confirmó nada.

## 1. Manifiesto del Gobernador

Antes de aplicar la rúbrica, hay una distinción que tiene que estar resuelta de antemano: qué inspecciona el humano en el Govern Gate y qué delega por completo al trabajo ya hecho en Generate y Validate. Un Govern Gate que no sostiene esta distinción con disciplina degenera, casi siempre, en una relectura de código con otro nombre.

### Qué inspecciona el humano

El Gobernador (`owner_governor` del Bet Register) inspecciona exclusivamente lo que ningún agente puede evaluar por carecer de acceso a ese contexto o de la autoridad para decidir sobre él:

- **Alineación de intención.** ¿La salida generada responde a la hipótesis declarada en el Bet Register, o el trabajo derivó hacia un problema adyacente, más cómodo de resolver, que nadie decidió perseguir explícitamente? Esta pregunta no se responde leyendo el código: se responde comparando lo que se generó contra el Learning Objective y la Hipótesis tal como se escribieron antes de generar nada.
- **Contexto fuera del repositorio.** Nada en el código, los tests o la señal de Validate puede capturar un cambio de prioridad de negocio, una conversación con un cliente clave, una restricción regulatoria nueva, o una señal de mercado que apareció después de que la Bet entró al Bet Register. El Gobernador es, por definición, la única capa del sistema con visibilidad sobre ese contexto — y su trabajo específico en el Govern Gate es traer esa visibilidad a la decisión.
- **Apetito de riesgo.** Cuánto riesgo tiene sentido asumir con esta Bet en este momento particular no es una propiedad del código ni de la señal técnica: depende de cuántas otras apuestas están en juego simultáneamente, de cuánto margen de error tolera la organización esta semana en particular, y de qué tan reversible es el daño si la Bet resulta un error. Esa evaluación es, en esencia, un juicio de negocio, no una medición.

### Qué delega a los agentes

El Gobernador delega por completo, sin relectura manual equivalente, todo lo que Validate ya cubre de forma continua y con evidencia adjunta:

- **Sintaxis y corrección técnica del código.** Si el código compila, sigue las convenciones del proyecto y no introduce errores evidentes, eso ya fue verificado antes de que la salida llegara al Govern Gate — releerlo línea por línea en Govern es repetir trabajo que Validate ya hizo, no gobernar.
- **Cobertura de tests.** Si Validate reporta qué casos de éxito, bordes y regresiones están cubiertos, el Gobernador confía en ese reporte en lugar de reconstruirlo manualmente. Si la cobertura reportada no alcanza para sostener una decisión de Govern con confianza, la respuesta correcta es devolver la Bet a Validate para ampliar cobertura — no que el Gobernador supla la falta de cobertura con una lectura manual del código.
- **Regresiones.** La detección de que un cambio nuevo no rompe comportamiento existente es responsabilidad de la suite de regresión que corre junto con la generación, no una verificación que el Gobernador repite a mano releyendo el diff contra el comportamiento anterior.
- **Linting y estilo.** Cualquier desviación de convención de código, formato o estilo se resuelve en Validate, de forma automatizada, antes de que la salida llegue al Govern Gate. Si el Gobernador está señalando problemas de estilo en una revisión, es una señal de que la instrumentación de Validate tiene un hueco, no de que el Govern Gate está funcionando como debería.

### La prueba de la distinción

Una forma rápida de auditar si un Govern Gate concreto está sosteniendo esta separación: si la retroalimentación que el Gobernador dio en la última decisión menciona un nombre de variable, una línea específica de código o un caso de test faltante, esa retroalimentación pertenece a Validate, no a Govern, y el gate se corrió de fase sin que nadie lo haya decidido explícitamente. Si la retroalimentación menciona la hipótesis formulada en Intent, un compromiso con un cliente, un límite de riesgo o una prioridad en competencia con otras apuestas, el gate está operando en el nivel para el que existe.

## 2. Rúbrica de 3 Dimensiones

El Gobernador evalúa cada Bet que llega al Govern Gate contra tres dimensiones independientes, cada una con una escala de 1 a 4 y preguntas guía diseñadas para producir evidencia, no solo una impresión. Las tres dimensiones se puntúan por separado — una Bet no promedia sus puntajes en un número único, porque un puntaje bajo en cualquiera de las tres dimensiones puede ser, por sí solo, motivo suficiente para no avanzar, sin importar qué tan bien puntúe en las otras dos.

### Dimensión 1: Alineación con la Intención

Evalúa si la salida generada responde a la hipótesis declarada en el Bet Register, o si el trabajo derivó — con buena intención pero sin decisión explícita — hacia un problema distinto del que la Bet dijo que iba a resolver.

| Puntaje | Nombre | Descripción |
|---|---|---|
| **4** | Alineación total | La superficie generada responde punto por punto a la Hipótesis y al Generation Target declarados. La señal de Validate mide exactamente lo que el Resolution Signal de la Bet dijo que iba a medir, sin sustituciones ni atajos. |
| **3** | Alineación con desvíos menores | El núcleo de la salida responde a la hipótesis, pero hay decisiones de alcance tomadas durante Generate que no estaban en el Generation Target original y que no cambian la naturaleza de lo que se está probando (por ejemplo, una simplificación de UI que no afecta la señal de negocio que la Bet mide). |
| **2** | Deriva de alcance parcial | Parte de la superficie generada resuelve un problema adyacente al declarado, y esa deriva empieza a contaminar la señal: ya no es evidente que confirmar o refutar la hipótesis original siga siendo lo que la señal disponible está midiendo. |
| **1** | Deriva de alcance total | La salida generada responde a un problema distinto del que la Bet declaró, aunque relacionado — Generate resolvió lo que le pareció más urgente o más fácil de resolver, no lo que la Hipótesis pedía. Avanzar esta salida sería resolver una pregunta que nadie hizo formalmente. |

**Preguntas guía:**

1. Si le mostrara la Hipótesis declarada y la salida generada a alguien que no participó de ninguna de las dos, ¿reconocería sin ayuda que una responde a la otra?
2. ¿La señal que Validate está reportando es la misma que el Resolution Signal de la Bet definió, o es una señal distinta que se parece lo suficiente como para pasar sin que nadie lo note?
3. ¿Alguna decisión tomada durante Generate amplió o redujo el Generation Target sin que quedara registrada como una actualización explícita de la Bet?
4. Si la respuesta a la hipótesis resultara negativa con esta salida, ¿esa respuesta negativa sería sobre la pregunta original, o sobre una pregunta distinta que terminó ocupando su lugar?

### Dimensión 2: Contexto Fuera del Repositorio

Evalúa si existe información relevante para esta decisión que vive fuera del repositorio, del Bet Register y de la señal técnica — mercado, regulación, compromisos de negocio ya asumidos, o impacto sobre relaciones con clientes, socios o partes reguladoras — y si esa información ya fue incorporada a la decisión.

| Puntaje | Nombre | Descripción |
|---|---|---|
| **4** | Contexto incorporado y vigente | El Gobernador confirmó activamente, al momento de esta decisión, que no hay cambios de mercado, regulación, compromisos de negocio o relaciones que alteren el valor o el riesgo de avanzar esta Bet desde que se escribió. La confirmación está documentada, no solo asumida. |
| **3** | Contexto revisado con vigencia razonable | El contexto externo se revisó al crear la Bet y no hay señales activas de que haya cambiado, pero no hubo una revisión deliberada al momento de este Govern Gate específico — la ausencia de cambio se asume por defecto, no se verifica. |
| **2** | Contexto desactualizado o incompleto | Existe una señal concreta (una noticia de mercado, un cambio regulatorio anunciado, una escalada de un cliente) de que el contexto externo cambió desde que la Bet se escribió, y esa señal todavía no se evaluó contra la decisión que se está tomando ahora. |
| **1** | Contexto contradictorio no resuelto | Hay evidencia directa de que avanzar esta Bet en su forma actual entra en conflicto con un compromiso de negocio ya asumido, una restricción regulatoria vigente, o el riesgo de daño a una relación con un cliente o socio, y esa contradicción no se abordó antes de llegar a este Govern Gate. |

**Preguntas guía:**

1. ¿Cambió algo en el mercado, la competencia o el comportamiento de los clientes desde `created_date` de la Bet que podría cambiar el valor esperado de esta apuesta?
2. ¿Hay alguna restricción regulatoria, contractual o de cumplimiento — nueva o preexistente — que la superficie generada podría estar tocando sin que quien generó lo supiera?
3. ¿Existe algún compromiso de negocio ya comunicado hacia afuera (a un cliente, un socio, un regulador, otra área de la organización) que esta decisión de avanzar, redirigir o matar afecta directa o indirectamente?
4. Si esta Bet se despliega y algo sale mal, ¿qué relación externa concreta —con qué persona u organización específica— sufre el daño reputacional o de confianza más directo, y ese riesgo se conversó con alguien fuera del equipo de generación antes de esta decisión?

### Dimensión 3: Apetito y Envoltorio de Riesgo (Risk Envelope)

Evalúa si el Risk Envelope propuesto o vigente para esta Bet —blast radius, etapas de canary y triggers de rollback— es proporcional al apetito de riesgo real de la organización para esta apuesta en este momento particular, no solo técnicamente correcto.

| Puntaje | Nombre | Descripción |
|---|---|---|
| **4** | Risk Envelope calibrado y suficiente | El blast radius, las etapas de canary y los triggers de rollback automático están definidos con números concretos, son proporcionales al apetito de riesgo real de la organización para esta Bet específica, y cubren los modos de falla más probables dado lo que se generó. |
| **3** | Risk Envelope definido con holguras aceptables | El Risk Envelope existe y es razonable, pero tiene al menos un parámetro con una holgura mayor a la ideal (por ejemplo, un dwell time de canary más corto de lo que el volumen de tráfico esperado justificaría), sin que eso implique un riesgo que el Gobernador considere inaceptable. |
| **2** | Risk Envelope incompleto | Falta al menos uno de los tres componentes obligatorios (blast radius, etapas de canary, triggers de rollback) o está definido en términos cualitativos ("desplegar con cuidado") en lugar de umbrales cuantificables y verificables. |
| **1** | Risk Envelope ausente o desproporcionado | No hay Risk Envelope definido, o el que se propone expone una porción de usuarios, tráfico o sistemas manifiestamente mayor a la que el apetito de riesgo real de la organización para esta Bet toleraría — incluyendo el caso de una Bet de alto impacto potencial que se propone desplegar sin etapas de canary. |

**Preguntas guía:**

1. Si el peor escenario razonable de esta Bet ocurriera en producción, ¿el blast radius definido garantiza que el daño quede contenido a una porción del sistema que la organización puede absorber sin que se convierta en un incidente mayor?
2. ¿Cada trigger de rollback automático tiene un umbral numérico y una fuente de instrumentación concreta, o alguno todavía depende de que una persona "se dé cuenta" de que algo anda mal?
3. ¿El dwell time de cada etapa de canary es suficiente para que la señal observada en esa etapa sea estadísticamente confiable, o las etapas están dimensionadas por calendario ("un día por etapa") en lugar de por volumen de señal necesario?
4. Dado todo lo que la organización tiene en juego simultáneamente en este momento —otras Bets activas, otros riesgos ya asumidos—, ¿el apetito de riesgo que este Risk Envelope específico asume es mayor, menor o igual al que el Gobernador aceptaría si tuviera que justificarlo por escrito a alguien fuera del equipo?

## 3. Matriz de Veredictos Formales

El Govern Gate no admite un veredicto implícito ni un silencio que se interpreta como aprobación. Cada decisión produce exactamente uno de tres veredictos formales, y cada veredicto tiene una acción concreta asociada — no es una etiqueta descriptiva, es una instrucción operativa sobre qué pasa a continuación con la Bet.

| Veredicto | Cuándo aplica | Qué implica operativamente |
|---|---|---|
| **`ADVANCE`** | Las tres dimensiones puntúan 3 o 4, y ninguna puntúa 1. El Risk Envelope está definido con suficiencia (Dimensión 3 en 3 o 4). | La Bet pasa a `calibrating` en el Bet Register. Deploy inicia el despliegue canary dentro del Risk Envelope acordado en esta misma decisión, sin requerir una aprobación humana adicional en cada etapa del canary — la aprobación ya ocurrió acá, de una sola vez, para todo el rollout. |
| **`REDIRECT`** | Al menos una dimensión puntúa 2, o el conjunto de las tres deja dudas razonables sobre si avanzar es prudente, pero la hipótesis original todavía parece valiosa de resolver. | La Bet vuelve a `Hypothesis Draft` en el Bet Register (no a `Parallel Gen/Val` directamente). El Gobernador registra contexto explícito y específico sobre qué corregir — qué se desalineó, qué contexto externo faltaba, qué falta en el Risk Envelope — y ese contexto se entrega al loop agéntico como input para la siguiente iteración de generación. El Gobernador **no reescribe código a mano** para corregir el problema: la corrección la produce el ciclo de Generate/Validate siguiente, informado por el contexto que Govern acaba de aportar. Reescribir a mano sería el humano ejecutando en lugar de gobernando — exactamente la inversión de rol que ADLC busca evitar. |
| **`KILL`** | Al menos una dimensión puntúa 1, o el contexto fuera del repositorio (Dimensión 2) revela que la hipótesis ya no vale la pena perseguir sin importar qué tan bien ejecutada esté la salida. | La Bet pasa a `killed` en el Bet Register de forma definitiva — no vuelve a `Hypothesis Draft`. El aprendizaje se archiva con un enlace directo a la entrada del Bet Register: qué se aprendió al matar esta Bet, y por qué ese aprendizaje no amerita una nueva iteración de la misma hipótesis en el corto plazo. `KILL` es una decisión de gobernanza, no un fallo del equipo de generación: una Bet bien formulada que se mata con esta rúbrica es, en sí misma, la rúbrica funcionando como debería. |

### Por qué no existe un cuarto veredicto

Es tentador agregar un veredicto intermedio como "aprobado con observaciones menores" para las situaciones ambiguas. Esta rúbrica lo excluye deliberadamente: un veredicto ambiguo es exactamente el mecanismo por el cual un Govern Gate colapsa en sello de goma, porque "con observaciones menores" tiende a interpretarse, en la práctica, como aprobación sin condiciones reales de seguimiento. Si una Bet tiene un problema real pero acotado, la decisión correcta es `REDIRECT` con contexto específico sobre ese problema puntual — no un `ADVANCE` con una nota al margen que nadie va a verificar después.

### Relación con la máquina de estados del Bet Register

Esta matriz de veredictos es la implementación operativa de las dos transiciones que salen de `Govern Gate` en la máquina de estados descripta en `02-Infografias-y-Diagramas.md` (infografía 3): `ADVANCE` corresponde a la transición `GovernGate --> CanaryDeploy`, y `REDIRECT` y `KILL` corresponden ambas a la transición `GovernGate --> Redirect`, con la distinción de que esta rúbrica separa esa transición única del diagrama en dos veredictos formales distintos porque, en la práctica operativa, "volver a intentarlo" y "abandonar la apuesta" requieren protocolos, registros y consecuencias completamente distintos para `owner_governor` y para el Bet Register, aunque ambos compartan el mismo nodo de destino en el diagrama de estados.

Govern no es el único punto de la máquina de estados donde se decide `REDIRECT` o algo equivalente: `Continuous Observe` es el segundo punto de bifurcación, y puede devolver una Bet a `Redirect` incluso después de un `ADVANCE` de Govern, cuando la señal real de producción —no la señal técnica de Validate— revela que la hipótesis todavía no está confirmada. Esta rúbrica gobierna específicamente la primera bifurcación; la segunda, la que ocurre dentro de Observe, usa la misma lógica de veredictos (`REDIRECT` o cierre como `Resolved`) pero está fuera del alcance de este documento porque su input es señal de uso real, no una decisión de alineación previa al despliegue.

## 4. Governance Decision Record (GDR)

Cada paso por el Govern Gate produce un GDR: un registro escrito, fechado y enlazado a la entrada correspondiente del Bet Register, que documenta la puntuación de las tres dimensiones, el veredicto emitido y el razonamiento detrás de ambos. El GDR es lo que permite auditar después si el Govern Gate está funcionando como gobernanza real o como aprobación de trámite — una Bet con un veredicto `ADVANCE` sin GDR asociado es indistinguible, en el registro histórico, de una Bet que nunca pasó por el Govern Gate en absoluto.

### Plantilla en blanco (copiar y completar)

```yaml
---
gdr_id: <identificador único, ej. GDR-2026-031>
bet_id: <id de la Bet en el Bet Register a la que corresponde este GDR>
governor: <nombre o rol humano que emite este veredicto>
decision_date: <YYYY-MM-DD>
verdict: <ADVANCE | REDIRECT | KILL>
---
```

```markdown
## Dimensión 1: Alineación con la Intención

**Puntaje:** <1-4>

<Respuesta a las cuatro preguntas guía, con evidencia concreta citada de la
Hipótesis, el Generation Target y la señal de Validate — no una impresión
general.>

## Dimensión 2: Contexto Fuera del Repositorio

**Puntaje:** <1-4>

<Qué se revisó específicamente de mercado, regulación, compromisos de
negocio o relaciones, y qué se concluyó de esa revisión.>

## Dimensión 3: Apetito y Envoltorio de Riesgo

**Puntaje:** <1-4>

<Evaluación del Risk Envelope propuesto o vigente contra el apetito de
riesgo real de la organización para esta Bet en este momento.>

## Veredicto: <ADVANCE | REDIRECT | KILL>

<Razonamiento que conecta los tres puntajes con el veredicto emitido. Si el
veredicto es REDIRECT, el contexto explícito que se entrega al loop
agéntico para la siguiente iteración. Si el veredicto es KILL, el
aprendizaje que se archiva y el enlace a la entrada del Bet Register.>

## Próxima acción

<Qué cambia concretamente en el Bet Register como consecuencia de este
GDR: nuevo status, nueva fecha de Decision Deadline si aplica, o cierre
definitivo.>
```

### Ejemplo completo de un GDR

El ejemplo siguiente continúa la Bet `BET-2026-014` documentada en `bet-register-template.md`: el método de pago local por transferencia bancaria instantánea para el segmento sin tarjeta de crédito internacional. Este GDR corresponde al Govern Gate que autorizó el paso de esa Bet de `active` (`Parallel Gen/Val`) a `calibrating` (`Canary Deploy`), es decir, la decisión que definió el Risk Envelope que la propia plantilla de Bet Register ya muestra en su ejemplo completo.

```yaml
---
gdr_id: GDR-2026-031
bet_id: BET-2026-014
governor: "Directora de Producto, Pagos Regionales"
decision_date: 2026-02-17
verdict: ADVANCE
---
```

### Dimensión 1: Alineación con la Intención

**Puntaje:** 4

La superficie generada cubre las cinco capas del Generation Target declarado en la Bet: el módulo de integración con el proveedor de pagos local, la lógica de selección de método de pago condicionada por segmento, la tabla `pagos_transferencia_local` con su plan de reversión, y la configuración del feature flag segmentable por país y ausencia de tarjeta internacional. Ninguna de estas piezas resuelve un problema fuera del alcance declarado: no hay, por ejemplo, una expansión no solicitada a otros métodos de pago o a otros segmentos de usuarios que no estén explícitamente en el Generation Target. La señal que Validate reporta —tasa de conversión del segmento, tasa de abandono en selección de método de pago, tiempo medio de checkout, tasa de error del método nuevo, volumen de órdenes— es exactamente la que el Resolution Signal & Telemetría de la Bet definió por adelantado, sin sustituciones. Cotejé la Hipótesis original contra la salida generada sin participar de la generación, y la correspondencia es directa y verificable punto por punto.

### Dimensión 2: Contexto Fuera del Repositorio

**Puntaje:** 3

Revisé con el equipo legal y con la gerencia comercial regional si hubo cambios normativos o de mercado desde `created_date` (2026-02-03) que afecten esta Bet: no hay cambios regulatorios nuevos sobre medios de pago locales en los mercados objetivo, y no hay compromisos comerciales recientes con proveedores de pago competidores que entren en conflicto con esta integración. No identifiqué ninguna señal de riesgo relacional con clientes o socios asociada específicamente a este lanzamiento. No puntúo esta dimensión en 4 porque la revisión de contexto regulatorio se hizo por confirmación verbal con el área legal, no con un sign-off documentado por escrito — dejo como acción de seguimiento (no bloqueante para este veredicto, dado el bajo riesgo regulatorio identificado) solicitar esa confirmación por escrito antes de la etapa de canary al 100%.

### Dimensión 3: Apetito y Envoltorio de Riesgo

**Puntaje:** 4

El Risk Envelope definido en la Bet es proporcional al riesgo real: el blast radius está acotado por una condición de segmento evaluada en el servidor (no en el cliente), lo cual elimina el riesgo de exposición accidental fuera del segmento objetivo aunque el feature flag se active globalmente por error. Las tres etapas de canary (5% con gate de error ≤3%, 25% con gate de degradación de checkout ≤30%, 100% con la ventana de medición completa) tienen dwell times mínimos explícitos y gates de avance cuantificables, no calendario fijo. Los cuatro triggers de rollback automático cubren los modos de falla más probables de una integración de pagos nueva — error/timeout del método, doble cobro, degradación de tiempo de checkout, y degradación agregada del servicio de checkout completo — con umbrales numéricos verificables por instrumentación existente, sin depender de que una persona note el problema manualmente.

### Veredicto: ADVANCE

Las tres dimensiones puntúan 3 o 4, sin ningún puntaje en 1 o 2. La Bet está alineada con su Hipótesis original sin deriva de alcance, el contexto externo revisado no presenta contradicciones que ameriten pausar, y el Risk Envelope está calibrado con umbrales cuantificables y proporcionales al riesgo real de una integración de pagos nueva expuesta a un segmento acotado. Autorizo el paso de `BET-2026-014` a `calibrating` y el inicio del despliegue canary bajo el Risk Envelope documentado en la propia entrada del Bet Register, sin requerir una aprobación humana adicional en cada etapa del canary — las tres etapas y sus cuatro triggers de rollback ya están decididos con este GDR.

### Próxima acción

`BET-2026-014` cambia de `status: active` a `status: calibrating` en el Bet Register. Deploy inicia la etapa 1 del canary (5% del segmento, 48 horas mínimas) de inmediato. La `deadline` de la Bet (2026-03-17) se mantiene sin cambios. Queda registrada como acción de seguimiento no bloqueante: obtener confirmación regulatoria por escrito del área legal antes de que el canary avance a la etapa de 100% del segmento.

## Cómo se relaciona con el resto del toolkit

Esta plantilla es el protocolo formal de la fase Govern descripta en `01-Fundamentos-y-Manifiesto.md` (sección 3.4) y visualizada en la infografía 2 (matriz de coexistencia Agente/Humano) y la infografía 3 (máquina de estados) de `02-Infografias-y-Diagramas.md`. El Risk Envelope que un GDR con veredicto `ADVANCE` autoriza es el mismo Risk Envelope que `bet-register-template.md` documenta como componente número siete de cada Bet — esta plantilla no define ese componente de nuevo, define el protocolo mediante el cual se decide, con evidencia y en un momento específico, que ese Risk Envelope ya está listo para gobernar Deploy. Una organización que emite veredictos de Govern sin un GDR asociado, o que reduce los tres tipos de veredicto a una aprobación binaria implícita, está operando un gate de SDLC con vocabulario de ADLC encima — exactamente el error de adopción que la sección 5 de `01-Fundamentos-y-Manifiesto.md` describe como la peor combinación posible de los dos modelos.
