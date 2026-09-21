import { useState, useEffect, useRef, useCallback } from 'react';
import { useRoutines } from '../hooks/useRoutinesContext';
import { useWorkoutHistory } from '../hooks/useWorkoutHistory';
import { type Exercise } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Calendar } from 'lucide-react';
import {
  startSession,
  endSession,
  abortSession,
  recordCellEdit,
  reportSheetOpenings,
  track,
} from '../lib/telemetry';
import { saveCellLocal, saveNoteLocal } from '../lib/sync';

interface WorkoutViewProps {
  routineName: string;
  day: number;
  onBack: () => void;
}

type SessionData = Record<
  string,
  { sets: Record<number, { weight: string; reps: string }>; notes: string }
>;

const ExerciseLogger = ({
  exercise,
  setIndex,
  routineId,
  routineName,
  day,
  currentWeek,
}: {
  exercise: Exercise;
  setIndex: number;
  routineId: string | undefined;
  routineName: string;
  day: number;
  currentWeek: number;
}) => {
  const { getLatestExerciseData, getPreviousWeekExerciseData } =
    useWorkoutHistory();

  // Si no es semana 1, mostrar datos de la semana anterior
  const previousWeekData =
    currentWeek > 1
      ? getPreviousWeekExerciseData(exercise.id, currentWeek, routineName, day, routineId)
      : null;

  // Si no hay datos de la semana anterior, usar el último entrenamiento general
  const fallbackData = !previousWeekData
    ? getLatestExerciseData(exercise.id)
    : null;

  const previousData = previousWeekData || fallbackData;
  // Los sets guardados usan el set_index real de la grilla (ralo si el
  // usuario saltea un set): buscar por número de set, no por posición.
  const previousSet = previousData?.sets.find(s => s.set === setIndex);

  let previousSetDisplay = '-- kg x -- reps';
  let weekIndicator = '';

  if (previousSet && (previousSet.weight != null || previousSet.reps != null)) {
    previousSetDisplay = `${previousSet.weight ?? 'PC'} kg x ${
      previousSet.reps ?? '-'
    } reps`;

    // Agregar indicador de semana si es de la semana anterior
    if (previousWeekData && currentWeek > 1) {
      weekIndicator = ` (S${currentWeek - 1})`;
    }
  }

  return (
    <p className="text-xs text-muted-foreground w-32 text-right shrink-0">
      {previousSetDisplay}
      {weekIndicator}
    </p>
  );
};

