import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Package, Plus, Edit, Trash2, DollarSign, ShoppingCart, AlertTriangle } from "lucide-react";

export default function CatalogoProductos() {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [selectedNivel, setSelectedNivel] = useState("TODOS");

  // Catálogo de productos demo con precios por nivel académico
  const [productos, setProductos] = useState([
    { 
      id: 1, 
      codigo: "COL-2025", 
      nombre: "Colegiatura Mensual", 
      descripcion: "Pago mensual de colegiatura para servicios educativos", 
      categoria: "COLEGIATURAS", 
      unidad_medida: "SERVICIO", 
      clave_sat: "80101500", 
      activo: true,
      precios_por_nivel: {
        KINDER: 350000,
        PRIMARIA: 450000,
        SECUNDARIA: 550000,
        BACHILLERATO: 650000
      }
    },
    { 
      id: 2, 
      codigo: "INS-2025", 
      nombre: "Inscripción Anual", 
      descripcion: "Pago único anual por inscripción al ciclo escolar", 
      categoria: "INSCRIPCIONES", 
      unidad_medida: "SERVICIO", 
      clave_sat: "80101500", 
      activo: true,
      precios_por_nivel: {
        KINDER: 250000,
        PRIMARIA: 300000,
        SECUNDARIA: 350000,
        BACHILLERATO: 400000
      }
    },
    { 
      id: 3, 
      codigo: "REINS-2025", 
      nombre: "Reinscripción", 
      descripcion: "Proceso de reinscripción para ciclo escolar siguiente", 
      categoria: "REINSCRIPCIONES", 
      unidad_medida: "SERVICIO", 
      clave_sat: "80101500", 
      activo: true,
      precios_por_nivel: {
        KINDER: 150000,
        PRIMARIA: 180000,
        SECUNDARIA: 220000,
        BACHILLERATO: 280000
      }
    },
    { 
      id: 4, 
      codigo: "SEG-ESC-2025", 
      nombre: "Seguro Escolar", 
      descripcion: "Seguro contra accidentes escolares para estudiantes", 
      categoria: "SEGURO_ESCOLAR", 
      unidad_medida: "SERVICIO", 
      clave_sat: "52121600", 
      activo: true,
      precios_por_nivel: {
        KINDER: 60000,
        PRIMARIA: 70000,
        SECUNDARIA: 80000,
        BACHILLERATO: 90000
      }
    },
    { 
      id: 5, 
      codigo: "LIB-2025", 
      nombre: "Paquete de Libros", 
      descripcion: "Set completo de libros de texto por nivel académico", 
      categoria: "LIBROS", 
      unidad_medida: "LOTE", 
      clave_sat: "49111500", 
      activo: true,
      precios_por_nivel: {
        KINDER: 80000,
        PRIMARIA: 120000,
        SECUNDARIA: 180000,
        BACHILLERATO: 250000
      }
    },
    { 
      id: 6, 
      codigo: "UNI-2025", 
      nombre: "Uniforme Escolar", 
      descripcion: "Uniforme completo oficial de la institución", 
      categoria: "OTROS", 
      unidad_medida: "PIEZA", 
      clave_sat: "53101800", 
      activo: true,
      precios_por_nivel: {
        KINDER: 95000,
        PRIMARIA: 110000,
        SECUNDARIA: 125000,
        BACHILLERATO: 140000
      }
    }
  ]);

  const filteredProductos = selectedCategory === "all" 
    ? productos 
    : productos.filter(p => p.categoria === selectedCategory);

  const estadisticas = {
    totalProductos: productos.length,
    productosActivos: productos.filter(p => p.activo).length,
    colegiaturas: productos.filter(p => p.categoria === "COLEGIATURAS").length,
    inscripciones: productos.filter(p => p.categoria === "INSCRIPCIONES").length,
    reinscripciones: productos.filter(p => p.categoria === "REINSCRIPCIONES").length
  };

  const getCategoryBadge = (categoria: string) => {
    const colors = {
      COLEGIATURAS: "bg-blue-100 text-blue-800",
      INSCRIPCIONES: "bg-green-100 text-green-800",
      REINSCRIPCIONES: "bg-teal-100 text-teal-800",
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
      // Aquí se haría la llamada real a la API
      // await apiRequest(`/api/products/${productId}`, {
      //   method: 'PATCH',
      //   body: { activo: !currentStatus }
      // });
      
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

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingProduct(null);
  };

  const handleSaveProduct = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    const codigo = formData.get('codigo') as string;
    const nombre = formData.get('nombre') as string;
    const descripcion = formData.get('descripcion') as string;
    const categoria = formData.get('categoria') as string;
    const unidad_medida = formData.get('unidad_medida') as string;
    const clave_sat = formData.get('clave_sat') as string;
    const activo = formData.get('activo') === 'on';
    
    const precioKinder = parseFloat((document.getElementById('precio-kinder') as HTMLInputElement)?.value || '0') * 100;
    const precioPrimaria = parseFloat((document.getElementById('precio-primaria') as HTMLInputElement)?.value || '0') * 100;
    const precioSecundaria = parseFloat((document.getElementById('precio-secundaria') as HTMLInputElement)?.value || '0') * 100;
    const precioBachillerato = parseFloat((document.getElementById('precio-bachillerato') as HTMLInputElement)?.value || '0') * 100;

    const productData = {
      id: editingProduct ? editingProduct.id : Date.now(),
      codigo,
      nombre,
      descripcion,
      categoria,
      unidad_medida,
      clave_sat,
      activo,
      precios_por_nivel: {
        KINDER: precioKinder,
        PRIMARIA: precioPrimaria,
        SECUNDARIA: precioSecundaria,
        BACHILLERATO: precioBachillerato
      }
    };

    if (editingProduct) {
      setProductos(prev => prev.map(p => p.id === editingProduct.id ? productData : p));
      toast({
        title: "Producto actualizado",
        description: `${nombre} ha sido actualizado con precios diferenciados por nivel académico.`
      });
    } else {
      setProductos(prev => [...prev, productData]);
      toast({
        title: "Producto creado",
        description: `${nombre} ha sido agregado al catálogo con precios por nivel académico.`
      });
    }

    handleCloseModal();
  };

  const handleDeleteProduct = (productId: number, productName: string) => {
    const product = productos.find(p => p.id === productId);
    if (product) {
      setProductToDelete(product);
      setShowDeleteModal(true);
    }
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;
    
    try {
      // Aquí se haría la llamada real a la API
      // await apiRequest(`/api/products/${productToDelete.id}`, {
      //   method: 'DELETE'
      // });
      
      toast({
        title: "Producto eliminado",
        description: `El producto "${productToDelete.nombre}" ha sido eliminado permanentemente del sistema.`,
      });
      
      setShowDeleteModal(false);
      setProductToDelete(null);
    } catch (error) {
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar el producto. Intenta nuevamente.",
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
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => { setEditingProduct(null); setShowAddModal(true); }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Producto
            </Button>
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
                <DollarSign className="w-8 h-8 text-teal-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.reinscripciones}</div>
            <div className="text-sm text-slate-600">Reinscripciones</div>
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
                    <SelectItem value="REINSCRIPCIONES">Reinscripciones</SelectItem>
                    <SelectItem value="SEGURO_ESCOLAR">Seguro Escolar</SelectItem>
                    <SelectItem value="LIBROS">Libros</SelectItem>
                    <SelectItem value="OTROS">Otros</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={selectedNivel} onValueChange={setSelectedNivel}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos los niveles</SelectItem>
                    <SelectItem value="KINDER">Solo Kinder</SelectItem>
                    <SelectItem value="PRIMARIA">Solo Primaria</SelectItem>
                    <SelectItem value="SECUNDARIA">Solo Secundaria</SelectItem>
                    <SelectItem value="BACHILLERATO">Solo Bachillerato</SelectItem>
                  </SelectContent>
                </Select>
                
            <Button variant="outline" onClick={() => {
              setSelectedCategory("all");
              setSelectedNivel("TODOS");
            }}>
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
                    {selectedNivel === "TODOS" ? (
                      <>
                        <div className="text-sm font-semibold text-slate-700 mb-1">Precios por nivel:</div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Kinder:</span>
                            <span className="font-medium">${(producto.precios_por_nivel.KINDER / 100).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Primaria:</span>
                            <span className="font-medium">${(producto.precios_por_nivel.PRIMARIA / 100).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Secundaria:</span>
                            <span className="font-medium">${(producto.precios_por_nivel.SECUNDARIA / 100).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Bachillerato:</span>
                            <span className="font-medium">${(producto.precios_por_nivel.BACHILLERATO / 100).toLocaleString()}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-slate-700 mb-1">Precio para {selectedNivel}:</div>
                        <div className="text-2xl font-bold text-blue-600">
                          ${(producto.precios_por_nivel[selectedNivel as keyof typeof producto.precios_por_nivel] / 100).toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500">MXN</div>
                      </>
                    )}
                        <Badge variant={producto.activo ? "default" : "secondary"}>
                          {producto.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                  <div className="flex items-center gap-2">
                        <Switch 
                          checked={producto.activo}
                          onCheckedChange={() => handleToggleActive(producto.id, producto.activo)}
                        />
                    <Button size="sm" variant="outline" onClick={() => handleEditProduct(producto)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleDeleteProduct(producto.id, producto.nombre)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300"
                    >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Modal de confirmación de eliminación */}
          <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-red-600">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  Advertencia de Eliminación
                </DialogTitle>
                <DialogDescription>
                  Confirma la eliminación permanente del producto del catálogo
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                <p className="text-sm text-slate-600 mb-4">
                  ¿Estás completamente seguro de que deseas eliminar el producto{" "}
                  <strong className="text-slate-900">"{productToDelete?.nombre}"</strong>?
                </p>
                
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-sm font-medium text-red-800 mb-2">
                    Esta acción NO se puede deshacer y eliminará:
                  </p>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• El producto del catálogo</li>
                    <li>• Todos los registros asociados</li>
                    <li>• Historial de ventas relacionado</li>
                  </ul>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowDeleteModal(false);
                    setProductToDelete(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={confirmDelete}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar Producto
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Modal crear / editar producto ───────────────── */}
          <Dialog open={showAddModal} onOpenChange={(open) => { if (!open) handleCloseModal(); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Editar producto' : 'Crear nuevo producto'}</DialogTitle>
                <DialogDescription>
                  {editingProduct
                    ? 'Modifica los datos del producto y los precios por nivel académico.'
                    : 'Completa la información para agregar un nuevo producto al catálogo.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSaveProduct} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                  <div>
                    <Label>Código del producto</Label>
                    <Input
                      name="codigo"
                      placeholder="PROD-2025"
                      defaultValue={editingProduct?.codigo || ''}
                    />
                  </div>
                  <div>
                    <Label>Nombre del producto</Label>
                    <Input
                      name="nombre"
                      placeholder="Nombre descriptivo"
                      defaultValue={editingProduct?.nombre || ''}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Descripción</Label>
                    <Textarea
                      name="descripcion"
                      placeholder="Descripción detallada del producto..."
                      defaultValue={editingProduct?.descripcion || ''}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-base font-semibold">Precios por Nivel Académico (MXN)</Label>
                    <div className="grid grid-cols-2 gap-4 mt-2 p-4 bg-slate-50 rounded-lg">
                      <div>
                        <Label htmlFor="precio-kinder">Kinder</Label>
                        <Input
                          id="precio-kinder"
                          type="number"
                          placeholder="0.00"
                          step="0.01"
                          defaultValue={editingProduct ? (editingProduct.precios_por_nivel?.KINDER / 100).toString() : ''}
                        />
                      </div>
                      <div>
                        <Label htmlFor="precio-primaria">Primaria</Label>
                        <Input
                          id="precio-primaria"
                          type="number"
                          placeholder="0.00"
                          step="0.01"
                          defaultValue={editingProduct ? (editingProduct.precios_por_nivel?.PRIMARIA / 100).toString() : ''}
                        />
                      </div>
                      <div>
                        <Label htmlFor="precio-secundaria">Secundaria</Label>
                        <Input
                          id="precio-secundaria"
                          type="number"
                          placeholder="0.00"
                          step="0.01"
                          defaultValue={editingProduct ? (editingProduct.precios_por_nivel?.SECUNDARIA / 100).toString() : ''}
                        />
                      </div>
                      <div>
                        <Label htmlFor="precio-bachillerato">Bachillerato</Label>
                        <Input
                          id="precio-bachillerato"
                          type="number"
                          placeholder="0.00"
                          step="0.01"
                          defaultValue={editingProduct ? (editingProduct.precios_por_nivel?.BACHILLERATO / 100).toString() : ''}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Configure el precio específico para cada nivel académico</p>
                  </div>
                  <div>
                    <Label>Categoría</Label>
                    <Select name="categoria" defaultValue={editingProduct?.categoria || ""}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COLEGIATURAS">Colegiaturas</SelectItem>
                        <SelectItem value="INSCRIPCIONES">Inscripciones</SelectItem>
                        <SelectItem value="REINSCRIPCIONES">Reinscripciones</SelectItem>
                        <SelectItem value="SEGURO_ESCOLAR">Seguro Escolar</SelectItem>
                        <SelectItem value="LIBROS">Libros</SelectItem>
                        <SelectItem value="OTROS">Otros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Unidad de medida</Label>
                    <Select name="unidad_medida" defaultValue={editingProduct?.unidad_medida || ""}>
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
                    <Input
                      name="clave_sat"
                      placeholder="80101500"
                      defaultValue={editingProduct?.clave_sat || ''}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      name="activo"
                      id="active"
                      defaultChecked={editingProduct ? editingProduct.activo : true}
                    />
                    <Label htmlFor="active">Producto activo</Label>
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={handleCloseModal}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    {editingProduct ? 'Actualizar Producto' : 'Crear Producto'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </div>
  );
}