import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Check, AlertCircle, Download, ClipboardPaste } from 'lucide-react';
import { useRoutines } from '../hooks/useRoutinesContext';
import { parseCSVText, convertToRoutine, type ParsedCSVRow, type ValidationError } from '../lib/csv';
import { track } from '../lib/telemetry';

interface ImportCSVProps {
  onImportSuccess: () => void;
  onCancel: () => void;
}

export const ImportCSV = ({ onImportSuccess, onCancel }: ImportCSVProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedCSVRow[] | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [routineName, setRoutineName] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upsertRoutine } = useRoutines();

  const runParse = (text: string, suggestedName: string) => {
    setIsProcessing(true);
    try {
      const { data, errors } = parseCSVText(text);
      setParsedData(data);
      setValidationErrors(errors);
      setSourceName(suggestedName);
      const base = suggestedName.replace(/\.csv$/i, '');
      setRoutineName(base.charAt(0).toUpperCase() + base.slice(1));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al procesar el archivo');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      alert('Por favor selecciona un archivo CSV válido');
      return;
    }

    setFile(selectedFile);
    selectedFile.text().then(text => runParse(text, selectedFile.name));
  };

  const handlePasteImport = () => {
    if (pastedText.trim().length === 0) {
      alert('Pegá el contenido CSV primero');
      return;
    }
    setFile(null);
    runParse(pastedText, 'rutina-pegada.csv');
  };

  const handleImport = () => {
    if (!parsedData || !routineName.trim()) return;
    if (validationErrors.length > 0) {
      alert('Por favor corrige los errores antes de importar');
      return;
    }

    try {
      const routine = convertToRoutine(parsedData, routineName.trim());
      // El import reemplaza el plan existente (mismo nombre), no mergea ni duplica.
      upsertRoutine(routine);
      track('plan_imported', {
        exercises: parsedData.filter(row => row.Ejercicio.trim()).length,
        source: file ? 'file' : 'paste',
      });

      // Dar un pequeño delay para asegurar que localStorage se actualice
      setTimeout(() => {
        onImportSuccess();
      }, 100);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Error al importar la rutina');
    }
  };

  if (!parsedData) {
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

            <div className="space-y-2">
              <Label htmlFor="csv-paste">O pegar el CSV del Sheet como texto</Label>
              <textarea
                id="csv-paste"
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Día,Superserie,Ejercicio,Series,Reps,Tempo,Semana 1,Semana 2,Semana 3,Semana 4,Notas&#10;1,A1,Press banca,4,8,2010,80,82.5,85,87.5,"
                rows={5}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <Button variant="secondary" onClick={handlePasteImport} className="w-full">
                <ClipboardPaste className="mr-2 h-4 w-4" />
                Procesar texto pegado
              </Button>
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
            Vista Previa - {file ? file.name : sourceName}
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
                    <span className="font-medium text-destructive">Errores encontrados:</span>
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
                    {parsedData.filter(row => row.Ejercicio.trim()).length} ejercicios encontrados
                  </p>
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    <div className="p-3 space-y-2">
                      {parsedData.slice(0, 5).map((row, index) => (
                        <div key={index} className="text-sm border-b pb-2">
                          {row.Ejercicio && (
                            <div>
                              <strong>Día {row.Día}</strong> - {row.Superserie} - {row.Ejercicio}
                            </div>
                          )}
                        </div>
                      ))}
                      {parsedData.length > 5 && (
                        <p className="text-xs text-muted-foreground">... y {parsedData.length - 5} más</p>
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
            <Button
              variant="outline"
              onClick={() => {
                setParsedData(null);
                setValidationErrors([]);
                setFile(null);
              }}
              className="flex-1"
            >
              <X className="mr-2 h-4 w-4" />
              Volver
            </Button>
            <Button
              onClick={handleImport}
              className="flex-1"
              disabled={!routineName.trim() || validationErrors.length > 0}
            >
              <Check className="mr-2 h-4 w-4" />
              Importar (reemplaza el plan)
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
