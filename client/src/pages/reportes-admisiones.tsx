import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// ─── tipos ────────────────────────────────────────────────────────────────────

interface Alumno {
  alumno_id:               number;
  alumno:                  string;   // nombre_completo
  nivel:                   string;   // nivel_escolar
  grado:                   string;
  grupo:                   string;
  estado:                  string;   // status
  con_beca:                boolean;
  porcentaje_beca:         number;
  motivo_beca:             string;
  monto_descuento_centavos: number;
  tutor:                   string | null;
  tutor_email:             string | null;
  fecha_registro:          string | null;
}

interface Resumen {
  total_alumnos:            number;
  alumnos_con_beca:         number;
  monto_descuento_centavos: number;
  inscripciones: {
    total:          number;
    monto_centavos: number;
    ciclo:          string;
  };
}

interface ReporteAdmisiones {
  resumen:      Resumen;
  por_tipo_beca: { tipo: string; categoria: string; cantidad: number; porcentaje_promedio: number }[];
  alumnos:      Alumno[];
  total:        number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatMXN(centavos: number) {
  return (centavos / 100).toLocaleString("es-MX", {
    style:    "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
  });
}

// ─── componente ───────────────────────────────────────────────────────────────

export default function ReportesAdmisiones() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [filtros, setFiltros] = useState({
    ciclo:  "",       // vacío = ciclo actual (el servidor lo calcula)
    nivel:  "todos",
    estado: "todos",
    beca:   "todos",  // filtro client-side sobre la lista ya devuelta
  });
  const [exporting, setExporting] = useState(false);

  // ── Consulta RPT-04 ──────────────────────────────────────────────────────
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  const queryParams = new URLSearchParams();
  if (filtros.ciclo)              queryParams.set("ciclo",  filtros.ciclo);
  if (filtros.nivel !== "todos")  queryParams.set("nivel",  filtros.nivel);
  if (filtros.estado !== "todos") queryParams.set("estado", filtros.estado);
  const qs = queryParams.toString();

