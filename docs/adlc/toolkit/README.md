# ADLC Toolkit

Un kit operativo, visual y agnóstico para adoptar el **Agentic Development Life Cycle (ADLC)**: el modelo de operación para equipos de desarrollo en los que los agentes ejecutan y los humanos gobiernan.

Este toolkit no es documentación teórica. Es un conjunto de guías, plantillas y matrices pensadas para usarse directamente en el trabajo del día a día: en la planificación, en la revisión de un pull request, en la decisión de si algo se despliega o no. Es agnóstico a stack tecnológico, proveedor de nube, lenguaje de programación y herramienta de IA: cada guía describe una práctica y un artefacto, no un producto específico.

## Por qué existe este toolkit

El **Software Development Life Cycle (SDLC)** clásico fue diseñado para un mundo donde el humano era la unidad de ejecución primaria: una persona escribe requerimientos, otra diseña, otra desarrolla, otra prueba, otra despliega. Es un **pipeline**: secuencial, especializado por rol, controlado por gates, pensado para el ritmo humano.

Ese supuesto se rompe cuando la unidad de ejecución primaria es un agente. Un agente puede generar código y tests de forma simultánea. La documentación puede ser un subproducto de la generación, no una tarea posterior. Lo que en SDLC era una cadena de etapas secuenciales, en ADLC se convierte en un **loop**: concurrente, ejecutado por agentes, gobernado por humanos.

ADLC **no es** SDLC con herramientas de IA agregadas encima. Agregar un asistente de código a un flujo de trabajo sin cambiar la estructura de ese flujo es una mejora de productividad, no una transformación. Tampoco es la eliminación del criterio humano: ADLC exige *más* involucramiento humano deliberado, pero reubicado — en las decisiones de mayor orden, en los puntos de gobernanza, en los límites donde la salida del agente se encuentra con la intención de negocio. Y no es una metodología con ceremonias o formatos de ticket prescritos: es una estructura distinta para cómo fluye el trabajo cuando la unidad de ejecución primaria ya no es humana.

### El pipeline de SDLC

```
Requerimientos → Diseño → Desarrollo → Prueba → Despliegue → Mantenimiento
```

Secuencial. Con propietario especialista por etapa. Controlado por gates. Pensado para humanos.

### El loop de ADLC

```
Intent ⇄ Generate ⇄ Validate ⇄ Govern ⇄ Deploy ⇄ Observe
```

Concurrente. Ejecutado por agentes. Gobernado por humanos. Pensado para loops, no para etapas.

Las seis fases no son etapas por las que el trabajo avanza una a la vez. Son **modos** en los que el sistema de entrega opera simultáneamente, con distintos agentes y humanos activos en cada modo en un momento dado.

## Cinco principios estructurales

Estos compromisos son los que distinguen a ADLC de un SDLC acelerado con IA. Una organización que no puede sostener los cinco está operando SDLC con más velocidad, no ADLC:

1. **Concurrencia sobre secuencia** — Generar y validar ocurren al mismo tiempo. Observar alimenta a Intent de forma continua. Cualquier proceso que fuerce a las fases a una secuencia estricta impone lógica de SDLC sobre un sistema ADLC.
2. **Gobernanza sobre ejecución** — El valor humano se concentra en el criterio, no en la ejecución. Redistribuir a las personas liberadas de tareas de ejecución hacia más tareas de ejecución desaprovecha la transformación: la inversión va a la capacidad de gobernanza.
3. **Apuestas sobre requerimientos** — La intención es dirigida por hipótesis. La medida de una buena planificación no es qué tan completa está la especificación, sino qué tan precisa es la pregunta que se está formulando.
4. **Loops sobre gates** — La retroalimentación es continua, no basada en hitos. Un gate detiene el loop para inspeccionarlo; ADLC instrumenta el loop para observarlo en movimiento, con el objetivo de exponer problemas antes de que se conviertan en decisiones tardías.
5. **Señal sobre suposición** — Observar no es opcional. Un sistema que genera sin observar compone sus propios supuestos a la velocidad del agente. La señal — de usuarios, sistemas y mercado — es lo que separa a una organización que aprende de una que solo se mueve rápido.

