# 03 · Plantilla Operativa — Bet Register

> Esta plantilla operacionaliza la fase **Intent** del ADLC (ver [`01-Fundamentos-y-Manifiesto.md`](../01-Fundamentos-y-Manifiesto.md), sección 3.1, y la máquina de estados del ciclo de vida de una Bet en [`02-Infografias-y-Diagramas.md`](../02-Infografias-y-Diagramas.md), infografía 3). Reemplaza el documento de requerimientos o especificación tradicional por una unidad de trabajo distinta: la **Bet**, una hipótesis explícita con un objetivo de aprendizaje, un objetivo de generación, una señal de resolución definida por adelantado y una fecha límite de decisión. El **Bet Register** es el portafolio de todas las Bets activas de un equipo o iniciativa; esta plantilla es el contrato que cada entrada individual de ese portafolio tiene que cumplir para ser una Bet real y no un ticket disfrazado de hipótesis.

## Por qué esta plantilla existe

Un ticket tradicional ("implementar X") es una afirmación: alguien ya decidió que X es la solución correcta y lo único que falta es ejecutarla. Una Bet es una pregunta con forma de compromiso: "creemos que X va a producir Y, y vamos a saberlo por Z, para tal fecha". Esa diferencia no es cosmética — cambia qué se mide, quién decide y qué pasa cuando la señal real contradice la intuición inicial.

Escribir una Bet completa obliga a responder, antes de generar una sola línea de código, tres preguntas que un ticket tradicional deja implícitas o las posterga indefinidamente:

1. **¿Qué aprendemos si esto funciona, y qué aprendemos si no funciona?** (Learning Objective)
2. **¿Con qué evidencia concreta, medible y acordada de antemano vamos a saber cuál de las dos pasó?** (Resolution Signal & Telemetría)
3. **¿Para cuándo necesitamos esa respuesta, aunque sea parcial?** (Decision Deadline)

Si un equipo no puede responder las tres antes de empezar a generar, lo que tiene no es una Bet: es un ticket con un nombre nuevo, y va a acumular **Validation Debt** con la misma facilidad que un ticket tradicional, solo que con vocabulario de ADLC encima.

## Estructura de una entrada de Bet Register

Cada Bet tiene ocho componentes obligatorios. Los primeros cinco son datos y declaraciones que se escriben una sola vez, al crear la entrada. Los últimos tres —Resolution Signal, Decision Deadline y Risk Envelope— son los que se revisan activamente durante `Parallel Gen/Val`, `Govern Gate`, `Canary Deploy` y `Continuous Observe`, es decir, durante todo el resto del ciclo de vida de la Bet.

### 1. Metadatos (frontmatter)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único y estable de la Bet dentro del Bet Register. Se usa para referenciarla desde pull requests, dashboards de Observe y decisiones de Govern sin ambigüedad. Convención sugerida: `BET-AAAA-NNN` (año + número secuencial). |
| `status` | enum | Estado actual de la Bet dentro de su ciclo de vida. Valores válidos: `draft`, `active`, `governing`, `calibrating`, `resolved`, `killed` (ver la tabla de la sección siguiente para el significado de cada uno). |
| `owner_governor` | string | Persona o rol humano que sostiene la responsabilidad de gobernanza sobre esta Bet: quien define el Risk Envelope, decide en el Govern Gate y responde por la decisión de avanzar, redirigir o matar la apuesta. Siempre un humano, nunca un agente ni un equipo sin nombre propio. |
| `created_date` | fecha (`YYYY-MM-DD`) | Fecha en que la Bet entró formalmente al Bet Register con su hipótesis, objetivo de aprendizaje y señal de resolución ya definidos — no la fecha en que se empezó a conversar sobre la idea. |
| `deadline` | fecha (`YYYY-MM-DD`) | La Decision Deadline (ver punto 6): la fecha en la que `owner_governor` va a tomar una decisión de Govern sobre esta Bet, tenga o no señal suficiente en ese momento. |