export const WorkoutView = ({ routineName, day, onBack }: WorkoutViewProps) => {
  const { routines, weekSettings } = useRoutines();
  const { addWorkoutSession } = useWorkoutHistory();
  const [sessionData, setSessionData] = useState<SessionData>({});
  const [sheetOpenings, setSheetOpenings] = useState(0);
  const telemetrySessionId = useRef<string | null>(null);
  const focusTimers = useRef<Map<string, number>>(new Map());
  // Espejo del estado para leer el valor hermano (peso<->reps) en onBlur
  // sin re-suscribir los handlers en cada keystroke.
  const sessionDataRef = useRef<SessionData>({});

  // Start telemetry session on mount. Guard contra el doble-invoke de
  // React StrictMode en dev: sin esto se crean dos sesiones telemétricas
  // por apertura y la primera queda huérfana sin endSession.
  // Cleanup + pagehide: cerrar la pestaña a mitad de sesión dejaba una
  // sesión completed:false que cortaba la cadena de consecutivas en
  // computeConsecutive. Al desmontar sin haber finalizado ni cancelado
  // (ref todavía seteado) se aborta la huérfana; Finish y Cancel ya
  // limpiaron el ref, así que sus paths no se tocan. En pagehide se
  // respeta bfcache (persisted=true): la página puede volver y la sesión
  // sigue viva.
  useEffect(() => {
    if (telemetrySessionId.current) return;
    telemetrySessionId.current = startSession();
    track('session_started', { routineName, day });
    const abortOrphan = () => {
      if (telemetrySessionId.current) {
        abortSession();
        telemetrySessionId.current = null;
      }
    };
    const onPageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) abortOrphan();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      abortOrphan();
    };
  }, []);

  // Cancelar no es una sesión rota: la sesión huérfana (completed:false)
  // cortaría la cadena de consecutivas en computeConsecutive. Se aborta
  // (elimina) para que un simple Cancel no rompa la señal de éxito.
  const handleCancel = useCallback(() => {
    abortSession();
    telemetrySessionId.current = null;
    onBack();
  }, [onBack]);

  const routine = routines.find(r => r.name === routineName);
  const workoutDay = routine?.days.find(d => d.day === day);

  // Focus handler: record timestamp when user focuses a cell input
  const handleInputFocus = useCallback(
    (exerciseId: string, setIndex: number, field: 'weight' | 'reps') => {
      const key = `${exerciseId}:${setIndex}:${field}`;
      focusTimers.current.set(key, Date.now());
    },
    []
  );

  // Blur handler: compute duration and record cell edit timing.
  // Además persiste la celda (exercise_id, week, set_index) al store
  // cell-level con LWW, para que lo ingresado no viva solo en memoria.
  const persistCellFromInputs = useCallback(
    (exerciseId: string, setIndex: number, week: number) => {
      const sets = sessionDataRef.current[exerciseId]?.sets?.[setIndex];
      const rawWeight = sets?.weight?.trim() ?? '';
      const rawReps = sets?.reps?.trim() ?? '';
      // Celda vaciada por el usuario: persiste null/null (tombstone con
      // updated_at nuevo) para que el CellRecord viejo no sobreviva como
      // fantasma al export y al sync. Sin esto no hay forma de vaciarla.
      if (rawWeight === '' && rawReps === '') {
        saveCellLocal({
          exercise_id: exerciseId,
          week,
          set_index: setIndex,
          weight: null,
          reps: null,
        });
        return;
      }
      // Validación estricta de string completo: parseFloat acepta
      // sufijos ("80abc" -> 80); el paste/autofill puede inyectarlos
      // aunque el input sea type=number. Sin signo: los negativos se
      // rechazan como el parser CSV (parseWeekWeight exige n >= 0).
      const weight =
        rawWeight === '' || !/^\d+(\.\d+)?$/.test(rawWeight)
          ? null
          : parseFloat(rawWeight);
      const reps =
        rawReps === '' || !/^\d+$/.test(rawReps) ? null : parseInt(rawReps, 10);
      saveCellLocal({
        exercise_id: exerciseId,
        week,
        set_index: setIndex,
        weight: Number.isFinite(weight) ? (weight as number) : null,
        reps: Number.isFinite(reps) ? (reps as number) : null,
      });
    },
    []
  );

  const handleInputBlur = useCallback(
    (
      exerciseId: string,
      setIndex: number,
      field: 'weight' | 'reps',
      value: string
    ) => {
      const key = `${exerciseId}:${setIndex}:${field}`;
      const focusAt = focusTimers.current.get(key);
      // La persistencia corre siempre que hubo foco (incluso si el campo
      // quedó vacío: vaciar una celda debe borrar el CellRecord viejo vía
      // tombstone null/null). El timing telemétrico solo se registra con
      // valor no vacío para no contaminar el promedio con blurs vacíos.
      if (focusAt) {
        const blurAt = Date.now();
        if (value.trim() !== '') {
          recordCellEdit({
            exerciseId,
            week: weekSettings.currentWeek,
            setIndex,
            focusAt,
            blurAt,
          });
          track('cell_edited', {
            exerciseId,
            week: weekSettings.currentWeek,
            setIndex,
            durationMs: blurAt - focusAt,
          });
        }
        persistCellFromInputs(exerciseId, setIndex, weekSettings.currentWeek);
      }
      focusTimers.current.delete(key);
    },
    [weekSettings.currentWeek, persistCellFromInputs]
  );

  const handleInputChange = (
    exerciseId: string,
    setIndex: number,
    field: 'weight' | 'reps',
    value: string
  ) => {
    setSessionData(prev => {
      const next = {
        ...prev,
        [exerciseId]: {
          ...prev[exerciseId],
          sets: {
            ...prev[exerciseId]?.sets,
            [setIndex]: {
              ...prev[exerciseId]?.sets?.[setIndex],
              [field]: value,
            },
          },
        },
      };
      sessionDataRef.current = next;
      return next;
    });
  };

  const handleNotesChange = (exerciseId: string, value: string) => {
    setSessionData(prev => {
      const next = {
        ...prev,
        [exerciseId]: {
          ...prev[exerciseId],
          notes: value,
        },
      };
      sessionDataRef.current = next;
      return next;
    });
  };

  // Parseo estricto: el string completo debe ser numérico sin signo.
  // parseFloat acepta sufijos ("80abc" -> 80) y el paste/autofill puede
  // inyectar texto con sufijo aunque el input sea type=number. Los
  // negativos se rechazan como el parser CSV (parseWeekWeight exige n>=0).
  const parseWeightInput = (raw: string): number | null => {
    const t = raw.trim();
    if (t === '') return null;
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  };

  const parseRepsInput = (raw: string): number | null => {
    const t = raw.trim();
    if (t === '') return null;
    if (!/^\d+$/.test(t)) return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  };

  // Las notas se persisten al salir del campo (blur), igual que las
  // celdas: si la app se cierra a mitad de sesión, las notas tipeadas
  // sobreviven como las celdas. El guardado al finalizar se conserva
  // (idempotente por PK exercise_id+week) como garantía redundante.
  const handleNotesBlur = (exerciseId: string, week: number) => {
    const text = sessionDataRef.current[exerciseId]?.notes?.trim() ?? '';
    if (text !== '') {
      saveNoteLocal({ exercise_id: exerciseId, week, text });
    }
  };

  const handleFinishWorkout = () => {
    const week = weekSettings.currentWeek;
    // Se preserva el set_index real de la grilla (clave de Object.entries):
    // si el usuario saltea un set, los intermedios vacíos se filtran pero
    // los guardados conservan su índice original en vez de renumerarse.
    // parseFloat||null convertía un peso legítimo de 0 en null; el parseo
    // explícito distingue "" (vacío -> null) de "0" (0 válido).
    const completedExercises = Object.entries(sessionData).map(
      ([exerciseId, data]) => ({
        exerciseId,
        sets: Object.entries(data.sets || {})
          .map(([key, set]) => ({
            set: Number(key),
            weight: parseWeightInput(set.weight),
            reps: parseRepsInput(set.reps),
          }))
          .filter(s => s.weight !== null || s.reps !== null),
        notes: data.notes,
      })
    );

    // Guard anti tap-accidental: sin celdas ni notas no hubo
    // entrenamiento; registrarla como completada inflaría la señal
    // primaria (>=4 sesiones consecutivas). Mínimo: 1 celda o 1 nota.
    const filledSets = completedExercises.reduce((n, ex) => n + ex.sets.length, 0);
    const hasNotes = completedExercises.some(ex => ex.notes && ex.notes.trim() !== '');
    if (filledSets === 0 && !hasNotes) {
      abortSession();
      telemetrySessionId.current = null;
      onBack();
      return;
    }

    // Persistir cada set como CellRecord individual (PK exercise_id,
    // week, set_index) con LWW + outbox, para que el flujo normal de
    // usuario pueble el store cell-level que el export y el sync leen.
    for (const ex of completedExercises) {
      ex.sets.forEach(s => {
        saveCellLocal({
          exercise_id: ex.exerciseId,
          week,
          set_index: s.set,
          weight: s.weight,
          reps: s.reps,
        });
      });
      if (ex.notes && ex.notes.trim() !== '') {
        saveNoteLocal({ exercise_id: ex.exerciseId, week, text: ex.notes.trim() });
      }
    }

    addWorkoutSession({
      routineId: routine?.id,
      routineName,
      dayCompleted: day,
      week,
      completedExercises,
    });

    // End telemetry session
    reportSheetOpenings(sheetOpenings);
    endSession();
    track('session_completed', {
      routineName,
      day,
      week: weekSettings.currentWeek,
      exercises: completedExercises.length,
      sheetOpenings,
    });

    onBack();
  };

  if (!workoutDay) {
    return (
      <div className="text-center">
        <p>Día de entrenamiento no encontrado.</p>
        <Button onClick={handleCancel} variant="outline" className="mt-4">
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight">Día {day}</h2>
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              Semana {weekSettings.currentWeek}
            </span>
          </div>
        </div>
        <Button onClick={handleCancel} variant="outline">
          Cancelar
        </Button>
      </div>

      {workoutDay.supersets.map(superset => (
        <Card key={superset.id}>
          <CardHeader>
            <CardTitle>Superserie {superset.id}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {superset.exercises.map(exercise => (
              <div key={exercise.id} className="border-t pt-4">
                <div className="mb-3">
                  <h4 className="font-semibold text-lg tracking-tight">
                    {exercise.name}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">
                      {exercise.sets.length} series
                    </span>{' '}
                    | Tempo: {exercise.tempo} |{' '}
                    <span className="font-mono bg-muted rounded px-1.5 py-0.5 text-xs">
                      {exercise.supersetCode}
                    </span>
                  </p>
                  {exercise.notes && (
                    <p className="text-sm italic text-muted-foreground mt-1">
                      Nota: {exercise.notes}
                    </p>
                  )}
                  {(() => {
                    const planned =
                      exercise.weeklyWeights?.[weekSettings.currentWeek - 1] ?? null;
                    return planned !== null && planned !== undefined ? (
                      <p className="text-sm font-medium text-primary mt-1">
                        Plan semana {weekSettings.currentWeek}: {planned} kg
                      </p>
                    ) : null;
                  })()}
                </div>

                <div className="space-y-2">
                  {Array.from({
                    length: exercise.sets.length || 1,
                  }).map((_, setIndex) => (
                    <div
                      key={setIndex}
                      className="flex items-center gap-3 p-2 rounded-md odd:bg-muted/50"
                    >
                      <span className="font-mono text-sm text-muted-foreground">
                        S{setIndex + 1}
                      </span>
                      <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input
                          type="number"
                          placeholder={
                            exercise.weeklyWeights?.[weekSettings.currentWeek - 1] != null
                              ? `Peso (kg) · plan ${exercise.weeklyWeights[weekSettings.currentWeek - 1]}`
                              : 'Peso (kg)'
                          }
                          onFocus={() =>
                            handleInputFocus(exercise.id, setIndex, 'weight')
                          }
                          onBlur={e =>
                            handleInputBlur(
                              exercise.id,
                              setIndex,
                              'weight',
                              e.target.value
                            )
                          }
                          onChange={e =>
                            handleInputChange(
                              exercise.id,
                              setIndex,
                              'weight',
                              e.target.value
                            )
                          }
                        />
                        <Input
                          type="number"
                          placeholder="Reps"
                          onFocus={() =>
                            handleInputFocus(exercise.id, setIndex, 'reps')
                          }
                          onBlur={e =>
                            handleInputBlur(
                              exercise.id,
                              setIndex,
                              'reps',
                              e.target.value
                            )
                          }
                          onChange={e =>
                            handleInputChange(
                              exercise.id,
                              setIndex,
                              'reps',
                              e.target.value
                            )
                          }
                        />
                      </div>
                      <ExerciseLogger
                        exercise={exercise}
                        setIndex={setIndex}
                        routineId={routine?.id}
                        routineName={routineName}
                        day={day}
                        currentWeek={weekSettings.currentWeek}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <Input
                    placeholder="Notas de la sesión para este ejercicio..."
                    onChange={e =>
                      handleNotesChange(exercise.id, e.target.value)
                    }
                    onBlur={() =>
                      handleNotesBlur(exercise.id, weekSettings.currentWeek)
                    }
                    className="text-sm"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Telemetry: Sheet opening counter (author-reported per session) */}
      <Card className="border-dashed">
        <CardContent className="py-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            veces que abrí el Sheet durante esta sesión:
          </span>
          <Input
            type="number"
            min={0}
            value={sheetOpenings}
            onChange={e => setSheetOpenings(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="w-20 text-center"
          />
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="w-full font-bold text-lg"
        onClick={handleFinishWorkout}
      >
        Finalizar Entrenamiento
      </Button>
    </div>
  );
};
