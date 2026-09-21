/**
 * Local telemetry module for BET-2026-001 resolution signals.
 *
 * All data lives in localStorage — no cloud, no external services.
 * The user can verify resolution signals visually in the app or via
 * exportImportJSON.exportTelemetry().
 *
 * Tracked metrics (from Bet resolution_signal):
 *   - consecutive_sessions: sessions completed entirely in-app (threshold ≥ 4)
 *   - cell_edit_duration_ms: time from first focus to commit per cell (threshold ≤ 3000ms)
 *   - sheet_openings: manual counter (author-reported per session, threshold 0)
 *   - sessions_visible_desktop: verified by export round-trip (threshold 4 of 4)
 */

const TELEMETRY_KEY = 'rutinify-telemetry';

export interface CellEditTiming {
  exerciseId: string;
  week: number;
  setIndex: number;
  focusAt: number; // Date.now() when user focused the input
  blurAt: number; // Date.now() when user committed (blurred or Enter)
  durationMs: number;
}

export interface SessionTelemetry {
  sessionId: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO, null if in-progress
  cellEdits: CellEditTiming[];
  sheetOpeningReported: number; // author-reported: how many times Sheet was opened
  completed: boolean; // true when "Finalizar Entrenamiento" is pressed
}

export interface TelemetryState {
  sessions: SessionTelemetry[];
  activeSessionId: string | null;
  consecutiveSessions: number; // computed, not stored
}

