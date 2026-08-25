// Módulo 5: Fiscal y contable - CFDI 4.0 automático, integración PAC, reportes SAT
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
import { 
  FileText, 
  Download, 
  Shield, 
  AlertCircle, 
  CheckCircle, 
  Calendar,
  Receipt,
  Database,
  RefreshCw,
  Eye,
  Clock
} from "lucide-react";

type PacStatus = {
  pac: string | null;
  estado: "sin_configurar" | "pendiente" | "activo" | "error" | "vencido";
  ambiente: "sandbox" | "produccion" | null;
  rfc?: string | null;
  razon_social?: string | null;
  fecha_vencimiento_csd?: string | null;
  organizacion_id: string | null;
  timbres_disponibles?: number | null;
  timbres_usados?: number | null;
};

type CfdiStats = {
  emitidos: number;
  monto_emitido: number;
  pendientes: number;
  cancelados: number;
};

function apiErrorMessage(error: unknown, fallback: string): string {
  const raw = String((error as Error)?.message || "");
  const body = raw.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // El endpoint puede devolver texto plano; se muestra sin el prefijo HTTP.
  }
  return body || fallback;
}

function EmptyFiscalState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function pacEnvironmentLabel(ambiente: PacStatus["ambiente"]): string {
  if (ambiente === "sandbox") return "Sandbox";
  if (ambiente === "produccion") return "Producción (bloqueada)";
  return "Sin configurar";
}

