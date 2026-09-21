# 03 · Plantilla Operativa — Validation Debt Tracker

> Esta plantilla operacionaliza la fase **Validate** del ADLC y su relación continua con **Observe** (ver [`01-Fundamentos-y-Manifiesto.md`](../01-Fundamentos-y-Manifiesto.md), secciones 3.3, 3.6 y 4, y la máquina de estados del ciclo de vida de una Bet en [`02-Infografias-y-Diagramas.md`](../02-Infografias-y-Diagramas.md), infografía 3). La formulación que sigue no es una cita textual sino una síntesis de la premisa central que el manifiesto desarrolla en esos pasajes: la Validation Debt son apuestas prototipadas pero nunca validadas contra señal real — invisible, acumulativa, oculta detrás de la apariencia de velocidad. Esta plantilla es el instrumento de medición y el protocolo de contención que convierten esa premisa en algo auditable en lugar de una advertencia teórica.

## Por qué esta plantilla existe

La deuda técnica clásica tiene una propiedad que la hace manejable: es visible. Vive en el código, cualquiera que lo lea con suficiente atención la encuentra, y un linter, una herramienta de análisis estático o una revisión de arquitectura la puede señalar sin ambigüedad. La Validation Debt no tiene esa propiedad. Vive en la ausencia de una confirmación que nunca ocurrió, y esa ausencia no bloquea nada en el pipeline: el código compila, los tests pasan, el pull request se aprueba, el despliegue sale — y nada en esa secuencia distingue una apuesta que resolvió algo real de una que simplemente dejó de estar en discusión. Un equipo puede tener throughput altísimo, código de excelente calidad técnica y cero deuda técnica tradicional, y acumular Validation Debt a una velocidad enorme, precisamente porque nada en el sistema está comprobando si lo que se genera resuelve algo real.

Esta plantilla existe para hacer visible lo que por diseño no lo es. Convierte la Validation Debt en un número que se puede graficar, en un semáforo que se puede revisar en cada Bet activa, y en un protocolo de contingencia que se dispara automáticamente cuando el número cruza un umbral — en lugar de depender de que alguien "se dé cuenta" de que la organización lleva meses generando output sin saber si sirve. Un equipo que no mide su Validation Debt no tiene menos deuda que uno que sí la mide: tiene la misma deuda, pero además no sabe que la tiene.

## 1. Definición operativa: Deuda de Validación vs. Deuda Técnica clásica

Las dos patologías comparten estructura superficial — ambas son "trabajo que parece terminado pero no lo está" — y por eso es tentador tratarlas con las mismas herramientas. Son, en los hechos, patologías distintas que requieren instrumentación distinta, y confundirlas es la forma más común en que un equipo cree estar gestionando Validation Debt cuando en realidad solo está gestionando calidad de código.

| Criterio | Deuda Técnica clásica | Validation Debt |
|---|---|---|
| **Qué mide** | Calidad estructural del código: legibilidad, acoplamiento, cobertura de tests, adherencia a convenciones | Si una hipótesis del Bet Register tiene señal real de Observe que la confirme o la refute |
| **Dónde vive** | En el artefacto: el código, la arquitectura, el schema — inspeccionable directamente por quien lo lea | En la ausencia de un evento: la falta de una confirmación que debería haber ocurrido después del despliegue |
| **Cómo se detecta** | Inspección de código, análisis estático, revisión de arquitectura, métricas de complejidad ciclomática | Auditoría del Bet Register cruzada contra los dashboards de Observe: ¿qué Bets tienen Resolution Signal con datos reales, y cuáles no? |
| **Quién la genera** | Cualquiera que escriba código bajo presión de tiempo, agente o humano, priorizando que algo funcione sobre que esté bien construido | El sistema completo cuando Generate y Deploy avanzan más rápido que la capacidad de Validate y Observe de producir señal real sobre lo generado |
| **Costo de no pagarla** | El código se vuelve más caro de modificar con el tiempo; el riesgo es operativo y crece de forma gradual y predecible | La organización toma decisiones de negocio — invertir más, expandir un método, escalar una funcionalidad — sobre hipótesis que nunca se confirmaron; el riesgo es estratégico y puede ser súbito |
| **Es visible por defecto** | Sí. Un code review, una herramienta de linting o un tech lead atento la encuentran sin instrumentación adicional | No. Requiere instrumentación deliberada (esta plantilla) porque el pipeline no la señala por sí solo: todo "se ve" como progreso |
| **Relación con la velocidad de generación** | Crece más o menos proporcional al volumen de código escrito bajo presión, independientemente de cuán rápido genere el equipo | Crece de forma desproporcionada cuanto más rápido genera el agente en relación con la capacidad de Validate y Observe de producir señal — es la patología que corresponde específicamente a la generación agenciada, no a la generación humana tradicional |
| **Se paga con** | Refactor, reescritura, mejora incremental de la estructura del código existente | Instrumentación de telemetría, extensión de la ventana de observación, o — si ya no vale la pena esperar más señal — una decisión formal de `KILL` que cierra la apuesta sin fingir que está resuelta |

