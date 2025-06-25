import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Package, Plus, Edit, Trash2, DollarSign, ShoppingCart } from "lucide-react";

export default function CatalogoProductos() {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Catálogo de productos demo
  const productos = [
    {
      id: 1,
      codigo: "COL-2025",
      nombre: "Colegiatura Mensual",
      descripcion: "Pago mensual de colegiatura para servicios educativos",
      precio_unitario_centavos: 500000, // $5,000 MXN
      categoria: "COLEGIATURAS",
      unidad_medida: "SERVICIO",
      clave_sat: "80101500", // Servicios de educación básica
      activo: true,
      seccion_academica: "GENERAL"
    },
    {
      id: 2,
      codigo: "INS-2025",
      nombre: "Inscripción Anual",
      descripcion: "Pago único anual por inscripción al ciclo escolar",
      precio_unitario_centavos: 300000, // $3,000 MXN
      categoria: "INSCRIPCIONES",
      unidad_medida: "SERVICIO",
      clave_sat: "80101500",
      activo: true,
      seccion_academica: "GENERAL"
    },
    {
      id: 3,
      codigo: "SEG-ESC-2025",
      nombre: "Seguro Escolar",
      descripcion: "Seguro contra accidentes escolares para estudiantes",
      precio_unitario_centavos: 80000, // $800 MXN
      categoria: "SEGURO_ESCOLAR",
      unidad_medida: "SERVICIO",
      clave_sat: "52121600", // Servicios de seguros
      activo: true,
      seccion_academica: "GENERAL"
    },
    {
      id: 4,
      codigo: "LIB-PRIM-2025",
      nombre: "Paquete de Libros Primaria",
      descripcion: "Set completo de libros de texto para nivel primaria",
      precio_unitario_centavos: 150000, // $1,500 MXN
      categoria: "LIBROS",
      unidad_medida: "LOTE",
      clave_sat: "49111500", // Libros escolares
      activo: true,
      seccion_academica: "PRIMARIA"
    },
    {
      id: 5,
      codigo: "LIB-SEC-2025",
      nombre: "Paquete de Libros Secundaria",
      descripcion: "Set completo de libros de texto para nivel secundaria",
      precio_unitario_centavos: 200000, // $2,000 MXN
      categoria: "LIBROS",
      unidad_medida: "LOTE",
      clave_sat: "49111500",
      activo: true,
      seccion_academica: "SECUNDARIA"
    },
    {
      id: 6,
      codigo: "UNI-KINDER",
      nombre: "Uniforme Kinder",
      descripcion: "Uniforme completo para estudiantes de kinder",
      precio_unitario_centavos: 120000, // $1,200 MXN
      categoria: "OTROS",
      unidad_medida: "PIEZA",
      clave_sat: "53101800", // Uniformes escolares
      activo: true,
      seccion_academica: "KINDER"
    },
    {
      id: 7,
      codigo: "EXCUR-2025",
      nombre: "Excursión Educativa",
      descripcion: "Viaje educativo y recreativo para estudiantes",
      precio_unitario_centavos: 100000, // $1,000 MXN
      categoria: "OTROS",
      unidad_medida: "SERVICIO",
      clave_sat: "80101500",
      activo: true,
      seccion_academica: "GENERAL"
    },
    {
      id: 8,
      codigo: "COL-BACH-2025",
      nombre: "Colegiatura Bachillerato",
      descripcion: "Pago mensual de colegiatura para nivel bachillerato",
      precio_unitario_centavos: 700000, // $7,000 MXN
      categoria: "COLEGIATURAS", 
      unidad_medida: "SERVICIO",
      clave_sat: "80101500",
      activo: true,
      seccion_academica: "BACHILLERATO"
    },
    {
      id: 9,
      codigo: "REINS-2025",
      nombre: "Reinscripción Anual",
      descripcion: "Pago de reinscripción para estudiantes ya registrados en ciclos anteriores",
      precio_unitario_centavos: 350000, // $3,500 MXN
      categoria: "INSCRIPCIONES",
      unidad_medida: "SERVICIO",
      clave_sat: "80101500",
      activo: true,
      seccion_academica: "GENERAL"
    }
  ];

  const filteredProductos = selectedCategory === "all" 
    ? productos 
    : productos.filter(p => p.categoria === selectedCategory);

  const estadisticas = {
    totalProductos: productos.length,
    productosActivos: productos.filter(p => p.activo).length,
    colegiaturas: productos.filter(p => p.categoria === "COLEGIATURAS").length,
    inscripciones: productos.filter(p => p.categoria === "INSCRIPCIONES").length
  };

  const getCategoryBadge = (categoria: string) => {
    const colors = {
      COLEGIATURAS: "bg-blue-100 text-blue-800",
      INSCRIPCIONES: "bg-green-100 text-green-800",
      SEGURO_ESCOLAR: "bg-purple-100 text-purple-800",
      LIBROS: "bg-orange-100 text-orange-800",
      OTROS: "bg-gray-100 text-gray-800"
    };
    
    return (
      <Badge className={colors[categoria as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {categoria.replace('_', ' ')}
      </Badge>
    );
  };

  const handleToggleActive = async (productId: number, currentStatus: boolean) => {
    try {
      toast({
        title: currentStatus ? "Producto deshabilitado" : "Producto habilitado",
        description: `El producto ha sido ${currentStatus ? "deshabilitado" : "habilitado"} correctamente.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del producto.",
        variant: "destructive",
      });
    }
  };

  return (
    <div >
      <div >
        
        <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Catálogo de Productos</h1>
          <p className="text-slate-600">Gestiona colegiaturas, inscripciones, seguros, libros y otros productos</p>
            </div>
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
              <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Producto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Crear nuevo producto</DialogTitle>
                </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div>
                    <Label>Código del producto</Label>
                    <Input placeholder="PROD-2025" />
                  </div>
              <div>
                    <Label>Nombre del producto</Label>
                    <Input placeholder="Nombre descriptivo" />
                  </div>
              <div className="md:col-span-2">
                    <Label>Descripción</Label>
                    <Textarea placeholder="Descripción detallada del producto..." />
                  </div>
              <div>
                    <Label>Precio unitario (MXN)</Label>
                    <Input type="number" placeholder="5000" />
                  </div>
              <div>
                    <Label>Categoría</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COLEGIATURAS">Colegiaturas</SelectItem>
                        <SelectItem value="INSCRIPCIONES">Inscripciones</SelectItem>
                        <SelectItem value="SEGURO_ESCOLAR">Seguro Escolar</SelectItem>
                        <SelectItem value="LIBROS">Libros</SelectItem>
                        <SelectItem value="OTROS">Otros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
              <div>
                    <Label>Unidad de medida</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar unidad..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SERVICIO">Servicio</SelectItem>
                        <SelectItem value="PIEZA">Pieza</SelectItem>
                        <SelectItem value="LOTE">Lote</SelectItem>
                        <SelectItem value="KILOGRAMO">Kilogramo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
              <div>
                    <Label>Clave SAT</Label>
                    <Input placeholder="80101500" />
                  </div>
              <div>
                    <Label>Sección académica</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar sección..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GENERAL">General</SelectItem>
                        <SelectItem value="KINDER">Kinder</SelectItem>
                        <SelectItem value="PRIMARIA">Primaria</SelectItem>
                        <SelectItem value="SECUNDARIA">Secundaria</SelectItem>
                        <SelectItem value="BACHILLERATO">Bachillerato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
              <div className="flex items-center space-x-2">
                    <Switch id="active" defaultChecked />
                    <Label htmlFor="active">Producto activo</Label>
                  </div>
                </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancelar
                  </Button>
              <Button className="bg-blue-600 hover:bg-blue-700">
                    Crear Producto
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Package className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.totalProductos}</div>
            <div className="text-sm text-slate-600">Total productos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <ShoppingCart className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.productosActivos}</div>
            <div className="text-sm text-slate-600">Productos activos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <DollarSign className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.colegiaturas}</div>
            <div className="text-sm text-slate-600">Colegiaturas</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{estadisticas.inscripciones}</div>
            <div className="text-sm text-slate-600">Inscripciones</div>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filtros de productos</CardTitle>
            </CardHeader>
            <CardContent>
          <div className="flex gap-4">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    <SelectItem value="COLEGIATURAS">Colegiaturas</SelectItem>
                    <SelectItem value="INSCRIPCIONES">Inscripciones</SelectItem>
                    <SelectItem value="SEGURO_ESCOLAR">Seguro Escolar</SelectItem>
                    <SelectItem value="LIBROS">Libros</SelectItem>
                    <SelectItem value="OTROS">Otros</SelectItem>
                  </SelectContent>
                </Select>
            <Button variant="outline" onClick={() => setSelectedCategory("all")}>
                  Limpiar filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Lista de productos */}
          <Card>
            <CardHeader>
              <CardTitle>Catálogo de productos ({filteredProductos.length})</CardTitle>
            </CardHeader>
            <CardContent>
          <div className="space-y-4">
                {filteredProductos.map((producto) => (
              <div key={producto.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Package className="w-6 h-6 text-blue-600" />
                      </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{producto.nombre}</h3>
                          {getCategoryBadge(producto.categoria)}
                          <Badge variant="outline" className="text-xs">
                            {producto.seccion_academica}
                          </Badge>
                        </div>
                    <p className="text-sm text-slate-600">{producto.descripcion}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                          <span>Código: {producto.codigo}</span>
                          <span>Unidad: {producto.unidad_medida}</span>
                          <span>Clave SAT: {producto.clave_sat}</span>
                        </div>
                      </div>
                    </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="text-lg font-bold">${(producto.precio_unitario_centavos / 100).toLocaleString()}</div>
                        <Badge variant={producto.activo ? "default" : "secondary"}>
                          {producto.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                  <div className="flex items-center gap-2">
                        <Switch 
                          checked={producto.activo}
                          onCheckedChange={() => handleToggleActive(producto.id, producto.activo)}
                        />
                    <Button size="sm" variant="outline" onClick={() => setEditingProduct(producto)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                    <Button size="sm" variant="outline">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}