  const { data: reporteData, isLoading, isError } = useQuery<ReporteAdmisiones>({
    queryKey: ["/api/reportes/admisiones", qs],
    queryFn: async () => {
      const res = await fetch(`/api/reportes/admisiones${qs ? "?" + qs : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!user && !!token,
  });

  // ── Datos derivados ──────────────────────────────────────────────────────
  const todosAlumnos: Alumno[] = reporteData?.alumnos ?? [];

  // Filtro beca client-side (ya que el server no lo soporta aún)
  const alumnos = todosAlumnos.filter(a => {
    if (filtros.beca === "con-beca")  return a.con_beca;
    if (filtros.beca === "sin-beca")  return !a.con_beca;
    return true;
  });

  const resumen = reporteData?.resumen ?? {
    total_alumnos: 0, alumnos_con_beca: 0, monto_descuento_centavos: 0,
    inscripciones: { total: 0, monto_centavos: 0, ciclo: "" },
  };

  // Distribución por nivel (client-side desde el listado ya filtrado)
  const porNivel = alumnos.reduce((acc, a) => {
    const nv = a.nivel || "Sin nivel";
    if (!acc[nv]) acc[nv] = { total: 0, activos: 0, con_beca: 0 };
    acc[nv].total++;
    if (a.estado === "activo") acc[nv].activos++;
    if (a.con_beca)            acc[nv].con_beca++;
    return acc;
  }, {} as Record<string, { total: number; activos: number; con_beca: number }>);

  // ── Exportar (server-side — reemplaza XLSX.utils client-side) ────────────
  const exportar = async (formato: "excel" | "pdf") => {
    if (!token) return;
    setExporting(true);
    try {
      const body: Record<string, string> = { formato };
      if (filtros.ciclo)              body.ciclo  = filtros.ciclo;
      if (filtros.nivel !== "todos")  body.nivel  = filtros.nivel;
      if (filtros.estado !== "todos") body.estado = filtros.estado;

      const r = await fetch("/api/reportes/admisiones/exportar", {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "Error desconocido" }));
        toast({ title: "Error al exportar", description: err.message, variant: "destructive" });
        return;
      }

      const blob    = await r.blob();
      const ext     = formato === "excel" ? "xlsx" : "pdf";
      const url     = URL.createObjectURL(blob);
      const a       = document.createElement("a");
      a.href        = url;
      a.download    = `reporte_admisiones_${new Date().toISOString().split("T")[0]}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title:       `Reporte ${formato === "excel" ? "Excel" : "PDF"} listo`,
        description: `Descargado: reporte_admisiones_${new Date().toISOString().split("T")[0]}.${ext}`,
      });
    } catch (e: any) {
      toast({ title: "Error al exportar", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-red-600">Error al cargar reporte de admisiones</p>
          <p className="text-sm text-slate-500">No se pudo obtener los datos del servidor. Intenta recargar la página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reportes de Admisiones</h1>
          <p className="text-slate-600">Becas activas, descuentos e inscripciones por ciclo</p>
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-700">
              <i className="fas fa-user-graduate"></i>
              <span className="text-sm font-medium">
                Perfil Admisiones — control de becas e inscripciones
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => exportar("excel")}
            disabled={exporting}
            className="bg-green-600 hover:bg-green-700"
          >
            <i className="fas fa-file-excel mr-2"></i>
            Exportar Excel
          </Button>
          <Button
            onClick={() => exportar("pdf")}
            disabled={exporting}
            className="bg-red-600 hover:bg-red-700"
          >
            <i className="fas fa-file-pdf mr-2"></i>
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-filter"></i>
            Filtros de Reporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="ciclo">Ciclo escolar</Label>
              <Input
                id="ciclo"
                placeholder="e.g. 2025-2026"
                value={filtros.ciclo}
                onChange={e => setFiltros({ ...filtros, ciclo: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="nivel">Nivel académico</Label>
              <Select
                value={filtros.nivel}
                onValueChange={v => setFiltros({ ...filtros, nivel: v })}
              >
                <SelectTrigger><SelectValue placeholder="Todos los niveles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Kinder">Kinder</SelectItem>
                  <SelectItem value="Primaria">Primaria</SelectItem>
                  <SelectItem value="Secundaria">Secundaria</SelectItem>
                  <SelectItem value="Bachillerato">Bachillerato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="estado">Estado del alumno</Label>
              <Select
                value={filtros.estado}
                onValueChange={v => setFiltros({ ...filtros, estado: v })}
              >
                <SelectTrigger><SelectValue placeholder="Todos los estados" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inscrito">Inscrito</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="beca">Beca</Label>
              <Select
                value={filtros.beca}
                onValueChange={v => setFiltros({ ...filtros, beca: v })}
              >
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="con-beca">Con beca</SelectItem>
                  <SelectItem value="sin-beca">Sin beca</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="resumen" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="estudiantes">Estudiantes</TabsTrigger>
          <TabsTrigger value="becas">Control de Becas</TabsTrigger>
        </TabsList>

        {/* ── Tab: Resumen ─────────────────────────────────────────────────── */}
        <TabsContent value="resumen" className="space-y-6">
          {/* Métricas principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <i className="fas fa-user-check text-blue-600"></i>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">
                      {isLoading ? "…" : resumen.total_alumnos}
                    </p>
                    <p className="text-sm text-slate-600">Total alumnos</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <i className="fas fa-graduation-cap text-green-600"></i>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {isLoading ? "…" : resumen.alumnos_con_beca}
                    </p>
                    <p className="text-sm text-slate-600">Con beca</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                    <i className="fas fa-tag text-yellow-600"></i>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-yellow-600">
                      {isLoading ? "…" : formatMXN(resumen.monto_descuento_centavos)}
                    </p>
                    <p className="text-sm text-slate-600">Monto descontado</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <i className="fas fa-credit-card text-purple-600"></i>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-600">
                      {isLoading ? "…" : resumen.inscripciones.total}
                    </p>
                    <p className="text-sm text-slate-600">Inscripciones pagadas</p>
                    {resumen.inscripciones.ciclo && (
                      <p className="text-xs text-slate-400">{resumen.inscripciones.ciclo}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Distribución por nivel */}
          <Card>
            <CardHeader>
              <CardTitle>Distribución por Nivel Académico</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : Object.keys(porNivel).length === 0 ? (
                <p className="text-center text-slate-500 py-6">Sin datos para los filtros seleccionados</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(porNivel).map(([nivel, datos]) => (
                    <div
                      key={nivel}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                    >
                      <div>
                        <h3 className="font-medium">{nivel}</h3>
                        <p className="text-sm text-slate-600">{datos.total} alumnos</p>
                      </div>
                      <div className="flex gap-4">
                        <div className="text-center">
                          <p className="text-lg font-bold text-blue-600">{datos.activos}</p>
                          <p className="text-xs text-slate-500">Activos</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-green-600">{datos.con_beca}</p>
                          <p className="text-xs text-slate-500">Con beca</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Distribución por tipo de beca */}
          {(reporteData?.por_tipo_beca ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Tipo de Beca</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(reporteData?.por_tipo_beca ?? []).map((t, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div>
                        <p className="font-medium">{t.tipo}</p>
                        {t.categoria && (
                          <p className="text-xs text-slate-500">{t.categoria}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge className="bg-green-100 text-green-800">{t.cantidad} alumnos</Badge>
                        <p className="text-xs text-slate-600 mt-1">
                          ~{t.porcentaje_promedio}% promedio
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab: Estudiantes ─────────────────────────────────────────────── */}
        <TabsContent value="estudiantes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Estudiantes ({alumnos.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">Alumno</th>
                        <th className="text-left p-3">Nivel</th>
                        <th className="text-left p-3">Grado / Grupo</th>
                        <th className="text-left p-3">Estado</th>
                        <th className="text-left p-3">Tutor</th>
                        <th className="text-left p-3">Email tutor</th>
                        <th className="text-left p-3">Beca</th>
                        <th className="text-right p-3">Descuento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alumnos.map(a => (
                        <tr key={a.alumno_id} className="border-b hover:bg-slate-50">
                          <td className="p-3 font-medium">{a.alumno}</td>
                          <td className="p-3">{a.nivel}</td>
                          <td className="p-3">{[a.grado, a.grupo].filter(Boolean).join(" / ")}</td>
                          <td className="p-3">
                            <Badge
                              variant={
                                a.estado === "activo"   ? "default"   :
                                a.estado === "inscrito" ? "secondary" : "outline"
                              }
                            >
                              {a.estado}
                            </Badge>
                          </td>
                          <td className="p-3">{a.tutor ?? "—"}</td>
                          <td className="p-3">{a.tutor_email ?? "—"}</td>
                          <td className="p-3">
                            {a.con_beca ? (
                              <Badge className="bg-green-100 text-green-800">
                                {a.porcentaje_beca}%
                              </Badge>
                            ) : (
                              <span className="text-slate-400">Sin beca</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono text-sm">
                            {a.monto_descuento_centavos > 0
                              ? formatMXN(a.monto_descuento_centavos)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {alumnos.length === 0 && (
                    <p className="text-center text-slate-500 py-6">
                      Sin estudiantes para los filtros seleccionados
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Control de Becas ────────────────────────────────────────── */}
        <TabsContent value="becas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Control de Becas y Descuentos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-4">
                    Estudiantes con beca ({alumnos.filter(a => a.con_beca).length})
                  </h3>
                  <div className="space-y-3">
                    {alumnos.filter(a => a.con_beca).map(a => (
                      <div
                        key={a.alumno_id}
                        className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{a.alumno}</p>
                          <p className="text-sm text-slate-600">
                            {a.nivel} — {a.grado}
                          </p>
                          {a.motivo_beca && (
                            <p className="text-xs text-slate-400 mt-1">{a.motivo_beca}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <Badge className="bg-green-100 text-green-800">
                            {a.porcentaje_beca}%
                          </Badge>
                          {a.monto_descuento_centavos > 0 && (
                            <p className="text-sm text-slate-600 mt-1">
                              {formatMXN(a.monto_descuento_centavos)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {alumnos.filter(a => a.con_beca).length === 0 && (
                      <p className="text-slate-500 text-sm">
                        Sin alumnos con beca para los filtros seleccionados
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-4">
                    Estudiantes sin beca ({alumnos.filter(a => !a.con_beca).length})
                  </h3>
                  <div className="space-y-3">
                    {alumnos
                      .filter(a => !a.con_beca)
                      .slice(0, 15)
                      .map(a => (
                        <div
                          key={a.alumno_id}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium">{a.alumno}</p>
                            <p className="text-sm text-slate-600">
                              {a.nivel} — {a.grado}
                            </p>
                          </div>
                          <Badge variant="outline">Sin beca</Badge>
                        </div>
                      ))}
                    {alumnos.filter(a => !a.con_beca).length > 15 && (
                      <p className="text-xs text-slate-400 text-center">
                        +{alumnos.filter(a => !a.con_beca).length - 15} más…
                      </p>
                    )}
                    {alumnos.filter(a => !a.con_beca).length === 0 && (
                      <p className="text-slate-500 text-sm">
                        Todos los alumnos tienen beca
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
