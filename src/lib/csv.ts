import type { Routine, WorkoutDay, Superset, Exercise } from '../types';

export interface ParsedCSVRow {
  Día: string;
  Superserie: string;
  Ejercicio: string;
  Series: string;
  Reps: string;
  Tempo: string;
  'Semana 1': string;
  'Semana 2': string;
  'Semana 3': string;
  'Semana 4': string;
  Notas: string;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export const REQUIRED_HEADERS = [
  'Día',
  'Superserie',
  'Ejercicio',
  'Series',
  'Reps',
  'Tempo',
  'Semana 1',
  'Semana 2',
  'Semana 3',
  'Semana 4',
  'Notas',
] as const;

export const WEEK_COLUMNS = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'] as const;

/** Strip a leading UTF-8 BOM (U+FEFF) added by Google Sheets exports. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export interface RawParseResult {
  rows: string[][];
  /** lineMap[rowIndex] = archivo-línea original 1-based donde empezó la fila. */
  lineMap: number[];
}

/**
 * Parser RFC 4180: comas, campos entrecomillados con comas, comillas
 * escapadas ("") y saltos de línea internos multilínea. \r\n y \n.
 * Las líneas puramente vacías se omiten pero lineMap preserva el número
 * de archivo-línea para reportes de error precisos.
 */
export function parseRFC4180(raw: string): RawParseResult {
  const rows: string[][] = [];
  const lineMap: number[] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let rowStartLine = 1;
  let originalLine = 1;

  const flushRow = () => {
    currentRow.push(currentField);
    currentField = '';
    const trimmed = currentRow.map(f => f.trim());
    if (trimmed.some(f => f.length > 0)) {
      rows.push(trimmed);
      lineMap.push(rowStartLine);
    }
    currentRow = [];
  };

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < raw.length && raw[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
        if (char === '\n') originalLine++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        flushRow();
        originalLine++;
        rowStartLine = originalLine;
      } else if (char === '\r') {
        if (i + 1 < raw.length && raw[i + 1] === '\n') i++;
        flushRow();
        originalLine++;
        rowStartLine = originalLine;
      } else {
        currentField += char;
      }
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    const trimmed = currentRow.map(f => f.trim());
    if (trimmed.some(f => f.length > 0)) {
      rows.push(trimmed);
      lineMap.push(rowStartLine);
    }
  }
  return { rows, lineMap };
}

export interface ParsedCSV {
  data: ParsedCSVRow[];
  errors: ValidationError[];
}

/** Parsea texto CSV crudo (archivo o pegado). Lanza Error si headers faltan. */
export function parseCSVText(rawText: string): ParsedCSV {
  const text = stripBom(rawText);
  if (text.trim().length === 0) throw new Error('El archivo CSV está vacío');
  const { rows, lineMap } = parseRFC4180(text);
  if (rows.length < 2) {
    throw new Error('El archivo CSV debe tener al menos una fila de headers y una de datos');
  }
  const headers = rows[0].map(h => h.trim());
  const missingHeaders = (REQUIRED_HEADERS as readonly string[]).filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(`Headers faltantes: ${missingHeaders.join(', ')}`);
  }
  const data: ParsedCSVRow[] = [];
  const errors: ValidationError[] = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const originalLine = lineMap[i];
    const isEmptyRow = values.every(v => v === '');
    if (isEmptyRow) {
      const emptyRow = {} as Record<string, string>;
      headers.forEach(h => {
        emptyRow[h] = '';
      });
      data.push(emptyRow as unknown as ParsedCSVRow);
      continue;
    }
    if (values.length !== headers.length) {
      errors.push({
        row: originalLine,
        field: 'general',
        message: `Número incorrecto de columnas. Esperadas: ${headers.length}, encontradas: ${values.length}`,
      });
      continue;
    }
    const row = {} as Record<string, string>;
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    validateRow(row as unknown as ParsedCSVRow, originalLine, errors);
    data.push(row as unknown as ParsedCSVRow);
  }
  return { data, errors };
}

const POSITIVE_INT = /^\d+$/;

