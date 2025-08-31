import { useState } from 'react';
import { useRoutines } from '../hooks/useRoutinesContext';
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
import { ActionFAB } from './ActionFAB';
import { ImportCSV } from './ImportCSV';

interface RoutineListProps {
  onStartWorkout: (routineName: string, day: number) => void;
  onEditDay: (routineName: string, day: number) => void;
}

const AddRoutineForm = ({
  isAddingNewRoutine,
  handleAddRoutine,
}: {
  isAddingNewRoutine: boolean;
  handleAddRoutine: (isAddingNewRoutine: boolean) => void;
}) => {
  if (!isAddingNewRoutine) {
    return (
      <Button variant="ghost" onClick={() => handleAddRoutine(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Añadir Rutina
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Button variant="ghost" onClick={() => handleAddRoutine(false)}>
        <Plus className="mr-2 h-4 w-4" />
        Añadir Rutina
      </Button>
    </div>
  );
};

const EditableDayTitle = ({
  routineName,
  day,
  dayName,
  onUpdateDayName,
}: {
  routineName: string;
  day: number;
  dayName?: string;
  onUpdateDayName: (
    routineName: string,
    dayNumber: number,
    newName: string
  ) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(dayName || '');

  const handleSave = () => {
    onUpdateDayName(routineName, day, editingName);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditingName(dayName || '');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={editingName}
          onChange={e => setEditingName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          autoFocus
          placeholder={`Día ${day}`}
          className="text-lg font-semibold"
        />
      </div>
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
      title="Haz clic para editar el nombre"
    >
      {dayName || `Día ${day}`}
      {dayName && (
        <span className="text-sm font-normal text-muted-foreground ml-2">
          (Día {day})
        </span>
      )}
    </span>
  );
};

export const RoutineList = ({
  onStartWorkout,
  onEditDay,
}: RoutineListProps) => {
  const [isAddingNewRoutine, setIsAddingNewRoutine] = useState(false);
  const [routineName, setRoutineName] = useState('');
  const [isAddingNewDay, setIsAddingNewDay] = useState(false);
  const [dayName, setDayName] = useState('');
  const [selectedRoutineForDay, setSelectedRoutineForDay] =
    useState<string>('');
  const [showImportCSV, setShowImportCSV] = useState(false);

  const handleAddRoutine = (isAddingNewRoutine: boolean) =>
    setIsAddingNewRoutine(isAddingNewRoutine);

  const handleAddDayForm = (routineName: string, isAdding: boolean) => {
    setSelectedRoutineForDay(routineName);
    setIsAddingNewDay(isAdding);
    if (!isAdding) {
      setDayName('');
    }
  };

  const {
    routines,
    addRoutine,
    deleteWorkoutDay,
    deleteRoutine,
    updateDayName,
    updateWorkoutDay,
  } = useRoutines();

  const handleDeleteRoutine = (routineName: string) => {
    if (
      window.confirm(
        `¿Estás seguro de que quieres eliminar la rutina "${routineName}"? Esta acción no se puede deshacer.`
      )
    ) {
      deleteRoutine(routineName);
    }
  };

  const handleAddDay = (
    routineName: string,
    dayNumber: number,
    dayName?: string
  ) => {
    // Create a new day with the specified name
    const newDay = {
      day: dayNumber,
      dayName: dayName,
      supersets: [],
    };
    updateWorkoutDay(routineName, dayNumber, newDay);
    // Then redirect to edit it
    onEditDay(routineName, dayNumber);
  };

  const handleSave = () => {
    const trimmedName = routineName.trim();
    if (trimmedName && !routines.some(r => r.name === trimmedName)) {
      addRoutine({ name: trimmedName, days: [] });
      setRoutineName('');
      setIsAddingNewRoutine(false);
    } else if (routines.some(r => r.name === trimmedName)) {
      alert('Ya existe una rutina con ese nombre.');
    }
  };

  const handleSaveDay = () => {
    const routine = routines.find(r => r.name === selectedRoutineForDay);
    if (routine) {
      handleAddDay(
        routine.name,
        routine.days.length + 1,
        dayName.trim() || undefined
      );
      setDayName('');
      setIsAddingNewDay(false);
      setSelectedRoutineForDay('');
    }
  };

  const handleCreateRoutine = () => {
    setIsAddingNewRoutine(true);
  };

  const handleImportCSV = () => {
    setShowImportCSV(true);
  };

  const handleImportSuccess = () => {
    setShowImportCSV(false);
  };

  const handleImportCancel = () => {
    setShowImportCSV(false);
  };

  // Si está mostrando la importación de CSV, mostrar solo eso
  if (showImportCSV) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <ImportCSV
          onImportSuccess={handleImportSuccess}
          onCancel={handleImportCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Mis Rutinas</h1>
        <AddRoutineForm
          isAddingNewRoutine={isAddingNewRoutine}
          handleAddRoutine={handleAddRoutine}
        />
      </div>
      {isAddingNewRoutine && (
        <div className="flex flex-row">
          <Input
            type="text"
            placeholder="Nombre de la nueva rutina..."
            value={routineName}
            onChange={e => setRoutineName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <div className="flex gap-0 ">
            <Button onClick={handleSave}>Guardar</Button>
            <Button
              variant="ghost"
              onClick={() => setIsAddingNewRoutine(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {routines.length === 0 && (
        <div className="text-center mt-8 border-2 border-dashed rounded-lg p-12">
          <p className="text-lg font-semibold">No se encontraron rutinas.</p>
          <p className="text-muted-foreground">
            Usa el botón "Añadir Rutina" para crear la primera.
          </p>
        </div>
      )}

      {routines.map(routine => (
        <section key={routine.name} className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {routine.name}
            </h2>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAddDayForm(routine.name, true)}
              >
                <Plus className="mr-2 h-4 w-4" /> Añadir Día
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDeleteRoutine(routine.name)}
                aria-label={`Eliminar rutina ${routine.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {isAddingNewDay && (
            <div className="flex flex-row">
              <Input
                type="text"
                placeholder="Nombre del día (opcional)"
                value={dayName}
                onChange={e => setDayName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveDay()}
                autoFocus
              />
              <div className="flex gap-0 ">
                <Button onClick={handleSaveDay}>Guardar</Button>
                <Button
                  variant="ghost"
                  onClick={() => setIsAddingNewDay(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {routine.days.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <Card className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg text-center text-muted-foreground">
                <p className="text-lg font-semibold mb-4">
                  Esta rutina no tiene días aún.
                </p>
                <Button onClick={() => handleAddDay(routine.name, 1)}>
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
                        <EditableDayTitle
                          routineName={routine.name}
                          day={day.day}
                          dayName={day.dayName}
                          onUpdateDayName={updateDayName}
                        />
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
                        onClick={() => onStartWorkout(routine.name, day.day)}
                        className="cursor-pointer"
                      >
                        <Dumbbell className="mr-2 h-4 w-4" /> Iniciar
                      </Button>
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEditDay(routine.name, day.day)}
                          aria-label={`Editar ${day.dayName || `Día ${day.day}`}`}
                        >
                          <Pencil className="h-5 w-5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            deleteWorkoutDay(routine.name, day.day)
                          }
                          aria-label={`Eliminar ${day.dayName || `Día ${day.day}`}`}
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

      {/* FAB para acciones */}
      <ActionFAB
        onCreateRoutine={handleCreateRoutine}
        onImportCSV={handleImportCSV}
      />
    </div>
  );
};
