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

  // Formulario adaptado a estructura Excel "Concentrado_Estudiante y Padre" + credenciales individuales
  const [formData, setFormData] = useState({
    // PADRE DE FAMILIA (columnas 1-7 Excel) + credenciales
    padre_id_referencia: "",
    padre_username: "",
    padre_password: "",
    padre_correo_institucional_familiar: "",
    padre_nombres: "",
    padre_apellido_paterno: "",
    padre_apellido_materno: "",
    padre_curp: "",
    padre_celular: "",
    padre_telefono_casa_oficina: "",
    
    // MADRE DE FAMILIA + credenciales
    madre_id_referencia: "",
    madre_username: "",
    madre_password: "",
    madre_correo_institucional_familiar: "",
    madre_nombres: "",
    madre_apellido_paterno: "",
    madre_apellido_materno: "",
    madre_curp: "",
    madre_celular: "",
    madre_telefono_casa_oficina: "",
    
    // ESTUDIANTE (columnas 8-20 Excel) + credenciales
    estudiante_id_referencia: "",
    estudiante_username: "",
    estudiante_password: "",
    estudiante_nombres: "",
    estudiante_apellido_paterno: "",
    estudiante_apellido_materno: "",
    estudiante_curp: "",
    estudiante_fecha_nacimiento: "",
    estudiante_tipo_sangre: "",
    estudiante_correo_institucional: "",
    estudiante_nivel_escolar: "",
    estudiante_clave_centro_trabajo: "",
    estudiante_grado: "",
    estudiante_grupo: "",
    estudiante_turno: "",
    
    status: "activo"
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
      // PADRE DE FAMILIA + credenciales
      padre_id_referencia: "",
      padre_username: "",
      padre_password: "",
      padre_correo_institucional_familiar: "",
      padre_nombres: "",
      padre_apellido_paterno: "",
      padre_apellido_materno: "",
      padre_curp: "",
      padre_celular: "",
      padre_telefono_casa_oficina: "",
      
      // MADRE DE FAMILIA + credenciales
      madre_id_referencia: "",
      madre_username: "",
      madre_password: "",
      madre_correo_institucional_familiar: "",
      madre_nombres: "",
      madre_apellido_paterno: "",
      madre_apellido_materno: "",
      madre_curp: "",
      madre_celular: "",
      madre_telefono_casa_oficina: "",
      
      // ESTUDIANTE + credenciales
      estudiante_id_referencia: "",
      estudiante_username: "",
      estudiante_password: "",
      estudiante_nombres: "",
      estudiante_apellido_paterno: "",
      estudiante_apellido_materno: "",
      estudiante_curp: "",
      estudiante_fecha_nacimiento: "",
      estudiante_tipo_sangre: "",
      estudiante_correo_institucional: "",
      estudiante_nivel_escolar: "",
      estudiante_clave_centro_trabajo: "",
      estudiante_grado: "",
      estudiante_grupo: "",
      estudiante_turno: "",
      
      status: "activo"
    });
  };

  const loadStudentForView = (student: any) => {
    setViewingStudent(student);
    setShowViewModal(true);
  };

  const loadStudentForEdit = (student: any) => {
    setEditingStudent(student);
    setFormData({
      // PADRE DE FAMILIA + credenciales
      padre_id_referencia: "",
      padre_username: "",
      padre_password: "", // No cargar contraseñas por seguridad
      padre_correo_institucional_familiar: "",
      padre_nombres: "",
      padre_apellido_paterno: "",
      padre_apellido_materno: "",
      padre_curp: "",
      padre_celular: "",
      padre_telefono_casa_oficina: "",
      
      // MADRE DE FAMILIA + credenciales
      madre_id_referencia: "",
      madre_username: "",
      madre_password: "", // No cargar contraseñas por seguridad
      madre_correo_institucional_familiar: "",
      madre_nombres: "",
      madre_apellido_paterno: "",
      madre_apellido_materno: "",
      madre_curp: "",
      madre_celular: "",
      madre_telefono_casa_oficina: "",
      
      // ESTUDIANTE + credenciales - datos del estudiante existente
      estudiante_id_referencia: student.id_referencia || "",
      estudiante_username: student.username || "",
      estudiante_password: "", // No cargar contraseña por seguridad
      estudiante_nombres: student.nombres || "",
      estudiante_apellido_paterno: student.apellido_paterno || "",
      estudiante_apellido_materno: student.apellido_materno || "",
      estudiante_curp: student.curp || "",
      estudiante_fecha_nacimiento: student.fecha_nacimiento || "",
      estudiante_tipo_sangre: student.tipo_sangre || "",
      estudiante_correo_institucional: student.correo_institucional || "",
      estudiante_nivel_escolar: student.nivel_escolar || "",
      estudiante_clave_centro_trabajo: student.clave_centro_trabajo || "",
      estudiante_grado: student.grado || "",
      estudiante_grupo: student.grupo || "",
      estudiante_turno: student.turno || "",
      
      status: student.status || "activo"
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

  // Función para descargar plantilla - estructura con credenciales individuales por usuario
  const downloadTemplate = () => {
    const templateData = [
      // Encabezados principales
      ['PADRE DE FAMILIA', '', '', '', '', '', '', '', '', '', 'MADRE DE FAMILIA', '', '', '', '', '', '', '', '', '', 'ESTUDIANTE', '', '', '', '', '', '', '', '', '', '', '', ''],
      // Campos específicos
      [
        'ID Reference Padre',
        'Usuario padre',
        'Contraseña padre',
        'Correo institucional familiar',
        'Nombre(s)',
        'Apellido paterno', 
        'Apellido Materno',
        'CURP',
        'Celular',
        'Telefono casa/oficina',
        'ID Reference Madre',
        'Usuario madre',
        'Contraseña madre',
        'Correo institucional familiar',
        'Nombre(s)',
        'Apellido paterno', 
        'Apellido Materno',
        'CURP',
        'Celular',
        'Telefono casa/oficina',
        'ID Reference Estudiante',
        'Usuario estudiante',
        'Contraseña estudiante',
        'Nombre(s)',
        'Apellido paterno',
        'Apellido Materno', 
        'CURP',
        'Fecha de nacimiento (DD/MM/YYYY)',
        'Tipo de Sangre',
        'Correo institucional',
        'Nivel escolar',
        'Clave del centro de Trabajo',
        'Grado',
        'Grupo',
        'Turno'
      ],
      // Ejemplo 1
      [
        'padre.juan@institutojfr.edu.mx',
        'Juan Carlos',
        'Pérez',
        'García',
        'PEGJ800515HDFRRN09',
        '5551234567',
        '5587654321',
        'María Fernanda',
        'Pérez',
        'López',
        'PELM120101MDFRRR08',
        '01/01/2012',
        'O+',
        'maria.perez@institutojfr.edu.mx',
        'Primaria',
        '09DPR0001X',
        '6°',
        'A',
        'Matutino',
        'Primaria'
      ],
      // Ejemplo 2
      [
        'responsable.ana@institutojfr.edu.mx',
        'Ana Cristina',
        'Martínez',
        'Hernández',
        'MAHA750820MDFRRR05',
        '5559876543',
        '5512345678',
        'Diego Alejandro',
        'Martínez',
        'Silva',
        'MASD130505HDFRRR01',
        '05/05/2013',
        'A-',
        'diego.martinez@institutojfr.edu.mx',
        'Primaria',
        '09DPR0001X',
        '5°',
        'B',
        'Matutino',
        'Primaria'
      ]
    ];
    
    const csvContent = templateData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_concentrado_estudiante_padre.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast({
      title: "Plantilla descargada",
      description: "Plantilla con estructura Excel: Concentrado Estudiante y Padre"
    });
  };

  // Filtros para estudiantes
  const grados = Array.from(new Set(estudiantes.map((e: any) => e.grado).filter(Boolean))) as string[];
  const grupos = Array.from(new Set(estudiantes.map((e: any) => e.grupo).filter(Boolean))) as string[];

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
                {grados.map((grado) => (
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
                {grupos.map((grupo) => (
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

          <div className="space-y-6">
            {/* SECCIÓN: PADRE DE FAMILIA (Columnas 1-7 Excel) */}
            <div className="bg-blue-50 p-4 rounded-lg space-y-4">
              <h3 className="font-semibold text-blue-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                PADRE DE FAMILIA
              </h3>
              
              <div className="space-y-4">
                {/* Credenciales del Padre */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-blue-100 rounded">
                  <div>
                    <Label htmlFor="padre_id_referencia">ID de Reference Padre *</Label>
                    <Input
                      id="padre_id_referencia"
                      value={formData.padre_id_referencia}
                      onChange={(e) => handleInputChange('padre_id_referencia', e.target.value)}
                      placeholder="Ej: PAD-2024-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_username">Usuario del padre *</Label>
                    <Input
                      id="padre_username"
                      value={formData.padre_username}
                      onChange={(e) => handleInputChange('padre_username', e.target.value)}
                      placeholder="Ej: juan.perez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_password">Contraseña del padre *</Label>
                    <Input
                      id="padre_password"
                      type="password"
                      value={formData.padre_password}
                      onChange={(e) => handleInputChange('padre_password', e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="padre_correo_institucional_familiar">Correo institucional familiar *</Label>
                  <Input
                    id="padre_correo_institucional_familiar"
                    type="email"
                    value={formData.padre_correo_institucional_familiar}
                    onChange={(e) => handleInputChange('padre_correo_institucional_familiar', e.target.value)}
                    placeholder="Ej: padre.juan@institutojfr.edu.mx"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="padre_nombres">Nombre(s) *</Label>
                    <Input
                      id="padre_nombres"
                      value={formData.padre_nombres}
                      onChange={(e) => handleInputChange('padre_nombres', e.target.value)}
                      placeholder="Ej: Juan Carlos"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_apellido_paterno">Apellido paterno *</Label>
                    <Input
                      id="padre_apellido_paterno"
                      value={formData.padre_apellido_paterno}
                      onChange={(e) => handleInputChange('padre_apellido_paterno', e.target.value)}
                      placeholder="Ej: Pérez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_apellido_materno">Apellido Materno</Label>
                    <Input
                      id="padre_apellido_materno"
                      value={formData.padre_apellido_materno}
                      onChange={(e) => handleInputChange('padre_apellido_materno', e.target.value)}
                      placeholder="Ej: García"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="padre_curp">CURP del Padre</Label>
                    <Input
                      id="padre_curp"
                      value={formData.padre_curp}
                      onChange={(e) => handleInputChange('padre_curp', e.target.value.toUpperCase())}
                      placeholder="Ej: PEGJ800515HDFRRN09"
                      maxLength={18}
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_celular">Celular *</Label>
                    <Input
                      id="padre_celular"
                      value={formData.padre_celular}
                      onChange={(e) => handleInputChange('padre_celular', e.target.value)}
                      placeholder="Ej: 5551234567"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_telefono_casa_oficina">Teléfono casa/oficina</Label>
                    <Input
                      id="padre_telefono_casa_oficina"
                      value={formData.padre_telefono_casa_oficina}
                      onChange={(e) => handleInputChange('padre_telefono_casa_oficina', e.target.value)}
                      placeholder="Ej: 5587654321"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* SECCIÓN: MADRE DE FAMILIA */}
            <div className="bg-pink-50 p-4 rounded-lg space-y-4">
              <h3 className="font-semibold text-pink-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-pink-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                MADRE DE FAMILIA
              </h3>
              
              <div className="space-y-4">
                {/* Credenciales de la Madre */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-pink-100 rounded">
                  <div>
                    <Label htmlFor="madre_id_referencia">ID de Reference Madre *</Label>
                    <Input
                      id="madre_id_referencia"
                      value={formData.madre_id_referencia}
                      onChange={(e) => handleInputChange('madre_id_referencia', e.target.value)}
                      placeholder="Ej: MAD-2024-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="madre_username">Usuario de la madre *</Label>
                    <Input
                      id="madre_username"
                      value={formData.madre_username}
                      onChange={(e) => handleInputChange('madre_username', e.target.value)}
                      placeholder="Ej: ana.martinez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="madre_password">Contraseña de la madre *</Label>
                    <Input
                      id="madre_password"
                      type="password"
                      value={formData.madre_password}
                      onChange={(e) => handleInputChange('madre_password', e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="madre_correo_institucional_familiar">Correo institucional familiar</Label>
                  <Input
                    id="madre_correo_institucional_familiar"
                    type="email"
                    value={formData.madre_correo_institucional_familiar}
                    onChange={(e) => handleInputChange('madre_correo_institucional_familiar', e.target.value)}
                    placeholder="Ej: madre.ana@institutojfr.edu.mx"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="madre_nombres">Nombre(s)</Label>
                    <Input
                      id="madre_nombres"
                      value={formData.madre_nombres}
                      onChange={(e) => handleInputChange('madre_nombres', e.target.value)}
                      placeholder="Ej: Ana Cristina"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="madre_apellido_paterno">Apellido paterno</Label>
                    <Input
                      id="madre_apellido_paterno"
                      value={formData.madre_apellido_paterno}
                      onChange={(e) => handleInputChange('madre_apellido_paterno', e.target.value)}
                      placeholder="Ej: Martínez"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="madre_apellido_materno">Apellido Materno</Label>
                    <Input
                      id="madre_apellido_materno"
                      value={formData.madre_apellido_materno}
                      onChange={(e) => handleInputChange('madre_apellido_materno', e.target.value)}
                      placeholder="Ej: Hernández"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="madre_curp">CURP de la Madre</Label>
                    <Input
                      id="madre_curp"
                      value={formData.madre_curp}
                      onChange={(e) => handleInputChange('madre_curp', e.target.value.toUpperCase())}
                      placeholder="Ej: MAHA750820MDFRRR05"
                      maxLength={18}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="madre_celular">Celular</Label>
                    <Input
                      id="madre_celular"
                      value={formData.madre_celular}
                      onChange={(e) => handleInputChange('madre_celular', e.target.value)}
                      placeholder="Ej: 5559876543"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="madre_telefono_casa_oficina">Teléfono casa/oficina</Label>
                    <Input
                      id="madre_telefono_casa_oficina"
                      value={formData.madre_telefono_casa_oficina}
                      onChange={(e) => handleInputChange('madre_telefono_casa_oficina', e.target.value)}
                      placeholder="Ej: 5512345678"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECCIÓN: ESTUDIANTE (Columnas 8-20 Excel) */}
            <div className="bg-green-50 p-4 rounded-lg space-y-4">
              <h3 className="font-semibold text-green-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                ESTUDIANTE
              </h3>
              
              <div className="space-y-4">
                {/* Credenciales del Estudiante */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-green-100 rounded">
                  <div>
                    <Label htmlFor="estudiante_id_referencia">ID de Reference Estudiante *</Label>
                    <Input
                      id="estudiante_id_referencia"
                      value={formData.estudiante_id_referencia}
                      onChange={(e) => handleInputChange('estudiante_id_referencia', e.target.value)}
                      placeholder="Ej: EST-2024-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_username">Usuario del estudiante *</Label>
                    <Input
                      id="estudiante_username"
                      value={formData.estudiante_username}
                      onChange={(e) => handleInputChange('estudiante_username', e.target.value)}
                      placeholder="Ej: maria.perez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_password">Contraseña del estudiante *</Label>
                    <Input
                      id="estudiante_password"
                      type="password"
                      value={formData.estudiante_password}
                      onChange={(e) => handleInputChange('estudiante_password', e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="estudiante_nombres">Nombre(s) *</Label>
                    <Input
                      id="estudiante_nombres"
                      value={formData.estudiante_nombres}
                      onChange={(e) => handleInputChange('estudiante_nombres', e.target.value)}
                      placeholder="Ej: María Fernanda"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_apellido_paterno">Apellido paterno *</Label>
                    <Input
                      id="estudiante_apellido_paterno"
                      value={formData.estudiante_apellido_paterno}
                      onChange={(e) => handleInputChange('estudiante_apellido_paterno', e.target.value)}
                      placeholder="Ej: Pérez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_apellido_materno">Apellido Materno</Label>
                    <Input
                      id="estudiante_apellido_materno"
                      value={formData.estudiante_apellido_materno}
                      onChange={(e) => handleInputChange('estudiante_apellido_materno', e.target.value)}
                      placeholder="Ej: López"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="estudiante_curp">CURP *</Label>
                    <Input
                      id="estudiante_curp"
                      value={formData.estudiante_curp}
                      onChange={(e) => handleInputChange('estudiante_curp', e.target.value.toUpperCase())}
                      placeholder="Ej: PELM120101MDFRRR08"
                      maxLength={18}
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_fecha_nacimiento">Fecha de nacimiento (DD/MM/YYYY) *</Label>
                    <Input
                      id="estudiante_fecha_nacimiento"
                      type="date"
                      value={formData.estudiante_fecha_nacimiento}
                      onChange={(e) => handleInputChange('estudiante_fecha_nacimiento', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_tipo_sangre">Tipo de Sangre</Label>
                    <Select value={formData.estudiante_tipo_sangre} onValueChange={(value) => handleInputChange('estudiante_tipo_sangre', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="O+">O+</SelectItem>
                        <SelectItem value="O-">O-</SelectItem>
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estudiante_correo_institucional">Correo institucional</Label>
                    <Input
                      id="estudiante_correo_institucional"
                      type="email"
                      value={formData.estudiante_correo_institucional}
                      onChange={(e) => handleInputChange('estudiante_correo_institucional', e.target.value)}
                      placeholder="Ej: maria.perez@institutojfr.edu.mx"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_nivel_escolar">Nivel escolar *</Label>
                    <Select value={formData.estudiante_nivel_escolar} onValueChange={(value) => handleInputChange('estudiante_nivel_escolar', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar nivel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kinder">Kinder</SelectItem>
                        <SelectItem value="Primaria">Primaria</SelectItem>
                        <SelectItem value="Secundaria">Secundaria</SelectItem>
                        <SelectItem value="Preparatoria">Preparatoria</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estudiante_clave_centro_trabajo">Clave del centro de Trabajo</Label>
                    <Input
                      id="estudiante_clave_centro_trabajo"
                      value={formData.estudiante_clave_centro_trabajo}
                      onChange={(e) => handleInputChange('estudiante_clave_centro_trabajo', e.target.value)}
                      placeholder="Ej: 09DPR0001X"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_turno">Turno</Label>
                    <Select value={formData.estudiante_turno} onValueChange={(value) => handleInputChange('estudiante_turno', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar turno" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Matutino">Matutino</SelectItem>
                        <SelectItem value="Vespertino">Vespertino</SelectItem>
                        <SelectItem value="Tiempo Completo">Tiempo Completo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estudiante_grado">Grado *</Label>
                    <Select value={formData.estudiante_grado} onValueChange={(value) => handleInputChange('estudiante_grado', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar grado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1°">1°</SelectItem>
                        <SelectItem value="2°">2°</SelectItem>
                        <SelectItem value="3°">3°</SelectItem>
                        <SelectItem value="4°">4°</SelectItem>
                        <SelectItem value="5°">5°</SelectItem>
                        <SelectItem value="6°">6°</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="estudiante_grupo">Grupo *</Label>
                    <Select value={formData.estudiante_grupo} onValueChange={(value) => handleInputChange('estudiante_grupo', value)}>
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
                  nombre_completo: combineNames(formData.estudiante_nombres, formData.estudiante_apellido_paterno, formData.estudiante_apellido_materno)
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