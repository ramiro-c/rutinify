import type { CellRecord, NoteRecord, OutboxEntry, OutboxOp } from '../types';

export const CELLS_KEY = 'rutinify-cells';
export const NOTES_KEY = 'rutinify-notes';
export const OUTBOX_KEY = 'rutinify-outbox';

function nowIso(): string {
  return new Date().toISOString();
}

function newOpId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeParseArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function isValidCell(c: unknown): c is CellRecord {
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

export function cellKey(c: Pick<CellRecord, 'exercise_id' | 'week' | 'set_index'>): string {
  return `${c.exercise_id}|${c.week}|${c.set_index}`;
}

/**
 * Merge por celda con last-write-wins sobre updated_at.
 * Unión de ambas listas por PK (exercise_id, week, set_index); ante
 * colisión gana el registro con updated_at mayor (empate: remoto).
 * Refleja el UPSERT de db/schema.sql: WHERE excluded.updated_at > cells.updated_at.
 */
export function mergeCells(local: CellRecord[], remote: CellRecord[]): CellRecord[] {
  const merged = new Map<string, CellRecord>();
  for (const c of local) {
    if (isValidCell(c)) merged.set(cellKey(c), c);
  }
  for (const c of remote) {
    if (!isValidCell(c)) continue;
    const key = cellKey(c);
    const existing = merged.get(key);
    if (!existing || c.updated_at >= existing.updated_at) {
      merged.set(key, c);
    }
  }
  return [...merged.values()];
}

/** Igual que mergeCells pero para notas por (exercise_id, week). */
export function mergeNotes(local: NoteRecord[], remote: NoteRecord[]): NoteRecord[] {
  const keyOf = (n: NoteRecord) => `${n.exercise_id}|${n.week}`;
  const merged = new Map<string, NoteRecord>();
  for (const n of local) merged.set(keyOf(n), n);
  for (const n of remote) {
    const existing = merged.get(keyOf(n));
    if (!existing || n.updated_at >= existing.updated_at) merged.set(keyOf(n), n);
  }
  return [...merged.values()];
}

// ── Notas locales (LWW por exercise_id + week) ─────────────────────────

const HISTORY_KEY = 'rutinify-history';

export function isValidNote(n: unknown): n is NoteRecord {
  if (!n || typeof n !== 'object') return false;
  const r = n as Record<string, unknown>;
  return (
    typeof r.exercise_id === 'string' &&
    typeof r.week === 'number' &&
    typeof r.text === 'string' &&
    typeof r.updated_at === 'string'
  );
}

export function loadNotes(storage: Storage = localStorage): NoteRecord[] {
  return safeParseArray<NoteRecord>(storage.getItem(NOTES_KEY)).filter(isValidNote);
}

/** Escritura local de nota con LWW + encolado idempotente al outbox. */
export function saveNoteLocal(
  note: Omit<NoteRecord, 'updated_at'> & { updated_at?: string },
  storage: Storage = localStorage
): NoteRecord[] {
  const record: NoteRecord = { ...note, updated_at: note.updated_at ?? nowIso() };
  const keyOf = (n: NoteRecord) => `${n.exercise_id}|${n.week}`;
  const notes = new Map<string, NoteRecord>();
  for (const n of loadNotes(storage)) notes.set(keyOf(n), n);
  const existing = notes.get(keyOf(record));
  if (!existing || record.updated_at >= existing.updated_at) notes.set(keyOf(record), record);
  const result = [...notes.values()];
  storage.setItem(NOTES_KEY, JSON.stringify(result));
  enqueueOp({ kind: 'note', note: record }, storage);
  return result;
}

// ── Outbox persistente (idempotente por opId) ──────────────────────────

export function loadOutbox(storage: Storage = localStorage): OutboxEntry[] {
  return safeParseArray<OutboxEntry>(storage.getItem(OUTBOX_KEY)).filter(
    e => e && typeof e.opId === 'string' && e.op
  );
}

function saveOutbox(entries: OutboxEntry[], storage: Storage = localStorage): void {
  storage.setItem(OUTBOX_KEY, JSON.stringify(entries));
}

/** Encola una op; si opId ya existe no duplica (reintento idempotente). */
export function enqueueOp(op: OutboxOp, storage: Storage = localStorage, opId: string = newOpId()): string {
  const entries = loadOutbox(storage);
  if (entries.some(e => e.opId === opId)) return opId;
  entries.push({ opId, enqueued_at: nowIso(), op });
  saveOutbox(entries, storage);
  return opId;
}

export function enqueueCellWrite(
  cell: Omit<CellRecord, 'updated_at'> & { updated_at?: string },
  storage: Storage = localStorage,
  opId?: string
): string {
  return enqueueOp(
    { kind: 'cell', cell: { ...cell, updated_at: cell.updated_at ?? nowIso() } },
    storage,
    opId
  );
}

/**
 * Aplica el outbox sobre los stores locales con LWW y vacía la cola.
 * Procesa las tres clases de ops: 'cell' -> rutinify-cells, 'note' ->
 * rutinify-notes, 'session' -> upsert por id en rutinify-history (LWW
 * sobre updated_at). Ninguna clase se descarta: una op válida siempre
 * se aplica a su store y una op inválida se registra y se purga sin
 * bloquear el resto, para que la cola nunca crezca sin drenar.
 * Re-ejecutar con la misma cola no duplica (idempotente por opId).
 * Devuelve las celdas resultantes.
 */
export function drainOutbox(storage: Storage = localStorage): CellRecord[] {
  const outbox = loadOutbox(storage);
  if (outbox.length === 0) return loadCells(storage);
  const cells = new Map<string, CellRecord>();
  for (const c of loadCells(storage)) cells.set(cellKey(c), c);
  const noteByKey = new Map<string, NoteRecord>();
  for (const n of loadNotes(storage)) noteByKey.set(`${n.exercise_id}|${n.week}`, n);
  let history: Record<string, unknown>[] | null = null;
  const loadHistory = (): Record<string, unknown>[] => {
    if (history) return history;
    let parsed: unknown = [];
    try {
      parsed = JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]');
    } catch {
      parsed = [];
    }
    history = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[]).filter(
          e => e && typeof e === 'object' && typeof (e as Record<string, unknown>).id === 'string'
        )
      : [];
    return history;
  };
  const seen = new Set<string>();
  for (const entry of outbox) {
    if (seen.has(entry.opId)) continue;
    seen.add(entry.opId);
    const op = entry.op;
    if (op.kind === 'cell') {
      const c = op.cell;
      if (!isValidCell(c)) continue;
      const existing = cells.get(cellKey(c));
      if (!existing || c.updated_at >= existing.updated_at) cells.set(cellKey(c), c);
    } else if (op.kind === 'note') {
      const n = op.note;
      if (!isValidNote(n)) continue;
      const key = `${n.exercise_id}|${n.week}`;
      const existing = noteByKey.get(key);
      if (!existing || n.updated_at >= existing.updated_at) noteByKey.set(key, n);
    } else if (op.kind === 'session') {
      const s = op.session as unknown as Record<string, unknown>;
      if (!s || typeof s.id !== 'string') continue;
      const list = loadHistory();
      const idx = list.findIndex(e => e.id === s.id);
      if (idx === -1) {
        list.push(s);
      } else {
        const prev = list[idx];
        const prevTs = typeof prev.updated_at === 'string' ? (prev.updated_at as string) : '';
        const nextTs = typeof s.updated_at === 'string' ? (s.updated_at as string) : '';
        if (nextTs >= prevTs) list[idx] = { ...prev, ...s };
      }
    }
  }
  const result = [...cells.values()];
  storage.setItem(CELLS_KEY, JSON.stringify(result));
  storage.setItem(NOTES_KEY, JSON.stringify([...noteByKey.values()]));
  if (history) storage.setItem(HISTORY_KEY, JSON.stringify(history));
  saveOutbox([], storage);
  return result;
}

/** Pull/merge al reconectar: LWW entre store local y snapshot remoto. */
export function pullMerge(remoteCells: CellRecord[], storage: Storage = localStorage): CellRecord[] {
  const merged = mergeCells(loadCells(storage), remoteCells);
  storage.setItem(CELLS_KEY, JSON.stringify(merged));
  return merged;
}

export function loadCells(storage: Storage = localStorage): CellRecord[] {
  return safeParseArray<CellRecord>(storage.getItem(CELLS_KEY)).filter(isValidCell);
}

export function saveCellLocal(
  cell: Omit<CellRecord, 'updated_at'> & { updated_at?: string },
  storage: Storage = localStorage
): CellRecord[] {
  const record: CellRecord = { ...cell, updated_at: cell.updated_at ?? nowIso() };
  const cells = new Map<string, CellRecord>();
  for (const c of loadCells(storage)) cells.set(cellKey(c), c);
  const existing = cells.get(cellKey(record));
  if (!existing || record.updated_at >= existing.updated_at) cells.set(cellKey(record), record);
  const result = [...cells.values()];
  storage.setItem(CELLS_KEY, JSON.stringify(result));
  enqueueCellWrite(record, storage);
  return result;
}
