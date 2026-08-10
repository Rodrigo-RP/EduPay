/**
 * Catálogo de Productos (CF-22)
 *
 * Dominio distinto de `concepts`:
 *  - Precios diferenciados por nivel académico (KINDER / PRIMARIA / SECUNDARIA / BACHILLERATO)
 *  - Metadata fiscal SAT: clave_sat + unidad_medida (para CFDI)
 *  - Toggle activo/inactivo
 *
 * Backend: /api/products  (CRUD completo, guard MODULES.CONCEPTS)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Package, Plus, Edit, Trash2, DollarSign, ShoppingCart, AlertTriangle, Loader2 } from "lucide-react";

// ── tipos ────────────────────────────────────────────────────────────────────
interface Product {
  id: number;
  campus_id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  unidad_medida: string;
  clave_sat: string | null;
  activo: boolean;
  precio_kinder:       number;
  precio_primaria:     number;
  precio_secundaria:   number;
  precio_bachillerato: number;
}

// ── helpers de fetch ─────────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function fetchProducts(): Promise<Product[]> {
  const r = await fetch("/api/products", { headers: authHeaders() });
  if (!r.ok) throw new Error("No se pudo cargar el catálogo");
  return r.json();
}

// ── componente ───────────────────────────────────────────────────────────────
export default function CatalogoProductos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal]         = useState(false);
  const [editingProduct, setEditingProduct]     = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showDeleteModal, setShowDeleteModal]   = useState(false);
  const [productToDelete, setProductToDelete]   = useState<Product | null>(null);
  const [selectedNivel, setSelectedNivel]       = useState("TODOS");

  // ── queries / mutations ──────────────────────────────────────────────────
  const { data: productos = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });

  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const r = await fetch("/api/products", { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).message || "Error al crear producto");
      }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: object }) => {
      const r = await fetch(`/api/products/${id}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).message || "Error al actualizar producto");
      }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, activo }: { id: number; activo: boolean }) => {
      const r = await fetch(`/api/products/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ activo }) });
      if (!r.ok) throw new Error("Error al cambiar estado");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/products/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!r.ok) throw new Error("Error al eliminar producto");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["products"] }); },
  });

  // ── handlers ─────────────────────────────────────────────────────────────
  const handleToggleActive = async (product: Product) => {
    try {
      await toggleMutation.mutateAsync({ id: product.id, activo: !product.activo });
      toast({
        title: product.activo ? "Producto deshabilitado" : "Producto habilitado",
        description: `${product.nombre} ha sido ${product.activo ? "deshabilitado" : "habilitado"} correctamente.`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingProduct(null);
  };

  const handleSaveProduct = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const precioKinder       = parseFloat((document.getElementById("precio-kinder")       as HTMLInputElement)?.value || "0") * 100;
    const precioPrimaria     = parseFloat((document.getElementById("precio-primaria")     as HTMLInputElement)?.value || "0") * 100;
    const precioSecundaria   = parseFloat((document.getElementById("precio-secundaria")   as HTMLInputElement)?.value || "0") * 100;
    const precioBachillerato = parseFloat((document.getElementById("precio-bachillerato") as HTMLInputElement)?.value || "0") * 100;

    const payload = {
      codigo:              formData.get("codigo")        as string,
      nombre:              formData.get("nombre")        as string,
      descripcion:         formData.get("descripcion")   as string,
      categoria:           formData.get("categoria")     as string,
      unidad_medida:       formData.get("unidad_medida") as string,
      clave_sat:           formData.get("clave_sat")     as string,
      activo:              formData.get("activo") === "on",
      precio_kinder:       Math.round(precioKinder),
      precio_primaria:     Math.round(precioPrimaria),
      precio_secundaria:   Math.round(precioSecundaria),
      precio_bachillerato: Math.round(precioBachillerato),
    };

    try {
      if (editingProduct) {
        await updateMutation.mutateAsync({ id: editingProduct.id, body: payload });
        toast({ title: "Producto actualizado", description: `${payload.nombre} ha sido actualizado con precios por nivel académico.` });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: "Producto creado", description: `${payload.nombre} ha sido agregado al catálogo.` });
      }
      handleCloseModal();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteProduct = (product: Product) => {
    setProductToDelete(product);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;
    try {
      await deleteMutation.mutateAsync(productToDelete.id);
      toast({ title: "Producto eliminado", description: `"${productToDelete.nombre}" ha sido eliminado permanentemente.` });
      setShowDeleteModal(false);
      setProductToDelete(null);
    } catch (e: any) {
      toast({ title: "Error al eliminar", description: e.message, variant: "destructive" });
    }
  };

  // ── render helpers ────────────────────────────────────────────────────────
  const filteredProductos = selectedCategory === "all"
    ? productos
    : productos.filter(p => p.categoria === selectedCategory);

  const estadisticas = {
    totalProductos:   productos.length,
    productosActivos: productos.filter(p => p.activo).length,
    colegiaturas:     productos.filter(p => p.categoria === "COLEGIATURAS").length,
    reinscripciones:  productos.filter(p => p.categoria === "REINSCRIPCIONES").length,
  };

  const getCategoryBadge = (categoria: string) => {
    const colors: Record<string, string> = {
      COLEGIATURAS:   "bg-blue-100   text-blue-800",
      INSCRIPCIONES:  "bg-green-100  text-green-800",
      REINSCRIPCIONES:"bg-teal-100   text-teal-800",
      SEGURO_ESCOLAR: "bg-purple-100 text-purple-800",
      LIBROS:         "bg-orange-100 text-orange-800",
      OTROS:          "bg-gray-100   text-gray-800",
    };
    return (
      <Badge className={colors[categoria] ?? "bg-gray-100 text-gray-800"}>
        {categoria.replace("_", " ")}
      </Badge>
    );
  };

  const precioNivel = (p: Product) => {
    const map: Record<string, number> = {
      KINDER:       p.precio_kinder,
      PRIMARIA:     p.precio_primaria,
      SECUNDARIA:   p.precio_secundaria,
      BACHILLERATO: p.precio_bachillerato,
    };
    return map[selectedNivel] ?? 0;
  };

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Catálogo de Productos</h1>
            <p className="text-slate-600">Gestiona colegiaturas, inscripciones, seguros, libros y otros productos</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => { setEditingProduct(null); setShowAddModal(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Producto
          </Button>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[
            { icon: Package,      color: "blue",   value: estadisticas.totalProductos,   label: "Total productos" },
            { icon: ShoppingCart, color: "green",  value: estadisticas.productosActivos, label: "Productos activos" },
            { icon: DollarSign,   color: "purple", value: estadisticas.colegiaturas,     label: "Colegiaturas" },
            { icon: DollarSign,   color: "teal",   value: estadisticas.reinscripciones,  label: "Reinscripciones" },
          ].map(({ icon: Icon, color, value, label }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <Icon className={`w-8 h-8 text-${color}-600 mx-auto mb-2`} />
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-sm text-slate-600">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader><CardTitle>Filtros de productos</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos los niveles</SelectItem>
                  <SelectItem value="KINDER">Solo Kinder</SelectItem>
                  <SelectItem value="PRIMARIA">Solo Primaria</SelectItem>
                  <SelectItem value="SECUNDARIA">Solo Secundaria</SelectItem>
                  <SelectItem value="BACHILLERATO">Solo Bachillerato</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={() => { setSelectedCategory("all"); setSelectedNivel("TODOS"); }}>
                Limpiar filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card>
          <CardHeader>
            <CardTitle>
              {isLoading
                ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando catálogo…</span>
                : `Catálogo de productos (${filteredProductos.length})`}
            </CardTitle>
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
                        {producto.clave_sat && <span>Clave SAT: {producto.clave_sat}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      {selectedNivel === "TODOS" ? (
                        <>
                          <div className="text-sm font-semibold text-slate-700 mb-1">Precios por nivel:</div>
                          <div className="space-y-1 text-xs">
                            {(["KINDER","PRIMARIA","SECUNDARIA","BACHILLERATO"] as const).map(nivel => {
                              const cKey = `precio_${nivel.toLowerCase()}` as keyof Product;
                              return (
                                <div key={nivel} className="flex justify-between gap-3">
                                  <span className="text-slate-600">{nivel.charAt(0)+nivel.slice(1).toLowerCase()}:</span>
                                  <span className="font-medium">${((producto[cKey] as number) / 100).toLocaleString()}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-slate-700 mb-1">Precio para {selectedNivel}:</div>
                          <div className="text-2xl font-bold text-blue-600">
                            ${(precioNivel(producto) / 100).toLocaleString()}
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
                        onCheckedChange={() => handleToggleActive(producto)}
                        disabled={toggleMutation.isPending}
                      />
                      <Button size="sm" variant="outline" onClick={() => handleEditProduct(producto)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteProduct(producto)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {!isLoading && filteredProductos.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No hay productos en este catálogo</p>
                  <p className="text-sm mt-1">Agrega el primer producto con el botón "Agregar Producto"</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Modal eliminar */}
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
                <p className="text-sm font-medium text-red-800 mb-2">Esta acción NO se puede deshacer y eliminará:</p>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• El producto del catálogo</li>
                  <li>• Los precios por nivel configurados</li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => { setShowDeleteModal(false); setProductToDelete(null); }}>
                Cancelar
              </Button>
              <Button
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  : <Trash2 className="w-4 h-4 mr-2" />}
                Eliminar Producto
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal crear / editar */}
        <Dialog open={showAddModal} onOpenChange={(open) => { if (!open) handleCloseModal(); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? "Editar producto" : "Crear nuevo producto"}</DialogTitle>
              <DialogDescription>
                {editingProduct
                  ? "Modifica los datos del producto y los precios por nivel académico."
                  : "Completa la información para agregar un nuevo producto al catálogo."}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                <div>
                  <Label>Código del producto *</Label>
                  <Input name="codigo" placeholder="PROD-2025" required defaultValue={editingProduct?.codigo ?? ""} />
                </div>
                <div>
                  <Label>Nombre del producto *</Label>
                  <Input name="nombre" placeholder="Nombre descriptivo" required defaultValue={editingProduct?.nombre ?? ""} />
                </div>
                <div className="md:col-span-2">
                  <Label>Descripción</Label>
                  <Textarea name="descripcion" placeholder="Descripción detallada del producto…" defaultValue={editingProduct?.descripcion ?? ""} />
                </div>

                <div className="md:col-span-2">
                  <Label className="text-base font-semibold">Precios por Nivel Académico (MXN)</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2 p-4 bg-slate-50 rounded-lg">
                    {(["kinder","primaria","secundaria","bachillerato"] as const).map((nivel) => {
                      const key = `precio_${nivel}` as keyof Product;
                      return (
                        <div key={nivel}>
                          <Label htmlFor={`precio-${nivel}`}>{nivel.charAt(0).toUpperCase()+nivel.slice(1)}</Label>
                          <Input
                            id={`precio-${nivel}`}
                            type="number"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            defaultValue={editingProduct ? ((editingProduct[key] as number) / 100).toString() : ""}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Configure el precio específico para cada nivel académico</p>
                </div>

                <div>
                  <Label>Categoría *</Label>
                  <Select name="categoria" defaultValue={editingProduct?.categoria ?? ""} required>
                    <SelectTrigger><SelectValue placeholder="Seleccionar categoría…" /></SelectTrigger>
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
                  <Select name="unidad_medida" defaultValue={editingProduct?.unidad_medida ?? "SERVICIO"}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar unidad…" /></SelectTrigger>
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
                  <Input name="clave_sat" placeholder="80101500" defaultValue={editingProduct?.clave_sat ?? ""} />
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Switch name="activo" id="active" defaultChecked={editingProduct ? editingProduct.activo : true} />
                  <Label htmlFor="active">Producto activo</Label>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={handleCloseModal}>Cancelar</Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending)
                    ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    : null}
                  {editingProduct ? "Actualizar Producto" : "Crear Producto"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
