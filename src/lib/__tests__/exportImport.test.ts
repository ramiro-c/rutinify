import { describe, it, expect } from 'vitest';
import { exportAppJSON, importAppJSON } from '../exportImport';

describe('round-trip export/import JSON', () => {
  it('exportar e importar restaura rutinas, historial, celdas y notas', () => {
    const state = {
      routines: [
        {
          id: 'r1',
          name: 'Fuerza',
          days: [
            {
              day: 1,
              supersets: [
                {
                  id: 'A',
                  exercises: [
                    {
                      id: '1-A-press',
                      name: 'Press banca',
                      type: 'reps' as const,
                      sets: [{ id: 's0', type: 'reps' as const, weight: 80, reps: 8 }],
                      tempo: '2010',
                      supersetCode: 'A1',
                      weeklyWeights: [80, 82.5, 85, 87.5],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      history: [
        {
          id: 's1',
          date: '2026-09-17T10:00:00.000Z',
          routineName: 'Fuerza',
          dayCompleted: 1,
          week: 1,
          completedExercises: [
            { exerciseId: '1-A-press', sets: [{ set: 1, weight: 80, reps: 8 }] },
          ],
          updated_at: '2026-09-17T10:00:00.000Z',
        },
      ],
      cells: [
        {
          exercise_id: '1-A-press',
          week: 1,
          set_index: 0,
          weight: 80,
          reps: 8,
          updated_at: '2026-09-17T10:00:00.000Z',
        },
      ],
      notes: [
        {
          exercise_id: '1-A-press',
          week: 1,
          text: 'cuidar el hombro',
          updated_at: '2026-09-17T10:00:00.000Z',
        },
      ],
      telemetry: null,
      weekSettings: { currentWeek: 1 },
    };
    const restored = importAppJSON(exportAppJSON(state));
    expect(restored.routines).toEqual(state.routines);
    expect(restored.history).toEqual(state.history);
    expect(restored.cells).toEqual(state.cells);
    expect(restored.notes).toEqual(state.notes);
  });

  it('descarta entradas corruptas sin envenenar las válidas', () => {
    const doc = {
      version: 1,
      routines: [{ id: 'r1', name: 'Ok', days: [] }, { nope: true }],
      history: [{ id: 's1', date: 'x', routineName: 'Ok', dayCompleted: 1, week: 1, completedExercises: [], updated_at: 'x' }, 'basura'],
      cells: [],
      telemetry: null,
      weekSettings: null,
    };
    const restored = importAppJSON(JSON.stringify(doc));
    expect(restored.routines).toHaveLength(1);
    expect(restored.history).toHaveLength(1);
  });

  it('rechaza documentos que no son exports', () => {
    expect(() => importAppJSON('{"a":1}')).toThrow();
    expect(() => importAppJSON('no-json')).toThrow();
  });

  it('descarta celdas corruptas sin contaminar el store cell-level', () => {
    const doc = {
      version: 1,
      routines: [],
      history: [],
      cells: [
        { exercise_id: 'e1', week: 1, set_index: 0, weight: 80, reps: 8, updated_at: 'x' },
        { exercise_id: 'e2', week: 1 },
        'basura',
        { exercise_id: 'e3', week: 'uno', set_index: 0, weight: 1, reps: 1, updated_at: 'x' },
      ],
      telemetry: null,
      weekSettings: null,
    };
    const restored = importAppJSON(JSON.stringify(doc));
    expect(restored.cells).toHaveLength(1);
    expect(restored.cells[0].exercise_id).toBe('e1');
  });

  it('descarta notas corruptas sin contaminar el store de notas', () => {
    const doc = {
      version: 1,
      routines: [],
      history: [],
      cells: [],
      notes: [
        { exercise_id: 'e1', week: 1, text: 'ok', updated_at: 'x' },
        { exercise_id: 'e2', week: 1 },
        'basura',
      ],
      telemetry: null,
      weekSettings: null,
    };
    const restored = importAppJSON(JSON.stringify(doc));
    expect(restored.notes).toHaveLength(1);
    expect(restored.notes[0].exercise_id).toBe('e1');
  });

  it('exports viejos sin notes restauran con lista vacía', () => {
    const restored = importAppJSON(
      JSON.stringify({ version: 1, routines: [], history: [], cells: [] })
    );
    expect(restored.notes).toEqual([]);
  });

  it('restaura el outbox y filtra entradas inválidas', () => {
    const outbox = [
      { opId: 'op1', enqueued_at: 'x', op: { kind: 'cell', cell: { exercise_id: 'e', week: 1, set_index: 0, weight: 1, reps: 1, updated_at: 'x' } } },
      { opId: 'bad', enqueued_at: 'x', op: { kind: 'raro' } },
      'basura',
    ];
    const restored = importAppJSON(
      JSON.stringify({ version: 1, routines: [], history: [], cells: [], outbox })
    );
    expect(restored.outbox).toHaveLength(1);
    expect(restored.outbox![0].opId).toBe('op1');
  });

  it('rechaza ops del outbox sin payload aunque el kind sea valido', () => {
    const outbox = [
      { opId: 'x', enqueued_at: 'x', op: { kind: 'cell' } },
      { opId: 'y', enqueued_at: 'x', op: { kind: 'note', note: { exercise_id: 'e' } } },
      { opId: 'z', enqueued_at: 'x', op: { kind: 'session', session: { id: 's' } } },
    ];
    const restored = importAppJSON(
      JSON.stringify({ version: 1, routines: [], history: [], cells: [], outbox })
    );
    expect(restored.outbox).toHaveLength(0);
  });
});
