import { describe, it, expect } from 'vitest';
import { drainOutbox, loadCells, loadNotes, loadOutbox, enqueueOp } from '../sync';

function memStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('drainOutbox procesa todas las clases de ops', () => {
  it('aplica ops session al historial sin perderlas ni duplicarlas', () => {
    const storage = memStorage();
    const session = {
      id: 's1',
      date: '2026-09-17T10:00:00.000Z',
      routineName: 'R',
      dayCompleted: 1,
      week: 1,
      completedExercises: [],
      updated_at: '2026-09-17T10:00:00.000Z',
    };
    enqueueOp({ kind: 'session', session }, storage, 'session:s1');
    drainOutbox(storage);
    expect(loadOutbox(storage)).toHaveLength(0);
    const history = JSON.parse(storage.getItem('rutinify-history')!);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('s1');
    // Re-drenar no duplica.
    drainOutbox(storage);
    expect(JSON.parse(storage.getItem('rutinify-history')!)).toHaveLength(1);
  });

  it('aplica ops note al store de notas con last-write-wins', () => {
    const storage = memStorage();
    enqueueOp(
      { kind: 'note', note: { exercise_id: 'ex1', week: 1, text: 'vieja', updated_at: '2026-09-17T10:00:00.000Z' } },
      storage,
      'op-n1'
    );
    enqueueOp(
      { kind: 'note', note: { exercise_id: 'ex1', week: 1, text: 'nueva', updated_at: '2026-09-17T11:00:00.000Z' } },
      storage,
      'op-n2'
    );
    drainOutbox(storage);
    expect(loadNotes(storage)).toHaveLength(1);
    expect(loadNotes(storage)[0].text).toBe('nueva');
    expect(loadOutbox(storage)).toHaveLength(0);
  });

  it('una cola mixta cell+note+session se vacía por completo', () => {
    const storage = memStorage();
    enqueueOp(
      { kind: 'cell', cell: { exercise_id: 'ex1', week: 1, set_index: 0, weight: 80, reps: 8, updated_at: '2026-09-17T10:00:00.000Z' } },
      storage,
      'op-c1'
    );
    enqueueOp(
      { kind: 'note', note: { exercise_id: 'ex1', week: 1, text: 'ok', updated_at: '2026-09-17T10:00:00.000Z' } },
      storage,
      'op-n1'
    );
    enqueueOp(
      {
        kind: 'session',
        session: { id: 's9', date: '2026-09-17T10:00:00.000Z', routineName: 'R', dayCompleted: 1, week: 1, completedExercises: [], updated_at: '2026-09-17T10:00:00.000Z' },
      },
      storage,
      'session:s9'
    );
    drainOutbox(storage);
    expect(loadOutbox(storage)).toHaveLength(0);
    expect(loadCells(storage)).toHaveLength(1);
    expect(loadNotes(storage)).toHaveLength(1);
  });
});
