
import { useState } from 'react';
import { useRoutines } from '../hooks/useRoutines';
import { useWorkoutHistory } from '../hooks/useWorkoutHistory';
import { type CompletedSet, type Exercise } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface WorkoutViewProps {
  routineName: string;
  day: number;
  onBack: () => void;
}

type SessionData = Record<string, { sets: Record<number, { weight: string; reps: string }>, notes: string }>;

const ExerciseLogger = ({ exercise, setIndex }: { exercise: Exercise, setIndex: number }) => {
  const { getLatestExerciseData } = useWorkoutHistory();
  const previousData = getLatestExerciseData(exercise.id);
  const previousSet = previousData?.sets[setIndex];

  let previousSetDisplay = '-- kg x -- reps';
  if (previousSet && (previousSet.weight || previousSet.reps)) {
    previousSetDisplay = `${previousSet.weight || 'PC'} kg x ${previousSet.reps || '-'} reps`;
  }

  return (
    <p className="text-xs text-muted-foreground w-32 text-right shrink-0">
      {previousSetDisplay}
    </p>
  );
};

export const WorkoutView = ({ routineName, day, onBack }: WorkoutViewProps) => {
  // ... (state and handlers remain the same)
  const { routines } = useRoutines();
  const { addWorkoutSession } = useWorkoutHistory();
  const [sessionData, setSessionData] = useState<SessionData>({});

  const routine = routines.find(r => r.name === routineName);
  const workoutDay = routine?.days.find(d => d.day === day);

  const handleInputChange = (exerciseId: string, setIndex: number, field: 'weight' | 'reps', value: string) => {
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
    const completedExercises = Object.entries(sessionData).map(([exerciseId, data]) => ({
      exerciseId,
      sets: Object.values(data.sets || {}).map((set, index) => ({
        set: index + 1,
        weight: parseFloat(set.weight) || null,
        reps: parseInt(set.reps, 10) || null,
      })).filter(s => s.weight !== null || s.reps !== null), // Only save sets with some data
      notes: data.notes,
    }));

    addWorkoutSession({
      routineName,
      dayCompleted: day,
      completedExercises,
    });
    onBack(); // Go back to the list view
  };


  if (!workoutDay) {
    return (
      <div className="text-center">
        <p>Día de entrenamiento no encontrado.</p>
        <Button onClick={onBack} variant="outline" className="mt-4">Volver</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold tracking-tight">Día {day}</h2>
        <Button onClick={onBack} variant="outline">Cancelar</Button>
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
                  <h4 className="font-semibold text-lg tracking-tight">{exercise.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{exercise.series}x{exercise.reps}</span> | Tempo: {exercise.tempo} | <span className="font-mono bg-muted rounded px-1.5 py-0.5 text-xs">{exercise.supersetCode}</span>
                  </p>
                  {exercise.notes && <p className="text-sm italic text-muted-foreground mt-1">Nota: {exercise.notes}</p>}
                </div>

                <div className="space-y-2">
                  {Array.from({ length: parseInt(exercise.series, 10) || 1 }).map((_, setIndex) => (
                    <div key={setIndex} className="flex items-center gap-3 p-2 rounded-md odd:bg-muted/50">
                      <span className="font-mono text-sm text-muted-foreground">S{setIndex + 1}</span>
                      <div className="flex-grow grid grid-cols-2 gap-3">
                        <Input 
                          type="number" 
                          placeholder="Peso (kg)" 
                          onChange={e => handleInputChange(exercise.id, setIndex, 'weight', e.target.value)}
                        />
                        <Input 
                          type="number" 
                          placeholder="Reps" 
                          onChange={e => handleInputChange(exercise.id, setIndex, 'reps', e.target.value)}
                        />
                      </div>
                      <ExerciseLogger exercise={exercise} setIndex={setIndex} />
                    </div>
                  ))}
                </div>
                 <div className="mt-3">
                    <Input 
                      placeholder="Notas de la sesión para este ejercicio..." 
                      onChange={e => handleNotesChange(exercise.id, e.target.value)}
                      className="text-sm"
                    />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Button size="lg" className="w-full font-bold text-lg" onClick={handleFinishWorkout}>Finalizar Entrenamiento</Button>
    </div>
  );
};
