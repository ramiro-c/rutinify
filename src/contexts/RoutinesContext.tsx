import { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { type Routine, type WorkoutDay, type WeekSettings } from '../types';

const ROUTINES_STORAGE_KEY = 'rutinify-routines';
const WEEK_SETTINGS_STORAGE_KEY = 'rutinify-week-settings';

export type RoutineInput = Omit<Routine, 'id'> & { id?: string };

function newRoutineId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function withId(input: RoutineInput): Routine {
  return { ...input, id: input.id ?? newRoutineId() };
}

function isValidRoutine(entry: unknown): entry is Routine {
  if (!entry || typeof entry !== 'object') return false;
  const r = entry as unknown as Record<string, unknown>;
  return (
    (typeof r.id === 'string' || typeof r.name === 'string') &&
    typeof r.name === 'string' &&
    Array.isArray(r.days)
  );
}

function normalizeRoutine(entry: Record<string, unknown>): Routine {
  return {
    id: typeof entry.id === 'string' ? entry.id : newRoutineId(),
    name: entry.name as string,
    days: entry.days as Routine['days'],
  };
}

/** Semana válida: entera 1-4 (igual que el CHECK week 1-4 de db/schema.sql). */
function isValidWeekSettings(entry: unknown): entry is WeekSettings {
  if (!entry || typeof entry !== 'object') return false;
  const w = (entry as { currentWeek?: unknown }).currentWeek;
  return typeof w === 'number' && Number.isInteger(w) && w >= 1 && w <= 4;
}

function requestPersistentStorage(): void {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    navigator.storage
      .persist()
      .then(granted => {
        if (!granted) {
          console.warn('[storage] Persistent storage not granted — data may be evicted on mobile');
        }
      })
      .catch(() => {
        // Storage API no disponible (navegación privada en algunos browsers).
      });
  }
}

interface RoutinesContextType {
  routines: Routine[];
  weekSettings: WeekSettings;
  addRoutine: (routine: RoutineInput) => void;
  /** Import: reemplaza el plan existente (mismo id o nombre), no mergea ni duplica. */
  upsertRoutine: (routine: RoutineInput) => void;
  updateRoutine: (updatedRoutine: Routine) => void;
  deleteRoutine: (routineName: string) => void;
  deleteWorkoutDay: (routineName: string, dayToDelete: number) => void;
  updateWorkoutDay: (routineName: string, dayNumber: number, updatedDay: WorkoutDay) => void;
  updateDayName: (routineName: string, dayNumber: number, newDayName: string) => void;
  updateRoutineName: (oldName: string, newName: string) => void;
  updateCurrentWeek: (week: number) => void;
}

const RoutinesContext = createContext<RoutinesContextType | undefined>(undefined);

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
      localStorage.setItem(WEEK_SETTINGS_STORAGE_KEY, JSON.stringify(newWeekSettings));
      setWeekSettings(newWeekSettings);
    } catch (error) {
      console.error('Failed to save week settings to localStorage', error);
    }
  };

  useEffect(() => {
    if (isGloballyInitialized) return;

    // navigator.storage.persist() para evitar evicción en el celular del gimnasio.
    requestPersistentStorage();

    try {
      const storedRoutines = localStorage.getItem(ROUTINES_STORAGE_KEY);
      if (storedRoutines) {
        const parsed: unknown = JSON.parse(storedRoutines);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(isValidRoutine).map(r => normalizeRoutine(r as unknown as Record<string, unknown>));
          setRoutines(valid);
          if (valid.length !== parsed.length) {
            localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(valid));
          }
        } else {
          console.error('Stored routines have unexpected shape — resetting');
          setRoutines([]);
        }
      } else {
        setRoutines([]);
      }

      const storedWeekSettings = localStorage.getItem(WEEK_SETTINGS_STORAGE_KEY);
      if (storedWeekSettings) {
        try {
          const parsed: unknown = JSON.parse(storedWeekSettings);
          if (isValidWeekSettings(parsed)) {
            setWeekSettings(parsed);
          } else {
            console.error('Stored week settings invalid (expected currentWeek 1-4) — resetting to week 1');
            setWeekSettings({ currentWeek: 1 });
            localStorage.setItem(WEEK_SETTINGS_STORAGE_KEY, JSON.stringify({ currentWeek: 1 }));
          }
        } catch {
          console.error('Stored week settings are not valid JSON — resetting to week 1');
          setWeekSettings({ currentWeek: 1 });
        }
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

  const addRoutine = (routine: RoutineInput) => {
    const withRoutineId = withId(routine);
    setRoutines(currentRoutines => {
      const newRoutines = [...currentRoutines, withRoutineId];
      try {
        localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(newRoutines));
      } catch (error) {
        console.error('Failed to save to localStorage in addRoutine', error);
      }
      return newRoutines;
    });
  };

  const upsertRoutine = (routine: RoutineInput) => {
    const next = withId(routine);
    setRoutines(currentRoutines => {
      const idx = currentRoutines.findIndex(r => r.id === next.id || r.name === next.name);
      const newRoutines =
        idx === -1
          ? [...currentRoutines, next]
          : currentRoutines.map((r, i) => (i === idx ? { ...next, id: r.id === next.id ? r.id : r.id } : r));
      // Preservar el id existente cuando el match fue por nombre legacy.
      const fixed =
        idx === -1
          ? newRoutines
          : newRoutines.map((r, i) => (i === idx ? { ...next, id: currentRoutines[idx].id } : r));
      try {
        localStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(fixed));
      } catch (error) {
        console.error('Failed to save to localStorage in upsertRoutine', error);
      }
      return fixed;
    });
  };

  const matchRoutine = (routine: Routine, updatedRoutine: Routine): boolean =>
    routine.id === updatedRoutine.id || routine.name === updatedRoutine.name;

  const updateRoutine = (updatedRoutine: Routine) => {
    const newRoutines = routines.map(routine =>
      matchRoutine(routine, updatedRoutine) ? { ...updatedRoutine, id: routine.id } : routine
    );
    saveRoutines(newRoutines);
  };

  const deleteRoutine = (routineName: string) => {
    const newRoutines = routines.filter(routine => routine.name !== routineName);
    saveRoutines(newRoutines);
  };

  const deleteWorkoutDay = (routineName: string, dayToDelete: number) => {
    const newRoutines = routines
      .map(routine => {
        if (routine.name === routineName) {
          const updatedDays = routine.days.filter(day => day.day !== dayToDelete);
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

  const updateWorkoutDay = (routineName: string, dayNumber: number, updatedDay: WorkoutDay) => {
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

  const updateDayName = (routineName: string, dayNumber: number, newDayName: string) => {
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
    if (!Number.isInteger(week) || week < 1 || week > 4) {
      console.warn(`[routines] Ignoring invalid week ${String(week)} (expected 1-4)`);
      return;
    }
    const newWeekSettings = { currentWeek: week };
    saveWeekSettings(newWeekSettings);
  };

  const updateRoutineName = (oldName: string, newName: string) => {
    if (newName.trim() === '' || newName === oldName) return;

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
    upsertRoutine,
    updateRoutine,
    deleteRoutine,
    deleteWorkoutDay,
    updateWorkoutDay,
    updateDayName,
    updateRoutineName,
    updateCurrentWeek,
  };

  return <RoutinesContext.Provider value={value}>{children}</RoutinesContext.Provider>;
};
