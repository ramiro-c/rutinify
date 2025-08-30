import { useState, useEffect } from 'react';
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
          (ex: Record<string, string>) => ({
            id: crypto.randomUUID(),
            name: ex['Ejercicio'],
            series: ex['Series'],
            reps: ex['Reps'],
            tempo: ex['Tempo'],
            supersetCode: ex['Superserie'],
            notes: ex['Notas'],
          })
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

export const useRoutines = () => {
  const [routines, setRoutines] = useState<Routine[]>([]);

  useEffect(() => {
    try {
      const storedRoutines = localStorage.getItem(ROUTINES_STORAGE_KEY);
      if (storedRoutines && storedRoutines !== '[]') {
        setRoutines(JSON.parse(storedRoutines));
      } else {
        // If localStorage is empty, parse the CSV and set it as the initial state
        const initialRoutines = parseRoutineCsv(rawRoutineCsv);
        saveRoutines(initialRoutines);
      }
    } catch (error) {
      console.error('Failed to load or parse routines', error);
      // Fallback to CSV if parsing fails
      try {
        const initialRoutines = parseRoutineCsv(rawRoutineCsv);
        saveRoutines(initialRoutines);
      } catch (csvError) {
        console.error('Failed to parse fallback CSV', csvError);
        setRoutines([]);
      }
    }
  }, []);

  const saveRoutines = (newRoutines: Routine[]) => {
    try {
      localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(newRoutines));
      setRoutines(newRoutines);
    } catch (error) {
      console.error('Failed to save routines to localStorage', error);
    }
  };

  const addRoutine = (routine: Routine) => {
    const newRoutines = [...routines, routine];
    saveRoutines(newRoutines);
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
      .filter(Boolean) as Routine[]; // filter(Boolean) removes nulls
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

  return {
    routines,
    setRoutines: saveRoutines,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    deleteWorkoutDay,
    updateWorkoutDay,
    updateDayName,
  };
};
