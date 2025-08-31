import { Moon, Sun, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

// Componente personalizado para GitHub (reemplaza el icono deprecado)
const GitHubIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

// Componente personalizado para LinkedIn (reemplaza el icono deprecado)
const LinkedInIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

interface LayoutProps {
  children: React.ReactNode;
  onGoHome: () => void;
}

export const Layout = ({ children, onGoHome }: LayoutProps) => {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn('min-h-screen bg-background font-sans antialiased')}>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
          <button
            onClick={onGoHome}
            className="ml-4 mr-4 flex items-center space-x-2 cursor-pointer"
          >
            <Dumbbell className="h-6 w-6" />
            <h1 className="text-2xl font-bold tracking-tight">Rutinify</h1>
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </header>
      <main className="container max-w-screen-2xl flex-1 py-6 md:py-8 px-4 md:px-6 lg:px-8">
        {children}
      </main>
      <footer className="border-t border-border/40 bg-background/95 mt-8">
        <div className="container max-w-screen-2xl py-6 px-4 md:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="flex items-center space-x-4">
              <a
                href="https://github.com/ramiro-c"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <GitHubIcon className="h-4 w-4" />
                <span className="text-sm">GitHub</span>
              </a>
              <div className="w-px h-4 bg-border"></div>
              <a
                href="https://www.linkedin.com/in/ramiro-cerdá-619983177/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <LinkedInIcon className="h-4 w-4" />
                <span className="text-sm">LinkedIn</span>
              </a>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p>
                Desarrollado por{' '}
                <span className="font-medium">Ramiro Cerdá</span>
              </p>
              <p>© {new Date().getFullYear()} Rutinify</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
