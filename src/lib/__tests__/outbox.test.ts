import { describe, it, expect } from 'vitest';
import { enqueueCellWrite, drainOutbox, loadOutbox, loadCells } from '../sync';

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

const baseCell = {
  exercise_id: 'ex1',
  week: 1,
  set_index: 0,
  weight: 80,
  reps: 8,
};

describe('idempotencia del outbox', () => {
  it('un reintento con el mismo opId no duplica la entrada', () => {
    const storage = memStorage();
    enqueueCellWrite({ ...baseCell }, storage, 'op-1');
    enqueueCellWrite({ ...baseCell, weight: 80 }, storage, 'op-1');
    expect(loadOutbox(storage)).toHaveLength(1);
  });

  it('drenar dos veces no duplica celdas', () => {
    const storage = memStorage();
    enqueueCellWrite({ ...baseCell, updated_at: '2026-09-17T10:00:00.000Z' }, storage, 'op-1');
    const first = drainOutbox(storage);
    const second = drainOutbox(storage);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(loadCells(storage)).toHaveLength(1);
    expect(loadOutbox(storage)).toHaveLength(0);
  });
});
