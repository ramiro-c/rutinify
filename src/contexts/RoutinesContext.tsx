import { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { type Routine, type WorkoutDay, type WeekSettings } from '../types';

const ROUTINES_STORAGE_KEY = 'rutinify-routines';
const WEEK_SETTINGS_STORAGE_KEY = 'rutinify-week-settings';

interface RoutinesContextType {
  routines: Routine[];
  weekSettings: WeekSettings;
  addRoutine: (routine: Routine) => void;
  updateRoutine: (updatedRoutine: Routine) => void;
  deleteRoutine: (routineName: string) => void;
  deleteWorkoutDay: (routineName: string, dayToDelete: number) => void;
  updateWorkoutDay: (
    routineName: string,
    dayNumber: number,
    updatedDay: WorkoutDay
  ) => void;
  updateDayName: (
    routineName: string,
    dayNumber: number,
    newDayName: string
  ) => void;
  updateRoutineName: (oldName: string, newName: string) => void;
  updateCurrentWeek: (week: number) => void;
}

const RoutinesContext = createContext<RoutinesContextType | undefined>(
  undefined
);

export { RoutinesContext };

let isGloballyInitialized = false;

export const RoutinesProvider = ({ children }: { children: ReactNode }) => {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [weekSettings, setWeekSettings] = useState<WeekSettings>({
    currentWeek: 1,
  });

  const saveRoutines = (newRoutines: Routine[]) => {
    try {
      localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(newRoutines));
      setRoutines(newRoutines);
    } catch (error) {
      console.error('Failed to save routines to localStorage', error);
    }
  };

  const saveWeekSettings = (newWeekSettings: WeekSettings) => {
    try {
      localStorage.setItem(
        WEEK_SETTINGS_STORAGE_KEY,
        JSON.stringify(newWeekSettings)
      );
      setWeekSettings(newWeekSettings);
    } catch (error) {
      console.error('Failed to save week settings to localStorage', error);
    }
  };

  useEffect(() => {
    if (isGloballyInitialized) return;

    try {
      // Cargar rutinas
      const storedRoutines = localStorage.getItem(ROUTINES_STORAGE_KEY);
      if (storedRoutines) {
        setRoutines(JSON.parse(storedRoutines));
      } else {
        setRoutines([]);
      }

      // Cargar configuraciones de semana
      const storedWeekSettings = localStorage.getItem(
        WEEK_SETTINGS_STORAGE_KEY
      );
      if (storedWeekSettings) {
        setWeekSettings(JSON.parse(storedWeekSettings));
      } else {
        setWeekSettings({ currentWeek: 1 });
      }

      isGloballyInitialized = true;
    } catch (error) {
      console.error('Failed to load data from localStorage', error);
      setRoutines([]);
      setWeekSettings({ currentWeek: 1 });
      isGloballyInitialized = true;
    }
  }, []);

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
          newDays.push(updatedDay);
        } else {
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

  const updateCurrentWeek = (week: number) => {
    const newWeekSettings = { currentWeek: week };
    saveWeekSettings(newWeekSettings);
  };

  const updateRoutineName = (oldName: string, newName: string) => {
    if (newName.trim() === '' || newName === oldName) return;

    // Check if new name already exists
    if (routines.some(routine => routine.name === newName)) {
      alert('Ya existe una rutina con ese nombre');
      return;
    }

    const newRoutines = routines.map(routine =>
      routine.name === oldName ? { ...routine, name: newName } : routine
    );
    saveRoutines(newRoutines);
  };

  const value = {
    routines,
    weekSettings,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    deleteWorkoutDay,
    updateWorkoutDay,
    updateDayName,
    updateRoutineName,
    updateCurrentWeek,
  };

  return (
    <RoutinesContext.Provider value={value}>
      {children}
    </RoutinesContext.Provider>
  );
};
