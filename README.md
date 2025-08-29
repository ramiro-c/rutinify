# Rutinify

## Motivación

Rutinify es una aplicación web diseñada para simplificar la creación, gestión y seguimiento de rutinas de entrenamiento. La motivación principal es ofrecer una herramienta flexible y fácil de usar para que los entusiastas del fitness puedan planificar sus entrenamientos de manera detallada y, en futuras fases, seguir su progreso a lo largo del tiempo.

## Fases del Proyecto

El desarrollo de Rutinify se divide en varias fases para asegurar una implementación incremental y ordenada.

### Fase 1: MVP (Producto Mínimo Viable) - Funcionalidad Central (¡Completada!)

En esta fase inicial, nos centramos en las funcionalidades básicas de la aplicación.

- **Gestión de Rutinas (CRUD):**
  - **Crear/Editar Rutinas:** Un formulario intuitivo para nombrar una rutina, definir los días de entrenamiento y añadir ejercicios a cada día.
  - **Añadir Ejercicios:** Campos para definir `series`, `repeticiones`, `tempo` y `descanso` para cada ejercicio.
  - **Ver Rutinas:** Una vista principal que lista todas las rutinas guardadas.
- **Almacenamiento Local:** Toda la información se guarda en el `localStorage` del navegador, utilizando una estructura de datos JSON clara.

### Fase 2: Ejecución y Seguimiento del Entrenamiento

- **Modo "Entrenamiento":** Una interfaz en vivo para seguir la rutina, anotar el peso y las repeticiones realizadas en cada serie.
- **Historial de Progreso:** Guardar un registro de cada sesión de entrenamiento completada.

### Fase 3: Importación y Exportación de Datos

- **Exportación a CSV:** Permitir la descarga de rutinas y el historial de progreso en formato CSV.
- **Importación desde CSV:** Permitir la creación o actualización de rutinas a partir de un archivo CSV.

### Fase 4: Integración con Google Sheets (Futuro)

- Sincronización de rutinas y progreso con Google Sheets, lo que requerirá autenticación con la API de Google.

### Fase 5: Mejoras de UX y Despliegue

- **Despliegue:** Publicar la aplicación en una plataforma como Vercel o Netlify.
- **Mejoras de Interfaz:** Refinar el diseño y la experiencia de usuario.
- **PWA (Progressive Web App):** Hacer que la aplicación sea instalable en dispositivos móviles.

## Tecnologías Utilizadas

- **React:** Biblioteca principal para la construcción de la interfaz de usuario.
- **Vite:** Herramienta de desarrollo rápida para proyectos de JavaScript modernos.
- **TypeScript:** Para un código más robusto y mantenible.
- **Material-UI (MUI):** Librería de componentes para una interfaz de usuario limpia y atractiva.

## Cómo Empezar

1.  **Clona el repositorio:**

    ```bash
    git clone <URL-DEL-REPOSITORIO>
    cd rutinify
    ```

2.  **Instala las dependencias:**

    Se recomienda usar `bun` para una instalación más rápida:

    ```bash
    bun install
    ```

    Si prefieres `npm`:

    ```bash
    npm install
    ```

3.  **Ejecuta la aplicación en modo de desarrollo:**

    Con `bun`:

    ```bash
    bun run dev
    ```

    Con `npm`:

    ```bash
    npm run dev
    ```

4.  Abre tu navegador y visita `http://localhost:5173` (o el puerto que indique Vite).