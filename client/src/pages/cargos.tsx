import { useState } from "react";
import { getCurrentCiclo } from "@/hooks/use-academic-filter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  FileText, Plus, AlertTriangle, CheckCircle, Clock, DollarSign,
  Users, CreditCard, Download, FileSpreadsheet, Eye, Zap, Search
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PreviewAlumno {
  student_id: number;
  student_name: string;
  grade: string;
  academic_level: string;
  base_amount: number;
  beca_porcentaje: number;
  descuento_centavos: number;
  recargo_centavos: number;
  total_centavos: number;
  tiene_beca: boolean;
}

interface PreviewResponse {
  dry_run: boolean;
  total_alumnos: number;
  total_centavos: number;
  alumnos_con_beca: number;
  summary: PreviewAlumno[];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Cargos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Modal de generación masiva
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [generateForm, setGenerateForm] = useState({
    concepto: "",
    tipo_generacion: "automatica",
    nivel_academico: "todos",
    fecha_emision: "",
    fecha_vencimiento: "",
    aplicar_becas: true,
    incluir_recargos: false,
    ciclo_escolar: getCurrentCiclo(),
  });

  // Modal de cargos extraordinarios
  const [extModalOpen, setExtModalOpen] = useState(false);
  const [extForm, setExtForm] = useState({
    descripcion: "",
    monto_pesos: "",
    nivel_academico: "todos",
    fecha_emision: new Date().toISOString().split("T")[0],
    fecha_vencimiento: "",
  });

  // ── Queries ─────────────────────────────────────────────────────────────────
  const token = () => localStorage.getItem("auth_token");

  const { data: conceptos = [] } = useQuery<any[]>({
    queryKey: ["/api/concepts"],
    queryFn: async () => {
      const res = await fetch("/api/concepts", { headers: { Authorization: `Bearer ${token()}` } });
      return res.ok ? res.json() : [];
    },
  });

  const { data: cargosRaw = [], isLoading: cargosLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/charges"],
    queryFn: async () => {
      const res = await fetch("/api/admin/charges", { headers: { Authorization: `Bearer ${token()}` } });
      return res.ok ? res.json() : [];
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  /** Dry-run: calcula preview sin tocar la BD */
  const previewMutation = useMutation({
    mutationFn: async (formData: any): Promise<PreviewResponse> => {
      const res = await fetch("/api/charges/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...formData, dry_run: true }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Error al previsualizar");
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setStep("preview");
    },
    onError: (err: any) => {
      toast({ title: "Error al previsualizar", description: err.message, variant: "destructive" });
    },
  });

  /** Generación real */
  const generateMutation = useMutation({
    mutationFn: async (formData: any) => {
      const res = await fetch("/api/charges/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...formData, dry_run: false }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Error al generar");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Cargos generados",
        description: `Se crearon ${data.charges_created} cargos exitosamente`,
      });
      closeModal();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/charges"] });
    },
    onError: (err: any) => {
      toast({ title: "Error al generar cargos", description: err.message, variant: "destructive" });
    },
  });

