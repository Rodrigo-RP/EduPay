import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Building, Plus, Edit, Phone, Mail, MessageSquare, FileText, Eye, DollarSign } from "lucide-react";

export default function Proveedores() {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Datos demo de proveedores
  const proveedores = [
    {
      id: 1,
      nombre_empresa: "Servicios Educativos Integrales S.A. de C.V.",
      rfc: "SEI120315ABC",
      telefono: "55-1234-5678",
      whatsapp: "55-1234-5678",
      contacto: "Lic. María González",
      correo: "contacto@sei.com.mx",
      categoria: "SERVICIOS",
      direccion: "Av. Educación 123, Col. Escolar, CDMX",
      activo: true,
      total_facturas: 8,
      monto_pendiente: 45000
    },
    {
      id: 2,
      nombre_empresa: "Papelería y Útiles Escolares La Académica",
      rfc: "PUE090810XYZ",
      telefono: "55-9876-5432",
      whatsapp: "55-9876-5432",
      contacto: "Sr. Carlos Mendoza",
      correo: "ventas@laacademica.mx",
      categoria: "PRODUCTOS",
      direccion: "Calle Principal 456, Col. Centro, CDMX",
      activo: true,
      total_facturas: 15,
      monto_pendiente: 0
    },
    {
      id: 3,
      nombre_empresa: "Mantenimiento y Limpieza Profesional",
      rfc: "MLP050420DEF",
      telefono: "55-5555-1111",
      whatsapp: "55-5555-1111",
      contacto: "Ing. Roberto Silva",
      correo: "admin@mlprofesional.com",
      categoria: "MANTENIMIENTO",
      direccion: "Blvd. Servicios 789, Col. Industrial, CDMX",
      activo: true,
      total_facturas: 12,
      monto_pendiente: 12000
    },
    {
      id: 4,
      nombre_empresa: "Editorial Libros Educativos Modernos",
      rfc: "ELM110725GHI",
      telefono: "55-7777-8888",
      whatsapp: "55-7777-8888",
      contacto: "Dra. Ana Patricia Ruiz",
      correo: "pedidos@elmmodernos.edu.mx",
      categoria: "PRODUCTOS",
      direccion: "Av. Literatura 321, Col. Educativa, CDMX",
      activo: true,
      total_facturas: 6,
      monto_pendiente: 28500
    },
    {
      id: 5,
      nombre_empresa: "Tecnología y Equipos Escolares Tech-Ed",
      rfc: "TET080915JKL",
      telefono: "55-3333-4444",
      whatsapp: "55-3333-4444",
      contacto: "Ing. Luis Fernando Torres",
      correo: "soporte@teched.mx",
      categoria: "TECNOLOGIA",
      direccion: "Circuito Tecnológico 654, Col. Innovación, CDMX",
      activo: false,
      total_facturas: 3,
      monto_pendiente: 0
    }
  ];

  // Datos demo de facturas de proveedores
  const facturas = [
    {
      id: 1,
      provider_id: 1,
      proveedor: "Servicios Educativos Integrales S.A. de C.V.",
      folio: "A-001234",
      fecha_emision: "2025-01-15",
      fecha_vencimiento: "2025-02-15",
      monto: 25000,
      iva: 4000,
      total: 29000,
      estado: "PENDIENTE",
      descripcion: "Servicios de consultoría educativa enero 2025"
    },
    {
      id: 2,
      provider_id: 2,
      proveedor: "Papelería y Útiles Escolares La Académica",
      folio: "FAC-567890",
      fecha_emision: "2025-01-10",
      fecha_vencimiento: "2025-01-25",
      monto: 8500,
      iva: 1360,
      total: 9860,
      estado: "PAGADA",
      descripcion: "Material escolar para inicio de ciclo"
    },
    {
      id: 3,
      provider_id: 3,
      proveedor: "Mantenimiento y Limpieza Profesional",
      folio: "MLP-789012",
      fecha_emision: "2025-01-05",
      fecha_vencimiento: "2025-01-20",
      monto: 12000,
      iva: 1920,
      total: 13920,
      estado: "VENCIDA",
      descripcion: "Servicio de limpieza profunda instalaciones"
    }
  ];

  const filteredProveedores = selectedCategory === "all" 
    ? proveedores 
    : proveedores.filter(p => p.categoria === selectedCategory);

  const estadisticas = {
    totalProveedores: proveedores.length,
    proveedoresActivos: proveedores.filter(p => p.activo).length,
    facturasPendientes: facturas.filter(f => f.estado === "PENDIENTE").length,
    montoPendiente: facturas.filter(f => f.estado === "PENDIENTE").reduce((sum, f) => sum + f.total, 0)
  };

  const getCategoryBadge = (categoria: string) => {
    const colors = {
      SERVICIOS: "bg-blue-100 text-blue-800",
      PRODUCTOS: "bg-green-100 text-green-800",
      MANTENIMIENTO: "bg-orange-100 text-orange-800",
      TECNOLOGIA: "bg-purple-100 text-purple-800"
    };
    
    return (
      <Badge className={colors[categoria as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {categoria}
      </Badge>
    );
  };

  const getEstadoFacturaBadge = (estado: string) => {
    const colors = {
      PENDIENTE: "bg-yellow-100 text-yellow-800",
      PAGADA: "bg-green-100 text-green-800", 
      VENCIDA: "bg-red-100 text-red-800"
    };
    
    return (
      <Badge className={colors[estado as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {estado}
      </Badge>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <SaaSInfo />
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Gestión de Proveedores</h1>
              <p className="text-slate-600">Administra proveedores, contactos y historial de facturas</p>
            </div>
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Proveedor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Registrar nuevo proveedor</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                  <div className="md:col-span-2">
                    <Label>Nombre de la empresa</Label>
                    <Input placeholder="Empresa Proveedora S.A. de C.V." />
                  </div>
                  <div>
                    <Label>RFC</Label>
                    <Input placeholder="ABC123456XYZ" />
                  </div>
                  <div>
                    <Label>Categoría</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SERVICIOS">Servicios</SelectItem>
                        <SelectItem value="PRODUCTOS">Productos</SelectItem>
                        <SelectItem value="MANTENIMIENTO">Mantenimiento</SelectItem>
                        <SelectItem value="TECNOLOGIA">Tecnología</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Teléfono</Label>
                    <Input placeholder="55-1234-5678" />
                  </div>
                  <div>
                    <Label>WhatsApp</Label>
                    <Input placeholder="55-1234-5678" />
                  </div>
                  <div>
                    <Label>Contacto principal</Label>
                    <Input placeholder="Lic. Juan Pérez" />
                  </div>
                  <div>
                    <Label>Correo electrónico</Label>
                    <Input type="email" placeholder="contacto@empresa.com" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Dirección</Label>
                    <Input placeholder="Calle Principal 123, Col. Centro, Ciudad, CP 12345" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="active" defaultChecked />
                    <Label htmlFor="active">Proveedor activo</Label>
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancelar
                  </Button>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Registrar Proveedor
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Building className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.totalProveedores}</div>
                <div className="text-sm text-slate-600">Total proveedores</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{estadisticas.proveedoresActivos}</div>
                <div className="text-sm text-slate-600">Proveedores activos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <FileText className="w-8 h-8 text-orange-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.facturasPendientes}</div>
                <div className="text-sm text-slate-600">Facturas pendientes</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <DollarSign className="w-8 h-8 text-red-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">${estadisticas.montoPendiente.toLocaleString()}</div>
                <div className="text-sm text-slate-600">Monto pendiente</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="proveedores" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="proveedores">Lista de proveedores</TabsTrigger>
              <TabsTrigger value="facturas">Historial de facturas</TabsTrigger>
            </TabsList>

            <TabsContent value="proveedores">
              {/* Filtros */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Filtros de proveedores</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las categorías</SelectItem>
                        <SelectItem value="SERVICIOS">Servicios</SelectItem>
                        <SelectItem value="PRODUCTOS">Productos</SelectItem>
                        <SelectItem value="MANTENIMIENTO">Mantenimiento</SelectItem>
                        <SelectItem value="TECNOLOGIA">Tecnología</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => setSelectedCategory("all")}>
                      Limpiar filtros
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Proveedores registrados ({filteredProveedores.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredProveedores.map((proveedor) => (
                      <div key={proveedor.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Building className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{proveedor.nombre_empresa}</h3>
                              {getCategoryBadge(proveedor.categoria)}
                              <Badge variant={proveedor.activo ? "default" : "secondary"}>
                                {proveedor.activo ? "Activo" : "Inactivo"}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600">Contacto: {proveedor.contacto}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {proveedor.telefono}
                              </span>
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {proveedor.whatsapp}
                              </span>
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {proveedor.correo}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{proveedor.total_facturas} facturas</div>
                          {proveedor.monto_pendiente > 0 && (
                            <div className="text-sm text-red-600">
                              Pendiente: ${proveedor.monto_pendiente.toLocaleString()}
                            </div>
                          )}
                          <div className="flex gap-1 mt-2">
                            <Button size="sm" variant="outline">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Phone className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Mail className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="facturas">
              <Card>
                <CardHeader>
                  <CardTitle>Historial de facturas de proveedores</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {facturas.map((factura) => (
                      <div key={factura.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{factura.folio}</h3>
                            {getEstadoFacturaBadge(factura.estado)}
                          </div>
                          <p className="text-sm text-slate-600">{factura.proveedor}</p>
                          <p className="text-sm text-slate-500">{factura.descripcion}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                            <span>Emisión: {factura.fecha_emision}</span>
                            <span>Vencimiento: {factura.fecha_vencimiento}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">${factura.total.toLocaleString()}</div>
                          <div className="text-xs text-slate-500">
                            Subtotal: ${factura.monto.toLocaleString()} + IVA: ${factura.iva.toLocaleString()}
                          </div>
                          <div className="flex gap-1 mt-2">
                            <Button size="sm" variant="outline">
                              <Eye className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <FileText className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}