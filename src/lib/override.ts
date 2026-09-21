import type { Routine, WorkoutSession } from '../types';

/**
 * Override de sesión: la sesión puede desviarse del plan (pesos/reps
 * distintos, notas propias) sin mutar la plantilla. Devuelve una vista
 * resuelta { plan, override | null } por ejercicio; el plan nunca se toca.
 */
export interface SessionOverride {
  exerciseId: string;
  weight: number | null;
  reps: number | null;
  notes?: string;
}

export interface ResolvedExercise {
  exerciseId: string;
  name: string;
  plannedWeight: number | null;
  plannedReps: number | null;
  override: SessionOverride | null;
  /** Valor efectivo: override si existe, si no el plan. */
  effectiveWeight: number | null;
  effectiveReps: number | null;
}

export function applySessionOverride(plan: Routine, session: WorkoutSession): ResolvedExercise[] {
  const byId = new Map<string, { name: string; weight: number | null; reps: number | null }>();
  for (const day of plan.days) {
    for (const sup of day.supersets) {
      for (const ex of sup.exercises) {
        const firstSet = ex.sets[0];
        byId.set(ex.id, {
          name: ex.name,
          weight:
            firstSet && 'weight' in firstSet ? (firstSet as { weight: number | null }).weight : null,
          reps: firstSet && 'reps' in firstSet ? (firstSet as { reps: number }).reps : null,
        });
      }
    }
  }
  const resolved: ResolvedExercise[] = [];
  for (const ce of session.completedExercises) {
    const planned = byId.get(ce.exerciseId);
    const first = ce.sets[0];
    const override: SessionOverride | null = first
      ? {
          exerciseId: ce.exerciseId,
          weight: first.weight,
          reps: first.reps,
          notes: ce.notes,
        }
      : null;
    resolved.push({
      exerciseId: ce.exerciseId,
      name: planned?.name ?? ce.exerciseId,
      plannedWeight: planned?.weight ?? null,
      plannedReps: planned?.reps ?? null,
      override,
      effectiveWeight: override?.weight ?? planned?.weight ?? null,
      effectiveReps: override?.reps ?? planned?.reps ?? null,
    });
  }
  return resolved;
}