  /** Exportar — RPT-03: POST /api/reportes/cobranza/exportar
   *  El campus viene del JWT; siempre genera Excel real con saldo_pendiente
   *  calculado desde payment_applications (no el campo estado del cargo).
   */
  const exportMutation = useMutation({
    mutationFn: async (_format: "excel" | "csv") => {
      const body: Record<string, string> = { formato: "excel" };
      if (selectedStatus && selectedStatus !== "all") body.estado = selectedStatus;
      const res = await fetch("/api/reportes/cobranza/exportar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      return { blob: await res.blob() };
    },
    onSuccess: ({ blob }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cargos_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exportación exitosa" });
    },
    onError: (err: any) => {
      toast({ title: "Error en exportación", description: err.message, variant: "destructive" });
    },
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const closeModal = () => {
    setModalOpen(false);
    setStep("form");
    setPreviewData(null);
    setGenerateForm({
      concepto: "",
      tipo_generacion: "automatica",
      nivel_academico: "todos",
      fecha_emision: "",
      fecha_vencimiento: "",
      aplicar_becas: true,
      incluir_recargos: false,
      ciclo_escolar: getCurrentCiclo(),
    });
  };

  const handlePreview = () => {
    if (!generateForm.concepto || !generateForm.fecha_emision || !generateForm.fecha_vencimiento) {
      toast({ title: "Campos requeridos", description: "Completa concepto y fechas", variant: "destructive" });
      return;
    }
    previewMutation.mutate(generateForm);
  };

  const handleConfirmGenerate = () => {
    generateMutation.mutate(generateForm);
  };

  const handleExtGenerate = () => {
    if (!extForm.descripcion || !extForm.monto_pesos || !extForm.fecha_vencimiento) {
      toast({ title: "Campos requeridos", description: "Completa descripción, monto y fecha de vencimiento", variant: "destructive" });
      return;
    }
    generateMutation.mutate({
      descripcion: extForm.descripcion,
      monto_manual: Math.round(parseFloat(extForm.monto_pesos) * 100),
      nivel_academico: extForm.nivel_academico,
      fecha_emision: extForm.fecha_emision,
      fecha_vencimiento: extForm.fecha_vencimiento,
      aplicar_becas: false,
      incluir_recargos: false,
      tipo_generacion: "extraordinaria",
      ciclo_escolar: getCurrentCiclo(),
      dry_run: false,
    });
    setExtModalOpen(false);
    setExtForm({ descripcion: "", monto_pesos: "", nivel_academico: "todos", fecha_emision: new Date().toISOString().split("T")[0], fecha_vencimiento: "" });
  };

  // ── Data normalización ────────────────────────────────────────────────────────
  const conceptoMap: Record<number, string> = {};
  (conceptos as any[]).forEach((c: any) => { conceptoMap[c.id] = c.nombre; });

  const cargos = (cargosRaw as any[]).map((c) => {
    const base    = Number(c.monto_base_centavos) || 0;
    const beca    = Number(c.beca_aplicada || 0);          // porcentaje (ej. 15.00)
    const recargo = Number(c.recargo_aplicado_centavos || 0);
    // Total neto = base - descuento por beca + recargo (igual que el preview del backend)
    const descuento = Math.round(base * beca / 100);
    const total     = base - descuento + recargo;
    return {
      id: c.id,
      estudiante: c.estudiante || `Alumno ${c.student_id}`,
      concepto: conceptoMap[c.concept_id] || (c.concept_id ? `Concepto ${c.concept_id}` : "Cargo extraordinario"),
      monto_base: base,
      beca_aplicada: beca,
      descuento_centavos: descuento,
      recargo,
      total,
      fecha_emision: (c.fecha_emision || "").split("T")[0],
      fecha_vencimiento: (c.fecha_vencimiento || "").split("T")[0],
      estado: c.estado,
      tipo: c.ciclo_escolar ? "AUTOMÁTICA" : "MANUAL",
    };
  });

  const filteredCargos = cargos.filter((c) => {
    const matchStatus = selectedStatus === "all" || c.estado === selectedStatus;
    const matchSearch = !searchTerm || c.estudiante.toLowerCase().includes(searchTerm.toLowerCase()) || c.concepto.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const estadisticas = {
    total: cargos.length,
    pendientes: cargos.filter((c) => c.estado === "pendiente").length,
    vencidos: cargos.filter((c) => c.estado === "vencido").length,
    pagados: cargos.filter((c) => c.estado === "pagado").length,
    montoTotal: cargos.filter((c) => c.estado === "pendiente" || c.estado === "vencido").reduce((s, c) => s + c.total, 0),
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "pendiente": return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case "vencido":   return <Badge className="bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Vencido</Badge>;
      case "pagado":    return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Pagado</Badge>;
      default:          return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  const fmt = (centavos: number) => `$${(centavos / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  const isVencido = (fv: string) => new Date(fv) < new Date();

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Cargos</h1>
          <p className="text-slate-600">Administra cargos automáticos, manuales y extraordinarios</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => { setModalOpen(true); setStep("form"); }}>
            <Plus className="w-4 h-4 mr-2" />Generar Cargos
          </Button>
          <Button variant="outline" className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100" onClick={() => setExtModalOpen(true)}>
            <Zap className="w-4 h-4 mr-2" />Cargo Extraordinario
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exportMutation.isPending}>
                {exportMutation.isPending ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2" />Exportando...</> : <><Download className="w-4 h-4 mr-2" />Exportar</>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => exportMutation.mutate("excel")}><FileSpreadsheet className="w-4 h-4 mr-2" />Exportar Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportMutation.mutate("csv")}><FileText className="w-4 h-4 mr-2" />Exportar CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        {[
          { icon: FileText,      color: "blue",   val: estadisticas.total,                         label: "Total cargos" },
          { icon: Clock,         color: "yellow",  val: estadisticas.pendientes,                    label: "Pendientes" },
          { icon: AlertTriangle, color: "red",     val: estadisticas.vencidos,                      label: "Vencidos" },
          { icon: CheckCircle,   color: "green",   val: estadisticas.pagados,                       label: "Pagados" },
          { icon: DollarSign,    color: "purple",  val: fmt(estadisticas.montoTotal), label: "Monto pendiente" },
        ].map(({ icon: Icon, color, val, label }, i) => (
          <Card key={i}>
            <CardContent className="p-4 text-center">
              <Icon className={`w-8 h-8 text-${color}-600 mx-auto mb-2`} />
              <div className="text-2xl font-bold">{val}</div>
              <div className="text-sm text-slate-600">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="lista" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lista">Lista de cargos</TabsTrigger>
          <TabsTrigger value="generacion">Generación automática</TabsTrigger>
          <TabsTrigger value="extraordinarios">Cargos extraordinarios</TabsTrigger>
        </TabsList>

        {/* ── Tab: Lista ── */}
        <TabsContent value="lista">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <CardTitle>Lista de cargos</CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-9 w-52" placeholder="Buscar alumno o concepto…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendiente">Pendientes</SelectItem>
                      <SelectItem value="vencido">Vencidos</SelectItem>
                      <SelectItem value="pagado">Pagados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {cargosLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
              ) : filteredCargos.length === 0 ? (
                <div className="text-center py-12 text-slate-500">No hay cargos que coincidan con el filtro.</div>
              ) : (
                <div className="space-y-3">
                  {filteredCargos.map((cargo) => (
                    <div key={cargo.id} className={`p-4 border rounded-lg ${isVencido(cargo.fecha_vencimiento) && cargo.estado === "pendiente" ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-medium">{cargo.estudiante}</h3>
                            {getStatusBadge(cargo.estado)}
                            <Badge variant="outline" className="text-xs">{cargo.tipo}</Badge>
                          </div>
                          <p className="text-sm text-slate-600">{cargo.concepto}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                            <span>Emitido: {cargo.fecha_emision}</span>
                            <span>Vence: {cargo.fecha_vencimiento}</span>
                            {cargo.beca_aplicada > 0 && <span className="text-green-600">Beca: {cargo.beca_aplicada}%</span>}
                            {cargo.recargo > 0 && <span className="text-red-600">Recargo: {fmt(cargo.recargo)}</span>}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-lg font-bold">{fmt(cargo.total)}</div>
                          <div className="text-xs text-slate-500">Base: {fmt(cargo.monto_base)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Generación automática ── */}
        <TabsContent value="generacion">
          <Card>
            <CardHeader>
              <CardTitle>Generación automática de cargos</CardTitle>
              <p className="text-sm text-slate-500">Selecciona concepto, nivel y fechas. Se mostrará una previsualización antes de confirmar.</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 max-w-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Concepto *</Label>
                    <Select value={generateForm.concepto} onValueChange={(v) => setGenerateForm({ ...generateForm, concepto: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecciona un concepto" /></SelectTrigger>
                      <SelectContent>
                        {(conceptos as any[]).map((c: any) => (
                          <SelectItem key={c.id} value={c.nombre}>{c.nombre} — {fmt(c.monto_centavos)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nivel académico</Label>
                    <Select value={generateForm.nivel_academico} onValueChange={(v) => setGenerateForm({ ...generateForm, nivel_academico: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos los niveles</SelectItem>
                        <SelectItem value="kinder">Kinder</SelectItem>
                        <SelectItem value="primaria">Primaria</SelectItem>
                        <SelectItem value="secundaria">Secundaria</SelectItem>
                        <SelectItem value="bachillerato">Bachillerato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha de emisión *</Label>
                    <Input type="date" value={generateForm.fecha_emision} onChange={(e) => setGenerateForm({ ...generateForm, fecha_emision: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha de vencimiento *</Label>
                    <Input type="date" value={generateForm.fecha_vencimiento} onChange={(e) => setGenerateForm({ ...generateForm, fecha_vencimiento: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Ciclo escolar</Label>
                    <Input value={generateForm.ciclo_escolar} onChange={(e) => setGenerateForm({ ...generateForm, ciclo_escolar: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox id="becas_auto" checked={generateForm.aplicar_becas} onCheckedChange={(v) => setGenerateForm({ ...generateForm, aplicar_becas: !!v })} />
                    <Label htmlFor="becas_auto">Aplicar becas reales</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="recargos_auto" checked={generateForm.incluir_recargos} onCheckedChange={(v) => setGenerateForm({ ...generateForm, incluir_recargos: !!v })} />
                    <Label htmlFor="recargos_auto">Incluir recargos por mora (5%)</Label>
                  </div>
                </div>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => { setModalOpen(true); setStep("form"); }}
                >
                  <Eye className="w-4 h-4 mr-2" />Previsualizar y generar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Extraordinarios ── */}
        <TabsContent value="extraordinarios">
          <Card>
            <CardHeader>
              <CardTitle>Crear cargo extraordinario</CardTitle>
              <p className="text-sm text-slate-500">Cargos puntuales como excursiones, materiales especiales, eventos, etc.</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 max-w-2xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label>Descripción del cargo *</Label>
                    <Input placeholder="Excursión, Material especial, Evento…" value={extForm.descripcion} onChange={(e) => setExtForm({ ...extForm, descripcion: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Monto (pesos MXN) *</Label>
                    <Input type="number" min="1" placeholder="500.00" value={extForm.monto_pesos} onChange={(e) => setExtForm({ ...extForm, monto_pesos: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Aplicar a</Label>
                    <Select value={extForm.nivel_academico} onValueChange={(v) => setExtForm({ ...extForm, nivel_academico: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos los alumnos</SelectItem>
                        <SelectItem value="kinder">Kinder</SelectItem>
                        <SelectItem value="primaria">Primaria</SelectItem>
                        <SelectItem value="secundaria">Secundaria</SelectItem>
                        <SelectItem value="bachillerato">Bachillerato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha de emisión</Label>
                    <Input type="date" value={extForm.fecha_emision} onChange={(e) => setExtForm({ ...extForm, fecha_emision: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha de vencimiento *</Label>
                    <Input type="date" value={extForm.fecha_vencimiento} onChange={(e) => setExtForm({ ...extForm, fecha_vencimiento: e.target.value })} />
                  </div>
                </div>
                <Button className="bg-purple-600 hover:bg-purple-700" onClick={handleExtGenerate} disabled={generateMutation.isPending}>
                  {generateMutation.isPending ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Creando…</> : <><Zap className="w-4 h-4 mr-2" />Crear cargo extraordinario</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════════════
          Modal generación masiva (form → preview → confirm)
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{step === "form" ? "Generar Cargos" : "Previsualización — Confirmar generación"}</DialogTitle>
            <DialogDescription>
              {step === "form"
                ? "Configura los parámetros. Luego verás un resumen antes de confirmar."
                : "Revisa los cargos que se crearán. Las becas provienen de registros reales en el sistema."}
            </DialogDescription>
          </DialogHeader>

          {/* ── Paso 1: Formulario ── */}
          {step === "form" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Concepto *</Label>
                  <Select value={generateForm.concepto} onValueChange={(v) => setGenerateForm({ ...generateForm, concepto: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona un concepto" /></SelectTrigger>
                    <SelectContent>
                      {(conceptos as any[]).map((c: any) => (
                        <SelectItem key={c.id} value={c.nombre}>{c.nombre} — {fmt(c.monto_centavos)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nivel académico</Label>
                  <Select value={generateForm.nivel_academico} onValueChange={(v) => setGenerateForm({ ...generateForm, nivel_academico: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los niveles</SelectItem>
                      <SelectItem value="kinder">Kinder</SelectItem>
                      <SelectItem value="primaria">Primaria</SelectItem>
                      <SelectItem value="secundaria">Secundaria</SelectItem>
                      <SelectItem value="bachillerato">Bachillerato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fecha de emisión *</Label>
                  <Input type="date" value={generateForm.fecha_emision} onChange={(e) => setGenerateForm({ ...generateForm, fecha_emision: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Fecha de vencimiento *</Label>
                  <Input type="date" value={generateForm.fecha_vencimiento} onChange={(e) => setGenerateForm({ ...generateForm, fecha_vencimiento: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Ciclo escolar</Label>
                  <Input value={generateForm.ciclo_escolar} onChange={(e) => setGenerateForm({ ...generateForm, ciclo_escolar: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox id="becas_modal" checked={generateForm.aplicar_becas} onCheckedChange={(v) => setGenerateForm({ ...generateForm, aplicar_becas: !!v })} />
                  <Label htmlFor="becas_modal">Aplicar becas reales del sistema</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="recargos_modal" checked={generateForm.incluir_recargos} onCheckedChange={(v) => setGenerateForm({ ...generateForm, incluir_recargos: !!v })} />
                  <Label htmlFor="recargos_modal">Incluir recargos por mora (5%)</Label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeModal}>Cancelar</Button>
                <Button onClick={handlePreview} disabled={previewMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                  {previewMutation.isPending ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Calculando…</> : <><Eye className="w-4 h-4 mr-2" />Previsualizar</>}
                </Button>
              </div>
            </div>
          )}

          {/* ── Paso 2: Preview ── */}
          {step === "preview" && previewData && (
            <div className="space-y-4">
              {/* Resumen ejecutivo */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <Users className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                  <div className="text-2xl font-bold text-blue-700">{previewData.total_alumnos}</div>
                  <div className="text-xs text-blue-600">alumnos afectados</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <CreditCard className="w-6 h-6 text-green-600 mx-auto mb-1" />
                  <div className="text-2xl font-bold text-green-700">{fmt(previewData.total_centavos)}</div>
                  <div className="text-xs text-green-600">monto total a cobrar</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <CheckCircle className="w-6 h-6 text-yellow-600 mx-auto mb-1" />
                  <div className="text-2xl font-bold text-yellow-700">{previewData.alumnos_con_beca}</div>
                  <div className="text-xs text-yellow-600">con beca aplicada</div>
                </div>
              </div>

              {/* Tabla de alumnos */}
              <div className="border rounded-lg overflow-auto max-h-72">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Alumno</TableHead>
                      <TableHead>Grado</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Beca</TableHead>
                      <TableHead className="text-right">Recargo</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.summary.map((a) => (
                      <TableRow key={a.student_id}>
                        <TableCell className="font-medium">{a.student_name}</TableCell>
                        <TableCell className="text-slate-500">{a.grade}</TableCell>
                        <TableCell className="text-right">{fmt(a.base_amount)}</TableCell>
                        <TableCell className="text-right">
                          {a.beca_porcentaje > 0 ? (
                            <span className="text-green-600">−{a.beca_porcentaje}%</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {a.recargo_centavos > 0 ? <span className="text-red-500">+{fmt(a.recargo_centavos)}</span> : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmt(a.total_centavos)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => setStep("form")}>&larr; Editar parámetros</Button>
                <Button onClick={handleConfirmGenerate} disabled={generateMutation.isPending} className="bg-green-600 hover:bg-green-700">
                  {generateMutation.isPending ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Generando…</> : <><CheckCircle className="w-4 h-4 mr-2" />Confirmar y generar {previewData.total_alumnos} cargos</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════
          Modal cargo extraordinario rápido
      ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={extModalOpen} onOpenChange={setExtModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargo extraordinario</DialogTitle>
            <DialogDescription>Excursión, material especial, evento u otro cobro puntual.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción *</Label>
              <Input placeholder="Excursión al museo, Material de laboratorio…" value={extForm.descripcion} onChange={(e) => setExtForm({ ...extForm, descripcion: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Monto (pesos MXN) *</Label>
                <Input type="number" min="1" placeholder="500" value={extForm.monto_pesos} onChange={(e) => setExtForm({ ...extForm, monto_pesos: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Aplicar a</Label>
                <Select value={extForm.nivel_academico} onValueChange={(v) => setExtForm({ ...extForm, nivel_academico: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los alumnos</SelectItem>
                    <SelectItem value="kinder">Kinder</SelectItem>
                    <SelectItem value="primaria">Primaria</SelectItem>
                    <SelectItem value="secundaria">Secundaria</SelectItem>
                    <SelectItem value="bachillerato">Bachillerato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha emisión</Label>
                <Input type="date" value={extForm.fecha_emision} onChange={(e) => setExtForm({ ...extForm, fecha_emision: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fecha vencimiento *</Label>
                <Input type="date" value={extForm.fecha_vencimiento} onChange={(e) => setExtForm({ ...extForm, fecha_vencimiento: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExtModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleExtGenerate} disabled={generateMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                {generateMutation.isPending ? "Creando…" : <><Zap className="w-4 h-4 mr-2" />Crear cargo</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
