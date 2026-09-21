# Protocolo de sync celular ↔ desktop (BET-2026-001)

El cliente (`src/lib/remoteSync.ts`) habla con un backend que respalda el
esquema de `schema.sql`. Sin `VITE_SYNC_URL` la app funciona 100 % local y
el flujo entre dispositivos es el export/import JSON (`src/lib/exportImport.ts`).

## Endpoints

| Método | Ruta   | Auth             | Cuerpo / Respuesta                          |
|--------|--------|------------------|---------------------------------------------|
| GET    | `/sync` | `Authorization: Bearer <VITE_API_TOKEN>` | Respuesta: `{ "cells": CellRecord[], "notes": NoteRecord[] }` |
| POST   | `/sync` | `Authorization: Bearer <VITE_API_TOKEN>` | Cuerpo: `{ "cells": CellRecord[], "notes": NoteRecord[] }`; responde el snapshot convergido |

## Semántica (ambos lados)

- Merge por celda con last-write-wins sobre `updated_at`, igual que el
  UPSERT de `schema.sql`: `WHERE excluded.updated_at > cells.updated_at`.
- Notas con LWW por clave `(exercise_id, week)`.
- Entradas sin forma válida se descartan sin contaminar el store
  (el cliente filtra con `isValidCell` / `isValidNote`).
- El POST del cliente lleva el snapshot ya fusionado: el servidor aplica
  el mismo UPSERT condicional y responde su estado, que el cliente vuelve
  a fusionar. Reintentar es idempotente (claves estables + `opId` en el
  outbox local).

## Ciclo en el cliente

1. Escrituras offline → `rutinify-cells` / `rutinify-notes` + `rutinify-outbox`.
2. `drainOutbox()` al arrancar (aplica pendientes a los stores locales).
3. Pull/merge/push (`syncOnReconnect()`) al arrancar, al recuperar red
   (`online`), cada 60 s y cuando la pestaña vuelve a ser visible: el
   pull NO espera una transición offline→online porque con ambos
   dispositivos siempre online nadie la atraviesa (el desktop que abre
   la app online ve las sesiones del celular en el pull del boot).
4. Sin red o sin backend → todo queda en localStorage; nada se pierde,
   nada se bloquea.

## Backend de referencia

`server/sync-server.mjs` implementa este contrato con cero dependencias
(solo `node:http`): GET/POST `/sync` con Bearer opcional, merge LWW
idéntico al UPSERT de `schema.sql`, persistencia en el JSON de
`SYNC_DATA_PATH` y `GET /health`. Despliegue: `node
server/sync-server.mjs` o `server/Dockerfile` (ver `.env.example`).
Apuntar la app con `VITE_SYNC_URL` + `VITE_API_TOKEN` al host donde
corra; sin esas variables el flujo entre dispositivos sigue siendo el
export/import JSON.
