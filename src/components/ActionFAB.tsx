import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Upload } from 'lucide-react';

interface ActionFABProps {
  onCreateRoutine: () => void;
  onImportCSV: () => void;
}

export const ActionFAB = ({ onCreateRoutine, onImportCSV }: ActionFABProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* Overlay para cerrar */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/20"
          style={{ zIndex: 40 }}
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* Container del FAB */}
      <div className="fixed bottom-6 right-6" style={{ zIndex: 50 }}>
        {/* Botones expandidos */}
        {isExpanded && (
          <div className="flex flex-col items-end space-y-3 mb-3">
            {/* Importar CSV */}
            <div className="flex items-center space-x-3">
              <span
                className="bg-white dark:bg-gray-800 border rounded-lg px-3 py-2 text-sm font-medium shadow-lg"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                }}
              >
                Importar CSV
              </span>
              <Button
                size="lg"
                onClick={() => {
                  setIsExpanded(false);
                  onImportCSV();
                }}
                className="rounded-full w-14 h-14 shadow-lg cursor-pointer"
                style={{
                  backgroundColor: 'hsl(var(--secondary))',
                  color: 'hsl(var(--secondary-foreground))',
                  border: 'none',
                }}
              >
                <Upload className="h-6 w-6" />
              </Button>
            </div>

            {/* Crear rutina */}
            <div className="flex items-center space-x-3">
              <span
                className="bg-white dark:bg-gray-800 border rounded-lg px-3 py-2 text-sm font-medium shadow-lg"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                }}
              >
                Crear Rutina
              </span>
              <Button
                size="lg"
                onClick={() => {
                  setIsExpanded(false);
                  onCreateRoutine();
                }}
                className="rounded-full w-14 h-14 shadow-lg cursor-pointer"
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  border: 'none',
                }}
              >
                <Plus className="h-6 w-6" />
              </Button>
            </div>
          </div>
        )}

        {/* FAB principal */}
        <Button
          size="lg"
          onClick={() => setIsExpanded(!isExpanded)}
          className="rounded-full w-16 h-16 shadow-xl cursor-pointer"
          style={{
            backgroundColor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            border: 'none',
            transform: isExpanded ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease-in-out',
          }}
        >
          <Plus className="h-7 w-7" />
        </Button>
      </div>
    </>
  );
};
