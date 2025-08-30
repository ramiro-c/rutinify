export interface Exercise {
  id: string;
  name: string;
  series: string;
  reps: string;
  tempo: string;
  supersetCode: string; // e.g., "A1", "B2"
  notes?: string;
}

export interface Superset {
  id: string; // e.g., "A", "B"
  exercises: Exercise[];
}

export interface WorkoutDay {
  day: number;
  dayName?: string; // Optional custom name for the day
  supersets: Superset[];
}

export interface Routine {
  name: string;
  days: WorkoutDay[];
}

// For workout history
export interface CompletedSet {
  set: number;
  weight: number | null;
  reps: number | null;
}

export interface CompletedExercise {
  exerciseId: string; // Links to Exercise.id
  sets: CompletedSet[];
  notes?: string;
}

export interface WorkoutSession {
  date: string; // ISO string
  routineName: string;
  dayCompleted: number;
  completedExercises: CompletedExercise[];
}
