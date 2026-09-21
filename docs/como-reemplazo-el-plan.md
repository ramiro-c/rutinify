# Cómo reemplazo el plan (BET-2026-001)

## Importar un plan nuevo

1. Abrí la app → Importar Rutina.
2. Elegí el archivo `.csv` **o** pegá el contenido del Sheet como texto.
3. Revisá la vista previa (ejercicios encontrados + errores, si hay).
4. Poné el nombre y presioná **Importar (reemplaza el plan)**.

El import **reemplaza, no mergea**: si ya existe un plan con el mismo
nombre, queda reemplazado por el nuevo. No se duplica.

## Volver atrás (plan de reversión)

El export JSON es la migración de vuelta:

1. Antes de importar, presioná **Exportar JSON** (barra de Mis Rutinas).
2. Guardá el archivo `rutinify-backup-<fecha>.json`.
3. Si algo sale mal, presioná **Importar JSON** y elegí el backup:
   restaura rutinas, historial, celdas y telemetría.
4. Gate de canary etapa 1: borrar todo e importar el backup debe
   restaurar la sesión completa (round-trip verificado por tests).

## Sync celular ↔ desktop

- Cada celda guarda `updated_at`; el merge es last-write-wins.
- Sin conexión, las escrituras quedan en el outbox local (`rutinify-outbox`)
  y se aplican al reconectar (pull/merge). Reintentar no duplica.
- Si usás dos dispositivos a la vez y una celda queda pisada por el merge,
  volvés al backup JSON (rollback manual).
