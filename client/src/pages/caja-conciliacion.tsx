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
import { useInstitution } from "@/hooks/use-institution";
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
  const { logoUrl, institutionName } = useInstitution();
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
          const subject = "Recibo de Pago - Edupay";
          const body = "Adjunto el recibo de pago correspondiente.";
          const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          window.open(mailtoUrl, '_blank');
          
          toast({
            title: "Compartir por email",
            description: "Se abrió tu cliente de email para compartir el recibo"
          });
        } else if (method === 'whatsapp') {
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
        <Card className="bg-white rounded-2xl shadow-lg border-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-green-600 text-xl">
              <div className="p-3 bg-green-100 rounded-xl">
                <Banknote className="w-5 h-5" />
              </div>
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
        <Card className="bg-white rounded-2xl shadow-lg border-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-blue-600 text-xl">
              <div className="p-3 bg-blue-100 rounded-xl">
                <FileCheck className="w-5 h-5" />
              </div>
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
          <Card className="bg-white rounded-2xl shadow-lg border-0 p-6">
            <CardContent className="p-0 text-center">
              <div className="p-3 bg-green-100 rounded-xl inline-block mb-3">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-2xl font-bold text-green-600">${((estadisticasConciliacion?.ingresos_dia || 0) / 100).toLocaleString()}</div>
              <div className="text-sm text-slate-600">Ingresos del día</div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-2xl shadow-lg border-0 p-6">
            <CardContent className="p-0 text-center">
              <div className="p-3 bg-blue-100 rounded-xl inline-block mb-3">
                <CheckCircle className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-600">{estadisticasConciliacion?.movimientos_conciliados || 0}</div>
              <div className="text-sm text-slate-600">Conciliados</div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-2xl shadow-lg border-0 p-6">
            <CardContent className="p-0 text-center">
              <div className="p-3 bg-orange-100 rounded-xl inline-block mb-3">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <div className="text-2xl font-bold text-orange-600">{estadisticasConciliacion?.movimientos_pendientes || 0}</div>
              <div className="text-sm text-slate-600">Pendientes</div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-2xl shadow-lg border-0 p-6">
            <CardContent className="p-0 text-center">
              <div className="p-3 bg-red-100 rounded-xl inline-block mb-3">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="text-2xl font-bold text-red-600">{estadisticasConciliacion?.diferencias || 0}</div>
              <div className="text-sm text-slate-600">Diferencias</div>
            </CardContent>
          </Card>
        </div>

        {/* Acciones de conciliación */}
        <Card className="bg-white rounded-2xl shadow-lg border-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3 text-purple-600 text-xl">
              <div className="p-3 bg-purple-100 rounded-xl">
                <RefreshCw className="w-5 h-5" />
              </div>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-20 w-72 h-72 bg-gradient-to-br from-blue-400/10 to-cyan-400/10 rounded-full blur-3xl"></div>
        <div className="absolute top-60 right-10 w-56 h-56 bg-gradient-to-br from-purple-400/10 to-pink-400/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-40 left-1/4 w-64 h-64 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl"></div>
      </div>
      
      <div className="max-w-7xl mx-auto p-6 space-y-6 relative z-10">
        {/* Header profesional como en el Dashboard */}
        <div className="mb-8 relative">
          <div className="relative bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative p-4 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl">
                  <Banknote className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-green-600 mb-1">Caja y Conciliación</h1>
                  <p className="text-slate-600">Registro de pagos manual, control bancario y conciliación automática</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Sistema Activo
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards como en el Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white rounded-2xl shadow-lg border-0 p-6">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Efectivo del día</p>
                  <p className="text-2xl font-bold text-green-600">$8,450</p>
                  <div className="text-xs text-green-600 mt-1">5 pagos registrados</div>
                </div>
                <div className="p-3 bg-green-100 rounded-xl">
                  <Banknote className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-2xl shadow-lg border-0 p-6">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Transferencias</p>
                  <p className="text-2xl font-bold text-blue-600">$24,300</p>
                  <div className="text-xs text-blue-600 mt-1">12 movimientos</div>
                </div>
                <div className="p-3 bg-blue-100 rounded-xl">
                  <RefreshCw className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-2xl shadow-lg border-0 p-6">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Por conciliar</p>
                  <p className="text-2xl font-bold text-orange-600">3</p>
                  <div className="text-xs text-orange-600 mt-1">Pendientes</div>
                </div>
                <div className="p-3 bg-orange-100 rounded-xl">
                  <Clock className="h-6 w-6 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-2xl shadow-lg border-0 p-6">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total del día</p>
                  <p className="text-2xl font-bold text-purple-600">$32,750</p>
                  <div className="text-xs text-green-600 mt-1">+8.2% vs ayer</div>
                </div>
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Calculator className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="efectivo" className="space-y-6">
          <div className="relative bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/40">
            <TabsList className="grid w-full grid-cols-3 bg-slate-100 rounded-xl">
              <TabsTrigger value="efectivo" className="data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-sm rounded-lg">
                <Banknote className="w-4 h-4 mr-2" />
                Registro de Pagos Manual
              </TabsTrigger>
              <TabsTrigger value="bancarios" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg">
                <RefreshCw className="w-4 h-4 mr-2" />
                Control bancario
              </TabsTrigger>
              <TabsTrigger value="conciliacion" className="data-[state=active]:bg-white data-[state=active]:text-purple-600 data-[state=active]:shadow-sm rounded-lg">
                <Calculator className="w-4 h-4 mr-2" />
                Conciliación automática
              </TabsTrigger>
            </TabsList>
          </div>

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