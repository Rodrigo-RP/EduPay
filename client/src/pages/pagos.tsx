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
import { CreditCard, Banknote, Smartphone, Receipt, Download, Eye, DollarSign, CheckCircle, Calendar, User, FileText, Building2, PieChart } from "lucide-react";
import { PieChartComponent } from "@/components/PieChartComponent";

export default function Pagos() {
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showRegistrarPago, setShowRegistrarPago] = useState(false);
  const [showImportarEstado, setShowImportarEstado] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { toast } = useToast();

  // Datos estáticos para gráficos tipo pastel
  const paymentMethodData = [
    { name: 'Tarjeta', value: 8, color: '#0088FE' },
    { name: 'Transferencia', value: 6, color: '#00C49F' },
    { name: 'Efectivo', value: 4, color: '#FFBB28' },
    { name: 'SPEI', value: 2, color: '#FF8042' }
  ];

  const paymentStatusData = [
    { name: 'Completado', value: 12, color: '#00C49F' },
    { name: 'Pendiente', value: 5, color: '#FFBB28' },
    { name: 'Procesando', value: 2, color: '#0088FE' },
    { name: 'Fallido', value: 1, color: '#FF8042' }
  ];



  // Datos simulados de pagos
  const mockPagos = [
    {
      id: 1,
      estudiante: "Carlos Pérez Méndez",
      concepto: "Colegiatura Enero",
      monto: 500000,
      metodo: "TARJETA",
      estado: "completado",
      fecha: "25/01/2025 14:30",
      referencia: "TXN001",
      origen: "Portal Padres"
    },
    {
      id: 2,
      estudiante: "Andrea García Luna",
      concepto: "Inscripción 2025",
      monto: 300000,
      metodo: "EFECTIVO",
      estado: "completado",
      fecha: "20/01/2025 09:15",
      referencia: "EFE002",
      origen: "Caja Escuela"
    },
    {
      id: 3,
      estudiante: "Luis Martínez Gil",
      concepto: "Materiales Escolares",
      monto: 150000,
      metodo: "SPEI",
      estado: "pendiente",
      fecha: "22/01/2025 16:45",
      referencia: "SPEI003",
      origen: "Banca Móvil"
    }
  ];

  // Filtrar pagos según criterios
  const filteredPagos = mockPagos.filter(pago => {
    const methodMatch = selectedMethod === "all" || pago.metodo === selectedMethod;
    const statusMatch = selectedStatus === "all" || pago.estado === selectedStatus;
    
    let dateMatch = true;
    if (dateFrom || dateTo) {
      const pagoDate = new Date(pago.fecha.split(' ')[0].split('/').reverse().join('-'));
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        dateMatch = dateMatch && pagoDate >= fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        dateMatch = dateMatch && pagoDate <= toDate;
      }
    }
    
    return methodMatch && statusMatch && dateMatch;
  });

  const getMetodoBadge = (metodo: string) => {
    const metodoConfig = {
      TARJETA: { icon: CreditCard, color: "bg-blue-100 text-blue-800", label: "Tarjeta" },
      EFECTIVO: { icon: Banknote, color: "bg-green-100 text-green-800", label: "Efectivo" },
      SPEI: { icon: Building2, color: "bg-purple-100 text-purple-800", label: "SPEI" },
      PAYPAL: { icon: Smartphone, color: "bg-indigo-100 text-indigo-800", label: "PayPal" },
      OXXOPAY: { icon: Receipt, color: "bg-orange-100 text-orange-800", label: "OXXO Pay" }
    };
    
    const config = metodoConfig[metodo as keyof typeof metodoConfig] || metodoConfig.EFECTIVO;
    const IconComponent = config.icon;
    
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <IconComponent className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getEstadoBadge = (estado: string) => {
    const config = {
      completado: "bg-green-100 text-green-800",
      pendiente: "bg-yellow-100 text-yellow-800", 
      fallido: "bg-red-100 text-red-800"
    };
    
    return (
      <Badge className={config[estado as keyof typeof config] || config.pendiente}>
        {estado === 'completado' ? 'Completado' : estado === 'pendiente' ? 'Pendiente' : 'Fallido'}
      </Badge>
    );
  };

  const handleVerDetalles = (pago: any) => {
    setSelectedPayment(pago);
    setShowPaymentDetails(true);
  };

  const handleDownloadReceipt = (pago: any) => {
    const content = `
      COMPROBANTE DE PAGO - ESCUELAPAY
      ================================
      
      Estudiante: ${pago.estudiante}
      Concepto: ${pago.concepto}
      Monto: $${(pago.monto / 100).toLocaleString()} MXN
      Método: ${pago.metodo}
      Estado: ${pago.estado}
      Fecha: ${pago.fecha}
      Referencia: ${pago.referencia}
      
      ================================
      Este comprobante es válido para efectos fiscales
    `;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprobante_${pago.referencia}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Comprobante descargado",
      description: `Comprobante de ${pago.concepto} guardado exitosamente`,
    });
  };

  const handleConciliacionAutomatica = () => {
    toast({
      title: "Conciliación en proceso",
      description: "Ejecutando conciliación automática de movimientos bancarios...",
      duration: 3000,
    });
  };

  const handleRegistrarPago = () => {
    toast({
      title: "Pago registrado",
      description: "El pago en efectivo ha sido registrado exitosamente",
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Pagos</h1>
          <p className="text-slate-600">Administra pagos recibidos, registra efectivo y concilia movimientos</p>
        </div>
        <div className="flex gap-3">
          <Button 
            className="bg-green-600 hover:bg-green-700"
            onClick={() => setShowRegistrarPago(true)}
          >
            <Banknote className="w-4 h-4 mr-2" />
            Registrar pago
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total del día</p>
                <p className="text-2xl font-bold">$15,750</p>
              </div>
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Pagos completados</p>
                <p className="text-2xl font-bold">24</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Tasa de éxito</p>
                <p className="text-2xl font-bold">94.2%</p>
              </div>
              <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                <Receipt className="h-4 w-4 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Pendientes</p>
                <p className="text-2xl font-bold">3</p>
              </div>
              <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
                <Calendar className="h-4 w-4 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lista" className="w-full">
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
              {/* Gráficos de Análisis Visual */}
              <div className="mb-6">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Análisis Visual de Pagos
                </h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <Card>
                    <CardContent className="p-4">
                      <PieChartComponent 
                        data={paymentMethodData} 
                        title="Por Método de Pago" 
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <PieChartComponent 
                        data={paymentStatusData} 
                        title="Por Estado de Pago" 
                      />
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="space-y-4">
                {filteredPagos.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No se encontraron pagos con los filtros aplicados</p>
                  </div>
                ) : (
                  filteredPagos.map((pago) => (
                    <div key={pago.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-3">
                          <User className="h-4 w-4 text-slate-400" />
                          <span className="font-medium">{pago.estudiante}</span>
                          {getEstadoBadge(pago.estado)}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-600">
                          <FileText className="h-4 w-4" />
                          <span>{pago.concepto}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold">${(pago.monto / 100).toLocaleString()}</div>
                          <div className="text-sm text-slate-500">{pago.fecha}</div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {getMetodoBadge(pago.metodo)}
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVerDetalles(pago)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadReceipt(pago)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
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
              <Button 
                className="mt-4 bg-green-600 hover:bg-green-700"
                onClick={handleRegistrarPago}
              >
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
                  <Button 
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={handleConciliacionAutomatica}
                  >
                    Ejecutar conciliación automática
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => setShowImportarEstado(true)}
                  >
                    Importar estado de cuenta
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de detalles de pago */}
      <Dialog open={showPaymentDetails} onOpenChange={setShowPaymentDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalles del Pago</DialogTitle>
            <DialogDescription>
              Información completa de la transacción seleccionada
            </DialogDescription>
          </DialogHeader>
          
          {selectedPayment && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
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
                  <div className="text-2xl font-bold text-green-600 mt-1">
                    ${(selectedPayment.monto / 100).toLocaleString()} MXN
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-500">Estado</label>
                  <div className="mt-1">
                    {getEstadoBadge(selectedPayment.estado)}
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

              <div className="border-t pt-4">
                <div className="flex gap-3">
                  <Button 
                    onClick={() => handleDownloadReceipt(selectedPayment)}
                    className="flex-1"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Descargar Comprobante
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}