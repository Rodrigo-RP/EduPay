import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import { FileText, Plus, AlertTriangle, CheckCircle, Clock, DollarSign, Calendar, Users, CreditCard, Download, FileSpreadsheet } from "lucide-react";

export default function Cargos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    concepto: "",
    tipo_generacion: "automatica",
    nivel_academico: "todos",
    fecha_emision: "",
    fecha_vencimiento: "",
    aplicar_becas: true,
    incluir_recargos: false,
    conceptos_seleccionados: [] as string[]
  });

  // Datos demo de conceptos disponibles
  const conceptos = [
    { id: 1, nombre: "Colegiatura Mensual", tipo: "COLEGIATURA", monto: 500000, iva: false },
    { id: 2, nombre: "Inscripción Anual", tipo: "INSCRIPCION", monto: 800000, iva: false },
    { id: 3, nombre: "Materiales Didácticos", tipo: "MATERIAL", monto: 150000, iva: true },
    { id: 4, nombre: "Seguro Escolar", tipo: "SEGURO", monto: 50000, iva: false },
    { id: 5, nombre: "Actividades Extracurriculares", tipo: "ACTIVIDAD", monto: 200000, iva: true }
  ];

  // Mutación para generar cargos
  const generateChargesMutation = useMutation({
    mutationFn: async (formData: any) => {
      return await apiRequest("/api/charges/generate", { method: "POST", body: JSON.stringify(formData) });
    },
    onSuccess: () => {
      toast({
        title: "Cargos generados exitosamente",
        description: "Los cargos se han aplicado a los estudiantes seleccionados",
        variant: "default"
      });
      setGenerateModalOpen(false);
      setGenerateForm({
        concepto: "",
        tipo_generacion: "automatica",
        nivel_academico: "todos",
        fecha_emision: "",
        fecha_vencimiento: "",
        aplicar_becas: true,
        incluir_recargos: false,
        conceptos_seleccionados: []
      });
      queryClient.invalidateQueries({ queryKey: ['/api/charges'] });
    },
    onError: (error) => {
      toast({
        title: "Error al generar cargos",
        description: error.message || "Ocurrió un error al generar los cargos",
        variant: "destructive"
      });
    }
  });

  const handleGenerateCharges = () => {
    if (!generateForm.concepto || !generateForm.fecha_emision || !generateForm.fecha_vencimiento) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos obligatorios",
        variant: "destructive"
      });
      return;
    }

    generateChargesMutation.mutate(generateForm);
  };

  // Mutación para exportar cargos
  const exportChargesMutation = useMutation({
    mutationFn: async (format: 'excel' | 'csv') => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/charges/export?format=${format}&status=${selectedStatus}`, {
        method: "GET",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      return { blob: await response.blob(), format };
    },
    onSuccess: ({ blob, format }) => {
      // Create and download file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cargos_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Exportación exitosa",
        description: `Archivo ${format.toUpperCase()} descargado correctamente`,
        variant: "default"
      });
    },
    onError: (error) => {
      toast({
        title: "Error en exportación",
        description: error.message || "Error al exportar los datos",
        variant: "destructive"
      });
    }
  });

  const handleExportCharges = (format: 'excel' | 'csv') => {
    exportChargesMutation.mutate(format);
  };

  // Datos demo de cargos
  const cargos = [
    {
      id: 1,
      estudiante: "Carlos Pérez Méndez",
      concepto: "Colegiatura Enero",
      monto_base: 500000,
      beca_aplicada: 0,
      recargo: 0,
      total: 500000,
      fecha_emision: "2025-01-01",
      fecha_vencimiento: "2025-01-15",
      estado: "pendiente",
      tipo: "AUTOMATICA"
    },
    {
      id: 2,
      estudiante: "Andrea García Luna",
      concepto: "Materiales Didácticos",
      monto_base: 150000,
      beca_aplicada: 10,
      recargo: 0,
      total: 135000,
      fecha_emision: "2025-01-10",
      fecha_vencimiento: "2025-01-20",
      estado: "pendiente",
      tipo: "MANUAL"
    },
    {
      id: 3,
      estudiante: "Luis Martínez Gil",
      concepto: "Colegiatura Diciembre",
      monto_base: 500000,
      beca_aplicada: 0,
      recargo: 25000,
      total: 525000,
      fecha_emision: "2024-12-01",
      fecha_vencimiento: "2024-12-15",
      estado: "vencido",
      tipo: "AUTOMATICA"
    },
    {
      id: 4,
      estudiante: "María Rodríguez Soto",
      concepto: "Inscripción Anual",
      monto_base: 800000,
      beca_aplicada: 20,
      recargo: 0,
      total: 640000,
      fecha_emision: "2024-12-20",
      fecha_vencimiento: "2025-01-31",
      estado: "pagado",
      tipo: "MANUAL"
    }
  ];

  // Filtrar cargos según el estado seleccionado
  const filteredCargos = selectedStatus === "all" 
    ? cargos 
    : cargos.filter(cargo => cargo.estado === selectedStatus);

  // Estadísticas
  const estadisticas = {
    total: cargos.length,
    pendientes: cargos.filter(c => c.estado === "pendiente").length,
    vencidos: cargos.filter(c => c.estado === "vencido").length,
    pagados: cargos.filter(c => c.estado === "pagado").length,
    montoTotal: cargos
      .filter(c => c.estado === "pendiente" || c.estado === "vencido")
      .reduce((sum, c) => sum + c.total, 0)
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "pendiente":
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case "vencido":
        return <Badge className="bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Vencido</Badge>;
      case "pagado":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Pagado</Badge>;
      default:
        return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  const isVencido = (fechaVencimiento: string) => {
    return new Date(fechaVencimiento) < new Date();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Cargos</h1>
          <p className="text-slate-600">Administra cargos automáticos, manuales y extraordinarios</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={generateModalOpen} onOpenChange={setGenerateModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 mr-2" />
                Generar Cargos
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Generar Cargos</DialogTitle>
                <DialogDescription>
                  Configura la generación automática de cargos para estudiantes seleccionados
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="concepto">Concepto *</Label>
                    <Select 
                      value={generateForm.concepto} 
                      onValueChange={(value) => setGenerateForm({...generateForm, concepto: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un concepto" />
                      </SelectTrigger>
                      <SelectContent>
                        {conceptos.map((concepto) => (
                          <SelectItem key={concepto.id} value={concepto.nombre}>
                            {concepto.nombre} - ${(concepto.monto / 100).toLocaleString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="tipo_generacion">Tipo de Generación</Label>
                    <Select 
                      value={generateForm.tipo_generacion} 
                      onValueChange={(value) => setGenerateForm({...generateForm, tipo_generacion: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="automatica">Automática</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="extraordinaria">Extraordinaria</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nivel_academico">Nivel Académico</Label>
                  <Select 
                    value={generateForm.nivel_academico} 
                    onValueChange={(value) => setGenerateForm({...generateForm, nivel_academico: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los niveles</SelectItem>
                      <SelectItem value="kinder">Kinder</SelectItem>
                      <SelectItem value="primaria">Primaria</SelectItem>
                      <SelectItem value="secundaria">Secundaria</SelectItem>
                      <SelectItem value="bachillerato">Bachillerato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fecha_emision">Fecha de Emisión *</Label>
                    <Input 
                      id="fecha_emision"
                      type="date"
                      value={generateForm.fecha_emision}
                      onChange={(e) => setGenerateForm({...generateForm, fecha_emision: e.target.value})}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="fecha_vencimiento">Fecha de Vencimiento *</Label>
                    <Input 
                      id="fecha_vencimiento"
                      type="date"
                      value={generateForm.fecha_vencimiento}
                      onChange={(e) => setGenerateForm({...generateForm, fecha_vencimiento: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="aplicar_becas"
                      checked={generateForm.aplicar_becas}
                      onCheckedChange={(checked) => setGenerateForm({...generateForm, aplicar_becas: !!checked})}
                    />
                    <Label htmlFor="aplicar_becas">Aplicar becas automáticamente</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="incluir_recargos"
                      checked={generateForm.incluir_recargos}
                      onCheckedChange={(checked) => setGenerateForm({...generateForm, incluir_recargos: !!checked})}
                    />
                    <Label htmlFor="incluir_recargos">Incluir recargos por mora</Label>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Resumen de Aplicación
                  </h3>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p>• Concepto: {generateForm.concepto || "Sin seleccionar"}</p>
                    <p>• Tipo: {generateForm.tipo_generacion}</p>
                    <p>• Nivel: {generateForm.nivel_academico}</p>
                    <p>• Becas: {generateForm.aplicar_becas ? "Sí" : "No"}</p>
                    <p>• Recargos: {generateForm.incluir_recargos ? "Sí" : "No"}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setGenerateModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleGenerateCharges}
                    disabled={generateChargesMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {generateChargesMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Generando...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Generar Cargos
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exportChargesMutation.isPending}>
                {exportChargesMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Exportar
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExportCharges('excel')}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportCharges('csv')}>
                <FileText className="w-4 h-4 mr-2" />
                Exportar CSV (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.total}</div>
            <div className="text-sm text-slate-600">Total cargos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.pendientes}</div>
            <div className="text-sm text-slate-600">Pendientes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.vencidos}</div>
            <div className="text-sm text-slate-600">Vencidos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.pagados}</div>
            <div className="text-sm text-slate-600">Pagados</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">${(estadisticas.montoTotal / 100).toLocaleString()}</div>
            <div className="text-sm text-slate-600">Monto pendiente</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lista" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lista">Lista de cargos</TabsTrigger>
          <TabsTrigger value="generacion">Generación automática</TabsTrigger>
          <TabsTrigger value="extraordinarios">Cargos extraordinarios</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Lista de cargos</CardTitle>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pendiente">Pendientes</SelectItem>
                    <SelectItem value="vencido">Vencidos</SelectItem>
                    <SelectItem value="pagado">Pagados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredCargos.map((cargo) => (
                  <div key={cargo.id} className={`p-4 border rounded-lg ${isVencido(cargo.fecha_vencimiento) && cargo.estado === 'pendiente' ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{cargo.estudiante}</h3>
                          {getStatusBadge(cargo.estado)}
                          <Badge variant="outline" className="text-xs">
                            {cargo.tipo}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600">{cargo.concepto}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                          <span>Emitido: {cargo.fecha_emision}</span>
                          <span>Vence: {cargo.fecha_vencimiento}</span>
                          {cargo.beca_aplicada > 0 && (
                            <span className="text-green-600">Beca: {cargo.beca_aplicada}%</span>
                          )}
                          {cargo.recargo > 0 && (
                            <span className="text-red-600">Recargo: ${(cargo.recargo / 100).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          ${(cargo.total / 100).toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500">
                          Base: ${(cargo.monto_base / 100).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generacion">
          <Card>
            <CardHeader>
              <CardTitle>Generación automática de cargos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Período a generar</Label>
                    <Select defaultValue="2025-02">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2025-02">Febrero 2025</SelectItem>
                        <SelectItem value="2025-03">Marzo 2025</SelectItem>
                        <SelectItem value="2025-04">Abril 2025</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Conceptos a generar</Label>
                    <Select defaultValue="colegiaturas">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="colegiaturas">Solo colegiaturas</SelectItem>
                        <SelectItem value="todos">Todos los conceptos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Previsualizar generación
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700">
                    Generar cargos
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extraordinarios">
          <Card>
            <CardHeader>
              <CardTitle>Crear cargo extraordinario</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Concepto</Label>
                  <Input placeholder="Excursión, Material especial, etc." />
                </div>
                <div>
                  <Label>Monto (MXN)</Label>
                  <Input type="number" placeholder="500" />
                </div>
                <div>
                  <Label>Aplicar a</Label>
                  <Select defaultValue="todos">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los alumnos</SelectItem>
                      <SelectItem value="grado">Por grado</SelectItem>
                      <SelectItem value="grupo">Por grupo específico</SelectItem>
                      <SelectItem value="individual">Alumno individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha de vencimiento</Label>
                  <Input type="date" />
                </div>
              </div>
              <div className="mt-4">
                <Label>Descripción</Label>
                <textarea 
                  className="w-full p-2 border rounded"
                  rows={3}
                  placeholder="Detalles del cargo extraordinario..."
                />
              </div>
              <Button className="mt-4 bg-purple-600 hover:bg-purple-700">
                Crear cargo extraordinario
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}