`status` mapea a los estados de la máquina de estados de la infografía 3 de `02-Infografias-y-Diagramas.md` de la siguiente manera:

| `status` | Estado del ciclo de vida | Qué está pasando |
|---|---|---|
| `draft` | Hypothesis Draft | La hipótesis, el objetivo de aprendizaje y la señal de resolución están definidos, pero la Bet todavía no entró a generación. |
| `active` | Parallel Gen/Val | Generate y Validate están corriendo en paralelo sobre la superficie completa del Generation Target. |
| `governing` | Govern Gate | La superficie está generada y validada; un humano está evaluando si la salida sirve a la intención y si la señal alcanza para avanzar. |
| `calibrating` | Canary Deploy / Continuous Observe | La Bet ya pasó el Govern Gate, está expuesta a tráfico real dentro de su Risk Envelope, y se está acumulando la señal que va a resolverla. |
| `resolved` | Resolved / Learned | La señal real confirmó o refutó la hipótesis de forma concluyente; la Bet queda cerrada con una respuesta, no solo con un artefacto entregado. |
| `killed` | (no existe en la máquina de estados de la infografía 3; es una resolución operativa terminal introducida por el Bet Register) | Una decisión del Govern Gate o posterior a Observe abandona la apuesta de forma definitiva y archiva el aprendizaje, en lugar de ciclarla de vuelta a `Hypothesis Draft` a través de `Redirect`. A diferencia de `Redirect` —que siempre vuelve a `Hypothesis Draft` para una nueva iteración— `killed` es una decisión de gobernanza humana de no relanzar el ciclo: la hipótesis queda cerrada y documentada como aprendizaje, no reformulada. |

### 2. Declaración de la Hipótesis

Toda Bet se declara con la misma sintaxis de tres partes, sin excepción:

> **Creemos que** [generar X] **provocará** [comportamiento Y], **lo cual sabremos que es cierto cuando observemos** [señal Z].

- **[generar X]** es el Generation Target en una frase: qué se va a construir, no cómo.
- **[comportamiento Y]** es el efecto esperado en el sistema real o en quienes lo usan — nunca "el código funciona" o "los tests pasan", que son verificación técnica, no señal de negocio o de usuario.
- **[señal Z]** es la métrica observable y cuantificable que confirma o refuta [Y]. Si [Z] no se puede medir con la instrumentación que existe hoy o que se va a generar junto con [X], la hipótesis todavía no está lista para entrar al Bet Register.

Una hipótesis que no se puede reformular en esta sintaxis de tres partes —sujeto a generar, efecto esperado, señal que lo confirma— es, con alta probabilidad, un requerimiento disfrazado de hipótesis.

### 3. Learning Objective

La pregunta explícita, de una o dos oraciones, que la Bet existe para responder — no el resultado que se espera, sino la incertidumbre real que motiva generar algo antes de comprometer más inversión. Un buen Learning Objective admite abiertamente que la respuesta podría ir en cualquier dirección; si la respuesta ya se conoce con certeza antes de generar nada, no hace falta una Bet, hace falta ejecutar.

### 4. Generation Target

La superficie completa y concurrente de artefactos que Generate tiene que producir en paralelo para que Validate pueda medir señal real sobre ella. Una Bet bien definida especifica el Generation Target a través de sus cinco superficies típicas, aunque no todas apliquen en cada caso:

- **Código de dominio**: la lógica funcional que implementa [X].
- **Tests**: cobertura automatizada generada junto con el código, no después — casos de éxito, bordes y regresiones.
- **Documentación**: el subproducto de la generación que explica qué se construyó y por qué, dirigido a quien va a operar, soportar o extender el artefacto.
- **Schema / migraciones**: cualquier cambio a la estructura de datos persistente que [X] requiere, incluyendo su plan de reversión.
- **Configuración de despliegue**: feature flags, configuración de canary, variables de entorno y cualquier otro artefacto necesario para exponer [X] de forma controlada.

### 5. Resolution Signal & Telemetría

