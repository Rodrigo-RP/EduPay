import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Banknote, Smartphone, Receipt, Download, Eye, DollarSign, CheckCircle, Calendar, User, FileText, Building2 } from "lucide-react";

export default function Pagos() {
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { toast } = useToast();

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
      origen: "PORTAL",
      detallesCompletos: {
        horaTransaccion: "14:32:15",
        metodoPago: "Visa **** 4242",
        autorizacion: "AUTH-789456123",
        comision: 2500, // $25.00
        iva: 400, // $4.00
        direccionFacturacion: "Av. Reforma 123, Col. Centro, CDMX",
        emailEnviado: "carlos.perez@email.com",
        celularNotificacion: "+52 55 1234 5678"
      }
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
    
    // Filtro por fechas
    let matchesDate = true;
    if (dateFrom || dateTo) {
      try {
        // Convertir fecha del pago (formato: "25/06/2024 14:30") a formato ISO
        const fechaParts = pago.fecha.split(' ')[0].split('/');
        // Crear fecha correctamente: año-mes-día
        const pagoDate = new Date(
          parseInt(fechaParts[2]), // año
          parseInt(fechaParts[1]) - 1, // mes (0-indexado)
          parseInt(fechaParts[0]) // día
        );
        
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          matchesDate = matchesDate && pagoDate >= fromDate;
        }
        
        if (dateTo) {
          const toDate = new Date(dateTo);
          matchesDate = matchesDate && pagoDate <= toDate;
        }
      } catch (error) {
        console.error('Error parsing date:', pago.fecha, error);
        matchesDate = true;
      }
    }
    
    return matchesMethod && matchesStatus && matchesDate;
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

  const handleViewPaymentDetails = (pago: any) => {
    setSelectedPayment(pago);
    setShowPaymentDetails(true);
  };

  const handleDownloadReceipt = (pago: any) => {
    const receiptContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Comprobante de Pago - ${pago.referencia}</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #2563eb; margin: 0; font-size: 24px; }
        .status-paid { background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block; margin: 10px 0; }
        .payment-info { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
        .info-label { font-weight: bold; color: #64748b; }
        .amount { font-size: 28px; font-weight: bold; color: #10b981; text-align: center; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #e2e8f0; color: #64748b; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>COMPROBANTE DE PAGO</h1>
        <div>EscuelaPay - Sistema de Pagos Escolares</div>
        <div class="status-paid">✓ PAGO COMPLETADO</div>
    </div>
    <div class="payment-info">
        <div class="info-row"><span class="info-label">Estudiante:</span><span>${pago.estudiante}</span></div>
        <div class="info-row"><span class="info-label">Concepto:</span><span>${pago.concepto}</span></div>
        <div class="info-row"><span class="info-label">Fecha:</span><span>${pago.fecha}</span></div>
        <div class="info-row"><span class="info-label">Método:</span><span>${pago.metodo}</span></div>
        <div class="info-row"><span class="info-label">Referencia:</span><span>${pago.referencia}</span></div>
        <div class="info-row"><span class="info-label">CFDI:</span><span>${pago.cfdi}</span></div>
    </div>
    <div class="amount">$${(pago.monto / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</div>
    <div class="footer">
        <p><strong>EscuelaPay</strong> - Plataforma de Pagos Educativos</p>
        <p>Generado: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX')}</p>
    </div>
</body>
</html>`;

    const blob = new Blob([receiptContent], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Comprobante_${pago.referencia}.html`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
    
    toast({
      title: "Comprobante Descargado",
      description: `Comprobante de ${pago.estudiante} guardado exitosamente`,
      duration: 3000,
    });
  };

  return (
    <div >
      <div >
        
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
                <div className="flex gap-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm whitespace-nowrap">Desde:</Label>
                        <Input 
                          type="date" 
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          className="w-[140px]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm whitespace-nowrap">Hasta:</Label>
                        <Input 
                          type="date" 
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="w-[140px]"
                        />
                      </div>
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
                      {(dateFrom || dateTo) && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setDateFrom("");
                            setDateTo("");
                          }}
                          className="text-xs"
                        >
                          Limpiar fechas
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
              <div className="space-y-4">
                    {filteredPagos.length === 0 ? (
                      <div className="text-center py-8">
                        <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-600 mb-2">No se encontraron pagos</h3>
                        <p className="text-gray-500">
                          {(dateFrom || dateTo || selectedMethod !== "all" || selectedStatus !== "all") 
                            ? "Intenta ajustar los filtros para ver más resultados" 
                            : "No hay pagos registrados en el sistema"}
                        </p>
                      </div>
                    ) : (
                      filteredPagos.map((pago) => (
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
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleViewPaymentDetails(pago)}
                                  title="Ver detalles del pago"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
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

      {/* Modal de Detalles del Pago */}
      <Dialog open={showPaymentDetails} onOpenChange={setShowPaymentDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Detalles del Pago
            </DialogTitle>
            <DialogDescription>
              Información completa del pago realizado
            </DialogDescription>
          </DialogHeader>
          
          {selectedPayment && (
            <div className="space-y-6">
              {/* Estado del Pago */}
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-2 bg-green-50 text-green-800 px-4 py-2 rounded-full">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-semibold">Pago Completado</span>
                </div>
              </div>

              {/* Información Principal */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Estudiante</label>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{selectedPayment.estudiante}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Concepto</label>
                    <div className="flex items-center gap-2 mt-1">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span>{selectedPayment.concepto}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Monto</label>
                    <div className="text-2xl font-bold text-green-600">
                      ${(selectedPayment.monto / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Fecha y Hora</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span>{selectedPayment.fecha}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Método de Pago</label>
                    <div className="mt-1">
                      {getMetodoBadge(selectedPayment.metodo)}
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Origen</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <Badge variant="outline">{selectedPayment.origen}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Información Técnica */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Información Técnica</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Referencia:</span>
                    <span className="ml-2 font-mono">{selectedPayment.referencia}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">CFDI:</span>
                    <span className="ml-2 font-mono">{selectedPayment.cfdi}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Estado:</span>
                    <span className="ml-2">
                      <Badge className="bg-green-100 text-green-800">
                        {selectedPayment.estado}
                      </Badge>
                    </span>
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex gap-3 pt-4 border-t">
                <Button 
                  onClick={() => handleDownloadReceipt(selectedPayment)}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Descargar Comprobante
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setShowPaymentDetails(false)}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}