import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeConsecutive,
  importTelemetry,
  startSession,
  abortSession,
  type SessionTelemetry,
} from '../telemetry';

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = memStorage();
});

function sess(startedAt: string, completed = true): SessionTelemetry {
  return {
    sessionId: `ts_${startedAt}`,
    startedAt,
    endedAt: completed ? startedAt : null,
    cellEdits: [],
    sheetOpeningReported: 0,
    completed,
  };
}

describe('computeConsecutive con ventana temporal', () => {
  it('sesiones separadas por 6 semanas no cuentan como consecutivas', () => {
    const sessions = [
      sess('2026-08-01T10:00:00.000Z'),
      sess('2026-09-16T10:00:00.000Z'),
      sess('2026-09-16T18:00:00.000Z'),
      sess('2026-09-17T10:00:00.000Z'),
    ];
    expect(computeConsecutive(sessions)).toBe(3);
  });

  it('una sesion incompleta corta la cadena', () => {
    const sessions = [sess('2026-09-16T10:00:00.000Z'), sess('2026-09-17T10:00:00.000Z', false)];
    expect(computeConsecutive(sessions)).toBe(0);
  });
});

describe('importTelemetry valida forma', () => {
  it('rechaza documento sin sessions en vez de crashear', () => {
    expect(() => importTelemetry('{"foo":1}')).toThrow();
  });

  it('descarta sesiones corruptas y conserva las validas', () => {
    const doc = {
      sessions: [{ sessionId: 'a', startedAt: '2026-09-17T10:00:00.000Z', completed: true, cellEdits: [] }, { ok: 1 }],
      activeSessionId: null,
    };
    expect(() => importTelemetry(JSON.stringify(doc))).not.toThrow();
  });
});

describe('abortSession', () => {
  it('elimina la sesion activa para que Cancel no rompa la cadena', () => {
    const id = startSession();
    expect(id).toMatch(/^ts_/);
    abortSession();
    const raw = localStorage.getItem('rutinify-telemetry')!;
    const state = JSON.parse(raw);
    expect(state.sessions).toHaveLength(0);
    expect(state.activeSessionId).toBeNull();
  });
});
