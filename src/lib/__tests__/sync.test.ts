import { describe, it, expect } from 'vitest';
import { mergeCells } from '../sync';
import type { CellRecord } from '../../types';

const cell = (over: Partial<CellRecord>): CellRecord => ({
  exercise_id: 'ex1',
  week: 1,
  set_index: 0,
  weight: 80,
  reps: 8,
  updated_at: '2026-09-17T10:00:00.000Z',
  ...over,
});

describe('merge por celda last-write-wins', () => {
  it('escritura remota posterior gana a la local offline', () => {
    const local = [cell({ weight: 80, updated_at: '2026-09-17T10:00:00.000Z' })];
    const remote = [cell({ weight: 82.5, updated_at: '2026-09-17T11:00:00.000Z' })];
    expect(mergeCells(local, remote)[0].weight).toBe(82.5);
  });

  it('escritura local posterior gana a la remota vieja', () => {
    const local = [cell({ weight: 85, updated_at: '2026-09-17T12:00:00.000Z' })];
    const remote = [cell({ weight: 82.5, updated_at: '2026-09-17T11:00:00.000Z' })];
    expect(mergeCells(local, remote)[0].weight).toBe(85);
  });

  it('hace unión por PK sin perder celdas de ningún lado', () => {
    const local = [cell({ set_index: 0 })];
    const remote = [cell({ set_index: 1 })];
    expect(mergeCells(local, remote)).toHaveLength(2);
  });
});