### Criterios para clasificar una Bet como portadora de Validation Debt

Una Bet acumula Validation Debt cuando se cumple **al menos una** de las siguientes condiciones, con independencia de qué tan bien construido esté el código que la implementa:

1. **Señal ausente en producción.** La Bet está en `calibrating` o posterior, con tráfico real expuesto según su Risk Envelope, pero el Resolution Signal & Telemetría definido en su entrada del Bet Register no tiene ningún dato real registrado — la instrumentación no se desplegó, no se conectó, o nadie la revisó.
2. **Resolución por proxy técnico.** La Bet pasó de `active` a `resolved` o recibió un veredicto `ADVANCE` en Govern basándose únicamente en que "el código compila y los tests pasan", sin que la señal de negocio o de usuario definida en la Hipótesis se haya medido — la verificación técnica de Validate se usó como sustituto de la confirmación real que solo Observe puede aportar.
3. **Estancamiento silencioso.** La Bet permanece en `calibrating` más allá de su `deadline` sin que `owner_governor` haya tomado una decisión formal registrada — la ausencia de decisión se interpreta, por defecto, como permiso para seguir esperando, en lugar de dispararse como un Govern Gate obligatorio.
4. **Superficie fantasma.** El Generation Target de la Bet se desplegó a producción, pero una o más de sus superficies (código de dominio, configuración de despliegue) no emite ningún evento de telemetría — existe en producción pero es invisible para cualquier dashboard de Observe.

## 2. Semáforo de Riesgo por Bet

Cada Bet activa (`active`, `governing` o `calibrating`) se clasifica en uno de tres colores durante cada auditoría periódica. La clasificación es objetiva: se deriva de contar días y puntos de datos, no de una impresión subjetiva de "cómo viene" la apuesta.

| Color | Criterio objetivo | Disparador concreto |
|---|---|---|
| 🟢 **Verde** | La Bet tiene telemetría activa desde el inicio de su exposición a tráfico real, con al menos un punto de dato real por cada métrica del Resolution Signal, dentro del plazo de su `deadline`, y sin ningún trigger de rollback del Risk Envelope disparado. | Ninguno — este es el estado de referencia; no requiere acción de contención. |
| 🟡 **Amarillo** | Se cumple **al menos una** de: (a) la Bet acumula señal real pero el volumen de muestra todavía está por debajo del piso mínimo definido en su Resolution Signal a menos de 7 días de su `deadline`; (b) la Generation-to-Signal Latency de esta Bet específica supera en más de un 50% el umbral de referencia de la sección 3; (c) la Bet está en `governing` hace más de 5 días hábiles sin que se haya programado una fecha de Govern Gate. | Entra automáticamente en la agenda de la próxima auditoría de Govern con prioridad elevada; no dispara el Circuit Breaker por sí sola. |
| 🔴 **Rojo** | Se cumple **al menos una** de: (a) la Bet está en `calibrating` hace más de 14 días con cero puntos de datos reales en cualquiera de las métricas de su Resolution Signal (Ghost Surface a nivel de Bet individual); (b) la `deadline` de la Bet venció hace más de 3 días sin un GDR (Governance Decision Record) que registre una decisión de `ADVANCE`, `REDIRECT` o `KILL`; (c) la Bet fue resuelta como `resolved` en el Bet Register sin ninguna métrica de negocio o de usuario del Resolution Signal, solo con verificación técnica de Validate; (d) la Bet está en `governing` hace más de 10 días hábiles sin fecha de Govern Gate programada (escalación desde 🟡 Amarillo). | Fuerza una revisión de Govern Gate dentro de las siguientes 48 horas, con veredicto obligatorio; contribuye directamente al cómputo agregado que puede disparar el Circuit Breaker (sección 4). |