## Mapa de directorios

El toolkit se organiza de forma modular y autocontenida:

```
Proyectos/ADLC-Toolkit/
├── README.md                          # Este índice: visión, mapa, matriz de fases, adopción progresiva.
├── 01-Fundamentos-y-Manifiesto.md     # Manifiesto desglosado, 6 fases, 5 principios y tabla comparativa SDLC vs ADLC.
├── 02-Infografias-y-Diagramas.md      # Infografías en Mermaid (Pipeline vs Loop, Matriz Agente/Humano, Ciclo Bet).
├── 03-Plantillas-Operativas/
│   ├── bet-register-template.md       # Plantilla de registro de apuestas (reemplazo de tickets/historias tradicionales).
│   ├── governance-rubric.md           # Rúbrica y protocolo formal para decisiones humanas de gobernanza.
│   └── validation-debt-tracker.md     # Matriz para auditar y mitigar la deuda de validación agéntica.
└── 04-MVP-Agentic-Loop/
    ├── README.md                      # Guía del MVP agnóstico y orquestación del loop.
    ├── agent-roles.md                 # Contratos y system prompts para los 5 roles: Architect, Generator, Validator, Human Governor Interface y Deploy & Observe Agent.
    └── workflow-spec.json             # Especificación ejecutable de la máquina de estados del loop ADLC.
```

Cada carpeta de fase sigue el mismo contrato: una guía operativa (qué se hace, quién decide qué, qué falla si no se hace) y, cuando la fase produce un artefacto formal, una plantilla lista para copiar y usar. La numeración de las carpetas (`01` a `06`) refleja el orden en que se suele presentar el modelo, no un orden de ejecución obligatorio — recordá que en ADLC las fases corren en modo concurrente, no en pipeline.

## Las seis fases

| # | Fase | Capa | Qué reemplaza / qué agrega | Artefacto o riesgo central | Rol del humano | Rol del agente |
|---|------|------|------------------------------|------------------------------|-----------------|-----------------|
| 01 | **Intent** | Capa de hipótesis | Reemplaza los requerimientos por apuestas | **Bet Register**: portafolio de hipótesis activas, cada una con objetivo de aprendizaje, objetivo de generación, señal de resolución y fecha límite de decisión | Formula la pregunta precisa que aún no sabe responder | Ayuda a explorar el espacio de la pregunta antes de comprometerse con una solución |
| 02 | **Generate** | Capa de creación | Los agentes ejecutan; los arquitectos gobiernan | Superficie completa de artefactos (código, tests, documentación, migraciones, configuración de despliegue) generada en paralelo, no en serie | Provee contexto de intención preciso y define los límites de la generación | Ejecuta generación paralela sobre toda la superficie del artefacto |
| 03 | **Validate** | Capa de verificación continua | La validación corre en paralelo a la generación, no después | **Validation Debt**: apuestas prototipadas pero nunca validadas contra señal real — invisible, acumulativa, oculta detrás de la apariencia de velocidad | Define qué señal real resuelve la apuesta | Genera cobertura de pruebas junto con el código, identifica bordes y regresiones antes de la revisión humana |
| 04 | **Govern** | Capa de criterio humano | La fase que ADLC agrega a SDLC, no la que reemplaza | Decisión de alineación: ¿esta salida sirve a la intención? ¿la señal sostiene avanzar esta apuesta? | Sostiene la responsabilidad que el agente no puede sostener: tradeoffs estratégicos, riesgo relacional, timing de mercado, apetito organizacional por el fallo | Expone el output y la señal de forma legible para que el humano pueda decidir |
| 05 | **Deploy** | Capa de release | Orquestación agenciada; aprobación humana | **Risk Envelope**: qué porcentaje de tráfico dispara una decisión de rollout completo, qué señales disparan un rollback automático | Define los límites del Risk Envelope una sola vez, no despliegue por despliegue | Orquesta feature flags, canary releases, triggers de rollback y promoción de entornos dentro de esos límites |
| 06 | **Observe** | Capa de señal | Cierra el loop; hace que ADLC sea recursivo | Hipótesis nuevas que realimentan al **Bet Register** de Intent | Gobierna la interpretación de la señal | Monitorea comportamiento, analiza uso, detecta anomalías y genera hipótesis de forma continua |

