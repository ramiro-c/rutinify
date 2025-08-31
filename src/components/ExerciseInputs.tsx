import {
  type ExerciseType,
  type ExerciseSet,
  type RepsSet,
  type TimeSet,
  type WeightTimeSet,
} from '../types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Trash2, Plus } from 'lucide-react';

interface ExerciseTypeSelectorProps {
  value: ExerciseType;
  onChange: (type: ExerciseType) => void;
}

export const ExerciseTypeSelector = ({
  value,
  onChange,
}: ExerciseTypeSelectorProps) => {
  const exerciseTypeLabels: Record<ExerciseType, string> = {
    reps: 'Peso x Repeticiones',
    time: 'Solo Tiempo',
    'weight-time': 'Peso x Tiempo',
  };

  const handleTypeChange = (newType: ExerciseType) => {
    onChange(newType);
  };

  return (
    <div className="space-y-1.5">
      <Label>Tipo de Ejercicio</Label>
      <Select value={value} onValueChange={handleTypeChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="reps">{exerciseTypeLabels.reps}</SelectItem>
          <SelectItem value="time">{exerciseTypeLabels.time}</SelectItem>
          <SelectItem value="weight-time">
            {exerciseTypeLabels['weight-time']}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

interface SetInputsProps {
  sets: ExerciseSet[];
  exerciseType: ExerciseType;
  onChange: (sets: ExerciseSet[]) => void;
}

export const SetInputs = ({ sets, exerciseType, onChange }: SetInputsProps) => {
  const addSet = () => {
    const newSet: ExerciseSet =
      exerciseType === 'reps'
        ? { id: crypto.randomUUID(), type: 'reps', weight: 0, reps: 10 }
        : exerciseType === 'time'
          ? { id: crypto.randomUUID(), type: 'time', duration: '0:30' }
          : {
              id: crypto.randomUUID(),
              type: 'weight-time',
              weight: 0,
              duration: '1:00',
            };

    onChange([...sets, newSet]);
  };

  const removeSet = (setId: string) => {
    onChange(sets.filter(s => s.id !== setId));
  };

  const updateSet = (
    setId: string,
    updates: Partial<{ weight: number; reps: number; duration: string }>
  ) => {
    onChange(sets.map(s => (s.id === setId ? { ...s, ...updates } : s)));
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <Label>Series</Label>
        <Button type="button" variant="outline" size="sm" onClick={addSet}>
          <Plus className="h-4 w-4 mr-1" /> Añadir Serie
        </Button>
      </div>

      {sets.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay series configuradas. Añade una serie para empezar.
        </p>
      ) : (
        <div className="space-y-2">
          {sets.map((set, index) => (
            <div
              key={set.id}
              className="flex items-center gap-2 p-3 border rounded-lg"
            >
              <span className="text-sm font-medium w-8">#{index + 1}</span>

              {set.type === 'reps' && (
                <>
                  <div className="flex-1">
                    <Label htmlFor={`weight-${set.id}`} className="text-xs">
                      Peso (kg)
                    </Label>
                    <Input
                      id={`weight-${set.id}`}
                      type="number"
                      value={(set as RepsSet).weight}
                      onChange={e =>
                        updateSet(set.id, { weight: Number(e.target.value) })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor={`reps-${set.id}`} className="text-xs">
                      Reps
                    </Label>
                    <Input
                      id={`reps-${set.id}`}
                      type="number"
                      value={(set as RepsSet).reps}
                      onChange={e =>
                        updateSet(set.id, { reps: Number(e.target.value) })
                      }
                      placeholder="10"
                    />
                  </div>
                </>
              )}

              {set.type === 'time' && (
                <div className="flex-1">
                  <Label htmlFor={`duration-${set.id}`} className="text-xs">
                    Duración (mm:ss)
                  </Label>
                  <Input
                    id={`duration-${set.id}`}
                    value={(set as TimeSet).duration}
                    onChange={e =>
                      updateSet(set.id, { duration: e.target.value })
                    }
                    placeholder="1:30"
                  />
                </div>
              )}

              {set.type === 'weight-time' && (
                <>
                  <div className="flex-1">
                    <Label htmlFor={`weight-${set.id}`} className="text-xs">
                      Peso (kg)
                    </Label>
                    <Input
                      id={`weight-${set.id}`}
                      type="number"
                      value={(set as WeightTimeSet).weight}
                      onChange={e =>
                        updateSet(set.id, { weight: Number(e.target.value) })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor={`duration-${set.id}`} className="text-xs">
                      Duración (mm:ss)
                    </Label>
                    <Input
                      id={`duration-${set.id}`}
                      value={(set as WeightTimeSet).duration}
                      onChange={e =>
                        updateSet(set.id, { duration: e.target.value })
                      }
                      placeholder="1:00"
                    />
                  </div>
                </>
              )}

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeSet(set.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
