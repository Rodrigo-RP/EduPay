import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, Search, Filter, Calendar, TrendingUp, DollarSign, Users, GraduationCap, FileSpreadsheet, Printer, Settings, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { generateCiclosList, getCurrentCiclo } from "@/hooks/use-academic-filter";

export default function Reportes() {
  const { toast } = useToast();
  
  // Estados para filtros
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [busquedaFamiliaEstudiante, setBusquedaFamiliaEstudiante] = useState("");
  const [seccionEducativa, setSeccionEducativa] = useState("todas");
  const [nivelAcademico, setNivelAcademico] = useState("todos");
  const [cicloEscolar, setCicloEscolar] = useState(getCurrentCiclo);
  const [concepto, setConcepto] = useState("todos");
  const [tipoReporte, setTipoReporte] = useState("");
  const [formatoExportacion, setFormatoExportacion] = useState("excel");
  
  // Fetch conceptos personalizados desde la base de datos
  const { data: conceptosPersonalizados = [], refetch: refetchConceptos } = useQuery({
    queryKey: ["/api/concepts"],
    select: (data: any[]) => data || []
  });

  // Escuchar cambios en tiempo real para conceptos (sincronización automática)
  useEffect(() => {
    const handleFocus = () => {
      refetchConceptos();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refetchConceptos();
        toast({
          title: "🔄 Conceptos Actualizados",
          description: "Los reportes se han sincronizado automáticamente con los conceptos de pago",
          duration: 3000,
        });
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Actualizar cada 30 segundos para capturar cambios en tiempo real
    const intervalId = setInterval(() => {
      refetchConceptos();
    }, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [refetchConceptos, toast]);

  // Tipos de reportes base (predefinidos)
  const tiposReporteBase = [
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

  // Función para generar reportes dinámicos desde conceptos personalizados
  const generarReportesPersonalizados = () => {
    const reportesPersonalizados: Array<{id: string, nombre: string, categoria: string, icono: any}> = [];
    
    // Filtrar conceptos personalizados (excluyendo los básicos como colegiatura)
    const conceptosPersonalizadosActivos = conceptosPersonalizados.filter((concepto: any) => {
      // Excluir conceptos básicos
      const tiposBasicos = ['colegiatura', 'inscripcion', 'reinscripcion', 'libros', 'uniformes'];
      return !tiposBasicos.includes(concepto.tipo?.toLowerCase());
    });
    
    conceptosPersonalizadosActivos.forEach((concepto: any) => {
      // Generar ID único para el reporte basado en el concepto
      const reporteId = `ingresos_concepto_${concepto.id}`;
      
      reportesPersonalizados.push({
        id: reporteId,
        nombre: `Ingresos por ${concepto.nombre}`,
        categoria: "ingresos_personalizados",
        icono: DollarSign
      });
    });
    
    return reportesPersonalizados;
  };

  // Combinar tipos de reporte base con personalizados
  const tiposReporte = [...tiposReporteBase, ...generarReportesPersonalizados()];

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

  // Generar lista de conceptos incluyendo personalizados
  const generarConceptosFiltros = () => {
    const conceptosBase: Array<{value: string, label: string, isCustom?: boolean}> = [
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
    
    // Agregar conceptos personalizados desde la base de datos
    const conceptosPersonalizadosActivos = conceptosPersonalizados
      .filter((concepto: any) => {
        // Excluir conceptos básicos predefinidos
        const tiposBasicos = ['colegiatura', 'inscripcion', 'reinscripcion', 'libros', 'uniformes'];
        return !tiposBasicos.includes(concepto.tipo?.toLowerCase());
      })
      .map((concepto: any) => ({
        value: `concepto_${concepto.id}`,
        label: concepto.nombre,
        isCustom: true
      }));
    
    return [...conceptosBase, ...conceptosPersonalizadosActivos];
  };
  
  const conceptos = generarConceptosFiltros();

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
    setCicloEscolar(getCurrentCiclo());
    setConcepto("todos");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sistema de Reportes</h1>
          <p className="mt-2 text-sm text-gray-600">
            Consulta los reportes disponibles en sus módulos especializados
          </p>
          {conceptosPersonalizados.length > 0 && (
            <div className="mt-2">
              <Badge variant="outline" className="text-emerald-600 border-emerald-600">
                <DollarSign className="w-3 h-3 mr-1" />
                {conceptosPersonalizados.filter((concepto: any) => {
                  const tiposBasicos = ['colegiatura', 'inscripcion', 'reinscripcion', 'libros', 'uniformes'];
                  return !tiposBasicos.includes(concepto.tipo?.toLowerCase());
                }).length} conceptos personalizados disponibles
              </Badge>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-blue-600 border-blue-600">
            <BarChart3 className="w-4 h-4 mr-1" />
            Exportación genérica no disponible
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reportes disponibles</CardTitle>
          <CardDescription>
            Estos módulos consultan los registros del sistema y conservan sus permisos de acceso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button asChild variant="outline">
            <Link href="/cargos">Reporte de cobranza</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/reporte-antiguedad-saldos">Antigüedad de saldos</Link>
          </Button>
          <div>
            <Button asChild variant="outline">
              <Link href="/fiscal-contable">Reportes contables</Link>
            </Button>
            <p className="mt-1 text-sm text-gray-600">En la pestaña Contadores Externos.</p>
          </div>
        </CardContent>
      </Card>

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
                  
                  {/* Reportes de Conceptos Personalizados */}
                  {generarReportesPersonalizados().length > 0 && (
                    <>
                      <div className="font-medium text-emerald-700 px-2 py-1.5 text-xs">🎯 REPORTES DE CONCEPTOS PERSONALIZADOS</div>
                      {tiposReporte
                        .filter(tipo => tipo.categoria === "ingresos_personalizados")
                        .map(tipo => (
                          <SelectItem key={tipo.id} value={tipo.id}>
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-emerald-600" />
                              <span className="font-medium">{tipo.nombre}</span>
                              <span className="ml-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs">Personalizado</span>
                            </div>
                          </SelectItem>
                        ))
                      }
                    </>
                  )}
                  
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
                        <div className="flex items-center gap-2">
                          {concepto.isCustom ? (
                            <>
                              <DollarSign className="w-4 h-4 text-emerald-600" />
                              <span>{concepto.label}</span>
                              <span className="ml-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs">Personalizado</span>
                            </>
                          ) : (
                            <>
                              <span>{concepto.label}</span>
                            </>
                          )}
                        </div>
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
                    {generateCiclosList().map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
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

      {/* Sin fuente de datos no se genera ningún documento ni se anuncia éxito. */}
      {tipoReporte && (
        <Card>
          <CardHeader>
            <CardTitle>Generar y Exportar Reporte</CardTitle>
            <CardDescription>
              {getTipoReporteNombre()} — No disponible por ahora. Usa los reportes de los módulos anteriores.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button disabled>
                <FileText className="w-4 h-4 mr-2" />
                Generar Reporte — No disponible por ahora
              </Button>
              <Button disabled variant="outline">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar CSV — No disponible por ahora
              </Button>
              <Button disabled variant="outline">
                <Printer className="w-4 h-4 mr-2" />
                Exportar PDF — No disponible por ahora
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