function parsePositiveIntOrNull(value: string): number | null {
  const t = value.trim();
  if (t === '') return null;
  if (!POSITIVE_INT.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 1 ? n : null;
}

function parseWeekWeight(value: string): number | null {
  const t = value.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function validateRow(row: ParsedCSVRow, rowNumber: number, errors: ValidationError[]): void {
  const isEmpty = Object.values(row).every(value => !value.trim());
  if (isEmpty) return;
  if (row.Día && (isNaN(Number(row.Día)) || Number(row.Día) < 1 || Number(row.Día) > 7)) {
    errors.push({ row: rowNumber, field: 'Día', message: 'Debe ser un número entre 1 y 7' });
  }
  if (row.Superserie && row.Superserie.trim() !== '' && !/^[A-Z]\d+$/.test(row.Superserie.trim())) {
    errors.push({ row: rowNumber, field: 'Superserie', message: 'Debe tener formato A1, B2, etc.' });
  }
  if (!row.Ejercicio.trim()) {
    errors.push({ row: rowNumber, field: 'Ejercicio', message: 'El ejercicio es requerido' });
  }
  // Series y Reps son obligatorios y enteros positivos: ni "abc", ni vacío.
  const series = parsePositiveIntOrNull(row.Series);
  if (series === null) {
    errors.push({
      row: rowNumber,
      field: 'Series',
      message: `Debe ser un número entero positivo mayor a 0, recibido: "${row.Series}"`,
    });
  }
  const reps = parsePositiveIntOrNull(row.Reps);
  if (reps === null) {
    errors.push({
      row: rowNumber,
      field: 'Reps',
      message: `Debe ser un número entero positivo mayor a 0, recibido: "${row.Reps}"`,
    });
  }
  // Pesos semanales: si tienen valor deben ser numéricos (acepta "82.5" y "82,5").
  for (const col of WEEK_COLUMNS) {
    const raw = (row as unknown as Record<string, string>)[col] ?? '';
    if (raw.trim() !== '' && parseWeekWeight(raw) === null) {
      errors.push({
        row: rowNumber,
        field: col,
        message: `Debe ser un número mayor o igual a 0, recibido: "${raw}"`,
      });
    }
  }
}

/** Letra del contenedor superset ("A1" -> "A"). El código completo vive en exercise.supersetCode. */
export function supersetGroupOf(code: string): string {
  const m = code.trim().match(/^([A-Z]+)/);
  return m ? m[1] : code.trim().charAt(0) || 'A';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function newRoutineId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function convertToRoutine(data: ParsedCSVRow[], routineName: string, routineId?: string): Routine {
  const routine: Routine = {
    id: routineId ?? newRoutineId(),
    name: routineName.trim(),
    days: [],
  };
  const dayGroups = new Map<number, ParsedCSVRow[]>();
  data.forEach(row => {
    const isEmpty = Object.values(row).every(value => !value.trim());
    if (isEmpty) return;
    const dayNum = Number(row.Día);
    if (isNaN(dayNum)) return;
    if (!dayGroups.has(dayNum)) dayGroups.set(dayNum, []);
    dayGroups.get(dayNum)!.push(row);
  });
  dayGroups.forEach((rows, dayNumber) => {
    const workoutDay: WorkoutDay = { day: dayNumber, supersets: [] };
    const supersetGroups = new Map<string, ParsedCSVRow[]>();
    rows.forEach(row => {
      const code = row.Superserie.trim() || 'A1';
      const group = supersetGroupOf(code);
      if (!supersetGroups.has(group)) supersetGroups.set(group, []);
      supersetGroups.get(group)!.push(row);
    });
    // Claves de celda únicas: dos filas del mismo día/superset con el
    // mismo nombre (ej. "Press banca" dos veces en A) recibían el mismo
    // id y una sobrescribía a la otra en la grilla. Se sufija -2, -3…
    const usedIds = new Set<string>();
    const uniqueExerciseId = (base: string): string => {
      if (!usedIds.has(base)) {
        usedIds.add(base);
        return base;
      }
      let n = 2;
      while (usedIds.has(`${base}-${n}`)) n++;
      const id = `${base}-${n}`;
      usedIds.add(id);
      return id;
    };
    supersetGroups.forEach((supersetRows, supersetId) => {
      // Preservar distinción A1 vs A2: orden por código completo dentro del grupo.
      const ordered = [...supersetRows].sort((a, b) =>
        (a.Superserie || '').localeCompare(b.Superserie || '')
      );
      const superset: Superset = { id: supersetId, exercises: [] };
      ordered.forEach(row => {
        const exerciseName = row.Ejercicio;
        const exercise: Exercise = {
          id: uniqueExerciseId(`${dayNumber}-${supersetId}-${slugify(exerciseName)}`),
          name: exerciseName,
          type: 'reps',
          sets: [],
          tempo: row.Tempo || '----',
          supersetCode: row.Superserie.trim() || `${supersetId}1`,
          notes: row.Notas || undefined,
          weeklyWeights: WEEK_COLUMNS.map(col =>
            parseWeekWeight((row as unknown as Record<string, string>)[col] ?? '')
          ),
        };
        const seriesCount = parsePositiveIntOrNull(row.Series) ?? 0;
        const repsCount = parsePositiveIntOrNull(row.Reps) ?? 0;
        // Peso de la Semana 1 ausente (celda vacía) queda null, no 0:
        // 0 inventaría un "Plan 0 kg" y contradice el rechazo de defaults
        // silenciosos (Series/Reps inválidos se rechazan, no se defaultean).
        const baseWeight = exercise.weeklyWeights?.[0] ?? null;
        for (let i = 0; i < seriesCount; i++) {
          exercise.sets.push({
            id: `${exercise.id}-set-${i}`,
            type: 'reps',
            weight: baseWeight,
            reps: repsCount,
          });
        }
        superset.exercises.push(exercise);
      });
      workoutDay.supersets.push(superset);
    });
    routine.days.push(workoutDay);
  });
  routine.days.sort((a, b) => a.day - b.day);
  return routine;
}
