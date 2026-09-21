# Formato de CSV aceptado (BET-2026-001)

Fuente: export del Google Sheet del plan. Dos vías de entrada:
archivo `.csv` o texto pegado (Importar → pegar como texto).

## Headers exactos (11 columnas, en este orden o cualquier orden)

```
Día,Superserie,Ejercicio,Series,Reps,Tempo,Semana 1,Semana 2,Semana 3,Semana 4,Notas
```

## Reglas por columna

| Columna | Regla |
|---|---|
| Día | Entero 1–7. |
| Superserie | Formato `A1`, `B2`, etc. La letra agrupa el superset (`A`); el código completo se preserva por ejercicio, así `A1` y `A2` no se confunden. |
| Ejercicio | Requerido. |
| Series / Reps | Enteros positivos mayores a 0. `abc` o vacío es error, no default silencioso. |
| Tempo | Texto libre (ej. `2010`). Vacío → `----`. |
| Semana 1–4 | Kilos del plan. Número ≥ 0 (acepta `82.5` y `82,5`). Vacío = sin peso planificado (`null`). La Semana 1 es el peso inicial de cada set. |
| Notas | Texto libre. Acepta comas y saltos de línea si va entrecomillado (`"línea 1\nlínea 2"`, RFC 4180). |

## Detalles de parseo

- Archivos exportados de Sheets con BOM UTF-8 (`﻿`) se aceptan.
- Líneas vacías se ignoran; los errores reportan la archivo-línea original.
- Filas con distinto número de columnas que los headers son error.
- Filas totalmente vacías separan bloques y no son error.
