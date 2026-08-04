import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, CheckCircle, XCircle, Phone, Clock,
  Building2, Search, RefreshCw, DollarSign
} from "lucide-react";

interface Excepcion {
  id: number;
  fecha: string;
  descripcion: string;
  monto_centavos: number;
  tipo: string;
  referencia: string | null;
  clabe_ordenante: string | null;
  nombre_ordenante: string | null;
  estado_conciliacion: string;
  nota_conciliacion: string | null;
  dias_sin_conciliar: number;
}

interface CargoDisponible {
  id: number;
  fecha_vencimiento: string;
  alumno: string;
  grado: string;
  monto_neto: number;
  concepto: string | null;
}

interface ExcepcionesResponse {
  excepciones: Excepcion[];
  cargos_disponibles: CargoDisponible[];
  total_pendiente: number;
}

const fmt = (cents: number) =>
  `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

export default function ExcepcionesConciliacion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = () => localStorage.getItem("auth_token");

  const [searchTerm, setSearchTerm] = useState("");
  const [resolverModal, setResolverModal] = useState<{ open: boolean; excepcion: Excepcion | null }>({
    open: false,
    excepcion: null,
  });
  const [resolverForm, setResolverForm] = useState({
    accion: "" as "aplicar" | "descartar" | "",
    charge_id: "",
    motivo: "",
    nota: "",
  });

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery<ExcepcionesResponse>({
    queryKey: ["/api/conciliacion/excepciones"],
    queryFn: async () => {
      const res = await fetch("/api/conciliacion/excepciones", {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Error al cargar excepciones");
      return res.json();
    },
  });

  const excepciones = (data?.excepciones ?? []).filter((e) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      e.descripcion?.toLowerCase().includes(q) ||
      e.referencia?.toLowerCase().includes(q) ||
      e.nombre_ordenante?.toLowerCase().includes(q)
    );
  });

  const cargosDisponibles = data?.cargos_disponibles ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────────
  const resolverMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      // Normalize: the UI now uses 'descartar'; backend accepts both 'descartar' and 'ignorar'
      const res = await fetch(`/api/conciliacion/excepciones/${id}/resolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al resolver");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Excepción resuelta", description: data.message });
      setResolverModal({ open: false, excepcion: null });
      setResolverForm({ accion: "", charge_id: "", motivo: "", nota: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/conciliacion/excepciones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/48"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleResolver = () => {
    if (!resolverModal.excepcion) return;
    if (!resolverForm.accion) {
      toast({ title: "Selecciona una acción", variant: "destructive" });
      return;
    }
    resolverMutation.mutate({
      id: resolverModal.excepcion.id,
      body: {
        accion: resolverForm.accion,
        charge_id: resolverForm.charge_id ? parseInt(resolverForm.charge_id) : undefined,
        motivo: resolverForm.motivo || undefined,
        nota: resolverForm.nota,
      },
    });
  };

  const openModal = (exc: Excepcion) => {
    setResolverModal({ open: true, excepcion: exc });
    setResolverForm({ accion: "", charge_id: "", motivo: "", nota: "" });
  };

  const MOTIVOS_DESCARTE = [
    "Pago identificado manualmente",
    "Error del banco",
    "Duplicado confirmado",
    "Otro",
  ];

  const diasBadge = (dias: number) => {
    const d = Number(dias);
    if (d <= 3) return <Badge className="bg-yellow-100 text-yellow-800">{d}d</Badge>;
    if (d <= 14) return <Badge className="bg-orange-100 text-orange-800">{d}d</Badge>;
    return <Badge className="bg-red-100 text-red-800">{d}d</Badge>;
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Bandeja de Excepciones</h1>
          <p className="text-slate-600">Pagos bancarios que no pudieron conciliarse automáticamente</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-red-600">{data?.total_pendiente ?? 0}</div>
            <div className="text-sm text-slate-600">Excepciones pendientes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="w-8 h-8 text-orange-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-orange-600">
              {fmt((data?.excepciones ?? []).reduce((s, e) => s + Number(e.monto_centavos), 0))}
            </div>
            <div className="text-sm text-slate-600">Monto sin identificar</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-8 h-8 text-blue-500 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-600">
              {(data?.excepciones ?? []).length > 0
                ? Math.round(
                    (data!.excepciones.reduce((s, e) => s + Number(e.dias_sin_conciliar), 0)) /
                    data!.excepciones.length
                  )
                : 0}d
            </div>
            <div className="text-sm text-slate-600">Días promedio sin conciliar</div>
          </CardContent>
        </Card>
      </div>

      {/* Lista */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Transacciones sin identificar
            </CardTitle>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9 w-60"
                placeholder="Buscar por referencia, nombre…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : excepciones.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <p className="text-xl font-semibold text-slate-700">Sin excepciones pendientes</p>
              <p className="text-slate-500 mt-1">
                Todos los pagos bancarios están conciliados o fueron procesados.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {excepciones.map((exc) => (
                <div
                  key={exc.id}
                  className="border border-red-100 bg-red-50/30 rounded-lg p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-800">
                        {fmt(Number(exc.monto_centavos))}
                      </span>
                      {diasBadge(exc.dias_sin_conciliar)}
                      <Badge variant="outline" className="text-xs capitalize">
                        {exc.tipo || "crédito"}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-700 truncate">{exc.descripcion || "Sin descripción"}</p>
                    <div className="flex gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                      <span>Fecha: {exc.fecha ? String(exc.fecha).split("T")[0] : "—"}</span>
                      {exc.referencia && <span>Ref: {exc.referencia}</span>}
                      {exc.nombre_ordenante && <span>Ordenante: {exc.nombre_ordenante}</span>}
                      {exc.clabe_ordenante && <span>CLABE: {exc.clabe_ordenante}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() => openModal(exc)}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Resolver
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal resolver */}
      <Dialog open={resolverModal.open} onOpenChange={(open) => { if (!open) setResolverModal({ open: false, excepcion: null }); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolver excepción</DialogTitle>
            <DialogDescription>
              Transacción de {resolverModal.excepcion ? fmt(Number(resolverModal.excepcion.monto_centavos)) : ""} del{" "}
              {resolverModal.excepcion?.fecha ? String(resolverModal.excepcion.fecha).split("T")[0] : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Datos de la transacción */}
            {resolverModal.excepcion && (
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Descripción</span>
                  <span className="font-medium">{resolverModal.excepcion.descripcion || "—"}</span>
                </div>
                {resolverModal.excepcion.nombre_ordenante && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ordenante</span>
                    <span className="font-medium">{resolverModal.excepcion.nombre_ordenante}</span>
                  </div>
                )}
                {resolverModal.excepcion.referencia && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Referencia</span>
                    <span className="font-medium">{resolverModal.excepcion.referencia}</span>
                  </div>
                )}
              </div>
            )}

            {/* Acción */}
            <div className="space-y-2">
              <Label>Acción *</Label>
              <Select
                value={resolverForm.accion}
                onValueChange={(v) => setResolverForm({ ...resolverForm, accion: v as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona qué hacer con este pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aplicar">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      Aplicar a un cargo existente
                    </div>
                  </SelectItem>
                  <SelectItem value="descartar">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-gray-500" />
                      Descartar (no escolar)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Motivo de descarte (solo si acción = descartar) */}
            {resolverForm.accion === "descartar" && (
              <div className="space-y-2">
                <Label>Motivo del descarte <span className="text-red-500">*</span></Label>
                <Select
                  value={resolverForm.motivo}
                  onValueChange={(v) => setResolverForm({ ...resolverForm, motivo: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona el motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_DESCARTE.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Selector de cargo (solo si acción = aplicar) */}
            {resolverForm.accion === "aplicar" && (
              <div className="space-y-2">
                <Label>Cargo a aplicar *</Label>
                <Select
                  value={resolverForm.charge_id}
                  onValueChange={(v) => setResolverForm({ ...resolverForm, charge_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona el cargo del alumno" />
                  </SelectTrigger>
                  <SelectContent>
                    {cargosDisponibles.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.alumno} — {c.concepto || "Sin concepto"} ({fmt(Number(c.monto_neto))}) vence {String(c.fecha_vencimiento).split("T")[0]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cargosDisponibles.length === 0 && (
                  <p className="text-xs text-slate-500">No hay cargos pendientes disponibles.</p>
                )}
              </div>
            )}

            {/* Nota */}
            <div className="space-y-2">
              <Label>
                Nota{resolverForm.accion === "descartar" ? " (opcional)" : " (opcional)"}
              </Label>
              <Textarea
                rows={3}
                placeholder={
                  resolverForm.accion === "descartar"
                    ? "Ej: Depósito por error de tercero, devolución en proceso…"
                    : "Ej: Confirmado con tesorero, aplicado a colegiatura marzo…"
                }
                value={resolverForm.nota}
                onChange={(e) => setResolverForm({ ...resolverForm, nota: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setResolverModal({ open: false, excepcion: null })}>
                Cancelar
              </Button>
              <Button
                onClick={handleResolver}
                disabled={
                  resolverMutation.isPending ||
                  (resolverForm.accion === "descartar" && !resolverForm.motivo)
                }
                className={resolverForm.accion === "descartar" ? "bg-slate-700 hover:bg-slate-800" : "bg-green-600 hover:bg-green-700"}
              >
                {resolverMutation.isPending ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />Procesando…</>
                ) : resolverForm.accion === "descartar" ? (
                  <><XCircle className="w-4 h-4 mr-2" />Confirmar descarte</>
                ) : (
                  <><CheckCircle className="w-4 h-4 mr-2" />Aplicar pago</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
