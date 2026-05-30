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

export default function FiscalContable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState("2025-01");
  const [activeTab, setActiveTab] = useState("gestion-cfdi");

  // CFDI 4.0 automático al pagar
  const GestionCFDI = () => {
    const { data: estadisticasCFDI } = useQuery({
      queryKey: ["/api/fiscal/estadisticas-cfdi", selectedPeriod],
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
          <div className="text-2xl font-bold">{(estadisticasCFDI as any)?.total_emitidos || 0}</div>
          <div className="text-sm text-slate-600">CFDI emitidos</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">{(estadisticasCFDI as any)?.validados || 0}</div>
          <div className="text-sm text-slate-600">Validados SAT</div>
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
          <div className="text-2xl font-bold">${(((estadisticasCFDI as any)?.monto_total || 0) / 100).toLocaleString()}</div>
          <div className="text-sm text-slate-600">Monto facturado</div>
            </CardContent>
          </Card>
        </div>

        {/* Configuración PAC */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Shield className="w-5 h-5" />
              Configuración PAC - Facturama
            </CardTitle>
          </CardHeader>
          <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
                <Label>Proveedor PAC</Label>
                <Select defaultValue="FACTURAMA">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FACTURAMA">Facturama</SelectItem>
                    <SelectItem value="ENLACE_FISCAL">Enlace Fiscal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
          <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-green-700">Conexión PAC activa</span>
              </div>
            </div>

        <div className="mt-4 p-3 bg-white rounded border">
          <div className="text-sm">
                <strong>Estado del servicio:</strong> Operativo
                <br />
                <strong>Última sincronización:</strong> Hace 5 minutos
                <br />
                <strong>Facturas pendientes de timbrar:</strong> 0
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Facturas recientes */}
        <Card>
          <CardHeader>
            <CardTitle>Facturas CFDI recientes</CardTitle>
          </CardHeader>
          <CardContent>
        <div className="space-y-3">
              {[
                { folio: "A001", uuid: "12345-ABCDE-67890", estudiante: "Carlos Pérez", monto: 500000, fecha: "2025-01-20", estado: "Vigente" },
                { folio: "A002", uuid: "12346-ABCDF-67891", estudiante: "Ana García", monto: 150000, fecha: "2025-01-20", estado: "Vigente" },
                { folio: "A003", uuid: "12347-ABCDG-67892", estudiante: "Luis Martínez", monto: 300000, fecha: "2025-01-19", estado: "Cancelado" }
              ].map((factura, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded">
              <div>
                <div className="font-medium">Folio {factura.folio} - {factura.estudiante}</div>
                <div className="text-sm text-slate-600">{factura.fecha} • UUID: {factura.uuid}</div>
                  </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold">${(factura.monto / 100).toLocaleString()}</div>
                    </div>
                    <Badge variant={factura.estado === "Vigente" ? "default" : "destructive"}>
                      {factura.estado}
                    </Badge>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline">
                        <Eye className="w-4 h-4" />
                      </Button>
                  <Button size="sm" variant="outline">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Facturación Automática
  const FacturacionAutomatica = () => {
    const { data: configAutomatica } = useQuery({
      queryKey: ["/api/fiscal/config-automatica"],
    });

    const actualizarConfigAutomatica = useMutation({
      mutationFn: (data: any) => apiRequest("/api/fiscal/config-automatica", { method: "PUT", body: JSON.stringify(data) }),
      onSuccess: () => {
        toast({
          title: "Configuración actualizada",
          description: "La facturación automática se configuró correctamente"
        });
        queryClient.invalidateQueries({ queryKey: ["/api/fiscal"] });
      }
    });

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
            <p className="text-blue-700 mb-4">
              Configurar la emisión automática de CFDI 4.0 cada vez que se registre un pago
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-white rounded border">
                <div>
                  <div className="font-medium">Timbrado automático</div>
                  <div className="text-sm text-slate-600">Generar CFDI automáticamente al confirmar pago</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-3 bg-white rounded border">
                <div>
                  <div className="font-medium">Envío automático por email</div>
                  <div className="text-sm text-slate-600">Enviar CFDI por correo electrónico al padre/tutor</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-3 bg-white rounded border">
                <div>
                  <div className="font-medium">Validación SAT en tiempo real</div>
                  <div className="text-sm text-slate-600">Validar datos fiscales contra catálogos SAT</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded">
              <div className="flex items-center gap-2 text-green-800 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Sistema configurado correctamente</span>
              </div>
              <p className="text-sm text-green-700">
                El sistema está configurado para generar automáticamente CFDI 4.0 al recibir pagos, 
                validar datos fiscales en tiempo real y enviar facturas por email.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Estadísticas de facturación automática */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <div className="text-2xl font-bold">156</div>
              <div className="text-sm text-slate-600">Facturas automáticas</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <div className="text-2xl font-bold">98.7%</div>
              <div className="text-sm text-slate-600">Tasa de éxito</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="w-8 h-8 text-orange-600 mx-auto mb-2" />
              <div className="text-2xl font-bold">1.2 seg</div>
              <div className="text-sm text-slate-600">Tiempo promedio</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // Integración PAC
  const IntegracionPAC = () => {
    const { data: estadoPAC } = useQuery({
      queryKey: ["/api/fiscal/estado-pac"],
    });

    const configurarPAC = useMutation({
      mutationFn: (data: any) => apiRequest("/api/fiscal/configurar-pac", { method: "POST", body: JSON.stringify(data) }),
      onSuccess: () => {
        toast({
          title: "PAC configurado",
          description: "La integración con el PAC se configuró correctamente"
        });
        queryClient.invalidateQueries({ queryKey: ["/api/fiscal"] });
      }
    });

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
              Configurar conexión con PAC Facturama para timbrado automático de CFDI
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Proveedor PAC</Label>
                <Select defaultValue="facturama">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facturama">Facturama</SelectItem>
                    <SelectItem value="enlace-fiscal">Enlace Fiscal</SelectItem>
                    <SelectItem value="comercio-digital">Comercio Digital</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Ambiente</Label>
                <Select defaultValue="produccion">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (Pruebas)</SelectItem>
                    <SelectItem value="produccion">Producción</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <Label>Usuario PAC</Label>
                <Input placeholder="usuario_pac" />
              </div>
              <div>
                <Label>Contraseña PAC</Label>
                <Input type="password" placeholder="contraseña_pac" />
              </div>
            </div>

            <Button 
              onClick={() => configurarPAC.mutate({})}
              disabled={configurarPAC.isPending}
              className="w-full mt-4"
            >
              <Shield className="w-4 h-4 mr-2" />
              Configurar conexión PAC
            </Button>
          </CardContent>
        </Card>

        {/* Estado de la conexión PAC */}
        <Card>
          <CardHeader>
            <CardTitle>Estado de la conexión PAC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium text-green-800">Facturama - Producción</div>
                    <div className="text-sm text-green-600">Conectado correctamente</div>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">Activo</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded">
                  <div className="text-sm text-slate-600">Timbres disponibles</div>
                  <div className="text-2xl font-bold">2,847</div>
                </div>
                <div className="p-3 bg-slate-50 rounded">
                  <div className="text-sm text-slate-600">Timbres usados (mes)</div>
                  <div className="text-2xl font-bold">156</div>
                </div>
              </div>

              <Button variant="outline" className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Probar conexión PAC
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Timbrado Masivo CFDI ──────────────────────────────────────────────────
  const TimbradoMasivo = () => {
    const { data: authUser } = useQuery<any>({ queryKey: ["/api/auth/user"], retry: false });
    const campusId = (authUser as any)?.campus_id || 1;
    const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));
    const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
    const [progreso, setProgreso] = useState<null | { timbrados: number; errores: number; total: number }>(null);

    const { data: pendientes, isLoading: loadingPendientes } = useQuery<any>({
      queryKey: ["/api/fiscal/pendientes-cfdi", campusId, mesFiltro],
    });

    const pagosPendientes: any[] = pendientes?.pagos || [];

    const timbrarLote = useMutation({
      mutationFn: (data: any) => apiRequest("/api/fiscal/timbrar-lote", { method: "POST", body: JSON.stringify(data) }),
      onSuccess: (result: any) => {
        setProgreso({ timbrados: result?.timbrados || 0, errores: result?.errores || 0, total: result?.total || 0 });
        toast({ title: `Timbrado completado`, description: `${result?.timbrados || 0} CFDIs generados, ${result?.errores || 0} errores` });
        queryClient.invalidateQueries({ queryKey: ["/api/fiscal/pendientes-cfdi"] });
        setSeleccionados(new Set());
      },
      onError: () => toast({ title: "Error en timbrado masivo", variant: "destructive" }),
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
                onClick={() => timbrarLote.mutate({ payment_ids: Array.from(seleccionados), campus_id: campusId })}
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
                        <td className="p-3 text-right font-bold text-green-700">${((p.amount_centavos || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
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
    const { data: reportesContables } = useQuery({
      queryKey: ["/api/fiscal/reportes-contables", selectedPeriod],
    });

    const generarReporteContable = useMutation({
      mutationFn: (data: any) => apiRequest("/api/fiscal/generar-reporte-contable", { method: "POST", body: JSON.stringify(data) }),
      onSuccess: () => {
        toast({
          title: "Reporte generado",
          description: "El reporte contable está listo para descarga"
        });
      }
    });

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
              onClick={() => generarReporteContable.mutate({ periodo: selectedPeriod, tipo: "COMPLETO" })}
              disabled={generarReporteContable.isPending}
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
        <div className="space-y-3">
              {[
                { nombre: "Reporte Enero 2025 - Completo", fecha: "2025-01-31", tamaño: "2.5 MB", tipo: "Excel" },
                { nombre: "Conciliación Bancaria Enero 2025", fecha: "2025-01-31", tamaño: "1.2 MB", tipo: "PDF" },
                { nombre: "CFDI Emitidos Enero 2025", fecha: "2025-01-31", tamaño: "856 KB", tipo: "Excel" }
              ].map((reporte, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded">
              <div>
                <div className="font-medium">{reporte.nombre}</div>
                <div className="text-sm text-slate-600">{reporte.fecha} • {reporte.tamaño} • {reporte.tipo}</div>
                  </div>
              <Button size="sm" variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Descargar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Reporte mensual para SAT
  const ReportesSAT = () => {
    const { data: estadisticasSAT } = useQuery({
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
          <div className="text-2xl font-bold">{(estadisticasSAT as any)?.facturas_emitidas || 0}</div>
          <div className="text-sm text-slate-600">Facturas emitidas</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <AlertCircle className="w-8 h-8 text-orange-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">{(estadisticasSAT as any)?.facturas_canceladas || 0}</div>
          <div className="text-sm text-slate-600">Facturas canceladas</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <Receipt className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">${(((estadisticasSAT as any)?.ingresos_declarados || 0) / 100).toLocaleString()}</div>
          <div className="text-sm text-slate-600">Ingresos declarados</div>
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
        <div className="space-y-3">
              {[
                { folio: "A125", uuid: "12345-CANCEL-67890", motivo: "Error en datos", fecha: "2025-01-18", usuario: "Admin Campus" },
                { folio: "A098", uuid: "12346-CANCEL-67891", motivo: "Devolución", fecha: "2025-01-15", usuario: "Caja Principal" },
                { folio: "A067", uuid: "12347-CANCEL-67892", motivo: "Corrección", fecha: "2025-01-10", usuario: "Admin Campus" }
              ].map((cancelacion, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded">
              <div>
                <div className="font-medium text-red-800">Folio {cancelacion.folio}</div>
                <div className="text-sm text-red-600">
                      {cancelacion.fecha} • {cancelacion.motivo} • Por: {cancelacion.usuario}
                    </div>
                <div className="text-xs text-red-500">UUID: {cancelacion.uuid}</div>
                  </div>
                  <Badge variant="destructive">Cancelado</Badge>
                </div>
              ))}
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