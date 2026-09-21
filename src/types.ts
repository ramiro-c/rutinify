export type ExerciseType = 'reps' | 'time' | 'weight-time';

export interface BaseSet {
  id: string;
  completed?: boolean;
}

export interface RepsSet extends BaseSet {
  type: 'reps';
  /** null = plan sin peso para esta semana (celda vacía del Sheet), no 0. */
  weight: number | null;
  reps: number;
}

export interface TimeSet extends BaseSet {
  type: 'time';
  duration: string; // "2:30" o "45" (acepta ambos formatos)
}

export interface WeightTimeSet extends BaseSet {
  type: 'weight-time';
  /** null = plan sin peso para esta semana (celda vacía del Sheet), no 0. */
  weight: number | null;
  duration: string; // "1:15"
}

export type ExerciseSet = RepsSet | TimeSet | WeightTimeSet;

export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  sets: ExerciseSet[];
  tempo: string;
  supersetCode: string; // e.g., "A1", "B2" — full code, never truncated
  notes?: string;
  /** Planned weight per week from Semana 1..4 columns (null = empty cell). */
  weeklyWeights?: (number | null)[];
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
  id: string;
  name: string;
  days: WorkoutDay[];
}

// For current week tracking
export interface WeekSettings {
  currentWeek: number; // 1-4
}

// ── Offline-first sync (BET-2026-001 generation_target) ────────────────
// Cell-level record mirrored by the Postgres schema in db/schema.sql.
// PK compuesta: (exercise_id, week, set_index). LWW sobre updated_at.

export interface CellRecord {
  exercise_id: string;
  week: number;
  set_index: number;
  weight: number | null;
  reps: number | null;
  updated_at: string; // ISO string
}

export interface NoteRecord {
  exercise_id: string;
  week: number;
  text: string;
  updated_at: string; // ISO string
}

export type OutboxOp =
  | { kind: 'cell'; cell: CellRecord }
  | { kind: 'note'; note: NoteRecord }
  | { kind: 'session'; session: WorkoutSession };

export interface OutboxEntry {
  opId: string;
  enqueued_at: string; // ISO string
  op: OutboxOp;
}

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
  id: string;
  date: string; // ISO string
  /** Clave de join estable con el plan (los nombres se pueden renombrar). */
  routineId?: string;
  routineName: string;
  dayCompleted: number;
  week: number; // Week number (1-4)
  completedExercises: CompletedExercise[];
  updated_at: string; // ISO string — LWW version stamp for sync
}
