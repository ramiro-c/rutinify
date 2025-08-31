import { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  type Routine,
  type WorkoutDay,
  type Superset,
  type Exercise,
} from '../types';
import rawRoutineCsv from '../../data/rutina-ejemplo.csv?raw';

const ROUTINES_STORAGE_KEY = 'rutinify-routines';

// Helper function to parse the raw CSV data
const parseRoutineCsv = (csv: string): Routine[] => {
  const lines = csv.split('\r\n').filter(line => line.trim() !== '');
  const headers = lines[0].split(',');

  const routineData = lines.slice(1).reduce(
    (acc, line) => {
      const values = line.split(',');
      const entry = headers.reduce(
        (obj, header, index) => {
          obj[header.trim()] = values[index] ? values[index].trim() : '';
          return obj;
        },
        {} as Record<string, string>
      );

      const day = parseInt(entry['Día'], 10);
      if (!isNaN(day)) {
        if (!acc[day]) {
          acc[day] = [];
        }
        acc[day].push(entry);
      }
      return acc;
    },
    {} as Record<number, Record<string, string>[]>
  );

  const days: WorkoutDay[] = Object.keys(routineData).map(dayNumberStr => {
    const day = parseInt(dayNumberStr, 10);
    const exercisesForDay = routineData[day];

    const supersetData = exercisesForDay.reduce(
      (acc, ex) => {
        const supersetGroup = ex['Superserie'].replace(/\d/g, ''); // A1 -> A
        if (!acc[supersetGroup]) {
          acc[supersetGroup] = [];
        }
        acc[supersetGroup].push(ex);
        return acc;
      },
      {} as Record<string, Record<string, string>[]>
    );

    const supersets: Superset[] = Object.keys(supersetData).map(
      supersetGroup => {
        const exercises: Exercise[] = supersetData[supersetGroup].map(
          (ex: Record<string, string>) => {
            const seriesCount = parseInt(ex['Series'], 10) || 3;
            const repsCount = parseInt(ex['Reps'], 10) || 10;

            // Crear sets basados en las series
            const sets = Array.from({ length: seriesCount }, () => ({
              id: crypto.randomUUID(),
              type: 'reps' as const,
              weight: 0,
              reps: repsCount,
              completed: false,
            }));

            return {
              id: crypto.randomUUID(),
              name: ex['Ejercicio'],
              type: 'reps' as const,
              sets,
              tempo: ex['Tempo'],
              supersetCode: ex['Superserie'],
              notes: ex['Notas'],
            };
          }
        );
        return {
          id: supersetGroup,
          exercises,
        };
      }
    );

    return {
      day,
      dayName: `Día ${day}`,
      supersets,
    };
  });

  const initialRoutine: Routine = {
    name: 'Mi Rutina Actual',
    days: days.sort((a, b) => a.day - b.day),
  };

  return [initialRoutine];
};

interface RoutinesContextType {
  routines: Routine[];
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
}

const RoutinesContext = createContext<RoutinesContextType | undefined>(
  undefined
);

export { RoutinesContext };

let isGloballyInitialized = false;

export const RoutinesProvider = ({ children }: { children: ReactNode }) => {
  const [routines, setRoutines] = useState<Routine[]>([]);

  const saveRoutines = (newRoutines: Routine[]) => {
    try {
      console.log(
        '[RoutinesContext] saveRoutines called with:',
        newRoutines.length,
        'routines'
      );
      localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(newRoutines));
      setRoutines(newRoutines);
      console.log(
        '[RoutinesContext] State updated with:',
        newRoutines.length,
        'routines'
      );
    } catch (error) {
      console.error('Failed to save routines to localStorage', error);
    }
  };

  useEffect(() => {
    if (isGloballyInitialized) return;

    console.log('[RoutinesContext] Initializing...');
    try {
      const storedRoutines = localStorage.getItem(ROUTINES_STORAGE_KEY);
      console.log(
        '[RoutinesContext] localStorage value:',
        storedRoutines ? JSON.parse(storedRoutines).length : 'null'
      );

      if (storedRoutines) {
        setRoutines(JSON.parse(storedRoutines));
      } else {
        console.log(
          '[RoutinesContext] No localStorage found, loading initial routines'
        );
        const initialRoutines = parseRoutineCsv(rawRoutineCsv);
        saveRoutines(initialRoutines);
      }

      isGloballyInitialized = true;
    } catch (error) {
      console.error('Failed to load routines', error);
      setRoutines([]);
      isGloballyInitialized = true;
    }
  }, []);

  const addRoutine = (routine: Routine) => {
    console.log('[RoutinesContext] addRoutine called with:', routine.name);
    setRoutines(currentRoutines => {
      console.log(
        '[RoutinesContext] Current routines:',
        currentRoutines.length
      );
      const newRoutines = [...currentRoutines, routine];
      console.log('[RoutinesContext] New routines:', newRoutines.length);

      // Actualizar localStorage inmediatamente
      try {
        localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(newRoutines));
        console.log('[RoutinesContext] localStorage updated');
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

  const value = {
    routines,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    deleteWorkoutDay,
    updateWorkoutDay,
    updateDayName,
  };

  return (
    <RoutinesContext.Provider value={value}>
      {children}
    </RoutinesContext.Provider>
  );
};
