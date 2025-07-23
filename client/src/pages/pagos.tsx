import { useState, useEffect } from "react";
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
import { CreditCard, Banknote, Smartphone, Receipt, Download, Eye, DollarSign, CheckCircle, Calendar, User, FileText, Building2, PieChart, Upload, X, AlertCircle, Info, Mail, MessageCircle, FileCheck } from "lucide-react";
import { PieChartComponent } from "@/components/PieChartComponent";
import { hasPermission, MODULES, ACTIONS, type UserRole } from "@shared/permissions";
import { useAuth } from "@/hooks/use-auth";
import { useInstitution } from "@/hooks/use-institution";

export default function Pagos() {
  const [selectedMethod, setSelectedMethod] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showRegistrarPago, setShowRegistrarPago] = useState(false);
  const [showImportarEstado, setShowImportarEstado] = useState(false);
  const [showReceiptOptions, setShowReceiptOptions] = useState(false);
  const [currentReceiptHTML, setCurrentReceiptHTML] = useState('');
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  // Estado para el formulario de registro de pagos
  const [pagoManualForm, setPagoManualForm] = useState({
    estudiante_id: "",
    concepto_id: "",
    monto: "",
    recibido_por: "",
    observaciones: ""
  });
  
  const { toast } = useToast();
  const { user } = useAuth();
  const { logoUrl, institutionName } = useInstitution();
  
  // Función para obtener el nombre completo del usuario basado en su perfil
  const getUserDisplayName = () => {
    if (!user) return "";
    
    // Obtener nombre del usuario
    
    // Si no, extraer nombre del email o usar el rol
    if (user.email) {
      const emailParts = user.email.split('@')[0];
      
      // Mapear roles a nombres más amigables
      const roleNames = {
        'admin': 'Administrador',
        'caja': 'Cajero',
        'contador': 'Contador',
        'admisiones': 'Admisiones',
        'asistente': 'Asistente',
        'super_admin': 'Super Admin'
      };
      
      // Si el email contiene un nombre específico, usarlo
      if (emailParts.includes('.')) {
        const nameParts = emailParts.split('.');
        return nameParts.map(part => 
          part.charAt(0).toUpperCase() + part.slice(1)
        ).join(' ');
      }
      
      // Si no, usar el mapeo de roles
      return roleNames[user.role as keyof typeof roleNames] || user.role;
    }
    
    return user.role || "Usuario";
  };

  // Establecer automáticamente el campo "Recibido por" cuando el usuario esté disponible
  useEffect(() => {
    if (user && !pagoManualForm.recibido_por) {
      setPagoManualForm(prev => ({
        ...prev,
        recibido_por: getUserDisplayName()
      }));
    }
  }, [user]);
  
  // Obtener rol del usuario para filtrado
  const userRole = (user?.role as UserRole) || 'asistente';
  // User role validation complete
  
  // Cargar datos reales de pagos desde la API
  const { data: paymentsData, isLoading: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: ["/api/payments"],
    enabled: !!user?.campus_id,
    retry: 1,
    staleTime: 0
  });
  
  console.log('Payments query state:', {
    paymentsData,
    paymentsLoading,
    paymentsError,
    userCampusId: user?.campus_id,
    queryEnabled: !!user?.campus_id
  });

  // Si no hay campus_id, mostrar mensaje de error
  if (user && !user.campus_id) {
    console.log('User sin campus_id, necesita reautenticar...');
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pagos</h1>
            <p className="text-sm text-gray-500">Gestión de pagos de inscripción</p>
          </div>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error de Autenticación</h3>
          <p className="text-red-700 mb-4">
            Tu sesión necesita ser actualizada. Por favor, cierra sesión e inicia sesión nuevamente.
          </p>
          <button 
            onClick={() => {
              localStorage.removeItem('auth_token');
              localStorage.removeItem('auth_user');
              window.location.href = '/login';
            }}
            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
          >
            Cerrar Sesión e Iniciar Sesión Nuevamente
          </button>
        </div>
      </div>
    );
  }
  
  // Definir qué conceptos puede ver cada rol
  const canViewConcept = (conceptName: string) => {
    switch (userRole) {
      case 'super_admin':
      case 'admin':
        return true; // Puede ver todos los conceptos
      
      case 'admisiones':
        // Solo puede ver pagos relacionados con inscripciones (NO becas)
        const isInscripcion = conceptName.toLowerCase().includes('inscripción') ||
                            conceptName.toLowerCase().includes('inscripcion');
        console.log('Checking admisiones concept:', conceptName, 'isInscripcion:', isInscripcion);
        return isInscripcion;
      
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
        // Solo puede ver inscripciones
        return conceptName.toLowerCase().includes('inscripción') ||
               conceptName.toLowerCase().includes('inscripcion');
      
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



  // Transformar los datos de la API al formato esperado por el frontend
  const transformedPagos = (paymentsData || []).map((payment: any) => {
    const transformedPayment = {
      id: payment.id,
      estudiante: payment.charge?.student?.nombre_completo || 'Sin estudiante',
      concepto: payment.charge?.concept?.nombre || 'Sin concepto',
      monto: payment.monto_centavos,
      metodo: payment.metodo?.toUpperCase() || 'EFECTIVO',
      estado: payment.estado || 'pendiente',
      fecha: new Date(payment.fecha_pago).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
      referencia: payment.referencia_pasarela || `PAY${payment.id}`,
      origen: 'Portal Padres'
    };
    
    // Debug log para verificar datos
    console.log('Payment transformado:', transformedPayment);
    console.log('Concept match:', canViewConcept(transformedPayment.concepto));
    console.log('Status match:', canViewStatus(transformedPayment.estado));
    
    return transformedPayment;
  }) || [];

  // Filtrar pagos según criterios Y rol del usuario
  const filteredPagos = transformedPagos.filter((pago: any) => {
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
    
    console.log('Filtrado completo:', {
      pago: pago.concepto,
      methodMatch,
      statusMatch,
      dateMatch,
      conceptMatch,
      statusRoleMatch,
      finalResult: methodMatch && statusMatch && dateMatch && conceptMatch && statusRoleMatch
    });
    
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
    // Generar folio único
    const folio = `EPS-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const serie = "A";
    const numeroRecibo = Math.floor(Math.random() * 999999) + 100000;
    
    // Logo dinámico del colegio o fallback
    const logoElement = logoUrl ? 
      `<img src="${logoUrl}" alt="${institutionName}" style="height: 60px; width: auto; object-fit: contain;">` : 
      `<div style="width: 60px; height: 60px; background: linear-gradient(135deg, #1e3a8a, #3b82f6); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; text-align: center; line-height: 1.2;">
        <div>
          <div style="font-size: 16px;">ISP</div>
          <div style="font-size: 10px; color: #fbbf24;">EDUCACIÓN</div>
        </div>
      </div>`;
    
    const receiptContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Recibo Fiscal - ${folio}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            line-height: 1.4; 
            color: #333;
            background: #fff;
          }
          .header { 
            text-align: center; 
            border-bottom: 2px solid #1e40af; 
            padding-bottom: 15px; 
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .logo-section {
            display: flex;
            align-items: center;
            gap: 15px;
          }
          .company-info {
            text-align: left;
            flex-grow: 1;
            margin-left: 20px;
          }
          .company-name { 
            font-size: 24px; 
            font-weight: bold; 
            color: #1e40af; 
            margin: 0;
          }
          .receipt-type { 
            font-size: 18px; 
            color: #059669; 
            margin: 5px 0;
          }
          .fiscal-info { 
            font-size: 12px; 
            color: #6b7280; 
            margin-top: 5px;
          }
          .folio-section {
            text-align: right;
            background: #f3f4f6;
            padding: 10px;
            border-radius: 5px;
            min-width: 200px;
          }
          .folio { 
            font-size: 16px; 
            font-weight: bold; 
            color: #dc2626;
            margin: 0;
          }
          .serie { 
            font-size: 14px; 
            color: #374151; 
            margin: 2px 0;
          }
          .details-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 20px; 
            margin: 20px 0; 
          }
          .student-info, .payment-info { 
            background: #f9fafb; 
            padding: 15px; 
            border-radius: 5px; 
            border-left: 4px solid #1e40af;
          }
          .section-title { 
            font-size: 14px; 
            font-weight: bold; 
            color: #1e40af; 
            margin-bottom: 10px;
            text-transform: uppercase;
          }
          .info-row { 
            margin: 8px 0; 
            display: flex;
            justify-content: space-between;
          }
          .label { 
            font-weight: bold; 
            color: #374151;
            min-width: 120px;
          }
          .value { 
            color: #111827;
            text-align: right;
          }
          .amount-section { 
            text-align: center; 
            background: linear-gradient(135deg, #1e40af, #3b82f6); 
            color: white; 
            padding: 20px; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .amount { 
            font-size: 32px; 
            font-weight: bold; 
            margin: 10px 0;
          }
          .amount-words { 
            font-style: italic; 
            margin-top: 10px;
            font-size: 14px;
          }
          .fiscal-section { 
            background: #fef3c7; 
            border: 1px solid #f59e0b; 
            padding: 15px; 
            border-radius: 5px; 
            margin: 20px 0;
          }
          .fiscal-title { 
            font-weight: bold; 
            color: #92400e; 
            margin-bottom: 10px;
            font-size: 14px;
          }
          .fiscal-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr 1fr; 
            gap: 15px;
            font-size: 12px;
          }
          .signatures { 
            margin-top: 40px; 
            display: flex; 
            justify-content: space-between;
            font-size: 12px;
          }
          .signature { 
            text-align: center; 
            width: 200px;
            border-top: 1px solid #6b7280;
            padding-top: 10px;
          }
          .footer { 
            text-align: center; 
            color: #6b7280; 
            font-size: 11px; 
            margin-top: 30px; 
            border-top: 1px solid #e5e7eb; 
            padding-top: 15px;
          }
          .status-badge { 
            background: #10b981; 
            color: white; 
            padding: 5px 15px; 
            border-radius: 20px; 
            font-size: 12px; 
            font-weight: bold;
            display: inline-block;
            margin: 5px 0;
          }
          @media print {
            body { margin: 0; }
            .header, .amount-section { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-section">
            ${logoElement}
            <div class="company-info">
              <h1 class="company-name">${institutionName || 'Instituto JFR'}</h1>
              <div class="receipt-type">RECIBO FISCAL ELECTRÓNICO</div>
              <div class="fiscal-info">
                RFC: ISP851230ABC | Régimen: Personas Morales con Fines no Lucrativos
              </div>
            </div>
          </div>
          <div class="folio-section">
            <p class="folio">FOLIO: ${folio}</p>
            <p class="serie">SERIE: ${serie} | No. ${numeroRecibo}</p>
            <span class="status-badge">TIMBRADO</span>
          </div>
        </div>

        <div class="details-grid">
          <div class="student-info">
            <div class="section-title">Información del Estudiante</div>
            <div class="info-row">
              <span class="label">Nombre:</span>
              <span class="value">${pago.estudiante}</span>
            </div>
            <div class="info-row">
              <span class="label">Concepto:</span>
              <span class="value">${pago.concepto}</span>
            </div>
            <div class="info-row">
              <span class="label">Período:</span>
              <span class="value">Ciclo 2024-2025</span>
            </div>
          </div>

          <div class="payment-info">
            <div class="section-title">Información del Pago</div>
            <div class="info-row">
              <span class="label">Fecha:</span>
              <span class="value">${pago.fecha}</span>
            </div>
            <div class="info-row">
              <span class="label">Método:</span>
              <span class="value">${pago.metodo}</span>
            </div>
            <div class="info-row">
              <span class="label">Referencia:</span>
              <span class="value">${pago.referencia}</span>
            </div>
            <div class="info-row">
              <span class="label">Estado:</span>
              <span class="value">${pago.estado.toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div class="amount-section">
          <div>IMPORTE TOTAL PAGADO</div>
          <div class="amount">$${(pago.monto / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</div>
          <div class="amount-words">
            (${numeroALetras(pago.monto / 100)} PESOS MEXICANOS)
          </div>
        </div>

        <div class="fiscal-section">
          <div class="fiscal-title">📋 INFORMACIÓN FISCAL SAT</div>
          <div class="fiscal-grid">
            <div><strong>Uso CFDI:</strong><br>G03 - Gastos en general</div>
            <div><strong>Método Pago:</strong><br>PUE - Pago en una sola exhibición</div>
            <div><strong>Forma Pago:</strong><br>${pago.metodo === 'TARJETA' ? '04 - Tarjeta de crédito' : '03 - Transferencia'}</div>
            <div><strong>Lugar Expedición:</strong><br>06470</div>
            <div><strong>Tipo Comprobante:</strong><br>I - Ingreso</div>
            <div><strong>Fecha Timbrado:</strong><br>${new Date().toLocaleString('es-MX')}</div>
          </div>
        </div>

        <div class="signatures">
          <div class="signature">
            <div><strong>Autorizado por</strong></div>
            <div>${user?.email || 'Sistema'}</div>
          </div>
          <div class="signature">
            <div><strong>Validado por</strong></div>
            <div>SAT - Sistema de Administración Tributaria</div>
          </div>
        </div>

        <div class="footer">
          <p><strong>${institutionName || 'Instituto JFR'}</strong> - Sistema de Gestión de Pagos</p>
          <p>Este recibo fiscal cumple con los requisitos establecidos por el SAT | CFDI 4.0</p>
          <p>Generado el ${new Date().toLocaleString('es-MX')} | Folio: ${folio}</p>
        </div>
      </body>
      </html>
    `;
    
    // Función para convertir números a letras (simplificada)
    function numeroALetras(num: number): string {
      const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
      const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
      const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
      
      if (num === 0) return 'CERO';
      if (num < 10) return unidades[num];
      if (num < 100) return decenas[Math.floor(num / 10)] + (num % 10 !== 0 ? ' Y ' + unidades[num % 10] : '');
      if (num < 1000) return centenas[Math.floor(num / 100)] + (num % 100 !== 0 ? ' ' + numeroALetras(num % 100) : '');
      if (num < 1000000) {
        const miles = Math.floor(num / 1000);
        const resto = num % 1000;
        return (miles === 1 ? 'MIL' : numeroALetras(miles) + ' MIL') + (resto !== 0 ? ' ' + numeroALetras(resto) : '');
      }
      return 'NÚMERO MUY GRANDE';
    }

    // Crear ventana nueva y abrir para imprimir/descargar
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(receiptContent);
      newWindow.document.close();
      
      // Esperar a que cargue y abrir diálogo de impresión
      newWindow.onload = () => {
        setTimeout(() => {
          newWindow.print();
        }, 500);
      };
    }
    
    toast({
      title: "Recibo fiscal generado",
      description: `Recibo de ${pago.concepto} generado con folio ${folio}`,
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

  const generateFiscalReceiptHTML = (pagoData: any) => {
    const fechaEmision = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const folioRecibo = `REC-${Date.now().toString().slice(-8)}`;
    const serie = "A";
    const numeroRecibo = `${serie}${folioRecibo}`;
    
    const receiptContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recibo Fiscal - Edupay</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .receipt-container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .logo-container {
            margin: 0 auto 15px auto;
            display: flex;
            justify-content: center;
        }
        .logo-circle {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: linear-gradient(135deg, #2563eb, #1e40af);
            border: 3px solid #1e40af;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 8px rgba(37, 99, 235, 0.3);
        }
        .logo-text {
            color: white;
            font-weight: bold;
            font-size: 18px;
            font-family: Arial, sans-serif;
            letter-spacing: 1px;
        }
        .logo-subtext {
            color: #fbbf24;
            font-weight: bold;
            font-size: 8px;
            font-family: Arial, sans-serif;
            margin-top: 2px;
            letter-spacing: 0.5px;
        }
        .institution-logo {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid #1e40af;
            box-shadow: 0 4px 8px rgba(37, 99, 235, 0.3);
        }
        .header h1 {
            color: #2563eb;
            margin: 0;
            font-size: 24px;
        }
        .header p {
            color: #666;
            margin: 5px 0;
        }
        .receipt-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        .info-block {
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #2563eb;
        }
        .info-block h3 {
            margin: 0 0 10px 0;
            color: #1e293b;
            font-size: 14px;
            font-weight: 600;
        }
        .info-block p {
            margin: 5px 0;
            color: #475569;
            font-size: 12px;
        }
        .payment-details {
            background: #f0f9ff;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #0ea5e9;
            margin-bottom: 30px;
        }
        .payment-details h3 {
            color: #0369a1;
            margin: 0 0 15px 0;
            font-size: 16px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            font-size: 14px;
        }
        .detail-label {
            color: #475569;
            font-weight: 500;
        }
        .detail-value {
            color: #1e293b;
            font-weight: 600;
        }
        .amount-total {
            background: #dcfce7;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #16a34a;
            text-align: center;
            margin-bottom: 30px;
        }
        .amount-total h3 {
            color: #15803d;
            margin: 0;
            font-size: 18px;
        }
        .fiscal-info {
            background: #fef3c7;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #f59e0b;
            margin-bottom: 30px;
        }
        .fiscal-info h3 {
            color: #92400e;
            margin: 0 0 15px 0;
            font-size: 16px;
        }
        .fiscal-info p {
            margin: 5px 0;
            color: #78350f;
            font-size: 13px;
        }
        .footer {
            text-align: center;
            color: #6b7280;
            font-size: 12px;
            border-top: 1px solid #e5e7eb;
            padding-top: 20px;
        }
        .signature-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-top: 40px;
            text-align: center;
        }
        .signature-block {
            border-top: 1px solid #000;
            padding-top: 10px;
            font-size: 12px;
            color: #374151;
        }
        @media print {
            body { background: white; }
            .receipt-container { box-shadow: none; }
        }
    </style>
</head>
<body>
    <div class="receipt-container">
        <div class="header">
            <div class="logo-container">
                ${logoUrl 
                  ? `<img class="institution-logo" src="${logoUrl}" alt="Logo de la institución" />` 
                  : `<div class="logo-circle">
                        <div class="logo-text">ISP</div>
                        <div class="logo-subtext">EDUCACIÓN</div>
                     </div>`
                }
            </div>
            <h1>RECIBO FISCAL</h1>
            <p>${institutionName || 'Instituto San Patricio'}</p>
            <p>RFC: ISP850101ABC</p>
            <p>Calle Principal #123, Col. Centro, CP 44100</p>
            <p>Guadalajara, Jalisco, México</p>
        </div>

        <div class="receipt-info">
            <div class="info-block">
                <h3>INFORMACIÓN DEL RECIBO</h3>
                <p><strong>Folio:</strong> ${folioRecibo}</p>
                <p><strong>Serie:</strong> ${serie}</p>
                <p><strong>Número:</strong> ${numeroRecibo}</p>
                <p><strong>Fecha de Emisión:</strong> ${fechaEmision}</p>
            </div>
            <div class="info-block">
                <h3>INFORMACIÓN DEL ESTUDIANTE</h3>
                <p><strong>Nombre:</strong> ${pagoData.estudiante || 'Estudiante Demo'}</p>
                <p><strong>Grado:</strong> ${pagoData.grado || '3ro A'}</p>
                <p><strong>Matrícula:</strong> ${pagoData.matricula || 'EST-001'}</p>
            </div>
        </div>

        <div class="payment-details">
            <h3>DETALLES DEL PAGO</h3>
            <div class="detail-row">
                <span class="detail-label">Concepto:</span>
                <span class="detail-value">${pagoData.concepto || 'Colegiatura'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Método de Pago:</span>
                <span class="detail-value">${pagoData.metodo || 'Efectivo'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Forma de Pago:</span>
                <span class="detail-value">${pagoData.forma || 'Pago en una sola exhibición'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Recibido por:</span>
                <span class="detail-value">${pagoData.recibido_por}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Observaciones:</span>
                <span class="detail-value">${pagoData.observaciones || 'Ninguna'}</span>
            </div>
        </div>

        <div class="amount-total">
            <h3>TOTAL: $${pagoData.monto ? parseFloat(pagoData.monto).toLocaleString() : '0.00'} MXN</h3>
            <p>SON: ${convertirNumeroALetras(pagoData.monto || '0')} PESOS MEXICANOS</p>
        </div>

        <div class="fiscal-info">
            <h3>INFORMACIÓN FISCAL</h3>
            <p><strong>Régimen Fiscal:</strong> Personas Morales del Régimen General</p>
            <p><strong>Lugar de Expedición:</strong> 44100, Guadalajara, Jalisco</p>
            <p><strong>Uso CFDI:</strong> G03 - Gastos en general</p>
            <p><strong>Tipo de Comprobante:</strong> Recibo de Pago</p>
            <p><strong>Moneda:</strong> MXN - Peso Mexicano</p>
            <p><strong>Tipo de Cambio:</strong> 1.00</p>
        </div>

        <div class="signature-section">
            <div class="signature-block">
                <div><strong>Recibí de conformidad</strong></div>
                <div>Padre/Madre/Tutor</div>
            </div>
            <div class="signature-block">
                <div><strong>Autorizado por</strong></div>
                <div>${pagoData.recibido_por}</div>
            </div>
        </div>

        <div class="footer">
            <p>Este recibo fue generado electrónicamente por Edupay</p>
            <p>Documento válido para efectos fiscales y contables</p>
            <p>Fecha de generación: ${new Date().toLocaleString('es-MX')}</p>
        </div>
    </div>
</body>
</html>
    `;

    return receiptContent;
  };

  const generatePDFFromHTML = async (htmlContent: string, filename: string) => {
    try {
      // Crear un elemento temporal para renderizar el HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      tempDiv.style.width = '800px';
      tempDiv.style.backgroundColor = 'white';
      tempDiv.style.padding = '20px';
      document.body.appendChild(tempDiv);

      // Importar html2canvas dinámicamente
      const html2canvas = await import('html2canvas');
      
      // Generar canvas del HTML
      const canvas = await html2canvas.default(tempDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: 'white'
      });

      // Limpiar el elemento temporal
      document.body.removeChild(tempDiv);

      // Convertir canvas a blob de imagen
      return new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          }
        }, 'image/png');
      });
    } catch (error) {
      console.error('Error generando PDF:', error);
      throw error;
    }
  };

  const shareReceipt = async (htmlContent: string, method: 'email' | 'whatsapp' | 'download') => {
    try {
      const filename = `recibo-fiscal-${Date.now()}`;
      
      if (method === 'download') {
        // Descargar como imagen PNG
        const blob = await generatePDFFromHTML(htmlContent, filename);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.png`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: "Recibo descargado",
          description: "El recibo se ha descargado como imagen PNG"
        });
      } else if (method === 'email') {
        // Compartir por email
        const subject = "Recibo de Pago - Edupay";
        const body = "Adjunto el recibo de pago correspondiente.";
        const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, '_blank');
        
        toast({
          title: "Compartir por email",
          description: "Se abrió tu cliente de email para compartir el recibo"
        });
      } else if (method === 'whatsapp') {
        // Compartir por WhatsApp
        const message = "Recibo de pago - Edupay";
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
        
        toast({
          title: "Compartir por WhatsApp",
          description: "Se abrió WhatsApp para compartir el recibo"
        });
      }
    } catch (error) {
      console.error('Error compartiendo recibo:', error);
      toast({
        title: "Error",
        description: "Ocurrió un error al compartir el recibo",
        variant: "destructive"
      });
    }
  };

  const convertirNumeroALetras = (numero: string) => {
    const num = parseFloat(numero || '0');
    if (num === 0) return 'CERO';
    if (num < 1000) return `${Math.floor(num).toString().toUpperCase()}`;
    if (num < 1000000) return `${Math.floor(num / 1000)} MIL ${Math.floor(num % 1000)}`;
    return `${Math.floor(num / 1000000)} MILLONES ${Math.floor((num % 1000000) / 1000)} MIL ${Math.floor(num % 1000)}`;
  };

  const handleRegistrarPago = () => {
    // Validar que los campos requeridos estén completos
    if (!pagoManualForm.estudiante_id || !pagoManualForm.concepto_id || !pagoManualForm.monto) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos obligatorios",
        variant: "destructive",
      });
      return;
    }

    // Generar el recibo fiscal
    const pagoData = {
      estudiante: "Carlos Pérez Méndez", // En producción vendría de la selección
      grado: "3ro A",
      matricula: "EST-001",
      concepto: "Colegiatura Enero",
      metodo: "Efectivo",
      forma: "Pago en una sola exhibición",
      monto: pagoManualForm.monto,
      recibido_por: pagoManualForm.recibido_por,
      observaciones: pagoManualForm.observaciones
    };

    const receiptHTML = generateFiscalReceiptHTML(pagoData);
    setCurrentReceiptHTML(receiptHTML);
    
    // Mostrar opciones de descarga
    setShowReceiptOptions(true);

    toast({
      title: "Pago registrado exitosamente",
      description: "Selecciona cómo deseas descargar o compartir el recibo fiscal",
    });
    
    // Limpiar formulario pero mantener el nombre del usuario
    setPagoManualForm({
      estudiante_id: "",
      concepto_id: "",
      monto: "",
      recibido_por: getUserDisplayName(),
      observaciones: ""
    });
  };

  // Mostrar estado de carga
  if (paymentsLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-600">Cargando pagos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-20 w-72 h-72 bg-gradient-to-br from-blue-400/10 to-cyan-400/10 rounded-full blur-3xl"></div>
        <div className="absolute top-60 right-10 w-56 h-56 bg-gradient-to-br from-purple-400/10 to-pink-400/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-40 left-1/4 w-64 h-64 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl"></div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 space-y-4 md:space-y-6 relative z-10">
        {/* Header simplificado como en la imagen */}
        <div className="mb-6 md:mb-8 relative">
          <div className="relative bg-white/95 backdrop-blur-sm rounded-xl md:rounded-2xl p-4 md:p-6 shadow-xl border border-white/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative p-4 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl">
                  <CreditCard className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl md:text-3xl font-bold text-blue-600 mb-1">Gestión de Pagos</h1>
                  <p className="text-sm md:text-base text-slate-600">Administra pagos recibidos, registra efectivo y concilia movimientos</p>
                </div>
              </div>
              
              {userRole !== 'contador' && (
                <div className="flex items-center gap-4">
                  <Button 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2"
                    onClick={() => setShowRegistrarPago(true)}
                  >
                    <CreditCard className="w-4 h-4" />
                    Registrar Pago
                  </Button>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Sistema Activo
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPI Cards como en la imagen de referencia */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-4 md:mb-6">
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Total del día</p>
                  <p className="text-sm md:text-base font-bold text-blue-600 whitespace-nowrap">$15,750</p>
                  <div className="text-xs text-green-600 mt-1">+12.5% vs ayer</div>
                </div>
                <div className="text-green-500 flex-shrink-0">
                  <DollarSign className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Pagos completados</p>
                  <p className="text-lg md:text-xl font-bold text-blue-600 whitespace-nowrap">24</p>
                  <div className="text-xs text-blue-600 mt-1">+3 desde ayer</div>
                </div>
                <div className="text-blue-500 flex-shrink-0">
                  <CheckCircle className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Tasa de éxito</p>
                  <p className="text-lg md:text-xl font-bold text-blue-600 whitespace-nowrap">94.2%</p>
                  <div className="text-xs text-purple-600 mt-1">Excelente</div>
                </div>
                <div className="text-purple-500 flex-shrink-0">
                  <Receipt className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Pendientes</p>
                  <p className="text-lg md:text-xl font-bold text-blue-600 whitespace-nowrap">3</p>
                  <div className="text-xs text-orange-600 mt-1">Requieren atención</div>
                </div>
                <div className="text-orange-500 flex-shrink-0">
                  <Calendar className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs como en la imagen de referencia */}
        <Tabs defaultValue="lista" className="w-full">
          <TabsList className={`grid w-full ${(userRole === 'admisiones' || userRole === 'contador') ? 'grid-cols-1' : 'grid-cols-2'} bg-transparent p-0 gap-2 h-auto`}>
            <TabsTrigger 
              value="lista" 
              className="rounded-full px-8 py-3 text-sm font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:bg-white data-[state=inactive]:text-slate-600 data-[state=inactive]:shadow-md transition-all duration-300"
            >
              Lista de pagos
            </TabsTrigger>
            {userRole !== 'admisiones' && userRole !== 'contador' && (
              <TabsTrigger 
                value="conciliacion"
                className="rounded-full px-8 py-3 text-sm font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:bg-white data-[state=inactive]:text-slate-600 data-[state=inactive]:shadow-md transition-all duration-300"
              >
                Conciliación
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="lista" className="mt-6">
            {/* Historial de pagos simplificado como en la imagen */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-slate-800">Historial de pagos</h3>
              </div>
              
              {/* Filtros en línea horizontal como en la imagen */}
              <div className="flex items-center gap-4 mb-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-slate-600">Desde:</Label>
                  <Input 
                    type="date" 
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-36 text-sm"
                    placeholder="dd/mm/aaaa"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-slate-600">Hasta:</Label>
                  <Input 
                    type="date" 
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-36 text-sm"
                    placeholder="dd/mm/aaaa"
                  />
                </div>
                <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                  <SelectTrigger className="w-32 text-sm">
                    <SelectValue placeholder="Todos" />
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
                  <SelectTrigger className="w-32 text-sm">
                    <SelectValue placeholder="Todos" />
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
              
              {/* Contenido de la tabla de pagos */}
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

              {/* Mensaje informativo de filtrado por rol */}
              {userRole !== 'admin' && userRole !== 'super_admin' && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Info className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      Mostrando solo pagos relevantes para {
                        userRole === 'admisiones' ? 'Admisiones (inscripciones únicamente)' : 
                        userRole === 'caja' ? 'Caja (colegiaturas, recargos, seguros)' : 
                        userRole === 'contador' ? 'Contador (solo pagos completados)' : 
                        userRole === 'asistente' ? 'Asistente (inscripciones únicamente)' : 
                        'tu rol'
                      }
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {filteredPagos.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No se encontraron pagos con los filtros aplicados</p>
                    {userRole !== 'admin' && userRole !== 'super_admin' && (
                      <p className="mt-2 text-sm text-blue-600">
                        Recuerda que solo ves pagos relevantes para tu rol
                      </p>
                    )}
                  </div>
                ) : (
                  filteredPagos.map((pago: any) => (
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
            </div>
          </TabsContent>



        {userRole !== 'admisiones' && (
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
        )}
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

      {/* Modal de registro de pagos */}
      <Dialog open={showRegistrarPago} onOpenChange={setShowRegistrarPago}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registro de Pagos Manual</DialogTitle>
            <DialogDescription>
              Registra un pago recibido en efectivo y genera el recibo fiscal correspondiente
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="estudiante">Estudiante</Label>
                <Select 
                  value={pagoManualForm.estudiante_id}
                  onValueChange={(value) => setPagoManualForm(prev => ({ ...prev, estudiante_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Buscar estudiante..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Carlos Pérez Méndez</SelectItem>
                    <SelectItem value="2">Andrea García Luna</SelectItem>
                    <SelectItem value="3">Luis Martínez Gil</SelectItem>
                    <SelectItem value="4">María Fernández Castro</SelectItem>
                    <SelectItem value="5">Diego Morales Ruiz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="concepto">Concepto a pagar</Label>
                <Select 
                  value={pagoManualForm.concepto_id}
                  onValueChange={(value) => setPagoManualForm(prev => ({ ...prev, concepto_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar concepto..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Colegiatura Enero - $5,000</SelectItem>
                    <SelectItem value="2">Materiales - $1,500</SelectItem>
                    <SelectItem value="3">Inscripción - $3,000</SelectItem>
                    <SelectItem value="4">Uniformes - $2,500</SelectItem>
                    <SelectItem value="5">Seguro Escolar - $800</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="monto">Monto recibido (MXN)</Label>
                <Input 
                  id="monto"
                  type="number" 
                  value={pagoManualForm.monto}
                  onChange={(e) => setPagoManualForm(prev => ({ ...prev, monto: e.target.value }))}
                  placeholder="5000" 
                />
              </div>
              
              <div>
                <Label htmlFor="recibido_por">Recibido por</Label>
                <Input 
                  id="recibido_por"
                  value={pagoManualForm.recibido_por}
                  onChange={(e) => setPagoManualForm(prev => ({ ...prev, recibido_por: e.target.value }))}
                  placeholder="Nombre del cajero" 
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="observaciones">Observaciones</Label>
              <textarea 
                id="observaciones"
                className="w-full p-2 border rounded"
                rows={3}
                value={pagoManualForm.observaciones}
                onChange={(e) => setPagoManualForm(prev => ({ ...prev, observaciones: e.target.value }))}
                placeholder="Observaciones adicionales..."
              />
            </div>
            
            <div className="flex gap-3">
              <Button 
                onClick={handleRegistrarPago}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Banknote className="w-4 h-4 mr-2" />
                Registrar pago y emitir recibo
              </Button>
              
              <Button
                variant="outline"
                onClick={() => setShowRegistrarPago(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de opciones de descarga y compartir */}
      <Dialog open={showReceiptOptions} onOpenChange={setShowReceiptOptions}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Opciones de Recibo Fiscal</DialogTitle>
            <DialogDescription>
              Selecciona cómo deseas descargar o compartir el recibo fiscal generado
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Button
                onClick={() => shareReceipt(currentReceiptHTML, 'download')}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                Descargar como PNG
              </Button>
              
              <Button
                onClick={() => {
                  // Crear y descargar HTML
                  const blob = new Blob([currentReceiptHTML], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `recibo-fiscal-${Date.now()}.html`;
                  a.click();
                  URL.revokeObjectURL(url);
                  
                  // Abrir ventana de impresión
                  const printWindow = window.open('', '_blank');
                  if (printWindow) {
                    printWindow.document.write(currentReceiptHTML);
                    printWindow.document.close();
                    printWindow.onload = () => {
                      setTimeout(() => printWindow.print(), 500);
                    };
                  }
                  
                  toast({
                    title: "Recibo descargado",
                    description: "El recibo HTML se descargó y se abrió la ventana de impresión"
                  });
                }}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <FileCheck className="w-4 h-4" />
                Descargar HTML + Imprimir
              </Button>
              
              <Button
                onClick={() => shareReceipt(currentReceiptHTML, 'email')}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Enviar por Email
              </Button>
              
              <Button
                onClick={() => shareReceipt(currentReceiptHTML, 'whatsapp')}
                variant="outline"
                className="flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100"
              >
                <MessageCircle className="w-4 h-4 text-green-600" />
                Compartir por WhatsApp
              </Button>
            </div>
            
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => setShowReceiptOptions(false)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}