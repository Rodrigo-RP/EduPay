// Módulo 2: Emisión de cargos - Generación automática/manual, extraordinarios, recargos por mora
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Clock, DollarSign, Users, AlertTriangle, CheckCircle, Plus } from "lucide-react";
import { NIVEL_NAMES } from "@/../../shared/academic-levels";

export default function EmisionCargos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState("2025-01");

  // Generación automática mensual/anual
  const GeneracionAutomatica = () => {
    const { data: estadisticas } = useQuery({
      queryKey: ["/api/admin/cargos/estadisticas", selectedPeriod],
    });
    const { data: recentCharges = [] } = useQuery<any[]>({
      queryKey: ["/api/admin/cargos"],
    });

    const generarCargosMensuales = useMutation({
      mutationFn: async (data: any) =>
        (await apiRequest("/api/admin/cargos/generar-mensual", { method: "POST", body: JSON.stringify(data) })).json(),
      onSuccess: () => {
        toast({
          title: "Cargos generados",
          description: "Los cargos mensuales se generaron correctamente"
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/cargos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/cargos/estadisticas", selectedPeriod] });
      }
    });

    return (
      <div className="space-y-6">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Calendar className="w-5 h-5" />
              Generación automática de cargos
            </CardTitle>
          </CardHeader>
          <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
                  {(estadisticas as any)?.alumnos_activos || 0}
                </div>
            <div className="text-sm text-blue-700">Alumnos activos</div>
              </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
                  {(estadisticas as any)?.conceptos_configurados || 0}
                </div>
            <div className="text-sm text-green-700">Conceptos configurados</div>
              </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
                  ${(((estadisticas as any)?.monto_estimado || 0) / 100).toLocaleString()}
                </div>
            <div className="text-sm text-purple-700">Monto estimado MXN</div>
              </div>
            </div>

        <div className="space-y-4">
          <div>
                <Label>Período a generar</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025-01">Enero 2025</SelectItem>
                    <SelectItem value="2025-02">Febrero 2025</SelectItem>
                    <SelectItem value="2025-03">Marzo 2025</SelectItem>
                  </SelectContent>
                </Select>
              </div>

          <div className="flex gap-2">
            <Button 
                  onClick={() => generarCargosMensuales.mutate({ periodo: selectedPeriod, tipo: "COLEGIATURA" })}
                  disabled={generarCargosMensuales.isPending}
                  className="flex-1"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Generar colegiaturas
                </Button>
            <Button 
                  variant="outline"
                  onClick={() => generarCargosMensuales.mutate({ periodo: selectedPeriod, tipo: "TODOS" })}
                  disabled={generarCargosMensuales.isPending}
                  className="flex-1"
                >
                  Generar todos los conceptos
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Últimos cargos generados */}
        <Card>
          <CardHeader>
            <CardTitle>Últimos cargos generados</CardTitle>
          </CardHeader>
          <CardContent>
        <div className="space-y-2">
              {recentCharges.slice(0, 5).map((cargo) => (
            <div key={cargo.id} className="flex items-center justify-between p-3 bg-slate-50 rounded">
              <div>
                <div className="font-medium">{cargo.concepto_nombre || "Cargo sin concepto"}</div>
                <div className="text-sm text-slate-600">
                  {cargo.fecha_emision} • {cargo.estudiante || "Alumno no disponible"}
                </div>
                  </div>
              <div className="text-right">
                <div className="font-semibold">${(Number(cargo.monto_base_centavos || 0) / 100).toLocaleString()} MXN</div>
                    <Badge variant="secondary">{cargo.estado}</Badge>
                  </div>
                </div>
              ))}
              {recentCharges.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">No hay cargos emitidos todavía.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Cargos extraordinarios (manual)
  const CargosExtraordinarios = () => {
    const [nuevoCargoForm, setNuevoCargoForm] = useState({
      concepto: "",
      descripcion: "",
      monto: "",
      estudiante_id: "",
      fecha_vencimiento: ""
    });
    const { data: students = [] } = useQuery<any[]>({
      queryKey: ["/api/admin/students"],
    });
    const { data: recentCharges = [] } = useQuery<any[]>({
      queryKey: ["/api/admin/cargos"],
    });
    const recentExtraordinary = recentCharges.filter(
      (charge) => charge.concepto_tipo === "extra" || charge.concepto_tipo === "extraordinario",
    );

    const crearCargoExtraordinario = useMutation({
      mutationFn: async (data: typeof nuevoCargoForm) => {
        const response = await apiRequest("/api/charges/generate", {
          method: "POST",
          body: JSON.stringify({
            descripcion: data.concepto || data.descripcion,
            monto_manual: Math.round(Number(data.monto) * 100),
            student_id: Number(data.estudiante_id),
            fecha_vencimiento: data.fecha_vencimiento || undefined,
          }),
        });
        return response.json();
      },
      onSuccess: () => {
        toast({
          title: "Cargo extraordinario creado",
          description: "El cargo se aplicará según la configuración seleccionada"
        });
        setNuevoCargoForm({
          concepto: "",
          descripcion: "",
          monto: "",
          estudiante_id: "",
          fecha_vencimiento: ""
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/cargos"] });
      }
    });

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Crear cargo extraordinario
            </CardTitle>
          </CardHeader>
          <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
                <Label htmlFor="concepto">Concepto</Label>
                <Input
                  id="concepto"
                  value={nuevoCargoForm.concepto}
                  onChange={(e) => setNuevoCargoForm({...nuevoCargoForm, concepto: e.target.value})}
                  placeholder="Excursión, Material especial, etc."
                />
              </div>
          <div>
                <Label htmlFor="monto">Monto (MXN)</Label>
                <Input
                  id="monto"
                  type="number"
                  value={nuevoCargoForm.monto}
                  onChange={(e) => setNuevoCargoForm({...nuevoCargoForm, monto: e.target.value})}
                  placeholder="500"
                />
              </div>
          <div>
                <Label>Alumno</Label>
                <Select
                  value={nuevoCargoForm.estudiante_id}
                  onValueChange={(value) => setNuevoCargoForm({...nuevoCargoForm, estudiante_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar alumno activo…" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.filter((student) => student.status === "activo").map((student) => (
                      <SelectItem key={student.id} value={String(student.id)}>
                        {student.nombre_completo} — {student.grado}{student.grupo ? ` ${student.grupo}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
          <div>
                <Label htmlFor="fecha_vencimiento">Fecha de vencimiento</Label>
                <Input
                  id="fecha_vencimiento"
                  type="date"
                  value={nuevoCargoForm.fecha_vencimiento}
                  onChange={(e) => setNuevoCargoForm({...nuevoCargoForm, fecha_vencimiento: e.target.value})}
                />
              </div>
            </div>

        <div className="mt-4">
              <Label htmlFor="descripcion">Descripción</Label>
              <textarea 
                id="descripcion"
                className="w-full p-2 border rounded"
                rows={3}
                value={nuevoCargoForm.descripcion}
                onChange={(e) => setNuevoCargoForm({...nuevoCargoForm, descripcion: e.target.value})}
                placeholder="Detalles del cargo extraordinario..."
              />
            </div>

            <Button 
              onClick={() => crearCargoExtraordinario.mutate(nuevoCargoForm)}
              disabled={
                crearCargoExtraordinario.isPending ||
                !nuevoCargoForm.concepto.trim() ||
                !nuevoCargoForm.estudiante_id ||
                Number(nuevoCargoForm.monto) <= 0
              }
              className="w-full mt-4"
            >
              Crear cargo extraordinario
            </Button>
          </CardContent>
        </Card>

        {/* Cargos extraordinarios recientes */}
        <Card>
          <CardHeader>
            <CardTitle>Cargos extraordinarios recientes</CardTitle>
          </CardHeader>
          <CardContent>
        <div className="space-y-3">
              {recentExtraordinary.slice(0, 5).map((cargo) => (
            <div key={cargo.id} className="flex items-center justify-between p-3 border rounded">
              <div>
                <div className="font-medium">{cargo.concepto_nombre || "Cargo extraordinario"}</div>
                <div className="text-sm text-slate-600">{cargo.fecha_emision} • {cargo.estudiante}</div>
                  </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold">${(Number(cargo.monto_base_centavos || 0) / 100).toLocaleString()} MXN</div>
                    </div>
                    <Badge variant={cargo.estado === "pagado" ? "default" : "secondary"}>
                      {cargo.estado}
                    </Badge>
                  </div>
                </div>
              ))}
              {recentExtraordinary.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">No hay cargos extraordinarios emitidos todavía.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Aplicación de recargos por mora
  const RecargosYMora = () => {
    const { data: morosos } = useQuery({
      queryKey: ["/api/admin/cargos/morosos"],
    });
    const overdueStudents = Array.isArray(morosos) ? morosos : [];
    const totalOverdue = overdueStudents.reduce((total: number, student: any) => total + Number(student.adeudo_centavos || 0), 0);
    const overdueCharges = overdueStudents.reduce((total: number, student: any) => total + Number(student.cargos_vencidos || 0), 0);

    const aplicarRecargos = useMutation({
      mutationFn: async () =>
        (await apiRequest("/api/admin/cargos/aplicar-recargos", { method: "POST", body: JSON.stringify({}) })).json(),
      onSuccess: () => {
        toast({
          title: "Recargos aplicados",
          description: "Se aplicaron recargos por mora a los pagos vencidos"
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/cargos/morosos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/cargos"] });
      }
    });

    return (
      <div className="space-y-6">
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <AlertTriangle className="w-5 h-5" />
              Control de morosidad y recargos
            </CardTitle>
          </CardHeader>
          <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
                  {overdueStudents.length}
                </div>
            <div className="text-sm text-red-700">Alumnos morosos</div>
              </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
                  ${(totalOverdue / 100).toLocaleString()}
                </div>
            <div className="text-sm text-orange-700">Monto vencido MXN</div>
              </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
                  {overdueCharges}
                </div>
             <div className="text-sm text-purple-700">Cargos vencidos</div>
              </div>
            </div>

        <div className="flex gap-2">
          <Button 
                onClick={() => aplicarRecargos.mutate()}
                disabled={aplicarRecargos.isPending}
                variant="destructive"
                className="flex-1"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Aplicar recargos por mora
              </Button>
          <Button variant="outline" className="flex-1">
                <Clock className="w-4 h-4 mr-2" />
                Configurar recordatorios
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de morosos */}
        <Card>
          <CardHeader>
            <CardTitle>Pagos vencidos</CardTitle>
          </CardHeader>
          <CardContent>
        <div className="space-y-2">
              {overdueStudents.map((moroso: any) => (
            <div key={moroso.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded">
              <div>
                <div className="font-medium text-red-800">{moroso.nombre_completo}</div>
                <div className="text-sm text-red-600">{moroso.cargos_vencidos} cargo(s) vencido(s)</div>
                  </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold">${(Number(moroso.adeudo_centavos || 0) / 100).toLocaleString()} MXN</div>
                    </div>
                    <Badge variant="destructive">Vencido</Badge>
                  </div>
                </div>
              ))}
              {overdueStudents.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">No hay pagos vencidos en este campus.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Generación desde catálogo — precios derivados automáticamente por nivel académico
  const GeneracionDesdeCatalogo = () => {
    const [selectedProductId, setSelectedProductId] = useState<string>("");
    const [nivelAcademico, setNivelAcademico]       = useState<string>("todos");
    const [fechaEmision, setFechaEmision]           = useState<string>(
      new Date().toISOString().split("T")[0],
    );
    const [fechaVencimiento, setFechaVencimiento]   = useState<string>("");
    const [previewConfirmed, setPreviewConfirmed]   = useState(false);

    // Productos reales del catálogo
    const { data: productosData, isLoading: productosLoading } = useQuery<any[]>({
      queryKey: ["/api/products"],
    });
    const productos: any[] = (productosData ?? []).filter((product: any) => product.activo);

    // Producto seleccionado — para mostrar los precios por nivel antes de confirmar
    const productoSeleccionado = productos.find(
      (p: any) => p.id.toString() === selectedProductId,
    ) ?? null;

    // Precio derivado para el nivel seleccionado (autocomplete visible)
    const precioParaNivel = (prod: any, nivel: string): number | null => {
      if (!prod) return null;
      const col =
        nivel === "KINDER"       ? prod.precio_kinder :
        nivel === "PRIMARIA"     ? prod.precio_primaria :
        nivel === "SECUNDARIA"   ? prod.precio_secundaria :
        nivel === "BACHILLERATO" ? prod.precio_bachillerato :
        null;
      return col && Number(col) > 0 ? Number(col) : null;
    };

    // Precios de los 4 niveles para el producto elegido
    const tablaPrecios =
      productoSeleccionado
        ? ([
            { nivel: "KINDER",       label: "Kinder",       precio: productoSeleccionado.precio_kinder },
            { nivel: "PRIMARIA",     label: "Primaria",     precio: productoSeleccionado.precio_primaria },
            { nivel: "SECUNDARIA",   label: "Secundaria",   precio: productoSeleccionado.precio_secundaria },
            { nivel: "BACHILLERATO", label: "Bachillerato", precio: productoSeleccionado.precio_bachillerato },
          ] as const)
        : [];

    // Precio específico para el nivel seleccionado en el formulario
    const precioAutocomplete =
      productoSeleccionado && nivelAcademico !== "todos"
        ? precioParaNivel(productoSeleccionado, nivelAcademico)
        : null;

    const aplicarCargos = useMutation({
      mutationFn: async (data: any) =>
        (await apiRequest("/api/charges/generate", {
          method: "POST",
          body: JSON.stringify(data),
        })).json(),
      onSuccess: (response: any) => {
        toast({
          title: "Cargos aplicados correctamente",
          description: `Se generaron ${response.charges_created} cargo(s) con precios del catálogo`,
        });
        setSelectedProductId("");
        setNivelAcademico("todos");
        setFechaVencimiento("");
        setPreviewConfirmed(false);
        queryClient.invalidateQueries({ queryKey: ["/api/charges"] });
      },
      onError: (error: any) => {
        toast({
          title: "Error al aplicar cargos",
          description: error.message || "Ocurrió un error al crear los cargos",
          variant: "destructive",
        });
        setPreviewConfirmed(false);
      },
    });

    const puedeConfirmar =
      !!selectedProductId &&
      !!fechaVencimiento &&
      !aplicarCargos.isPending;

    const handleAplicar = () => {
      if (!puedeConfirmar) return;
      aplicarCargos.mutate({
        product_id:        Number(selectedProductId),
        nivel_academico:   nivelAcademico,
        fecha_emision:     fechaEmision,
        fecha_vencimiento: fechaVencimiento,
      });
    };

    return (
      <div className="space-y-6">
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <DollarSign className="w-5 h-5" />
              Generación desde catálogo de productos
            </CardTitle>
            <p className="text-sm text-green-700">
              El monto se toma automáticamente del catálogo según el nivel académico del alumno.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Selector de producto */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Producto del catálogo</Label>
                  <Select
                    value={selectedProductId}
                    onValueChange={(v) => { setSelectedProductId(v); setPreviewConfirmed(false); }}
                    disabled={productosLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={productosLoading ? "Cargando productos…" : "Seleccionar producto…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {productos.map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.codigo} – {p.nombre} ({(p.categoria ?? "").replace(/_/g, " ")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Nivel académico → autocompleta el precio */}
                <div>
                  <Label>Nivel académico</Label>
                  <Select
                    value={nivelAcademico}
                    onValueChange={(v) => { setNivelAcademico(v); setPreviewConfirmed(false); }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los niveles</SelectItem>
                      <SelectItem value="KINDER">Kinder</SelectItem>
                      <SelectItem value="PRIMARIA">Primaria</SelectItem>
                      <SelectItem value="SECUNDARIA">Secundaria</SelectItem>
                      <SelectItem value="BACHILLERATO">Bachillerato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Fecha de emisión</Label>
                  <Input
                    type="date"
                    value={fechaEmision}
                    onChange={(e) => setFechaEmision(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Fecha de vencimiento</Label>
                  <Input
                    type="date"
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                  />
                </div>
              </div>

              {/* Autocomplete de precio: visible en cuanto se elige producto + nivel */}
              {productoSeleccionado && (
                <div className="rounded-lg border border-green-300 bg-white p-4 space-y-3">
                  <div className="text-sm font-semibold text-slate-700">
                    Precios del catálogo — <span className="text-green-700">{productoSeleccionado.nombre}</span>
                  </div>

                  {/* Tabla de 4 niveles */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {tablaPrecios.map(({ nivel, label, precio }) => {
                      const monto   = Number(precio ?? 0);
                      const esActivo = nivelAcademico === nivel || nivelAcademico === "todos";
                      const sinPrecio = !monto || monto <= 0;
                      return (
                        <div
                          key={nivel}
                          className={`rounded-lg p-3 text-center border-2 transition-colors ${
                            esActivo && !sinPrecio
                              ? "border-green-400 bg-green-50"
                              : sinPrecio
                              ? "border-red-200 bg-red-50"
                              : "border-slate-200 bg-slate-50 opacity-50"
                          }`}
                        >
                          <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
                          {sinPrecio ? (
                            <div className="text-xs text-red-500 font-medium">Sin precio</div>
                          ) : (
                            <div className={`text-sm font-bold ${esActivo ? "text-green-700" : "text-slate-500"}`}>
                              ${(monto / 100).toLocaleString("es-MX")}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Precio específico del nivel seleccionado */}
                  {nivelAcademico !== "todos" && (
                    <div className={`rounded-md px-4 py-3 text-sm font-medium flex items-center gap-2 ${
                      precioAutocomplete
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {precioAutocomplete ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Precio que se aplicará para {NIVEL_NAMES[nivelAcademico as keyof typeof NIVEL_NAMES]}:{" "}
                          <strong>${(precioAutocomplete / 100).toLocaleString("es-MX")} MXN</strong>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4" />
                          Este producto no tiene precio configurado para el nivel{" "}
                          {NIVEL_NAMES[nivelAcademico as keyof typeof NIVEL_NAMES]}.
                          No se podrán generar cargos para ese nivel.
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Botón de acción */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleAplicar}
                  disabled={!puedeConfirmar}
                >
                  {aplicarCargos.isPending ? (
                    "Generando cargos…"
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Generar cargos desde catálogo
                    </>
                  )}
                </Button>

                {!fechaVencimiento && selectedProductId && (
                  <span className="text-xs text-amber-600">
                    Selecciona la fecha de vencimiento para continuar
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Emisión de cargos
          </h1>
          <p className="text-slate-600">
            Generación automática mensual/anual, cargos extraordinarios y control de morosidad
          </p>
        </div>

        <Tabs defaultValue="automatica" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="automatica">Generación automática</TabsTrigger>
            <TabsTrigger value="catalogo">Desde catálogo</TabsTrigger>
            <TabsTrigger value="extraordinarios">Cargos extraordinarios</TabsTrigger>
            <TabsTrigger value="recargos">Recargos y morosidad</TabsTrigger>
          </TabsList>

          <TabsContent value="automatica">
            <GeneracionAutomatica />
          </TabsContent>

          <TabsContent value="catalogo">
            <GeneracionDesdeCatalogo />
          </TabsContent>

          <TabsContent value="extraordinarios">
            <CargosExtraordinarios />
          </TabsContent>

          <TabsContent value="recargos">
            <RecargosYMora />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}