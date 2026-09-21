import { describe, it, expect, vi } from 'vitest';
import {
  isRemoteSyncConfigured,
  pullSnapshot,
  syncOnReconnect,
  type FetchFn,
} from '../remoteSync';

const ENV = { VITE_SYNC_URL: 'https://sync.example.com', VITE_API_TOKEN: 'tok123' };

function memStorage(seed: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(seed));
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

const okFetch = (payload: unknown): FetchFn =>
  (async () => ({ ok: true, status: 200, json: async () => payload })) as unknown as FetchFn;

describe('transporte de sync celular ↔ desktop', () => {
  it('sin VITE_SYNC_URL no sale a la red y no toca el store local', async () => {
    const fetchFn = vi.fn(okFetch({ cells: [], notes: [] }));
    const storage = memStorage({ 'rutinify-cells': '[]' });
    expect(isRemoteSyncConfigured({})).toBe(false);
    expect(await pullSnapshot(fetchFn, {}, storage)).toBeNull();
    expect(await syncOnReconnect(fetchFn, {}, storage)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(storage.getItem('rutinify-cells')).toBe('[]');
  });

  it('pull/merge LWW: la celda remota más nueva gana y la local más nueva sobrevive', async () => {
    const storage = memStorage({
      'rutinify-cells': JSON.stringify([
        { exercise_id: 'e1', week: 1, set_index: 0, weight: 80, reps: 8, updated_at: '2026-09-17T12:00:00.000Z' },
        { exercise_id: 'e2', week: 1, set_index: 0, weight: 50, reps: 5, updated_at: '2026-09-17T12:00:00.000Z' },
      ]),
      'rutinify-notes': '[]',
    });
    const fetchFn = vi.fn(
      okFetch({
        cells: [
          { exercise_id: 'e1', week: 1, set_index: 0, weight: 82.5, reps: 8, updated_at: '2026-09-17T13:00:00.000Z' },
          { exercise_id: 'e2', week: 1, set_index: 0, weight: 40, reps: 5, updated_at: '2026-09-17T11:00:00.000Z' },
        ],
        notes: [],
      })
    );
    expect(await syncOnReconnect(fetchFn, ENV, storage)).toBe(true);
    const cells = JSON.parse(storage.getItem('rutinify-cells')!);
    expect(cells.find((c: { exercise_id: string }) => c.exercise_id === 'e1').weight).toBe(82.5);
    expect(cells.find((c: { exercise_id: string }) => c.exercise_id === 'e2').weight).toBe(50);
    // La vuelta incluye el push del estado convergido con Bearer.
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const pushCall = fetchFn.mock.calls[1];
    expect(pushCall[1]?.method).toBe('POST');
    expect(pushCall[1]?.headers?.Authorization).toBe('Bearer tok123');
  });

  it('un fallo de red devuelve false con el store local intacto', async () => {
    const failing: FetchFn = async () => {
      throw new Error('offline');
    };
    const storage = memStorage({
      'rutinify-cells': JSON.stringify([
        { exercise_id: 'e1', week: 1, set_index: 0, weight: 80, reps: 8, updated_at: 'x' },
      ]),
    });
    expect(await syncOnReconnect(failing, ENV, storage)).toBe(false);
    expect(JSON.parse(storage.getItem('rutinify-cells')!)).toHaveLength(1);
  });

  it('descarta entradas remotas corruptas sin contaminar el store', async () => {
    const storage = memStorage({ 'rutinify-cells': '[]', 'rutinify-notes': '[]' });
    const fetchFn = vi.fn(okFetch({ cells: [{ exercise_id: 'e9' }, 'basura'], notes: null }));
    expect(await syncOnReconnect(fetchFn, ENV, storage)).toBe(true);
    expect(JSON.parse(storage.getItem('rutinify-cells')!)).toHaveLength(0);
  });
});