function generateSessionId(): string {
  return `ts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadState(): TelemetryState {
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TelemetryState;
      // Compute consecutive from stored sessions
      parsed.consecutiveSessions = computeConsecutive(parsed.sessions);
      return parsed;
    }
  } catch {
    // Corrupt telemetry — start fresh rather than crash
  }
  return { sessions: [], activeSessionId: null, consecutiveSessions: 0 };
}

function saveState(state: TelemetryState): void {
  try {
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(state));
  } catch {
    console.error('[telemetry] Failed to persist telemetry state');
  }
}

const MAX_CONSECUTIVE_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export function computeConsecutive(sessions: SessionTelemetry[]): number {
  if (!Array.isArray(sessions) || sessions.length === 0) return 0;
  // Cadena trailing de sesiones completadas con contigüidad temporal:
  // cada sesión debe estar a ≤7 días de la siguiente más nueva.
  // Sin ventana temporal, sesiones separadas por semanas contarían como
  // "consecutivas" y la señal de éxito no sería falsable.
  let count = 0;
  let newerStartedAt: number | null = null;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (!s || s.completed !== true) break;
    const startedAt = Date.parse(s.startedAt);
    if (!Number.isFinite(startedAt)) break;
    if (newerStartedAt !== null && newerStartedAt - startedAt > MAX_CONSECUTIVE_GAP_MS) break;
    count++;
    newerStartedAt = startedAt;
  }
  return count;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Start a new workout session. Returns the session ID.
 */
export function startSession(): string {
  const state = loadState();
  const id = generateSessionId();
  const session: SessionTelemetry = {
    sessionId: id,
    startedAt: new Date().toISOString(),
    endedAt: null,
    cellEdits: [],
    sheetOpeningReported: 0,
    completed: false,
  };
  state.sessions.push(session);
  state.activeSessionId = id;
  saveState(state);
  return id;
}

/**
 * Record a cell edit timing. Call with focusAt when the input gains focus,
 * and blurAt when it loses focus or Enter is pressed.
 */
export function recordCellEdit(
  edit: Omit<CellEditTiming, 'durationMs'> & { durationMs?: number }
): void {
  const state = loadState();
  const session = state.sessions.find(s => s.sessionId === state.activeSessionId);
  if (!session) return;

  const durationMs = edit.durationMs ?? (edit.blurAt - edit.focusAt);
  session.cellEdits.push({ ...edit, durationMs });
  saveState(state);
}

/**
 * Report how many times the Google Sheet was opened during this session.
 * Author-reported: call after each session with the count.
 */
export function reportSheetOpenings(count: number): void {
  const state = loadState();
  const session = state.sessions.find(s => s.sessionId === state.activeSessionId);
  if (!session) return;
  session.sheetOpeningReported = count;
  saveState(state);
}

/**
 * Abort the active session (user pressed Cancel / left without finishing).
 * The orphan session is removed so it never poisons the consecutive chain:
 * a cancel is "no workout", not a broken streak. No-op without active session.
 */
export function abortSession(): void {
  const state = loadState();
  if (!state.activeSessionId) return;
  state.sessions = state.sessions.filter(s => s.sessionId !== state.activeSessionId);
  state.activeSessionId = null;
  state.consecutiveSessions = computeConsecutive(state.sessions);
  saveState(state);
}

/**
 * Mark the active session as completed (called by "Finalizar Entrenamiento").
 */
export function endSession(): void {
  const state = loadState();
  const session = state.sessions.find(s => s.sessionId === state.activeSessionId);
  if (!session) return;
  session.endedAt = new Date().toISOString();
  session.completed = true;
  state.activeSessionId = null;
  state.consecutiveSessions = computeConsecutive(state.sessions);
  saveState(state);
}

/**
 * Get the current telemetry summary for display in the app.
 */
export function getTelemetrySummary(): {
  consecutiveSessions: number;
  lastSessionCellEdits: number;
  lastSessionAvgCellMs: number | null;
  lastSessionSheetOpenings: number;
  totalSessions: number;
} {
  const state = loadState();
  const lastSession = state.sessions[state.sessions.length - 1];
  const avgMs = lastSession && lastSession.cellEdits.length > 0
    ? lastSession.cellEdits.reduce((sum, e) => sum + e.durationMs, 0) /
      lastSession.cellEdits.length
    : null;

  return {
    consecutiveSessions: state.consecutiveSessions,
    lastSessionCellEdits: lastSession?.cellEdits.length ?? 0,
    lastSessionAvgCellMs: avgMs,
    lastSessionSheetOpenings: lastSession?.sheetOpeningReported ?? 0,
    totalSessions: state.sessions.length,
  };
}

/**
 * Export full telemetry as JSON for desktop verification.
 * Part of the round-trip export/import requirement.
 */
export function exportTelemetry(): string {
  const state = loadState();
  return JSON.stringify(state, null, 2);
}

/**
 * Import telemetry from a JSON string (for desktop sync).
 * Validates shape entry by entry: corrupt sessions are discarded, and a
 * document without a sessions array throws instead of crashing callers
 * with a TypeError on undefined.
 */
export function importTelemetry(json: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('El archivo no es un JSON válido de telemetría');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('El archivo no es un export válido de telemetría');
  }
  const doc = parsed as Record<string, unknown>;
  if (!Array.isArray(doc.sessions)) {
    throw new Error('El archivo no es un export válido de telemetría (sin sessions)');
  }
  const sessions = (doc.sessions as unknown[]).filter(
    (s): s is SessionTelemetry =>
      !!s &&
      typeof s === 'object' &&
      typeof (s as Record<string, unknown>).sessionId === 'string' &&
      typeof (s as Record<string, unknown>).startedAt === 'string' &&
      Number.isFinite(Date.parse((s as Record<string, unknown>).startedAt as string)) &&
      typeof (s as Record<string, unknown>).completed === 'boolean' &&
      Array.isArray((s as Record<string, unknown>).cellEdits)
  );
  const activeSessionId =
    typeof doc.activeSessionId === 'string' || doc.activeSessionId === null
      ? (doc.activeSessionId as string | null)
      : null;
  const state: TelemetryState = { sessions, activeSessionId, consecutiveSessions: 0 };
  state.consecutiveSessions = computeConsecutive(state.sessions);
  saveState(state);
}

/**
 * Clear all telemetry data (for testing or reset).
 */
export function clearTelemetry(): void {
  localStorage.removeItem(TELEMETRY_KEY);
}

// ── Custom event tracking (BET-2026-001 Resolution Signal) ────────────
// Resolution Signal exige instrumentación de sesiones enteras en app y
// tiempo por celda ≤ 3 s. <Analytics /> solo no alcanza: cada evento de
// negocio se registra acá en localStorage (auditable sin red) y se
// reenvía best-effort al proveedor de analytics si está disponible.

export type TelemetryEvent =
  | 'app_opened'
  | 'session_started'
  | 'session_completed'
  | 'cell_edited'
  | 'plan_imported'
  | 'plan_exported';

export interface TrackedEvent {
  event: TelemetryEvent;
  at: string; // ISO
  props: Record<string, string | number | boolean | null>;
}

const EVENTS_KEY = 'rutinify-telemetry-events';

export function track(event: TelemetryEvent, props: Record<string, string | number | boolean | null> = {}): void {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const events: TrackedEvent[] = raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
    events.push({ event, at: new Date().toISOString(), props });
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-500)));
  } catch {
    console.error('[telemetry] Failed to persist tracked event');
  }
}

export function getTrackedEvents(): TrackedEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    return raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
  } catch {
    return [];
  }
}
