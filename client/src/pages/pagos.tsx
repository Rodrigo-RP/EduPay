import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Sidebar from "@/components/layout/sidebar";
import SaaSInfo from "@/components/saas-info";
import { CreditCard, Banknote, Smartphone, Receipt, Download, Eye, DollarSign } from "lucide-react";

export default function Pagos() {
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Datos demo de pagos
  const pagos = [
    {
      id: 1,
      estudiante: "Carlos Pérez Méndez",
      concepto: "Colegiatura Diciembre",
      monto: 500000,
      metodo: "TARJETA",
      referencia: "pi_1234567890",
      fecha: "2024-12-10",
      estado: "completado",
      cfdi: "A001-12345-ABCDE-67890",
      origen: "PORTAL"
    },
    {
      id: 2,
      estudiante: "Andrea García Luna",
      concepto: "Colegiatura Noviembre",
      monto: 450000,
      metodo: "SPEI",
      referencia: "SPEI789012345",
      fecha: "2024-11-12",
      estado: "completado",
      cfdi: "A002-23456-BCDEF-78901",
      origen: "PORTAL"
    },
    {
      id: 3,
      estudiante: "Luis Martínez Gil",
      concepto: "Colegiatura Octubre",
      monto: 500000,
      metodo: "EFECTIVO",
      referencia: "CASH001",
      fecha: "2024-10-08",
      estado: "completado",
      cfdi: "A003-34567-CDEFG-89012",
      origen: "CAJA_FISICA"
    },
    {
      id: 4,
      estudiante: "Carlos Pérez Méndez",
      concepto: "Colegiatura Enero (Parcial)",
      monto: 250000,
      metodo: "PAYPAL",
      referencia: "PAYPAL456789",
      fecha: "2024-09-15",
      estado: "completado",
      cfdi: "A004-45678-DEFGH-90123",
      origen: "PORTAL"
    },
    {
      id: 5,
      estudiante: "Andrea García Luna",
      concepto: "Materiales Didácticos",
      monto: 135000,
      metodo: "OXXOPAY",
      referencia: "OXXO987654321",
      fecha: "2024-08-20",
      estado: "completado",
      cfdi: "A005-56789-EFGHI-01234",
      origen: "PORTAL"
    }
  ];

  const filteredPagos = pagos.filter(pago => {
    const matchesMethod = selectedMethod === "all" || pago.metodo === selectedMethod;
    const matchesStatus = selectedStatus === "all" || pago.estado === selectedStatus;
    return matchesMethod && matchesStatus;
  });

  const estadisticas = {
    totalPagos: pagos.length,
    montoTotal: pagos.reduce((sum, p) => sum + p.monto, 0),
    pagosTarjeta: pagos.filter(p => p.metodo === "TARJETA").length,
    pagosEfectivo: pagos.filter(p => p.metodo === "EFECTIVO").length,
    promedioPago: pagos.reduce((sum, p) => sum + p.monto, 0) / pagos.length
  };

  const getMetodoIcon = (metodo: string) => {
    switch (metodo) {
      case "TARJETA":
        return <CreditCard className="w-4 h-4" />;
      case "EFECTIVO":
        return <Banknote className="w-4 h-4" />;
      case "SPEI":
      case "PAYPAL":
      case "OXXOPAY":
        return <Smartphone className="w-4 h-4" />;
      default:
        return <CreditCard className="w-4 h-4" />;
    }
  };

  const getMetodoBadge = (metodo: string) => {
    const colors = {
      TARJETA: "bg-blue-100 text-blue-800",
      EFECTIVO: "bg-green-100 text-green-800",
      SPEI: "bg-purple-100 text-purple-800",
      PAYPAL: "bg-yellow-100 text-yellow-800",
      OXXOPAY: "bg-orange-100 text-orange-800"
    };
    
    return (
      <Badge className={colors[metodo as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {getMetodoIcon(metodo)}
        <span className="ml-1">{metodo}</span>
      </Badge>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <SaaSInfo />
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Gestión de Pagos</h1>
              <p className="text-slate-600">Administra pagos recibidos, métodos y conciliación</p>
            </div>
            <div className="flex gap-2">
              <Button className="bg-green-600 hover:bg-green-700">
                <Banknote className="w-4 h-4 mr-2" />
                Registrar Pago Efectivo
              </Button>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Receipt className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.totalPagos}</div>
                <div className="text-sm text-slate-600">Total pagos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <DollarSign className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">${(estadisticas.montoTotal / 100).toLocaleString()}</div>
                <div className="text-sm text-slate-600">Monto total</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <CreditCard className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.pagosTarjeta}</div>
                <div className="text-sm text-slate-600">Pagos tarjeta</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Banknote className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.pagosEfectivo}</div>
                <div className="text-sm text-slate-600">Pagos efectivo</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">${(estadisticas.promedioPago / 100).toLocaleString()}</div>
                <div className="text-sm text-slate-600">Promedio por pago</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="lista" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="lista">Lista de pagos</TabsTrigger>
              <TabsTrigger value="efectivo">Registro efectivo</TabsTrigger>
              <TabsTrigger value="conciliacion">Conciliación</TabsTrigger>
            </TabsList>

            <TabsContent value="lista">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Historial de pagos</CardTitle>
                    <div className="flex gap-4">
                      <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Método" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="TARJETA">Tarjeta</SelectItem>
                          <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                          <SelectItem value="SPEI">SPEI</SelectItem>
                          <SelectItem value="PAYPAL">PayPal</SelectItem>
                          <SelectItem value="OXXOPAY">OXXO Pay</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="completado">Completados</SelectItem>
                          <SelectItem value="pendiente">Pendientes</SelectItem>
                          <SelectItem value="fallido">Fallidos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredPagos.map((pago) => (
                      <div key={pago.id} className="p-4 border rounded-lg hover:bg-slate-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{pago.estudiante}</h3>
                              {getMetodoBadge(pago.metodo)}
                              <Badge variant="outline" className="text-xs">
                                {pago.origen}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600">{pago.concepto}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                              <span>Fecha: {pago.fecha}</span>
                              <span>Ref: {pago.referencia}</span>
                              <span>CFDI: {pago.cfdi}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-lg font-bold">${(pago.monto / 100).toLocaleString()}</div>
                              <Badge className="bg-green-100 text-green-800">
                                {pago.estado}
                              </Badge>
                            </div>
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
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="efectivo">
              <Card>
                <CardHeader>
                  <CardTitle>Registrar pago en efectivo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label>Estudiante</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Buscar estudiante..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Carlos Pérez Méndez</SelectItem>
                          <SelectItem value="2">Andrea García Luna</SelectItem>
                          <SelectItem value="3">Luis Martínez Gil</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Concepto a pagar</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar concepto..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Colegiatura Enero - $5,000</SelectItem>
                          <SelectItem value="2">Materiales - $1,500</SelectItem>
                          <SelectItem value="3">Inscripción - $3,000</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Monto recibido (MXN)</Label>
                      <Input type="number" placeholder="5000" />
                    </div>
                    <div>
                      <Label>Recibido por</Label>
                      <Input placeholder="Nombre del cajero" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Label>Observaciones</Label>
                    <textarea 
                      className="w-full p-2 border rounded"
                      rows={2}
                      placeholder="Observaciones adicionales..."
                    />
                  </div>
                  <Button className="mt-4 bg-green-600 hover:bg-green-700">
                    <Banknote className="w-4 h-4 mr-2" />
                    Registrar pago y emitir recibo
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="conciliacion">
              <Card>
                <CardHeader>
                  <CardTitle>Conciliación bancaria</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">15</div>
                        <div className="text-sm text-slate-600">Movimientos conciliados</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">3</div>
                        <div className="text-sm text-slate-600">Pendientes de conciliar</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">1</div>
                        <div className="text-sm text-slate-600">Diferencias encontradas</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Button className="bg-blue-600 hover:bg-blue-700">
                        Ejecutar conciliación automática
                      </Button>
                      <Button variant="outline">
                        Importar estado de cuenta
                      </Button>
                      <Button variant="outline">
                        Exportar reporte
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}