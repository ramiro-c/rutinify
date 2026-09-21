import { describe, it, expect } from 'vitest';
import {
  parseCSVText,
  convertToRoutine,
  REQUIRED_HEADERS,
} from '../csv';

const HEADER = REQUIRED_HEADERS.join(',');

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseo de CSV del Sheet', () => {
  it('acepta archivo válido con BOM de Google Sheets', () => {
    const text = '﻿' + csv('1,A1,Press banca,4,8,2010,80,82.5,85,87.5,');
    const { data, errors } = parseCSVText(text);
    expect(errors).toEqual([]);
    expect(data[0].Día).toBe('1');
    expect(data[0].Ejercicio).toBe('Press banca');
  });

  it('reporta la archivo-línea original aunque haya líneas vacías', () => {
    const text = [HEADER, '1,A1,Press banca,4,8,2010,80,82.5,85,87.5,', '', '1,A2,Fondos,3,10,2010,0,0,0,0,nota,EXTRA'].join(
      '\n'
    );
    const { errors } = parseCSVText(text);
    // La fila con 2 columnas en vez de 11 está en archivo-línea 4.
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(4);
  });

  it('soporta Notas entrecomilladas con salto de línea interno (RFC 4180)', () => {
    const text = HEADER + '\n1,A1,Press banca,4,8,2010,80,82.5,85,87.5,"nota con, coma\ny segunda línea"';
    const { data, errors } = parseCSVText(text);
    expect(errors).toEqual([]);
    expect(data[0].Notas).toBe('nota con, coma\ny segunda línea');
  });

  it('rechaza Series="abc" y Reps vacío en vez de importar 3x10 en silencio', () => {
    const { errors } = parseCSVText(csv('1,A1,Press banca,abc,,2010,80,82.5,85,87.5,'));
    const fields = errors.map(e => e.field);
    expect(fields).toContain('Series');
    expect(fields).toContain('Reps');
  });

  it('rechaza Series vacío (0 sets en silencio)', () => {
    const { errors } = parseCSVText(csv('1,A1,Press banca,,8,2010,80,82.5,85,87.5,'));
    expect(errors.some(e => e.field === 'Series')).toBe(true);
  });

  it('lee los kilos del plan (Semana 1..4) en vez de perderlos', () => {
    const { data, errors } = parseCSVText(csv('1,A1,Press banca,4,8,2010,80,82.5,85,87.5,'));
    expect(errors).toEqual([]);
    const routine = convertToRoutine(data, 'Test');
    const ex = routine.days[0].supersets[0].exercises[0];
    expect(ex.weeklyWeights).toEqual([80, 82.5, 85, 87.5]);
    expect(ex.sets[0]).toMatchObject({ weight: 80, reps: 8 });
    expect(ex.sets).toHaveLength(4);
  });

  it('peso semanal vacío queda null (no inventa 0)', () => {
    const { data, errors } = parseCSVText(csv('1,A1,Press banca,4,8,2010,,82.5,,87.5,'));
    expect(errors).toEqual([]);
    const routine = convertToRoutine(data, 'Test');
    const ex = routine.days[0].supersets[0].exercises[0];
    expect(ex.weeklyWeights).toEqual([null, 82.5, null, 87.5]);
    expect(ex.sets[0]).toMatchObject({ weight: null, reps: 8 });
  });

  it('preserva la distinción A1 vs A2 dentro del mismo superset A', () => {
    const { data, errors } = parseCSVText(
      csv(
        '1,A1,Press banca,4,8,2010,80,82.5,85,87.5,',
        '1,A2,Fondos,3,10,2010,0,0,0,0,'
      )
    );
    expect(errors).toEqual([]);
    const routine = convertToRoutine(data, 'Test');
    const supA = routine.days[0].supersets.find(s => s.id === 'A');
    expect(supA).toBeDefined();
    expect(supA!.exercises.map(e => e.supersetCode).sort()).toEqual(['A1', 'A2']);
  });

  it('no colisiona ids cuando el mismo ejercicio se repite en el superset', () => {
    const { data, errors } = parseCSVText(
      csv(
        '1,A1,Press banca,4,8,2010,80,82.5,85,87.5,',
        '1,A1,Press banca,3,10,2010,60,62.5,65,67.5,'
      )
    );
    expect(errors).toEqual([]);
    const routine = convertToRoutine(data, 'Test');
    const ids = routine.days[0].supersets[0].exercises.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
