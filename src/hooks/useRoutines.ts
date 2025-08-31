import { useState, useEffect } from 'react';
import { type Routine, type WorkoutDay } from '../types';

const ROUTINES_STORAGE_KEY = 'rutinify-routines';

export const useRoutines = () => {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  const saveRoutines = (newRoutines: Routine[]) => {
    try {
      localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(newRoutines));
      setRoutines(newRoutines);
    } catch (error) {
      console.error('Failed to save routines to localStorage', error);
    }
  };

  useEffect(() => {
    if (isInitialized) return; // Prevenir re-inicialización

    try {
      const storedRoutines = localStorage.getItem(ROUTINES_STORAGE_KEY);
      if (storedRoutines) {
        setRoutines(JSON.parse(storedRoutines));
      } else {
        // Comenzar con array vacío en la primera carga
        setRoutines([]);
      }
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to load routines', error);
      // En caso de error, comenzar con array vacío
      setRoutines([]);
      setIsInitialized(true);
    }
  }, [isInitialized]);

  const addRoutine = (routine: Routine) => {
    setRoutines(currentRoutines => {
      const newRoutines = [...currentRoutines, routine];

      // Actualizar localStorage inmediatamente
      try {
        localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(newRoutines));
      } catch (error) {
        console.error('Failed to save to localStorage in addRoutine', error);
      }

      return newRoutines;
    });
  };

  const updateRoutine = (updatedRoutine: Routine) => {
    const newRoutines = routines.map(routine =>
      routine.name === updatedRoutine.name ? updatedRoutine : routine
    );
    saveRoutines(newRoutines);
  };

  const deleteRoutine = (routineName: string) => {
    const newRoutines = routines.filter(
      routine => routine.name !== routineName
    );
    saveRoutines(newRoutines);
  };

  const deleteWorkoutDay = (routineName: string, dayToDelete: number) => {
    const newRoutines = routines
      .map(routine => {
        if (routine.name === routineName) {
          const updatedDays = routine.days.filter(
            day => day.day !== dayToDelete
          );
          // If this was the last day, remove the routine entirely
          if (updatedDays.length === 0) {
            return null;
          }
          return {
            ...routine,
            days: updatedDays,
          };
        }
        return routine;
      })
      .filter(Boolean) as Routine[];
    saveRoutines(newRoutines);
  };

  const updateWorkoutDay = (
    routineName: string,
    dayNumber: number,
    updatedDay: WorkoutDay
  ) => {
    const newRoutines = routines.map(routine => {
      if (routine.name === routineName) {
        const dayIndex = routine.days.findIndex(d => d.day === dayNumber);
        const newDays = [...routine.days];

        if (dayIndex === -1) {
          // Day not found, add it
          newDays.push(updatedDay);
        } else {
          // Day found, update it
          newDays[dayIndex] = updatedDay;
        }

        return {
          ...routine,
          days: newDays.sort((a, b) => a.day - b.day),
        };
      }
      return routine;
    });
    saveRoutines(newRoutines);
  };

  const updateDayName = (
    routineName: string,
    dayNumber: number,
    newDayName: string
  ) => {
    const newRoutines = routines.map(routine => {
      if (routine.name === routineName) {
        const newDays = routine.days.map(day => {
          if (day.day === dayNumber) {
            return {
              ...day,
              dayName: newDayName.trim() || undefined,
            };
          }
          return day;
        });

        return {
          ...routine,
          days: newDays,
        };
      }
      return routine;
    });
    saveRoutines(newRoutines);
  };

  const refreshRoutines = () => {
    try {
      const storedRoutines = localStorage.getItem(ROUTINES_STORAGE_KEY);
      if (storedRoutines) {
        setRoutines(JSON.parse(storedRoutines));
      }
    } catch (error) {
      console.error('Failed to refresh routines', error);
    }
  };

  return {
    routines,
    setRoutines: saveRoutines,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    deleteWorkoutDay,
    updateWorkoutDay,
    updateDayName,
    refreshRoutines,
  };
};
