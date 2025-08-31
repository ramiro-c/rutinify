import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';

interface ActionFABProps {
  onImportCSV: () => void;
}

export const ActionFAB = ({ onImportCSV }: ActionFABProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      {/* Overlay para cerrar cuando está expandido */}
      {isExpanded && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            backdropFilter: 'blur(2px)',
            zIndex: 40,
          }}
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* Container del FAB - Fixed positioning que no se mueve */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 50,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '16px',
          }}
        >
          {/* Botón de acción - solo Importar CSV */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '12px',
              opacity: isExpanded ? 1 : 0,
              transform: isExpanded
                ? 'translateY(0) scale(1)'
                : 'translateY(32px) scale(0.95)',
              transition: 'all 0.3s ease-out',
              pointerEvents: isExpanded ? 'auto' : 'none',
            }}
          >
            {/* Importar CSV */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '14px',
                  fontWeight: '500',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  whiteSpace: 'nowrap',
                }}
              >
                Importar CSV
              </div>
              <Button
                size="lg"
                onClick={() => {
                  setIsExpanded(false);
                  onImportCSV();
                }}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  border: '2px solid hsl(var(--border))',
                  boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.1)',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  padding: '0',
                  minWidth: '48px',
                  minHeight: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                className="hover:bg-accent hover:text-accent-foreground hover:shadow-lg hover:scale-110"
              >
                <Download className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* FAB principal - permanece en posición fija */}
          <Button
            size="lg"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
              border: '2px solid hsl(var(--border))',
              boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.1)',
              transform: isExpanded ? 'rotate(45deg)' : 'rotate(0deg)',
              transition: 'all 0.3s',
              cursor: 'pointer',
              padding: '0',
              minWidth: '56px',
              minHeight: '56px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            className="hover:bg-accent hover:text-accent-foreground hover:shadow-lg hover:scale-105"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </>
  );
};
