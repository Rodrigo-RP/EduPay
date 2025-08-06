import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Search, Edit, Trash2, UserCheck, UserX, Phone, Mail, MapPin, AlertTriangle, FileSpreadsheet, Download, Upload, Eye, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function Estudiantes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrado, setSelectedGrado] = useState("all");
  const [selectedGrupo, setSelectedGrupo] = useState("all");
  const [gruposPersonalizados, setGruposPersonalizados] = useState(["A", "B", "C", "D", "E", "F", "G", "H"]);
  const [editandoGrupos, setEditandoGrupos] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState("");
  const [editandoGrupoIndex, setEditandoGrupoIndex] = useState<number | null>(null);
  const [nombreGrupoEditando, setNombreGrupoEditando] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [viewingStudent, setViewingStudent] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("individual");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Consulta real a la API para obtener estudiantes
  const { data: estudiantes = [], isLoading, error } = useQuery({
    queryKey: ['/api/admin/students/1'],
    queryFn: async () => {
      const response = await fetch('/api/admin/students/1');
      if (!response.ok) {
        throw new Error('Error al cargar estudiantes');
      }
      return response.json();
    }
  });

  const [formData, setFormData] = useState({
    nombres: "",
    primer_apellido: "",
    segundo_apellido: "",
    curp: "",
    fecha_nacimiento: "",
    grado: "",
    grupo: "",
    status: "activo",
    responsable_nombre: "",
    responsable_telefono: "",
    responsable_email: "",
    direccion: "",
    codigo_postal: "",
    ciudad: "",
    estado: "Ciudad de México",
    alergias: "",
    medicamentos: "",
    contacto_emergencia: "",
    telefono_emergencia: "",
    usuario: "",
    password: "",
    id_referencia: ""
  });

  // Mutación para crear estudiante
  const createStudentMutation = useMutation({
    mutationFn: async (studentData: any) => {
      return apiRequest('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify(studentData)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/students/1'] });
      toast({
        title: "Éxito",
        description: "Estudiante agregado correctamente"
      });
      setShowAddModal(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Error al agregar estudiante",
        variant: "destructive"
      });
    }
  });

  // Mutación para importar estudiantes
  const importStudentsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch('/api/admin/students/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error en la importación');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/students/1'] });
      toast({
        title: "Importación completada",
        description: `${data.successful} estudiantes importados exitosamente`
      });
      setImportFile(null);
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error en la importación",
        description: error.message,
        variant: "destructive"
      });
      setIsImporting(false);
    }
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Función para combinar nombres separados en nombre completo
  const combineNames = (nombres: string, primerApellido: string, segundoApellido: string) => {
    const parts = [nombres, primerApellido, segundoApellido].filter(part => part.trim());
    return parts.join(' ');
  };

  const resetForm = () => {
    setFormData({
      nombres: "",
      primer_apellido: "",
      segundo_apellido: "",
      curp: "",
      fecha_nacimiento: "",
      grado: "",
      grupo: "",
      status: "activo",
      responsable_nombre: "",
      responsable_telefono: "",
      responsable_email: "",
      direccion: "",
      codigo_postal: "",
      ciudad: "",
      estado: "Ciudad de México",
      alergias: "",
      medicamentos: "",
      contacto_emergencia: "",
      telefono_emergencia: "",
      usuario: "",
      password: "",
      id_referencia: ""
    });
  };

  const loadStudentForView = (student: any) => {
    setViewingStudent(student);
    setShowViewModal(true);
  };

  const loadStudentForEdit = (student: any) => {
    setEditingStudent(student);
    setFormData({
      nombres: student.nombre_completo.split(' ')[0] || "",
      primer_apellido: student.nombre_completo.split(' ')[1] || "",
      segundo_apellido: student.nombre_completo.split(' ').slice(2).join(' ') || "",
      curp: student.curp || "",
      fecha_nacimiento: "",
      grado: student.grado || "",
      grupo: student.grupo || "",
      status: student.status || "activo",
      responsable_nombre: student.responsable || "",
      responsable_telefono: student.telefono || "",
      responsable_email: "",
      direccion: "",
      codigo_postal: "",
      ciudad: "",
      estado: "Ciudad de México",
      alergias: "",
      medicamentos: "",
      contacto_emergencia: "",
      telefono_emergencia: "",
      usuario: "",
      password: "",
      id_referencia: ""
    });
    setShowEditModal(true);
  };

  // Funciones para exportar
  const handleExport = async (format: 'xlsx' | 'csv') => {
    try {
      const response = await apiRequest(`/api/admin/students/1/export?format=${format}`);
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estudiantes_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Exportación exitosa",
        description: `Archivo ${format.toUpperCase()} descargado correctamente`
      });
    } catch (error) {
      toast({
        title: "Error al exportar",
        description: "No se pudo exportar el archivo",
        variant: "destructive"
      });
    }
  };

  // Función para manejar la selección de archivo
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  // Función para iniciar importación
  const handleImport = () => {
    if (importFile) {
      setIsImporting(true);
      importStudentsMutation.mutate(importFile);
    }
  };

  // Función para descargar plantilla
  const downloadTemplate = () => {
    const templateData = [
      ['Nombre Completo', 'CURP', 'Grado', 'Grupo', 'Estatus'],
      ['Juan Pérez García', 'PEGJ120101HDFRRN09', '1° Primaria', 'A', 'activo'],
      ['María López Hernández', 'LOHM130202MDFPRR08', '2° Primaria', 'B', 'activo'],
      ['Carlos Martínez Ruiz', 'MARC140303HDFRRR07', 'Kinder 3', 'A', 'becado']
    ];
    
    const csvContent = templateData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_estudiantes.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast({
      title: "Plantilla descargada",
      description: "Usa esta plantilla como ejemplo para importar estudiantes"
    });
  };

  // Filtros para estudiantes
  const grados = [...new Set(estudiantes.map((e: any) => e.grado).filter(Boolean))];
  const grupos = [...new Set(estudiantes.map((e: any) => e.grupo).filter(Boolean))];

  const filteredEstudiantes = estudiantes.filter((estudiante: any) => {
    const matchSearch = !searchTerm || 
      estudiante.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estudiante.curp?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchGrado = selectedGrado === "all" || estudiante.grado === selectedGrado;
    const matchGrupo = selectedGrupo === "all" || estudiante.grupo === selectedGrupo;
    
    return matchSearch && matchGrado && matchGrupo;
  });

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error al cargar estudiantes</h2>
            <p className="text-muted-foreground">
              Hubo un problema al cargar la lista de estudiantes. Por favor, recarga la página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Lista de estudiantes ({isLoading ? '...' : estudiantes.length})
            </h1>
            <p className="text-sm text-gray-600">
              Gestiona la información de todos los estudiantes
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Agregar estudiante
          </Button>
          <Button 
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importar masivo
          </Button>
          <Button 
            variant="outline"
            onClick={() => handleExport('xlsx')}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button 
            variant="outline"
            onClick={() => handleExport('csv')}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button 
            variant="ghost"
            onClick={downloadTemplate}
            className="text-gray-600"
          >
            <Download className="h-4 w-4 mr-2" />
            Plantilla
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar por nombre o CURP..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={selectedGrado} onValueChange={setSelectedGrado}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por grado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los grados</SelectItem>
                {grados.map(grado => (
                  <SelectItem key={grado} value={grado}>{grado}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por grupo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los grupos</SelectItem>
                {grupos.map(grupo => (
                  <SelectItem key={grupo} value={grupo}>Grupo {grupo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de estudiantes */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Cargando estudiantes...</span>
        </div>
      ) : filteredEstudiantes.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {estudiantes.length === 0 ? 'No hay estudiantes registrados' : 'No se encontraron estudiantes'}
            </h3>
            <p className="text-gray-600 mb-4">
              {estudiantes.length === 0 
                ? 'Agrega el primer estudiante para comenzar.' 
                : 'Intenta ajustar los filtros de búsqueda.'}
            </p>
            {estudiantes.length === 0 && (
              <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Agregar primer estudiante
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredEstudiantes.map((estudiante: any) => (
            <Card key={estudiante.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-sm">
                        {estudiante.nombre_completo?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {estudiante.nombre_completo}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {estudiante.grado} {estudiante.grupo ? `• CURP: ${estudiante.curp}` : ''}
                      </p>
                      <p className="text-sm text-gray-500">
                        Responsable: {estudiante.responsable} • {estudiante.telefono}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold text-green-600">
                        ${((estudiante.saldo_pendiente || 0) / 100).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">Saldo pendiente</p>
                    </div>

                    <Badge 
                      variant={estudiante.status === 'activo' ? 'default' : 
                               estudiante.status === 'becado' ? 'secondary' : 'outline'}
                    >
                      {estudiante.status}
                    </Badge>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadStudentForView(estudiante)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadStudentForEdit(estudiante)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal para agregar estudiante */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar nuevo estudiante</DialogTitle>
            <DialogDescription>
              Completa la información del estudiante. Los campos marcados con * son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="nombres">Nombres *</Label>
                <Input
                  id="nombres"
                  value={formData.nombres}
                  onChange={(e) => handleInputChange('nombres', e.target.value)}
                  placeholder="Ej: Juan Carlos"
                />
              </div>
              <div>
                <Label htmlFor="primer_apellido">Primer Apellido *</Label>
                <Input
                  id="primer_apellido"
                  value={formData.primer_apellido}
                  onChange={(e) => handleInputChange('primer_apellido', e.target.value)}
                  placeholder="Ej: Pérez"
                />
              </div>
              <div>
                <Label htmlFor="segundo_apellido">Segundo Apellido</Label>
                <Input
                  id="segundo_apellido"
                  value={formData.segundo_apellido}
                  onChange={(e) => handleInputChange('segundo_apellido', e.target.value)}
                  placeholder="Ej: García"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="curp">CURP *</Label>
                <Input
                  id="curp"
                  value={formData.curp}
                  onChange={(e) => handleInputChange('curp', e.target.value.toUpperCase())}
                  placeholder="Ej: PEGJ850101HDFRRN09"
                  maxLength={18}
                />
              </div>
              <div>
                <Label htmlFor="fecha_nacimiento">Fecha de Nacimiento *</Label>
                <Input
                  id="fecha_nacimiento"
                  type="date"
                  value={formData.fecha_nacimiento}
                  onChange={(e) => handleInputChange('fecha_nacimiento', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="grado">Grado *</Label>
                <Select value={formData.grado} onValueChange={(value) => handleInputChange('grado', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar grado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kinder 1">Kinder 1</SelectItem>
                    <SelectItem value="Kinder 2">Kinder 2</SelectItem>
                    <SelectItem value="Kinder 3">Kinder 3</SelectItem>
                    <SelectItem value="1° Primaria">1° Primaria</SelectItem>
                    <SelectItem value="2° Primaria">2° Primaria</SelectItem>
                    <SelectItem value="3° Primaria">3° Primaria</SelectItem>
                    <SelectItem value="4° Primaria">4° Primaria</SelectItem>
                    <SelectItem value="5° Primaria">5° Primaria</SelectItem>
                    <SelectItem value="6° Primaria">6° Primaria</SelectItem>
                    <SelectItem value="1° Secundaria">1° Secundaria</SelectItem>
                    <SelectItem value="2° Secundaria">2° Secundaria</SelectItem>
                    <SelectItem value="3° Secundaria">3° Secundaria</SelectItem>
                    <SelectItem value="1° Preparatoria">1° Preparatoria</SelectItem>
                    <SelectItem value="2° Preparatoria">2° Preparatoria</SelectItem>
                    <SelectItem value="3° Preparatoria">3° Preparatoria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="grupo">Grupo *</Label>
                <Select value={formData.grupo} onValueChange={(value) => handleInputChange('grupo', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {gruposPersonalizados.map(grupo => (
                      <SelectItem key={grupo} value={grupo}>{grupo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Información del Responsable</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="responsable_nombre">Nombre del Responsable *</Label>
                  <Input
                    id="responsable_nombre"
                    value={formData.responsable_nombre}
                    onChange={(e) => handleInputChange('responsable_nombre', e.target.value)}
                    placeholder="Ej: María Pérez García"
                  />
                </div>
                <div>
                  <Label htmlFor="responsable_telefono">Teléfono *</Label>
                  <Input
                    id="responsable_telefono"
                    value={formData.responsable_telefono}
                    onChange={(e) => handleInputChange('responsable_telefono', e.target.value)}
                    placeholder="Ej: 5551234567"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                const studentData = {
                  ...formData,
                  nombre_completo: combineNames(formData.nombres, formData.primer_apellido, formData.segundo_apellido)
                };
                createStudentMutation.mutate(studentData);
              }}
              disabled={createStudentMutation.isPending}
            >
              {createStudentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Agregar estudiante'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Input oculto para selección de archivos */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Modal de confirmación de importación */}
      {importFile && (
        <Dialog open={!!importFile} onOpenChange={() => {setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = '';}}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar importación</DialogTitle>
              <DialogDescription>
                ¿Deseas importar el archivo "{importFile.name}"?
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Formato esperado:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <strong>Nombre Completo</strong> (requerido)</li>
                  <li>• <strong>CURP</strong> (opcional, debe tener 18 caracteres)</li>
                  <li>• <strong>Grado</strong> (opcional)</li>
                  <li>• <strong>Grupo</strong> (opcional)</li>
                  <li>• <strong>Estatus</strong> (opcional, por defecto: activo)</li>
                </ul>
              </div>
              
              {isImporting && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Procesando archivo...</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => {
                  setImportFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isImporting}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleImport}
                disabled={isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  'Confirmar importación'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}