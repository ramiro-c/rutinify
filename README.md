# Rutinify

Rutinify es una aplicación web diseñada para simplificar la creación, gestión y seguimiento de rutinas de entrenamiento. La motivación principal es ofrecer una herramienta flexible y fácil de usar para que los entusiastas del fitness puedan planificar sus entrenamientos de manera detallada y seguir su progreso a lo largo del tiempo.

## Funcionalidades Actuales

### 🎯 **Gestión Avanzada de Rutinas**

- **Creación y Eliminación de Rutinas**: Crea nuevas rutinas personalizadas y elimina las que ya no necesites
- **Días Personalizables**: Agrega, edita y elimina días de entrenamiento con nombres personalizados
- **Gestión de Días de Entrenamiento**: Visualiza todos los días de tu rutina en tarjetas interactivas
- **Superseries Flexibles**: Organiza ejercicios en superseries con códigos personalizados

### 💪 **Sistema de Ejercicios Completo**

- **Tres Tipos de Ejercicio**:
  - **Peso x Repeticiones**: Para ejercicios tradicionales de fuerza
  - **Solo Tiempo**: Para ejercicios isométricos o de resistencia
  - **Peso x Tiempo**: Para ejercicios combinados con carga y duración
- **Sets Dinámicos**: Añade, elimina y configura series específicas para cada ejercicio
- **Migración Automática**: Los ejercicios antiguos se migran automáticamente al nuevo sistema

### 🏋️ **Entrenamiento en Vivo**

- **Modo Entrenamiento**: Interfaz especializada para seguir tu rutina en tiempo real
- **Registro Detallado**: Anota peso, repeticiones, duración y notas para cada serie
- **Historial Integrado**: Ve tu rendimiento anterior para cada ejercicio y enfócate en la progresión
- **Notas por Ejercicio**: Registra observaciones específicas durante el entrenamiento

### 🎨 **Experiencia de Usuario**

- **Tema Claro/Oscuro**: Cambia entre temas con persistencia en localStorage
- **Interfaz Responsive**: Diseño adaptable para dispositivos móviles y desktop
- **Formularios Optimizados**: Formularios de creación sin desplazamiento de contenido para mejor UX
- **Estilos de Focus Optimizados**: Elementos interactivos con indicadores visuales sutiles y accesibles
- **Iconografía Consistente**: Icons de Lucide React para una experiencia visual coherente
- **Layout Estable**: Interfaz que mantiene posicionamiento consistente durante interacciones

### ♿ **Accesibilidad**

- **Botones con Etiquetas**: Todos los botones de acción tienen nombres accesibles para screen readers
- **Navegación por Teclado**: Soporte completo para navegación con teclado
- **Indicadores Visuales**: Estados de focus y hover claramente definidos
- **Semántica HTML**: Estructura HTML semánticamente correcta

### 🗄️ **Almacenamiento y Persistencia**

- **LocalStorage**: Todos los datos se guardan localmente en tu navegador
- **Historial de Sesiones**: Registro completo de entrenamientos anteriores
- **Sincronización de Estado**: Estado reactivo que se actualiza automáticamente
- **Carga Inicial desde CSV**: Soporte para cargar rutinas desde archivos CSV

## Fases del Proyecto

El desarrollo de Rutinify se divide en varias fases para asegurar una implementación incremental y ordenada.

### Fase 1: MVP y Estructura de Datos (✅ **Completada**)

En esta fase inicial, nos centramos en las funcionalidades básicas y en una estructura de datos robusta que soporta superseries.

- **Gestión de Rutinas (CRUD)**: Funcionalidad completa para crear, ver, editar y eliminar rutinas y días de entrenamiento
- **Modelo de Datos Avanzado**: Estructura de datos TypeScript robusta con soporte para tres tipos de ejercicios
- **Carga Inicial**: Implementación de parser CSV con migración automática a nuevos formatos
- **Sistema de Ejercicios**: Implementación completa de tipos de ejercicio (reps, time, weight-time)

### Fase 2: Ejecución y Seguimiento del Entrenamiento (✅ **Completada**)

- **Modo "Entrenamiento"**: Interfaz en vivo optimizada para seguir rutinas con soporte multi-tipo
- **Historial de Progreso**: Sistema completo de registro y consulta de sesiones anteriores
- **Visualización de Datos Anteriores**: Comparación automática con entrenamientos previos
- **UX/UI Moderna**: Tema claro/oscuro, responsive design, y accesibilidad mejorada