El semáforo se calcula por Bet, pero su utilidad principal es agregada: la proporción de Bets activas en 🔴 Rojo sobre el total de Bets activas es, junto con el Ghost Surface Ratio, el insumo principal del Circuit Breaker.

## 3. Métricas clave

Las tres métricas siguientes son las que instrumentan Validate y Observe de forma continua, no puntual, sobre el Bet Register completo. Ninguna reemplaza al semáforo de la sección 2 — el semáforo evalúa cada Bet individual, estas métricas evalúan la salud del sistema completo.

### 3.1 Bet Resolution Rate (BRR)

Mide qué proporción de las apuestas que debían resolverse en un período efectivamente llegaron a una decisión real, en lugar de quedar indefinidamente en `calibrating` sin veredicto.

```
BRR = (Bets con status "resolved" o "killed", con GDR asociado,
       cuya deadline cayó dentro del período)
      -----------------------------------------------------------
      (Total de Bets cuya deadline cayó dentro del período)
      × 100
```

Un `killed` con GDR cuenta como resolución para efectos de este cómputo: matar una apuesta a tiempo, con una decisión de gobernanza registrada, es exactamente lo opuesto de acumular Validation Debt. Lo que **no** cuenta como resolución es una Bet cuya `deadline` venció y que simplemente se re-fechó sin un GDR que justifique la extensión — eso es la forma más común de esconder Validation Debt detrás de un cambio de fecha.

| Umbral de referencia | Interpretación |
|---|---|
| BRR ≥ 80% | 🟢 El sistema de decisión está funcionando: la gran mayoría de las apuestas con fecha límite vencida recibieron un veredicto real. |
| 50% ≤ BRR < 80% | 🟡 Hay una acumulación moderada de decisiones pendientes; revisar la agenda de Govern Gate antes de que escale. |
| BRR < 50% | 🔴 La mayoría de las apuestas con fecha límite vencida no recibieron una decisión formal — señal directa de que Govern está funcionando como sello de goma o está sobrecargado, y de que la Validation Debt se está acumulando de forma sistémica. |

### 3.2 Generation-to-Signal Latency (GSL)

Mide cuántos días transcurren entre que una superficie generada llega a producción y el momento en que se registra el primer punto de dato real (no técnico) sobre el Resolution Signal que esa Bet definió.

```
GSL = fecha_del_primer_dato_real_de_negocio_o_usuario
      − fecha_de_despliegue_a_producción_de_la_superficie_generada
      (en días)
```

GSL se calcula por Bet en el momento en que aparece el primer dato real, y se agrega como mediana del período para evaluar la salud del sistema. Una GSL alta no significa necesariamente que algo esté mal con una Bet puntual — algunas hipótesis requieren, por naturaleza, ventanas de observación largas — pero una mediana de GSL que crece sostenidamente período tras período es la señal más temprana de que Validate y Observe se están quedando atrás de la velocidad de Generate.

