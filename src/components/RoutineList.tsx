import { useRoutines } from '../hooks/useRoutines';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Pencil, Dumbbell } from 'lucide-react';

interface RoutineListProps {
  onStartWorkout: (routineName: string, day: number) => void;
  onEditDay: (routineName: string, day: number) => void;
}

export const RoutineList = ({ onStartWorkout, onEditDay }: RoutineListProps) => {
  const { routines, deleteWorkoutDay } = useRoutines();

  if (routines.length === 0) {
    return (
      <div className="text-center mt-8">
        <p className="text-lg font-semibold">No se encontraron rutinas.</p>
        <p className="text-muted-foreground">Cargando tu rutina desde el archivo CSV...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {routines.map(routine => (
        <section key={routine.name}>
          <h2 className="text-3xl font-bold tracking-tight mb-6">{routine.name}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {routine.days.map(day => {
              const totalExercises = day.supersets.reduce((acc, s) => acc + s.exercises.length, 0);
              return (
                <Card key={day.day} className="flex flex-col hover:shadow-lg transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Día {day.day}</span>
                      <span className="text-xs font-normal bg-muted text-muted-foreground rounded-full px-2 py-1">
                        {totalExercises} {totalExercises === 1 ? 'ejercicio' : 'ejercicios'}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-muted-foreground">
                      {day.supersets.length} {day.supersets.length === 1 ? 'superset' : 'supersets'}
                    </p>
                  </CardContent>
                  <CardFooter className="flex justify-between items-center">
                    <Button size="sm" className="cursor-pointer" onClick={() => onStartWorkout(routine.name, day.day)}>
                      <Dumbbell className="mr-2 h-4 w-4" /> Iniciar
                    </Button>
                    <div className="flex space-x-1">
                      <Button variant="ghost" size="icon" className="cursor-pointer" onClick={() => onEditDay(routine.name, day.day)}>
                        <Pencil className="h-5 w-5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive cursor-pointer" onClick={() => deleteWorkoutDay(routine.name, day.day)}>
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
