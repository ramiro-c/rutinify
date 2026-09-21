import { describe, it, expect } from 'vitest';
import { sessionMatchesRoutine } from '../../hooks/useWorkoutHistory';

describe('join sesión ↔ plan por id de rutina', () => {
  it('matchea por id aunque el nombre haya cambiado (renombre)', () => {
    const session = { routineId: 'r_123', routineName: 'Fuerza vieja' };
    expect(sessionMatchesRoutine(session, 'r_123', 'Fuerza nueva')).toBe(true);
    expect(sessionMatchesRoutine(session, 'r_otro', 'Fuerza nueva')).toBe(false);
  });

  it('fallback legacy: sesiones sin routineId matchean por nombre', () => {
    const session = { routineId: undefined, routineName: 'Fuerza' };
    expect(sessionMatchesRoutine(session, 'r_123', 'Fuerza')).toBe(true);
    expect(sessionMatchesRoutine(session, 'r_123', 'Otro')).toBe(false);
  });
});