La lista concreta de métricas que, en conjunto, confirman o refutan la hipótesis. Cada métrica de esta lista tiene que cumplir tres condiciones para ser válida en una Bet:

1. **Es observable con instrumentación real**, existente o generada como parte del Generation Target — no una métrica que "se podría calcular en teoría".
2. **Tiene un valor de referencia (baseline) y un umbral de éxito explícito**, no solo una dirección ("que mejore") sino una magnitud ("que suba al menos N puntos").
3. **Se puede leer sin interpretación subjetiva** — dos personas distintas mirando el mismo dashboard llegan a la misma lectura de si la señal confirma, refuta o todavía no alcanza.

### 6. Decision Deadline

La fecha límite ineludible en la que `owner_governor` va a tomar una decisión de Govern sobre esta Bet — avanzar, redirigir o matar — independientemente de si la señal acumulada hasta ese momento es completa o parcial. La Decision Deadline no es una estimación de cuánto va a tardar el trabajo: es un límite deliberado para evitar que una Bet quede indefinidamente en `calibrating` acumulando **Validation Debt** bajo la apariencia de "todavía está en observación". Si la señal a la fecha límite es insuficiente para decidir con confianza, la decisión válida es redirigir o matar la Bet, no extender la fecha límite sin una nueva Bet que lo justifique explícitamente.

### 7. Risk Envelope

Los límites, definidos una sola vez por `owner_governor` en el Govern Gate, dentro de los cuales Deploy puede orquestar el release sin requerir una aprobación humana adicional en cada paso. Un Risk Envelope completo especifica tres cosas:

- **Blast radius**: qué porción del universo de usuarios, tráfico o sistemas queda expuesta al cambio, y cómo se delimita (por segmento, por región, por porcentaje de tráfico, por entorno).
- **Etapas de canary rollout**: la secuencia de incrementos de exposición, con el porcentaje o alcance de cada etapa y el tiempo mínimo de permanencia (*dwell time*) en cada una antes de avanzar a la siguiente.
- **Triggers de rollback automático**: las condiciones cuantificables que, si se cumplen en cualquier etapa, disparan una reversión inmediata sin esperar a que un humano lo note y decida manualmente.

## Plantilla en blanco (copiar y completar)

Copiá el bloque siguiente para crear una nueva entrada del Bet Register. Los valores entre `< >` indican qué tipo de contenido va en cada campo; se reemplazan por el contenido real de la Bet, nunca se dejan sin completar antes de que la Bet pase de `draft` a `active`.

```yaml
---
id: <identificador único, ej. BET-2026-014>
status: draft
owner_governor: <nombre o rol humano responsable de gobernar esta Bet>
created_date: <YYYY-MM-DD>
deadline: <YYYY-MM-DD>
---
```

```markdown
## Hipótesis

Creemos que <generar X> provocará <comportamiento Y>, lo cual sabremos que es
cierto cuando observemos <señal Z>.

## Learning Objective

<La pregunta concreta que esta Bet responde, formulada de manera que admita
más de una respuesta posible.>

## Generation Target

- Código de dominio: <qué lógica funcional se genera>
- Tests: <qué casos de éxito, bordes y regresiones cubre>
- Documentación: <qué se documenta y para quién>
- Schema / migraciones: <qué cambio de datos persistente incluye, con plan de reversión>
- Configuración de despliegue: <qué flags, canary config o variables se generan>

## Resolution Signal & Telemetría

| Métrica | Baseline | Umbral de éxito | Fuente de instrumentación |
|---|---|---|---|
| <nombre de la métrica> | <valor actual> | <valor objetivo> | <dónde se mide> |

## Decision Deadline

<YYYY-MM-DD> — <qué decisión se toma en esa fecha y con qué criterio si la
señal es todavía parcial>.

## Risk Envelope

- Blast radius: <qué porción de usuarios/tráfico/sistemas queda expuesta>
- Etapas de canary rollout: <secuencia de porcentajes o alcances, con dwell
  time por etapa>
- Triggers de rollback automático: <condiciones cuantificables que disparan
  reversión inmediata>
```

