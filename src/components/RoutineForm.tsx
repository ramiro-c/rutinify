import { useState } from "react";
import { useRoutines } from "../hooks/useRoutines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { type Routine, type WorkoutDay } from "../types";

interface RoutineFormProps {
  onSave: () => void;
  routineToEdit?: Routine;
}

export const RoutineForm = ({ onSave, routineToEdit }: RoutineFormProps) => {
  const [name, setName] = useState(routineToEdit?.name || "");
  const [days, setDays] = useState<WorkoutDay[]>(routineToEdit?.days || []);
  const { addRoutine, updateRoutine } = useRoutines();

  const handleDayChange = (dayIndex: number, field: string, value: string) => {
    const newDays = [...days];
    newDays[dayIndex] = { ...newDays[dayIndex], [field]: value };
    setDays(newDays);
  };

  const handleExerciseChange = (
    dayIndex: number,
    exIndex: number,
    field: string,
    value: string | number
  ) => {
    const newDays = [...days];
    newDays[dayIndex].exercises[exIndex] = {
      ...newDays[dayIndex].exercises[exIndex],
      [field]: value,
    };
    setDays(newDays);
  };

  const addDay = () => {
    setDays([
      ...days,
      {
        id: crypto.randomUUID(),
        name: `Day ${days.length + 1}`,
        exercises: [],
      },
    ]);
  };

  const removeDay = (dayIndex: number) => {
    setDays(days.filter((_, i) => i !== dayIndex));
  };

  const addExercise = (dayIndex: number) => {
    const newDays = [...days];
    newDays[dayIndex].exercises.push({
      id: crypto.randomUUID(),
      name: "",
      sets: 3,
      reps: "10",
      tempo: "2010",
    });
    setDays(newDays);
  };

  const removeExercise = (dayIndex: number, exIndex: number) => {
    const newDays = [...days];
    newDays[dayIndex].exercises = newDays[dayIndex].exercises.filter(
      (_, i) => i !== exIndex
    );
    setDays(newDays);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const routineData = { name, days };

    if (routineToEdit) {
      updateRoutine({ ...routineToEdit, ...routineData });
    } else {
      addRoutine(routineData);
    }
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-4">
      <h2 className="text-2xl font-bold">
        {routineToEdit ? "Edit Routine" : "Create New Routine"}
      </h2>
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <label htmlFor="routine-name">Routine Name</label>
        <Input
          id="routine-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Routine Name"
          required
        />
      </div>

      <h3 className="text-xl font-semibold mt-6 mb-2">Workout Days</h3>

      {days.map((day, dayIndex) => (
        <Card key={day.id} className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
            <CardTitle className="text-lg font-medium">
              <div className="grid w-full items-center gap-1.5">
                <label htmlFor={`day-name-${day.id}`}>Day Name</label>
                <Input
                  id={`day-name-${day.id}`}
                  value={day.name}
                  onChange={(e) =>
                    handleDayChange(dayIndex, "name", e.target.value)
                  }
                  className="text-lg font-medium border-none shadow-none focus-visible:ring-0"
                />
              </div>
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeDay(dayIndex)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <h4 className="text-base font-semibold mb-2">Exercises</h4>
            {day.exercises.map((ex, exIndex) => (
              <div
                key={ex.id}
                className="grid grid-cols-1 sm:grid-cols-6 gap-2 mb-2 items-center"
              >
                <div className="col-span-full sm:col-span-2">
                  <div className="grid w-full items-center gap-1.5">
                    <label htmlFor={`exercise-name-${day.id}-${ex.id}`}>
                      Exercise Name
                    </label>
                    <Input
                      id={`exercise-name-${day.id}-${ex.id}`}
                      placeholder="Exercise Name"
                      value={ex.name}
                      onChange={(e) =>
                        handleExerciseChange(
                          dayIndex,
                          exIndex,
                          "name",
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid w-full items-center gap-1.5">
                  <label htmlFor={`sets-${day.id}-${ex.id}`}>Sets</label>
                  <Input
                    id={`sets-${day.id}-${ex.id}`}
                    placeholder="Sets"
                    value={ex.sets}
                    onChange={(e) =>
                      handleExerciseChange(
                        dayIndex,
                        exIndex,
                        "sets",
                        parseInt(e.target.value) || 0
                      )
                    }
                    type="number"
                  />
                </div>
                <div className="grid w-full items-center gap-1.5">
                  <label htmlFor={`reps-${day.id}-${ex.id}`}>Reps</label>
                  <Input
                    id={`reps-${day.id}-${ex.id}`}
                    placeholder="Reps"
                    value={ex.reps}
                    onChange={(e) =>
                      handleExerciseChange(
                        dayIndex,
                        exIndex,
                        "reps",
                        e.target.value
                      )
                    }
                  />
                </div>
                <div className="grid w-full items-center gap-1.5">
                  <label htmlFor={`tempo-${day.id}-${ex.id}`}>Tempo</label>
                  <Input
                    id={`tempo-${day.id}-${ex.id}`}
                    placeholder="Tempo"
                    value={ex.tempo}
                    onChange={(e) =>
                      handleExerciseChange(
                        dayIndex,
                        exIndex,
                        "tempo",
                        e.target.value
                      )
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeExercise(dayIndex, exIndex)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => addExercise(dayIndex)}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Exercise
            </Button>
          </CardContent>
        </Card>
      ))}

      <Button onClick={addDay} className="mt-4">
        <Plus className="mr-2 h-4 w-4" /> Add Day
      </Button>

      <div className="mt-4 flex space-x-2">
        <Button type="submit">Save Routine</Button>
        <Button variant="outline" onClick={onSave}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
