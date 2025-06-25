import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Sidebar from "@/components/layout/sidebar";
import SaaSInfo from "@/components/saas-info";
import { AlertTriangle, TrendingDown, Clock, DollarSign, Users, Phone, Mail } from "lucide-react";

export default function CuentasPorCobrar() {
  const [selectedEstado, setSelectedEstado] = useState("all");
  const [selectedDiasVencido, setSelectedDiasVencido] = useState("all");

  // Datos demo de cuentas por cobrar
  const cuentasPorCobrar = [
    {
      id: 1,
      estudiante: "Carlos Pérez Méndez",
      responsable: "Carlos Pérez",
      telefono: "5551234567",
      email: "carlos.perez@gmail.com",
      concepto: "Colegiatura Enero 2025",
      monto_original_centavos: 500000,
      monto_pendiente_centavos: 500000,
      dias_vencido: 5,
      estado_cobranza: "VENCIDO",
      fecha_vencimiento: "2025-01-15",
      fecha_ultimo_seguimiento: "2025-01-18",
      observaciones_cobranza: "Padre confirmó pago para el 25 de enero"
    },
    {
      id: 2,
      estudiante: "Andrea García Luna",
      responsable: "Ana García",
      telefono: "5559876543",
      email: "ana.garcia@yahoo.com",
      concepto: "Materiales Didácticos",
      monto_original_centavos: 150000,
      monto_pendiente_centavos: 135000,
      dias_vencido: 0,
      estado_cobranza: "CORRIENTE",
      fecha_vencimiento: "2025-01-25",
      fecha_ultimo_seguimiento: null,
      observaciones_cobranza: null
    },
    {
      id: 3,
      estudiante: "Luis Martínez Gil",
      responsable: "Luis Martínez",
      telefono: "5555678901",
      email: "luis.martinez@hotmail.com",
      concepto: "Colegiatura Diciembre 2024",
      monto_original_centavos: 500000,
      monto_pendiente_centavos: 550000,
      dias_vencido: 35,
      estado_cobranza: "MOROSO",
      fecha_vencimiento: "2024-12-15",
      fecha_ultimo_seguimiento: "2025-01-15",
      observaciones_cobranza: "Prometió pago parcial. Aplicar plan de pagos."
    },
    {
      id: 4,
      estudiante: "Diego Martínez Gil",
      responsable: "Luis Martínez",
      telefono: "5555678901",
      email: "luis.martinez@hotmail.com",
      concepto: "Colegiatura Enero 2025",
      monto_original_centavos: 500000,
      monto_pendiente_centavos: 425000,
      dias_vencido: 0,
      estado_cobranza: "CORRIENTE",
      fecha_vencimiento: "2025-01-15",
      fecha_ultimo_seguimiento: null,
      observaciones_cobranza: null
    },
    {
      id: 5,
      estudiante: "Sofía López Ruiz",
      responsable: "María López",
      telefono: "5554567890",
      email: "maria.lopez@gmail.com",
      concepto: "Inscripción 2024-2025",
      monto_original_centavos: 300000,
      monto_pendiente_centavos: 300000,
      dias_vencido: 15,
      estado_cobranza: "VENCIDO",
      fecha_vencimiento: "2025-01-05",
      fecha_ultimo_seguimiento: "2025-01-10",
      observaciones_cobranza: "No contesta llamadas. Enviar notificación por WhatsApp."
    },
    {
      id: 6,
      estudiante: "Roberto Silva Morales",
      responsable: "Carmen Silva",
      telefono: "5553456789",
      email: "carmen.silva@outlook.com",
      concepto: "Seguro Escolar",
      monto_original_centavos: 80000,
      monto_pendiente_centavos: 80000,
      dias_vencido: 60,
      estado_cobranza: "MOROSO",
      fecha_vencimiento: "2024-11-20",
      fecha_ultimo_seguimiento: "2024-12-15",
      observaciones_cobranza: "Situación económica difícil. Evaluar beca socioeconómica."
    }
  ];

  const filteredCuentas = cuentasPorCobrar.filter(cuenta => {
    const matchesEstado = selectedEstado === "all" || cuenta.estado_cobranza === selectedEstado;
    const matchesDias = selectedDiasVencido === "all" || 
      (selectedDiasVencido === "0-7" && cuenta.dias_vencido >= 0 && cuenta.dias_vencido <= 7) ||
      (selectedDiasVencido === "8-30" && cuenta.dias_vencido >= 8 && cuenta.dias_vencido <= 30) ||
      (selectedDiasVencido === "31+" && cuenta.dias_vencido > 30);
    return matchesEstado && matchesDias;
  });

  const estadisticas = {
    totalCuentas: cuentasPorCobrar.length,
    montoPendienteTotal: cuentasPorCobrar.reduce((sum, c) => sum + c.monto_pendiente_centavos, 0),
    cuentasVencidas: cuentasPorCobrar.filter(c => c.estado_cobranza === "VENCIDO").length,
    cuentasMorosas: cuentasPorCobrar.filter(c => c.estado_cobranza === "MOROSO").length,
    promedioTiempoVencimiento: cuentasPorCobrar.filter(c => c.dias_vencido > 0).reduce((sum, c) => sum + c.dias_vencido, 0) / cuentasPorCobrar.filter(c => c.dias_vencido > 0).length || 0
  };

  const getEstadoBadge = (estado: string, diasVencido: number) => {
    switch (estado) {
      case "CORRIENTE":
        return <Badge className="bg-green-100 text-green-800">Al corriente</Badge>;
      case "VENCIDO":
        return <Badge className="bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Vencido ({diasVencido}d)
        </Badge>;
      case "MOROSO":
        return <Badge className="bg-red-100 text-red-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Moroso ({diasVencido}d)
        </Badge>;
      case "INCOBRABLE":
        return <Badge className="bg-gray-100 text-gray-800">
          <TrendingDown className="w-3 h-3 mr-1" />
          Incobrable
        </Badge>;
      default:
        return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  const getPrioridadColor = (diasVencido: number, estado: string) => {
    if (estado === "MOROSO" || diasVencido > 30) return "border-red-200 bg-red-50";
    if (estado === "VENCIDO" || diasVencido > 0) return "border-yellow-200 bg-yellow-50";
    return "border-slate-200";
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <SaaSInfo />
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Cuentas por Cobrar</h1>
              <p className="text-slate-600">Gestión de cartera vencida y seguimiento de cobranza</p>
            </div>
            <div className="flex gap-2">
              <Button className="bg-orange-600 hover:bg-orange-700">
                <Phone className="w-4 h-4 mr-2" />
                Iniciar Cobranza
              </Button>
              <Button variant="outline">
                <Mail className="w-4 h-4 mr-2" />
                Enviar Recordatorios
              </Button>
            </div>
          </div>

          {/* KPIs de cobranza */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.totalCuentas}</div>
                <div className="text-sm text-slate-600">Total cuentas</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <DollarSign className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">${(estadisticas.montoPendienteTotal / 100).toLocaleString()}</div>
                <div className="text-sm text-slate-600">Monto por cobrar</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Clock className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.cuentasVencidas}</div>
                <div className="text-sm text-slate-600">Cuentas vencidas</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.cuentasMorosas}</div>
                <div className="text-sm text-slate-600">Cuentas morosas</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{estadisticas.promedioTiempoVencimiento.toFixed(0)}</div>
                <div className="text-sm text-slate-600">Días promedio vencimiento</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="lista" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="lista">Lista de cuentas</TabsTrigger>
              <TabsTrigger value="seguimiento">Seguimiento de cobranza</TabsTrigger>
              <TabsTrigger value="reportes">Reportes de cartera</TabsTrigger>
            </TabsList>

            <TabsContent value="lista">
              {/* Filtros */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Filtros de búsqueda</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Estado de cobranza</Label>
                      <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los estados</SelectItem>
                          <SelectItem value="CORRIENTE">Al corriente</SelectItem>
                          <SelectItem value="VENCIDO">Vencido</SelectItem>
                          <SelectItem value="MOROSO">Moroso</SelectItem>
                          <SelectItem value="INCOBRABLE">Incobrable</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Días vencido</Label>
                      <Select value={selectedDiasVencido} onValueChange={setSelectedDiasVencido}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="0-7">0-7 días</SelectItem>
                          <SelectItem value="8-30">8-30 días</SelectItem>
                          <SelectItem value="31+">Más de 30 días</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button variant="outline" onClick={() => {
                        setSelectedEstado("all");
                        setSelectedDiasVencido("all");
                      }}>
                        Limpiar filtros
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cuentas por cobrar ({filteredCuentas.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredCuentas.map((cuenta) => (
                      <div key={cuenta.id} className={`p-4 border rounded-lg ${getPrioridadColor(cuenta.dias_vencido, cuenta.estado_cobranza)}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{cuenta.estudiante}</h3>
                              {getEstadoBadge(cuenta.estado_cobranza, cuenta.dias_vencido)}
                            </div>
                            <p className="text-sm text-slate-600">{cuenta.concepto}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                              <span>Responsable: {cuenta.responsable}</span>
                              <span>Tel: {cuenta.telefono}</span>
                              <span>Email: {cuenta.email}</span>
                              <span>Vencimiento: {cuenta.fecha_vencimiento}</span>
                            </div>
                            {cuenta.observaciones_cobranza && (
                              <div className="mt-2 p-2 bg-slate-100 rounded text-xs">
                                <strong>Observaciones:</strong> {cuenta.observaciones_cobranza}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-red-600">
                              ${(cuenta.monto_pendiente_centavos / 100).toLocaleString()}
                            </div>
                            <div className="text-xs text-slate-500">
                              Original: ${(cuenta.monto_original_centavos / 100).toLocaleString()}
                            </div>
                            <div className="flex gap-1 mt-2">
                              <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                                <Phone className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline">
                                <Mail className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="seguimiento">
              <Card>
                <CardHeader>
                  <CardTitle>Programar seguimiento de cobranza</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label>Seleccionar cuenta</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Buscar estudiante..." />
                        </SelectTrigger>
                        <SelectContent>
                          {cuentasPorCobrar.filter(c => c.estado_cobranza !== "CORRIENTE").map(cuenta => (
                            <SelectItem key={cuenta.id} value={cuenta.id.toString()}>
                              {cuenta.estudiante} - ${(cuenta.monto_pendiente_centavos / 100).toLocaleString()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tipo de seguimiento</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="llamada">Llamada telefónica</SelectItem>
                          <SelectItem value="email">Envío de email</SelectItem>
                          <SelectItem value="whatsapp">Mensaje WhatsApp</SelectItem>
                          <SelectItem value="visita">Visita domiciliaria</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Fecha programada</Label>
                      <Input type="date" />
                    </div>
                    <div>
                      <Label>Responsable del seguimiento</Label>
                      <Input placeholder="Nombre del responsable" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Observaciones</Label>
                      <textarea 
                        className="w-full p-2 border rounded"
                        rows={3}
                        placeholder="Notas del seguimiento..."
                      />
                    </div>
                  </div>
                  <Button className="mt-4 bg-orange-600 hover:bg-orange-700">
                    Programar seguimiento
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reportes">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Reporte de antigüedad de saldos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span>Corriente (0 días):</span>
                        <span className="font-semibold">$5,600</span>
                      </div>
                      <div className="flex justify-between">
                        <span>1-30 días vencido:</span>
                        <span className="font-semibold text-yellow-600">$8,000</span>
                      </div>
                      <div className="flex justify-between">
                        <span>31-60 días vencido:</span>
                        <span className="font-semibold text-orange-600">$3,800</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Más de 60 días:</span>
                        <span className="font-semibold text-red-600">$2,600</span>
                      </div>
                      <hr />
                      <div className="flex justify-between font-bold">
                        <span>Total cartera:</span>
                        <span>$20,000</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Acciones recomendadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Button className="w-full bg-orange-600 hover:bg-orange-700">
                        Generar reporte de morosidad
                      </Button>
                      <Button className="w-full" variant="outline">
                        Exportar cartera vencida
                      </Button>
                      <Button className="w-full" variant="outline">
                        Programar recordatorios masivos
                      </Button>
                      <Button className="w-full" variant="outline">
                        Análisis de riesgo crediticio
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}