### Fase 2.5: Optimizaciones y Accesibilidad (✅ **Completada**)

- **Mejoras de Accesibilidad**: Botones con aria-labels, navegación por teclado optimizada
- **SEO Básico**: Meta tags, robots.txt, favicon personalizado
- **Optimización de Focus**: Estilos de focus consistentes y sutiles en toda la aplicación
- **Sincronización de Estado**: Corrección de problemas de estado para actualizaciones en tiempo real

### Fase 3: Importación y Exportación de Datos (🔄 **Pendiente**)

- **Exportación a CSV**: Permitir la descarga de rutinas y el historial de progreso en formato CSV
- **Importación desde CSV**: Permitir la creación o actualización de rutinas a partir de archivos CSV
- **Backup y Restauración**: Sistema de respaldo completo de datos de usuario

### Fase 4: PWA y Despliegue (🔄 **En Progreso**)

- **Progressive Web App**: Hacer que la aplicación sea instalable en dispositivos móviles
- **Service Workers**: Funcionamiento offline y sincronización de datos
- **Despliegue**: Publicación en Vercel con CI/CD automático

### Fase 5: Integraciones Avanzadas (🔮 **Futuro**)

- **Integración con Google Sheets**: Sincronización de rutinas y progreso con Google Sheets
- **Analytics de Progreso**: Gráficos y estadísticas de rendimiento a largo plazo
- **Compartir Rutinas**: Sistema para compartir y importar rutinas de otros usuarios

## Tecnologías Utilizadas

### 🚀 **Frontend Core**

- **React 19**: Biblioteca principal con las últimas características y hooks
- **TypeScript**: Tipado estático para código robusto y mantenible
- **Vite 7**: Herramienta de desarrollo ultrarrápida con HMR

### 🎨 **UI/UX**

- **Tailwind CSS v4**: Framework de CSS moderno con clases utilitarias
- **shadcn/ui**: Componentes de UI accesibles y personalizables
- **Radix UI**: Primitivas headless para componentes complejos
- **Lucide React**: Librería de iconos SVG optimizada
- **class-variance-authority**: Gestión de variantes de componentes

### 🛠️ **Desarrollo**

- **Bun**: Package manager y runtime JavaScript ultrarrápido
- **ESLint**: Linting con configuración moderna para React y TypeScript
- **Prettier**: Formateo automático de código consistente
- **PostCSS**: Procesamiento de CSS con Tailwind

### 🏗️ **Arquitectura**

- **Hooks Personalizados**: `useRoutines`, `useWorkoutHistory`, `useTheme`
- **Context API**: Gestión de estado global para temas
- **LocalStorage**: Persistencia de datos en el navegador
- **Component Composition**: Arquitectura de componentes reutilizables

### ♿ **Accesibilidad y Calidad**

- **ARIA Labels**: Etiquetas accesibles en todos los elementos interactivos
- **Semantic HTML**: Estructura HTML semánticamente correcta
- **Focus Management**: Navegación por teclado optimizada
- **Responsive Design**: Diseño adaptable para todos los dispositivos

## 🔧 Características Técnicas

### **Sistema de Tipos de Ejercicio**

La aplicación soporta tres tipos distintos de ejercicios con interfaces TypeScript específicas:

```typescript
type ExerciseType = 'reps' | 'time' | 'weight-time';

interface RepsSet {
  type: 'reps';
  weight: number;
  reps: number;
}

interface TimeSet {
  type: 'time';
  duration: string; // "2:30" format
}

interface WeightTimeSet {
  type: 'weight-time';
  weight: number;
  duration: string; // "1:15" format
}
```

### **Migración Automática de Datos**

- Sistema automático de migración de ejercicios del formato legacy al nuevo
- Mantiene compatibilidad con datos existentes
- Conversión transparente sin pérdida de información

### **Gestión de Estado Optimizada**

- Hooks personalizados con lógica de negocio encapsulada
- Sincronización automática entre componentes
- Persistencia inteligente en localStorage

### **Mejoras de Performance**

- Componentes optimizados con React 19
- Lazy loading de componentes pesados
- Memoización selectiva para evitar re-renders innecesarios

## 📈 Mejoras Recientes

### **v1.2.0 - Sistema de Ejercicios Avanzado**

- ✅ Implementación completa de tres tipos de ejercicio
- ✅ UI dinámica que se adapta al tipo de ejercicio seleccionado
- ✅ Migración automática de datos legacy
- ✅ Componentes reutilizables para entrada de datos

