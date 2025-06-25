import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Search, Edit, Trash2, UserCheck, UserX, Phone, Mail, MapPin } from "lucide-react";

export default function Estudiantes() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrado, setSelectedGrado] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [formData, setFormData] = useState({
    nombre_completo: "",
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
    telefono_emergencia: ""
  });

  const [estudiantes, setEstudiantes] = useState([
    {
      id: 1,
      nombre_completo: "Emilia Santos Rivera",
      curp: "SARI180920MDFNVM01",
      grado: "Kinder 1",
      grupo: "A",
      status: "activo",
      responsable: "María Rivera",
      telefono: "5551234567",
      saldo_pendiente: 380000,
      fecha_inscripcion: "2024-08-15"
    },
    {
      id: 10,
      nombre_completo: "Mateo Cruz Flores",
      curp: "CRFM170815HDFRLR07",
      grado: "Kinder 2",
      grupo: "B",
      status: "activo",
      responsable: "Laura Flores",
      telefono: "5551122334",
      saldo_pendiente: 400000,
      fecha_inscripcion: "2024-08-24"
    },
    {
      id: 11,
      nombre_completo: "Valentina Ruiz Moreno",
      curp: "RUMV160712MDFZRL03",
      grado: "Kinder 3",
      grupo: "A",
      status: "activo",
      responsable: "José Moreno",
      telefono: "5552233445",
      saldo_pendiente: 420000,
      fecha_inscripcion: "2024-08-25"
    },
    {
      id: 12,
      nombre_completo: "Carlos Pérez Méndez",
      curp: "PEMC051215HDFRZR09",
      grado: "3ro",
      grupo: "A",
      status: "activo",
      responsable: "Carlos Pérez",
      telefono: "5551234567",
      saldo_pendiente: 500000,
      fecha_inscripcion: "2024-08-15"
    },
    {
      id: 2,
      nombre_completo: "Andrea García Luna",
      curp: "GALN040312MDFPPR03",
      grado: "2do",
      grupo: "B",
      status: "activo",
      responsable: "Ana García",
      telefono: "5559876543",
      saldo_pendiente: 535000,
      fecha_inscripcion: "2024-08-16"
    },
    {
      id: 3,
      nombre_completo: "Luis Martínez Gil",
      curp: "MAGL070118HDFRNR05",
      grado: "1ro",
      grupo: "C",
      status: "activo",
      responsable: "María Martínez",
      telefono: "5554567890",
      saldo_pendiente: 455000,
      fecha_inscripcion: "2024-08-17"
    },
    {
      id: 4,
      nombre_completo: "Sofía Hernández Castro",
      curp: "HECS060920MDFRZS04",
      grado: "1ro Sec",
      grupo: "A",
      status: "activo",
      responsable: "Roberto Hernández",
      telefono: "5553456789",
      saldo_pendiente: 620000,
      fecha_inscripcion: "2024-08-18"
    },
    {
      id: 5,
      nombre_completo: "Miguel Torres Vega",
      curp: "TOVM040715HDFGLR08",
      grado: "2do Sec",
      grupo: "B",
      status: "activo",
      responsable: "Carmen Vega",
      telefono: "5558765432",
      saldo_pendiente: 640000,
      fecha_inscripcion: "2024-08-19"
    },
    {
      id: 6,
      nombre_completo: "Valeria López Cruz",
      curp: "LOCV030822MDFPRL02",
      grado: "3ro Sec",
      grupo: "C",
      status: "activo",
      responsable: "Eduardo López",
      telefono: "5557654321",
      saldo_pendiente: 660000,
      fecha_inscripcion: "2024-08-20"
    },
    {
      id: 7,
      nombre_completo: "Diego Ramírez Silva",
      curp: "RASD010305HDFMLG06",
      grado: "1ro Bach",
      grupo: "A",
      status: "activo",
      responsable: "Patricia Silva",
      telefono: "5556543210",
      saldo_pendiente: 780000,
      fecha_inscripcion: "2024-08-21"
    },
    {
      id: 8,
      nombre_completo: "Isabella Morales Ruiz",
      curp: "MORI000412MDFRRZ09",
      grado: "2do Bach",
      grupo: "B",
      status: "activo",
      responsable: "Fernando Morales",
      telefono: "5555432109",
      saldo_pendiente: 800000,
      fecha_inscripcion: "2024-08-22"
    },
    {
      id: 9,
      nombre_completo: "Alejandro Castillo Mendoza",
      curp: "CAMA990528HDFSNL01",
      grado: "3ro Bach",
      grupo: "A",
      status: "activo",
      responsable: "Gabriela Mendoza",
      telefono: "5554321098",
      saldo_pendiente: 820000,
      fecha_inscripcion: "2024-08-23"
    }
  ]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const resetForm = () => {
    setFormData({
      nombre_completo: "",
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
      telefono_emergencia: ""
    });
  };

  const loadStudentForEdit = (student: any) => {
    setFormData({
      nombre_completo: student.nombre_completo,
      curp: student.curp,
      fecha_nacimiento: student.fecha_nacimiento || "",
      grado: student.grado,
      grupo: student.grupo,
      status: student.status,
      responsable_nombre: student.responsable,
      responsable_telefono: student.telefono,
      responsable_email: student.responsable_email || "",
      direccion: student.direccion || "",
      codigo_postal: student.codigo_postal || "",
      ciudad: student.ciudad || "",
      estado: student.estado || "",
      alergias: student.alergias || "",
      medicamentos: student.medicamentos || "",
      contacto_emergencia: student.contacto_emergencia || "",
      telefono_emergencia: student.telefono_emergencia || ""
    });
    setEditingStudent(student);
    setShowEditModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones básicas
    if (!formData.nombre_completo || !formData.curp || !formData.grado || !formData.responsable_nombre) {
      toast({
        title: "Error",
        description: "Por favor complete todos los campos obligatorios.",
        variant: "destructive"
      });
      return;
    }

    // Validar formato CURP (18 caracteres)
    if (formData.curp.length !== 18) {
      toast({
        title: "Error",
        description: "El CURP debe tener 18 caracteres.",
        variant: "destructive"
      });
      return;
    }

    if (editingStudent) {
      // Actualizar estudiante existente
      const updatedStudent = {
        ...editingStudent,
        nombre_completo: formData.nombre_completo,
        curp: formData.curp,
        grado: formData.grado,
        grupo: formData.grupo,
        status: formData.status,
        responsable: formData.responsable_nombre,
        telefono: formData.responsable_telefono
      };

      setEstudiantes(prev => prev.map(s => s.id === editingStudent.id ? updatedStudent : s));
      
      toast({
        title: "Estudiante actualizado",
        description: `Los datos de ${formData.nombre_completo} han sido actualizados exitosamente.`
      });

      resetForm();
      setEditingStudent(null);
      setShowEditModal(false);
    } else {
      // Crear nuevo estudiante
      const newId = Math.max(...estudiantes.map(e => e.id)) + 1;
      
      const newStudent = {
        id: newId,
        nombre_completo: formData.nombre_completo,
        curp: formData.curp,
        grado: formData.grado,
        grupo: formData.grupo,
        status: formData.status,
        responsable: formData.responsable_nombre,
        telefono: formData.responsable_telefono,
        saldo_pendiente: 0,
        fecha_inscripcion: new Date().toISOString().split('T')[0]
      };

      setEstudiantes(prev => [...prev, newStudent]);
      
      toast({
        title: "Estudiante agregado",
        description: `${formData.nombre_completo} ha sido registrado exitosamente.`
      });

      resetForm();
      setShowAddModal(false);
    }
  };

  const handleDelete = (studentId: number) => {
    const student = estudiantes.find(s => s.id === studentId);
    if (student && student.saldo_pendiente > 0) {
      toast({
        title: "No se puede eliminar",
        description: "Este estudiante tiene saldo pendiente. Primero liquide las deudas.",
        variant: "destructive"
      });
      return;
    }

    setEstudiantes(prev => prev.filter(s => s.id !== studentId));
    toast({
      title: "Estudiante eliminado",
      description: "El estudiante ha sido eliminado exitosamente."
    });
  };

  // Filtrar estudiantes según criterios de búsqueda
  const filteredStudents = estudiantes.filter(student => {
    const matchesSearch = student.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.curp.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.responsable.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrado = selectedGrado === "all" || student.grado === selectedGrado;
    return matchesSearch && matchesGrado;
  });

  const estadisticas = {
    total: estudiantes.length,
    activos: estudiantes.filter(s => s.status === "activo").length,
    saldoPendiente: estudiantes.reduce((sum, s) => sum + s.saldo_pendiente, 0),
    promedioSaldo: estudiantes.reduce((sum, s) => sum + s.saldo_pendiente, 0) / estudiantes.length
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Estudiantes</h1>
          <p className="text-slate-600">Administra alumnos, responsables y información académica</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Agregar Estudiante
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.total}</div>
            <div className="text-sm text-slate-600">Total estudiantes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <UserCheck className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.activos}</div>
            <div className="text-sm text-slate-600">Estudiantes activos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">${(estadisticas.saldoPendiente / 100).toLocaleString()}</div>
            <div className="text-sm text-slate-600">Saldo pendiente total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">${(estadisticas.promedioSaldo / 100).toLocaleString()}</div>
            <div className="text-sm text-slate-600">Promedio por estudiante</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros y búsqueda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="search">Buscar estudiante</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="search"
                  placeholder="Nombre, CURP o responsable..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>Filtrar por grado</Label>
              <Select value={selectedGrado} onValueChange={setSelectedGrado}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los grados</SelectItem>
                  <SelectItem value="Kinder 1">Kinder 1</SelectItem>
                  <SelectItem value="Kinder 2">Kinder 2</SelectItem>
                  <SelectItem value="Kinder 3">Kinder 3</SelectItem>
                  <SelectItem value="1ro">1ro Primaria</SelectItem>
                  <SelectItem value="2do">2do Primaria</SelectItem>
                  <SelectItem value="3ro">3ro Primaria</SelectItem>
                  <SelectItem value="4to">4to Primaria</SelectItem>
                  <SelectItem value="5to">5to Primaria</SelectItem>
                  <SelectItem value="6to">6to Primaria</SelectItem>
                  <SelectItem value="1ro Sec">1ro Secundaria</SelectItem>
                  <SelectItem value="2do Sec">2do Secundaria</SelectItem>
                  <SelectItem value="3ro Sec">3ro Secundaria</SelectItem>
                  <SelectItem value="1ro Bach">1ro Bachillerato</SelectItem>
                  <SelectItem value="2do Bach">2do Bachillerato</SelectItem>
                  <SelectItem value="3ro Bach">3ro Bachillerato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => {
                setSearchTerm("");
                setSelectedGrado("all");
              }}>
                Limpiar filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de estudiantes */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de estudiantes ({filteredStudents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredStudents.map((student) => (
              <div key={student.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">
                      {student.nombre_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium">{student.nombre_completo}</h3>
                    <p className="text-sm text-slate-600">{student.grado} {student.grupo} • CURP: {student.curp}</p>
                    <p className="text-xs text-slate-500">Responsable: {student.responsable} • {student.telefono}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="font-semibold">${(student.saldo_pendiente / 100).toLocaleString()}</div>
                    <div className="text-xs text-slate-500">Saldo pendiente</div>
                  </div>
                  <Badge variant={student.status === 'activo' ? 'default' : 'secondary'}>
                    {student.status}
                  </Badge>
                  <div className="flex space-x-1">
                    <Button size="sm" variant="outline" onClick={() => loadStudentForEdit(student)} title="Editar estudiante">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(student.id)} title="Eliminar estudiante"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <UserX className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal para agregar/editar estudiante */}
      <Dialog open={showAddModal || showEditModal} onOpenChange={(open) => {
        if (!open) {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingStudent(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStudent ? 'Editar Estudiante' : 'Agregar Nuevo Estudiante'}</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Información del Estudiante */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Información del Estudiante</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nombre_completo">Nombre Completo *</Label>
                  <Input
                    id="nombre_completo"
                    value={formData.nombre_completo}
                    onChange={(e) => handleInputChange("nombre_completo", e.target.value)}
                    placeholder="Nombre y apellidos del estudiante"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="curp">CURP *</Label>
                  <Input
                    id="curp"
                    value={formData.curp}
                    onChange={(e) => handleInputChange("curp", e.target.value.toUpperCase())}
                    placeholder="18 caracteres del CURP"
                    maxLength={18}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="fecha_nacimiento">Fecha de Nacimiento</Label>
                  <Input
                    id="fecha_nacimiento"
                    type="date"
                    value={formData.fecha_nacimiento}
                    onChange={(e) => handleInputChange("fecha_nacimiento", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="grado">Grado *</Label>
                  <Select value={formData.grado} onValueChange={(value) => handleInputChange("grado", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar grado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Kinder 1">Kinder 1</SelectItem>
                      <SelectItem value="Kinder 2">Kinder 2</SelectItem>
                      <SelectItem value="Kinder 3">Kinder 3</SelectItem>
                      <SelectItem value="1ro">1ro Primaria</SelectItem>
                      <SelectItem value="2do">2do Primaria</SelectItem>
                      <SelectItem value="3ro">3ro Primaria</SelectItem>
                      <SelectItem value="4to">4to Primaria</SelectItem>
                      <SelectItem value="5to">5to Primaria</SelectItem>
                      <SelectItem value="6to">6to Primaria</SelectItem>
                      <SelectItem value="1ro Sec">1ro Secundaria</SelectItem>
                      <SelectItem value="2do Sec">2do Secundaria</SelectItem>
                      <SelectItem value="3ro Sec">3ro Secundaria</SelectItem>
                      <SelectItem value="1ro Bach">1ro Bachillerato</SelectItem>
                      <SelectItem value="2do Bach">2do Bachillerato</SelectItem>
                      <SelectItem value="3ro Bach">3ro Bachillerato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="grupo">Grupo</Label>
                  <Select value={formData.grupo} onValueChange={(value) => handleInputChange("grupo", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="B">B</SelectItem>
                      <SelectItem value="C">C</SelectItem>
                      <SelectItem value="D">D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status">Estado</Label>
                  <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                      <SelectItem value="suspendido">Suspendido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Información del Responsable */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Información del Responsable</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="responsable_nombre">Nombre del Responsable *</Label>
                  <Input
                    id="responsable_nombre"
                    value={formData.responsable_nombre}
                    onChange={(e) => handleInputChange("responsable_nombre", e.target.value)}
                    placeholder="Padre, madre o tutor"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="responsable_telefono">Teléfono *</Label>
                  <Input
                    id="responsable_telefono"
                    value={formData.responsable_telefono}
                    onChange={(e) => handleInputChange("responsable_telefono", e.target.value)}
                    placeholder="10 dígitos"
                    maxLength={10}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="responsable_email">Correo Electrónico</Label>
                  <Input
                    id="responsable_email"
                    type="email"
                    value={formData.responsable_email}
                    onChange={(e) => handleInputChange("responsable_email", e.target.value)}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </div>
            </div>

            {/* Dirección */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Dirección</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="direccion">Dirección Completa</Label>
                  <Input
                    id="direccion"
                    value={formData.direccion}
                    onChange={(e) => handleInputChange("direccion", e.target.value)}
                    placeholder="Calle, número, colonia"
                  />
                </div>
                <div>
                  <Label htmlFor="codigo_postal">Código Postal</Label>
                  <Input
                    id="codigo_postal"
                    value={formData.codigo_postal}
                    onChange={(e) => handleInputChange("codigo_postal", e.target.value)}
                    placeholder="5 dígitos"
                    maxLength={5}
                  />
                </div>
                <div>
                  <Label htmlFor="ciudad">Ciudad</Label>
                  <Input
                    id="ciudad"
                    value={formData.ciudad}
                    onChange={(e) => handleInputChange("ciudad", e.target.value)}
                    placeholder="Ciudad"
                  />
                </div>
              </div>
            </div>

            {/* Información Médica y Emergencias */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Información Médica y Emergencias</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="alergias">Alergias</Label>
                  <Textarea
                    id="alergias"
                    value={formData.alergias}
                    onChange={(e) => handleInputChange("alergias", e.target.value)}
                    placeholder="Alergias conocidas del estudiante"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="medicamentos">Medicamentos</Label>
                  <Textarea
                    id="medicamentos"
                    value={formData.medicamentos}
                    onChange={(e) => handleInputChange("medicamentos", e.target.value)}
                    placeholder="Medicamentos que toma regularmente"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="contacto_emergencia">Contacto de Emergencia</Label>
                  <Input
                    id="contacto_emergencia"
                    value={formData.contacto_emergencia}
                    onChange={(e) => handleInputChange("contacto_emergencia", e.target.value)}
                    placeholder="Nombre del contacto de emergencia"
                  />
                </div>
                <div>
                  <Label htmlFor="telefono_emergencia">Teléfono de Emergencia</Label>
                  <Input
                    id="telefono_emergencia"
                    value={formData.telefono_emergencia}
                    onChange={(e) => handleInputChange("telefono_emergencia", e.target.value)}
                    placeholder="Teléfono del contacto de emergencia"
                    maxLength={10}
                  />
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end space-x-4 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {
                resetForm();
                setShowAddModal(false);
                setShowEditModal(false);
                setEditingStudent(null);
              }}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {editingStudent ? (
                  <>
                    <Edit className="w-4 h-4 mr-2" />
                    Actualizar Estudiante
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Estudiante
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}