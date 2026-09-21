import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createSyncServer, mergeSnapshot } from '../sync-server.mjs';

const TOKEN = 'test-token-123';

let baseUrl = '';
let server: ReturnType<typeof createSyncServer>;

beforeAll(
  async () =>
    new Promise<void>(resolvePromise => {
      const dataPath = join(mkdtempSync(join(tmpdir(), 'sync-test-')), 'state.json');
      server = createSyncServer({ token: TOKEN, dataPath });
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolvePromise();
      });
    })
);

afterAll(
  async () =>
    new Promise<void>(resolvePromise => {
      server.close(() => resolvePromise());
    })
);

const auth = { Authorization: `Bearer ${TOKEN}` };

describe('backend de sync (db/sync-protocol.md)', () => {
  it('responde 401 sin Bearer cuando hay token configurado', async () => {
    const res = await fetch(`${baseUrl}/sync`);
    expect(res.status).toBe(401);
  });

  it('GET /sync arranca vacío y POST hace round-trip', async () => {
    const cell = {
      exercise_id: 'press-banca',
      week: 1,
      set_index: 0,
      weight: 80,
      reps: 8,
      updated_at: '2026-09-17T10:00:00.000Z',
    };
    const post = await fetch(`${baseUrl}/sync`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cells: [cell], notes: [] }),
    });
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ cells: [cell], notes: [] });

    const get = await fetch(`${baseUrl}/sync`, { headers: auth });
    expect(await get.json()).toEqual({ cells: [cell], notes: [] });
  });

  it('LWW: una escritura remota más vieja no pisa a la más nueva', async () => {
    const stale = {
      exercise_id: 'press-banca',
      week: 1,
      set_index: 0,
      weight: 60,
      reps: 8,
      updated_at: '2026-09-01T10:00:00.000Z',
    };
    const post = await fetch(`${baseUrl}/sync`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cells: [stale], notes: [] }),
    });
    const converged = (await post.json()) as { cells: { weight: number }[] };
    expect(converged.cells.find(c => c.weight === 80)).toBeDefined();
    expect(converged.cells.find(c => c.weight === 60)).toBeUndefined();
  });

  it('descarta entradas corruptas sin contaminar el estado', async () => {
    const post = await fetch(`${baseUrl}/sync`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cells: [{ exercise_id: 'x' }, 'basura', { exercise_id: 'sentadilla', week: 99, set_index: 0, weight: 100, reps: 5, updated_at: '2026-09-17T10:00:00.000Z' }],
        notes: null,
      }),
    });
    expect(post.status).toBe(200);
    const get = await fetch(`${baseUrl}/sync`, { headers: auth });
    const state = (await get.json()) as { cells: unknown[] };
    // Solo sobrevive la celda válida previa (press-banca 80 kg).
    expect(state.cells).toHaveLength(1);
  });
});

describe('mergeSnapshot puro (misma semántica que el UPSERT de schema.sql)', () => {
  it('es idempotente: fusionar dos veces no cambia nada', () => {
    const local = { cells: [], notes: [] };
    const incoming = {
      cells: [
        { exercise_id: 'e1', week: 2, set_index: 1, weight: 82.5, reps: 8, updated_at: '2026-09-17T12:00:00.000Z' },
      ],
      notes: [{ exercise_id: 'e1', week: 2, text: 'nota', updated_at: '2026-09-17T12:00:00.000Z' }],
    };
    const once = mergeSnapshot(local, incoming);
    expect(mergeSnapshot(once, incoming)).toEqual(once);
  });
});
