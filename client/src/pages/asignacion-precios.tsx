import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAcademicLevel, NIVEL_NAMES } from "@/../../shared/academic-levels";
import { Package, Users, DollarSign, CheckCircle, ArrowRight } from "lucide-react";

type CatalogProduct = {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  activo: boolean;
  precio_kinder: number | string;
  precio_primaria: number | string;
  precio_secundaria: number | string;
  precio_bachillerato: number | string;
};

type Student = {
  id: number;
  nombre_completo: string;
  grado: string;
  grupo: string | null;
  status: string;
};

const priceForLevel = (product: CatalogProduct, level: string) => {
  const priceKey: Record<string, keyof CatalogProduct> = {
    KINDER: "precio_kinder",
    PRIMARIA: "precio_primaria",
    SECUNDARIA: "precio_secundaria",
    BACHILLERATO: "precio_bachillerato",
  };
  return Number(product[priceKey[level]] ?? 0);
};

const formatMoney = (amount: number) => new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
}).format(amount / 100);

const defaultDueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
};

export default function AsignacionPrecios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState("");
  const [showAssignment, setShowAssignment] = useState(false);
  const [fechaVencimiento, setFechaVencimiento] = useState(defaultDueDate);

  const productsQuery = useQuery<CatalogProduct[]>({
    queryKey: ["/api/products"],
    queryFn: async () => (await apiRequest("/api/products")).json(),
  });
  const studentsQuery = useQuery<Student[]>({
    queryKey: ["/api/admin/students"],
    queryFn: async () => (await apiRequest("/api/admin/students")).json(),
  });

  const productos = (productsQuery.data ?? []).filter((product) => product.activo);
  const estudiantes = (studentsQuery.data ?? []).filter((student) => student.status === "activo");

  const generateAssignments = () => {
    if (!selectedProduct) return;
    setShowAssignment(true);
  };

  const applyCharges = useMutation({
    mutationFn: async (data: { producto_id: number; fecha_vencimiento: string }) => {
      const response = await apiRequest("/api/admin/cargos/desde-catalogo", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: (response: any) => {
      toast({
        title: "Cargos aplicados correctamente",
        description: `Se generaron ${response.charges_created} cargos reales con precios por nivel académico`,
      });
      setShowAssignment(false);
      setSelectedProduct("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/charges"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error al aplicar cargos",
        description: error.message || "Ocurrió un error al crear los cargos",
        variant: "destructive"
      });
    }
  });

  const selectedProductData = productos.find(p => p.id.toString() === selectedProduct);
  const assignments = useMemo(() => {
    if (!selectedProductData) return [];
    return estudiantes.map((student) => {
      const level = getAcademicLevel(student.grado);
      return {
        ...student,
        level,
        price: priceForLevel(selectedProductData, level),
      };
    });
  }, [estudiantes, selectedProductData]);
  const assignmentsWithPrice = assignments.filter((assignment) => assignment.price > 0);
  const missingPriceAssignments = assignments.filter((assignment) => assignment.price <= 0);
  const summaryByLevel = assignmentsWithPrice.reduce((summary, assignment) => {
    const current = summary[assignment.level] ?? {
      count: 0,
      total: 0,
      levelName: NIVEL_NAMES[assignment.level as keyof typeof NIVEL_NAMES] ?? assignment.level,
    };
    current.count += 1;
    current.total += assignment.price;
    summary[assignment.level] = current;
    return summary;
  }, {} as Record<string, { count: number; total: number; levelName: string }>);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Asignación automática de precios por nivel académico
          </h1>
          <p className="text-slate-600">
            Selecciona un producto activo del catálogo para revisar y confirmar los cargos de alumnos activos de este campus.
          </p>
        </div>

        {/* Selección de producto */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              1. Seleccionar producto del catálogo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="catalog-product">Producto</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger id="catalog-product" data-testid="catalog-product-select">
                    <SelectValue placeholder="Seleccionar producto del catálogo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {productos.map(producto => (
                      <SelectItem key={producto.id} value={producto.id.toString()}>
                        {producto.codigo} - {producto.nombre} ({producto.categoria.replace('_', ' ')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="fecha-vencimiento">Fecha de vencimiento</Label>
                <Input
                  id="fecha-vencimiento"
                  type="date"
                  value={fechaVencimiento}
                  onChange={(event) => setFechaVencimiento(event.target.value)}
                />
              </div>
              <Button 
                onClick={generateAssignments}
                disabled={!selectedProduct || productsQuery.isLoading || studentsQuery.isLoading}
                className="flex items-center gap-2"
                data-testid="preview-price-assignment"
              >
                <ArrowRight className="w-4 h-4" />
                Generar asignaciones automáticas
              </Button>
            </div>
            {(productsQuery.isLoading || studentsQuery.isLoading) && (
              <p className="mt-3 text-sm text-slate-500">Cargando catálogo y alumnos del campus…</p>
            )}
            {(productsQuery.isError || studentsQuery.isError) && (
              <p className="mt-3 text-sm text-destructive">
                No fue posible cargar el catálogo o los alumnos. Intenta recargar la página.
              </p>
            )}
            {!productsQuery.isLoading && !productsQuery.isError && productos.length === 0 && (
              <p className="mt-3 text-sm text-slate-500">
                No hay productos activos en el catálogo. Crea o activa uno antes de asignar cargos.
              </p>
            )}

            {/* Mostrar precios del producto seleccionado */}
            {selectedProductData && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-3">
                  Precios configurados para: {selectedProductData.nombre}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {["KINDER", "PRIMARIA", "SECUNDARIA", "BACHILLERATO"].map((nivel) => {
                    const precio = priceForLevel(selectedProductData, nivel);
                    return (
                    <div key={nivel} className="text-center p-2 bg-white rounded">
                      <div className="text-sm font-medium">{NIVEL_NAMES[nivel as keyof typeof NIVEL_NAMES]}</div>
                      <div className="text-lg font-bold text-blue-600">
                        {formatMoney(precio)}
                      </div>
                      <div className="text-xs text-slate-500">por alumno</div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Asignaciones automáticas */}
        {showAssignment && selectedProductData && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                2. Asignaciones automáticas por nivel académico
              </CardTitle>
              <p className="text-sm text-slate-600 mt-2">
                El sistema asigna automáticamente el precio correcto basado en el grado de cada estudiante
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {assignments.map((estudiante) => {
                  
                  return (
                    <div key={estudiante.id} className="flex items-center justify-between p-4 bg-white rounded-lg border shadow-sm">
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{estudiante.nombre_completo}</div>
                        <div className="text-sm text-slate-600">
                          Grado: {estudiante.grado} - Grupo: {estudiante.grupo}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <Badge variant="secondary">{NIVEL_NAMES[estudiante.level as keyof typeof NIVEL_NAMES] ?? estudiante.level}</Badge>
                          <div className="text-xs text-slate-500 mt-1">Nivel detectado</div>
                        </div>
                        
                        <div className="text-right">
                          <div className={estudiante.price > 0 ? "text-lg font-bold text-green-600" : "text-sm font-semibold text-amber-700"}>
                            {estudiante.price > 0 ? formatMoney(estudiante.price) : "Sin precio configurado"}
                          </div>
                          <div className="text-xs text-slate-500">precio del catálogo</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {estudiantes.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">No hay alumnos activos en este campus.</p>
              )}
              {missingPriceAssignments.length > 0 && (
                <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  {missingPriceAssignments.length} alumno(s) no tienen precio configurado para su nivel y se omitirán al confirmar.
                </p>
              )}

              {/* Resumen */}
              <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-3">Resumen de asignaciones</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(summaryByLevel).map(([nivel, data]) => (
                    <div key={nivel} className="text-center p-3 bg-white rounded">
                      <div className="text-sm font-medium text-slate-700">{data.levelName}</div>
                      <div className="text-lg font-bold">{data.count}</div>
                      <div className="text-xs text-slate-500">estudiantes</div>
                      <div className="text-sm font-semibold text-green-600 mt-1">
                        {formatMoney(data.total)}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total general:</span>
                    <span className="text-xl font-bold text-green-700">
                      {formatMoney(assignmentsWithPrice.reduce((total, assignment) => total + assignment.price, 0))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <Button 
                  onClick={() => {
                    applyCharges.mutate({ 
                      producto_id: Number(selectedProduct),
                      fecha_vencimiento: fechaVencimiento
                    });
                  }}
                   disabled={applyCharges.isPending || assignmentsWithPrice.length === 0}
                  className="flex items-center gap-2" 
                  size="lg"
                   data-testid="apply-price-assignment"
                >
                  <CheckCircle className="w-5 h-5" />
                  {applyCharges.isPending 
                    ? "Aplicando cargos..." 
                     : `Aplicar cargos reales a ${assignmentsWithPrice.length} estudiantes`
                  }
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Explicación del proceso */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              ¿Cómo funciona la asignación automática?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Mapeo de grados a niveles:</h4>
                  <div className="space-y-2 text-sm">
                    <div><Badge variant="outline">Kinder</Badge>: PRE-K, K1, K2, K3, Preescolar</div>
                    <div><Badge variant="outline">Primaria</Badge>: 1° a 6° grado, Primero a Sexto</div>
                    <div><Badge variant="outline">Secundaria</Badge>: 1° a 3° secundaria, 7° a 9°</div>
                    <div><Badge variant="outline">Bachillerato</Badge>: 1° a 3° preparatoria, 10° a 12°</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Proceso automático:</h4>
                  <div className="space-y-2 text-sm">
                    <div>1. Se selecciona un producto del catálogo</div>
                    <div>2. El sistema lee el grado de cada estudiante</div>
                    <div>3. Mapea automáticamente el grado al nivel académico</div>
                    <div>4. Asigna el precio correspondiente a ese nivel</div>
                    <div>5. Genera los cargos con precios diferenciados</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}