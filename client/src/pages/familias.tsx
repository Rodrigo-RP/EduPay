import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Home, Plus, Search, Edit, Trash2, Phone, Mail, MapPin, Users, CreditCard, FileText, Link2 } from "lucide-react";

export default function Familias() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<any>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingFamily, setEditingFamily] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    // Datos Generales
    numero_familia: "",
    apellido_paterno: "",
    apellido_materno: "",
    // Padre/Tutor Principal
    padre_nombre: "",
    padre_telefono: "",
    padre_email: "",
    padre_ocupacion: "",
    padre_empresa: "",
    // Madre/Tutora
    madre_nombre: "",
    madre_telefono: "",
    madre_email: "",
    madre_ocupacion: "",
    madre_empresa: "",
    // Dirección
    direccion: "",
    colonia: "",
    ciudad: "",
    estado: "Ciudad de México",
    codigo_postal: "",
    // Datos de Facturación
    razon_social: "",
    rfc: "",
    email_facturacion: "",
    direccion_fiscal: "",
    uso_cfdi: "G03",
    metodo_pago: "PUE",
    forma_pago: "03",
    // Contactos Adicionales
    contacto_emergencia_nombre: "",
    contacto_emergencia_telefono: "",
    contacto_emergencia_relacion: "",
    // Observaciones
    observaciones: "",
    estatus: "activo"
  });

  const [familias, setFamilias] = useState([
    {
      id: 1,
      numero_familia: "FAM001",
      apellido_paterno: "Pérez",
      apellido_materno: "Méndez",
      padre_nombre: "Carlos Pérez García",
      padre_telefono: "5551234567",
      padre_email: "carlos.perez@gmail.com",
      madre_nombre: "Ana Méndez López",
      madre_telefono: "5551234568",
      madre_email: "ana.mendez@gmail.com",
      direccion: "Av. Insurgentes 123, Col. Roma Norte",
      ciudad: "Ciudad de México",
      codigo_postal: "06700",
      razon_social: "Carlos Pérez García",
      rfc: "PEGC850515ABC",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 1, nombre: "Carlos Pérez Méndez", grado: "3ro A" }
      ],
      saldo_total: 500000,
      fecha_registro: "2024-08-15"
    },
    {
      id: 2,
      numero_familia: "FAM002",
      apellido_paterno: "García",
      apellido_materno: "Luna",
      padre_nombre: "Roberto García Hernández",
      padre_telefono: "5559876543",
      padre_email: "roberto.garcia@hotmail.com",
      madre_nombre: "Ana Luna Martínez",
      madre_telefono: "5559876544",
      madre_email: "ana.luna@yahoo.com",
      direccion: "Calle Reforma 456, Col. Centro",
      ciudad: "Ciudad de México",
      codigo_postal: "06000",
      razon_social: "Roberto García Hernández",
      rfc: "GAHR780312XYZ",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 2, nombre: "Andrea García Luna", grado: "2do B" }
      ],
      saldo_total: 535000,
      fecha_registro: "2024-08-16"
    },
    {
      id: 3,
      numero_familia: "FAM003",
      apellido_paterno: "Martínez",
      apellido_materno: "Gil",
      padre_nombre: "Luis Martínez Rodríguez",
      padre_telefono: "5554567890",
      padre_email: "luis.martinez@empresa.com",
      madre_nombre: "María Gil Fernández",
      madre_telefono: "5554567891",
      madre_email: "maria.gil@gmail.com",
      direccion: "Av. Universidad 789, Col. Del Valle",
      ciudad: "Ciudad de México",
      codigo_postal: "03100",
      razon_social: "Servicios Martínez S.A. de C.V.",
      rfc: "SMA201015ABC",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 3, nombre: "Luis Martínez Gil", grado: "1ro C" },
        { id: 4, nombre: "Diego Martínez Gil", grado: "Kinder C" }
      ],
      saldo_total: 880000,
      fecha_registro: "2024-08-17"
    }
  ]);

  // Lista de estudiantes disponibles para vincular
  const estudiantesDisponibles = [
    { id: 1, nombre_completo: "Carlos Pérez Méndez", grado: "3ro", grupo: "A" },
    { id: 2, nombre_completo: "Andrea García Luna", grado: "2do", grupo: "B" },
    { id: 3, nombre_completo: "Luis Martínez Gil", grado: "1ro", grupo: "C" },
    { id: 4, nombre_completo: "Diego Martínez Gil", grado: "Kinder", grupo: "C" },
    { id: 5, nombre_completo: "Sofía Hernández Castro", grado: "5to", grupo: "A" },
    { id: 6, nombre_completo: "Miguel Torres Vega", grado: "4to", grupo: "B" }
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const resetForm = () => {
    setFormData({
      numero_familia: "",
      apellido_paterno: "",
      apellido_materno: "",
      padre_nombre: "",
      padre_telefono: "",
      padre_email: "",
      padre_ocupacion: "",
      padre_empresa: "",
      madre_nombre: "",
      madre_telefono: "",
      madre_email: "",
      madre_ocupacion: "",
      madre_empresa: "",
      direccion: "",
      colonia: "",
      ciudad: "",
      estado: "Ciudad de México",
      codigo_postal: "",
      razon_social: "",
      rfc: "",
      email_facturacion: "",
      direccion_fiscal: "",
      uso_cfdi: "G03",
      metodo_pago: "PUE",
      forma_pago: "03",
      contacto_emergencia_nombre: "",
      contacto_emergencia_telefono: "",
      contacto_emergencia_relacion: "",
      observaciones: "",
      estatus: "activo"
    });
  };

  const loadFamilyForEdit = (familia: any) => {
    setFormData({
      numero_familia: familia.numero_familia,
      apellido_paterno: familia.apellido_paterno,
      apellido_materno: familia.apellido_materno || "",
      padre_nombre: familia.padre_nombre,
      padre_telefono: familia.padre_telefono,
      padre_email: familia.padre_email || "",
      padre_ocupacion: familia.padre_ocupacion || "",
      padre_empresa: familia.padre_empresa || "",
      madre_nombre: familia.madre_nombre || "",
      madre_telefono: familia.madre_telefono || "",
      madre_email: familia.madre_email || "",
      madre_ocupacion: familia.madre_ocupacion || "",
      madre_empresa: familia.madre_empresa || "",
      direccion: familia.direccion || "",
      colonia: familia.colonia || "",
      ciudad: familia.ciudad || "",
      estado: familia.estado || "Ciudad de México",
      codigo_postal: familia.codigo_postal || "",
      razon_social: familia.razon_social || "",
      rfc: familia.rfc || "",
      email_facturacion: familia.email_facturacion || "",
      direccion_fiscal: familia.direccion_fiscal || "",
      uso_cfdi: familia.uso_cfdi || "G03",
      metodo_pago: familia.metodo_pago || "PUE",
      forma_pago: familia.forma_pago || "03",
      contacto_emergencia_nombre: familia.contacto_emergencia_nombre || "",
      contacto_emergencia_telefono: familia.contacto_emergencia_telefono || "",
      contacto_emergencia_relacion: familia.contacto_emergencia_relacion || "",
      observaciones: familia.observaciones || "",
      estatus: familia.estatus || "activo"
    });
    setEditingFamily(familia);
    setShowEditModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones básicas
    if (!formData.apellido_paterno || !formData.padre_nombre || !formData.padre_telefono) {
      toast({
        title: "Error",
        description: "Por favor complete los campos obligatorios: apellido paterno, nombre del padre y teléfono.",
        variant: "destructive"
      });
      return;
    }

    // Validar RFC si se proporciona
    if (formData.rfc && formData.rfc.length < 12) {
      toast({
        title: "Error",
        description: "El RFC debe tener al menos 12 caracteres.",
        variant: "destructive"
      });
      return;
    }

    if (editingFamily) {
      // Actualizar familia existente
      const updatedFamily = {
        ...editingFamily,
        apellido_paterno: formData.apellido_paterno,
        apellido_materno: formData.apellido_materno,
        padre_nombre: formData.padre_nombre,
        padre_telefono: formData.padre_telefono,
        padre_email: formData.padre_email,
        madre_nombre: formData.madre_nombre,
        madre_telefono: formData.madre_telefono,
        madre_email: formData.madre_email,
        direccion: formData.direccion,
        ciudad: formData.ciudad,
        codigo_postal: formData.codigo_postal,
        razon_social: formData.razon_social || formData.padre_nombre,
        rfc: formData.rfc,
        estatus: formData.estatus
      };

      setFamilias(prev => prev.map(f => f.id === editingFamily.id ? updatedFamily : f));
      
      toast({
        title: "Familia actualizada",
        description: `Los datos de la familia ${formData.apellido_paterno} han sido actualizados exitosamente.`
      });

      resetForm();
      setEditingFamily(null);
      setShowEditModal(false);
    } else {
      // Crear nueva familia
      const newId = Math.max(...familias.map(f => f.id)) + 1;
      const numeroFamilia = `FAM${String(newId).padStart(3, '0')}`;
      
      const newFamily = {
        id: newId,
        numero_familia: numeroFamilia,
        apellido_paterno: formData.apellido_paterno,
        apellido_materno: formData.apellido_materno,
        padre_nombre: formData.padre_nombre,
        padre_telefono: formData.padre_telefono,
        padre_email: formData.padre_email,
        madre_nombre: formData.madre_nombre,
        madre_telefono: formData.madre_telefono,
        madre_email: formData.madre_email,
        direccion: formData.direccion,
        ciudad: formData.ciudad,
        codigo_postal: formData.codigo_postal,
        razon_social: formData.razon_social || formData.padre_nombre,
        rfc: formData.rfc,
        estatus: formData.estatus,
        estudiantes_vinculados: [],
        saldo_total: 0,
        fecha_registro: new Date().toISOString().split('T')[0]
      };

      setFamilias(prev => [...prev, newFamily]);
      
      toast({
        title: "Familia registrada",
        description: `La familia ${formData.apellido_paterno} ha sido registrada exitosamente con número ${numeroFamilia}.`
      });

      resetForm();
      setShowAddModal(false);
    }
  };

  const handleDelete = (familiaId: number) => {
    const familia = familias.find(f => f.id === familiaId);
    if (familia && familia.estudiantes_vinculados.length > 0) {
      toast({
        title: "No se puede eliminar",
        description: "Esta familia tiene estudiantes vinculados. Primero desvincule los estudiantes.",
        variant: "destructive"
      });
      return;
    }

    setFamilias(prev => prev.filter(f => f.id !== familiaId));
    toast({
      title: "Familia eliminada",
      description: "La familia ha sido eliminada exitosamente."
    });
  };

  // Filtrar familias según criterios de búsqueda
  const filteredFamilias = familias.filter(familia => {
    const searchLower = searchTerm.toLowerCase();
    return familia.numero_familia.toLowerCase().includes(searchLower) ||
           familia.apellido_paterno.toLowerCase().includes(searchLower) ||
           familia.apellido_materno.toLowerCase().includes(searchLower) ||
           familia.padre_nombre.toLowerCase().includes(searchLower) ||
           familia.madre_nombre.toLowerCase().includes(searchLower) ||
           familia.padre_email.toLowerCase().includes(searchLower) ||
           familia.rfc.toLowerCase().includes(searchLower);
  });

  const estadisticas = {
    total: familias.length,
    activas: familias.filter(f => f.estatus === "activo").length,
    saldoTotal: familias.reduce((sum, f) => sum + f.saldo_total, 0),
    promedioHijos: familias.reduce((sum, f) => sum + f.estudiantes_vinculados.length, 0) / familias.length
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Familias</h1>
          <p className="text-slate-600">Administra datos de padres, tutores y información de facturación</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Agregar Familia
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-4 text-center">
            <Home className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.total}</div>
            <div className="text-sm text-slate-600">Total familias</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.activas}</div>
            <div className="text-sm text-slate-600">Familias activas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CreditCard className="w-8 h-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">${(estadisticas.saldoTotal / 100).toLocaleString()}</div>
            <div className="text-sm text-slate-600">Saldo total pendiente</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{estadisticas.promedioHijos.toFixed(1)}</div>
            <div className="text-sm text-slate-600">Promedio hijos por familia</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Búsqueda de familias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="search">Buscar familia</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="search"
                  placeholder="Número, apellidos, nombre, email o RFC..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                Limpiar búsqueda
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de familias */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de familias ({filteredFamilias.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredFamilias.map((familia) => (
              <div key={familia.id} className="border rounded-lg p-4 hover:bg-slate-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Home className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{familia.numero_familia}</h3>
                        <Badge variant={familia.estatus === 'activo' ? 'default' : 'secondary'}>
                          {familia.estatus}
                        </Badge>
                      </div>
                      <h4 className="font-medium text-slate-900 mb-2">
                        Familia {familia.apellido_paterno} {familia.apellido_materno}
                      </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="flex items-center gap-2 text-slate-600 mb-1">
                            <Users className="w-4 h-4" />
                            <span className="font-medium">Padre:</span> {familia.padre_nombre}
                          </div>
                          <div className="flex items-center gap-2 text-slate-600 mb-1">
                            <Phone className="w-4 h-4" />
                            <span>{familia.padre_telefono}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail className="w-4 h-4" />
                            <span>{familia.padre_email}</span>
                          </div>
                        </div>
                        
                        <div>
                          {familia.madre_nombre && (
                            <>
                              <div className="flex items-center gap-2 text-slate-600 mb-1">
                                <Users className="w-4 h-4" />
                                <span className="font-medium">Madre:</span> {familia.madre_nombre}
                              </div>
                              <div className="flex items-center gap-2 text-slate-600 mb-1">
                                <Phone className="w-4 h-4" />
                                <span>{familia.madre_telefono}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600">
                                <Mail className="w-4 h-4" />
                                <span>{familia.madre_email}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2 text-slate-600 mb-2">
                          <MapPin className="w-4 h-4" />
                          <span className="text-xs">{familia.direccion}, {familia.ciudad} {familia.codigo_postal}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600 mb-2">
                          <FileText className="w-4 h-4" />
                          <span className="text-xs">RFC: {familia.rfc} • {familia.razon_social}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-700">Estudiantes vinculados:</span>
                          {familia.estudiantes_vinculados.length > 0 ? (
                            <div className="flex gap-1">
                              {familia.estudiantes_vinculados.map((estudiante, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {estudiante.nombre} ({estudiante.grado})
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Sin estudiantes vinculados</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <div className="font-semibold text-lg">${(familia.saldo_total / 100).toLocaleString()}</div>
                      <div className="text-xs text-slate-500">Saldo pendiente</div>
                    </div>
                    <div className="flex space-x-1">
                      <Button size="sm" variant="outline" onClick={() => {
                        setSelectedFamily(familia);
                        setShowLinkModal(true);
                      }} title="Vincular estudiantes">
                        <Link2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => loadFamilyForEdit(familia)} title="Editar familia">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(familia.id)} title="Eliminar familia"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal para agregar/editar familia */}
      <Dialog open={showAddModal || showEditModal} onOpenChange={(open) => {
        if (!open) {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingFamily(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFamily ? 'Editar Familia' : 'Agregar Nueva Familia'}</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="generales" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="generales">Datos Generales</TabsTrigger>
                <TabsTrigger value="contacto">Contacto y Dirección</TabsTrigger>
                <TabsTrigger value="facturacion">Facturación</TabsTrigger>
                <TabsTrigger value="adicional">Información Adicional</TabsTrigger>
              </TabsList>

              <TabsContent value="generales" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="apellido_paterno">Apellido Paterno *</Label>
                    <Input
                      id="apellido_paterno"
                      value={formData.apellido_paterno}
                      onChange={(e) => handleInputChange("apellido_paterno", e.target.value)}
                      placeholder="Apellido paterno de la familia"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="apellido_materno">Apellido Materno</Label>
                    <Input
                      id="apellido_materno"
                      value={formData.apellido_materno}
                      onChange={(e) => handleInputChange("apellido_materno", e.target.value)}
                      placeholder="Apellido materno de la familia"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Padre/Tutor Principal</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="padre_nombre">Nombre Completo *</Label>
                      <Input
                        id="padre_nombre"
                        value={formData.padre_nombre}
                        onChange={(e) => handleInputChange("padre_nombre", e.target.value)}
                        placeholder="Nombre completo del padre/tutor"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="padre_telefono">Teléfono *</Label>
                      <Input
                        id="padre_telefono"
                        value={formData.padre_telefono}
                        onChange={(e) => handleInputChange("padre_telefono", e.target.value)}
                        placeholder="Teléfono principal"
                        maxLength={10}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="padre_email">Correo Electrónico</Label>
                      <Input
                        id="padre_email"
                        type="email"
                        value={formData.padre_email}
                        onChange={(e) => handleInputChange("padre_email", e.target.value)}
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="padre_ocupacion">Ocupación</Label>
                      <Input
                        id="padre_ocupacion"
                        value={formData.padre_ocupacion}
                        onChange={(e) => handleInputChange("padre_ocupacion", e.target.value)}
                        placeholder="Ocupación o profesión"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="padre_empresa">Empresa/Lugar de trabajo</Label>
                      <Input
                        id="padre_empresa"
                        value={formData.padre_empresa}
                        onChange={(e) => handleInputChange("padre_empresa", e.target.value)}
                        placeholder="Nombre de la empresa o lugar de trabajo"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Madre/Tutora</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="madre_nombre">Nombre Completo</Label>
                      <Input
                        id="madre_nombre"
                        value={formData.madre_nombre}
                        onChange={(e) => handleInputChange("madre_nombre", e.target.value)}
                        placeholder="Nombre completo de la madre/tutora"
                      />
                    </div>
                    <div>
                      <Label htmlFor="madre_telefono">Teléfono</Label>
                      <Input
                        id="madre_telefono"
                        value={formData.madre_telefono}
                        onChange={(e) => handleInputChange("madre_telefono", e.target.value)}
                        placeholder="Teléfono de la madre"
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <Label htmlFor="madre_email">Correo Electrónico</Label>
                      <Input
                        id="madre_email"
                        type="email"
                        value={formData.madre_email}
                        onChange={(e) => handleInputChange("madre_email", e.target.value)}
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="madre_ocupacion">Ocupación</Label>
                      <Input
                        id="madre_ocupacion"
                        value={formData.madre_ocupacion}
                        onChange={(e) => handleInputChange("madre_ocupacion", e.target.value)}
                        placeholder="Ocupación o profesión"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="madre_empresa">Empresa/Lugar de trabajo</Label>
                      <Input
                        id="madre_empresa"
                        value={formData.madre_empresa}
                        onChange={(e) => handleInputChange("madre_empresa", e.target.value)}
                        placeholder="Nombre de la empresa o lugar de trabajo"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contacto" className="space-y-4">
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
                      <Label htmlFor="ciudad">Ciudad</Label>
                      <Input
                        id="ciudad"
                        value={formData.ciudad}
                        onChange={(e) => handleInputChange("ciudad", e.target.value)}
                        placeholder="Ciudad"
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
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Contacto de Emergencia</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="contacto_emergencia_nombre">Nombre</Label>
                      <Input
                        id="contacto_emergencia_nombre"
                        value={formData.contacto_emergencia_nombre}
                        onChange={(e) => handleInputChange("contacto_emergencia_nombre", e.target.value)}
                        placeholder="Nombre del contacto"
                      />
                    </div>
                    <div>
                      <Label htmlFor="contacto_emergencia_telefono">Teléfono</Label>
                      <Input
                        id="contacto_emergencia_telefono"
                        value={formData.contacto_emergencia_telefono}
                        onChange={(e) => handleInputChange("contacto_emergencia_telefono", e.target.value)}
                        placeholder="Teléfono de emergencia"
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <Label htmlFor="contacto_emergencia_relacion">Relación</Label>
                      <Select value={formData.contacto_emergencia_relacion} onValueChange={(value) => handleInputChange("contacto_emergencia_relacion", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar relación" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="abuelo">Abuelo/a</SelectItem>
                          <SelectItem value="tio">Tío/a</SelectItem>
                          <SelectItem value="hermano">Hermano/a</SelectItem>
                          <SelectItem value="amigo">Amigo/a de la familia</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="facturacion" className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Datos Fiscales</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="razon_social">Razón Social</Label>
                      <Input
                        id="razon_social"
                        value={formData.razon_social}
                        onChange={(e) => handleInputChange("razon_social", e.target.value)}
                        placeholder="Nombre o razón social para facturación"
                      />
                    </div>
                    <div>
                      <Label htmlFor="rfc">RFC</Label>
                      <Input
                        id="rfc"
                        value={formData.rfc}
                        onChange={(e) => handleInputChange("rfc", e.target.value.toUpperCase())}
                        placeholder="RFC de 12 o 13 caracteres"
                        maxLength={13}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="email_facturacion">Email para Facturación</Label>
                      <Input
                        id="email_facturacion"
                        type="email"
                        value={formData.email_facturacion}
                        onChange={(e) => handleInputChange("email_facturacion", e.target.value)}
                        placeholder="Email donde se enviarán las facturas"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="direccion_fiscal">Dirección Fiscal</Label>
                      <Input
                        id="direccion_fiscal"
                        value={formData.direccion_fiscal}
                        onChange={(e) => handleInputChange("direccion_fiscal", e.target.value)}
                        placeholder="Dirección fiscal registrada en el SAT"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Configuración CFDI</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="uso_cfdi">Uso de CFDI</Label>
                      <Select value={formData.uso_cfdi} onValueChange={(value) => handleInputChange("uso_cfdi", value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="G01">G01 - Adquisición de mercancías</SelectItem>
                          <SelectItem value="G03">G03 - Gastos en general</SelectItem>
                          <SelectItem value="P01">P01 - Por definir</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="metodo_pago">Método de Pago</Label>
                      <Select value={formData.metodo_pago} onValueChange={(value) => handleInputChange("metodo_pago", value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PUE">PUE - Pago en una exhibición</SelectItem>
                          <SelectItem value="PPD">PPD - Pago en parcialidades</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="forma_pago">Forma de Pago</Label>
                      <Select value={formData.forma_pago} onValueChange={(value) => handleInputChange("forma_pago", value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="01">01 - Efectivo</SelectItem>
                          <SelectItem value="03">03 - Transferencia electrónica</SelectItem>
                          <SelectItem value="04">04 - Tarjeta de crédito</SelectItem>
                          <SelectItem value="28">28 - Tarjeta de débito</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="adicional" className="space-y-4">
                <div>
                  <Label htmlFor="observaciones">Observaciones</Label>
                  <Textarea
                    id="observaciones"
                    value={formData.observaciones}
                    onChange={(e) => handleInputChange("observaciones", e.target.value)}
                    placeholder="Información adicional sobre la familia..."
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="estatus">Estado de la Familia</Label>
                  <Select value={formData.estatus} onValueChange={(value) => handleInputChange("estatus", value)}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                      <SelectItem value="suspendido">Suspendido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end space-x-4 pt-6 border-t mt-6">
              <Button type="button" variant="outline" onClick={() => {
                resetForm();
                setShowAddModal(false);
                setShowEditModal(false);
                setEditingFamily(null);
              }}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {editingFamily ? (
                  <>
                    <Edit className="w-4 h-4 mr-2" />
                    Actualizar Familia
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Registrar Familia
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal para vincular estudiantes */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular Estudiantes a la Familia</DialogTitle>
          </DialogHeader>
          
          {selectedFamily && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-medium">{selectedFamily.numero_familia} - Familia {selectedFamily.apellido_paterno}</h3>
                <p className="text-sm text-slate-600">Responsable: {selectedFamily.padre_nombre}</p>
              </div>

              <div>
                <h4 className="font-medium mb-3">Estudiantes disponibles</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {estudiantesDisponibles.map((estudiante) => (
                    <div key={estudiante.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{estudiante.nombre_completo}</div>
                        <div className="text-sm text-slate-600">{estudiante.grado} {estudiante.grupo}</div>
                      </div>
                      <Button size="sm" variant="outline">
                        <Link2 className="w-4 h-4 mr-1" />
                        Vincular
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowLinkModal(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}