import { Moon, Sun, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
  onGoHome: () => void;
}

export const Layout = ({ children, onGoHome }: LayoutProps) => {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("min-h-screen bg-background font-sans antialiased")}>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
          <button onClick={onGoHome} className="mr-4 flex items-center space-x-2 cursor-pointer">
            <Dumbbell className="h-6 w-6" />
            <h1 className="text-2xl font-bold tracking-tight">Rutinify</h1>
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </header>
      <main className="container max-w-screen-2xl flex-1 py-6 md:py-8 px-4 md:px-6 lg:px-8">{children}</main>
      <footer className="py-4 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Rutinify
      </footer>
    </div>
  );
};
