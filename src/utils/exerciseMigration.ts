import { type Exercise, type ExerciseSet, type RepsSet } from '../types';

// Tipo para el ejercicio en formato anterior
interface LegacyExercise {
  id: string;
  name: string;
  series: string;
  reps: string;
  tempo: string;
  supersetCode: string;
  notes?: string;
}

// Función para migrar ejercicios del formato anterior al nuevo
export const migrateExercise = (
  oldExercise: LegacyExercise | Exercise
): Exercise => {
  // Si ya tiene el nuevo formato, devolverlo como está
  if ('sets' in oldExercise && Array.isArray(oldExercise.sets)) {
    return oldExercise as Exercise;
  }

  // Migrar del formato anterior (series, reps strings) al nuevo formato
  const legacyExercise = oldExercise as LegacyExercise;
  const seriesCount = parseInt(legacyExercise.series) || 3;
  const repsCount = parseInt(legacyExercise.reps) || 10;

  // Crear sets basados en las series anteriores
  const sets: ExerciseSet[] = Array.from(
    { length: seriesCount },
    () =>
      ({
        id: crypto.randomUUID(),
        type: 'reps',
        weight: 0,
        reps: repsCount,
        completed: false,
      }) as RepsSet
  );

  return {
    id: legacyExercise.id,
    name: legacyExercise.name,
    type: 'reps', // Por defecto, todos los ejercicios antiguos son de tipo "reps"
    sets,
    tempo: legacyExercise.tempo || '2010',
    supersetCode: legacyExercise.supersetCode || '',
    notes: legacyExercise.notes || '',
  };
};

// Función para crear un nuevo ejercicio vacío
export const createNewExercise = (supersetCode: string): Exercise => ({
  id: crypto.randomUUID(),
  name: 'Nuevo Ejercicio',
  type: 'reps',
  sets: [
    {
      id: crypto.randomUUID(),
      type: 'reps',
      weight: 0,
      reps: 10,
      completed: false,
    } as RepsSet,
  ],
  tempo: '2010',
  supersetCode,
  notes: '',
});