| Umbral de referencia | Interpretación |
|---|---|
| GSL ≤ 7 días | 🟢 La instrumentación captura señal casi de inmediato; el ciclo de aprendizaje es rápido. |
| 7 < GSL ≤ 21 días | 🟡 Latencia aceptable para hipótesis que requieren volumen de tráfico o ventanas de comportamiento más largas, pero merece revisión si se repite en Bets que no la justifican. |
| GSL > 21 días | 🔴 La brecha entre generar y saber es mayor a tres semanas — en ese lapso, Generate puede haber producido varias superficies nuevas sobre la misma área sin que ninguna de las anteriores haya sido confirmada, componiendo Validation Debt a la velocidad del agente. |

### 3.3 Ghost Surface Ratio (GSR)

Mide qué proporción del volumen de superficie generada y desplegada a producción no emite ningún tipo de telemetría — código, configuración o funcionalidad que existe en el sistema real pero es invisible para cualquier dashboard de Observe.

```
GSR = (Superficie generada y desplegada sin ningún evento de
       telemetría asociado, medida en la unidad que el equipo
       use para dimensionar superficie: módulos, endpoints,
       flujos de usuario o unidades de artefacto equivalentes)
      -----------------------------------------------------------
      (Superficie total generada y desplegada en el mismo período,
       en la misma unidad)
      × 100
```

La unidad de medida se elige una vez por equipo y se mantiene estable entre períodos para que la serie sea comparable; lo que importa no es la unidad específica sino que "sin ningún evento de telemetría asociado" se defina de forma binaria y verificable — no "telemetría insuficiente" o "telemetría parcial", que son juicios subjetivos, sino la ausencia total de cualquier evento medible sobre esa superficie.

| Umbral de referencia | Interpretación |
|---|---|
| GSR ≤ 10% | 🟢 La inmensa mayoría de lo que se genera y despliega queda dentro del campo de visión de Observe. |
| 10% < GSR ≤ 25% | 🟡 Hay una porción no trivial de superficie fantasma; suficiente para justificar una revisión de la disciplina de instrumentación en Generate antes de que crezca. |
| GSR > 25% | 🔴 Más de una cuarta parte de lo que está en producción no emite señal — la organización tiene, literalmente, código que nadie puede confirmar si funciona en el sentido que importa. Este umbral, sostenido, es el disparador principal del Circuit Breaker. |

## 4. Protocolo de contingencia: Circuit Breaker

El Circuit Breaker se activa automáticamente, sin necesidad de una decisión discrecional adicional, cuando se cumple **cualquiera** de las siguientes condiciones en dos auditorías periódicas consecutivas:

- Ghost Surface Ratio agregado > 25%.
- Proporción de Bets activas clasificadas en 🔴 Rojo > 30% del total de Bets activas.
- Bet Resolution Rate < 50% en el período más reciente.

Exigir dos auditorías consecutivas evita que una anomalía puntual (por ejemplo, un lote de Bets con `deadline` coincidente por casualidad en la misma semana) dispare el protocolo completo sin necesidad; sostenerse en dos períodos consecutivos es lo que distingue una anomalía de una tendencia real de acumulación.

### 4.1 Parada de generación (Generation Freeze)

Desde el momento en que se confirma la activación, ningún Bet nuevo puede pasar de `draft` a `active` — Generate no abre nuevas superficies de generación sobre hipótesis nuevas hasta que el Circuit Breaker se levante. Las Bets que ya estaban en `active` al momento de la activación pueden completar el ciclo de generación en curso hasta llegar a `governing`, pero no pueden ampliar su Generation Target original mientras el freeze esté vigente. El freeze no detiene Validate ni Observe — al contrario, es el momento en que ambos concentran toda la capacidad disponible, humana y agenciada, en drenar la deuda acumulada en lugar de seguir compitiendo por atención contra generación nueva.

### 4.2 Purga (Debt Purge)

