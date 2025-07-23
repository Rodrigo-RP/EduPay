import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Search, Download, FileText, Filter, Users, DollarSign, Calendar, TrendingUp, Eye } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useInstitution } from "@/hooks/use-institution";

// Tipos para las cuentas por cobrar
interface CuentaPorCobrar {
  id: number;
  estudiante: string;
  responsable: string;
  telefono: string;
  email: string;
  nivel_escolar: string;
  grado: string;
  concepto: string;
  fecha_cargo: string;
  monto_inicial_centavos: number;
  descuentos_centavos?: number;
  recargos_centavos?: number;
  total_pagado_centavos: number;
  pendiente_pagar_centavos: number;
  dias_vencido: number;
  estado_cobranza: string;
  fecha_vencimiento: string;
  fecha_compromiso?: string | null;
  cuenta_habilitada: boolean;
  fecha_ultimo_seguimiento?: string;
  observaciones_cobranza?: string;
}

export default function CuentasPorCobrar() {
  // Estados para filtros
  const [selectedEstado, setSelectedEstado] = useState("all");
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroConcepto, setFiltroConcepto] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [selectedPeriodo, setSelectedPeriodo] = useState("enero-2025");
  const [selectedFormato, setSelectedFormato] = useState("detallado");

  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();
  const { user } = useAuth();

  // Obtener datos reales de cuentas por cobrar
  const { data: cuentasPorCobrarData = [], isLoading, error } = useQuery({
    queryKey: ["/api/accounts-receivable"],
    enabled: !!user?.campus_id,
    retry: 1,
    staleTime: 0
  });

  // Mostrar estado de carga
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando cuentas por cobrar...</p>
        </div>
      </div>
    );
  }

  // Mostrar error si hay problemas con la consulta
  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Error al cargar datos</h2>
          <p className="text-slate-600 mb-4">No se pudieron cargar las cuentas por cobrar</p>
          <Button onClick={() => window.location.reload()}>
            Intentar nuevamente
          </Button>
        </div>
      </div>
    );
  }

  // Usar datos de la API
  const cuentasPorCobrar: CuentaPorCobrar[] = cuentasPorCobrarData;

  // Función para filtrar las cuentas
  const filtrarCuentas = (cuentas: CuentaPorCobrar[]) => {
    return cuentas.filter((cuenta) => {
      const matchEstado = selectedEstado === "all" || cuenta.estado_cobranza === selectedEstado;
      const matchNombre = !filtroNombre || cuenta.estudiante.toLowerCase().includes(filtroNombre.toLowerCase());
      const matchConcepto = !filtroConcepto || cuenta.concepto.toLowerCase().includes(filtroConcepto.toLowerCase());
      
      return matchEstado && matchNombre && matchConcepto;
    });
  };

  // Aplicar filtros
  const cuentasFiltradas = filtrarCuentas(cuentasPorCobrar);

  // Calcular métricas
  const totalPorCobrar = cuentasFiltradas.reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const totalVencido = cuentasFiltradas.filter(c => c.estado_cobranza === "VENCIDO" || c.estado_cobranza === "MOROSO").reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const totalCorriente = cuentasFiltradas.filter(c => c.estado_cobranza === "CORRIENTE").reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const totalPagado = cuentasFiltradas.reduce((sum, c) => sum + c.total_pagado_centavos, 0);

  // Datos para gráficos
  const statusData = [
    { name: 'Corriente', value: cuentasFiltradas.filter(c => c.estado_cobranza === "CORRIENTE").length, color: '#00C49F' },
    { name: 'Vencido', value: cuentasFiltradas.filter(c => c.estado_cobranza === "VENCIDO").length, color: '#FFBB28' },
    { name: 'Moroso', value: cuentasFiltradas.filter(c => c.estado_cobranza === "MOROSO").length, color: '#FF8042' },
    { name: 'Pagado', value: cuentasFiltradas.filter(c => c.estado_cobranza === "PAGADO").length, color: '#0088FE' },
    { name: 'Parcial', value: cuentasFiltradas.filter(c => c.estado_cobranza === "PARCIAL").length, color: '#8884D8' }
  ];

  const daysOverdueData = [
    { name: '0-7 días', value: cuentasFiltradas.filter(c => c.dias_vencido >= 0 && c.dias_vencido <= 7).length, color: '#00C49F' },
    { name: '8-30 días', value: cuentasFiltradas.filter(c => c.dias_vencido > 7 && c.dias_vencido <= 30).length, color: '#FFBB28' },
    { name: '31-60 días', value: cuentasFiltradas.filter(c => c.dias_vencido > 30 && c.dias_vencido <= 60).length, color: '#FF8042' },
    { name: '60+ días', value: cuentasFiltradas.filter(c => c.dias_vencido > 60).length, color: '#8884D8' }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cuentas por Cobrar</h1>
          <p className="text-slate-600 mt-1">Gestión y seguimiento de cartera de clientes</p>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600">Total por Cobrar</p>
                <p className="text-2xl font-bold text-slate-900">
                  ${(totalPorCobrar / 100).toLocaleString('es-MX')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600">Vencido</p>
                <p className="text-2xl font-bold text-red-600">
                  ${(totalVencido / 100).toLocaleString('es-MX')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600">Corriente</p>
                <p className="text-2xl font-bold text-green-600">
                  ${(totalCorriente / 100).toLocaleString('es-MX')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-slate-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600">Total Cuentas</p>
                <p className="text-2xl font-bold text-slate-900">{cuentasFiltradas.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Estado de Cobranza</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Cuentas']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Días Vencidos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={daysOverdueData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  dataKey="value"
                >
                  {daysOverdueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Cuentas']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lista">Lista de cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros
              </CardTitle>
              <CardDescription>
                Filtrar cuentas por estado, estudiante y concepto
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <Label htmlFor="filtro-estado">Estado</Label>
                  <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                    <SelectTrigger id="filtro-estado">
                      <SelectValue placeholder="Todos los estados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="CORRIENTE">Corriente</SelectItem>
                      <SelectItem value="VENCIDO">Vencido</SelectItem>
                      <SelectItem value="MOROSO">Moroso</SelectItem>
                      <SelectItem value="PAGADO">Pagado</SelectItem>
                      <SelectItem value="PARCIAL">Parcial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="filtro-nombre">Buscar estudiante</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="filtro-nombre"
                      placeholder="Escriba el nombre completo..."
                      value={filtroNombre}
                      onChange={(e) => setFiltroNombre(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="filtro-concepto">Concepto</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="filtro-concepto"
                      placeholder="Tipo de cargo..."
                      value={filtroConcepto}
                      onChange={(e) => setFiltroConcepto(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="fecha-inicio">Fecha inicio</Label>
                  <Input
                    id="fecha-inicio"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="fecha-fin">Fecha fin</Label>
                  <Input
                    id="fecha-fin"
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedEstado("all");
                      setFiltroNombre("");
                      setFiltroConcepto("");
                      setFechaInicio("");
                      setFechaFin("");
                    }}
                    className="w-full"
                  >
                    Limpiar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabla de cuentas */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Cuentas ({cuentasFiltradas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-3 font-medium text-slate-700">Estudiante</th>
                      <th className="text-left p-3 font-medium text-slate-700">Concepto</th>
                      <th className="text-right p-3 font-medium text-slate-700">Monto</th>
                      <th className="text-right p-3 font-medium text-slate-700">Pendiente</th>
                      <th className="text-center p-3 font-medium text-slate-700">Estado</th>
                      <th className="text-center p-3 font-medium text-slate-700">Días Venc.</th>
                      <th className="text-center p-3 font-medium text-slate-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentasFiltradas.map((cuenta) => (
                      <tr key={cuenta.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div>
                            <div className="font-medium text-slate-900">{cuenta.estudiante}</div>
                            <div className="text-sm text-slate-600">{cuenta.nivel_escolar} - {cuenta.grado}</div>
                          </div>
                        </td>
                        <td className="p-3 text-sm">{cuenta.concepto}</td>
                        <td className="p-3 text-sm text-right">
                          ${(cuenta.monto_inicial_centavos / 100).toLocaleString('es-MX')}
                        </td>
                        <td className="p-3 text-sm text-right text-red-600">
                          ${(cuenta.pendiente_pagar_centavos / 100).toLocaleString('es-MX')}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            className={
                              cuenta.estado_cobranza === "PAGADO" ? "bg-green-100 text-green-800 border-green-200" :
                              cuenta.estado_cobranza === "MOROSO" ? "bg-red-100 text-red-800 border-red-200" :
                              cuenta.estado_cobranza === "VENCIDO" ? "bg-orange-100 text-orange-800 border-orange-200" :
                              cuenta.estado_cobranza === "PARCIAL" ? "bg-blue-100 text-blue-800 border-blue-200" :
                              "bg-gray-100 text-gray-800 border-gray-200"
                            }
                          >
                            {cuenta.estado_cobranza}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm text-center">
                          <span className={cuenta.dias_vencido > 0 ? "text-red-600 font-medium" : "text-slate-600"}>
                            {cuenta.dias_vencido}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <Button size="sm" variant="outline">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguimiento">
          <Card>
            <CardHeader>
              <CardTitle>Seguimiento de Cobranza</CardTitle>
              <CardDescription>
                Gestión de seguimiento y recordatorios de pago
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Funcionalidad de seguimiento en desarrollo.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <Card>
            <CardHeader>
              <CardTitle>Reportes de Cuentas por Cobrar</CardTitle>
              <CardDescription>
                Generar reportes detallados de cartera de clientes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Funcionalidad de reportes en desarrollo.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}