import { describe, it, expect } from 'vitest';
import { applySessionOverride } from '../override';
import type { Routine, WorkoutSession } from '../../types';

const plan: Routine = {
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
              id: 'ex-press',
              name: 'Press banca',
              type: 'reps',
              sets: [{ id: 's0', type: 'reps', weight: 80, reps: 8 }],
              tempo: '2010',
              supersetCode: 'A1',
              weeklyWeights: [80, 82.5, 85, 87.5],
            },
          ],
        },
      ],
    },
  ],
};

const session: WorkoutSession = {
  id: 'sess1',
  date: '2026-09-17T10:00:00.000Z',
  routineName: 'Fuerza',
  dayCompleted: 1,
  week: 2,
  completedExercises: [
    { exerciseId: 'ex-press', sets: [{ set: 1, weight: 70, reps: 10 }], notes: 'descarga' },
  ],
  updated_at: '2026-09-17T10:00:00.000Z',
};

describe('override de sesión', () => {
  it('la sesión puede desviarse sin tocar el plan', () => {
    const before = JSON.parse(JSON.stringify(plan)) as Routine;
    const resolved = applySessionOverride(plan, session);
    expect(plan).toEqual(before);
    expect(resolved[0].plannedWeight).toBe(80);
    expect(resolved[0].effectiveWeight).toBe(70);
    expect(resolved[0].effectiveReps).toBe(10);
    expect(resolved[0].override?.notes).toBe('descarga');
  });
});
