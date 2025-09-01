import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Calendar } from 'lucide-react';
import { useRoutines } from '../hooks/useRoutinesContext';

export const WeekSelector = () => {
  const { weekSettings, updateCurrentWeek } = useRoutines();

  const handleWeekChange = (value: string) => {
    const week = parseInt(value);
    updateCurrentWeek(week);
  };

  return (
    <div className="flex items-center gap-3 bg-card border rounded-lg p-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Label htmlFor="week-selector" className="text-sm font-medium">
          Semana Actual:
        </Label>
      </div>
      <Select
        value={weekSettings.currentWeek.toString()}
        onValueChange={handleWeekChange}
      >
        <SelectTrigger className="w-20" id="week-selector">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">1</SelectItem>
          <SelectItem value="2">2</SelectItem>
          <SelectItem value="3">3</SelectItem>
          <SelectItem value="4">4</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
