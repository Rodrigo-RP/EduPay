import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Calendar, Filter, Search, Download, Clock, User, FileText, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface AuditEntry {
  id: number;
  user_id: number | null;
  guardian_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number;
  previous_value: string | null;
  new_value: string | null;
  user_name: string | null;
  user_email: string | null;
  guardian_name: string | null;
  ip_address: string | null;
  metadata: string | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { color: string; label: string }> = {
  "charge.status_changed":   { color: "bg-blue-100 text-blue-800",   label: "Cambio de estado" },
  "payment.confirmed":       { color: "bg-green-100 text-green-800",  label: "Pago confirmado" },
  "payment.failed":          { color: "bg-red-100 text-red-800",      label: "Pago fallido" },
  "payment.refunded":        { color: "bg-orange-100 text-orange-800",label: "Pago revertido" },
  "invoice.stamped":         { color: "bg-purple-100 text-purple-800",label: "CFDI emitido" },
  "invoice.cancelled":       { color: "bg-red-100 text-red-800",      label: "CFDI cancelado" },
  "charge.created":          { color: "bg-cyan-100 text-cyan-800",    label: "Cargo creado" },
  "charge.cancelled":        { color: "bg-red-100 text-red-800",      label: "Cargo cancelado" },
};

function getActionBadge(action: string) {
  const cfg = ACTION_CONFIG[action] ?? { color: "bg-gray-100 text-gray-800", label: action };
  return <Badge className={`${cfg.color} font-medium text-xs`}>{cfg.label}</Badge>;
}

function parseJSON(val: string | null): Record<string, any> {
  if (!val) return {};
  try { return JSON.parse(val); } catch { return {}; }
}

export default function Historial() {
  const { user } = useAuth();

  // Filtros
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const PAGE_SIZE = 50;

  // Construir querystring
  const params = new URLSearchParams();
  params.set("limit",  String(PAGE_SIZE));
  params.set("offset", String(pagina * PAGE_SIZE));
  if (fechaInicio) params.set("desde", fechaInicio);
  if (fechaFin)    params.set("hasta", fechaFin);
  if (filtroTipo !== "todos") params.set("action", filtroTipo);
  if (busqueda)    params.set("search", busqueda);

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  const { data, isLoading, isError, refetch } = useQuery<{ entries: AuditEntry[]; total: number }>({
    queryKey: ["/api/audit-log", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!user,
  });

  const entries  = data?.entries ?? [];
  const total    = data?.total   ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Estadísticas de contexto
  const hoy = new Date().toISOString().split("T")[0];
  const movimientosHoy = entries.filter(e => e.created_at.startsWith(hoy)).length;

  const limpiarFiltros = () => {
    setFechaInicio("");
    setFechaFin("");
    setFiltroTipo("todos");
    setBusqueda("");
    setPagina(0);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Historial de Movimientos</h1>
          <p className="mt-2 text-sm text-gray-600">
            Registro inmutable de todas las acciones financieras realizadas en el sistema
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span className="font-medium">No se pudieron cargar los eventos.</span>
          <button onClick={() => refetch()} className="underline hover:no-underline">Reintentar</button>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros de Búsqueda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Acción, entidad, metadata..."
                  className="pl-10"
                  value={busqueda}
                  onChange={(e) => { setBusqueda(e.target.value); setPagina(0); }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha Inicio</label>
              <Input type="date" value={fechaInicio} onChange={(e) => { setFechaInicio(e.target.value); setPagina(0); }} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha Fin</label>
              <Input type="date" value={fechaFin} onChange={(e) => { setFechaFin(e.target.value); setPagina(0); }} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Acción</label>
              <Select value={filtroTipo} onValueChange={(v) => { setFiltroTipo(v); setPagina(0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los tipos</SelectItem>
                  <SelectItem value="charge.status_changed">Cambio de estado de cargo</SelectItem>
                  <SelectItem value="payment.confirmed">Pago confirmado</SelectItem>
                  <SelectItem value="payment.failed">Pago fallido</SelectItem>
                  <SelectItem value="payment.refunded">Pago revertido</SelectItem>
                  <SelectItem value="invoice.stamped">CFDI emitido</SelectItem>
                  <SelectItem value="invoice.cancelled">CFDI cancelado</SelectItem>
                  <SelectItem value="charge.created">Cargo creado</SelectItem>
                  <SelectItem value="charge.cancelled">Cargo cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium opacity-0">Acciones</label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={limpiarFiltros}>
                  Limpiar
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de eventos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Registro de Auditoría</span>
            <Badge variant="secondary">{total} registros</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Fecha y hora</TableHead>
                <TableHead className="w-[160px]">Tipo de acción</TableHead>
                <TableHead className="w-[80px]">Entidad</TableHead>
                <TableHead className="w-[60px]">ID</TableHead>
                <TableHead className="w-[160px]">Usuario</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-gray-300" />
                      <p className="font-medium">Sin registros de auditoría</p>
                      <p className="text-sm">
                        Los movimientos aparecerán aquí cuando se realicen acciones financieras en el sistema
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => {
                  const prev = parseJSON(entry.previous_value);
                  const next = parseJSON(entry.new_value);
                  const meta = parseJSON(entry.metadata);
                  const actor = entry.user_name || entry.guardian_name || "Sistema";

                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs text-gray-600">
                        {new Date(entry.created_at).toLocaleString("es-MX", {
                          year: "numeric", month: "2-digit", day: "2-digit",
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>{getActionBadge(entry.action)}</TableCell>
                      <TableCell className="text-xs capitalize text-gray-600">{entry.entity_type}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">#{entry.entity_id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-sm truncate max-w-[130px]" title={actor}>{actor}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {prev.estado && next.estado ? (
                          <span>
                            <span className="font-mono bg-gray-100 px-1 rounded">{prev.estado}</span>
                            {" → "}
                            <span className="font-mono bg-blue-50 text-blue-700 px-1 rounded">{next.estado}</span>
                          </span>
                        ) : meta.alumno ? (
                          <span className="text-blue-600 font-medium">{meta.alumno}</span>
                        ) : (
                          <span className="text-gray-400 italic text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-gray-500">
                Página {pagina + 1} de {totalPages} — {total} registros totales
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={pagina >= totalPages - 1} onClick={() => setPagina(p => p + 1)}>
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{movimientosHoy}</p>
                <p className="text-sm text-gray-600">Acciones hoy (página)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-purple-600 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-sm text-gray-600">Total registros</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <User className="w-8 h-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">
                  {new Set(entries.filter(e => e.user_id).map((e: any) => e.user_id)).size}
                </p>
                <p className="text-sm text-gray-600">Usuarios (página)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-orange-600 flex-shrink-0" />
              <div>
                <p className="text-2xl font-bold">{totalPages}</p>
                <p className="text-sm text-gray-600">Páginas totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
