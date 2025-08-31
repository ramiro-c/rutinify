import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Check, AlertCircle, Download } from 'lucide-react';
import { useRoutines } from '../hooks/useRoutinesContext';
import type { Routine, WorkoutDay, Exercise, Superset } from '../types';

interface ImportCSVProps {
  onImportSuccess: () => void;
  onCancel: () => void;
}

interface ParsedCSVRow {
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

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

const REQUIRED_HEADERS = [
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
];

export const ImportCSV = ({ onImportSuccess, onCancel }: ImportCSVProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedCSVRow[] | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [routineName, setRoutineName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addRoutine } = useRoutines();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      alert('Por favor selecciona un archivo CSV válido');
      return;
    }

    setFile(selectedFile);
    parseCSV(selectedFile);
  };

  const parseCSV = async (file: File) => {
    setIsProcessing(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        throw new Error(
          'El archivo CSV debe tener al menos una fila de headers y una de datos'
        );
      }

      // Parser CSV más robusto que maneja comillas y comas correctamente
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
          const char = line[i];

          if (char === '"') {
            // Manejar comillas dobles escapadas ""
            if (i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i += 2; // Saltar ambas comillas
              continue;
            }
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
          i++;
        }

        result.push(current.trim());
        return result;
      };
      const headers = parseCSVLine(lines[0]);

      // Validar headers
      const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        throw new Error(`Headers faltantes: ${missingHeaders.join(', ')}`);
      }

      // Parsear datos
      const data: ParsedCSVRow[] = [];
      const errors: ValidationError[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);

        // Si todos los valores están vacíos, es una línea separadora válida
        const isEmptyRow = values.every(value => value === '');
        if (isEmptyRow) {
          // Crear una fila vacía válida
          const emptyRow = {} as Record<string, string>;
          headers.forEach(header => {
            emptyRow[header] = '';
          });
          data.push(emptyRow as unknown as ParsedCSVRow);
          continue;
        }

        if (values.length !== headers.length) {
          errors.push({
            row: i + 1,
            field: 'general',
            message: `Número incorrecto de columnas. Esperadas: ${headers.length}, encontradas: ${values.length}`,
          });
          continue;
        }

        const row = {} as Record<string, string>;
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        // Validar fila
        validateRow(row as unknown as ParsedCSVRow, i + 1, errors);
        data.push(row as unknown as ParsedCSVRow);
      }

      setParsedData(data);
      setValidationErrors(errors);

      // Sugerir nombre de rutina basado en el archivo
      const fileName = file.name.replace('.csv', '');
      setRoutineName(fileName.charAt(0).toUpperCase() + fileName.slice(1));
    } catch (error) {
      alert(
        error instanceof Error ? error.message : 'Error al procesar el archivo'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const validateRow = (
    row: ParsedCSVRow,
    rowNumber: number,
    errors: ValidationError[]
  ) => {
    // Si toda la fila está vacía, es un separador válido
    const isEmpty = Object.values(row).every(value => !value.trim());
    if (isEmpty) return;

    // Validar día si no está vacío
    if (
      row.Día &&
      (isNaN(Number(row.Día)) || Number(row.Día) < 1 || Number(row.Día) > 7)
    ) {
      errors.push({
        row: rowNumber,
        field: 'Día',
        message: 'Debe ser un número entre 1 y 7',
      });
    }

    // Validar superserie si no está vacía
    if (row.Superserie && !/^[A-Z]\d+$/.test(row.Superserie)) {
      // Permitir vacío pero si tiene valor debe ser formato correcto
      if (row.Superserie.trim() !== '') {
        errors.push({
          row: rowNumber,
          field: 'Superserie',
          message: 'Debe tener formato A1, B2, etc.',
        });
      }
    }

    // Validar ejercicio (requerido si la fila no está vacía)
    if (!isEmpty && !row.Ejercicio.trim()) {
      errors.push({
        row: rowNumber,
        field: 'Ejercicio',
        message: 'El ejercicio es requerido',
      });
    }
  };

  const convertToRoutine = (): Routine => {
    if (!parsedData) throw new Error('No hay datos para convertir');

    const routine: Routine = {
      name: routineName.trim(),
      days: [],
    };

    // Agrupar por día
    const dayGroups = new Map<number, ParsedCSVRow[]>();

    parsedData.forEach(row => {
      // Saltar filas vacías/separadoras
      const isEmpty = Object.values(row).every(value => !value.trim());
      if (isEmpty) return;

      const dayNum = Number(row.Día);
      if (isNaN(dayNum)) return;

      if (!dayGroups.has(dayNum)) {
        dayGroups.set(dayNum, []);
      }
      dayGroups.get(dayNum)!.push(row);
    });

    // Convertir cada día
    dayGroups.forEach((rows, dayNumber) => {
      const workoutDay: WorkoutDay = {
        day: dayNumber,
        supersets: [],
      };

      // Agrupar por superserie
      const supersetGroups = new Map<string, ParsedCSVRow[]>();

      rows.forEach(row => {
        const supersetCode = row.Superserie || 'A1'; // Default si no hay superserie
        const supersetLetter = supersetCode.charAt(0);

        if (!supersetGroups.has(supersetLetter)) {
          supersetGroups.set(supersetLetter, []);
        }
        supersetGroups.get(supersetLetter)!.push(row);
      });

      // Convertir cada superserie
      supersetGroups.forEach((supersetRows, supersetId) => {
        const superset: Superset = {
          id: supersetId,
          exercises: [],
        };

        supersetRows.forEach(row => {
          // Crear ID consistente basado en el nombre del ejercicio
          const exerciseName = row.Ejercicio.toLowerCase()
            .replace(/[^a-z0-9]/g, '-') // Reemplazar caracteres especiales con guiones
            .replace(/-+/g, '-') // Reducir múltiples guiones a uno
            .replace(/^-|-$/g, ''); // Remover guiones al inicio y final

          const exercise: Exercise = {
            id: `${dayNumber}-${supersetId}-${exerciseName}`,
            name: row.Ejercicio,
            type: 'reps', // Default, se puede mejorar con lógica más específica
            sets: [],
            tempo: row.Tempo || '----',
            supersetCode: row.Superserie || `${supersetId}1`,
            notes: row.Notas || undefined,
          };

          // Crear sets básicos basados en la cantidad de series
          const seriesCount = parseInt(row.Series) || 3;
          for (let i = 0; i < seriesCount; i++) {
            exercise.sets.push({
              id: `${exercise.id}-set-${i}`,
              type: 'reps',
              weight: 0,
              reps: parseInt(row.Reps) || 10,
            });
          }

          superset.exercises.push(exercise);
        });

        workoutDay.supersets.push(superset);
      });

      routine.days.push(workoutDay);
    });

    // Ordenar días
    routine.days.sort((a, b) => a.day - b.day);

    return routine;
  };

  const handleImport = () => {
    if (!parsedData || !routineName.trim()) return;
    if (validationErrors.length > 0) {
      alert('Por favor corrige los errores antes de importar');
      return;
    }

    try {
      const routine = convertToRoutine();
      addRoutine(routine);

      // Dar un pequeño delay para asegurar que localStorage se actualice
      setTimeout(() => {
        onImportSuccess();
      }, 100);
    } catch (error) {
      alert(
        error instanceof Error ? error.message : 'Error al importar la rutina'
      );
    }
  };

  if (!file) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <Card
          className="w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto border"
          style={{ backgroundColor: 'hsl(var(--background))' }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Importar Rutina CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>El archivo CSV debe tener exactamente estas columnas:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Día, Superserie, Ejercicio</li>
                <li>Series, Reps, Tempo</li>
                <li>Semana 1, Semana 2, Semana 3, Semana 4</li>
                <li>Notas</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="csv-file">Seleccionar archivo CSV</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                ref={fileInputRef}
                className="cursor-pointer"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card
        className="w-full max-w-2xl mx-auto max-h-[90vh] flex flex-col border"
        style={{ backgroundColor: 'hsl(var(--background))' }}
      >
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Vista Previa - {file.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 flex-1 overflow-y-auto">
          {isProcessing ? (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
              <p>Procesando archivo...</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="routine-name">Nombre de la rutina</Label>
                <Input
                  id="routine-name"
                  value={routineName}
                  onChange={e => setRoutineName(e.target.value)}
                  placeholder="Ingresa el nombre de la rutina"
                />
              </div>

              {validationErrors.length > 0 && (
                <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="font-medium text-destructive">
                      Errores encontrados:
                    </span>
                  </div>
                  <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                    {validationErrors.map((error, index) => (
                      <li key={index}>
                        Fila {error.row}, {error.field}: {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedData && (
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-2">
                    {parsedData.filter(row => row.Ejercicio.trim()).length}{' '}
                    ejercicios encontrados
                  </p>
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    <div className="p-3 space-y-2">
                      {parsedData.slice(0, 5).map((row, index) => (
                        <div key={index} className="text-sm border-b pb-2">
                          {row.Ejercicio && (
                            <div>
                              <strong>Día {row.Día}</strong> - {row.Superserie}{' '}
                              - {row.Ejercicio}
                            </div>
                          )}
                        </div>
                      ))}
                      {parsedData.length > 5 && (
                        <p className="text-xs text-muted-foreground">
                          ... y {parsedData.length - 5} más
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
        <div className="flex-shrink-0 p-6 pt-0">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} className="flex-1">
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button
              onClick={handleImport}
              className="flex-1"
              disabled={!routineName.trim() || validationErrors.length > 0}
            >
              <Check className="mr-2 h-4 w-4" />
              Importar
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
