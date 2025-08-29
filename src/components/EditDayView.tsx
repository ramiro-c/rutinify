import { useState, useEffect } from 'react';
import { useRoutines } from '../hooks/useRoutines';
import { type WorkoutDay, type Exercise } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Trash2, Plus } from 'lucide-react';

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
      setEditedDay(JSON.parse(JSON.stringify(dayData)));
    } else {
      // If day doesn't exist, initialize a new one
      setEditedDay({
        day: day,
        supersets: [],
      });
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
    value: string
  ) => {
    if (!editedDay) return;
    const newDay = { ...editedDay };
    const superset = newDay.supersets.find(s => s.id === supersetId);
    if (!superset) return;
    const exercise = superset.exercises.find(e => e.id === exerciseId);
    if (!exercise) return;
    (exercise as unknown as Record<string, unknown>)[field] = value;
    setEditedDay(newDay);
  };

  const handleAddExercise = (supersetId: string) => {
    if (!editedDay) return;
    const newDay = { ...editedDay };
    const superset = newDay.supersets.find(s => s.id === supersetId);
    if (!superset) return;

    const newExercise: Exercise = {
      id: crypto.randomUUID(),
      name: 'Nuevo Ejercicio',
      series: '3',
      reps: '10',
      tempo: '2010',
      supersetCode: `${superset.id}${superset.exercises.length + 1}`,
      notes: '',
    };
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
          Editando Día {day}
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
                    <div className="space-y-1.5">
                      <Label htmlFor={`ex-series-${exercise.id}`}>Series</Label>
                      <Input
                        id={`ex-series-${exercise.id}`}
                        value={exercise.series}
                        onChange={e =>
                          handleExerciseChange(
                            superset.id,
                            exercise.id,
                            'series',
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ex-reps-${exercise.id}`}>Reps</Label>
                      <Input
                        id={`ex-reps-${exercise.id}`}
                        value={exercise.reps}
                        onChange={e =>
                          handleExerciseChange(
                            superset.id,
                            exercise.id,
                            'reps',
                            e.target.value
                          )
                        }
                      />
                    </div>
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