Toda Bet clasificada en 🔴 Rojo al momento de la activación entra a una purga obligatoria con un plazo fijo: dentro de los 5 días hábiles siguientes, `owner_governor` tiene que emitir un GDR con veredicto formal (`ADVANCE`, `REDIRECT` o `KILL`) para cada una, sin excepción y sin extensión de plazo. No hay una cuarta opción de "seguir observando" — a diferencia del funcionamiento normal del Govern Gate, durante una purga la ausencia de señal suficiente para decidir con confianza es, en sí misma, motivo válido para `KILL`: la purga prioriza cerrar deuda de forma honesta sobre esperar más tiempo a una señal que ya debería haber llegado. Cada Bet purgada como `killed` documenta explícitamente, en su GDR, que la causa fue la activación del Circuit Breaker y no un fallo de la hipótesis en sí — esa distinción importa para no desincentivar hipótesis legítimas que simplemente cayeron en un mal momento de instrumentación.

### 4.3 Reasignación a Validate/Observe

Mientras el freeze esté vigente, la capacidad de generación liberada —tanto agentes como el tiempo humano de gobernanza que ya no se necesita para nuevos Govern Gates de Bets recién iniciadas— se reasigna íntegramente a dos tareas: (a) instrumentar telemetría en las superficies identificadas como Ghost Surface, priorizando por antigüedad en producción; y (b) reducir el backlog de Bets en `governing` que contribuyeron al BRR bajo, para que cada una reciba su veredicto antes de que la purga de la sección 4.2 las alcance por vencimiento de plazo. Ningún agente ni equipo retoma trabajo de Generate sobre una hipótesis nueva hasta que haya contribuido de forma verificable a esta reasignación — el criterio de verificación es la reducción medible del GSR o del número de Bets pendientes de veredicto, no el tiempo dedicado.

### 4.4 Condición de salida

El Circuit Breaker se desactiva cuando las tres métricas vuelven a estar por debajo de su umbral crítico (GSR ≤ 25%, Bets en 🔴 Rojo ≤ 30%, BRR ≥ 50%) sostenido durante dos auditorías periódicas consecutivas — el mismo criterio de doble confirmación que activó el protocolo se aplica simétricamente para desactivarlo, para evitar levantar el freeze prematuramente sobre una mejora puntual que todavía no es una tendencia estable.

## 5. Tabla modelo para auditoría periódica

Esta tabla se completa en cada ciclo de auditoría (se recomienda cadencia semanal o quincenal, alineada con la cadencia de revisión del Bet Register) con una fila por cada Bet en estado `active`, `governing` o `calibrating`. Las filas siguientes son un ejemplo concreto y realista de cómo se ve una auditoría real, con distintos escenarios de riesgo representados a propósito.

| Bet ID | Status | Días en estado actual | GSL (días) | Señal real disponible | Semáforo | Acción recomendada | Responsable | Próxima revisión |
|---|---|---|---|---|---|---|---|---|
| `BET-2026-014` | `calibrating` | 7 | 5 | Parcial — 3 de 5 métricas del Resolution Signal con datos reales; volumen todavía por debajo del piso mínimo (400 órdenes) | 🟡 Amarillo | Mantener en etapa 2 de canary hasta alcanzar piso de muestra; sin acción de Govern adicional mientras quede dentro de plazo de `deadline` (2026-03-17) | Directora de Producto, Pagos Regionales | 2026-03-03 |
| `BET-2026-009` | `resolved` | — | 9 | Completa — las cinco métricas del Resolution Signal alcanzaron umbral con volumen de muestra suficiente, confirmadas por Observe durante tres semanas consecutivas | 🟢 Verde | Ninguna — archivar como precedente confirmado; retroalimenta el Bet Register con una hipótesis de expansión a un segundo segmento | Gerente de Producto, Onboarding | Cerrada |
| `BET-2025-041` | `killed` (vía purga) | 46 antes de la purga | — (sin dato real registrado) | Ninguna — la superficie se desplegó al 100% del tráfico hace 46 días sin ningún evento de telemetría conectado al dashboard de Observe | 🔴 Rojo | Purgada bajo Circuit Breaker: GDR de `KILL` emitido dentro del plazo de 5 días hábiles; se abre ticket de instrumentación retroactiva solo si un stakeholder reclama la funcionalidad, no de forma preventiva | Director de Ingeniería, Plataforma | Cerrada |
| `BET-2026-002` | `governing` | 12 días hábiles sin GDR programado | 4 (de la última generación parcial) | Técnica únicamente — Validate confirmó cobertura de tests, pero no hay dato de negocio ni de usuario todavía | 🔴 Rojo | Forzar Govern Gate dentro de 48 horas; si no hay contexto nuevo que justifique más espera, veredicto por defecto es `REDIRECT` con instrumentación como condición explícita antes de reintentar generación | Líder de Producto, Búsqueda Interna | 2026-02-26 |