### **v1.1.0 - Mejoras de UX/UI**

- ✅ Tema claro/oscuro con persistencia
- ✅ Estilos de focus optimizados y consistentes
- ✅ Mejor responsive design
- ✅ Corrección de problemas de sincronización de estado

### **v1.0.5 - Optimizaciones de Accesibilidad**

- ✅ ARIA labels en todos los botones de acción
- ✅ Navegación por teclado mejorada
- ✅ Cumplimiento de estándares WCAG 2.1
- ✅ SEO básico implementado

## 🚀 Cómo Empezar

### **Prerequisitos**

- **Node.js** 18+ o **Bun** (recomendado)
- Navegador moderno con soporte para ES2022+

### **Instalación**

1.  **Clona el repositorio:**

    ```bash
    git clone https://github.com/ramiro-c/rutinify.git
    cd rutinify
    ```

2.  **Instala las dependencias:**

    Con Bun (recomendado para mejor performance):

    ```bash
    bun install
    ```

    O con npm:

    ```bash
    npm install
    ```

3.  **Ejecuta la aplicación en modo de desarrollo:**

    ```bash
    bun run dev
    # o
    npm run dev
    ```

4.  **Abre tu navegador y visita:** `http://localhost:5173`

### **Scripts Disponibles**

```bash
bun run dev      # Servidor de desarrollo
bun run build    # Build de producción
bun run preview  # Preview del build
bun run lint     # Linting con ESLint
bun run format   # Formateo con Prettier
```

### **Primeros Pasos**

1. **Explora la Rutina Ejemplo**: La aplicación viene con una rutina de ejemplo pre-cargada
2. **Crea tu Primera Rutina**: Usa el botón "Añadir Rutina" para crear una rutina personalizada
3. **Agrega Días de Entrenamiento**: Añade días con nombres personalizados
4. **Configura Ejercicios**: Usa el editor para añadir ejercicios con diferentes tipos (peso×reps, tiempo, peso×tiempo)
5. **Inicia un Entrenamiento**: Prueba el modo de entrenamiento en vivo
6. **Revisa tu Progreso**: El historial te mostrará tu rendimiento anterior

### **Estructura del Proyecto**

```
src/
├── components/          # Componentes React reutilizables
│   ├── ui/             # Componentes base de shadcn/ui
│   ├── Layout.tsx      # Layout principal con header
│   ├── RoutineList.tsx # Lista y gestión de rutinas
│   ├── EditDayView.tsx # Editor de días de entrenamiento
│   ├── WorkoutView.tsx # Vista de entrenamiento en vivo
│   └── ExerciseInputs.tsx # Componentes para entrada de ejercicios
├── hooks/              # Hooks personalizados
│   ├── useRoutines.ts  # Gestión de rutinas
│   ├── useWorkoutHistory.ts # Historial de entrenamientos
│   └── useTheme.ts     # Gestión de temas
├── types.ts            # Definiciones TypeScript
├── utils/              # Utilidades y helpers
└── lib/                # Configuraciones y funciones auxiliares
```

## 📝 Historial de Versiones

### **v1.2.1** *(31 de agosto de 2025)*
- **🎨 Mejora de UX**: Optimización de formularios de creación
  - Los formularios "Añadir Rutina" y "Añadir Día" ahora aparecen a nivel global
  - Eliminado el desplazamiento de contenido al mostrar formularios
  - Estilo unificado para ambos botones de agregar (variant ghost)
  - Layout más estable y predecible durante interacciones

### **v1.2.0** *(30 de agosto de 2025)*
- **♿ Accesibilidad**: Mejoras completas de accesibilidad
  - Agregadas etiquetas ARIA a todos los botones de iconos
  - Optimización para lectores de pantalla
- **🌐 SEO**: Optimización para motores de búsqueda
  - Meta descripción y tags HTML apropiados
  - Archivo robots.txt configurado
  - Favicon SVG inline optimizado
- **📚 Documentación**: README completamente reescrito
  - Documentación detallada de funcionalidades
  - Guía de instalación y uso
  - Especificaciones técnicas completas

### **v1.0.0+** *(Desarrollo inicial)*
- Implementación del sistema base de rutinas
- Sistema de ejercicios con múltiples tipos
- Modo de entrenamiento en vivo
- Historial de entrenamientos
- Tema claro/oscuro
- Persistencia en LocalStorage
