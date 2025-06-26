import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  Users, 
  DollarSign, 
  GraduationCap,
  CheckCircle,
  AlertTriangle,
  FileText,
  Database,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: any;
  templates: Template[];
  priority: number;
}

interface Template {
  id: string;
  name: string;
  description: string;
  columns: string[];
  sampleData: any[];
  validations: string[];
  status: 'pending' | 'completed' | 'error';
}

export default function ImportacionDatos() {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Categorías de templates organizadas por prioridad
  const templateCategories: TemplateCategory[] = [
    {
      id: "estudiantes",
      name: "Estudiantes y Familias",
      description: "Información básica de estudiantes, tutores y relaciones familiares",
      icon: Users,
      priority: 1,
      templates: [
        {
          id: "estudiantes",
          name: "Registro de Estudiantes",
          description: "Datos completos de estudiantes activos",
          columns: [
            "nombre_completo", "curp", "fecha_nacimiento", "grado", "grupo", 
            "nivel_academico", "status", "fecha_ingreso", "observaciones"
          ],
          sampleData: [
            {
              nombre_completo: "María González López",
              curp: "GOLM051215MDFNPR03",
              fecha_nacimiento: "2005-12-15",
              grado: "3ro Secundaria",
              grupo: "A",
              nivel_academico: "SECUNDARIA",
              status: "Activo",
              fecha_ingreso: "2023-08-15",
              observaciones: "Estudiante regular"
            }
          ],
          validations: ["CURP válido", "Fecha formato YYYY-MM-DD", "Grado existente", "Status válido"],
          status: 'pending'
        },
        {
          id: "tutores",
          name: "Tutores y Responsables",
          description: "Información de contacto de padres y tutores",
          columns: [
            "nombre_completo", "email", "telefono", "telefono_emergencia", 
            "relacion", "direccion", "ocupacion", "empresa"
          ],
          sampleData: [
            {
              nombre_completo: "Roberto González Martínez",
              email: "roberto@email.com",
              telefono: "5551234567",
              telefono_emergencia: "5559876543",
              relacion: "Padre",
              direccion: "Av. Principal 123, Col. Centro",
              ocupacion: "Ingeniero",
              empresa: "Tech Solutions SA"
            }
          ],
          validations: ["Email válido", "Teléfono 10 dígitos", "Relación válida"],
          status: 'pending'
        },
        {
          id: "relaciones",
          name: "Relaciones Estudiante-Tutor",
          description: "Vinculación entre estudiantes y sus responsables",
          columns: [
            "curp_estudiante", "email_tutor", "tipo_relacion", "es_responsable_pago", 
            "autorizacion_recoger", "contacto_emergencia"
          ],
          sampleData: [
            {
              curp_estudiante: "GOLM051215MDFNPR03",
              email_tutor: "roberto@email.com",
              tipo_relacion: "Padre",
              es_responsable_pago: "Sí",
              autorizacion_recoger: "Sí",
              contacto_emergencia: "No"
            }
          ],
          validations: ["CURP existe", "Email tutor existe", "Booleanos válidos"],
          status: 'pending'
        }
      ]
    },
    {
      id: "financiero",
      name: "Conceptos y Precios",
      description: "Catálogo de conceptos de pago, precios y calendario de vencimientos",
      icon: DollarSign,
      priority: 2,
      templates: [
        {
          id: "conceptos",
          name: "Catálogo de Conceptos",
          description: "Conceptos de pago con precios diferenciados por nivel",
          columns: [
            "nombre", "categoria", "descripcion", "precio_kinder", "precio_primaria", 
            "precio_secundaria", "precio_bachillerato", "tipo_cargo", "periodicidad"
          ],
          sampleData: [
            {
              nombre: "Colegiatura Mensual",
              categoria: "Colegiatura",
              descripcion: "Pago mensual de colegiatura",
              precio_kinder: "2500.00",
              precio_primaria: "3000.00",
              precio_secundaria: "3500.00",
              precio_bachillerato: "4000.00",
              tipo_cargo: "Recurrente",
              periodicidad: "Mensual"
            }
          ],
          validations: ["Precios numéricos", "Categoría válida", "Periodicidad válida"],
          status: 'pending'
        },
        {
          id: "calendario",
          name: "Calendario de Vencimientos",
          description: "Fechas de aplicación y vencimiento de cargos",
          columns: [
            "concepto", "mes", "fecha_aplicacion", "fecha_vencimiento", 
            "recargo_porcentaje", "dias_gracia", "activo"
          ],
          sampleData: [
            {
              concepto: "Colegiatura Mensual",
              mes: "Septiembre 2024",
              fecha_aplicacion: "2024-08-25",
              fecha_vencimiento: "2024-09-05",
              recargo_porcentaje: "5.0",
              dias_gracia: "5",
              activo: "Sí"
            }
          ],
          validations: ["Fechas válidas", "Porcentajes numéricos", "Concepto existe"],
          status: 'pending'
        },
        {
          id: "cargos_extraordinarios",
          name: "Cargos Extraordinarios",
          description: "Cargos especiales no recurrentes",
          columns: [
            "estudiante_curp", "concepto", "monto", "fecha_aplicacion", 
            "descripcion", "autorizado_por", "fecha_vencimiento"
          ],
          sampleData: [
            {
              estudiante_curp: "GOLM051215MDFNPR03",
              concepto: "Examen Extraordinario Matemáticas",
              monto: "500.00",
              fecha_aplicacion: "2024-09-15",
              descripcion: "Examen extraordinario primer parcial",
              autorizado_por: "Coordinación Académica",
              fecha_vencimiento: "2024-09-20"
            }
          ],
          validations: ["CURP existe", "Monto numérico", "Fechas válidas"],
          status: 'pending'
        }
      ]
    },
    {
      id: "becas",
      name: "Becas y Descuentos",
      description: "Programas de becas, descuentos y beneficios estudiantiles",
      icon: GraduationCap,
      priority: 3,
      templates: [
        {
          id: "tipos_becas",
          name: "Tipos de Becas",
          description: "Configuración de programas de becas disponibles",
          columns: [
            "nombre", "categoria", "tipo_descuento", "porcentaje_max", "monto_fijo", 
            "criterios", "vigencia_inicio", "vigencia_fin", "activa"
          ],
          sampleData: [
            {
              nombre: "Beca Excelencia Académica",
              categoria: "academica",
              tipo_descuento: "porcentaje",
              porcentaje_max: "50",
              monto_fijo: "",
              criterios: "Promedio mayor a 9.0",
              vigencia_inicio: "2024-08-01",
              vigencia_fin: "2025-07-31",
              activa: "Sí"
            }
          ],
          validations: ["Tipo descuento válido", "Fechas válidas", "Porcentajes numéricos"],
          status: 'pending'
        },
        {
          id: "asignaciones_becas",
          name: "Asignaciones de Becas",
          description: "Becas asignadas a estudiantes específicos",
          columns: [
            "estudiante_curp", "tipo_beca", "porcentaje_asignado", "monto_fijo_asignado", 
            "fecha_inicio", "fecha_fin", "autorizado_por", "observaciones", "activa"
          ],
          sampleData: [
            {
              estudiante_curp: "GOLM051215MDFNPR03",
              tipo_beca: "Beca Excelencia Académica",
              porcentaje_asignado: "30",
              monto_fijo_asignado: "",
              fecha_inicio: "2024-09-01",
              fecha_fin: "2025-07-31",
              autorizado_por: "Dirección Académica",
              observaciones: "Promedio 9.2 primer parcial",
              activa: "Sí"
            }
          ],
          validations: ["CURP existe", "Tipo beca existe", "Fechas válidas"],
          status: 'pending'
        },
        {
          id: "descuentos_hermanos",
          name: "Descuentos por Hermanos",
          description: "Configuración automática de descuentos familiares",
          columns: [
            "numero_hermanos", "porcentaje_descuento", "aplica_a", "maximo_beneficiarios", 
            "vigencia", "activo"
          ],
          sampleData: [
            {
              numero_hermanos: "2",
              porcentaje_descuento: "20",
              aplica_a: "Segundo hermano",
              maximo_beneficiarios: "1",
              vigencia: "2024-2025",
              activo: "Sí"
            }
          ],
          validations: ["Números enteros", "Porcentajes válidos", "Aplica_a válido"],
          status: 'pending'
        }
      ]
    }
  ];

  // Función para descargar template Excel
  const downloadTemplate = (categoryId: string, templateId: string) => {
    const category = templateCategories.find(c => c.id === categoryId);
    const template = category?.templates.find(t => t.id === templateId);
    
    if (!template) return;

    // Crear contenido CSV para el template
    const csvContent = [
      template.columns.join(','),
      ...template.sampleData.map(row => 
        template.columns.map(col => row[col] || '').join(',')
      )
    ].join('\n');

    // Crear y descargar archivo
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `template_${template.name.toLowerCase().replace(/\s+/g, '_')}.csv`;
    link.click();

    toast({
      title: "Template Descargado",
      description: `Template "${template.name}" descargado exitosamente`,
    });
  };

  // Función para manejar subida de archivo
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    
    // Simular lectura del archivo y previsualización
    setTimeout(() => {
      setPreviewData([
        { nombre_completo: "Ana Pérez", curp: "PERA990101HDFRNN01", grado: "2do Primaria", status: "✓ Válido" },
        { nombre_completo: "Luis García", curp: "GARL880505HDFRGN02", grado: "5to Primaria", status: "✓ Válido" },
        { nombre_completo: "Carmen López", curp: "LOCR770303MDFPRM03", grado: "1ro Secundaria", status: "⚠ CURP a verificar" }
      ]);
      setShowPreview(true);
    }, 1000);
  };

  // Función para procesar importación
  const processImport = async () => {
    setIsImporting(true);
    setImportProgress(0);

    // Simular proceso de importación
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setImportProgress(i);
    }

    setIsImporting(false);
    toast({
      title: "Importación Completada",
      description: `Se importaron ${previewData.length} registros exitosamente`,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Importación de Datos</h1>
          <p className="text-muted-foreground">
            Templates Excel categorizados para migración eficiente de datos escolares
          </p>
        </div>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar Status
        </Button>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Resumen de Migración
          </CardTitle>
          <CardDescription>
            Estado actual de la importación de datos por categoría
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {templateCategories.map((category) => {
              const completed = category.templates.filter(t => t.status === 'completed').length;
              const total = category.templates.length;
              const percentage = (completed / total) * 100;
              
              return (
                <div key={category.id} className="text-center">
                  <category.icon className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <h3 className="font-semibold">{category.name}</h3>
                  <Progress value={percentage} className="mt-2" />
                  <p className="text-sm text-muted-foreground mt-1">
                    {completed}/{total} completados
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Templates por Categoría */}
      <Tabs defaultValue="estudiantes" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          {templateCategories.map((category) => (
            <TabsTrigger key={category.id} value={category.id} className="flex items-center gap-2">
              <category.icon className="h-4 w-4" />
              {category.name}
              <Badge variant="secondary">{category.priority}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {templateCategories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Prioridad {category.priority}:</strong> {category.description}
              </AlertDescription>
            </Alert>

            <div className="grid gap-4">
              {category.templates.map((template) => (
                <Card key={template.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <FileSpreadsheet className="h-5 w-5" />
                          {template.name}
                          {template.status === 'completed' && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => downloadTemplate(category.id, template.id)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Descargar Template
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <Upload className="h-4 w-4 mr-1" />
                              Importar Datos
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Importar: {template.name}</DialogTitle>
                              <DialogDescription>
                                Sube tu archivo Excel/CSV con los datos de {template.name.toLowerCase()}
                              </DialogDescription>
                            </DialogHeader>
                            
                            <div className="space-y-4">
                              {/* Upload Area */}
                              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8">
                                <div className="text-center">
                                  <Upload className="h-12 w-12 mx-auto text-muted-foreground/50" />
                                  <div className="mt-4">
                                    <Label htmlFor="file-upload" className="cursor-pointer">
                                      <span className="text-sm font-medium">
                                        Hacer clic para subir archivo
                                      </span>
                                      <Input
                                        id="file-upload"
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                      />
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                      Excel (.xlsx) o CSV (.csv) hasta 10MB
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* File Info */}
                              {selectedFile && (
                                <Card>
                                  <CardContent className="pt-4">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4" />
                                        <span className="text-sm font-medium">{selectedFile.name}</span>
                                        <Badge variant="secondary">
                                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                        </Badge>
                                      </div>
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => setSelectedFile(null)}
                                      >
                                        Remover
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Preview Data */}
                              {showPreview && (
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="text-sm">Vista Previa de Datos</CardTitle>
                                    <CardDescription>
                                      Primeros 3 registros detectados en el archivo
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="border-b">
                                            {template.columns.slice(0, 4).map(col => (
                                              <th key={col} className="text-left p-2">{col}</th>
                                            ))}
                                            <th className="text-left p-2">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {previewData.map((row, idx) => (
                                            <tr key={idx} className="border-b">
                                              {template.columns.slice(0, 4).map(col => (
                                                <td key={col} className="p-2">{row[col] || '-'}</td>
                                              ))}
                                              <td className="p-2">{row.status}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Import Progress */}
                              {isImporting && (
                                <Card>
                                  <CardContent className="pt-4">
                                    <div className="space-y-2">
                                      <div className="flex justify-between text-sm">
                                        <span>Procesando datos...</span>
                                        <span>{importProgress}%</span>
                                      </div>
                                      <Progress value={importProgress} />
                                    </div>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Actions */}
                              <div className="flex justify-end gap-2">
                                <Button variant="outline">Cancelar</Button>
                                <Button 
                                  onClick={processImport}
                                  disabled={!selectedFile || isImporting}
                                >
                                  {isImporting ? 'Procesando...' : 'Confirmar Importación'}
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium text-sm mb-2">Columnas del Template:</h4>
                        <div className="flex flex-wrap gap-1">
                          {template.columns.map((col) => (
                            <Badge key={col} variant="outline" className="text-xs">
                              {col}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium text-sm mb-2">Validaciones:</h4>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          {template.validations.map((validation, idx) => (
                            <li key={idx} className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {validation}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}