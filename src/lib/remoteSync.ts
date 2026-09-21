import type { CellRecord, NoteRecord } from '../types';
import {
  CELLS_KEY,
  NOTES_KEY,
  isValidCell,
  isValidNote,
  loadCells,
  loadNotes,
  mergeCells,
  mergeNotes,
} from './sync';

export interface RemoteSnapshot {
  cells: CellRecord[];
  notes: NoteRecord[];
}

export type FetchFn = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Base URL del backend de sync (misma API que respalda db/schema.sql). */
export function getSyncBaseUrl(env?: Record<string, string | undefined>): string {
  const source =
    env ?? ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return (source.VITE_SYNC_URL ?? '').trim().replace(/\/+$/, '');
}

export function getApiToken(env?: Record<string, string | undefined>): string {
  const source =
    env ?? ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
  return (source.VITE_API_TOKEN ?? '').trim();
}

/** true cuando hay un backend configurado contra el que sincronizar. */
export function isRemoteSyncConfigured(env?: Record<string, string | undefined>): boolean {
  return getSyncBaseUrl(env).length > 0;
}

function authHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function sanitizeSnapshot(raw: unknown): RemoteSnapshot {
  if (!raw || typeof raw !== 'object') return { cells: [], notes: [] };
  const doc = raw as Record<string, unknown>;
  return {
    cells: Array.isArray(doc.cells) ? doc.cells.filter(isValidCell) : [],
    notes: Array.isArray(doc.notes) ? doc.notes.filter(isValidNote) : [],
  };
}

/**
 * Pull del snapshot remoto. Devuelve null cuando no hay backend
 * configurado (la app sigue 100 % local y el flujo desktop es el
 * export/import JSON). Lanza ante fallo de red para que el llamador
 * decida el fallback sin tocar el store local.
 */
export async function pullSnapshot(
  fetchFn: FetchFn = globalThis.fetch as unknown as FetchFn,
  env?: Record<string, string | undefined>,
  storage: Storage = localStorage
): Promise<RemoteSnapshot | null> {
  const baseUrl = getSyncBaseUrl(env);
  if (!baseUrl) return null;
  // La lectura de celdas locales valida que el storage responda antes
  // de salir a la red; si el storage está roto no tiene sentido el pull.
  loadCells(storage);
  const res = await fetchFn(`${baseUrl}/sync`, { headers: authHeaders(getApiToken(env)) });
  if (!res.ok) throw new Error(`pull del sync falló con status ${res.status}`);
  return sanitizeSnapshot(await res.json());
}

/**
 * Push del snapshot local fusionado y pull/merge LWW en una vuelta.
 * Convergencia teléfono ↔ desktop sin export/import manual cuando hay
 * backend; sin backend devuelve false y no toca el store local.
 * Un fallo de red devuelve false con el store local intacto.
 */
export async function syncOnReconnect(
  fetchFn: FetchFn = globalThis.fetch as unknown as FetchFn,
  env?: Record<string, string | undefined>,
  storage: Storage = localStorage
): Promise<boolean> {
  const baseUrl = getSyncBaseUrl(env);
  if (!baseUrl) return false;
  let remote: RemoteSnapshot;
  try {
    const res = await fetchFn(`${baseUrl}/sync`, { headers: authHeaders(getApiToken(env)) });
    if (!res.ok) return false;
    remote = sanitizeSnapshot(await res.json());
  } catch {
    return false;
  }
  const mergedCells = mergeCells(loadCells(storage), remote.cells);
  const mergedNotes = mergeNotes(loadNotes(storage), remote.notes);
  storage.setItem(CELLS_KEY, JSON.stringify(mergedCells));
  storage.setItem(NOTES_KEY, JSON.stringify(mergedNotes));
  // Best-effort: devolver al servidor el estado ya convergido para que
  // el otro dispositivo lo vea en su próximo pull. Si falla, el merge
  // local ya quedó persistido y el próximo reconnect lo reintenta.
  try {
    await fetchFn(`${baseUrl}/sync`, {
      method: 'POST',
      headers: authHeaders(getApiToken(env)),
      body: JSON.stringify({ cells: mergedCells, notes: mergedNotes }),
    });
  } catch {
    // Intencionalmente ignorado: la convergencia local ya está a salvo.
  }
  return true;
}
