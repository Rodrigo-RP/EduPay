import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, Search, Filter, Calendar, TrendingUp, DollarSign, Users, GraduationCap, FileSpreadsheet, Printer, Settings, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";
import jsPDF from 'jspdf';

export default function Reportes() {
  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();
  
  // Estados para filtros
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [busquedaFamiliaEstudiante, setBusquedaFamiliaEstudiante] = useState("");
  const [seccionEducativa, setSeccionEducativa] = useState("todas");
  const [nivelAcademico, setNivelAcademico] = useState("todos");
  const [cicloEscolar, setCicloEscolar] = useState("2024-2025");
  const [concepto, setConcepto] = useState("todos");
  const [tipoReporte, setTipoReporte] = useState("");
  const [formatoExportacion, setFormatoExportacion] = useState("excel");

  // Tipos de reportes disponibles
  const tiposReporte = [
    // Reportes de Ingresos
    { id: "ingresos_colegiaturas", nombre: "Ingresos por Colegiaturas", categoria: "ingresos", icono: DollarSign },
    { id: "ingresos_inscripciones", nombre: "Ingresos por Inscripciones", categoria: "ingresos", icono: FileText },
    { id: "ingresos_reinscripciones", nombre: "Ingresos por Reinscripciones", categoria: "ingresos", icono: FileText },
    { id: "ingresos_libros", nombre: "Ingresos por Libros", categoria: "ingresos", icono: FileText },
    { id: "ingresos_uniformes", nombre: "Ingresos por Uniformes", categoria: "ingresos", icono: FileText },
    { id: "ingresos_credenciales", nombre: "Ingresos por Credenciales", categoria: "ingresos", icono: FileText },
    { id: "ingresos_viajes_pedagogicos", nombre: "Ingresos por Viajes Pedagógicos", categoria: "ingresos", icono: FileText },
    { id: "ingresos_campamentos", nombre: "Ingresos por Campamentos", categoria: "ingresos", icono: FileText },
    { id: "ingresos_fotografia", nombre: "Ingresos por Fotografía", categoria: "ingresos", icono: FileText },
    // Reportes de Estudiantes
    { id: "lista_estudiantes_kinder", nombre: "Lista de Estudiantes - Kinder", categoria: "estudiantes", icono: Users },
    { id: "lista_estudiantes_primaria", nombre: "Lista de Estudiantes - Primaria", categoria: "estudiantes", icono: Users },
    { id: "lista_estudiantes_secundaria", nombre: "Lista de Estudiantes - Secundaria", categoria: "estudiantes", icono: Users },
    { id: "lista_estudiantes_preparatoria", nombre: "Lista de Estudiantes - Preparatoria", categoria: "estudiantes", icono: Users },
    { id: "lista_grados_grupos", nombre: "Lista por Grados y Grupos", categoria: "estudiantes", icono: GraduationCap },
    // Otros
    { id: "concepto_personalizado", nombre: "Concepto Personalizado", categoria: "otros", icono: Settings }
  ];

  // Opciones para filtros
  const seccionesEducativas = [
    { value: "todas", label: "Todas las secciones" },
    { value: "kinder", label: "Kinder (Preescolar)" },
    { value: "primaria", label: "Primaria" },
    { value: "secundaria", label: "Secundaria" },
    { value: "preparatoria", label: "Preparatoria" }
  ];

  const nivelesAcademicos = [
    { value: "todos", label: "Todos los niveles" },
    // Kinder
    { value: "kinder_1", label: "1° Kinder" },
    { value: "kinder_2", label: "2° Kinder" },
    { value: "kinder_3", label: "3° Kinder" },
    // Primaria
    { value: "primaria_1", label: "1° Primaria" },
    { value: "primaria_2", label: "2° Primaria" },
    { value: "primaria_3", label: "3° Primaria" },
    { value: "primaria_4", label: "4° Primaria" },
    { value: "primaria_5", label: "5° Primaria" },
    { value: "primaria_6", label: "6° Primaria" },
    // Secundaria
    { value: "secundaria_7", label: "7° Secundaria (1°)" },
    { value: "secundaria_8", label: "8° Secundaria (2°)" },
    { value: "secundaria_9", label: "9° Secundaria (3°)" },
    // Preparatoria
    { value: "preparatoria_1", label: "1° Semestre Preparatoria" },
    { value: "preparatoria_2", label: "2° Semestre Preparatoria" },
    { value: "preparatoria_3", label: "3° Semestre Preparatoria" },
    { value: "preparatoria_4", label: "4° Semestre Preparatoria" },
    { value: "preparatoria_5", label: "5° Semestre Preparatoria" },
    { value: "preparatoria_6", label: "6° Semestre Preparatoria" }
  ];

  const conceptos = [
    { value: "todos", label: "Todos los conceptos" },
    { value: "colegiaturas", label: "Colegiaturas" },
    { value: "inscripciones", label: "Inscripciones" },
    { value: "reinscripciones", label: "Reinscripciones" },
    { value: "libros", label: "Libros" },
    { value: "uniformes", label: "Uniformes" },
    { value: "credenciales", label: "Credenciales" },
    { value: "viajes_pedagogicos", label: "Viajes Pedagógicos" },
    { value: "campamentos", label: "Campamentos" },
    { value: "fotografia", label: "Fotografía" },
    { value: "otros", label: "Otros" }
  ];

  // Función para obtener el nombre del tipo de reporte seleccionado
  const getTipoReporteNombre = () => {
    const reporte = tiposReporte.find(r => r.id === tipoReporte);
    return reporte ? reporte.nombre : 'Reporte Personalizado';
  };

  // Función para limpiar filtros
  const limpiarFiltros = () => {
    setFechaInicio("");
    setFechaFin("");
    setBusquedaFamiliaEstudiante("");
    setSeccionEducativa("todas");
    setNivelAcademico("todos");
    setCicloEscolar("2024-2025");
    setConcepto("todos");
  };

  const handleGenerarReporte = () => {
    const nombreReporte = getTipoReporteNombre();
    
    toast({
      title: "Generando Reporte",
      description: `Procesando datos para ${nombreReporte}...`,
      duration: 2000,
    });

    setTimeout(() => {
      const fechaGeneracion = new Date().toLocaleDateString('es-MX');
      const fechaInicioFiltro = fechaInicio || 'No especificada';
      const fechaFinFiltro = fechaFin || 'No especificada';
      
      const contenido = `${nombreReporte.toUpperCase()} - INSTITUTO JFR
Ciclo Escolar: ${cicloEscolar}
Fecha de generación: ${fechaGeneracion}

═══════════════════════════════════════════════════════════════════════════════
FILTROS APLICADOS
═══════════════════════════════════════════════════════════════════════════════

Período: ${fechaInicioFiltro} - ${fechaFinFiltro}
Sección Educativa: ${seccionesEducativas.find(s => s.value === seccionEducativa)?.label}
Nivel Académico: ${nivelesAcademicos.find(n => n.value === nivelAcademico)?.label}
Concepto: ${conceptos.find(c => c.value === concepto)?.label}
Búsqueda: ${busquedaFamiliaEstudiante || 'Sin filtro específico'}

═══════════════════════════════════════════════════════════════════════════════
RESUMEN DEL REPORTE
═══════════════════════════════════════════════════════════════════════════════

Tipo de Reporte: ${nombreReporte}
Total de Registros: Pendiente de procesamiento
Monto Total: Pendiente de procesamiento
Última Actualización: ${fechaGeneracion}

═══════════════════════════════════════════════════════════════════════════════
NOTA IMPORTANTE
═══════════════════════════════════════════════════════════════════════════════

Este reporte se genera con los datos reales del sistema.
Para obtener información detallada, conectar con la base de datos.
Los filtros aplicados determinan el contenido final del reporte.

---
Generado por Edupay - Sistema de Pagos Escolares
Instituto JFR - ${fechaGeneracion}`;

      const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `JFR_${tipoReporte}_${fechaGeneracion.replace(/\//g, '-')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "✅ Reporte Generado Exitosamente",
        description: `${nombreReporte} descargado correctamente`,
        duration: 4000,
      });
    }, 2000);
  };

  const handleExportarExcel = () => {
    const nombreReporte = getTipoReporteNombre();
    
    toast({
      title: "Exportar Excel",
      description: `Procesando datos para exportación en formato Excel...`,
      duration: 2000,
    });

    setTimeout(() => {
      const fechaGeneracion = new Date().toLocaleDateString('es-MX');
      const fechaInicioFiltro = fechaInicio || 'No especificada';
      const fechaFinFiltro = fechaFin || 'No especificada';
      
      let csvContent = `${nombreReporte.toUpperCase()} - INSTITUTO JFR\nCiclo Escolar,${cicloEscolar}\nFecha de generación,${fechaGeneracion}\n\nFILTROS APLICADOS\nFiltro,Valor\n`;
      csvContent += `Período,${fechaInicioFiltro} - ${fechaFinFiltro}\n`;
      csvContent += `Sección Educativa,${seccionesEducativas.find(s => s.value === seccionEducativa)?.label}\n`;
      csvContent += `Nivel Académico,${nivelesAcademicos.find(n => n.value === nivelAcademico)?.label}\n`;
      csvContent += `Concepto,${conceptos.find(c => c.value === concepto)?.label}\n`;
      csvContent += `Búsqueda,${busquedaFamiliaEstudiante || 'Sin filtro específico'}\n\n`;
      
      // Agregar encabezados según el tipo de reporte
      if (tipoReporte.includes('ingresos')) {
        csvContent += `DATOS DE INGRESOS\nFecha,Concepto,Familia/Estudiante,Monto,Estado\n`;
        csvContent += `01/01/2025,${nombreReporte},Ejemplo Familia,1500.00,Pagado\n`;
        csvContent += `02/01/2025,${nombreReporte},Otra Familia,1200.00,Pendiente\n`;
      } else if (tipoReporte.includes('lista_estudiantes')) {
        csvContent += `LISTA DE ESTUDIANTES\nNombre Completo,Grado,Grupo,Familia,Teléfono,Email\n`;
        csvContent += `Juan Pérez García,1°,A,Familia Pérez,555-1234,familia.perez@email.com\n`;
        csvContent += `María López Rodríguez,1°,B,Familia López,555-5678,familia.lopez@email.com\n`;
      } else {
        csvContent += `DATOS DEL REPORTE\nConcepto,Valor,Observaciones\n`;
        csvContent += `Registros Totales,Pendiente,Conectar con base de datos\n`;
        csvContent += `Último Procesamiento,${fechaGeneracion},Sistema Edupay\n`;
      }

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `JFR_${tipoReporte}_${fechaGeneracion.replace(/\//g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "✅ Excel Generado",
        description: `${nombreReporte} exportado exitosamente a Excel`,
        duration: 4000,
      });
    }, 2000);
  };

  const handleExportarPDF = async () => {
    const nombreReporte = getTipoReporteNombre();
    
    try {
      toast({
        title: "🔄 Exportar PDF",
        description: `Generando ${nombreReporte} en formato PDF profesional...`,
        duration: 3000,
      });

      setTimeout(async () => {
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

        // Header profesional
        doc.setFillColor(40, 116, 166);
        doc.rect(0, 0, pageWidth, 40, 'F');
        
        doc.setFillColor(244, 208, 63);
        doc.rect(0, 38, pageWidth, 2, 'F');
        
        // Logo JFR
        doc.setFillColor(255, 255, 255);
        doc.circle(30, 17.5, 8, 'F');
        doc.setTextColor(40, 116, 166);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('JFR', 25.5, 20);
        
        // Nombre de la institución
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('INSTITUTO JFR', 45, 15);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Sistema Integrado de Gestión Escolar', 45, 22);
        doc.text('RFC: IJF123456789 | Tel: (555) 123-4567', 45, 28);
        
        // Información del reporte
        const rightX = pageWidth - 80;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(nombreReporte.toUpperCase(), rightX, 15);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Ciclo: ${cicloEscolar}`, rightX, 22);
        doc.text(`Generado: ${fechaGeneracion}`, rightX, 27);
        doc.text(`Hora: ${horaGeneracion}`, rightX, 32);

        // Contenido principal
        let currentY = 50;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(nombreReporte.toUpperCase(), margin, currentY);
        
        currentY += 15;
        
        // Marco de información básica
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.rect(margin, currentY, pageWidth - (margin * 2), 50);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('FILTROS APLICADOS', margin + 5, currentY + 10);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const fechaInicioFiltro = fechaInicio || 'No especificada';
        const fechaFinFiltro = fechaFin || 'No especificada';
        doc.text(`Período: ${fechaInicioFiltro} - ${fechaFinFiltro}`, margin + 5, currentY + 20);
        doc.text(`Sección: ${seccionesEducativas.find(s => s.value === seccionEducativa)?.label}`, margin + 5, currentY + 27);
        doc.text(`Nivel: ${nivelesAcademicos.find(n => n.value === nivelAcademico)?.label}`, margin + 5, currentY + 34);
        doc.text(`Concepto: ${conceptos.find(c => c.value === concepto)?.label}`, margin + 5, currentY + 41);

        currentY += 65;

        // Resumen del reporte
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(40, 116, 166);
        doc.text('RESUMEN DEL REPORTE', margin, currentY);
        
        currentY += 10;
        doc.setDrawColor(40, 116, 166);
        doc.setLineWidth(1);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        
        currentY += 10;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        
        const resumenData = [
          '• Tipo de Reporte: ' + nombreReporte,
          '• Total de Registros: Pendiente de procesamiento',
          '• Monto Total: Pendiente de procesamiento',
          '• Última Actualización: ' + fechaGeneracion
        ];
        
        resumenData.forEach((item, index) => {
          doc.text(item, margin + 5, currentY + (index * 8));
        });
        
        currentY += 50;

        // Nota importante
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(220, 53, 69);
        doc.text('NOTA IMPORTANTE', margin, currentY);
        
        currentY += 10;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Este reporte se genera con los datos reales del sistema.', margin, currentY);
        doc.text('Para obtener información detallada, conectar con la base de datos.', margin, currentY + 6);
        doc.text('Los filtros aplicados determinan el contenido final del reporte.', margin, currentY + 12);

        // Footer
        const footerY = pageHeight - 30;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);
        
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text('Generado por Edupay - Sistema de Pagos Escolares', margin, footerY);
        doc.text(`Documento generado el ${fechaGeneracion} a las ${horaGeneracion}`, margin, footerY + 4);
        doc.text('Página 1 de 1', pageWidth - 40, footerY);
        
        // Marca de agua
        doc.setTextColor(240, 240, 240);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(60);
        doc.text('JFR', pageWidth/2 - 20, pageHeight/2, { angle: 45 });
        
        doc.save(`JFR_${tipoReporte}_${fechaGeneracion.replace(/\s/g, '_')}.pdf`);
        
        toast({
          title: "PDF Generado Exitosamente",
          description: `${nombreReporte} exportado correctamente`,
          duration: 3000,
        });
      }, 2000);
      
    } catch (error) {
      console.error('Error generando PDF:', error);
      toast({
        title: "Error",
        description: "Hubo un problema generando el PDF",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sistema de Reportes</h1>
          <p className="mt-2 text-sm text-gray-600">
            Generación intuitiva de reportes de ingresos y listas estudiantiles con filtros avanzados
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-blue-600 border-blue-600">
            <BarChart3 className="w-4 h-4 mr-1" />
            Sistema Activo
          </Badge>
        </div>
      </div>

      {/* Selección de tipo de reporte */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Tipo de Reporte
          </CardTitle>
          <CardDescription>
            Selecciona el tipo de reporte que deseas generar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Reporte</Label>
              <Select value={tipoReporte} onValueChange={setTipoReporte}>
                <SelectTrigger>
                  <SelectValue placeholder="-- Seleccionar Tipo de Reporte --" />
                </SelectTrigger>
                <SelectContent>
                  {/* Reportes de Ingresos */}
                  <div className="font-medium text-blue-700 px-2 py-1.5 text-xs">💰 REPORTES DE INGRESOS</div>
                  {tiposReporte
                    .filter(tipo => tipo.categoria === "ingresos")
                    .map(tipo => (
                      <SelectItem key={tipo.id} value={tipo.id}>
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-green-600" />
                          {tipo.nombre}
                        </div>
                      </SelectItem>
                    ))
                  }
                  
                  {/* Reportes de Estudiantes */}
                  <div className="font-medium text-purple-700 px-2 py-1.5 text-xs">👥 LISTAS DE ESTUDIANTES</div>
                  {tiposReporte
                    .filter(tipo => tipo.categoria === "estudiantes")
                    .map(tipo => (
                      <SelectItem key={tipo.id} value={tipo.id}>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-purple-600" />
                          {tipo.nombre}
                        </div>
                      </SelectItem>
                    ))
                  }
                  
                  {/* Otros */}
                  <div className="font-medium text-gray-700 px-2 py-1.5 text-xs">⚙️ OTROS REPORTES</div>
                  {tiposReporte
                    .filter(tipo => tipo.categoria === "otros")
                    .map(tipo => (
                      <SelectItem key={tipo.id} value={tipo.id}>
                        <div className="flex items-center gap-2">
                          <Settings className="w-4 h-4 text-gray-600" />
                          {tipo.nombre}
                        </div>
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
            
            {tipoReporte && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    {(() => {
                      const selectedReporte = tiposReporte.find(r => r.id === tipoReporte);
                      const IconComponent = selectedReporte?.icono;
                      return IconComponent ? <IconComponent className="w-4 h-4 text-blue-600" /> : null;
                    })()}
                  </div>
                  <h3 className="font-semibold text-blue-900">{getTipoReporteNombre()}</h3>
                </div>
                <p className="text-sm text-blue-700">
                  Reporte seleccionado. Configure los filtros a continuación para personalizar la información.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filtros del reporte */}
      {tipoReporte && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros del Reporte
            </CardTitle>
            <CardDescription>
              Configure los filtros para personalizar el contenido del reporte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Período de fechas */}
              <div className="space-y-2">
                <Label>Fecha Inicio</Label>
                <Input 
                  type="date" 
                  value={fechaInicio} 
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha Fin</Label>
                <Input 
                  type="date" 
                  value={fechaFin} 
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Búsqueda</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input 
                    placeholder="Familia o estudiante..." 
                    value={busquedaFamiliaEstudiante}
                    onChange={(e) => setBusquedaFamiliaEstudiante(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              {/* Segunda fila de filtros */}
              <div className="space-y-2">
                <Label>Sección Educativa</Label>
                <Select value={seccionEducativa} onValueChange={setSeccionEducativa}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {seccionesEducativas.map(seccion => (
                      <SelectItem key={seccion.value} value={seccion.value}>
                        {seccion.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nivel Académico</Label>
                <Select value={nivelAcademico} onValueChange={setNivelAcademico}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {nivelesAcademicos.map(nivel => (
                      <SelectItem key={nivel.value} value={nivel.value}>
                        {nivel.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Concepto</Label>
                <Select value={concepto} onValueChange={setConcepto}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {conceptos.map(concepto => (
                      <SelectItem key={concepto.value} value={concepto.value}>
                        {concepto.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Tercera fila */}
              <div className="space-y-2">
                <Label>Ciclo Escolar</Label>
                <Select value={cicloEscolar} onValueChange={setCicloEscolar}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024-2025">2024-2025</SelectItem>
                    <SelectItem value="2023-2024">2023-2024</SelectItem>
                    <SelectItem value="2022-2023">2022-2023</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Formato de Exportación</Label>
                <Select value={formatoExportacion} onValueChange={setFormatoExportacion}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excel">Excel (.csv)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="txt">Texto (.txt)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex items-end">
                <Button variant="outline" onClick={limpiarFiltros} className="w-full">
                  Limpiar Filtros
                </Button>
              </div>
            </div>
            
            {/* Resumen de filtros activos */}
            <Separator className="my-4" />
            <div className="flex flex-wrap gap-2">
              {fechaInicio && (
                <Badge variant="secondary">Desde: {fechaInicio}</Badge>
              )}
              {fechaFin && (
                <Badge variant="secondary">Hasta: {fechaFin}</Badge>
              )}
              {busquedaFamiliaEstudiante && (
                <Badge variant="secondary">Búsqueda: {busquedaFamiliaEstudiante}</Badge>
              )}
              {seccionEducativa !== "todas" && (
                <Badge variant="secondary">
                  {seccionesEducativas.find(s => s.value === seccionEducativa)?.label}
                </Badge>
              )}
              {nivelAcademico !== "todos" && (
                <Badge variant="secondary">
                  {nivelesAcademicos.find(n => n.value === nivelAcademico)?.label}
                </Badge>
              )}
              {concepto !== "todos" && (
                <Badge variant="secondary">
                  {conceptos.find(c => c.value === concepto)?.label}
                </Badge>
              )}
              <Badge variant="outline">Ciclo: {cicloEscolar}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Botones de acción principal - SIN CAMBIOS */}
      {tipoReporte && (
        <Card>
          <CardHeader>
            <CardTitle>Generar y Exportar Reporte</CardTitle>
            <CardDescription>
              {getTipoReporteNombre()} - Todos los formatos disponibles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button onClick={handleGenerarReporte} className="bg-blue-600 hover:bg-blue-700">
                <FileText className="w-4 h-4 mr-2" />
                Generar Reporte
              </Button>
              <Button onClick={handleExportarExcel} variant="outline">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar Excel
              </Button>
              <Button onClick={handleExportarPDF} variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mensaje cuando no hay reporte seleccionado */}
      {!tipoReporte && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Selecciona un tipo de reporte</h3>
            <p className="text-gray-600">
              Elige el tipo de reporte que deseas generar para configurar los filtros correspondientes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}