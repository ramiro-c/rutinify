import { useState, useEffect, useCallback } from 'react';
import { type WorkoutSession } from '../types';
import { enqueueOp } from '../lib/sync';

const HISTORY_STORAGE_KEY = 'rutinify-history';

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isValidSession(entry: unknown): entry is WorkoutSession {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as unknown as Record<string, unknown>;
  return (
    typeof e.date === 'string' &&
    typeof e.routineName === 'string' &&
    typeof e.dayCompleted === 'number' &&
    Array.isArray(e.completedExercises)
  );
}

function normalizeSession(entry: Record<string, unknown>): WorkoutSession {
  const now = new Date().toISOString();
  return {
    id: typeof entry.id === 'string' ? entry.id : newSessionId(),
    date: entry.date as string,
    // routineId es la clave de join estable; las sesiones viejas (solo
    // routineName) siguen funcionando por fallback legacy.
    routineId: typeof entry.routineId === 'string' ? (entry.routineId as string) : undefined,
    routineName: entry.routineName as string,
    dayCompleted: entry.dayCompleted as number,
    week: typeof entry.week === 'number' ? (entry.week as number) : 1,
    completedExercises: entry.completedExercises as WorkoutSession['completedExercises'],
    updated_at: typeof entry.updated_at === 'string' ? (entry.updated_at as string) : now,
  };
}

/**
 * Clave de join sesión ↔ plan. El id es estable ante renombres
 * (EditableRoutineName); el nombre solo se usa como fallback para
 * sesiones guardadas antes de que existiera routineId.
 */
export function sessionMatchesRoutine(
  session: Pick<WorkoutSession, 'routineId' | 'routineName'>,
  routineId: string | undefined,
  routineName: string
): boolean {
  if (routineId && session.routineId) return session.routineId === routineId;
  return session.routineName === routineName;
}

export const useWorkoutHistory = () => {
  const [history, setHistory] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (storedHistory) {
        const rawHistory: unknown = JSON.parse(storedHistory);

        if (!Array.isArray(rawHistory)) {
          console.error('Workout history is not an array — resetting');
          setHistory([]);
          return;
        }

        // Entradas corruptas se descartan una por una sin envenenar el resto.
        const migratedHistory: WorkoutSession[] = [];
        for (let i = 0; i < rawHistory.length; i++) {
          const entry = rawHistory[i];
          if (isValidSession(entry)) {
            migratedHistory.push(normalizeSession(entry as unknown as Record<string, unknown>));
          } else {
            console.warn(`[history] Skipping corrupt entry at index ${i}:`, entry);
          }
        }

        setHistory(migratedHistory);

        if (migratedHistory.length !== rawHistory.length) {
          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(migratedHistory));
        }
      }
    } catch (error) {
      console.error('Failed to parse workout history from localStorage', error);
      setHistory([]);
    }
  }, []);

  const saveHistory = (newHistory: WorkoutSession[]) => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
      setHistory(newHistory);
    } catch (error) {
      console.error('Failed to save workout history to localStorage', error);
    }
  };

  // Actualización funcional: dos guardados seguidos (doble tap) no se pisan.
  const addWorkoutSession = (session: Omit<WorkoutSession, 'date' | 'id' | 'updated_at'>) => {
    const now = new Date().toISOString();
    const newSession: WorkoutSession = {
      ...session,
      id: newSessionId(),
      date: now,
      updated_at: now,
    };
    setHistory(prev => {
      const next = [...prev, newSession];
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.error('Failed to save workout history to localStorage', error);
      }
      return next;
    });
    // Encolar para sync offline-first (idempotente por opId = session id).
    try {
      enqueueOp({ kind: 'session', session: newSession }, localStorage, `session:${newSession.id}`);
    } catch {
      // Outbox best-effort: la sesión ya quedó guardada localmente.
    }
  };

  const getLatestExerciseData = useCallback(
    (exerciseId: string) => {
      // Iterate backwards through history to find the most recent session for this exercise
      for (let i = history.length - 1; i >= 0; i--) {
        const session = history[i];
        const exerciseData = session.completedExercises.find(
          e => e.exerciseId === exerciseId
        );
        if (exerciseData) {
          return exerciseData;
        }
      }
      return null; // No previous data found
    },
    [history]
  );

  const getPreviousWeekExerciseData = useCallback(
    (
      exerciseId: string,
      currentWeek: number,
      routineName: string,
      dayNumber: number,
      routineId?: string
    ) => {
      if (currentWeek <= 1) return null; // No previous week for week 1

      const previousWeek = currentWeek - 1;

      // Find the most recent session for this exercise in the previous week
      for (let i = history.length - 1; i >= 0; i--) {
        const session = history[i];
        if (
          session.week === previousWeek &&
          sessionMatchesRoutine(session, routineId, routineName) &&
          session.dayCompleted === dayNumber
        ) {
          const exerciseData = session.completedExercises.find(
            e => e.exerciseId === exerciseId
          );
          if (exerciseData) {
            return exerciseData;
          }
        }
      }
      return null; // No previous week data found
    },
    [history]
  );

  return {
    history,
    saveHistory,
    addWorkoutSession,
    getLatestExerciseData,
    getPreviousWeekExerciseData,
  };
};
