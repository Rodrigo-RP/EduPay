import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar, Settings, Plus, Edit, Trash2, Percent, Clock, DollarSign } from "lucide-react";

interface Concepto {
  id: number;
  nombre: string;
  tipo: string;
  periodicidad: string;
  monto_centavos: number;
  iva: boolean;
}

interface FechaVencimiento {
  id?: number;
  concepto_id: number;
  concepto_nombre: string;
  dia_vencimiento: number;
  meses_aplicacion: string[];
  activo: boolean;
}

interface ReglaRecargo {
  id?: number;
  concepto_id: number;
  concepto_nombre: string;
  dias_gracia: number;
  porcentaje_recargo: number;
  monto_fijo: string | number;
  tipo_calculo: 'porcentaje_fijo' | 'porcentaje_diario' | 'monto_fijo';
  activo: boolean;
}

const MESES = [
  { value: 'enero', label: 'Enero' },
  { value: 'febrero', label: 'Febrero' },
  { value: 'marzo', label: 'Marzo' },
  { value: 'abril', label: 'Abril' },
  { value: 'mayo', label: 'Mayo' },
  { value: 'junio', label: 'Junio' },
  { value: 'julio', label: 'Julio' },
  { value: 'agosto', label: 'Agosto' },
  { value: 'septiembre', label: 'Septiembre' },
  { value: 'octubre', label: 'Octubre' },
  { value: 'noviembre', label: 'Noviembre' },
  { value: 'diciembre', label: 'Diciembre' }
];

const CATEGORIAS_CONCEPTOS = {
  'colegiatura': { label: 'Colegiaturas', color: 'bg-blue-100 text-blue-700' },
  'inscripcion': { label: 'Inscripción', color: 'bg-green-100 text-green-700' },
  'reinscripcion': { label: 'Reinscripción', color: 'bg-purple-100 text-purple-700' },
  'seguro': { label: 'Seguro Escolar', color: 'bg-orange-100 text-orange-700' },
  'libros': { label: 'Libros', color: 'bg-yellow-100 text-yellow-700' },
  'extra': { label: 'Otros', color: 'bg-gray-100 text-gray-700' }
};

