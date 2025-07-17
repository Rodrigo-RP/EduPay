import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';

interface Student {
  id: number;
  nombre_completo: string;
  curp: string;
  grado: string;
  nivel_academico: string;
  estado: string;
  fecha_inscripcion: string;
  padre_nombre: string;
  padre_email: string;
  padre_telefono: string;
  monto_inscripcion: number;
  estado_pago: string;
  beca_aplicada: string;
  descuento_aplicado: number;
}

export default function ReportesAdmisiones() {
  const { toast } = useToast();
  const [filtrosPeriodo, setFiltrosPeriodo] = useState({
    periodo: "mensual",
    mes: "julio",
    año: "2025"
  });
  
  const [filtrosEstado, setFiltrosEstado] = useState({
    estado: "todos",
    nivel: "todos",
    beca: "todos"
  });

  // Obtener datos de estudiantes
  const { data: estudiantes = [], isLoading } = useQuery<Student[]>({
    queryKey: ['/api/students'],
    enabled: true
  });

  // Filtrar estudiantes según criterios de admisiones
  const estudiantesFiltrados = estudiantes.filter(estudiante => {
    // Solo estudiantes activos o pendientes de inscripción
    const estadosValidos = ['activo', 'pendiente', 'inscrito'];
    
    // Filtros por estado
    if (filtrosEstado.estado !== 'todos' && estudiante.estado !== filtrosEstado.estado) {
      return false;
    }
    
    // Filtros por nivel académico
    if (filtrosEstado.nivel !== 'todos' && estudiante.nivel_academico !== filtrosEstado.nivel) {
      return false;
    }
    
    // Filtros por beca
    if (filtrosEstado.beca !== 'todos') {
      if (filtrosEstado.beca === 'con_beca' && !estudiante.beca_aplicada) {
        return false;
      }
      if (filtrosEstado.beca === 'sin_beca' && estudiante.beca_aplicada) {
        return false;
      }
    }
    
    return estadosValidos.includes(estudiante.estado);
  });

  // Calcular estadísticas de inscripciones
  const estadisticas = {
    total_inscritos: estudiantesFiltrados.filter(e => e.estado === 'inscrito').length,
    total_pendientes: estudiantesFiltrados.filter(e => e.estado === 'pendiente').length,
    total_activos: estudiantesFiltrados.filter(e => e.estado === 'activo').length,
    con_beca: estudiantesFiltrados.filter(e => e.beca_aplicada).length,
    sin_beca: estudiantesFiltrados.filter(e => !e.beca_aplicada).length,
    pagos_completados: estudiantesFiltrados.filter(e => e.estado_pago === 'completado').length,
    pagos_pendientes: estudiantesFiltrados.filter(e => e.estado_pago === 'pendiente').length
  };

  // Agrupar por nivel académico
  const porNivel = estudiantesFiltrados.reduce((acc, estudiante) => {
    const nivel = estudiante.nivel_academico || 'Sin nivel';
    if (!acc[nivel]) {
      acc[nivel] = {
        total: 0,
        inscritos: 0,
        pendientes: 0,
        con_beca: 0
      };
    }
    acc[nivel].total++;
    if (estudiante.estado === 'inscrito') acc[nivel].inscritos++;
    if (estudiante.estado === 'pendiente') acc[nivel].pendientes++;
    if (estudiante.beca_aplicada) acc[nivel].con_beca++;
    return acc;
  }, {} as Record<string, any>);

  // Exportar a Excel
  const exportarExcel = () => {
    const datosExportacion = estudiantesFiltrados.map(estudiante => ({
      'Nombre Completo': estudiante.nombre_completo,
      'CURP': estudiante.curp,
      'Grado': estudiante.grado,
      'Nivel Académico': estudiante.nivel_academico,
      'Estado': estudiante.estado,
      'Fecha Inscripción': estudiante.fecha_inscripcion,
      'Padre/Tutor': estudiante.padre_nombre,
      'Email': estudiante.padre_email,
      'Teléfono': estudiante.padre_telefono,
      'Monto Inscripción': estudiante.monto_inscripcion,
      'Estado Pago': estudiante.estado_pago,
      'Beca Aplicada': estudiante.beca_aplicada || 'Sin beca',
      'Descuento': estudiante.descuento_aplicado || 0
    }));

    const ws = XLSX.utils.json_to_sheet(datosExportacion);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Inscripciones');
    XLSX.writeFile(wb, `reporte_inscripciones_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast({
      title: "Exportación exitosa",
      description: "Reporte de inscripciones exportado a Excel",
    });
  };

  // Exportar a PDF
  const exportarPDF = () => {
    const contenidoHTML = `
      <html>
        <head>
          <title>Reporte de Inscripciones - ${new Date().toLocaleDateString()}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
            .stat-card { border: 1px solid #ddd; padding: 15px; border-radius: 8px; text-align: center; }
            .stat-number { font-size: 24px; font-weight: bold; color: #16a34a; }
            .stat-label { font-size: 14px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; }
            .badge { padding: 2px 6px; border-radius: 4px; font-size: 12px; }
            .badge-activo { background-color: #dcfce7; color: #166534; }
            .badge-pendiente { background-color: #fef3c7; color: #92400e; }
            .badge-inscrito { background-color: #dbeafe; color: #1e40af; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Reporte de Inscripciones</h1>
            <p>Período: ${filtrosPeriodo.periodo} - ${filtrosPeriodo.mes} ${filtrosPeriodo.año}</p>
            <p>Fecha de generación: ${new Date().toLocaleDateString()}</p>
          </div>
          
          <div class="stats">
            <div class="stat-card">
              <div class="stat-number">${estadisticas.total_inscritos}</div>
              <div class="stat-label">Inscritos</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${estadisticas.total_pendientes}</div>
              <div class="stat-label">Pendientes</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${estadisticas.con_beca}</div>
              <div class="stat-label">Con Beca</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${estadisticas.pagos_completados}</div>
              <div class="stat-label">Pagos Completados</div>
            </div>
          </div>
          
          <h2>Detalle de Estudiantes</h2>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Grado</th>
                <th>Estado</th>
                <th>Padre/Tutor</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Beca</th>
                <th>Estado Pago</th>
              </tr>
            </thead>
            <tbody>
              ${estudiantesFiltrados.map(estudiante => `
                <tr>
                  <td>${estudiante.nombre_completo}</td>
                  <td>${estudiante.grado}</td>
                  <td><span class="badge badge-${estudiante.estado}">${estudiante.estado}</span></td>
                  <td>${estudiante.padre_nombre}</td>
                  <td>${estudiante.padre_email}</td>
                  <td>${estudiante.padre_telefono}</td>
                  <td>${estudiante.beca_aplicada || 'Sin beca'}</td>
                  <td>${estudiante.estado_pago}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const ventana = window.open('', '_blank');
    if (ventana) {
      ventana.document.write(contenidoHTML);
      ventana.document.close();
      ventana.print();
    }
    
    toast({
      title: "Exportación PDF iniciada",
      description: "Se abrió una ventana para imprimir el reporte",
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reportes de Inscripciones</h1>
          <p className="text-slate-600">Control y seguimiento de estudiantes inscritos y pendientes</p>
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-700">
              <i className="fas fa-user-graduate"></i>
              <span className="text-sm font-medium">
                Perfil Admisiones - Enfoque exclusivo en inscripciones y control de becas
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button onClick={exportarExcel} className="bg-green-600 hover:bg-green-700">
            <i className="fas fa-file-excel mr-2"></i>
            Exportar Excel
          </Button>
          <Button onClick={exportarPDF} className="bg-red-600 hover:bg-red-700">
            <i className="fas fa-file-pdf mr-2"></i>
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-filter"></i>
            Filtros de Reporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="periodo">Período</Label>
              <Select value={filtrosPeriodo.periodo} onValueChange={(value) => setFiltrosPeriodo({...filtrosPeriodo, periodo: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="estado">Estado</Label>
              <Select value={filtrosEstado.estado} onValueChange={(value) => setFiltrosEstado({...filtrosEstado, estado: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="inscrito">Inscritos</SelectItem>
                  <SelectItem value="pendiente">Pendientes</SelectItem>
                  <SelectItem value="activo">Activos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="nivel">Nivel Académico</Label>
              <Select value={filtrosEstado.nivel} onValueChange={(value) => setFiltrosEstado({...filtrosEstado, nivel: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los niveles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="Kinder">Kinder</SelectItem>
                  <SelectItem value="Primaria">Primaria</SelectItem>
                  <SelectItem value="Secundaria">Secundaria</SelectItem>
                  <SelectItem value="Bachillerato">Bachillerato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="resumen" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="estudiantes">Estudiantes</TabsTrigger>
          <TabsTrigger value="becas">Control de Becas</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-6">
          {/* Estadísticas principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <i className="fas fa-user-check text-blue-600"></i>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{estadisticas.total_inscritos}</p>
                    <p className="text-sm text-slate-600">Inscritos</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                    <i className="fas fa-clock text-yellow-600"></i>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-yellow-600">{estadisticas.total_pendientes}</p>
                    <p className="text-sm text-slate-600">Pendientes</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <i className="fas fa-graduation-cap text-green-600"></i>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{estadisticas.con_beca}</p>
                    <p className="text-sm text-slate-600">Con Beca</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <i className="fas fa-credit-card text-purple-600"></i>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-600">{estadisticas.pagos_completados}</p>
                    <p className="text-sm text-slate-600">Pagos Completados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Estadísticas por nivel */}
          <Card>
            <CardHeader>
              <CardTitle>Distribución por Nivel Académico</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(porNivel).map(([nivel, datos]) => (
                  <div key={nivel} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <h3 className="font-medium">{nivel}</h3>
                      <p className="text-sm text-slate-600">{datos.total} estudiantes</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                        <p className="text-lg font-bold text-blue-600">{datos.inscritos}</p>
                        <p className="text-xs text-slate-500">Inscritos</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-yellow-600">{datos.pendientes}</p>
                        <p className="text-xs text-slate-500">Pendientes</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-green-600">{datos.con_beca}</p>
                        <p className="text-xs text-slate-500">Con Beca</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estudiantes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Estudiantes</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">Nombre</th>
                        <th className="text-left p-3">Grado</th>
                        <th className="text-left p-3">Estado</th>
                        <th className="text-left p-3">Padre/Tutor</th>
                        <th className="text-left p-3">Email</th>
                        <th className="text-left p-3">Teléfono</th>
                        <th className="text-left p-3">Beca</th>
                        <th className="text-left p-3">Estado Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estudiantesFiltrados.map((estudiante) => (
                        <tr key={estudiante.id} className="border-b hover:bg-slate-50">
                          <td className="p-3 font-medium">{estudiante.nombre_completo}</td>
                          <td className="p-3">{estudiante.grado}</td>
                          <td className="p-3">
                            <Badge variant={
                              estudiante.estado === 'inscrito' ? 'default' :
                              estudiante.estado === 'pendiente' ? 'secondary' : 'outline'
                            }>
                              {estudiante.estado}
                            </Badge>
                          </td>
                          <td className="p-3">{estudiante.padre_nombre}</td>
                          <td className="p-3">{estudiante.padre_email}</td>
                          <td className="p-3">{estudiante.padre_telefono}</td>
                          <td className="p-3">
                            {estudiante.beca_aplicada ? (
                              <Badge variant="default" className="bg-green-100 text-green-800">
                                {estudiante.beca_aplicada}
                              </Badge>
                            ) : (
                              <span className="text-slate-500">Sin beca</span>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge variant={estudiante.estado_pago === 'completado' ? 'default' : 'secondary'}>
                              {estudiante.estado_pago}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="becas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Control de Becas y Descuentos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-4">Estudiantes con Beca</h3>
                  <div className="space-y-3">
                    {estudiantesFiltrados.filter(e => e.beca_aplicada).map((estudiante) => (
                      <div key={estudiante.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div>
                          <p className="font-medium">{estudiante.nombre_completo}</p>
                          <p className="text-sm text-slate-600">{estudiante.grado}</p>
                        </div>
                        <div className="text-right">
                          <Badge className="bg-green-100 text-green-800">{estudiante.beca_aplicada}</Badge>
                          <p className="text-sm text-slate-600">${estudiante.descuento_aplicado || 0}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-4">Estudiantes sin Beca</h3>
                  <div className="space-y-3">
                    {estudiantesFiltrados.filter(e => !e.beca_aplicada).slice(0, 10).map((estudiante) => (
                      <div key={estudiante.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-medium">{estudiante.nombre_completo}</p>
                          <p className="text-sm text-slate-600">{estudiante.grado}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline">Sin beca</Badge>
                          <p className="text-sm text-slate-600">${estudiante.monto_inscripcion || 0}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}