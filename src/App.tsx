import { useState } from 'react';
import { Layout } from './components/Layout';
import { RoutineList } from './components/RoutineList';
import { WorkoutView } from './components/WorkoutView';
import { EditDayView } from './components/EditDayView';

type View = 'list' | 'workout' | 'edit_day';

function App() {
  const [view, setView] = useState<View>('list');
  const [activeWorkout, setActiveWorkout] = useState<{
    routineName: string;
    day: number;
  } | null>(null);
  const [editingDay, setEditingDay] = useState<{
    routineName: string;
    day: number;
  } | null>(null);

  const handleStartWorkout = (routineName: string, day: number) => {
    setActiveWorkout({ routineName, day });
    setView('workout');
  };

  const handleEditDay = (routineName: string, day: number) => {
    setEditingDay({ routineName, day });
    setView('edit_day');
  };

  const handleBackToList = () => {
    setActiveWorkout(null);
    setEditingDay(null);
    setView('list');
  };

  return (
    <Layout onGoHome={handleBackToList}>
      {view === 'list' && (
        <RoutineList
          onStartWorkout={handleStartWorkout}
          onEditDay={handleEditDay}
        />
      )}

      {view === 'workout' && activeWorkout && (
        <WorkoutView
          routineName={activeWorkout.routineName}
          day={activeWorkout.day}
          onBack={handleBackToList}
        />
      )}

      {view === 'edit_day' && editingDay && (
        <EditDayView
          routineName={editingDay.routineName}
          day={editingDay.day}
          onBack={handleBackToList}
        />
      )}
    </Layout>
  );
}

export default App;
