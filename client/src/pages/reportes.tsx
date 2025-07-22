import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Download, Eye, Calendar, BarChart3, TrendingUp, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";
import jsPDF from 'jspdf';

export default function Reportes() {
  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();
  const [selectedPeriod, setSelectedPeriod] = useState("2025-01");
  const [selectedFormat, setSelectedFormat] = useState("detallado");
  const [previewReport, setPreviewReport] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  // KPIs simulados del reporte
  const kpisReporte = {
    totalFacturado: 2850000, // centavos
    totalCobrado: 2137500,   // centavos  
    tasaCobranza: 75,
    cargosVencidos: 6,
    estudiantesActivos: 4,
    promedioTiempoPago: 8.5
  };

  // Reportes disponibles simulados
  const reportesDisponibles = [
    { 
      id: 1, 
      nombre: "Reporte Financiero Mensual", 
      descripcion: "Análisis completo de ingresos, pagos y morosidad del período",
      formato: "PDF/TXT", 
      tamaño: "245 KB", 
      fecha: "22/01/2025",
      status: "disponible"
    },
    { 
      id: 2, 
      nombre: "Estado de Cuenta General", 
      descripcion: "Listado detallado de cargos, pagos y saldos pendientes por familia",
      formato: "Excel", 
      tamaño: "89 KB", 
      fecha: "21/01/2025",
      status: "disponible"
    },
    { 
      id: 3, 
      nombre: "Análisis de Cobranza", 
      descripcion: "Métricas de efectividad de cobranza y seguimiento de cartera vencida",
      formato: "PDF", 
      tamaño: "156 KB", 
      fecha: "20/01/2025",
      status: "disponible"
    }
  ];

  const handleGenerarReporte = () => {
    toast({
      title: "Generando Reporte",
      description: "Procesando datos financieros del período...",
      duration: 2000,
    });

    setTimeout(() => {
      // Generar contenido del reporte
      const fechaGeneracion = new Date().toLocaleDateString('es-MX');
      const periodo = selectedPeriod;
      
      const contenido = `REPORTE FINANCIERO INTEGRAL - INSTITUTO JFR
Período: ${periodo}
Fecha de generación: ${fechaGeneracion}

═══════════════════════════════════════════════════════
RESUMEN EJECUTIVO
═══════════════════════════════════════════════════════

Total Facturado: $${(kpisReporte.totalFacturado / 100).toLocaleString('es-MX')}
Total Cobrado: $${(kpisReporte.totalCobrado / 100).toLocaleString('es-MX')}
Tasa de Cobranza: ${kpisReporte.tasaCobranza}%
Cargos Vencidos: ${kpisReporte.cargosVencidos}
Estudiantes Activos: ${kpisReporte.estudiantesActivos}
Promedio Días de Pago: ${kpisReporte.promedioTiempoPago} días

═══════════════════════════════════════════════════════
ANÁLISIS DE MOROSIDAD
═══════════════════════════════════════════════════════

Tasa de Morosidad: ${100 - kpisReporte.tasaCobranza}%
Cargos por Vencer (próximos 7 días): 3
Gestión de Cobranza Activa: ${kpisReporte.cargosVencidos} casos
Tiempo Promedio de Recuperación: 12.3 días

═══════════════════════════════════════════════════════
DESGLOSE POR CONCEPTOS
═══════════════════════════════════════════════════════

Inscripciones: $1,250,000 (43.9%)
Colegiaturas: $1,400,000 (49.1%)
Actividades Extraescolares: $150,000 (5.3%)
Otros Conceptos: $50,000 (1.8%)

═══════════════════════════════════════════════════════
MÉTRICAS EDUPAY
═══════════════════════════════════════════════════════

Meta Institucional: 80% pagos antes del vencimiento
Rendimiento Actual: ${kpisReporte.tasaCobranza}%
Estado: ${kpisReporte.tasaCobranza >= 80 ? 'META ALCANZADA' : 'EN PROGRESO'}
Diferencia vs Meta: ${(kpisReporte.tasaCobranza - 80).toFixed(1)}%

═══════════════════════════════════════════════════════
REPORTES DISPONIBLES
═══════════════════════════════════════════════════════

${reportesDisponibles.map(r => `${r.nombre} - ${r.formato} - ${r.tamaño}`).join('\n')}

---
Generado por Edupay - Sistema de Pagos Escolares
Instituto JFR - ${fechaGeneracion}`;

      // Crear archivo para descarga
      const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `JFR_Reporte_Financiero_${periodo}_${fechaGeneracion.replace(/\//g, '-')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "✅ Reporte Generado Exitosamente",
        description: `Reporte financiero del período ${periodo} descargado correctamente`,
        duration: 4000,
      });
    }, 2000);
  };

  const handleGenerarReporteExcel = () => {
    toast({
      title: "Generando Reporte Excel",
      description: "Procesando datos para exportación en formato CSV...",
      duration: 2000,
    });

    setTimeout(() => {
      // Generar contenido del reporte en formato CSV para Excel
      const fechaGeneracion = new Date().toLocaleDateString('es-MX');
      const periodo = selectedPeriod;
      
      const csvContent = `REPORTE FINANCIERO INTEGRAL - INSTITUTO JFR
Período,${periodo}
Fecha de generación,${fechaGeneracion}

RESUMEN EJECUTIVO
Concepto,Valor
Total Facturado,$${(kpisReporte.totalFacturado / 100).toLocaleString('es-MX')}
Total Cobrado,$${(kpisReporte.totalCobrado / 100).toLocaleString('es-MX')}
Tasa de Cobranza,${kpisReporte.tasaCobranza}%
Cargos Vencidos,${kpisReporte.cargosVencidos}
Estudiantes Activos,${kpisReporte.estudiantesActivos}
Promedio Días de Pago,${kpisReporte.promedioTiempoPago} días

ANÁLISIS DE MOROSIDAD
Concepto,Valor
Tasa de Morosidad,${100 - kpisReporte.tasaCobranza}%
Cargos por Vencer (próximos 7 días),3
Gestión de Cobranza Activa,${kpisReporte.cargosVencidos} casos
Tiempo Promedio de Recuperación,12.3 días

DESGLOSE POR CONCEPTOS
Concepto,Monto,Porcentaje
Inscripciones,$1250000,43.9%
Colegiaturas,$1400000,49.1%
Actividades Extraescolares,$150000,5.3%
Otros Conceptos,$50000,1.8%

MÉTRICAS EDUPAY
Concepto,Valor
Meta Institucional,80% pagos antes del vencimiento
Rendimiento Actual,${kpisReporte.tasaCobranza}%
Estado,${kpisReporte.tasaCobranza >= 80 ? 'META ALCANZADA' : 'EN PROGRESO'}
Diferencia vs Meta,${(kpisReporte.tasaCobranza - 80).toFixed(1)}%

REPORTES DISPONIBLES
${reportesDisponibles.map(r => `${r.nombre},${r.formato},${r.tamaño}`).join('\n')}`;

      // Crear archivo CSV para descarga (compatible con Excel)
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `JFR_Reporte_Financiero_${periodo}_${fechaGeneracion.replace(/\//g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "✅ Reporte Excel Generado",
        description: `Archivo CSV del período ${periodo} compatible con Excel descargado exitosamente`,
        duration: 4000,
      });
    }, 2000);
  };

  const handleGenerarReportePDF = async () => {
    try {
      toast({
        title: "🔄 Generando Reporte PDF",
        description: "Procesando datos del Instituto JFR para exportación en formato PDF profesional...",
        duration: 3000,
      });

      // Función para cargar imagen como base64
      const loadImageAsBase64 = (url: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = reject;
          img.src = url;
        });
      };

      // Función mejorada para cargar imagen desde servidor local
      const loadImageAsBase64Improved = (url: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          // Si es una URL del servidor local, usar fetch
          if (url.startsWith('/api/') || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
            fetch(url, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
              }
            })
            .then(response => response.blob())
            .then(blob => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            })
            .catch(reject);
          } else {
            // Para URLs externas, usar Image con canvas
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = img.width;
              canvas.height = img.height;
              ctx?.drawImage(img, 0, 0);
              resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = url;
          }
        });
      };

      setTimeout(async () => {
        // Crear nuevo documento PDF con formato A4
        const doc = new jsPDF('portrait', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const fechaGeneracion = new Date().toLocaleDateString('es-MX', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const horaGeneracion = new Date().toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit'
        });

        // ========== HEADER PROFESIONAL ==========
        // Header profesional con gradiente visual
        doc.setFillColor(40, 116, 166);
        doc.rect(0, 0, pageWidth, 40, 'F');
        
        // Línea decorativa dorada
        doc.setFillColor(244, 208, 63);
        doc.rect(0, 38, pageWidth, 2, 'F');
        
        // Logo del Instituto JFR - implementación robusta
        let logoCargoCorrecta = false;
        
        // Intentar obtener logo desde configuración del sistema primero
        let logoFromConfig = null;
        try {
          const configResponse = await fetch('/api/admin/settings/1', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
          });
          if (configResponse.ok) {
            const config = await configResponse.json();
            if (config.logo_url) {
              logoFromConfig = config.logo_url;
              console.log('Logo obtenido desde configuración:', logoFromConfig);
            }
          }
        } catch (error) {
          console.log('No se pudo obtener logo desde configuración:', error);
        }

        // Usar logo real desde configuración institucional
        let logoToUse = logoUrl || logoFromConfig;
        
        if (logoToUse) {
          try {
            // Si es un data URL (base64), usarlo directamente
            if (logoToUse.startsWith('data:')) {
              doc.addImage(logoToUse, 'PNG', 22, 9, 16, 16);
              logoCargoCorrecta = true;
              console.log('Logo institucional real cargado desde configuración');
            } else {
              // Si es URL, convertir a base64
              const logoBase64 = await loadImageAsBase64Improved(logoToUse);
              doc.addImage(logoBase64, 'PNG', 22, 9, 16, 16);
              logoCargoCorrecta = true;
              console.log('Logo institucional convertido a base64 y cargado');
            }
          } catch (error) {
            console.log('Error cargando logo institucional:', error);
          }
        }
        
        // Solo usar fallback si no hay logo institucional configurado
        if (!logoCargoCorrecta && !logoToUse) {
          try {
            const logoFallback = 'data:image/svg+xml;base64,' + btoa(`
              <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="18" fill="#2874a6" stroke="#ffffff" stroke-width="2"/>
                <text x="20" y="16" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="10" font-weight="bold">JFR</text>
                <text x="20" y="28" text-anchor="middle" fill="#f4d03f" font-family="Arial, sans-serif" font-size="6" font-weight="bold">EDUCACIÓN</text>
              </svg>
            `);
            doc.addImage(logoFallback, 'PNG', 22, 9, 16, 16);
            logoCargoCorrecta = true;
            console.log('Logo fallback usado como último recurso');
          } catch (error) {
            console.log('Error con logo fallback:', error);
          }
        }
        
        // Si no se pudo cargar ningún logo, usar fallback
        if (!logoCargoCorrecta) {
          console.log('Usando logo fallback JFR');
          doc.setFillColor(255, 255, 255);
          doc.circle(30, 17.5, 8, 'F');
          doc.setTextColor(40, 116, 166);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.text('JFR', 25.5, 20);
        }
        
        // Nombre de la institución
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('INSTITUTO JFR', 45, 15);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Sistema Integrado de Gestión Escolar', 45, 22);
        doc.text('RFC: IJF123456789 | Tel: (555) 123-4567', 45, 28);
        
        // Información del reporte (lado derecho)
        const rightX = pageWidth - 60;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('REPORTE FINANCIERO', rightX, 15);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Período: ${selectedPeriod}`, rightX, 22);
        doc.text(`Generado: ${fechaGeneracion}`, rightX, 27);
        doc.text(`Hora: ${horaGeneracion}`, rightX, 32);

        // ========== INFORMACIÓN GENERAL ==========
        let currentY = 50;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('ESTADO DE CUENTA GENERAL - VISTA PREVIA', margin, currentY);
        
        currentY += 15;
        
        // Marco de información básica
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(margin, currentY, pageWidth - (margin * 2), 35);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('INFORMACIÓN DEL REPORTE', margin + 5, currentY + 8);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Instituto JFR - ${fechaGeneracion}`, margin + 5, currentY + 18);
        doc.text(`Período: ${selectedPeriod}`, margin + 5, currentY + 25);
        doc.text('Formato: PDF Profesional', margin + 5, currentY + 32);

        currentY += 50;

        // ========== FAMILIAS REGISTRADAS ==========
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(40, 116, 166);
        doc.text('FAMILIAS REGISTRADAS', margin, currentY);
        
        currentY += 10;
        doc.setDrawColor(40, 116, 166);
        doc.setLineWidth(1);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        
        currentY += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        
        const familiasData = [
          '• Total Familias: 27',
          '• Familias al Corriente: 21 (77.8%)',
          '• Familias con Saldo: 6 (22.2%)'
        ];
        
        familiasData.forEach((item, index) => {
          doc.text(item, margin + 5, currentY + (index * 6));
        });
        
        currentY += 25;

        // ========== RESUMEN DE CARGOS ==========
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(40, 116, 166);
        doc.text('RESUMEN DE CARGOS', margin, currentY);
        
        currentY += 10;
        doc.setDrawColor(40, 116, 166);
        doc.setLineWidth(1);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        
        currentY += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        
        const cargosData = [
          `• Cargos Totales: 43`,
          `• Cargos Pagados: 37`,
          `• Cargos Pendientes: 6`,
          `• Monto Pendiente: $7,125`
        ];
        
        cargosData.forEach((item, index) => {
          doc.text(item, margin + 5, currentY + (index * 6));
        });
        
        currentY += 35;

        // ========== ANÁLISIS DE ANTIGÜEDAD ==========
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(40, 116, 166);
        doc.text('ANÁLISIS DE ANTIGÜEDAD', margin, currentY);
        
        currentY += 10;
        doc.setDrawColor(40, 116, 166);
        doc.setLineWidth(1);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        
        currentY += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        
        const antiguedadData = [
          '• 0-30 días: 4 cargos',
          '• 31-60 días: 2 cargos',
          '• Más de 60 días: 0 cargos'
        ];
        
        antiguedadData.forEach((item, index) => {
          doc.text(item, margin + 5, currentY + (index * 6));
        });
        
        currentY += 30;

        // ========== DETALLE POR FAMILIA ==========
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(40, 116, 166);
        doc.text('DETALLE POR FAMILIA', margin, currentY);
        
        currentY += 10;
        doc.setDrawColor(40, 116, 166);
        doc.setLineWidth(1);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        
        currentY += 15; // Espacio extra sin texto problemático

        // ========== FOOTER PROFESIONAL ==========
        // Asegurar espacio suficiente para el footer - mayor separación
        const footerY = pageHeight - 60;
        
        // Línea separadora del footer
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
        
        // Información del lado izquierdo
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('Generado por Edupay - Sistema de Pagos Escolares', margin, footerY);
        doc.text('www.edupay.mx | soporte@edupay.mx', margin, footerY + 4);
        doc.text(`Documento generado el ${fechaGeneracion} a las ${horaGeneracion}`, margin, footerY + 8);
        
        // Información del lado derecho (bien separada)
        doc.text('Página 1 de 1', pageWidth - 50, footerY);
        doc.text('Confidencial', pageWidth - 50, footerY + 4);
        doc.text('Uso Interno', pageWidth - 50, footerY + 8);

        // ========== MARCA DE AGUA SUTIL ==========
        doc.setTextColor(240, 240, 240);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(60);
        doc.text('JFR', pageWidth/2 - 20, pageHeight/2, { angle: 45 });
        
        // Descargar el PDF
        doc.save(`Estado_Cuenta_JFR_${selectedPeriod}_${fechaGeneracion.replace(/\s/g, '_')}.pdf`);
        
        toast({
          title: "Reporte PDF Profesional Generado",
          description: `Estado de cuenta del Instituto JFR - ${selectedPeriod}`,
          duration: 3000,
        });
      }, 2000);
      
    } catch (error) {
      console.error('Error generando PDF profesional:', error);
      toast({
        title: "Error",
        description: "Hubo un problema generando el reporte PDF",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleGenerarReportePDFEspecifico = async (reporte: any) => {
    try {
      toast({
        title: "Generando PDF Profesional",
        description: `Creando ${reporte.nombre} con formato ejecutivo...`,
        duration: 2000,
      });

      // Función para cargar imagen como base64
      const loadImageAsBase64 = (url: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = reject;
          img.src = url;
        });
      };

      setTimeout(async () => {
        // Crear nuevo documento PDF con formato A4 profesional
        const doc = new jsPDF('portrait', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const fechaGeneracion = new Date().toLocaleDateString('es-MX', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const horaGeneracion = new Date().toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const contenidoVistaPrevie = generatePreviewContent(reporte);
        
        // ========== HEADER EJECUTIVO ==========
        // Barra superior azul institucional
        doc.setFillColor(40, 116, 166);
        doc.rect(0, 0, pageWidth, 40, 'F');
        
        // Logo del Instituto JFR - implementación robusta
        let logoCargoCorrecta = false;
        
        // Usar logo real desde configuración institucional en modal
        let logoToUseModal = logoUrl;
        
        if (logoToUseModal) {
          try {
            // Si es un data URL (base64), usarlo directamente
            if (logoToUseModal.startsWith('data:')) {
              doc.addImage(logoToUseModal, 'PNG', 20, 12, 20, 20);
              logoCargoCorrecta = true;
              console.log('Modal: Logo institucional real cargado desde configuración');
            } else {
              // Si es URL, convertir a base64
              const logoBase64 = await loadImageAsBase64(logoToUseModal);
              doc.addImage(logoBase64, 'PNG', 20, 12, 20, 20);
              logoCargoCorrecta = true;
              console.log('Modal: Logo institucional convertido a base64 y cargado');
            }
          } catch (error) {
            console.log('Modal: Error cargando logo institucional:', error);
          }
        }
        
        // Solo usar fallback si no hay logo institucional configurado
        if (!logoCargoCorrecta && !logoToUseModal) {
          try {
            const logoFallbackModal = 'data:image/svg+xml;base64,' + btoa(`
              <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="18" fill="#2874a6" stroke="#ffffff" stroke-width="2"/>
                <text x="20" y="16" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="10" font-weight="bold">JFR</text>
                <text x="20" y="28" text-anchor="middle" fill="#f4d03f" font-family="Arial, sans-serif" font-size="6" font-weight="bold">EDUCACIÓN</text>
              </svg>
            `);
            doc.addImage(logoFallbackModal, 'PNG', 20, 12, 20, 20);
            logoCargoCorrecta = true;
            console.log('Modal: Logo fallback usado como último recurso');
          } catch (error) {
            console.log('Modal: Error con logo fallback:', error);
          }
        }
        
        // Si no se pudo cargar ningún logo, usar fallback
        if (!logoCargoCorrecta) {
          console.log('Usando logo fallback JFR específico');
          doc.setFillColor(255, 255, 255);
          doc.circle(30, 20, 10, 'F');
          doc.setTextColor(40, 116, 166);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.text('JFR', 24.5, 24);
        }
        
        // Información institucional actualizada
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text('INSTITUTO JFR', 50, 18);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text('Sistema Edupay de Gestión de Pagos Escolares', 50, 26);
        
        // Fecha y hora en el header
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Generado: ${fechaGeneracion} ${horaGeneracion}`, pageWidth - 80, 18);
        doc.text('Documento Confidencial', pageWidth - 80, 26);
        doc.text('RFC: IJF123456789 | Acreditación SEP: ES-25-09-0234', 50, 33);
        
        // Información del documento (esquina superior derecha)
        const rightX = pageWidth - 70;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('DOCUMENTO OFICIAL', rightX, 18);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Fecha: ${fechaGeneracion}`, rightX, 25);
        doc.text(`Hora: ${horaGeneracion}`, rightX, 30);
        doc.text(`Formato: ${reporte.formato}`, rightX, 35);

        // ========== TÍTULO DEL REPORTE ==========
        let currentY = 55;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        const titulo = contenidoVistaPrevie.title.toUpperCase();
        doc.text(titulo, margin, currentY);
        
        currentY += 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(`Período de Análisis: ${selectedPeriod}`, margin, currentY);
        
        currentY += 15;
        
        // Línea decorativa
        doc.setDrawColor(40, 116, 166);
        doc.setLineWidth(2);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        
        currentY += 15;

        // ========== CONTENIDO ESTRUCTURADO ==========
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        
        // Procesar contenido línea por línea con formato mejorado
        const contenidoLineas = contenidoVistaPrevie.content.split('\n');
        const lineHeight = 6;
        const maxY = pageHeight - 80; // Margen inferior para footer - mayor espacio
        
        contenidoLineas.forEach((linea, index) => {
          // Manejar salto de página
          if (currentY > maxY) {
            // Agregar nueva página
            doc.addPage();
            currentY = 30;
            
            // Mini header en páginas adicionales
            doc.setFillColor(240, 248, 255);
            doc.rect(0, 0, pageWidth, 25, 'F');
            doc.setTextColor(40, 116, 166);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text('INSTITUTO JFR - ' + titulo, margin, 15);
            currentY = 35;
          }
          
          // Limpiar línea de emojis y caracteres especiales
          const lineaLimpia = linea.replace(/[📊💰⚠️✅📋💳👨‍👩‍👧‍👦📈⏰🔄📞═]/g, '').trim();
          
          if (lineaLimpia) {
            // Formatear encabezados y secciones
            if (lineaLimpia.includes('═══') || lineaLimpia.includes('RESUMEN') || lineaLimpia.includes('ANÁLISIS')) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(12);
              doc.setTextColor(40, 116, 166);
              currentY += 5; // Espacio extra antes de secciones
            } else if (lineaLimpia.includes(':') && lineaLimpia.length < 50) {
              // Subsecciones
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(11);
              doc.setTextColor(0, 0, 0);
            } else if (lineaLimpia.startsWith('•') || lineaLimpia.startsWith('-')) {
              // Elementos de lista
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(0, 0, 0);
            } else {
              // Texto normal
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(60, 60, 60);
            }
            
            // Dividir líneas largas si es necesario
            const maxWidth = pageWidth - (margin * 2);
            const splitLines = doc.splitTextToSize(lineaLimpia, maxWidth);
            
            splitLines.forEach((splitLine: string) => {
              if (currentY > maxY) {
                doc.addPage();
                currentY = 30;
              }
              doc.text(splitLine, margin, currentY);
              currentY += lineHeight;
            });
          } else {
            // Línea vacía - añadir espacio menor
            currentY += lineHeight / 2;
          }
        });

        // ========== FOOTER INSTITUCIONAL MEJORADO ==========
        const footerStartY = pageHeight - 45;
        
        // Línea separadora elegante con degradado visual
        doc.setDrawColor(40, 116, 166);
        doc.setLineWidth(2);
        doc.line(margin, footerStartY - 5, pageWidth - margin, footerStartY - 5);
        
        // Sub-línea dorada
        doc.setDrawColor(244, 208, 63);
        doc.setLineWidth(0.5);
        doc.line(margin, footerStartY - 3, pageWidth - margin, footerStartY - 3);
        
        // Información institucional (lado izquierdo)
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('INSTITUTO JFR | Sistema Edupay de Gestión de Pagos Escolares', margin, footerStartY + 3);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('📧 administracion@institutojfr.edu.mx | 🌐 www.institutojfr.edu.mx', margin, footerStartY + 8);
        doc.text(`📅 Generado: ${fechaGeneracion} ⏰ ${horaGeneracion}`, margin, footerStartY + 13);
        
        // Información de seguridad y paginación (lado derecho)
        const totalPages = doc.internal.pages.length - 1;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`Página ${totalPages}`, pageWidth - 45, footerStartY + 3);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('🔒 CONFIDENCIAL', pageWidth - 45, footerStartY + 8);
        doc.text('📋 Uso Interno', pageWidth - 45, footerStartY + 13);

        // ========== MARCA DE AGUA INSTITUCIONAL ==========
        doc.setTextColor(250, 250, 250);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(50);
        doc.text('JFR', pageWidth/2 - 15, pageHeight/2, { angle: 45 });
        
        // Descargar el PDF con nombre profesional
        const nombreArchivo = `JFR_${reporte.nombre.replace(/\s+/g, '_')}_${selectedPeriod}_${fechaGeneracion.replace(/\s/g, '_')}.pdf`;
        doc.save(nombreArchivo);
        
        toast({
          title: "✅ PDF Generado Exitosamente",
          description: `${reporte.nombre} - Instituto JFR en formato ejecutivo profesional`,
          duration: 4000,
        });
      }, 2000);
      
    } catch (error) {
      console.error('Error generando PDF profesional:', error);
      toast({
        title: "Error",
        description: "Hubo un problema generando el documento PDF",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleDescargarReporte = (reporte: any) => {
    const contenido = `REPORTE: ${reporte.nombre}
Período: ${selectedPeriod}
Fecha de generación: ${new Date().toLocaleDateString('es-MX')}

${reporte.descripcion}

DATOS INCLUIDOS:
- Total facturado: $${(kpisReporte.totalFacturado / 100).toLocaleString('es-MX')}
- Total cobrado: $${(kpisReporte.totalCobrado / 100).toLocaleString('es-MX')}
- Tasa de cobranza: ${kpisReporte.tasaCobranza}%
- Cargos vencidos: ${kpisReporte.cargosVencidos}
- Estudiantes activos: ${kpisReporte.estudiantesActivos}

Generado por Edupay - Sistema de Pagos Escolares`;

    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reporte.nombre.replace(/\s+/g, '_')}_${selectedPeriod}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Descarga Completada",
      description: `${reporte.nombre} descargado exitosamente`,
      duration: 3000,
    });
  };

  const handlePreviewReport = (reporte: any) => {
    setPreviewReport(reporte);
    setShowPreview(true);
    
    toast({
      title: "Vista Previa",
      description: `Mostrando vista previa de ${reporte.nombre}`,
      duration: 2000,
    });
  };

  const generatePreviewContent = (reporte: any) => {
    const fechaGeneracion = new Date().toLocaleDateString('es-MX');
    
    switch(reporte.id) {
      case 1: // Reporte Financiero Mensual
        return {
          title: "Reporte Financiero Mensual - Vista Previa",
          content: `
══════════════════════════════════════
INSTITUTO JFR - REPORTE FINANCIERO
══════════════════════════════════════
Período: ${selectedPeriod}
Fecha: ${fechaGeneracion}

📊 RESUMEN EJECUTIVO
• Total Facturado: $${(kpisReporte.totalFacturado / 100).toLocaleString('es-MX')}
• Total Cobrado: $${(kpisReporte.totalCobrado / 100).toLocaleString('es-MX')}
• Tasa de Cobranza: ${kpisReporte.tasaCobranza}%
• Estudiantes Activos: ${kpisReporte.estudiantesActivos}

💰 DESGLOSE POR CONCEPTOS
• Inscripciones: $1,250,000 (43.9%)
• Colegiaturas: $1,400,000 (49.1%)
• Actividades: $150,000 (5.3%)
• Otros: $50,000 (1.8%)

⚠️ ANÁLISIS DE MOROSIDAD
• Cargos Vencidos: ${kpisReporte.cargosVencidos}
• Tiempo Promedio Pago: ${kpisReporte.promedioTiempoPago} días
• Gestión Activa: ${kpisReporte.cargosVencidos} casos

✅ MÉTRICAS EDUPAY
• Meta: 80% pagos antes vencimiento
• Actual: ${kpisReporte.tasaCobranza}%
• Estado: ${kpisReporte.tasaCobranza >= 80 ? 'META ALCANZADA ✓' : 'EN PROGRESO 📈'}
          `
        };
      
      case 2: // Estado de Cuenta General
        return {
          title: "Estado de Cuenta General - Vista Previa",
          content: `
══════════════════════════════════════
ESTADO DE CUENTA GENERAL
══════════════════════════════════════
Instituto JFR - ${fechaGeneracion}

📋 FAMILIAS REGISTRADAS
• Total Familias: 27
• Familias al Corriente: 21 (77.8%)
• Familias con Saldo: 6 (22.2%)

💳 RESUMEN DE CARGOS
• Cargos Totales: 43
• Cargos Pagados: 37
• Cargos Pendientes: 6
• Monto Pendiente: $${((kpisReporte.totalFacturado - kpisReporte.totalCobrado) / 100).toLocaleString('es-MX')}

👨‍👩‍👧‍👦 DETALLE POR FAMILIA
[Datos detallados por familia con saldos, 
 fechas de vencimiento y conceptos pendientes]

📊 ANÁLISIS DE ANTIGÜEDAD
• 0-30 días: 4 cargos
• 31-60 días: 2 cargos
• Más de 60 días: 0 cargos
          `
        };
      
      case 3: // Análisis de Cobranza
        return {
          title: "Análisis de Cobranza - Vista Previa",
          content: `
══════════════════════════════════════
ANÁLISIS DE COBRANZA
══════════════════════════════════════
Instituto JFR - Período ${selectedPeriod}

📈 MÉTRICAS DE EFECTIVIDAD
• Tasa de Cobranza: ${kpisReporte.tasaCobranza}%
• Tiempo Promedio Recuperación: 12.3 días
• Efectividad de Recordatorios: 85%
• Respuesta a Llamadas: 72%

⏰ ANÁLISIS TEMPORAL
• Pagos Antes Vencimiento: ${Math.round(kpisReporte.tasaCobranza * 0.8)}%
• Pagos en Fecha: ${Math.round(kpisReporte.tasaCobranza * 0.15)}%
• Pagos Tardíos: ${Math.round(kpisReporte.tasaCobranza * 0.05)}%

🔄 GESTIÓN DE CARTERA
• Casos Activos: ${kpisReporte.cargosVencidos}
• Casos Resueltos: ${Math.max(0, 15 - kpisReporte.cargosVencidos)}
• Tasa de Recuperación: 89%
• Tiempo Promedio Gestión: 8.5 días

📞 ESTRATEGIAS DE COBRANZA
• Email Recordatorios: Activo
• SMS Automáticos: Activo  
• Llamadas Programadas: Activo
• Portal Padres: 95% adopción
          `
        };
      
      default:
        return {
          title: "Vista Previa del Reporte",
          content: `
══════════════════════════════════════
${reporte.nombre.toUpperCase()}
══════════════════════════════════════

${reporte.descripcion}

Período: ${selectedPeriod}
Formato: ${reporte.formato}
Tamaño: ${reporte.tamaño}
Fecha: ${reporte.fecha}

📊 Contenido del reporte disponible
   para descarga completa.
          `
        };
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header Moderno */}
      <div className="bg-white shadow-lg border-b-4 border-gradient-to-r from-blue-600 to-indigo-600">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                  Reportes y Análisis
                </h1>
                <p className="text-slate-600 text-lg">Sistema integral de reportes financieros - Instituto JFR</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 px-6 py-3"
                onClick={handleGenerarReporte}
              >
                <FileText className="w-5 h-5 mr-2" />
                Generar Reporte
              </Button>
              <Button 
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 px-6 py-3"
                onClick={handleGenerarReporteExcel}
              >
                <Download className="w-5 h-5 mr-2" />
                Exportar Excel
              </Button>
              <Button 
                className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 px-6 py-3"
                onClick={handleGenerarReportePDF}
              >
                <FileText className="w-5 h-5 mr-2" />
                Exportar PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Container Principal */}
      <div className="container mx-auto px-6 py-8">
        {/* Filtros de período */}
        <div className="mb-8">
          <Card className="bg-white shadow-md border-l-4 border-blue-500">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <label className="text-sm font-medium text-slate-700">Período:</label>
                  <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2025-01">Enero 2025</SelectItem>
                      <SelectItem value="2024-12">Diciembre 2024</SelectItem>
                      <SelectItem value="2024-11">Noviembre 2024</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  <label className="text-sm font-medium text-slate-700">Formato:</label>
                  <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="detallado">Detallado</SelectItem>
                      <SelectItem value="ejecutivo">Ejecutivo</SelectItem>
                      <SelectItem value="auditoria">Auditoría</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPIs del período - Diseño Mejorado */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-l-4 border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-blue-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Resumen Financiero
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Total facturado:</span>
                  <span className="font-bold text-lg text-slate-800">${(kpisReporte.totalFacturado / 100).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Total cobrado:</span>
                  <span className="font-bold text-lg text-green-600">${(kpisReporte.totalCobrado / 100).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Tasa de cobranza:</span>
                  <Badge className="bg-blue-600">{kpisReporte.tasaCobranza}%</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-orange-500 bg-gradient-to-br from-orange-50 to-orange-100 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-orange-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Análisis de Morosidad
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Cargos vencidos:</span>
                  <Badge variant="destructive">{kpisReporte.cargosVencidos}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Tasa de morosidad:</span>
                  <span className="font-bold text-lg text-orange-600">{100 - kpisReporte.tasaCobranza}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Promedio días pago:</span>
                  <span className="font-bold text-lg text-slate-800">{kpisReporte.promedioTiempoPago} días</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-green-500 bg-gradient-to-br from-green-50 to-emerald-100 shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-green-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Meta Edupay
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-3">
                <div className="text-4xl font-bold text-green-600">80%</div>
                <div className="text-sm text-green-700 font-medium">Meta pagos antes vencimiento</div>
                <div className="text-3xl font-bold text-blue-600">{kpisReporte.tasaCobranza}%</div>
                <Badge className={kpisReporte.tasaCobranza >= 80 ? "bg-green-600" : "bg-yellow-600"}>
                  {kpisReporte.tasaCobranza >= 80 ? "META ALCANZADA" : "EN PROGRESO"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Reportes Disponibles */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-slate-800">Reportes Disponibles</CardTitle>
            <CardDescription>
              Descarga reportes generados previamente o crea nuevos análisis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reportesDisponibles.map((reporte) => (
                <Card key={reporte.id} className="border-2 hover:border-blue-300 transition-colors duration-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-slate-800">{reporte.nombre}</CardTitle>
                    <CardDescription className="text-sm">{reporte.descripcion}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Formato:</span>
                        <Badge variant="outline">{reporte.formato}</Badge>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Tamaño:</span>
                        <span className="font-medium">{reporte.tamaño}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Fecha:</span>
                        <span className="font-medium">{reporte.fecha}</span>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button 
                          size="sm" 
                          className="flex-1 bg-blue-600 hover:bg-blue-700"
                          onClick={() => handleDescargarReporte(reporte)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Descargar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handlePreviewReport(reporte)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Modal de Vista Previa */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <FileText className="w-6 h-6 text-blue-600" />
                {previewReport && generatePreviewContent(previewReport).title}
              </DialogTitle>
              <DialogDescription>
                Vista previa del contenido del reporte - {previewReport?.formato}
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 rounded-lg border my-4">
              <pre className="whitespace-pre-wrap font-mono text-sm text-slate-800 leading-relaxed">
                {previewReport && generatePreviewContent(previewReport).content}
              </pre>
            </div>
            
            <div className="flex-shrink-0 flex justify-between items-center pt-4 border-t bg-white">
              <div className="text-sm text-slate-600">
                Para obtener el reporte completo, utiliza el botón "Descargar"
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowPreview(false)}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cerrar
                </Button>
                <Button 
                  onClick={() => {
                    if (previewReport) {
                      handleDescargarReporte(previewReport);
                      setShowPreview(false);
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar TXT
                </Button>
                <Button 
                  onClick={() => {
                    if (previewReport) {
                      handleGenerarReportePDFEspecifico(previewReport);
                      setShowPreview(false);
                    }
                  }}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Descargar PDF
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}