Dos fases no son un punto de la secuencia sino un estado permanente: **Validate** corre desde el momento en que una apuesta entra al loop, no después de generar. **Observe** no depende de ninguna otra fase — corre en paralelo a todas, todo el tiempo, y es la que determina qué apuestas se resuelven, cuáles necesitan iteración y qué apuestas nuevas debería contener el próximo ciclo de Intent.

## Cómo adoptar el kit progresivamente

Adoptar ADLC no es un cambio de herramientas, es un cambio de dónde vive el criterio humano en el sistema de entrega. Por eso la adopción funciona mejor incremental, empezando por la fase donde el equipo ya siente más dolor, y expandiendo desde ahí. Tres niveles de madurez:

**Nivel 1 — Instrumentar una fase.** Elegí la fase donde hoy hay más fricción o más riesgo invisible (para la mayoría de los equipos es Validate o Govern) y adoptá solo esa guía y su plantilla. No hace falta rediseñar todo el flujo de entrega para empezar a escribir un Bet Register en la próxima iteración, o para definir explícitamente un Risk Envelope antes del próximo despliegue. El objetivo de este nivel es que el equipo experimente el vocabulario y los artefactos en un caso real y chico.

**Nivel 2 — Cerrar el loop de una feature.** Tomá una sola feature o iniciativa y llevala por las seis fases con sus artefactos: una entrada en el Bet Register en Intent, generación paralela documentada en Generate, señal real (no solo cobertura de tests) en Validate, una decisión de Govern explícita y registrada, un Risk Envelope definido antes de Deploy, y señal de Observe que se vuelque de nuevo al Bet Register. Este nivel prueba que el loop cierra de punta a punta, no solo que cada fase funciona por separado.

**Nivel 3 — Operar en modo loop.** Varias iniciativas conviven en el Bet Register al mismo tiempo, con distintos agentes y humanos activos en distintas fases en simultáneo. La cadencia de las decisiones de Govern — no la cadencia de sprints o releases — es lo que determina la velocidad de entrega. Este es el punto en el que un equipo deja de operar "SDLC acelerado con IA" y empieza a operar ADLC de verdad, sostenido en los cinco principios de la sección anterior.

No hay un orden obligatorio de fases para empezar el Nivel 1, pero sí hay una señal de que la adopción está madurando: cuando el equipo empieza a hablar de apuestas y de Validation Debt en lugar de tickets y de bugs, el modelo ya se instaló en el vocabulario, que es la primera condición para que se instale en la práctica.

## Para quién es este toolkit

Te sirve si agentes de IA en tu flujo de entrega ya generan código a un ritmo mayor del que tu proceso de revisión puede sostener, si tu cuello de botella se corrió de la velocidad de desarrollo hacia la calidad de la gobernanza y la claridad de la señal, y si estás dispuesto a rediseñar el modelo de entrega en sí mismo en lugar de buscar solo un pipeline más rápido.

No te sirve todavía si lo que buscás es una mejora de productividad del 20% sobre el flujo actual, o si el rol que le asignás a la IA es el de un autocompletado más inteligente: en ese caso, cualquier guía de este kit va a sentirse como burocracia agregada en lugar de estructura útil, porque el modelo que la sostiene todavía no está en juego.

## Cómo se usa este toolkit

Cada documento del kit está diseñado para ser autocontenido: podés consultar `01-Fundamentos-y-Manifiesto.md` para profundizar en el modelo teórico, `02-Infografias-y-Diagramas.md` para visualizar los flujos, las plantillas en `03-Plantillas-Operativas/` para aplicarlas directamente en tu equipo, o `04-MVP-Agentic-Loop/` para orquestar la ejecución agéntica. Las plantillas y especificaciones están pensadas para adoptarse sin fricción: no dependen de ninguna herramienta, proveedor de nube ni lenguaje en particular — el kit describe prácticas, contratos y artefactos, y el equipo decide con qué tecnología concreta los implementa.
