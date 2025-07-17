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
import { CreditCard, Banknote, Smartphone, Receipt, Download, Eye, DollarSign, CheckCircle, Calendar, User, FileText, Building2, PieChart, Upload, X, AlertCircle } from "lucide-react";
import { PieChartComponent } from "@/components/PieChartComponent";
import { hasPermission, MODULES, ACTIONS, type UserRole } from "@shared/permissions";
import { useAuth } from "@/hooks/use-auth";

export default function Pagos() {
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showRegistrarPago, setShowRegistrarPago] = useState(false);
  const [showImportarEstado, setShowImportarEstado] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Obtener rol del usuario para filtrado
  const userRole = (user?.role as UserRole) || 'asistente';
  
  // Definir qué conceptos puede ver cada rol
  const canViewConcept = (conceptName: string) => {
    switch (userRole) {
      case 'super_admin':
      case 'admin':
        return true; // Puede ver todos los conceptos
      
      case 'admisiones':
        // Solo puede ver pagos relacionados con admisiones
        return conceptName.toLowerCase().includes('inscripción') ||
               conceptName.toLowerCase().includes('inscripcion') ||
               conceptName.toLowerCase().includes('matrícula') ||
               conceptName.toLowerCase().includes('matricula') ||
               conceptName.toLowerCase().includes('beca') ||
               conceptName.toLowerCase().includes('descuento');
      
      case 'caja':
        // Solo puede ver pagos operativos (no inscripciones)
        return conceptName.toLowerCase().includes('colegiatura') ||
               conceptName.toLowerCase().includes('mensualidad') ||
               conceptName.toLowerCase().includes('recargo') ||
               conceptName.toLowerCase().includes('multa') ||
               conceptName.toLowerCase().includes('seguro') ||
               conceptName.toLowerCase().includes('transporte') ||
               conceptName.toLowerCase().includes('cafetería') ||
               conceptName.toLowerCase().includes('cafeteria') ||
               conceptName.toLowerCase().includes('papelería') ||
               conceptName.toLowerCase().includes('papeleria');
      
      case 'contador':
        // Solo puede ver pagos completados para reportes
        return true;
      
      case 'asistente':
        // Solo puede ver inscripciones y becas
        return conceptName.toLowerCase().includes('inscripción') ||
               conceptName.toLowerCase().includes('inscripcion') ||
               conceptName.toLowerCase().includes('beca');
      
      default:
        return false;
    }
  };
  
  // Filtrar estados según el rol
  const canViewStatus = (status: string) => {
    switch (userRole) {
      case 'super_admin':
      case 'admin':
      case 'caja':
        return true; // Puede ver todos los estados
      
      case 'admisiones':
        return status === 'completado' || status === 'pendiente';
      
      case 'contador':
        return status === 'completado'; // Solo pagos completados
      
      case 'asistente':
        return status === 'completado' || status === 'pendiente';
      
      default:
        return status === 'completado';
    }
  };

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

  // Filtrar pagos según criterios Y rol del usuario
  const filteredPagos = mockPagos.filter(pago => {
    // Filtros básicos existentes
    const methodMatch = selectedMethod === "all" || pago.metodo === selectedMethod;
    const statusMatch = selectedStatus === "all" || pago.estado === selectedStatus;
    
    // Filtrado por rol - concepto y estado
    const conceptMatch = canViewConcept(pago.concepto);
    const statusRoleMatch = canViewStatus(pago.estado);
    
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
    
    return methodMatch && statusMatch && dateMatch && conceptMatch && statusRoleMatch;
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar formato de archivo
      const allowedTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'text/plain'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Formato no válido",
          description: "Por favor selecciona un archivo Excel (.xlsx, .xls) o CSV",
          variant: "destructive",
        });
        return;
      }

      // Validar tamaño (máximo 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Archivo muy grande",
          description: "El archivo debe ser menor a 10MB",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      toast({
        title: "Archivo seleccionado",
        description: `${file.name} listo para procesar`,
      });
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
  };

  const handleImportarEstado = async () => {
    if (!selectedFile) {
      toast({
        title: "Sin archivo",
        description: "Por favor selecciona un archivo de estado de cuenta",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simular progreso de carga
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      // Simular procesamiento
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setUploadProgress(100);
      
      // Simular resultados de conciliación
      await new Promise(resolve => setTimeout(resolve, 500));
      
      toast({
        title: "Importación exitosa",
        description: "Estado de cuenta procesado: 15 movimientos conciliados, 3 pendientes",
      });

      // Resetear estado
      setSelectedFile(null);
      setUploadProgress(0);
      setShowImportarEstado(false);
      
    } catch (error) {
      toast({
        title: "Error en importación",
        description: "No se pudo procesar el archivo. Intenta nuevamente",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
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

      {/* Modal de importar estado de cuenta */}
      <Dialog open={showImportarEstado} onOpenChange={setShowImportarEstado}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar Estado de Cuenta</DialogTitle>
            <DialogDescription>
              Sube el archivo de estado de cuenta bancario para conciliación automática
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Información del proceso */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Formatos soportados</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Archivos Excel (.xlsx, .xls) o CSV con movimientos bancarios
                  </p>
                </div>
              </div>
            </div>

            {/* Área de carga de archivo */}
            <div className="space-y-4">
              {!selectedFile ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
                  <div className="text-center">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <div className="space-y-2">
                      <h4 className="text-lg font-medium">Selecciona el archivo</h4>
                      <p className="text-sm text-gray-500">
                        Arrastra y suelta el archivo o haz clic para seleccionar
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer mt-4"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Seleccionar archivo
                    </label>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <FileText className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{selectedFile.name}</p>
                        <p className="text-sm text-gray-500">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveFile}
                      disabled={isUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {isUploading && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                        <span>Procesando archivo...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Información adicional */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Proceso de conciliación</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• El sistema identificará automáticamente los movimientos</li>
                <li>• Se conciliarán con los pagos registrados en el sistema</li>
                <li>• Recibirás un reporte con los resultados del proceso</li>
                <li>• Los movimientos no conciliados requerirán revisión manual</li>
              </ul>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-3">
              <Button
                onClick={handleImportarEstado}
                disabled={!selectedFile || isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar y Conciliar
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowImportarEstado(false)}
                disabled={isUploading}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}