## Ejemplo completo de una Bet activa

El ejemplo siguiente retoma el caso mencionado en `01-Fundamentos-y-Manifiesto.md` (sección 3.1) — un método de pago local para un segmento sin tarjeta de crédito internacional— y lo desarrolla como una entrada completa y realista del Bet Register, con números concretos y criterios verificables. Es agnóstico a proveedor de pagos, stack tecnológico y nube: cualquier equipo puede sustituir los nombres propios por los de su propio dominio sin cambiar la estructura.

```yaml
---
id: BET-2026-014
status: calibrating
owner_governor: "Directora de Producto, Pagos Regionales"
created_date: 2026-02-03
deadline: 2026-03-17
---
```

### Hipótesis

Creemos que generar un método de pago local por transferencia bancaria instantánea, integrado como opción visible en el checkout, provocará un aumento sostenido en la tasa de conversión del segmento de usuarios sin tarjeta de crédito internacional registrada, lo cual sabremos que es cierto cuando observemos que la tasa de conversión de ese segmento sube de un baseline de 34% a al menos 42%, sostenido en al menos dos de las tres semanas posteriores al lanzamiento del canary al 100% del segmento.

### Learning Objective

¿La ausencia de un método de pago local es la barrera principal de conversión para el segmento sin tarjeta de crédito internacional, o el cuello de botella real está en otro punto del funnel — por ejemplo, en la etapa de verificación de identidad o en la desconfianza de marca al momento de ingresar datos financieros? Esta Bet existe para separar esas dos explicaciones antes de invertir en una expansión más amplia de métodos de pago regionales: si la conversión no sube con un método de pago nuevo disponible, la causa raíz no es la oferta de pago, y perseguir más métodos de pago adicionales sería resolver el síntoma equivocado.

### Generation Target

- **Código de dominio**: módulo de integración con el proveedor de pagos local (creación de orden de transferencia, confirmación asincrónica, manejo de expiración), lógica de selección de método de pago en el checkout condicionada por segmento, y lógica de reconciliación que marca una orden como pagada solo tras confirmación del proveedor.
- **Tests**: casos de éxito de transferencia confirmada, transferencia expirada sin confirmación, timeout de respuesta del proveedor, doble confirmación (idempotencia), y reconciliación de una orden que se cae y se reintenta.
- **Documentación**: guía interna de soporte al cliente para las tres fallas más frecuentes del método (transferencia no reconocida, demora de confirmación, error de monto), y una entrada de FAQ pública para usuarios sobre tiempos de confirmación esperados.
- **Schema / migraciones**: nueva tabla `pagos_transferencia_local` con estado de la orden (`iniciada`, `confirmada`, `expirada`, `revertida`), referencia a la orden de compra, y timestamp de cada transición de estado; migración reversible sin pérdida de datos de órdenes existentes.
- **Configuración de despliegue**: feature flag `checkout.metodo_transferencia_local`, segmentable por país de facturación y ausencia de tarjeta internacional registrada, con configuración de porcentaje de exposición independiente del resto del checkout.

### Resolution Signal & Telemetría

| Métrica | Baseline | Umbral de éxito | Fuente de instrumentación |
|---|---|---|---|
| Tasa de conversión del segmento (checkout completado / checkout iniciado) | 34% | ≥ 42%, sostenido en ≥ 2 de 3 semanas | Dashboard de funnel de checkout, cortado por segmento |
| Tasa de abandono en el paso de selección de método de pago | 41% | ≤ 30% | Eventos de interacción en el paso de checkout |
| Tiempo medio de checkout (inicio a confirmación) | 3m 40s | ≤ 5m 30s (no debe degradarse más de un 50%) | Trazas de duración de sesión de checkout |
| Tasa de error o timeout del método de pago nuevo | — (métrica nueva) | ≤ 3% de las órdenes iniciadas con este método | Logs de integración con el proveedor de pagos |
| Volumen absoluto de órdenes vía el método nuevo | — (métrica nueva) | ≥ 400 órdenes en la ventana de medición (piso mínimo de muestra) | Conteo directo sobre `pagos_transferencia_local` |

