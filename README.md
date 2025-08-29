# Rutinify

Rutinify es una aplicación web diseñada para simplificar la creación, gestión y seguimiento de rutinas de entrenamiento. La motivación principal es ofrecer una herramienta flexible y fácil de usar para que los entusiastas del fitness puedan planificar sus entrenamientos de manera detallada y seguir su progreso a lo largo del tiempo.

## Funcionalidades Actuales

- **Carga de Rutina desde CSV**: La aplicación carga una rutina inicial desde un archivo `rutina-ejemplo.csv`, soportando una estructura compleja con superseries.
- **Gestión de Días de Entrenamiento**: Visualiza todos los días de tu rutina en tarjetas interactivas. Puedes editar y eliminar días completos.
- **Modo Entrenamiento en Vivo**: Inicia una sesión para cualquier día. La interfaz te guía a través de las superseries y ejercicios.
- **Registro de Progreso**: Anota el peso, las repeticiones y notas específicas para cada serie y ejercicio.
- **Historial Integrado**: La vista de entrenamiento te muestra el rendimiento de la sesión anterior para que puedas enfocarte en la sobrecarga progresiva.
- **Almacenamiento Local**: Todos los datos de la rutina y el historial de sesiones se guardan en el `localStorage` de tu navegador.

## Fases del Proyecto

El desarrollo de Rutinify se divide en varias fases para asegurar una implementación incremental y ordenada.

### Fase 1: MVP y Estructura de Datos (¡Completada!)

En esta fase inicial, nos centramos en las funcionalidades básicas y en una estructura de datos robusta que soporta superseries.

- **Gestión de Rutinas (CRUD)**: Funcionalidad para ver, editar y eliminar días de entrenamiento.
- **Modelo de Datos**: Se definió una estructura de datos clara basada en un CSV, incluyendo conceptos como `Día`, `Superserie`, `Ejercicio`, etc.
- **Carga Inicial**: Implementación de un parser de CSV para popular la aplicación con una rutina existente.

### Fase 2: Ejecución y Seguimiento del Entrenamiento (¡Completada!)

- **Modo "Entrenamiento"**: Una interfaz en vivo para seguir la rutina, anotar el peso y las repeticiones realizadas en cada serie, junto con notas.
- **Historial de Progreso**: Se guarda un registro de cada sesión de entrenamiento completada.
- **Visualización de Datos Anteriores**: La interfaz muestra los datos de la última sesión para cada ejercicio, facilitando la planificación de la progresión.

### Fase 3: Importación y Exportación de Datos (Pendiente)

- **Exportación a CSV**: Permitir la descarga de rutinas y el historial de progreso en formato CSV.
- **Importación desde CSV**: Permitir la creación o actualización de rutinas a partir de un archivo CSV.

### Fase 4: Integración con Google Sheets (Futuro)

- Sincronización de rutinas y progreso con Google Sheets, lo que requerirá autenticación con la API de Google.

### Fase 5: Mejoras de UX y Despliegue (Pendiente)

- **Despliegue**: Publicar la aplicación en una plataforma como Vercel o Netlify.
- **PWA (Progressive Web App)**: Hacer que la aplicación sea instalable en dispositivos móviles.

## Tecnologías Utilizadas

- **React**: Biblioteca principal para la construcción de la interfaz de usuario.
- **Vite**: Herramienta de desarrollo rápida para proyectos de JavaScript modernos.
- **TypeScript**: Para un código más robusto y mantenible.
- **Tailwind CSS**: Framework de CSS para un diseño rápido y personalizable.
- **Radix UI**: Primitivas de UI para construir componentes accesibles y de alta calidad (usado por shadcn/ui).
- **Lucide React**: Librería de íconos.

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

3.  **Ejecuta la aplicación en modo de desarrollo:**

    ```bash
    bun run dev
    ```

4.  Abre tu navegador y visita `http://localhost:5173` (o el puerto que indique Vite).
