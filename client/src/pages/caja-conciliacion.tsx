// Módulo 4: Caja y conciliación - Pagos manual, control bancario, conciliación automática
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  RefreshCw,
  Mail,
  MessageCircle
} from "lucide-react";

export default function CajaConciliacion() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showReceiptOptions, setShowReceiptOptions] = useState(false);
  const [currentReceiptHTML, setCurrentReceiptHTML] = useState('');

  // Obtener información del usuario autenticado
  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Función para obtener el nombre completo del usuario basado en su perfil
  const getUserDisplayName = () => {
    if (!user) return "";
    
    // Si hay nombre y apellido en el usuario, usarlos
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    
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

  // Registro de pagos manual
  const PagoEfectivo = () => {
    const [pagoForm, setPagoForm] = useState({
      estudiante_id: "",
      concepto_id: "",
      monto: "",
      recibido_por: "",
      observaciones: ""
    });

    // Establecer automáticamente el campo "Recibido por" cuando el usuario esté disponible
    useEffect(() => {
      if (user && !pagoForm.recibido_por) {
        setPagoForm(prev => ({
          ...prev,
          recibido_por: getUserDisplayName()
        }));
      }
    }, [user]);

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
      <title>Recibo Fiscal - EscuelaPay</title>
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
              <h1>RECIBO FISCAL</h1>
              <p>Instituto San Patricio</p>
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
              <p>Este recibo fue generado electrónicamente por EscuelaPay</p>
              <p>Documento válido para efectos fiscales y contables</p>
              <p>Fecha de generación: ${new Date().toLocaleString('es-MX')}</p>
          </div>
      </div>
  </body>
  </html>
      `;
  
      // Guardar HTML para el modal de opciones
      setCurrentReceiptHTML(receiptContent);
      setShowReceiptOptions(true);
      
      return receiptContent;
    };

    const generatePDFFromHTML = async (htmlContent: string, filename: string) => {
      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.width = '800px';
        tempDiv.style.backgroundColor = 'white';
        tempDiv.style.padding = '20px';
        document.body.appendChild(tempDiv);

        const html2canvas = await import('html2canvas');
        
        const canvas = await html2canvas.default(tempDiv, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: 'white'
        });

        document.body.removeChild(tempDiv);

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
          const subject = "Recibo de Pago - EscuelaPay";
          const body = "Adjunto el recibo de pago correspondiente.";
          const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          window.open(mailtoUrl, '_blank');
          
          toast({
            title: "Compartir por email",
            description: "Se abrió tu cliente de email para compartir el recibo"
          });
        } else if (method === 'whatsapp') {
          const message = "Recibo de pago - EscuelaPay";
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

    const handleRegistrarPagoEfectivo = () => {
      // Validar que los campos requeridos estén completos
      if (!pagoForm.estudiante_id || !pagoForm.concepto_id || !pagoForm.monto) {
        toast({
          title: "Campos requeridos",
          description: "Por favor completa todos los campos obligatorios",
          variant: "destructive",
        });
        return;
      }

      // Generar el recibo fiscal
      const pagoData = {
        estudiante: "Carlos Pérez - 3ro A", // En producción vendría de la selección
        grado: "3ro A",
        matricula: "EST-001",
        concepto: "Colegiatura Enero",
        metodo: "Efectivo",
        forma: "Pago en una sola exhibición",
        monto: pagoForm.monto,
        recibido_por: pagoForm.recibido_por,
        observaciones: pagoForm.observaciones
      };

      const receiptHTML = generateFiscalReceiptHTML(pagoData);

      toast({
        title: "Pago registrado y recibo generado",
        description: "El pago se registró exitosamente y el recibo fiscal ha sido generado"
      });
      
      setPagoForm({
        estudiante_id: "",
        concepto_id: "",
        monto: "",
        recibido_por: getUserDisplayName(),
        observaciones: ""
      });
      
      // Ejecutar la mutación para registrar el pago
      registrarPagoEfectivo.mutate(pagoForm);
    };

    const registrarPagoEfectivo = useMutation({
      mutationFn: (data: any) => apiRequest("POST", "/api/caja/pago-efectivo", data),
      onSuccess: () => {
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
              onClick={handleRegistrarPagoEfectivo}
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
            Registro de pagos manual, control bancario y conciliación automática
          </p>
        </div>

        <Tabs defaultValue="efectivo" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="efectivo">Registro de Pagos Manual</TabsTrigger>
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
                  const blob = new Blob([currentReceiptHTML], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `recibo-fiscal-${Date.now()}.html`;
                  a.click();
                  URL.revokeObjectURL(url);
                  
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
  );
}