### Cómo leer esta tabla en una auditoría real

`BET-2026-014` ilustra el caso más común de una organización con disciplina de Validate razonable: no está en riesgo, pero tampoco está lista para cerrarse — el semáforo Amarillo la mantiene visible sin forzar una decisión prematura. `BET-2026-009` es el resultado que el sistema entero busca producir: una hipótesis que se resolvió con señal real y volumen suficiente, y cuyo cierre alimenta directamente al próximo ciclo de Intent. `BET-2025-041` es el ejemplo canónico de Ghost Surface: superficie generada, desplegada y funcionando desde la perspectiva del código, pero completamente invisible para Observe durante más de un mes y medio — exactamente el escenario que el Circuit Breaker existe para detectar y purgar antes de que se acumulen diez casos similares sin que nadie lo note. `BET-2026-002` muestra la otra forma común de Validation Debt: verificación técnica completa, cero señal de negocio, y una decisión de Govern que se posterga silenciosamente — el disparador de 🔴 Rojo por `governing` sin GDR programado existe precisamente para que este patrón no se confunda con progreso real.

## Cómo se relaciona con el resto del toolkit

Esta plantilla cierra el circuito de instrumentación que `bet-register-template.md` y `governance-rubric.md` abren: el Bet Register declara qué señal resolvería cada hipótesis y `governance-rubric.md` define el protocolo con el que un humano decide sobre esa señal en el Govern Gate, pero ninguna de las dos plantillas, por sí sola, detecta cuándo el sistema completo está acumulando Validation Debt más rápido de lo que la puede drenar. El Ghost Surface Ratio mide directamente la ausencia de la Resolution Signal & Telemetría que `bet-register-template.md` exige como componente número cinco de cada Bet; el Bet Resolution Rate mide si el protocolo de veredictos de `governance-rubric.md` se está ejecutando de verdad o degenerando en Bets que nunca reciben un GDR. Una organización que adopta las tres plantillas de `03-Plantillas-Operativas/` sin nunca ejecutar esta auditoría tiene, en los hechos, todo el vocabulario de ADLC y ninguna de sus defensas contra la patología que el manifiesto identifica como la más grave del modelo — exactamente la combinación que la sección 5 de `01-Fundamentos-y-Manifiesto.md` describe como el mayor riesgo de una adopción superficial.

La sección 4 de [`02-Infografias-y-Diagramas.md`](../02-Infografias-y-Diagramas.md) ("Dinámica Sistémica de la Deuda de Validación / Validation Debt Trap") muestra el mecanismo que esta plantilla existe para detener: un diagrama causal donde Generate acelera, Govern y Validate no escalan al mismo ritmo, la Validation Debt se acumula sin ser vista, y esa acumulación invisible retroalimenta más presión para seguir generando en lugar de pausar a validar — un ciclo que se refuerza a sí mismo. El semáforo de la sección 2, las métricas de la sección 3 y el Circuit Breaker de la sección 4 de este documento son, en conjunto, el instrumento operativo concreto para romper ese loop: convierten cada una de las variables del diagrama causal en un número medible y en un disparador de acción, en lugar de dejar que el ciclo se refuerce sin que nadie lo note hasta que sea demasiado tarde para revertirlo con freeze y purga en vez de con una crisis mayor.
