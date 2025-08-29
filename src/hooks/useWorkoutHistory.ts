import { useState, useEffect, useCallback } from "react";
import { type WorkoutSession } from "../types";

const HISTORY_STORAGE_KEY = "rutinify-history";

export const useWorkoutHistory = () => {
  const [history, setHistory] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (error) {
      console.error("Failed to parse workout history from localStorage", error);
      setHistory([]);
    }
  }, []);

  const saveHistory = (newHistory: WorkoutSession[]) => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
      setHistory(newHistory);
    } catch (error) {
      console.error("Failed to save workout history to localStorage", error);
    }
  };

  const addWorkoutSession = (session: Omit<WorkoutSession, "date">) => {
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
          (e) => e.exerciseId === exerciseId
        );
        if (exerciseData) {
          return exerciseData;
        }
      }
      return null; // No previous data found
    },
    [history]
  );

  return { history, addWorkoutSession, getLatestExerciseData };
};
