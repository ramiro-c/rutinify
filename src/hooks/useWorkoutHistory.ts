import { useState, useEffect, useCallback } from 'react';
import { type WorkoutSession } from '../types';

const HISTORY_STORAGE_KEY = 'rutinify-history';

export const useWorkoutHistory = () => {
  const [history, setHistory] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (storedHistory) {
        const rawHistory = JSON.parse(storedHistory) as (
          | WorkoutSession
          | Omit<WorkoutSession, 'week'>
        )[];

        // Migrar datos antiguos que no tienen propiedad 'week'
        const migratedHistory: WorkoutSession[] = rawHistory.map(session => ({
          ...session,
          week: 'week' in session ? session.week : 1, // Asignar semana 1 por defecto a sesiones antiguas
        }));

        setHistory(migratedHistory);

        // Guardar la migración si hubo cambios
        const needsMigration = rawHistory.some(session => !('week' in session));
        if (needsMigration) {
          localStorage.setItem(
            HISTORY_STORAGE_KEY,
            JSON.stringify(migratedHistory)
          );
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

  const addWorkoutSession = (session: Omit<WorkoutSession, 'date'>) => {
    const newSession = {
      ...session,
      date: new Date().toISOString(),
    };
    saveHistory([...history, newSession]);
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
      dayNumber: number
    ) => {
      if (currentWeek <= 1) return null; // No previous week for week 1

      const previousWeek = currentWeek - 1;

      // Find the most recent session for this exercise in the previous week
      for (let i = history.length - 1; i >= 0; i--) {
        const session = history[i];
        if (
          session.week === previousWeek &&
          session.routineName === routineName &&
          session.dayCompleted === dayNumber
        ) {
          const exerciseData = session.completedExercises.find(
            e => e.exerciseId === exerciseId
          );
          if (exerciseData) {
            console.log(
              `💾 Found previous week data for exercise "${exerciseId}" from week ${previousWeek}`
            );
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
    addWorkoutSession,
    getLatestExerciseData,
    getPreviousWeekExerciseData,
  };
};
