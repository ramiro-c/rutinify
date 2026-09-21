-- BET-2026-001 — esquema Postgres (migración hacia adelante).
-- La migración de vuelta es el export JSON (ver docs/como-reemplazo-el-plan.md).

CREATE TABLE IF NOT EXISTS cells (
  exercise_id TEXT NOT NULL,
  week        SMALLINT NOT NULL CHECK (week BETWEEN 1 AND 4),
  set_index   SMALLINT NOT NULL CHECK (set_index >= 0),
  weight      DOUBLE PRECISION,
  reps        INTEGER,
  updated_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (exercise_id, week, set_index)
);

CREATE TABLE IF NOT EXISTS notes (
  exercise_id TEXT NOT NULL,
  week        SMALLINT NOT NULL CHECK (week BETWEEN 1 AND 4),
  text        TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (exercise_id, week)
);

CREATE TABLE IF NOT EXISTS plans (
  id         TEXT PRIMARY KEY,
  json       JSONB NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Merge LWW por celda: gana el registro con updated_at mayor.
-- Uso:
--   INSERT INTO cells (exercise_id, week, set_index, weight, reps, updated_at)
--   VALUES ($1, $2, $3, $4, $5, $6)
--   ON CONFLICT (exercise_id, week, set_index) DO UPDATE
--     SET weight = EXCLUDED.weight,
--         reps = EXCLUDED.reps,
--         updated_at = EXCLUDED.updated_at
--   WHERE EXCLUDED.updated_at > cells.updated_at;