export default function ConfiguracionPagosCompleta() {
  const [activeTab, setActiveTab] = useState("fechas");
  const [showFechaModal, setShowFechaModal] = useState(false);
  const [showRecargoModal, setShowRecargoModal] = useState(false);
  const [showConceptoModal, setShowConceptoModal] = useState(false);
  const [editingFecha, setEditingFecha] = useState<FechaVencimiento | null>(null);
  const [editingRecargo, setEditingRecargo] = useState<ReglaRecargo | null>(null);
  
  const [nuevaFecha, setNuevaFecha] = useState({
    concepto_id: 0,
    dia_vencimiento: 1,
    meses_aplicacion: [] as string[],
    activo: true
  });

  const [nuevoRecargo, setNuevoRecargo] = useState({
    concepto_id: 0,
    dias_gracia: 0,
    porcentaje_recargo: 0,
    monto_fijo: '',
    tipo_calculo: 'porcentaje_fijo' as 'porcentaje_fijo' | 'porcentaje_diario' | 'monto_fijo',
    activo: true
  });

  const [nuevoConcepto, setNuevoConcepto] = useState({
    nombre: '',
    tipo: 'extra',
    periodicidad: 'mensual',
    monto: 0,
    iva: true
  });

  const [aplicaTodosMeses, setAplicaTodosMeses] = useState(true);

  // Fetch conceptos existentes
  const { data: conceptos = [] } = useQuery({
    queryKey: ["/api/concepts"],
    select: (data: Concepto[]) => data
  });

  // Fetch fechas de vencimiento configuradas
  const { data: fechasVencimiento = [], refetch: refetchFechas } = useQuery({
    queryKey: ["/api/payment-config/due-dates-complete"],
    select: (data: FechaVencimiento[]) => data
  });

  // Fetch reglas de recargo configuradas
  const { data: reglasRecargo = [], refetch: refetchRecargos } = useQuery({
    queryKey: ["/api/payment-config/surcharge-rules-complete"],
    select: (data: ReglaRecargo[]) => data
  });

  // Mutation para crear/actualizar fechas
  const saveFechaMutation = useMutation({
    mutationFn: async (data: any) => {
      const endpoint = editingFecha 
        ? `/api/payment-config/due-dates-complete/${editingFecha.id}`
        : "/api/payment-config/due-dates-complete";
      
      return apiRequest(endpoint, {
        method: editingFecha ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      refetchFechas();
      setShowFechaModal(false);
      setEditingFecha(null);
      resetFechaForm();
      toast({
        title: editingFecha ? "Fecha actualizada" : "Fecha creada",
        description: "La configuración se ha guardado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para crear/actualizar recargos
  const saveRecargoMutation = useMutation({
    mutationFn: async (data: any) => {
      const endpoint = editingRecargo 
        ? `/api/payment-config/surcharge-rules-complete/${editingRecargo.id}`
        : "/api/payment-config/surcharge-rules-complete";
      
      return apiRequest(endpoint, {
        method: editingRecargo ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      refetchRecargos();
      setShowRecargoModal(false);
      setEditingRecargo(null);
      resetRecargoForm();
      toast({
        title: editingRecargo ? "Regla actualizada" : "Regla creada",
        description: "La configuración se ha guardado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para crear conceptos
  const saveConceptoMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/concepts", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          monto_centavos: Math.round(data.monto * 100)
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/concepts"] });
      setShowConceptoModal(false);
      resetConceptoForm();
      toast({
        title: "Concepto creado",
        description: "El nuevo concepto se ha creado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para eliminar fecha
  const deleteFechaMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/payment-config/due-dates-complete/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      refetchFechas();
      toast({
        title: "Fecha eliminada",
        description: "La configuración se ha eliminado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation para eliminar regla de recargo
  const deleteRecargoMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/payment-config/surcharge-rules-complete/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      refetchRecargos();
      toast({
        title: "Regla eliminada",
        description: "La configuración se ha eliminado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetFechaForm = () => {
    setNuevaFecha({
      concepto_id: 0,
      dia_vencimiento: 1,
      meses_aplicacion: [],
      activo: true
    });
    setAplicaTodosMeses(true);
  };

  const resetRecargoForm = () => {
    setNuevoRecargo({
      concepto_id: 0,
      dias_gracia: 0,
      porcentaje_recargo: 0,
      monto_fijo: '',
      tipo_calculo: 'porcentaje_fijo',
      activo: true
    });
  };

  const resetConceptoForm = () => {
    setNuevoConcepto({
      nombre: '',
      tipo: 'extra',
      periodicidad: 'mensual',
      monto: 0,
      iva: true
    });
  };

  const handleEditFecha = (fecha: FechaVencimiento) => {
    setEditingFecha(fecha);
    setNuevaFecha({
      concepto_id: fecha.concepto_id,
      dia_vencimiento: fecha.dia_vencimiento,
      meses_aplicacion: fecha.meses_aplicacion,
      activo: fecha.activo
    });
    setAplicaTodosMeses(fecha.meses_aplicacion.length === 12);
    setShowFechaModal(true);
  };

  const handleEditRecargo = (recargo: ReglaRecargo) => {
    setEditingRecargo(recargo);
    setNuevoRecargo({
      concepto_id: recargo.concepto_id,
      dias_gracia: recargo.dias_gracia,
      porcentaje_recargo: recargo.porcentaje_recargo,
      monto_fijo: typeof recargo.monto_fijo === 'number' ? recargo.monto_fijo.toString() : recargo.monto_fijo || '',
      tipo_calculo: recargo.tipo_calculo,
      activo: recargo.activo
    });
    setShowRecargoModal(true);
  };

  const handleMesesChange = (mes: string, checked: boolean) => {
    if (checked) {
      setNuevaFecha(prev => ({
        ...prev,
        meses_aplicacion: [...prev.meses_aplicacion, mes]
      }));
    } else {
      setNuevaFecha(prev => ({
        ...prev,
        meses_aplicacion: prev.meses_aplicacion.filter(m => m !== mes)
      }));
    }
  };

  const handleTodosMesesChange = (checked: boolean) => {
    setAplicaTodosMeses(checked);
    if (checked) {
      setNuevaFecha(prev => ({
        ...prev,
        meses_aplicacion: MESES.map(m => m.value)
      }));
    } else {
      setNuevaFecha(prev => ({
        ...prev,
        meses_aplicacion: []
      }));
    }
  };

  const handleGuardarFecha = () => {
    if (nuevaFecha.concepto_id === 0) {
      toast({
        title: "Error",
        description: "Selecciona un concepto",
        variant: "destructive",
      });
      return;
    }

    if (nuevaFecha.meses_aplicacion.length === 0) {
      toast({
        title: "Error",
        description: "Selecciona al menos un mes",
        variant: "destructive",
      });
      return;
    }

    saveFechaMutation.mutate(nuevaFecha);
  };

  const handleGuardarRecargo = () => {
    if (nuevoRecargo.concepto_id === 0) {
      toast({
        title: "Error",
        description: "Selecciona un concepto",
        variant: "destructive",
      });
      return;
    }

    if (nuevoRecargo.tipo_calculo === 'monto_fijo') {
      const montoNumerico = parseFloat(nuevoRecargo.monto_fijo.toString());
      if (!nuevoRecargo.monto_fijo || isNaN(montoNumerico) || montoNumerico <= 0) {
        toast({
          title: "Error",
          description: "Ingresa un monto fijo válido mayor a 0",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (nuevoRecargo.porcentaje_recargo <= 0) {
        toast({
          title: "Error",
          description: "El porcentaje de recargo debe ser mayor a 0",
          variant: "destructive",
        });
        return;
      }
    }

    saveRecargoMutation.mutate(nuevoRecargo);
  };

  const handleGuardarConcepto = () => {
    if (!nuevoConcepto.nombre.trim()) {
      toast({
        title: "Error",
        description: "Ingresa el nombre del concepto",
        variant: "destructive",
      });
      return;
    }

    if (nuevoConcepto.monto <= 0) {
      toast({
        title: "Error",
        description: "El monto debe ser mayor a 0",
        variant: "destructive",
      });
      return;
    }

    saveConceptoMutation.mutate(nuevoConcepto);
  };

  const getConceptoInfo = (conceptoId: number) => {
    return conceptos.find(c => c.id === conceptoId);
  };

  const formatMonto = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(centavos / 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Configuración de Pagos</h1>
          <p className="text-slate-600 mt-2">
            Administra fechas de vencimiento, reglas de recargo y conceptos de pago
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="fechas" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Fechas de Vencimiento
          </TabsTrigger>
          <TabsTrigger value="recargos" className="flex items-center gap-2">
            <Percent className="w-4 h-4" />
            Reglas de Recargo
          </TabsTrigger>
          <TabsTrigger value="conceptos" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Conceptos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fechas" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Fechas de Vencimiento</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Define cuándo vencen los diferentes conceptos de pago
                </p>
              </div>
              <Dialog open={showFechaModal} onOpenChange={setShowFechaModal}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    resetFechaForm();
                    setEditingFecha(null);
                  }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Fecha
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingFecha ? 'Editar Fecha de Vencimiento' : 'Nueva Fecha de Vencimiento'}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="concepto">Concepto</Label>
                      <Select 
                        value={nuevaFecha.concepto_id.toString()} 
                        onValueChange={(value) => setNuevaFecha(prev => ({ ...prev, concepto_id: parseInt(value) }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un concepto" />
                        </SelectTrigger>
                        <SelectContent>
                          {conceptos.map((concepto) => (
                            <SelectItem key={concepto.id} value={concepto.id.toString()}>
                              <div className="flex items-center gap-2">
                                <Badge className={CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.color || 'bg-gray-100 text-gray-700'}>
                                  {CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.label || concepto.tipo}
                                </Badge>
                                {concepto.nombre}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dia">Día de Vencimiento</Label>
                      <Input
                        id="dia"
                        type="number"
                        min="1"
                        max="31"
                        value={nuevaFecha.dia_vencimiento}
                        onChange={(e) => setNuevaFecha(prev => ({ ...prev, dia_vencimiento: parseInt(e.target.value) || 1 }))}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="todos-meses"
                          checked={aplicaTodosMeses}
                          onCheckedChange={handleTodosMesesChange}
                        />
                        <Label htmlFor="todos-meses" className="font-medium">
                          Aplicar a todos los meses del año
                        </Label>
                      </div>

                      {!aplicaTodosMeses && (
                        <div className="space-y-2">
                          <Label>Meses específicos</Label>
                          <div className="grid grid-cols-3 gap-2">
                            {MESES.map((mes) => (
                              <div key={mes.value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={mes.value}
                                  checked={nuevaFecha.meses_aplicacion.includes(mes.value)}
                                  onCheckedChange={(checked) => handleMesesChange(mes.value, checked as boolean)}
                                />
                                <Label htmlFor={mes.value} className="text-sm">
                                  {mes.label}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="activo-fecha"
                        checked={nuevaFecha.activo}
                        onCheckedChange={(checked) => setNuevaFecha(prev => ({ ...prev, activo: checked }))}
                      />
                      <Label htmlFor="activo-fecha">Activo</Label>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button onClick={handleGuardarFecha} disabled={saveFechaMutation.isPending}>
                        {saveFechaMutation.isPending ? "Guardando..." : "Guardar"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowFechaModal(false);
                          setEditingFecha(null);
                          resetFechaForm();
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {fechasVencimiento.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No hay fechas de vencimiento configuradas</p>
                  </div>
                ) : (
                  fechasVencimiento.map((fecha) => {
                    const concepto = getConceptoInfo(fecha.concepto_id);
                    return (
                      <Card key={fecha.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                {concepto && (
                                  <Badge className={CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.color || 'bg-gray-100 text-gray-700'}>
                                    {CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.label || concepto.tipo}
                                  </Badge>
                                )}
                                <span className="font-medium">{fecha.concepto_nombre}</span>
                                <Badge variant={fecha.activo ? "default" : "secondary"}>
                                  {fecha.activo ? "Activo" : "Inactivo"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  Día {fecha.dia_vencimiento} de cada mes
                                </div>
                                <div>
                                  Meses: {fecha.meses_aplicacion.length === 12 ? 'Todos' : fecha.meses_aplicacion.length}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditFecha(fecha)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fecha.id && deleteFechaMutation.mutate(fecha.id)}
                              disabled={deleteFechaMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recargos" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Reglas de Recargo</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Define porcentajes de recargo por pagos tardíos
                </p>
              </div>
              <Dialog open={showRecargoModal} onOpenChange={setShowRecargoModal}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    resetRecargoForm();
                    setEditingRecargo(null);
                  }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Regla
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingRecargo ? 'Editar Regla de Recargo' : 'Nueva Regla de Recargo'}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="concepto-recargo">Concepto</Label>
                      <Select 
                        value={nuevoRecargo.concepto_id.toString()} 
                        onValueChange={(value) => setNuevoRecargo(prev => ({ ...prev, concepto_id: parseInt(value) }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un concepto" />
                        </SelectTrigger>
                        <SelectContent>
                          {conceptos.map((concepto) => (
                            <SelectItem key={concepto.id} value={concepto.id.toString()}>
                              <div className="flex items-center gap-2">
                                <Badge className={CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.color || 'bg-gray-100 text-gray-700'}>
                                  {CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.label || concepto.tipo}
                                </Badge>
                                {concepto.nombre}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dias-gracia">Días de Gracia</Label>
                      <Input
                        id="dias-gracia"
                        type="number"
                        min="0"
                        value={nuevoRecargo.dias_gracia}
                        onChange={(e) => setNuevoRecargo(prev => ({ ...prev, dias_gracia: parseInt(e.target.value) || 0 }))}
                        placeholder="Días sin recargo después del vencimiento"
                      />
                    </div>

                    {nuevoRecargo.tipo_calculo !== 'monto_fijo' ? (
                      <div className="space-y-2">
                        <Label htmlFor="porcentaje">Porcentaje de Recargo (%)</Label>
                        <Input
                          id="porcentaje"
                          type="number"
                          min="0"
                          step="0.01"
                          value={nuevoRecargo.porcentaje_recargo}
                          onChange={(e) => setNuevoRecargo(prev => ({ ...prev, porcentaje_recargo: parseFloat(e.target.value) || 0 }))}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="monto-fijo">Monto Fijo ($)</Label>
                        <Input
                          id="monto-fijo"
                          type="text"
                          value={nuevoRecargo.monto_fijo}
                          onChange={(e) => {
                            const valor = e.target.value;
                            // Permitir solo números, punto decimal y texto vacío
                            if (valor === '' || /^\d*\.?\d*$/.test(valor)) {
                              setNuevoRecargo(prev => ({ 
                                ...prev, 
                                monto_fijo: valor
                              }));
                            }
                          }}
                          placeholder="Ingresa la cantidad (ej: 500, 150.50)"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="tipo-calculo">Tipo de Cálculo</Label>
                      <Select 
                        value={nuevoRecargo.tipo_calculo} 
                        onValueChange={(value) => setNuevoRecargo(prev => ({ ...prev, tipo_calculo: value as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="porcentaje_fijo">Porcentaje Fijo</SelectItem>
                          <SelectItem value="porcentaje_diario">Porcentaje por Día</SelectItem>
                          <SelectItem value="monto_fijo">Monto Fijo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="activo-recargo"
                        checked={nuevoRecargo.activo}
                        onCheckedChange={(checked) => setNuevoRecargo(prev => ({ ...prev, activo: checked }))}
                      />
                      <Label htmlFor="activo-recargo">Activo</Label>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button onClick={handleGuardarRecargo} disabled={saveRecargoMutation.isPending}>
                        {saveRecargoMutation.isPending ? "Guardando..." : "Guardar"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowRecargoModal(false);
                          setEditingRecargo(null);
                          resetRecargoForm();
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reglasRecargo.length === 0 ? (
                  <div className="text-center py-8">
                    <Percent className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No hay reglas de recargo configuradas</p>
                  </div>
                ) : (
                  reglasRecargo.map((regla) => {
                    const concepto = getConceptoInfo(regla.concepto_id);
                    return (
                      <Card key={regla.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                {concepto && (
                                  <Badge className={CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.color || 'bg-gray-100 text-gray-700'}>
                                    {CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.label || concepto.tipo}
                                  </Badge>
                                )}
                                <span className="font-medium">{regla.concepto_nombre}</span>
                                <Badge variant={regla.activo ? "default" : "secondary"}>
                                  {regla.activo ? "Activo" : "Inactivo"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                                <div>
                                  Gracia: {regla.dias_gracia} días
                                </div>
                                <div>
                                  {regla.tipo_calculo === 'monto_fijo' 
                                    ? `Recargo: ${formatMonto((parseFloat(regla.monto_fijo.toString()) || 0) * 100)}`
                                    : `Recargo: ${regla.porcentaje_recargo}%`
                                  }
                                </div>
                                <div>
                                  Tipo: {regla.tipo_calculo.replace('_', ' ').replace('porcentaje', 'Porcentaje').replace('monto', 'Monto')}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditRecargo(regla)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => regla.id && deleteRecargoMutation.mutate(regla.id)}
                              disabled={deleteRecargoMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conceptos" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Conceptos de Pago</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Administra los conceptos disponibles para configurar pagos
                </p>
              </div>
              <Dialog open={showConceptoModal} onOpenChange={setShowConceptoModal}>
                <DialogTrigger asChild>
                  <Button onClick={resetConceptoForm}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Concepto
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Crear Nuevo Concepto</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="nombre-concepto">Nombre del Concepto</Label>
                      <Input
                        id="nombre-concepto"
                        value={nuevoConcepto.nombre}
                        onChange={(e) => setNuevoConcepto(prev => ({ ...prev, nombre: e.target.value }))}
                        placeholder="Ej. Uniforme, Material didáctico..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tipo-concepto">Categoría</Label>
                      <Select 
                        value={nuevoConcepto.tipo} 
                        onValueChange={(value) => setNuevoConcepto(prev => ({ ...prev, tipo: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORIAS_CONCEPTOS).map(([key, value]) => (
                            <SelectItem key={key} value={key}>
                              {value.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="periodicidad-concepto">Periodicidad</Label>
                      <Select 
                        value={nuevoConcepto.periodicidad} 
                        onValueChange={(value) => setNuevoConcepto(prev => ({ ...prev, periodicidad: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mensual">Mensual</SelectItem>
                          <SelectItem value="anual">Anual</SelectItem>
                          <SelectItem value="eventual">Eventual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="monto-concepto">Monto ($)</Label>
                      <Input
                        id="monto-concepto"
                        type="number"
                        min="0"
                        step="0.01"
                        value={nuevoConcepto.monto}
                        onChange={(e) => setNuevoConcepto(prev => ({ ...prev, monto: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="iva-concepto"
                        checked={nuevoConcepto.iva}
                        onCheckedChange={(checked) => setNuevoConcepto(prev => ({ ...prev, iva: checked }))}
                      />
                      <Label htmlFor="iva-concepto">Incluye IVA</Label>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button onClick={handleGuardarConcepto} disabled={saveConceptoMutation.isPending}>
                        {saveConceptoMutation.isPending ? "Creando..." : "Crear"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowConceptoModal(false);
                          resetConceptoForm();
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {Object.entries(
                  conceptos.reduce((acc, concepto) => {
                    const categoria = CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.label || concepto.tipo;
                    if (!acc[categoria]) {
                      acc[categoria] = [];
                    }
                    acc[categoria].push(concepto);
                    return acc;
                  }, {} as Record<string, Concepto[]>)
                ).map(([categoria, conceptosCategoria]) => (
                  <Card key={categoria}>
                    <CardHeader>
                      <CardTitle className="text-lg">{categoria}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {conceptosCategoria.map((concepto) => (
                          <div key={concepto.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div>
                                <div className="font-medium">{concepto.nombre}</div>
                                <div className="text-sm text-slate-600">
                                  {concepto.periodicidad} • {formatMonto(concepto.monto_centavos)}
                                  {concepto.iva && " (+ IVA)"}
                                </div>
                              </div>
                            </div>
                            <Badge className={CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.color || 'bg-gray-100 text-gray-700'}>
                              {CATEGORIAS_CONCEPTOS[concepto.tipo as keyof typeof CATEGORIAS_CONCEPTOS]?.label || concepto.tipo}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}