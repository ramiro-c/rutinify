import { useState } from 'react';
import { useRoutines } from '../hooks/useRoutinesContext';
import { useWorkoutHistory } from '../hooks/useWorkoutHistory';
import { type Exercise } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Calendar } from 'lucide-react';

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
  routineName,
  day,
  currentWeek,
}: {
  exercise: Exercise;
  setIndex: number;
  routineName: string;
  day: number;
  currentWeek: number;
}) => {
  const { getLatestExerciseData, getPreviousWeekExerciseData } =
    useWorkoutHistory();

  // Si no es semana 1, mostrar datos de la semana anterior
  const previousWeekData =
    currentWeek > 1
      ? getPreviousWeekExerciseData(exercise.id, currentWeek, routineName, day)
      : null;

  // Si no hay datos de la semana anterior, usar el último entrenamiento general
  const fallbackData = !previousWeekData
    ? getLatestExerciseData(exercise.id)
    : null;

  const previousData = previousWeekData || fallbackData;
  const previousSet = previousData?.sets[setIndex];

  // Debug específico para IDs
  if (setIndex === 0) {
    // Solo log en el primer set para evitar spam
    console.log(
      `🔍 Exercise ID Debug: "${exercise.name}" -> "${exercise.id}"`,
      {
        currentWeek,
        foundPreviousWeekData: !!previousWeekData,
        foundFallbackData: !!fallbackData,
      }
    );
  }

  let previousSetDisplay = '-- kg x -- reps';
  let weekIndicator = '';

  if (previousSet && (previousSet.weight || previousSet.reps)) {
    previousSetDisplay = `${previousSet.weight || 'PC'} kg x ${
      previousSet.reps || '-'
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
  // ... (state and handlers remain the same)
  const { routines, weekSettings } = useRoutines();
  const { addWorkoutSession } = useWorkoutHistory();
  const [sessionData, setSessionData] = useState<SessionData>({});

  const routine = routines.find(r => r.name === routineName);
  const workoutDay = routine?.days.find(d => d.day === day);

  const handleInputChange = (
    exerciseId: string,
    setIndex: number,
    field: 'weight' | 'reps',
    value: string
  ) => {
    setSessionData(prev => ({
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
    }));
  };

  const handleNotesChange = (exerciseId: string, value: string) => {
    setSessionData(prev => ({
      ...prev,
      [exerciseId]: {
        ...prev[exerciseId],
        notes: value,
      },
    }));
  };

  const handleFinishWorkout = () => {
    const completedExercises = Object.entries(sessionData).map(
      ([exerciseId, data]) => ({
        exerciseId,
        sets: Object.values(data.sets || {})
          .map((set, index) => ({
            set: index + 1,
            weight: parseFloat(set.weight) || null,
            reps: parseInt(set.reps, 10) || null,
          }))
          .filter(s => s.weight !== null || s.reps !== null), // Only save sets with some data
        notes: data.notes,
      })
    );

    addWorkoutSession({
      routineName,
      dayCompleted: day,
      week: weekSettings.currentWeek,
      completedExercises,
    });
    onBack(); // Go back to the list view
  };

  if (!workoutDay) {
    return (
      <div className="text-center">
        <p>Día de entrenamiento no encontrado.</p>
        <Button onClick={onBack} variant="outline" className="mt-4">
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
        <Button onClick={onBack} variant="outline">
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
                      <div className="flex-grow grid grid-cols-2 gap-3">
                        <Input
                          type="number"
                          placeholder="Peso (kg)"
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
                    className="text-sm"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

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
