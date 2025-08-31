import { useState, useEffect } from 'react';
import { useRoutines } from '../hooks/useRoutines';
import {
  type WorkoutDay,
  type Exercise,
  type ExerciseType,
  type ExerciseSet,
  type RepsSet,
  type TimeSet,
  type WeightTimeSet,
} from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Trash2, Plus } from 'lucide-react';
import { ExerciseTypeSelector, SetInputs } from './ExerciseInputs';
import { migrateExercise, createNewExercise } from '../utils/exerciseMigration';

interface EditDayViewProps {
  routineName: string;
  day: number;
  onBack: () => void;
}

export const EditDayView = ({ routineName, day, onBack }: EditDayViewProps) => {
  const { routines, updateWorkoutDay } = useRoutines();
  const [editedDay, setEditedDay] = useState<WorkoutDay | null>(null);

  useEffect(() => {
    const routine = routines.find(r => r.name === routineName);
    const dayData = routine?.days.find(d => d.day === day);

    if (dayData) {
      // Migrar ejercicios al nuevo formato si es necesario
      const migratedDay = {
        ...dayData,
        supersets: dayData.supersets.map(superset => ({
          ...superset,
          exercises: superset.exercises.map(exercise =>
            migrateExercise(exercise)
          ),
        })),
      };
      setEditedDay(migratedDay);
    } else {
      // If day doesn't exist, initialize a new one
      const newDay = {
        day: day,
        supersets: [],
      };
      setEditedDay(newDay);
    }
  }, [routines, routineName, day]);

  const handleAddSuperset = () => {
    if (!editedDay) return;
    const newDay = { ...editedDay };
    const newSupersetId = String.fromCharCode(65 + newDay.supersets.length); // A, B, C...
    newDay.supersets.push({
      id: newSupersetId,
      exercises: [],
    });
    setEditedDay(newDay);
  };

  const handleExerciseChange = (
    supersetId: string,
    exerciseId: string,
    field: keyof Exercise,
    value: string | ExerciseType | ExerciseSet[]
  ) => {
    if (!editedDay) return;
    const newDay = { ...editedDay };
    const superset = newDay.supersets.find(s => s.id === supersetId);
    if (!superset) return;
    const exercise = superset.exercises.find(e => e.id === exerciseId);
    if (!exercise) return;

    // Si se está cambiando el tipo de ejercicio, actualizar los sets
    if (field === 'type' && typeof value === 'string') {
      const newType = value as ExerciseType;
      exercise.type = newType;

      // Recrear sets según el nuevo tipo
      const currentSetsCount = exercise.sets.length || 3;
      exercise.sets = Array.from({ length: currentSetsCount }, () => {
        if (newType === 'reps') {
          return {
            id: crypto.randomUUID(),
            type: 'reps',
            weight: 0,
            reps: 10,
            completed: false,
          } as RepsSet;
        } else if (newType === 'time') {
          return {
            id: crypto.randomUUID(),
            type: 'time',
            duration: '0:30',
            completed: false,
          } as TimeSet;
        } else {
          return {
            id: crypto.randomUUID(),
            type: 'weight-time',
            weight: 0,
            duration: '1:00',
            completed: false,
          } as WeightTimeSet;
        }
      });
    } else {
      (exercise as unknown as Record<string, unknown>)[field] = value;
    }

    setEditedDay(newDay);
  };

  const handleAddExercise = (supersetId: string) => {
    if (!editedDay) return;
    const newDay = { ...editedDay };
    const superset = newDay.supersets.find(s => s.id === supersetId);
    if (!superset) return;

    const newExercise = createNewExercise(
      `${superset.id}${superset.exercises.length + 1}`
    );
    superset.exercises.push(newExercise);
    setEditedDay(newDay);
  };

  const handleRemoveExercise = (supersetId: string, exerciseId: string) => {
    if (!editedDay) return;
    const newDay = { ...editedDay };
    const superset = newDay.supersets.find(s => s.id === supersetId);
    if (!superset) return;
    superset.exercises = superset.exercises.filter(e => e.id !== exerciseId);
    setEditedDay(newDay);
  };

  const handleSaveChanges = () => {
    if (editedDay) {
      updateWorkoutDay(routineName, day, editedDay);
      onBack();
    }
  };

  if (!editedDay) {
    return (
      <div className="text-center">
        <p>Cargando día...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Editando {editedDay.dayName || `Día ${day}`}
          {editedDay.dayName && (
            <span className="text-lg font-normal text-muted-foreground ml-2">
              (Día {day})
            </span>
          )}
        </h2>
        <Button size="lg" onClick={handleSaveChanges}>
          Guardar Cambios
        </Button>
      </div>

      {editedDay.supersets.length === 0 ? (
        <div className="text-center mt-8 border-2 border-dashed rounded-lg p-12">
          <p className="text-lg font-semibold mb-4">
            Este día no tiene superseries aún.
          </p>
          <Button onClick={handleAddSuperset}>
            <Plus className="mr-2 h-4 w-4" /> Añadir Superserie
          </Button>
        </div>
      ) : (
        editedDay.supersets.map(superset => (
          <Card key={superset.id}>
            <CardHeader>
              <CardTitle>Superserie {superset.id}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {superset.exercises.map(exercise => (
                <div
                  key={exercise.id}
                  className="p-4 border rounded-lg bg-muted/20 space-y-3"
                >
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        handleRemoveExercise(superset.id, exercise.id)
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`ex-name-${exercise.id}`}>
                        Ejercicio
                      </Label>
                      <Input
                        id={`ex-name-${exercise.id}`}
                        value={exercise.name}
                        onChange={e =>
                          handleExerciseChange(
                            superset.id,
                            exercise.id,
                            'name',
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ex-superset-${exercise.id}`}>
                        Código Superserie
                      </Label>
                      <Input
                        id={`ex-superset-${exercise.id}`}
                        value={exercise.supersetCode}
                        onChange={e =>
                          handleExerciseChange(
                            superset.id,
                            exercise.id,
                            'supersetCode',
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ExerciseTypeSelector
                      value={exercise.type}
                      onChange={type =>
                        handleExerciseChange(
                          superset.id,
                          exercise.id,
                          'type',
                          type
                        )
                      }
                    />
                    <div className="space-y-1.5">
                      <Label htmlFor={`ex-tempo-${exercise.id}`}>Tempo</Label>
                      <Input
                        id={`ex-tempo-${exercise.id}`}
                        value={exercise.tempo}
                        onChange={e =>
                          handleExerciseChange(
                            superset.id,
                            exercise.id,
                            'tempo',
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>

                  <SetInputs
                    sets={exercise.sets}
                    exerciseType={exercise.type}
                    onChange={sets =>
                      handleExerciseChange(
                        superset.id,
                        exercise.id,
                        'sets',
                        sets
                      )
                    }
                  />

                  <div className="space-y-1.5">
                    <Label htmlFor={`ex-notes-${exercise.id}`}>Notas</Label>
                    <Input
                      id={`ex-notes-${exercise.id}`}
                      value={exercise.notes || ''}
                      onChange={e =>
                        handleExerciseChange(
                          superset.id,
                          exercise.id,
                          'notes',
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => handleAddExercise(superset.id)}
              >
                <Plus className="mr-2 h-4 w-4" /> Añadir Ejercicio a Superserie{' '}
                {superset.id}
              </Button>
            </CardContent>
          </Card>
        ))
      )}

      <div className="mt-6">
        <Button variant="outline" onClick={handleAddSuperset}>
          <Plus className="mr-2 h-4 w-4" /> Añadir Nueva Superserie
        </Button>
      </div>
    </div>
  );
};
