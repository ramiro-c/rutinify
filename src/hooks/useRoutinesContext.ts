import { useContext } from 'react';
import { RoutinesContext } from '../contexts/RoutinesContext';

export const useRoutines = () => {
  const context = useContext(RoutinesContext);
  if (context === undefined) {
    throw new Error('useRoutines must be used within a RoutinesProvider');
  }
  return context;
};
