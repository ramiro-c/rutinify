import type { Routine, WorkoutSession, CellRecord, NoteRecord, OutboxEntry } from '../types';
import { CELLS_KEY, NOTES_KEY, OUTBOX_KEY } from './sync';

export interface AppExport {
  version: 1;
  exported_at: string;
  routines: Routine[];
  history: WorkoutSession[];
  cells: CellRecord[];
  /** Notas por ejercicio (deliverable explícito de la Bet). */
  notes: NoteRecord[];
  telemetry: unknown;
  weekSettings: unknown;
  /** Ops offline pendientes al momento del export (puede estar ausente en exports viejos). */
  outbox?: OutboxEntry[];
}

function isRoutine(r: unknown): r is Routine {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.name === 'string' && Array.isArray(o.days);
}

function isCell(c: unknown): c is CellRecord {
  if (!c || typeof c !== 'object') return false;
  const r = c as Record<string, unknown>;
  return (
    typeof r.exercise_id === 'string' &&
    typeof r.week === 'number' &&
    typeof r.set_index === 'number' &&
    (typeof r.weight === 'number' || r.weight === null) &&
    (typeof r.reps === 'number' || r.reps === null) &&
    typeof r.updated_at === 'string'
  );
}

function isNote(n: unknown): n is NoteRecord {
  if (!n || typeof n !== 'object') return false;
  const r = n as Record<string, unknown>;
  return (
    typeof r.exercise_id === 'string' &&
    typeof r.week === 'number' &&
    typeof r.text === 'string' &&
    typeof r.updated_at === 'string'
  );
}

function isOutboxNote(n: unknown): boolean {
  if (!n || typeof n !== 'object') return false;
  const r = n as Record<string, unknown>;
  return (
    typeof r.exercise_id === 'string' &&
    typeof r.week === 'number' &&
    typeof r.text === 'string' &&
    typeof r.updated_at === 'string'
  );
}

function isOutboxSession(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.date === 'string' &&
    typeof o.routineName === 'string' &&
    typeof o.dayCompleted === 'number' &&
    Array.isArray(o.completedExercises) &&
    typeof o.updated_at === 'string'
  );
}

function isOutboxEntry(e: unknown): e is OutboxEntry {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  if (typeof r.opId !== 'string' || !r.op || typeof r.op !== 'object') return false;
  const op = r.op as Record<string, unknown>;
  // Se valida el payload por clase: una op cell sin exercise_id/week/
  // set_index (o note/session sin su forma) se rechaza en el import en
  // vez de encolarse para que drainOutbox la purgue en silencio.
  if (op.kind === 'cell') return isCell(op.cell);
  if (op.kind === 'note') return isOutboxNote(op.note);
  if (op.kind === 'session') return isOutboxSession(op.session);
  return false;
}
function isSession(s: unknown): s is WorkoutSession {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.date === 'string' &&
    typeof o.routineName === 'string' &&
    typeof o.dayCompleted === 'number' &&
    Array.isArray(o.completedExercises) &&
    typeof o.updated_at === 'string'
  );
}

/** Serializa todo el estado local a JSON (migración de vuelta de la Bet). */
export function exportAppJSON(state: Omit<AppExport, 'version' | 'exported_at'>): string {
  const payload: AppExport = {
    version: 1,
    exported_at: new Date().toISOString(),
    ...state,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Restaura un export previo. Valida forma entrada por entrada: las
 * corruptas se descartan sin envenenar las válidas. Lanza si el
 * documento no es un export reconocible.
 */
export function importAppJSON(json: string): Omit<AppExport, 'version' | 'exported_at'> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('El archivo no es un JSON válido');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('El archivo no es un export válido');
  const doc = parsed as Record<string, unknown>;
  if (doc.version !== 1 || !Array.isArray(doc.routines) || !Array.isArray(doc.history)) {
    throw new Error('El archivo no es un export válido de rutinify (version 1)');
  }
  const routines = (doc.routines as unknown[]).filter(isRoutine);
  const history = (doc.history as unknown[]).filter(isSession);
  // Cells y notes se validan entrada por entrada como routines/history:
  // una entrada corrupta se descarta sin contaminar su store vía pullMerge.
  const cells = Array.isArray(doc.cells) ? (doc.cells as unknown[]).filter(isCell) : [];
  const notes = Array.isArray(doc.notes) ? (doc.notes as unknown[]).filter(isNote) : [];
  const outbox = Array.isArray(doc.outbox) ? (doc.outbox as unknown[]).filter(isOutboxEntry) : [];
  return {
    routines,
    history,
    cells,
    notes,
    telemetry: doc.telemetry ?? null,
    weekSettings: doc.weekSettings ?? null,
    outbox,
  };
}

/** Claves de localStorage que componen el estado exportable. */
export const EXPORT_STORAGE_KEYS = [
  'rutinify-routines',
  'rutinify-history',
  CELLS_KEY,
  NOTES_KEY,
  'rutinify-telemetry',
  'rutinify-week-settings',
  OUTBOX_KEY,
] as const;
