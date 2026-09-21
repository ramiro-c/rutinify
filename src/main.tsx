import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './index.css';
import { ThemeProvider } from './components/theme-provider';
import { track } from './lib/telemetry';
import { drainOutbox } from './lib/sync';
import { syncOnReconnect } from './lib/remoteSync';

// Ciclo de sync offline-first (BET-2026-001): al arrancar y al
// reconectar, las escrituras pendientes del outbox se aplican a sus
// stores locales con LWW, para que la cola nunca crezca sin drenar.
// El pull contra el backend NO espera una transición offline→online:
// con ambos dispositivos siempre online nadie la atraviesa, así que el
// sync corre también al boot, cada 60 s y cuando la pestaña vuelve a
// ser visible. Sin VITE_SYNC_URL todo es no-op y la app sigue 100 %
// local con export/import JSON; un fallo de red devuelve false con el
// store local intacto.
function bootDrain(): void {
  try {
    drainOutbox();
  } catch {
    // Best-effort: un outbox corrupto no bloquea el arranque.
  }
}

function reconnectSync(): void {
  bootDrain();
  syncOnReconnect().catch(() => {
    // Best-effort: sin red o sin backend la app sigue 100 % local.
  });
}

bootDrain();
// Pull inicial: el desktop que abre la app online ve las sesiones del
// celular sin esperar ningún cambio de conectividad.
reconnectSync();
if (typeof window !== 'undefined') {
  window.addEventListener('online', reconnectSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reconnectSync();
  });
  // Push/pull periódico best-effort (60 s): convergencia teléfono ↔
  // desktop durante sesiones largas sin recargar ni cambiar de red.
  window.setInterval(reconnectSync, 60_000);
}

// Instrumentación del Resolution Signal (BET-2026-001): la apertura de la
// app se registra como evento propio 'app_opened', distinto de
// 'session_started' (que solo emite WorkoutView al montar una sesión real).
// Así el conteo de sesiones consecutivas no se infla con meras aperturas.
track('app_opened', { surface: 'app_open' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <App />
      <Analytics />
    </ThemeProvider>
  </StrictMode>
);
