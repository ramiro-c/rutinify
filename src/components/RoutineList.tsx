import { useState } from 'react';
import { useRoutines } from '../hooks/useRoutines';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Pencil, Dumbbell, Plus } from 'lucide-react';

interface RoutineListProps {
  onStartWorkout: (routineName: string, day: number) => void;
  onEditDay: (routineName: string, day: number) => void;
}

const AddRoutineForm = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [routineName, setRoutineName] = useState('');
  const { addRoutine, routines } = useRoutines();

  const handleSave = () => {
    const trimmedName = routineName.trim();
    if (trimmedName && !routines.some(r => r.name === trimmedName)) {
      addRoutine({ name: trimmedName, days: [] });
      setRoutineName('');
      setIsEditing(false);
    } else if (routines.some(r => r.name === trimmedName)) {
      alert('Ya existe una rutina con ese nombre.');
    }
  };

  if (!isEditing) {
    return (
      <Button onClick={() => setIsEditing(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Añadir Rutina
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <Input
        type="text"
        placeholder="Nombre de la nueva rutina..."
        value={routineName}
        onChange={e => setRoutineName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSave()}
      />
      <Button onClick={handleSave}>Guardar</Button>
      <Button variant="ghost" onClick={() => setIsEditing(false)}>
        Cancelar
      </Button>
    </div>
  );
};

const AddDayForm = ({
  routineName,
  onAddDay,
}: {
  routineName: string;
  onAddDay: (dayNumber: number) => void;
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [dayNumber, setDayNumber] = useState('');
  const { routines } = useRoutines();

  const handleSave = () => {
    const num = parseInt(dayNumber, 10);
    if (isNaN(num) || num <= 0) {
      alert('Por favor, introduce un número de día válido (ej. 1, 2, 3).');
      return;
    }

    const routine = routines.find(r => r.name === routineName);
    if (routine && routine.days.some(d => d.day === num)) {
      alert(`El Día ${num} ya existe en esta rutina.`);
      return;
    }

    onAddDay(num);
    setDayNumber('');
    setIsAdding(false);
  };

  if (!isAdding) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
        <Plus className="mr-2 h-4 w-4" /> Añadir Día
      </Button>
    );
  }

  return (
    <div className="flex gap-2 items-center">
      <Input
        type="number"
        placeholder="Número de día (ej. 2)"
        value={dayNumber}
        onChange={e => setDayNumber(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSave()}
        className="w-32"
      />
      <Button onClick={handleSave}>Guardar</Button>
      <Button variant="ghost" onClick={() => setIsAdding(false)}>
        Cancelar
      </Button>
    </div>
  );
};

export const RoutineList = ({
  onStartWorkout,
  onEditDay,
}: RoutineListProps) => {
  const { routines, deleteWorkoutDay, deleteRoutine } = useRoutines();

  const handleDeleteRoutine = (routineName: string) => {
    if (
      window.confirm(
        `¿Estás seguro de que quieres eliminar la rutina "${routineName}"? Esta acción no se puede deshacer.`
      )
    ) {
      deleteRoutine(routineName);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Mis Rutinas</h1>
        <AddRoutineForm />
      </div>

      {routines.length === 0 && (
        <div className="text-center mt-8 border-2 border-dashed rounded-lg p-12">
          <p className="text-lg font-semibold">No se encontraron rutinas.</p>
          <p className="text-muted-foreground">
            Usa el botón "Añadir Rutina" para crear la primera.
          </p>
        </div>
      )}

      {routines.map(routine => (
        <section key={routine.name}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              {routine.name}
            </h2>
            <div className="flex items-center gap-2">
              <AddDayForm
                routineName={routine.name}
                onAddDay={dayNum => onEditDay(routine.name, dayNum)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDeleteRoutine(routine.name)}
                title={`Eliminar rutina ${routine.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {routine.days.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <Card className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center text-muted-foreground">
                <p className="text-lg font-semibold mb-4">
                  Esta rutina no tiene días aún.
                </p>
                <Button onClick={() => onEditDay(routine.name, 1)}>
                  <Plus className="mr-2 h-4 w-4" /> Añadir Día 1
                </Button>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {routine.days.map(day => {
                const totalExercises = day.supersets.reduce(
                  (acc, s) => acc + s.exercises.length,
                  0
                );
                return (
                  <Card
                    key={day.day}
                    className="flex flex-col hover:shadow-lg transition-shadow duration-300"
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>Día {day.day}</span>
                        <span className="text-xs font-normal bg-muted text-muted-foreground rounded-full px-2 py-1">
                          {totalExercises}{' '}
                          {totalExercises === 1 ? 'ejercicio' : 'ejercicios'}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <p className="text-muted-foreground">
                        {day.supersets.length}{' '}
                        {day.supersets.length === 1 ? 'superset' : 'supersets'}
                      </p>
                    </CardContent>
                    <CardFooter className="flex justify-between items-center">
                      <Button
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => onStartWorkout(routine.name, day.day)}
                      >
                        <Dumbbell className="mr-2 h-4 w-4" /> Iniciar
                      </Button>
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-pointer"
                          onClick={() => onEditDay(routine.name, day.day)}
                        >
                          <Pencil className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive cursor-pointer"
                          onClick={() =>
                            deleteWorkoutDay(routine.name, day.day)
                          }
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
};
