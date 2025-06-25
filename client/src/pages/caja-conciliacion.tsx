// Módulo 4: Caja y conciliación - Pagos efectivo, control bancario, conciliación automática
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
  DollarSign, 
  Banknote, 
  FileCheck, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Calculator,
  Download,
  Upload,
  RefreshCw
} from "lucide-react";

export default function CajaConciliacion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Registro de pagos en efectivo
  const PagoEfectivo = () => {
    const [pagoForm, setPagoForm] = useState({
      estudiante_id: "",
      concepto_id: "",
      monto: "",
      recibido_por: "",
      observaciones: ""
    });

    const registrarPagoEfectivo = useMutation({
      mutationFn: (data: any) => apiRequest("POST", "/api/caja/pago-efectivo", data),
      onSuccess: () => {
        toast({
          title: "Pago registrado",
          description: "El pago en efectivo se registró correctamente y se generará CFDI"
        });
        setPagoForm({
          estudiante_id: "",
          concepto_id: "",
          monto: "",
          recibido_por: "",
          observaciones: ""
        });
        queryClient.invalidateQueries({ queryKey: ["/api/caja"] });
      }
    });

    return (
      <div className="space-y-6">
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <Banknote className="w-5 h-5" />
              Registro de pago en efectivo
            </CardTitle>
          </CardHeader>
          <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
                <Label htmlFor="estudiante">Estudiante</Label>
                <Select value={pagoForm.estudiante_id} onValueChange={(value) => setPagoForm({...pagoForm, estudiante_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Buscar estudiante..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Carlos Pérez - 3ro A</SelectItem>
                    <SelectItem value="2">Ana García - 2do B</SelectItem>
                    <SelectItem value="3">Luis Martínez - 1ro A</SelectItem>
                  </SelectContent>
                </Select>
              </div>

          <div>
                <Label htmlFor="concepto">Concepto a pagar</Label>
                <Select value={pagoForm.concepto_id} onValueChange={(value) => setPagoForm({...pagoForm, concepto_id: value})}>
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
                <Label htmlFor="monto">Monto recibido (MXN)</Label>
                <Input
                  id="monto"
                  type="number"
                  value={pagoForm.monto}
                  onChange={(e) => setPagoForm({...pagoForm, monto: e.target.value})}
                  placeholder="5000"
                />
              </div>

          <div>
                <Label htmlFor="recibido_por">Recibido por</Label>
                <Input
                  id="recibido_por"
                  value={pagoForm.recibido_por}
                  onChange={(e) => setPagoForm({...pagoForm, recibido_por: e.target.value})}
                  placeholder="Nombre del cajero"
                />
              </div>
            </div>

        <div className="mt-4">
              <Label htmlFor="observaciones">Observaciones</Label>
              <textarea 
                id="observaciones"
                className="w-full p-2 border rounded"
                rows={2}
                value={pagoForm.observaciones}
                onChange={(e) => setPagoForm({...pagoForm, observaciones: e.target.value})}
                placeholder="Observaciones adicionales..."
              />
            </div>

            <Button 
              onClick={() => registrarPagoEfectivo.mutate(pagoForm)}
              disabled={registrarPagoEfectivo.isPending}
              className="w-full mt-4 bg-green-600 hover:bg-green-700"
            >
              <Banknote className="w-4 h-4 mr-2" />
              Registrar pago y emitir recibo
            </Button>
          </CardContent>
        </Card>

        {/* Pagos en efectivo del día */}
        <Card>
          <CardHeader>
            <CardTitle>Pagos en efectivo del día</CardTitle>
          </CardHeader>
          <CardContent>
        <div className="space-y-3">
              {[
                { hora: "09:30", estudiante: "Carlos Pérez", concepto: "Colegiatura Enero", monto: 500000, cajero: "Ana López" },
                { hora: "10:15", estudiante: "María García", concepto: "Materiales", monto: 150000, cajero: "Ana López" },
                { hora: "11:00", estudiante: "Luis Hernández", concepto: "Inscripción", monto: 300000, cajero: "Ana López" }
              ].map((pago, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded">
              <div>
                <div className="font-medium">{pago.estudiante}</div>
                <div className="text-sm text-slate-600">{pago.hora} • {pago.concepto}</div>
                <div className="text-xs text-slate-500">Cajero: {pago.cajero}</div>
                  </div>
              <div className="text-right">
                <div className="font-semibold">${(pago.monto / 100).toLocaleString()}</div>
                    <Badge variant="secondary">Registrado</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Control de pagos bancarios
  const PagosBancarios = () => {
    const { data: movimientosBanco } = useQuery({
      queryKey: ["/api/caja/movimientos-banco"],
    });

    const [transferenciasForm, setTransferenciasForm] = useState({
      referencia: "",
      monto: "",
      fecha: "",
      concepto: "",
      estudiante_id: ""
    });

    const registrarTransferencia = useMutation({
      mutationFn: (data: any) => apiRequest("POST", "/api/caja/transferencia-manual", data),
      onSuccess: () => {
        toast({
          title: "Transferencia registrada",
          description: "El pago bancario se registró correctamente"
        });
        queryClient.invalidateQueries({ queryKey: ["/api/caja/movimientos-banco"] });
      }
    });

    return (
      <div className="space-y-6">
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <FileCheck className="w-5 h-5" />
              Registro de transferencias bancarias
            </CardTitle>
          </CardHeader>
          <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
                <Label htmlFor="referencia">Referencia bancaria</Label>
                <Input
                  id="referencia"
                  value={transferenciasForm.referencia}
                  onChange={(e) => setTransferenciasForm({...transferenciasForm, referencia: e.target.value})}
                  placeholder="REF123456789"
                />
              </div>

          <div>
                <Label htmlFor="monto_banco">Monto transferido</Label>
                <Input
                  id="monto_banco"
                  type="number"
                  value={transferenciasForm.monto}
                  onChange={(e) => setTransferenciasForm({...transferenciasForm, monto: e.target.value})}
                  placeholder="5000"
                />
              </div>

          <div>
                <Label htmlFor="fecha_transferencia">Fecha de transferencia</Label>
                <Input
                  id="fecha_transferencia"
                  type="date"
                  value={transferenciasForm.fecha}
                  onChange={(e) => setTransferenciasForm({...transferenciasForm, fecha: e.target.value})}
                />
              </div>

          <div>
                <Label htmlFor="estudiante_transferencia">Estudiante</Label>
                <Select value={transferenciasForm.estudiante_id} onValueChange={(value) => setTransferenciasForm({...transferenciasForm, estudiante_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Buscar estudiante..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Carlos Pérez</SelectItem>
                    <SelectItem value="2">Ana García</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={() => registrarTransferencia.mutate(transferenciasForm)}
              disabled={registrarTransferencia.isPending}
              className="w-full mt-4"
            >
              Registrar transferencia manual
            </Button>
          </CardContent>
        </Card>

        {/* Movimientos bancarios recientes */}
        <Card>
          <CardHeader>
            <CardTitle>Movimientos bancarios recientes</CardTitle>
          </CardHeader>
          <CardContent>
        <div className="space-y-2">
              {[
                { fecha: "2025-01-20", referencia: "REF001", monto: 500000, concepto: "Transferencia SPEI", estado: "Conciliado" },
                { fecha: "2025-01-20", referencia: "REF002", monto: 150000, concepto: "Transferencia SPEI", estado: "Pendiente" },
                { fecha: "2025-01-19", referencia: "REF003", monto: 300000, concepto: "Transferencia SPEI", estado: "Conciliado" }
              ].map((movimiento, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded">
              <div>
                <div className="font-medium">{movimiento.referencia}</div>
                <div className="text-sm text-slate-600">{movimiento.fecha} • {movimiento.concepto}</div>
                  </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold">${(movimiento.monto / 100).toLocaleString()}</div>
                    </div>
                    <Badge variant={movimiento.estado === "Conciliado" ? "default" : "secondary"}>
                      {movimiento.estado}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Conciliación automática con bancos
  const ConciliacionAutomatica = () => {
    const { data: estadisticasConciliacion } = useQuery({
      queryKey: ["/api/caja/estadisticas-conciliacion"],
    });

    const ejecutarConciliacion = useMutation({
      mutationFn: () => apiRequest("POST", "/api/caja/ejecutar-conciliacion", {}),
      onSuccess: () => {
        toast({
          title: "Conciliación ejecutada",
          description: "La conciliación bancaria se completó correctamente"
        });
        queryClient.invalidateQueries({ queryKey: ["/api/caja"] });
      }
    });

    const cerrarCaja = useMutation({
      mutationFn: (data: any) => apiRequest("POST", "/api/caja/cerrar-dia", data),
      onSuccess: () => {
        toast({
          title: "Caja cerrada",
          description: "El corte de caja se realizó correctamente"
        });
      }
    });

    return (
      <div className="space-y-6">
        {/* KPIs de conciliación */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <DollarSign className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">${((estadisticasConciliacion?.ingresos_dia || 0) / 100).toLocaleString()}</div>
          <div className="text-sm text-slate-600">Ingresos del día</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle className="w-8 h-8 text-blue-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">{estadisticasConciliacion?.movimientos_conciliados || 0}</div>
          <div className="text-sm text-slate-600">Conciliados</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="w-8 h-8 text-orange-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">{estadisticasConciliacion?.movimientos_pendientes || 0}</div>
          <div className="text-sm text-slate-600">Pendientes</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <div className="text-2xl font-bold">{estadisticasConciliacion?.diferencias || 0}</div>
          <div className="text-sm text-slate-600">Diferencias</div>
            </CardContent>
          </Card>
        </div>

        {/* Acciones de conciliación */}
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <RefreshCw className="w-5 h-5" />
              Conciliación automática de bancos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-purple-700 mb-4">
              La conciliación automática compara los movimientos bancarios con los pagos registrados 
              en el sistema para detectar diferencias y facilitar el cierre diario.
            </p>
            
        <div className="flex gap-2">
              <Button 
                onClick={() => ejecutarConciliacion.mutate()}
                disabled={ejecutarConciliacion.isPending}
                className="flex-1"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Ejecutar conciliación
              </Button>
              <Button variant="outline" className="flex-1">
                <Upload className="w-4 h-4 mr-2" />
                Importar estado de cuenta
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cierre de caja */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Cierre de caja diario
            </CardTitle>
          </CardHeader>
          <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
                <Label>Efectivo en caja</Label>
                <Input type="number" placeholder="Total efectivo" />
              </div>
          <div>
                <Label>Ingresos bancarios</Label>
                <Input type="number" placeholder="Total transferencias" readOnly />
              </div>
            </div>

        <div className="flex gap-2">
              <Button 
                onClick={() => cerrarCaja.mutate({})}
                disabled={cerrarCaja.isPending}
                variant="destructive"
                className="flex-1"
              >
                <Calculator className="w-4 h-4 mr-2" />
                Cerrar caja del día
              </Button>
              <Button variant="outline" className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Generar reporte
              </Button>
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
            Caja y conciliación
          </h1>
          <p className="text-slate-600">
            Registro de pagos en efectivo, control bancario y conciliación automática
          </p>
        </div>

        <Tabs defaultValue="efectivo" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="efectivo">Pagos en efectivo</TabsTrigger>
            <TabsTrigger value="bancarios">Control bancario</TabsTrigger>
            <TabsTrigger value="conciliacion">Conciliación automática</TabsTrigger>
          </TabsList>

          <TabsContent value="efectivo">
            <PagoEfectivo />
          </TabsContent>

          <TabsContent value="bancarios">
            <PagosBancarios />
          </TabsContent>

          <TabsContent value="conciliacion">
            <ConciliacionAutomatica />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}