export default function FiscalContable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState("2025-01");
  const [activeTab, setActiveTab] = useState("gestion-cfdi");

  // CFDI 4.0 automático al pagar
  const GestionCFDI = () => {
    const { data: estadisticasCFDI } = useQuery<CfdiStats>({
      queryKey: ["/api/fiscal/estadisticas-cfdi", selectedPeriod],
    });
    const { data: estadoPAC, isLoading: loadingPAC, isError: pacError } = useQuery<PacStatus>({
      queryKey: ["/api/fiscal/estado-pac"],
    });

    const regenerarCFDI = useMutation({
      mutationFn: (facturaId: string) => apiRequest(`/api/fiscal/regenerar-cfdi/${facturaId}`, { method: "POST", body: JSON.stringify({}) }),
      onSuccess: () => {
        toast({
          title: "CFDI regenerado",
          description: "La factura se regeneró correctamente"
        });
        queryClient.invalidateQueries({ queryKey: ["/api/fiscal"] });
      }
    });

    const cancelarCFDI = useMutation({
      mutationFn: (data: any) => apiRequest("/api/fiscal/cancelar-cfdi", { method: "POST", body: JSON.stringify(data) }),
      onSuccess: () => {
        toast({
          title: "CFDI cancelado",
          description: "La factura se canceló correctamente en el SAT"
        });
        queryClient.invalidateQueries({ queryKey: ["/api/fiscal"] });
      }
    });

    return (
      <div className="space-y-6">
        {/* Estadísticas CFDI */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <FileText className="w-8 h-8 text-blue-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">{estadisticasCFDI?.emitidos || 0}</div>
          <div className="text-sm text-slate-600">CFDI emitidos</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">{estadisticasCFDI?.pendientes || 0}</div>
          <div className="text-sm text-slate-600">Pendientes de timbrar</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">{(estadisticasCFDI as any)?.cancelados || 0}</div>
          <div className="text-sm text-slate-600">Cancelados</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <Receipt className="w-8 h-8 text-purple-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">${((estadisticasCFDI?.monto_emitido || 0) / 100).toLocaleString()}</div>
          <div className="text-sm text-slate-600">Monto facturado</div>
            </CardContent>
          </Card>
        </div>

        {/* Configuración PAC */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Shield className="w-5 h-5" />
               Estado de configuración PAC
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPAC ? (
              <p className="text-sm text-slate-600">Consultando configuración del campus…</p>
            ) : pacError ? (
              <p className="text-sm text-red-700">No se pudo consultar el estado del PAC.</p>
            ) : (
              <div className="mt-1 rounded border bg-white p-3 text-sm text-slate-700">
                <p><strong>Proveedor:</strong> {estadoPAC?.pac || "Sin configurar"}</p>
                <p><strong>Ambiente:</strong> {pacEnvironmentLabel(estadoPAC?.ambiente ?? null)}</p>
                <p><strong>Estado:</strong> {estadoPAC?.estado?.replace("_", " ") || "sin configurar"}</p>
                <p><strong>Facturas pendientes de timbrar:</strong> {estadisticasCFDI?.pendientes || 0}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Facturas recientes */}
        <Card>
          <CardHeader>
            <CardTitle>Facturas CFDI recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyFiscalState
              message={estadoPAC?.estado === "activo"
                ? "El historial de facturas aún no está conectado a esta vista."
                : "No hay facturas para mostrar porque este campus no tiene un PAC configurado."}
            />
          </CardContent>
        </Card>
      </div>
    );
  };

  // Facturación Automática
  const FacturacionAutomatica = () => {
    const { data: configAutomatica, isLoading } = useQuery<{
      habilitado: boolean;
      timbrado_automatico: boolean;
      estado: string;
      ambiente: string;
      pac_nombre: string | null;
    }>({
      queryKey: ["/api/fiscal/config-automatica"],
    });

    const configuredForSandbox = configAutomatica?.estado === "activo"
      && configAutomatica?.ambiente === "sandbox";

    return (
      <div className="space-y-6">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <RefreshCw className="w-5 h-5" />
              Facturación automática al recibir pago
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-blue-700">Consultando configuración del campus…</p>
            ) : (
              <div className={`rounded border p-4 ${configuredForSandbox ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                <p className="font-medium">
                  {configuredForSandbox ? "Sandbox configurado" : "Timbrado automático no configurado"}
                </p>
                <p className="mt-1 text-sm">
                  {configuredForSandbox && configAutomatica?.timbrado_automatico
                    ? "El campus tiene activado el timbrado automático en sandbox."
                    : "Primero registra el CSD mediante la configuración PAC. No se emitirán CFDIs automáticamente."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Estadísticas de facturación automática */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <div className="text-2xl font-bold">—</div>
              <div className="text-sm text-slate-600">Historial no disponible</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <div className="text-2xl font-bold">—</div>
              <div className="text-sm text-slate-600">Tasa no disponible</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="w-8 h-8 text-orange-600 mx-auto mb-2" />
              <div className="text-2xl font-bold">—</div>
              <div className="text-sm text-slate-600">Tiempo no disponible</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // Integración PAC
  const IntegracionPAC = () => {
    const { data: estadoPAC, isLoading, isError } = useQuery<PacStatus>({
      queryKey: ["/api/fiscal/estado-pac"],
    });
    const [cerFile, setCerFile] = useState<File | null>(null);
    const [keyFile, setKeyFile] = useState<File | null>(null);
    const [keyPassword, setKeyPassword] = useState("");

    const registrarOrganizacion = useMutation({
      mutationFn: async () => {
        if (!cerFile || !keyFile || !keyPassword.trim()) {
          throw new Error("Selecciona los archivos .cer y .key e ingresa la contraseña de la llave privada.");
        }
        const formData = new FormData();
        formData.append("cer", cerFile);
        formData.append("key", keyFile);
        formData.append("password", keyPassword.trim());
        formData.append("proveedor", "facturapi");

        const token = localStorage.getItem("auth_token");
        const response = await fetch("/api/fiscal/registrar-organizacion", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
          credentials: "include",
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || `No se pudo registrar el CSD (${response.status}).`);
        }
        return response.json() as Promise<{ rfc: string; razon_social: string }>;
      },
      onSuccess: (result) => {
        toast({
          title: "CSD registrado en sandbox",
          description: result.razon_social || result.rfc,
        });
        setCerFile(null);
        setKeyFile(null);
        setKeyPassword("");
        queryClient.invalidateQueries({ queryKey: ["/api/fiscal/estado-pac"] });
        queryClient.invalidateQueries({ queryKey: ["/api/fiscal/config-automatica"] });
      },
      onError: (error) => toast({
        title: "No se pudo registrar el CSD",
        description: apiErrorMessage(error, "Revisa los datos fiscales e intenta de nuevo."),
        variant: "destructive",
      }),
    });

    const statusText = estadoPAC?.estado?.replace("_", " ") || "sin configurar";
    const isSandboxActive = estadoPAC?.estado === "activo" && estadoPAC?.ambiente === "sandbox";

    return (
      <div className="space-y-6">
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <Shield className="w-5 h-5" />
              Proveedor Autorizado de Certificación (PAC)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-purple-700 mb-4">
               Registra el CSD del campus exclusivamente para validar el flujo de CFDI en sandbox.
               La emisión en producción permanece desactivada.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Proveedor PAC</Label>
                <Select value="facturapi" disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facturapi">Facturapi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Ambiente</Label>
                <Select value="sandbox" disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (Pruebas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="fiscal-cer">Certificado CSD (.cer)</Label>
                <Input id="fiscal-cer" type="file" accept=".cer" onChange={(event) => setCerFile(event.target.files?.[0] || null)} />
              </div>
              <div>
                <Label htmlFor="fiscal-key">Llave privada CSD (.key)</Label>
                <Input id="fiscal-key" type="file" accept=".key" onChange={(event) => setKeyFile(event.target.files?.[0] || null)} />
              </div>
              <div>
                <Label htmlFor="fiscal-key-password">Contraseña de la llave privada</Label>
                <Input
                  id="fiscal-key-password"
                  type="password"
                  value={keyPassword}
                  onChange={(event) => setKeyPassword(event.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <Button
              onClick={() => registrarOrganizacion.mutate()}
              disabled={registrarOrganizacion.isPending}
              className="w-full mt-4"
            >
              <Shield className="w-4 h-4 mr-2" />
              {registrarOrganizacion.isPending ? "Registrando CSD…" : "Registrar CSD en sandbox"}
            </Button>
          </CardContent>
        </Card>

        {/* Estado de la conexión PAC */}
        <Card>
          <CardHeader>
            <CardTitle>Estado de la conexión PAC</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-slate-600">Consultando estado del PAC…</p>
            ) : isError ? (
              <EmptyFiscalState message="No se pudo consultar el estado de la configuración PAC." />
            ) : (
              <div className={`space-y-3 rounded border p-4 ${isSandboxActive ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {isSandboxActive
                      ? <CheckCircle className="w-5 h-5 text-green-600" />
                      : <AlertCircle className="w-5 h-5 text-amber-600" />}
                    <div>
                      <div className="font-medium">{estadoPAC?.pac || "PAC sin configurar"}</div>
                      <div className="text-sm">
                        {isSandboxActive ? "Configurado para pruebas sandbox" : "No hay una configuración activa para timbrar"}
                      </div>
                    </div>
                  </div>
                  <Badge variant={isSandboxActive ? "default" : "secondary"}>{statusText}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-600">Ambiente:</span> {pacEnvironmentLabel(estadoPAC?.ambiente ?? null)}</div>
                  <div><span className="text-slate-600">RFC:</span> {estadoPAC?.rfc || "—"}</div>
                  <div><span className="text-slate-600">Timbres disponibles:</span> {estadoPAC?.timbres_disponibles ?? "No disponible en sandbox"}</div>
                  <div><span className="text-slate-600">Timbres usados:</span> {estadoPAC?.timbres_usados ?? "No disponible en sandbox"}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Timbrado Masivo CFDI ──────────────────────────────────────────────────
  const TimbradoMasivo = () => {
    const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));
    const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
    const [progreso, setProgreso] = useState<null | { timbrados: number; errores: number; total: number }>(null);
    const pendientesUrl = `/api/fiscal/pendientes-cfdi?mes=${encodeURIComponent(mesFiltro)}`;

    const { data: pendientes, isLoading: loadingPendientes, isError: pendientesError } = useQuery<any>({
      queryKey: [pendientesUrl],
    });

    const pagosPendientes: any[] = pendientes?.pagos || [];

    const timbrarLote = useMutation({
      mutationFn: async (data: { payment_ids: number[] }) => {
        const response = await apiRequest("/api/fiscal/timbrar-lote", { method: "POST", body: JSON.stringify(data) });
        return response.json() as Promise<{ timbrados: number; errores: number; total: number }>;
      },
      onSuccess: (result: any) => {
        setProgreso({ timbrados: result?.timbrados || 0, errores: result?.errores || 0, total: result?.total || 0 });
        toast({
          title: result?.timbrados ? "Timbrado completado" : "Timbrado sin CFDIs emitidos",
          description: `${result?.timbrados || 0} CFDIs generados, ${result?.errores || 0} errores`,
          variant: result?.errores ? "destructive" : "default",
        });
        queryClient.invalidateQueries({ queryKey: [pendientesUrl] });
        queryClient.invalidateQueries({ queryKey: ["/api/fiscal/estadisticas-cfdi"] });
        setSeleccionados(new Set());
      },
      onError: (error) => toast({
        title: "No se pudo timbrar el lote",
        description: apiErrorMessage(error, "No fue posible completar el timbrado."),
        variant: "destructive",
      }),
    });

    const toggleSel = (id: number) => setSeleccionados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleTodos = () => setSeleccionados(s => s.size === pagosPendientes.length ? new Set() : new Set(pagosPendientes.map((p: any) => p.id)));

    return (
      <div className="space-y-5">
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800">Pagos sin CFDI — Timbrado en lote</h3>
              <p className="text-sm text-slate-500">Selecciona uno o todos los pagos y tímbra con un clic</p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Filtrar por mes</label>
                <input type="month" value={mesFiltro} onChange={e => { setMesFiltro(e.target.value); setSeleccionados(new Set()); }}
                  className="border rounded px-2 py-1 text-sm" />
              </div>
              <Button
                className="bg-purple-600 hover:bg-purple-700 gap-2"
                disabled={seleccionados.size === 0 || timbrarLote.isPending}
                onClick={() => timbrarLote.mutate({ payment_ids: Array.from(seleccionados) })}
              >
                <Receipt className="w-4 h-4" />
                {timbrarLote.isPending ? "Timbrando..." : `Timbrar ${seleccionados.size > 0 ? seleccionados.size : ""} CFDIs`}
              </Button>
            </div>
          </div>

          {progreso && (
            <div className={`mb-4 p-3 rounded-lg border text-sm font-medium ${progreso.errores === 0 ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
              ✓ {progreso.timbrados} CFDIs generados de {progreso.total} — {progreso.errores > 0 ? `${progreso.errores} con error` : "Sin errores"}
            </div>
          )}

          {loadingPendientes ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-4 border-purple-600 border-t-transparent rounded-full" />
            </div>
          ) : pendientesError ? (
            <EmptyFiscalState message="No se pudieron consultar los pagos pendientes de timbrar." />
          ) : pagosPendientes.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500 opacity-70" />
              <p className="font-medium">Todos los pagos tienen CFDI</p>
              <p className="text-sm text-slate-400">No hay pagos pendientes de timbrar en {mesFiltro}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3 p-2 bg-slate-50 rounded-lg">
                <input type="checkbox" checked={seleccionados.size === pagosPendientes.length} onChange={toggleTodos} className="w-4 h-4" />
                <span className="text-sm text-slate-600">{pagosPendientes.length} pagos sin CFDI — {seleccionados.size} seleccionados</span>
              </div>
              <div className="overflow-x-auto max-h-96 border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="p-3 w-8"></th>
                      <th className="p-3 text-left font-medium text-slate-600">Estudiante</th>
                      <th className="p-3 text-left font-medium text-slate-600">Responsable</th>
                      <th className="p-3 text-right font-medium text-slate-600">Monto</th>
                      <th className="p-3 text-left font-medium text-slate-600">Fecha pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagosPendientes.map((p: any) => (
                      <tr key={p.id} className={`border-b hover:bg-slate-50 ${seleccionados.has(p.id) ? "bg-purple-50" : ""}`}
                        onClick={() => toggleSel(p.id)} style={{cursor: "pointer"}}>
                        <td className="p-3"><input type="checkbox" checked={seleccionados.has(p.id)} onChange={() => toggleSel(p.id)} onClick={e => e.stopPropagation()} /></td>
                        <td className="p-3 font-medium">{p.estudiante}</td>
                        <td className="p-3 text-slate-500 text-xs">{p.guardian_nombre}<br />{p.email}</td>
                        <td className="p-3 text-right font-bold text-green-700">${((p.monto_centavos || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 text-slate-500 text-xs">{new Date(p.created_at).toLocaleDateString("es-MX")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Integración con contadores
  const IntegracionContadores = () => {
    const [exporting, setExporting] = useState(false);

    // Llama a POST /api/reportes/contable/exportar (RPT-06) y descarga el blob.
    // Reemplaza el stub /api/fiscal/generar-reporte-contable que devolvía
    // { url: null, mensaje: "..." } sin producir ningún archivo.
    const exportarContable = async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (!token) return;
      setExporting(true);
      try {
        const r = await fetch("/api/reportes/contable/exportar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ formato: "excel", periodo: selectedPeriod }),
        });
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `reporte-contable-${selectedPeriod}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        toast({
          title: "Reporte descargado",
          description: `reporte-contable-${selectedPeriod}.xlsx`,
        });
      } catch (e: any) {
        toast({
          title: "Error al exportar",
          description: e.message,
          variant: "destructive",
        });
      } finally {
        setExporting(false);
      }
    };

    return (
      <div className="space-y-6">
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <Database className="w-5 h-5" />
              Reportes para contadores externos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-purple-700 mb-4">
              Genera reportes específicos para contadores externos con acceso read-only 
              a datos fiscales y de conciliación.
            </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
                <Label>Período del reporte</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025-01">Enero 2025</SelectItem>
                    <SelectItem value="2024-12">Diciembre 2024</SelectItem>
                    <SelectItem value="2024-11">Noviembre 2024</SelectItem>
                  </SelectContent>
                </Select>
              </div>

          <div>
                <Label>Tipo de reporte</Label>
                <Select defaultValue="COMPLETO">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPLETO">Reporte completo</SelectItem>
                    <SelectItem value="INGRESOS">Solo ingresos</SelectItem>
                    <SelectItem value="CFDI">Solo CFDI emitidos</SelectItem>
                    <SelectItem value="CONCILIACION">Conciliación bancaria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={exportarContable}
              disabled={exporting}
              className="w-full mt-4"
            >
              <Download className="w-4 h-4 mr-2" />
              Generar reporte para contador
            </Button>
          </CardContent>
        </Card>

        {/* Reportes disponibles */}
        <Card>
          <CardHeader>
            <CardTitle>Reportes contables disponibles</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyFiscalState message="No hay reportes almacenados para mostrar. Genera uno para descargarlo directamente." />
          </CardContent>
        </Card>
      </div>
    );
  };

  // Reporte mensual para SAT
  const ReportesSAT = () => {
    const { data: estadisticasSAT } = useQuery<{
      total_cfdis: number;
      emitidos: number;
      cancelados: number;
      pendientes: number;
    }>({
      queryKey: ["/api/fiscal/estadisticas-sat", selectedPeriod],
    });

    const generarReporteSAT = useMutation({
      mutationFn: (data: any) => apiRequest("/api/fiscal/generar-reporte-sat", { method: "POST", body: JSON.stringify(data) }),
      onSuccess: () => {
        toast({
          title: "Reporte SAT generado",
          description: "El reporte mensual para SAT está listo"
        });
      }
    });

    return (
      <div className="space-y-6">
        {/* Estadísticas para SAT */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <FileText className="w-8 h-8 text-blue-600 mx-auto mb-2" />
           <div className="text-2xl font-bold">{estadisticasSAT?.emitidos || 0}</div>
          <div className="text-sm text-slate-600">Facturas emitidas</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <AlertCircle className="w-8 h-8 text-orange-600 mx-auto mb-2" />
           <div className="text-2xl font-bold">{estadisticasSAT?.cancelados || 0}</div>
          <div className="text-sm text-slate-600">Facturas canceladas</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <Receipt className="w-8 h-8 text-green-600 mx-auto mb-2" />
           <div className="text-2xl font-bold">{estadisticasSAT?.pendientes || 0}</div>
           <div className="text-sm text-slate-600">CFDI pendientes</div>
            </CardContent>
          </Card>
        </div>

        {/* Generación reporte SAT */}
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <Calendar className="w-5 h-5" />
              Reporte mensual para SAT
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-700 mb-4">
              Genera el reporte mensual con toda la información fiscal requerida 
              para cumplimiento ante el SAT.
            </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
                <Label>Mes a reportar</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025-01">Enero 2025</SelectItem>
                    <SelectItem value="2024-12">Diciembre 2024</SelectItem>
                    <SelectItem value="2024-11">Noviembre 2024</SelectItem>
                  </SelectContent>
                </Select>
              </div>

          <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-green-700">Datos validados y completos</span>
              </div>
            </div>

            <Button 
              onClick={() => generarReporteSAT.mutate({ periodo: selectedPeriod })}
              disabled={generarReporteSAT.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <FileText className="w-4 h-4 mr-2" />
              Generar reporte mensual SAT
            </Button>
          </CardContent>
        </Card>

        {/* Bitácora de cancelaciones */}
        <Card>
          <CardHeader>
            <CardTitle>Bitácora de cancelaciones CFDI</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyFiscalState message="No hay cancelaciones registradas para mostrar." />
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
            Fiscal y contable
          </h1>
          <p className="text-slate-600">
            CFDI 4.0 automático, integración PAC Facturama, reportes SAT y conciliación contable
          </p>
        </div>

        <Tabs defaultValue="gestion-cfdi" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="gestion-cfdi">Gestión CFDI</TabsTrigger>
            <TabsTrigger value="timbrado-lote">Timbrado masivo</TabsTrigger>
            <TabsTrigger value="facturacion-automatica">Facturación Automática</TabsTrigger>
            <TabsTrigger value="integracion-pac">Integración PAC</TabsTrigger>
            <TabsTrigger value="contadores-externos">Contadores Externos</TabsTrigger>
          </TabsList>

          <TabsContent value="gestion-cfdi">
            <GestionCFDI />
          </TabsContent>

          <TabsContent value="timbrado-lote">
            <TimbradoMasivo />
          </TabsContent>

          <TabsContent value="facturacion-automatica">
            <FacturacionAutomatica />
          </TabsContent>

          <TabsContent value="integracion-pac">
            <IntegracionPAC />
          </TabsContent>

          <TabsContent value="contadores-externos">
            <IntegracionContadores />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}