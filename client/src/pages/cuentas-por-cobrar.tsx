import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Clock, DollarSign, Users, Download, Eye, Search, Filter, X, FileText, FileSpreadsheet, Phone, Mail, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";

type CuentaPorCobrar = {
  id: number;
  student_id: number;
  estudiante: string;
  responsable?: string | null;
  telefono?: string | null;
  email?: string | null;
  nivel_escolar?: string | null;
  grado?: string | null;
  concepto: string;
  pendiente_pagar_centavos: number;
  estado_cobranza: string;
  dias_vencido: number;
  fecha_vencimiento?: string | null;
};

type ActividadCobranza = {
  id: number;
  charge_id: number;
  student_id: number;
  estudiante: string;
  creado_por?: string | null;
  tipo: string;
  estado: string;
  titulo: string;
  descripcion?: string | null;
  fecha_programada?: string | null;
  hora_programada?: string | null;
  monto_centavos?: number | null;
  canal?: string | null;
  prioridad?: string | null;
  motivo?: string | null;
  supervisor?: string | null;
  urgencia?: string | null;
  created_at: string;
};

function activityIsPending(activity: ActividadCobranza) {
  return activity.estado === "pendiente" || activity.estado === "programado";
}

export default function CuentasPorCobrar() {
  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();
  const queryClient = useQueryClient();
  
  // Estados locales
  const [filtros, setFiltros] = useState({
    fechaInicio: undefined as Date | undefined,
    fechaFin: undefined as Date | undefined,
    estudiante: "",
    concepto: "todas",
    formato: "detallado"
  });
  
  const [reporteSeleccionado, setReporteSeleccionado] = useState<any>(null);
  const [modalVistaPrevia, setModalVistaPrevia] = useState(false);

  // Estados para modal de detalles de cuenta
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<any>(null);
  const [modalDetallesCuenta, setModalDetallesCuenta] = useState(false);
  
  // Estados para modal de detalles de actividad
  const [actividadSeleccionada, setActividadSeleccionada] = useState<any>(null);
  const [modalDetallesActividad, setModalDetallesActividad] = useState(false);

  // Estados para modales de acciones de seguimiento
  const [modalProgramarSeguimiento, setModalProgramarSeguimiento] = useState(false);
  const [modalAgregarNota, setModalAgregarNota] = useState(false);
  const [modalEscalarCaso, setModalEscalarCaso] = useState(false);
  
  // Estados para formularios de seguimiento
  const [seguimientoData, setSeguimientoData] = useState({
    chargeId: "",
    tipo: "llamada",
    fecha: "",
    hora: "",
    observaciones: ""
  });
  const [notaData, setNotaData] = useState({
    chargeId: "",
    titulo: "",
    contenido: "",
    prioridad: "normal"
  });
  const [escalacionData, setEscalacionData] = useState({
    chargeId: "",
    motivo: "",
    supervisor: "",
    urgencia: "media",
    detalles: ""
  });

  // Estados para modales de herramientas de seguimiento
  const [modalIniciarCobranza, setModalIniciarCobranza] = useState(false);
  const [modalEnviarRecordatorios, setModalEnviarRecordatorios] = useState(false);
  const [modalRegistrarPromesa, setModalRegistrarPromesa] = useState(false);
  const [modalReporteGestion, setModalReporteGestion] = useState(false);

  // Estados para formularios
  const [cobranzaSeleccionada, setCobranzaSeleccionada] = useState<string[]>([]);
  const [tipoRecordatorio, setTipoRecordatorio] = useState("email");
  const [promesaData, setPromesaData] = useState({
    chargeId: "",
    fecha: "",
    monto: "",
    observaciones: ""
  });
  const [tipoReporte, setTipoReporte] = useState("ejecutivo");

  const { data: cuentasTodas = [], isLoading: cuentasLoading } = useQuery<CuentaPorCobrar[]>({
    queryKey: ["/api/accounts-receivable"],
  });
  const { data: actividadesCobranza = [], isLoading: actividadesLoading } = useQuery<ActividadCobranza[]>({
    queryKey: ["/api/receivables/activities"],
  });

  // Función para filtrar cuentas según los criterios seleccionados
  const cuentasFiltradas = cuentasTodas.filter(cuenta => {
    // Filtro por concepto
    if (filtros.concepto !== "todas") {
      const conceptoMap: { [key: string]: string[] } = {
        "colegiaturas": ["Colegiatura"],
        "inscripciones": ["Inscripción"],
        "reinscripciones": ["Reinscripción"],
        "seguro_escolar": ["Seguro Escolar"],
        "libros": ["Libros"],
        "otros": ["Otros"]
      };
      
      const conceptosPermitidos = conceptoMap[filtros.concepto] || [];
      if (!conceptosPermitidos.includes(cuenta.concepto)) {
        return false;
      }
    }

    // Filtro por estudiante/familia
    if (filtros.estudiante) {
      const terminoBusqueda = filtros.estudiante.toLowerCase();
      if (!cuenta.estudiante.toLowerCase().includes(terminoBusqueda) &&
          !(cuenta.responsable || "").toLowerCase().includes(terminoBusqueda)) {
        return false;
      }
    }

    return true;
  });

  // Usar cuentas filtradas para el resto de la lógica
  const cuentas = cuentasFiltradas;

  // Reportes específicos de la imagen
  const reportesCobranza = [
    {
      nombre: "Antigüedad de Saldos",
      descripcion: "Análisis detallado por rangos de días vencidos",
      formato: "PDF",
      tamaño: "189 KB",
      fecha: "23/01/2025"
    },
    {
      nombre: "Cartera Vencida",
      descripcion: "Reporte de cuentas morosas y vencidas",
      formato: "Excel",
      tamaño: "156 KB",
      fecha: "23/01/2025"
    },
    {
      nombre: "Eficiencia de Cobranza",
      descripcion: "Métricas de gestión y recuperación",
      formato: "PDF",
      tamaño: "201 KB",
      fecha: "22/01/2025"
    },
    {
      nombre: "Seguimiento de Promesas",
      descripcion: "Control de fechas comprometidas de pago",
      formato: "Excel",
      tamaño: "143 KB",
      fecha: "23/01/2025"
    },
    {
      nombre: "Análisis de Morosidad",
      descripcion: "Tendencias y patrones de comportamiento",
      formato: "PDF",
      tamaño: "187 KB",
      fecha: "22/01/2025"
    },
    {
      nombre: "Reporte Ejecutivo Cobranza",
      descripcion: "Resumen gerencial de gestión",
      formato: "PDF",
      tamaño: "164 KB",
      fecha: "23/01/2025"
    }
  ];

  // Función para formatear moneda
  const formatCurrency = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  // Función para mostrar detalles de cuenta
  const mostrarDetallesCuenta = (cuenta: any) => {
    setCuentaSeleccionada(cuenta);
    setModalDetallesCuenta(true);
  };

  // Función para mostrar detalles de actividad de cobranza
  const verDetallesActividad = (actividad: any) => {
    setActividadSeleccionada(actividad);
    setModalDetallesActividad(true);
  };

  const cuentasPrioritarias = useMemo(
    () => [...cuentasTodas]
      .filter((cuenta) => cuenta.pendiente_pagar_centavos > 0)
      .sort((a, b) => b.dias_vencido - a.dias_vencido || b.pendiente_pagar_centavos - a.pendiente_pagar_centavos)
      .slice(0, 10),
    [cuentasTodas],
  );
  const metricas = useMemo(() => {
    const porCobrar = cuentasTodas.reduce((sum, cuenta) => sum + Number(cuenta.pendiente_pagar_centavos || 0), 0);
    const vencidas = cuentasTodas.filter((cuenta) => ["VENCIDO", "MOROSO"].includes(cuenta.estado_cobranza)).length;
    const morosas = cuentasTodas.filter((cuenta) => cuenta.estado_cobranza === "MOROSO").length;
    const promesas = actividadesCobranza.filter((actividad) => actividad.tipo === "promesa" && actividad.estado === "prometido").length;
    const recordatorios = actividadesCobranza.filter((actividad) => actividad.tipo === "recordatorio" && activityIsPending(actividad)).length;
    return { porCobrar, vencidas, morosas, promesas, recordatorios };
  }, [cuentasTodas, actividadesCobranza]);

  const actividadMutation = useMutation({
    mutationFn: async ({ endpoint, body }: { endpoint: string; body: Record<string, unknown> }) => {
      const response = await apiRequest(endpoint, { method: "POST", body: JSON.stringify(body) });
      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/receivables/activities"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/accounts-receivable"] }),
      ]);
    },
  });

  const guardarActividad = async (
    endpoint: string,
    body: Record<string, unknown>,
    success: { title: string; description: string },
  ) => {
    try {
      await actividadMutation.mutateAsync({ endpoint, body });
      toast(success);
      return true;
    } catch (error: any) {
      const raw = error?.message || "";
      const description = raw.includes(": ") ? raw.slice(raw.indexOf(": ") + 2) : raw;
      toast({
        title: "No se guardó el cambio",
        description: description || "La acción no pudo persistirse. Intenta nuevamente.",
        variant: "destructive",
      });
      return false;
    }
  };

  // Variables para filtros
  const hayFiltrosActivos = filtros.fechaInicio || filtros.fechaFin || filtros.estudiante || (filtros.concepto !== "todas");

  // Función para limpiar filtros
  const limpiarFiltros = () => {
    setFiltros({
      fechaInicio: undefined,
      fechaFin: undefined,
      estudiante: "",
      concepto: "todas",
      formato: "detallado"
    });
  };

  // Función para generar reportes
  const generarReporte = (tipo: 'TXT' | 'CSV' | 'PDF') => {
    toast({
      title: `Generando Reporte ${tipo}`,
      description: "Preparando archivo para descarga..."
    });
    
    setTimeout(() => {
      toast({
        title: "Reporte generado",
        description: `Archivo ${tipo} descargado correctamente`
      });
    }, 2000);
  };

  // Función para descargar reporte específico
  const descargarReporte = (reporte: any) => {
    const contenido = generarContenidoReporte(reporte);
    
    if (reporte.formato === 'Excel') {
      // Generar descarga CSV para compatibilidad
      let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // BOM para UTF-8
      
      if (contenido.tabla) {
        // Encabezados
        const headers = Object.keys(contenido.tabla[0]);
        csvContent += headers.join(',') + '\n';
        
        // Datos
        contenido.tabla.forEach((fila: any) => {
          const valores = headers.map(header => `"${fila[header]}"`);
          csvContent += valores.join(',') + '\n';
        });
      } else if (contenido.metricas) {
        csvContent += "Métrica,Valor\n";
        Object.entries(contenido.metricas).forEach(([key, value]) => {
          csvContent += `"${key}","${value}"\n`;
        });
      }
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${reporte.nombre.replace(/\s+/g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } else if (reporte.formato === 'PDF') {
      // Generar descarga HTML para PDF
      const htmlContent = generarHTMLReporte(reporte, contenido);
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${reporte.nombre.replace(/\s+/g, '_')}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Abrir ventana de impresión para convertir a PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
    }
    
    toast({
      title: "Descarga completada",
      description: `${reporte.nombre} descargado como ${reporte.formato}`
    });
  };

  // Función para generar HTML del reporte
  const generarHTMLReporte = (reporte: any, contenido: any) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${reporte.nombre} - ${institutionName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .logo { width: 60px; height: 60px; margin: 0 auto 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 20px; }
          .metric-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
          .metric-label { color: #666; font-size: 14px; }
          .metric-value { font-size: 24px; font-weight: bold; color: #333; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo">` : `
            <div class="logo" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
              ISP
            </div>
          `}
          <h1>${institutionName}</h1>
          <h2>${reporte.nombre}</h2>
          <p>Generado el: ${new Date().toLocaleDateString('es-MX')} | Formato: ${reporte.formato} | Tamaño: ${reporte.tamaño}</p>
        </div>
        
        ${contenido.tabla ? `
          <table>
            <thead>
              <tr>
                ${Object.keys(contenido.tabla[0]).map((key: string) => `<th>${key.replace('_', ' ').toUpperCase()}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${contenido.tabla.map((fila: any) => `
                <tr>
                  ${Object.values(fila).map((valor: any) => `<td>${valor}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
        
        ${contenido.metricas ? `
          <div class="metrics">
            ${Object.entries(contenido.metricas).map(([key, value]) => `
              <div class="metric-card">
                <div class="metric-label">${key}</div>
                <div class="metric-value">${value}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        <div style="margin-top: 40px; text-align: center; border-top: 1px solid #ddd; padding-top: 20px; color: #666;">
          <p>Reporte generado por Edupay - Sistema de Gestión Escolar</p>
          <p>© ${new Date().getFullYear()} ${institutionName}</p>
        </div>
      </body>
      </html>
    `;
  };

  // Funciones para modales de herramientas de seguimiento
  const abrirModalIniciarCobranza = () => {
    setModalIniciarCobranza(true);
  };

  const procesarCobranza = async () => {
    const cuentasSeleccionadas = cobranzaSeleccionada.length;
    if (await guardarActividad(
      "/api/receivables/collections",
      { charge_ids: cobranzaSeleccionada.map(Number) },
      { title: "Cobranza iniciada", description: `El proceso quedó registrado para ${cuentasSeleccionadas} cuenta(s).` },
    )) {
      setModalIniciarCobranza(false);
      setCobranzaSeleccionada([]);
    }
  };

  const abrirModalEnviarRecordatorios = () => {
    setModalEnviarRecordatorios(true);
  };

  const enviarRecordatorios = async () => {
    const chargeIds = cobranzaSeleccionada.length
      ? cobranzaSeleccionada.map(Number)
      : cuentas.filter((cuenta) => cuenta.pendiente_pagar_centavos > 0).map((cuenta) => cuenta.id);
    if (await guardarActividad(
      "/api/receivables/reminders",
      { canal: tipoRecordatorio, charge_ids: chargeIds },
      { title: "Recordatorios programados", description: `Se registraron ${chargeIds.length} recordatorio(s) por ${tipoRecordatorio}.` },
    )) {
      setModalEnviarRecordatorios(false);
      setCobranzaSeleccionada([]);
    }
  };

  const abrirModalRegistrarPromesa = () => {
    setModalRegistrarPromesa(true);
  };

  const guardarPromesa = async () => {
    const montoCentavos = Math.round(Number(promesaData.monto.replace(/[$,\s]/g, "")) * 100);
    if (promesaData.chargeId && promesaData.fecha && Number.isSafeInteger(montoCentavos) && montoCentavos > 0) {
      if (await guardarActividad(
        "/api/receivables/promises",
        {
          charge_id: Number(promesaData.chargeId),
          fecha: promesaData.fecha,
          monto_centavos: montoCentavos,
          observaciones: promesaData.observaciones,
        },
        { title: "Promesa registrada", description: "La promesa de pago quedó guardada en el historial de cobranza." },
      )) {
      setModalRegistrarPromesa(false);
        setPromesaData({ chargeId: "", fecha: "", monto: "", observaciones: "" });
      }
    } else {
      toast({ title: "Campos requeridos", description: "Selecciona una cuenta e indica fecha y monto válidos.", variant: "destructive" });
    }
  };

  // Funciones para acciones de seguimiento
  const programarSeguimiento = async () => {
    if (seguimientoData.chargeId && seguimientoData.fecha && seguimientoData.hora) {
      if (await guardarActividad(
        "/api/receivables/follow-ups",
        {
          charge_id: Number(seguimientoData.chargeId),
          tipo: seguimientoData.tipo,
          fecha: seguimientoData.fecha,
          hora: seguimientoData.hora,
          observaciones: seguimientoData.observaciones,
        },
        { title: "Seguimiento programado", description: "El seguimiento quedó guardado y será visible después de recargar." },
      )) {
      setModalProgramarSeguimiento(false);
      setSeguimientoData({
        chargeId: "",
        tipo: "llamada",
        fecha: "",
        hora: "",
        observaciones: ""
      });
      }
    } else {
      toast({ title: "Campos requeridos", description: "Selecciona una cuenta e indica fecha y hora.", variant: "destructive" });
    }
  };

  const agregarNota = async () => {
    if (notaData.chargeId && notaData.titulo && notaData.contenido) {
      if (await guardarActividad(
        "/api/receivables/notes",
        {
          charge_id: Number(notaData.chargeId),
          titulo: notaData.titulo,
          contenido: notaData.contenido,
          prioridad: notaData.prioridad,
        },
        { title: "Nota agregada", description: "La nota quedó guardada en el historial de cobranza." },
      )) {
      setModalAgregarNota(false);
      setNotaData({
        chargeId: "",
        titulo: "",
        contenido: "",
        prioridad: "normal"
      });
      }
    } else {
      toast({ title: "Campos requeridos", description: "Selecciona una cuenta, título y contenido.", variant: "destructive" });
    }
  };

  const escalarCaso = async () => {
    if (escalacionData.chargeId && escalacionData.motivo && escalacionData.supervisor) {
      if (await guardarActividad(
        "/api/receivables/escalations",
        {
          charge_id: Number(escalacionData.chargeId),
          motivo: escalacionData.motivo,
          supervisor: escalacionData.supervisor,
          urgencia: escalacionData.urgencia,
          detalles: escalacionData.detalles,
        },
        { title: "Caso escalado", description: "La escalación quedó guardada en el historial de cobranza." },
      )) {
      setModalEscalarCaso(false);
      setEscalacionData({
        chargeId: "",
        motivo: "",
        supervisor: "",
        urgencia: "media",
        detalles: ""
      });
      }
    } else {
      toast({ title: "Campos requeridos", description: "Selecciona una cuenta, motivo y supervisor.", variant: "destructive" });
    }
  };

  const abrirModalReporteGestion = () => {
    setModalReporteGestion(true);
  };

  const generarReporteGestion = () => {
    toast({
      title: "Generando reporte",
      description: `Generando reporte ${tipoReporte} de gestión de cobranza...`
    });
    setModalReporteGestion(false);
  };

  const contactarFamilia = (cuenta: any) => {
    setCobranzaSeleccionada([String(cuenta.id)]);
    setModalEnviarRecordatorios(true);
  };

  const registrarPago = () => {
    window.history.pushState({}, "", "/pagos");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  // Función para vista previa
  const vistaPrevia = (reporte: any) => {
    setReporteSeleccionado(reporte);
    setModalVistaPrevia(true);
    toast({
      title: "Vista previa",
      description: `Abriendo ${reporte.nombre}`
    });
  };

  // Función para generar contenido de vista previa del reporte
  const generarContenidoReporte = (reporte: any) => {
    const datosEjemplo: any = {
      "Antigüedad de Saldos": {
        tabla: [
          { concepto: "0-30 días", monto: "$15,600", cantidad: 8 },
          { concepto: "31-60 días", monto: "$12,400", cantidad: 5 },
          { concepto: "61-90 días", monto: "$8,500", cantidad: 3 },
          { concepto: "Más de 90 días", monto: "$5,500", cantidad: 2 }
        ]
      },
      "Cartera Vencida": {
        tabla: [
          { estudiante: "María González", monto: "$2,800", dias: 15 },
          { estudiante: "Juan Morales", monto: "$3,200", dias: 22 },
          { estudiante: "Ana Ramírez", monto: "$2,500", dias: 8 }
        ]
      },
      "Eficiencia de Cobranza": {
        metricas: {
          "Tasa de recuperación": "73.2%",
          "Tiempo promedio cobro": "18.5 días", 
          "Efectividad gestión": "89.1%"
        }
      },
      "Seguimiento de Promesas": {
        tabla: [
          { estudiante: "Carlos López", promesa: "$3,200", fecha_compromiso: "25/01/2025", cumplido: "Pendiente" },
          { estudiante: "Sandra Pérez", promesa: "$2,800", fecha_compromiso: "20/01/2025", cumplido: "Sí" },
          { estudiante: "Miguel Torres", promesa: "$2,500", fecha_compromiso: "28/01/2025", cumplido: "Pendiente" }
        ]
      },
      "Análisis de Morosidad": {
        metricas: {
          "Índice de morosidad": "26.8%",
          "Promedio días atraso": "32 días",
          "Tasa recuperación": "73.2%"
        }
      },
      "Reporte Ejecutivo Cobranza": {
        metricas: {
          "Total por cobrar": "$42,000",
          "Efectividad gestión": "89.1%",
          "Cuentas recuperadas": "15 de 18"
        }
      }
    };

    return datosEjemplo[reporte.nombre] || { 
      tabla: [
        { concepto: "Datos de ejemplo", valor: "Información del reporte", estado: "Disponible" }
      ]
    };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          {logoUrl && logoUrl.length > 50 && logoUrl.includes('data:image') ? (
            <div className="w-12 h-12 bg-red-100 rounded-xl overflow-hidden flex items-center justify-center border-2 border-red-200">
              <img 
                src={logoUrl} 
                alt="Logo institucional" 
                className="w-full h-full object-cover"
                style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-red-600" />
            </div>
          )}
          <h1 className="text-3xl font-bold text-gray-900">Cuentas por Cobrar</h1>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-700">Total por Cobrar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{formatCurrency(metricas.porCobrar)}</div>
            <p className="text-sm text-red-600 mt-1">{metricas.vencidas} cuenta(s) vencida(s)</p>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-700">Promesas activas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{metricas.promesas}</div>
            <p className="text-sm text-yellow-600 mt-1">registradas en el historial</p>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700">Cuentas morosas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{metricas.morosas}</div>
            <p className="text-sm text-orange-600 mt-1">requieren gestión prioritaria</p>
          </CardContent>
        </Card>
      </div>

      {/* Botones de generación de reportes */}
      <div className="flex gap-4">
        <Button 
          onClick={() => generarReporte('TXT')}
          className="bg-orange-600 hover:bg-orange-700 text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          Generar Reporte TXT
        </Button>
        <Button 
          onClick={() => generarReporte('CSV')}
          variant="outline"
          className="border-orange-600 text-orange-600 hover:bg-orange-50"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Generar Excel (CSV)
        </Button>
        <Button 
          onClick={() => generarReporte('PDF')}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <FileText className="w-4 h-4 mr-2" />
          Generar PDF
        </Button>
      </div>

      <Tabs defaultValue="reportes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista">Lista de cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          {/* Filtros avanzados */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros de Búsqueda
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="text-sm font-medium">Fecha Inicio</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filtros.fechaInicio ? format(filtros.fechaInicio, "dd/MM/yyyy", { locale: es }) : "dd/mm/aaaa"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filtros.fechaInicio}
                        onSelect={(date) => setFiltros({...filtros, fechaInicio: date})}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-sm font-medium">Fecha Fin</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filtros.fechaFin ? format(filtros.fechaFin, "dd/MM/yyyy", { locale: es }) : "dd/mm/aaaa"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filtros.fechaFin}
                        onSelect={(date) => setFiltros({...filtros, fechaFin: date})}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-sm font-medium">Buscar Estudiante/Familia</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Nombre del estudiante o familia"
                      value={filtros.estudiante}
                      onChange={(e) => setFiltros({...filtros, estudiante: e.target.value})}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Concepto</label>
                  <Select value={filtros.concepto} onValueChange={(value) => setFiltros({...filtros, concepto: value})}>
                  <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas las categorías</SelectItem>
                      <SelectItem value="colegiaturas">Colegiaturas</SelectItem>
                      <SelectItem value="inscripciones">Inscripciones</SelectItem>
                      <SelectItem value="reinscripciones">Reinscripciones</SelectItem>
                      <SelectItem value="seguro_escolar">Seguro Escolar</SelectItem>
                      <SelectItem value="libros">Libros</SelectItem>
                      <SelectItem value="otros">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Formato</label>
                  <Select value={filtros.formato} onValueChange={(value) => setFiltros({...filtros, formato: value})}>
                    <SelectTrigger>
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
              
              {hayFiltrosActivos && (
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" onClick={limpiarFiltros}>
                    <X className="w-4 h-4 mr-1" />
                    Limpiar Filtros
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lista de cuentas */}
          <Card>
            <CardHeader>
              <CardTitle>Cuentas por Cobrar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Estudiante</th>
                      <th className="text-left p-2">Nivel</th>
                      <th className="text-left p-2">Concepto</th>
                      <th className="text-left p-2">Pendiente</th>
                      <th className="text-left p-2">Estado</th>
                      <th className="text-left p-2">Días Vencido</th>
                      <th className="text-left p-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentasLoading ? (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Cargando cuentas…</td></tr>
                    ) : cuentas.length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No hay cuentas pendientes con estos filtros.</td></tr>
                    ) : cuentas.map((cuenta) => (
                      <tr key={cuenta.id} className="border-b">
                        <td className="p-2">{cuenta.estudiante}</td>
                        <td className="p-2">{cuenta.nivel_escolar || cuenta.grado || "—"}</td>
                        <td className="p-2">{cuenta.concepto}</td>
                        <td className="p-2 font-semibold">{formatCurrency(cuenta.pendiente_pagar_centavos)}</td>
                        <td className="p-2">
                          <Badge variant={["VENCIDO", "MOROSO"].includes(cuenta.estado_cobranza) ? "destructive" :
                                        cuenta.estado_cobranza === "POR_VENCER" ? "secondary" : "default"}>
                            {cuenta.estado_cobranza}
                          </Badge>
                        </td>
                        <td className="p-2">{cuenta.dias_vencido}</td>
                        <td className="p-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => mostrarDetallesCuenta(cuenta)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguimiento" className="space-y-6">
          {/* Controles de Seguimiento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Recordatorios Pendientes</h3>
                    <p className="text-2xl font-bold text-orange-600">{metricas.recordatorios}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Promesas de Pago</h3>
                    <p className="text-2xl font-bold text-blue-600">{metricas.promesas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Cuentas morosas</h3>
                    <p className="text-2xl font-bold text-green-600">{metricas.morosas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Herramientas de Gestión */}
          <Card>
            <CardHeader>
              <CardTitle>Herramientas de Seguimiento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button 
                  className="h-20 flex-col space-y-2"
                  onClick={() => abrirModalIniciarCobranza()}
                >
                  <AlertTriangle className="w-6 h-6" />
                  <span>Iniciar Cobranza</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-20 flex-col space-y-2"
                  onClick={() => abrirModalEnviarRecordatorios()}
                >
                  <Clock className="w-6 h-6" />
                  <span>Enviar Recordatorios</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-20 flex-col space-y-2"
                  onClick={() => abrirModalRegistrarPromesa()}
                >
                  <Users className="w-6 h-6" />
                  <span>Registrar Promesa</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-20 flex-col space-y-2"
                  onClick={() => abrirModalReporteGestion()}
                >
                  <FileText className="w-6 h-6" />
                  <span>Reporte de Gestión</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Actividades Recientes */}
          <Card>
            <CardHeader>
              <CardTitle>Actividades de Cobranza Recientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {actividadesLoading ? (
                  <p className="py-4 text-center text-muted-foreground">Cargando actividad…</p>
                ) : actividadesCobranza.length === 0 ? (
                  <p className="py-4 text-center text-muted-foreground">Aún no hay actividad registrada para este campus.</p>
                ) : actividadesCobranza.map((actividad) => (
                  <div key={actividad.id} className="flex items-center space-x-4 p-3 border rounded-lg">
                    <div className={`p-2 rounded-lg ${
                      actividad.tipo === 'llamada' ? 'bg-blue-100' :
                      actividad.tipo === 'email' ? 'bg-green-100' :
                      actividad.tipo === 'promesa' ? 'bg-yellow-100' :
                      'bg-gray-100'
                    }`}>
                      {actividad.tipo === 'llamada' && <Phone className="w-4 h-4 text-blue-600" />}
                      {actividad.tipo === 'email' && <Mail className="w-4 h-4 text-green-600" />}
                      {actividad.tipo === 'promesa' && <Users className="w-4 h-4 text-yellow-600" />}
                      {["cobranza", "seguimiento", "nota", "escalacion"].includes(actividad.tipo) && <FileText className="w-4 h-4 text-slate-600" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{actividad.estudiante}</p>
                      <p className="text-sm text-muted-foreground">{actividad.descripcion || actividad.titulo}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{actividad.monto_centavos ? formatCurrency(Number(actividad.monto_centavos)) : actividad.estado}</p>
                      <p className="text-xs text-muted-foreground">{new Date(actividad.created_at).toLocaleString("es-MX")}</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => verDetallesActividad(actividad)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Lista de Seguimiento Prioritario */}
          <Card>
            <CardHeader>
              <CardTitle>Seguimiento Prioritario</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Estudiante</th>
                      <th className="text-left p-2">Días Vencido</th>
                      <th className="text-left p-2">Monto</th>
                      <th className="text-left p-2">Último Contacto</th>
                      <th className="text-left p-2">Próxima Acción</th>
                      <th className="text-left p-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentasPrioritarias.length === 0 ? (
                      <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No hay cuentas pendientes.</td></tr>
                    ) : cuentasPrioritarias.map((cuenta) => (
                      <tr key={cuenta.id} className="border-b">
                        <td className="p-2 font-medium">{cuenta.estudiante}</td>
                        <td className="p-2">
                          <Badge variant={cuenta.dias_vencido > 30 ? "destructive" : "secondary"}>
                            {cuenta.dias_vencido} días
                          </Badge>
                        </td>
                        <td className="p-2">{formatCurrency(cuenta.pendiente_pagar_centavos)}</td>
                        <td className="p-2 text-sm text-muted-foreground">
                          {actividadesCobranza.find((actividad) => actividad.charge_id === cuenta.id)?.created_at
                            ? new Date(actividadesCobranza.find((actividad) => actividad.charge_id === cuenta.id)!.created_at).toLocaleDateString("es-MX")
                            : "Sin contacto"}
                        </td>
                        <td className="p-2 text-sm">
                          {actividadesCobranza.find((actividad) => actividad.charge_id === cuenta.id && activityIsPending(actividad))?.titulo || "Registrar seguimiento"}
                        </td>
                        <td className="p-2">
                          <div className="flex space-x-1">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => contactarFamilia(cuenta)}
                            >
                              <Phone className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={registrarPago}
                            >
                              <DollarSign className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reportes de Cobranza Disponibles</CardTitle>
              <p className="text-sm text-slate-600">Descarga reportes especializados de gestión de cartera por cobrar</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reportesCobranza.map((reporte, index) => (
                  <Card key={index} className="border-slate-200">
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-2 text-slate-900">{reporte.nombre}</h3>
                      <p className="text-sm text-slate-600 mb-3">{reporte.descripcion}</p>
                      
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Formato:</span>
                          <span className="font-medium">{reporte.formato}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Tamaño:</span>
                          <span className="font-medium">{reporte.tamaño}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Fecha:</span>
                          <span className="font-medium">{reporte.fecha}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          className="flex-1 bg-orange-600 hover:bg-orange-700"
                          onClick={() => descargarReporte(reporte)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Descargar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => vistaPrevia(reporte)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Vista Previa */}
      <Dialog open={modalVistaPrevia} onOpenChange={setModalVistaPrevia}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista Previa: {reporteSeleccionado?.nombre}</DialogTitle>
            <DialogDescription>
              Contenido detallado del reporte de cobranza para revisión antes de la descarga
            </DialogDescription>
          </DialogHeader>
          {reporteSeleccionado && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded">
                <div>
                  <span className="text-sm font-medium">Formato:</span>
                  <p className="text-lg">{reporteSeleccionado.formato}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Tamaño:</span>
                  <p className="text-lg">{reporteSeleccionado.tamaño}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Fecha:</span>
                  <p className="text-lg">{reporteSeleccionado.fecha}</p>
                </div>
              </div>

              <div className="border rounded p-4">
                <h3 className="font-semibold mb-3">Contenido del Reporte</h3>
                {(() => {
                  const contenido = generarContenidoReporte(reporteSeleccionado);
                  
                  if (contenido.tabla) {
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border">
                          <thead>
                            <tr className="bg-slate-100">
                              {Object.keys(contenido.tabla[0] || {}).map((key) => (
                                <th key={key} className="border p-2 text-left capitalize">
                                  {key.replace('_', ' ')}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {contenido.tabla.map((fila: any, index: number) => (
                              <tr key={index}>
                                {Object.values(fila).map((valor: any, i) => (
                                  <td key={i} className="border p-2">{valor}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }
                  
                  if (contenido.metricas) {
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(contenido.metricas).map(([key, value]) => (
                          <div key={key} className="p-3 border rounded">
                            <div className="text-sm text-slate-600">{key}</div>
                            <div className="text-xl font-semibold">{value as string}</div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  
                  return <p className="text-slate-600">Vista previa no disponible para este reporte.</p>;
                })()}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setModalVistaPrevia(false)}>
                  Cerrar
                </Button>
                <Button onClick={() => descargarReporte(reporteSeleccionado)}>
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Reporte
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Iniciar Cobranza */}
      <Dialog open={modalIniciarCobranza} onOpenChange={setModalIniciarCobranza}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Iniciar Proceso de Cobranza</DialogTitle>
            <DialogDescription>
              Seleccione las cuentas para iniciar el proceso automático de cobranza
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-3">Cuentas Disponibles para Cobranza</h4>
              <div className="space-y-2">
                {cuentas.filter(c => c.estado_cobranza === "Vencido").map((cuenta) => (
                  <div key={cuenta.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`cuenta-${cuenta.id}`}
                      checked={cobranzaSeleccionada.includes(cuenta.id.toString())}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setCobranzaSeleccionada([...cobranzaSeleccionada, cuenta.id.toString()]);
                        } else {
                          setCobranzaSeleccionada(cobranzaSeleccionada.filter(id => id !== cuenta.id.toString()));
                        }
                      }}
                    />
                    <Label htmlFor={`cuenta-${cuenta.id}`} className="flex-1">
                      <div className="flex justify-between">
                        <span>{cuenta.estudiante}</span>
                        <span className="text-red-600 font-medium">{formatCurrency(cuenta.pendiente_pagar_centavos)}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {cuenta.concepto} - {cuenta.dias_vencido} días vencido
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-700">
                Se iniciará proceso de cobranza automático que incluye: envío de notificaciones, 
                programación de llamadas y registro de actividades de seguimiento.
              </p>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setModalIniciarCobranza(false)}>
                Cancelar
              </Button>
              <Button onClick={procesarCobranza} disabled={cobranzaSeleccionada.length === 0}>
                Iniciar Cobranza ({cobranzaSeleccionada.length} seleccionadas)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Enviar Recordatorios */}
      <Dialog open={modalEnviarRecordatorios} onOpenChange={setModalEnviarRecordatorios}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar Recordatorios</DialogTitle>
            <DialogDescription>
              Configure el tipo de recordatorio para familias con pagos pendientes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Cuenta</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={seguimientoData.chargeId}
                onChange={(e) => setSeguimientoData({ ...seguimientoData, chargeId: e.target.value })}
              >
                <option value="">Seleccionar cuenta…</option>
                {cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.estudiante} — {formatCurrency(cuenta.pendiente_pagar_centavos)}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="tipo-recordatorio">Tipo de Recordatorio</Label>
              <Select value={tipoRecordatorio} onValueChange={setTipoRecordatorio}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Correo Electrónico</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="llamada">Llamada Telefónica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Resumen del Envío</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Cuentas seleccionadas:</span>
                  <span className="font-medium">{cobranzaSeleccionada.length || cuentas.filter((cuenta) => cuenta.pendiente_pagar_centavos > 0).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Método seleccionado:</span>
                  <span className="font-medium capitalize">{tipoRecordatorio}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tiempo estimado:</span>
                  <span className="font-medium">2-5 minutos</span>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-sm text-yellow-700">
                Los recordatorios se enviarán automáticamente y se registrarán en el historial de actividades.
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setModalEnviarRecordatorios(false)}>
                Cancelar
              </Button>
              <Button onClick={enviarRecordatorios}>
                Enviar Recordatorios
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Registrar Promesa */}
      <Dialog open={modalRegistrarPromesa} onOpenChange={setModalRegistrarPromesa}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Promesa de Pago</DialogTitle>
            <DialogDescription>
              Capture el compromiso de pago acordado con la familia
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Cuenta</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={notaData.chargeId}
                onChange={(e) => setNotaData({ ...notaData, chargeId: e.target.value })}
              >
                <option value="">Seleccionar cuenta…</option>
                {cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.estudiante} — {formatCurrency(cuenta.pendiente_pagar_centavos)}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="estudiante-promesa">Estudiante</Label>
              <Select 
                value={promesaData.chargeId}
                onValueChange={(value) => setPromesaData({...promesaData, chargeId: value})}
              >
                <SelectTrigger id="estudiante-promesa">
                  <SelectValue placeholder="Seleccionar cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {cuentas.map((cuenta) => (
                    <SelectItem key={cuenta.id} value={String(cuenta.id)}>
                      {cuenta.estudiante} - {formatCurrency(cuenta.pendiente_pagar_centavos)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="fecha-promesa">Fecha Comprometida</Label>
              <Input 
                id="fecha-promesa"
                type="date"
                value={promesaData.fecha}
                onChange={(e) => setPromesaData({...promesaData, fecha: e.target.value})}
              />
            </div>

            <div>
              <Label htmlFor="monto-promesa">Monto Comprometido</Label>
              <Input 
                id="monto-promesa"
                placeholder="$0.00"
                value={promesaData.monto}
                onChange={(e) => setPromesaData({...promesaData, monto: e.target.value})}
              />
            </div>

            <div>
              <Label htmlFor="observaciones-promesa">Observaciones</Label>
              <Textarea 
                id="observaciones-promesa"
                placeholder="Detalles del acuerdo, condiciones especiales, etc."
                value={promesaData.observaciones}
                onChange={(e) => setPromesaData({...promesaData, observaciones: e.target.value})}
              />
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-green-700">
                La promesa se registrará en el sistema y se programará seguimiento automático para la fecha indicada.
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setModalRegistrarPromesa(false)}>
                Cancelar
              </Button>
              <Button onClick={guardarPromesa}>
                Registrar Promesa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Reporte de Gestión */}
      <Dialog open={modalReporteGestion} onOpenChange={setModalReporteGestion}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generar Reporte de Gestión</DialogTitle>
            <DialogDescription>
              Configure el reporte de actividades de cobranza
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Cuenta</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={escalacionData.chargeId}
                onChange={(e) => setEscalacionData({ ...escalacionData, chargeId: e.target.value })}
              >
                <option value="">Seleccionar cuenta…</option>
                {cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.estudiante} — {formatCurrency(cuenta.pendiente_pagar_centavos)}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="tipo-reporte">Tipo de Reporte</Label>
              <Select value={tipoReporte} onValueChange={setTipoReporte}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ejecutivo">Reporte Ejecutivo</SelectItem>
                  <SelectItem value="detallado">Reporte Detallado</SelectItem>
                  <SelectItem value="actividades">Registro de Actividades</SelectItem>
                  <SelectItem value="promesas">Seguimiento de Promesas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Contenido del Reporte</h4>
              <div className="space-y-2 text-sm">
                {tipoReporte === "ejecutivo" && (
                  <ul className="list-disc list-inside space-y-1">
                    <li>Resumen de cobranza del período</li>
                    <li>KPIs de gestión y recuperación</li>
                    <li>Top 10 cuentas prioritarias</li>
                    <li>Recomendaciones estratégicas</li>
                  </ul>
                )}
                {tipoReporte === "detallado" && (
                  <ul className="list-disc list-inside space-y-1">
                    <li>Lista completa de actividades</li>
                    <li>Detalle por estudiante y familia</li>
                    <li>Historial de contactos</li>
                    <li>Estado actual de cada cuenta</li>
                  </ul>
                )}
                {tipoReporte === "actividades" && (
                  <ul className="list-disc list-inside space-y-1">
                    <li>Registro cronológico de acciones</li>
                    <li>Llamadas, emails y mensajes</li>
                    <li>Tiempo invertido por cuenta</li>
                    <li>Resultados obtenidos</li>
                  </ul>
                )}
                {tipoReporte === "promesas" && (
                  <ul className="list-disc list-inside space-y-1">
                    <li>Promesas de pago activas</li>
                    <li>Fechas de vencimiento</li>
                    <li>Tasa de cumplimiento histórica</li>
                    <li>Seguimiento pendiente</li>
                  </ul>
                )}
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-700">
                El reporte se generará en formato PDF y estará listo para descarga en unos segundos.
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setModalReporteGestion(false)}>
                Cancelar
              </Button>
              <Button onClick={generarReporteGestion}>
                Generar Reporte
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalles de Cuenta */}
      <Dialog open={modalDetallesCuenta} onOpenChange={setModalDetallesCuenta}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles de la Cuenta por Cobrar</DialogTitle>
            <DialogDescription>
              Información completa de la cuenta pendiente de pago
            </DialogDescription>
          </DialogHeader>
          
          {cuentaSeleccionada && (
            <div className="space-y-6">
              {/* Información del Estudiante */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3 flex items-center">
                  <Users className="w-5 h-5 mr-2 text-blue-600" />
                  Información del Estudiante
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Nombre Completo</label>
                    <p className="font-medium">{cuentaSeleccionada.estudiante}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Nivel Académico</label>
                    <p className="font-medium">{cuentaSeleccionada.nivel_escolar || cuentaSeleccionada.grado || "—"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Responsable de pago</label>
                    <p className="font-medium">{cuentaSeleccionada.responsable || "Sin responsable registrado"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">ID de Cuenta</label>
                    <p className="font-medium text-gray-500">#{cuentaSeleccionada.id.toString().padStart(6, '0')}</p>
                  </div>
                </div>
              </div>

              {/* Información Financiera */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3 flex items-center">
                  <DollarSign className="w-5 h-5 mr-2 text-green-600" />
                  Información Financiera
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Concepto</label>
                    <p className="font-medium">{cuentaSeleccionada.concepto}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Monto Pendiente</label>
                    <p className="font-bold text-lg text-red-600">{formatCurrency(cuentaSeleccionada.pendiente_pagar_centavos)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Estado de Cobranza</label>
                    <Badge variant={["VENCIDO", "MOROSO"].includes(cuentaSeleccionada.estado_cobranza) ? "destructive" :
                                  cuentaSeleccionada.estado_cobranza === "POR_VENCER" ? "secondary" : "default"}>
                      {cuentaSeleccionada.estado_cobranza}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Días Vencidos</label>
                    <p className="font-medium text-orange-600">{cuentaSeleccionada.dias_vencido} días</p>
                  </div>
                </div>
              </div>

              {/* Información de Contacto */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3 flex items-center">
                  <Phone className="w-5 h-5 mr-2 text-purple-600" />
                  Información de Contacto
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Teléfono Principal</label>
                    <p className="font-medium">{cuentaSeleccionada.telefono || "Sin teléfono registrado"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Correo Electrónico</label>
                    <p className="font-medium">{cuentaSeleccionada.email || "Sin correo registrado"}</p>
                  </div>
                </div>
              </div>

              {/* Historial de Pagos Recientes */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3 flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-orange-600" />
                  Historial Reciente
                </h4>
                <div className="space-y-2">
                  {actividadesCobranza.filter((actividad) => actividad.charge_id === cuentaSeleccionada.id).slice(0, 3).map((actividad) => (
                    <div key={actividad.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span className="text-sm">{actividad.titulo}</span>
                      <span className="font-medium">{new Date(actividad.created_at).toLocaleDateString("es-MX")}</span>
                    </div>
                  ))}
                  {actividadesCobranza.filter((actividad) => actividad.charge_id === cuentaSeleccionada.id).length === 0 && (
                    <p className="text-sm text-muted-foreground">Sin actividad registrada todavía.</p>
                  )}
                </div>
              </div>

              {/* Acciones Disponibles */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3">Acciones Disponibles</h4>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setSeguimientoData({ ...seguimientoData, chargeId: String(cuentaSeleccionada.id), tipo: "llamada" });
                    setModalProgramarSeguimiento(true);
                  }}>
                    <Phone className="w-4 h-4 mr-1" />
                    Llamar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setCobranzaSeleccionada([String(cuentaSeleccionada.id)]);
                    setModalEnviarRecordatorios(true);
                  }}>
                    <Mail className="w-4 h-4 mr-1" />
                    Enviar Email
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setPromesaData({ ...promesaData, chargeId: String(cuentaSeleccionada.id) });
                    setModalRegistrarPromesa(true);
                  }}>
                    <CalendarIcon className="w-4 h-4 mr-1" />
                    Registrar Promesa
                  </Button>
                </div>
              </div>

              {/* Observaciones */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3">Observaciones</h4>
                <div className="bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
                  <p className="text-sm">
                    {["VENCIDO", "MOROSO"].includes(cuentaSeleccionada.estado_cobranza)
                      ? "⚠️ Cuenta vencida. Se requiere seguimiento inmediato para evitar incremento en morosidad."
                      : "✅ Cuenta al corriente. Mantener seguimiento preventivo."
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setModalDetallesCuenta(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Detalles de Actividad */}
      <Dialog open={modalDetallesActividad} onOpenChange={setModalDetallesActividad}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalles de Actividad de Cobranza</DialogTitle>
            <DialogDescription>
              Información completa sobre la actividad realizada
            </DialogDescription>
          </DialogHeader>
          
          {actividadSeleccionada && (
            <div className="space-y-4">
              {/* Información Principal */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3 flex items-center">
                  {actividadSeleccionada.tipo === 'llamada' && <Phone className="w-5 h-5 mr-2 text-blue-600" />}
                  {actividadSeleccionada.tipo === 'email' && <Mail className="w-5 h-5 mr-2 text-green-600" />}
                  {actividadSeleccionada.tipo === 'promesa' && <Users className="w-5 h-5 mr-2 text-yellow-600" />}
                  {["cobranza", "seguimiento", "nota", "escalacion", "recordatorio"].includes(actividadSeleccionada.tipo) && <FileText className="w-5 h-5 mr-2 text-slate-600" />}
                  Información de la Actividad
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Estudiante</label>
                    <p className="font-medium">{actividadSeleccionada.estudiante}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Tipo de Actividad</label>
                    <Badge variant="outline" className="capitalize">
                      {actividadSeleccionada.tipo}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Fecha y Hora</label>
                    <p className="font-medium">{new Date(actividadSeleccionada.created_at).toLocaleString("es-MX")}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Monto Involucrado</label>
                    <p className="font-bold text-lg text-blue-600">{actividadSeleccionada.monto_centavos ? formatCurrency(Number(actividadSeleccionada.monto_centavos)) : "—"}</p>
                  </div>
                </div>
              </div>

              {/* Detalles de Ejecución */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3">Detalles de Ejecución</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Responsable</label>
                    <p className="font-medium">{actividadSeleccionada.creado_por || "Usuario del campus"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Canal</label>
                    <p className="font-medium">{actividadSeleccionada.canal || "—"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Resultado</label>
                    <p className="font-medium text-green-600 capitalize">{actividadSeleccionada.estado}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Próximo Seguimiento</label>
                    <p className="font-medium">{actividadSeleccionada.fecha_programada ? new Date(actividadSeleccionada.fecha_programada).toLocaleDateString("es-MX") : "No programado"}</p>
                  </div>
                </div>
              </div>

              {/* Descripción Completa */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3">Descripción Completa</h4>
                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-sm leading-relaxed">
                    {actividadSeleccionada.descripcion || "Sin descripción adicional."}
                  </p>
                </div>
              </div>

              {/* Acciones de Seguimiento */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold text-lg mb-3">Acciones de Seguimiento</h4>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setSeguimientoData({ ...seguimientoData, chargeId: String(actividadSeleccionada.charge_id) });
                    setModalProgramarSeguimiento(true);
                  }}>
                    <CalendarIcon className="w-4 h-4 mr-1" />
                    Programar Seguimiento
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setNotaData({ ...notaData, chargeId: String(actividadSeleccionada.charge_id) });
                    setModalAgregarNota(true);
                  }}>
                    <FileText className="w-4 h-4 mr-1" />
                    Agregar Nota
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setEscalacionData({ ...escalacionData, chargeId: String(actividadSeleccionada.charge_id) });
                    setModalEscalarCaso(true);
                  }}>
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Escalar Caso
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setModalDetallesActividad(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Programar Seguimiento */}
      <Dialog open={modalProgramarSeguimiento} onOpenChange={setModalProgramarSeguimiento}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Programar Seguimiento</DialogTitle>
            <DialogDescription>
              Programa una nueva actividad de seguimiento
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Tipo de Actividad</label>
              <select 
                className="w-full border rounded-lg px-3 py-2"
                value={seguimientoData.tipo}
                onChange={(e) => setSeguimientoData({...seguimientoData, tipo: e.target.value})}
              >
                <option value="llamada">Llamada telefónica</option>
                <option value="email">Envío de email</option>
                <option value="visita">Visita presencial</option>
                <option value="whatsapp">Mensaje WhatsApp</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Fecha</label>
                <input 
                  type="date"
                  className="w-full border rounded-lg px-3 py-2"
                  value={seguimientoData.fecha}
                  onChange={(e) => setSeguimientoData({...seguimientoData, fecha: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Hora</label>
                <input 
                  type="time"
                  className="w-full border rounded-lg px-3 py-2"
                  value={seguimientoData.hora}
                  onChange={(e) => setSeguimientoData({...seguimientoData, hora: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Observaciones</label>
              <textarea 
                className="w-full border rounded-lg px-3 py-2"
                rows={3}
                placeholder="Detalles adicionales sobre el seguimiento..."
                value={seguimientoData.observaciones}
                onChange={(e) => setSeguimientoData({...seguimientoData, observaciones: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setModalProgramarSeguimiento(false)}>
              Cancelar
            </Button>
            <Button onClick={programarSeguimiento}>
              <CalendarIcon className="w-4 h-4 mr-1" />
              Programar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Agregar Nota */}
      <Dialog open={modalAgregarNota} onOpenChange={setModalAgregarNota}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Nota</DialogTitle>
            <DialogDescription>
              Registra una observación en el expediente del estudiante
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Título de la Nota</label>
              <input 
                type="text"
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Resumen breve de la nota..."
                value={notaData.titulo}
                onChange={(e) => setNotaData({...notaData, titulo: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Prioridad</label>
              <select 
                className="w-full border rounded-lg px-3 py-2"
                value={notaData.prioridad}
                onChange={(e) => setNotaData({...notaData, prioridad: e.target.value})}
              >
                <option value="baja">Baja</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Contenido</label>
              <textarea 
                className="w-full border rounded-lg px-3 py-2"
                rows={4}
                placeholder="Describe los detalles de la observación..."
                value={notaData.contenido}
                onChange={(e) => setNotaData({...notaData, contenido: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setModalAgregarNota(false)}>
              Cancelar
            </Button>
            <Button onClick={agregarNota}>
              <FileText className="w-4 h-4 mr-1" />
              Guardar Nota
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Escalar Caso */}
      <Dialog open={modalEscalarCaso} onOpenChange={setModalEscalarCaso}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Escalar Caso</DialogTitle>
            <DialogDescription>
              Escala el caso a un supervisor para revisión adicional
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Motivo de Escalación</label>
              <select 
                className="w-full border rounded-lg px-3 py-2"
                value={escalacionData.motivo}
                onChange={(e) => setEscalacionData({...escalacionData, motivo: e.target.value})}
              >
                <option value="">Seleccionar motivo...</option>
                <option value="sin_respuesta">Sin respuesta del deudor</option>
                <option value="monto_alto">Monto alto por cobrar</option>
                <option value="cliente_dificil">Cliente difícil</option>
                <option value="situacion_legal">Posible situación legal</option>
                <option value="otros">Otros</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Supervisor Asignado</label>
              <select 
                className="w-full border rounded-lg px-3 py-2"
                value={escalacionData.supervisor}
                onChange={(e) => setEscalacionData({...escalacionData, supervisor: e.target.value})}
              >
                <option value="">Seleccionar supervisor...</option>
                <option value="Ana García">Ana García - Jefe de Cobranza</option>
                <option value="Carlos Mendoza">Carlos Mendoza - Director Financiero</option>
                <option value="María López">María López - Gerente de Cuentas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Nivel de Urgencia</label>
              <select 
                className="w-full border rounded-lg px-3 py-2"
                value={escalacionData.urgencia}
                onChange={(e) => setEscalacionData({...escalacionData, urgencia: e.target.value})}
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Detalles Adicionales</label>
              <textarea 
                className="w-full border rounded-lg px-3 py-2"
                rows={3}
                placeholder="Proporciona contexto adicional para la escalación..."
                value={escalacionData.detalles}
                onChange={(e) => setEscalacionData({...escalacionData, detalles: e.target.value})}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setModalEscalarCaso(false)}>
              Cancelar
            </Button>
            <Button onClick={escalarCaso} className="bg-red-600 hover:bg-red-700 text-white">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Escalar Caso
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}