El piso mínimo de muestra existe porque un incremento de conversión sobre un volumen insuficiente de órdenes no es señal, es ruido estadístico — la Bet no se puede resolver como confirmada si el volumen absoluto no alcanza ese piso, aunque el porcentaje observado supere el umbral.

### Decision Deadline

**2026-03-17** (seis semanas desde `created_date`, tres semanas desde el inicio del canary al 100% del segmento). En esa fecha, `owner_governor` toma una de tres decisiones con la señal acumulada hasta ese momento: si la tasa de conversión sostuvo ≥ 42% en al menos dos de las tres semanas con volumen de muestra suficiente, la Bet pasa a `resolved` como confirmada y se documenta como precedente para evaluar métodos de pago locales en otros segmentos. Si la conversión se movió pero no alcanzó el umbral, la Bet pasa a `killed` en su forma actual y se abre una Bet nueva en Intent para investigar la etapa de verificación de identidad como hipótesis alternativa — no se extiende esta Bet sin una razón nueva, para no acumular Validation Debt bajo la apariencia de "todavía está en observación". Si la conversión no se movió en absoluto, la Bet pasa a `killed` de forma definitiva: la ausencia de un método de pago local no era la barrera principal, y no se persigue el resto de la iniciativa de pagos regionales sobre esta misma hipótesis.

### Risk Envelope

- **Blast radius**: exclusivamente usuarios cuyo país de facturación está en la lista de mercados objetivo y que no tienen una tarjeta de crédito internacional registrada en su cuenta — nunca el checkout completo, y nunca usuarios fuera del segmento objetivo, incluso si el feature flag se activa globalmente por error de configuración (la condición de segmento se evalúa en el servidor, no en el cliente).
- **Etapas de canary rollout**:
  1. **5% del segmento** durante 48 horas mínimas. Gate de avance: tasa de error del método de pago ≤ 3% y cero incidentes de reconciliación duplicada.
  2. **25% del segmento** durante 72 horas mínimas. Gate de avance: se mantiene el umbral de error de la etapa anterior y el tiempo medio de checkout no se degrada más de un 30% contra el baseline.
  3. **100% del segmento**, con medición de las tres semanas que definen la Resolution Signal a partir de esta etapa.
- **Triggers de rollback automático** (cualquiera de los siguientes revierte el flag a 0% sin intervención humana):
  - Tasa de error o timeout del método de pago nuevo > 8% en una ventana móvil de 2 horas.
  - Más de 5 casos de doble cobro o reconciliación duplicada detectados en 24 horas.
  - Tiempo medio de checkout del segmento se degrada más de un 80% contra el baseline en una ventana móvil de 6 horas.
  - Tasa de fallos o errores de respuesta del sistema en el servicio de checkout (agregada, no solo del método nuevo) sube más de 2 puntos porcentuales respecto de su baseline durante el rollout.

## Cómo se relaciona con el resto del toolkit

Esta plantilla es el artefacto formal de la fase Intent descripta en `01-Fundamentos-y-Manifiesto.md` (sección 3.1) y visualizada en la infografía 1 (`INT["Intent (Bet Register)"]`) y la infografía 3 (máquina de estados) de `02-Infografias-y-Diagramas.md`. El Risk Envelope que se define aquí en el Govern Gate es el mismo Risk Envelope que gobierna la fase Deploy; la Resolution Signal & Telemetría que se define aquí es la que Validate y Observe usan para producir la señal que finalmente resuelve, redirige o mata la Bet. Una Bet que se declara sin volver a completar honestamente estos ocho componentes en cada campo —en particular Resolution Signal y Decision Deadline— es la forma más común en que un equipo termina acumulando Validation Debt mientras cree estar operando Intent.
