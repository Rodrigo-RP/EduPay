import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Clock, Percent, DollarSign, AlertTriangle, CheckCircle2, Settings, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface FechaVencimiento {
  id: number;
  concepto: string;
  dia_vencimiento: number;
  mes_aplicacion: string;
  activo: boolean;
  campus_id?: number;
  created_at?: string;
  updated_at?: string;
}

interface ReglaRecargo {
  id: number;
  nombre: string;
  tipo: 'porcentaje' | 'fijo' | 'progresivo';
  dias_gracia: number;
  porcentaje?: number;
  monto_fijo_centavos?: number;
  reglas_progresivas?: string;
  aplica_fines_semana: boolean;
  aplica_festivos: boolean;
  monto_maximo_centavos?: number;
  activo: boolean;
  campus_id?: number;
  created_at?: string;
  updated_at?: string;
}

export default function ConfiguracionPagos() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showFechaModal, setShowFechaModal] = useState(false);
  const [showRecargoModal, setShowRecargoModal] = useState(false);
  const [editingFecha, setEditingFecha] = useState<FechaVencimiento | null>(null);
  const [editingRecargo, setEditingRecargo] = useState<ReglaRecargo | null>(null);

  // Fetch fechas de vencimiento desde la API
  const { data: fechasVencimiento = [], isLoading: loadingFechas } = useQuery({
    queryKey: ["/api/payment-config/due-dates"],
    enabled: !!user?.campus_id,
  });

  // Fetch reglas de recargo desde la API
  const { data: reglasRecargo = [], isLoading: loadingReglas } = useQuery({
    queryKey: ["/api/payment-config/surcharge-rules"],
    enabled: !!user?.campus_id,
  });

  // Mutations para fechas de vencimiento
  const createFechaMutation = useMutation({
    mutationFn: (data: Omit<FechaVencimiento, 'id'>) => apiRequest("/api/payment-config/due-dates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/due-dates"] });
      setShowFechaModal(false);
      toast({
        title: "Fecha actualizada",
        description: "La configuración de vencimiento se actualizó correctamente",
      });
    },
  });

  const updateFechaMutation = useMutation({
    mutationFn: ({ id, ...data }: FechaVencimiento) => apiRequest(`/api/payment-config/due-dates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/due-dates"] });
      setShowFechaModal(false);
      toast({
        title: "Fecha actualizada",
        description: "La configuración de vencimiento se actualizó correctamente",
      });
    },
  });

  const deleteFechaMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/payment-config/due-dates/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/due-dates"] });
      toast({
        title: "Fecha eliminada",
        description: "La configuración de vencimiento se eliminó correctamente",
      });
    },
  });

  // Mutations para reglas de recargo
  const createReglaMutation = useMutation({
    mutationFn: (data: Omit<ReglaRecargo, 'id'>) => apiRequest("/api/payment-config/surcharge-rules", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/surcharge-rules"] });
      setShowRecargoModal(false);
      toast({
        title: "Regla actualizada",
        description: "La configuración de recargo se actualizó correctamente",
      });
    },
  });

  const updateReglaMutation = useMutation({
    mutationFn: ({ id, ...data }: ReglaRecargo) => apiRequest(`/api/payment-config/surcharge-rules/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/surcharge-rules"] });
      setShowRecargoModal(false);
      toast({
        title: "Regla actualizada",
        description: "La configuración de recargo se actualizó correctamente",
      });
    },
  });

  const deleteReglaMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/payment-config/surcharge-rules/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/surcharge-rules"] });
      toast({
        title: "Regla eliminada",
        description: "La configuración de recargo se eliminó correctamente",
      });
    },
  });

  const [nuevaFecha, setNuevaFecha] = useState({
    concepto: "",
    dia_vencimiento: "",
    mes_aplicacion: [] as string[]
  });

  const [nuevoRecargo, setNuevoRecargo] = useState({
    nombre: "",
    tipo: "porcentaje",
    dias_gracia: "",
    porcentaje: "",
    monto_fijo: "",
    aplica_fines_semana: false,
    aplica_festivos: false,
    monto_maximo: ""
  });

  const handleGuardarFecha = () => {
    if (!nuevaFecha.concepto || !nuevaFecha.dia_vencimiento || nuevaFecha.mes_aplicacion.length === 0) {
      toast({
        title: "Error",
        description: "Completa todos los campos requeridos y selecciona al menos un mes",
        variant: "destructive"
      });
      return;
    }

    const fecha: FechaVencimiento = {
      id: Date.now().toString(),
      concepto: nuevaFecha.concepto,
      dia_vencimiento: parseInt(nuevaFecha.dia_vencimiento),
      mes_aplicacion: nuevaFecha.mes_aplicacion.includes("todos") 
        ? "todos" 
        : nuevaFecha.mes_aplicacion,
      activo: true
    };

    if (editingFecha) {
      setFechasVencimiento(prev => 
        prev.map(f => f.id === editingFecha.id ? { ...fecha, id: editingFecha.id } : f)
      );
      toast({
        title: "Fecha actualizada",
        description: "La configuración de vencimiento se actualizó correctamente"
      });
    } else {
      setFechasVencimiento(prev => [...prev, fecha]);
      toast({
        title: "Fecha creada",
        description: "Nueva fecha de vencimiento configurada"
      });
    }

    setNuevaFecha({ concepto: "", dia_vencimiento: "", mes_aplicacion: [] });
    setEditingFecha(null);
    setShowFechaModal(false);
  };

  const handleGuardarRecargo = () => {
    if (!nuevoRecargo.nombre || !nuevoRecargo.dias_gracia) {
      toast({
        title: "Error", 
        description: "Completa todos los campos requeridos",
        variant: "destructive"
      });
      return;
    }

    if (nuevoRecargo.tipo === 'porcentaje' && !nuevoRecargo.porcentaje) {
      toast({
        title: "Error",
        description: "Especifica el porcentaje de recargo",
        variant: "destructive"
      });
      return;
    }

    if (nuevoRecargo.tipo === 'fijo' && !nuevoRecargo.monto_fijo) {
      toast({
        title: "Error",
        description: "Especifica el monto fijo de recargo",
        variant: "destructive"
      });
      return;
    }

    const recargo: ReglaRecargo = {
      id: Date.now().toString(),
      nombre: nuevoRecargo.nombre,
      tipo: nuevoRecargo.tipo as any,
      dias_gracia: parseInt(nuevoRecargo.dias_gracia),
      porcentaje: nuevoRecargo.porcentaje ? parseFloat(nuevoRecargo.porcentaje) : undefined,
      monto_fijo: nuevoRecargo.monto_fijo ? parseInt(nuevoRecargo.monto_fijo) * 100 : undefined,
      aplica_fines_semana: nuevoRecargo.aplica_fines_semana,
      aplica_festivos: nuevoRecargo.aplica_festivos,
      monto_maximo: nuevoRecargo.monto_maximo ? parseInt(nuevoRecargo.monto_maximo) * 100 : undefined,
      activo: true
    };

    if (editingRecargo) {
      setReglasRecargo(prev => 
        prev.map(r => r.id === editingRecargo.id ? { ...recargo, id: editingRecargo.id } : r)
      );
      toast({
        title: "Regla actualizada",
        description: "La regla de recargo se actualizó correctamente"
      });
    } else {
      setReglasRecargo(prev => [...prev, recargo]);
      toast({
        title: "Regla creada",
        description: "Nueva regla de recargo configurada"
      });
    }

    setNuevoRecargo({
      nombre: "",
      tipo: "porcentaje",
      dias_gracia: "",
      porcentaje: "",
      monto_fijo: "",
      aplica_fines_semana: false,
      aplica_festivos: false,
      monto_maximo: ""
    });
    setEditingRecargo(null);
    setShowRecargoModal(false);
  };

  const handleEditarFecha = (fecha: FechaVencimiento) => {
    setEditingFecha(fecha);
    setNuevaFecha({
      concepto: fecha.concepto,
      dia_vencimiento: fecha.dia_vencimiento.toString(),
      mes_aplicacion: Array.isArray(fecha.mes_aplicacion) ? fecha.mes_aplicacion : [fecha.mes_aplicacion]
    });
    setShowFechaModal(true);
  };

  const handleEditarRecargo = (recargo: ReglaRecargo) => {
    setEditingRecargo(recargo);
    setNuevoRecargo({
      nombre: recargo.nombre,
      tipo: recargo.tipo,
      dias_gracia: recargo.dias_gracia.toString(),
      porcentaje: recargo.porcentaje?.toString() || "",
      monto_fijo: recargo.monto_fijo ? (recargo.monto_fijo / 100).toString() : "",
      aplica_fines_semana: recargo.aplica_fines_semana,
      aplica_festivos: recargo.aplica_festivos,
      monto_maximo: recargo.monto_maximo ? (recargo.monto_maximo / 100).toString() : ""
    });
    setShowRecargoModal(true);
  };

  const toggleActivoFecha = (id: string) => {
    setFechasVencimiento(prev =>
      prev.map(f => f.id === id ? { ...f, activo: !f.activo } : f)
    );
    toast({
      title: "Estado actualizado",
      description: "La configuración se actualizó correctamente"
    });
  };

  const toggleActivoRecargo = (id: string) => {
    setReglasRecargo(prev =>
      prev.map(r => r.id === id ? { ...r, activo: !r.activo } : r)
    );
    toast({
      title: "Estado actualizado", 
      description: "La regla se actualizó correctamente"
    });
  };

  const eliminarFecha = (id: string) => {
    setFechasVencimiento(prev => prev.filter(f => f.id !== id));
    toast({
      title: "Fecha eliminada",
      description: "La configuración de vencimiento fue eliminada"
    });
  };

  const eliminarRecargo = (id: string) => {
    setReglasRecargo(prev => prev.filter(r => r.id !== id));
    toast({
      title: "Regla eliminada",
      description: "La regla de recargo fue eliminada"
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Configuración de Pagos</h1>
        <p className="text-slate-600">Configura fechas de vencimiento y reglas de recargo para todos los conceptos</p>
      </div>

      {/* Integración Calendario SEP */}
      <Alert>
        <Calendar className="h-4 w-4" />
        <AlertDescription>
          <strong>Integración Calendario SEP 2025-2026:</strong> Las fechas de vencimiento se ajustan automáticamente 
          a días hábiles. Si un pago vence en día no laborable, se mueve al siguiente día hábil sin generar recargo.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="fechas" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="fechas">
            <Calendar className="h-4 w-4 mr-2" />
            Fechas de Vencimiento
          </TabsTrigger>
          <TabsTrigger value="recargos">
            <Percent className="h-4 w-4 mr-2" />
            Reglas de Recargo
          </TabsTrigger>
        </TabsList>

        {/* FECHAS DE VENCIMIENTO */}
        <TabsContent value="fechas" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Fechas de Vencimiento</h2>
              <p className="text-sm text-slate-600">Define cuándo vencen los diferentes conceptos de pago</p>
            </div>
            <Dialog open={showFechaModal} onOpenChange={setShowFechaModal}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingFecha(null);
                  setNuevaFecha({ concepto: "", dia_vencimiento: "", mes_aplicacion: [] });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Fecha
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingFecha ? "Editar Fecha de Vencimiento" : "Nueva Fecha de Vencimiento"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="concepto">Concepto de Pago</Label>
                    <Input
                      id="concepto"
                      value={nuevaFecha.concepto}
                      onChange={(e) => setNuevaFecha(prev => ({ ...prev, concepto: e.target.value }))}
                      placeholder="Ej: Colegiatura, Inscripción, Seguro Escolar"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dia">Día de Vencimiento</Label>
                    <Select 
                      value={nuevaFecha.dia_vencimiento} 
                      onValueChange={(value) => setNuevaFecha(prev => ({ ...prev, dia_vencimiento: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el día del mes" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <SelectItem key={day} value={day.toString()}>
                            Día {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="mes">Meses de Aplicación</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2 p-3 border rounded-lg">
                      <div className="flex items-center space-x-2 col-span-2">
                        <Checkbox
                          id="todos"
                          checked={nuevaFecha.mes_aplicacion.includes("todos")}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setNuevaFecha(prev => ({ ...prev, mes_aplicacion: ["todos"] }));
                            } else {
                              setNuevaFecha(prev => ({ ...prev, mes_aplicacion: [] }));
                            }
                          }}
                        />
                        <label htmlFor="todos" className="text-sm font-medium">
                          Todos los meses
                        </label>
                      </div>
                      
                      {[
                        { value: "enero", label: "Enero" },
                        { value: "febrero", label: "Febrero" },
                        { value: "marzo", label: "Marzo" },
                        { value: "abril", label: "Abril" },
                        { value: "mayo", label: "Mayo" },
                        { value: "junio", label: "Junio" },
                        { value: "julio", label: "Julio" },
                        { value: "agosto", label: "Agosto" },
                        { value: "septiembre", label: "Septiembre" },
                        { value: "octubre", label: "Octubre" },
                        { value: "noviembre", label: "Noviembre" },
                        { value: "diciembre", label: "Diciembre" }
                      ].map((mes) => (
                        <div key={mes.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={mes.value}
                            checked={nuevaFecha.mes_aplicacion.includes(mes.value)}
                            disabled={nuevaFecha.mes_aplicacion.includes("todos")}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setNuevaFecha(prev => ({ 
                                  ...prev, 
                                  mes_aplicacion: [...prev.mes_aplicacion.filter(m => m !== "todos"), mes.value]
                                }));
                              } else {
                                setNuevaFecha(prev => ({ 
                                  ...prev, 
                                  mes_aplicacion: prev.mes_aplicacion.filter(m => m !== mes.value)
                                }));
                              }
                            }}
                          />
                          <label htmlFor={mes.value} className="text-sm">
                            {mes.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleGuardarFecha} className="flex-1">
                      {editingFecha ? "Actualizar" : "Crear"} Fecha
                    </Button>
                    <Button variant="outline" onClick={() => setShowFechaModal(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fechasVencimiento.map((fecha) => (
              <Card key={fecha.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{fecha.concepto}</CardTitle>
                    <Badge variant={fecha.activo ? "default" : "secondary"}>
                      {fecha.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <span className="text-sm">
                      Día {fecha.dia_vencimiento} de {
                        Array.isArray(fecha.mes_aplicacion) 
                          ? (fecha.mes_aplicacion.includes("todos") 
                            ? "todos los meses" 
                            : fecha.mes_aplicacion.join(", "))
                          : fecha.mes_aplicacion === "todos" 
                          ? "todos los meses" 
                          : fecha.mes_aplicacion
                      }
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditarFecha(fecha)}
                      className="flex-1"
                    >
                      <Settings className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant={fecha.activo ? "outline" : "default"}
                      size="sm"
                      onClick={() => toggleActivoFecha(fecha.id)}
                    >
                      {fecha.activo ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => eliminarFecha(fecha.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* REGLAS DE RECARGO */}
        <TabsContent value="recargos" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Reglas de Recargo</h2>
              <p className="text-sm text-slate-600">Configure recargos automáticos por pagos extemporáneos</p>
            </div>
            <Dialog open={showRecargoModal} onOpenChange={setShowRecargoModal}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingRecargo(null);
                  setNuevoRecargo({
                    nombre: "",
                    tipo: "porcentaje",
                    dias_gracia: "",
                    porcentaje: "",
                    monto_fijo: "",
                    aplica_fines_semana: false,
                    aplica_festivos: false,
                    monto_maximo: ""
                  });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Regla
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingRecargo ? "Editar Regla de Recargo" : "Nueva Regla de Recargo"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="nombreRegla">Nombre de la Regla</Label>
                    <Input
                      id="nombreRegla"
                      value={nuevoRecargo.nombre}
                      onChange={(e) => setNuevoRecargo(prev => ({ ...prev, nombre: e.target.value }))}
                      placeholder="Ej: Estándar Mexicano, Recargo Básico"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="tipoRecargo">Tipo de Recargo</Label>
                    <Select 
                      value={nuevoRecargo.tipo} 
                      onValueChange={(value) => setNuevoRecargo(prev => ({ ...prev, tipo: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="porcentaje">Porcentaje del monto</SelectItem>
                        <SelectItem value="fijo">Cantidad fija</SelectItem>
                        <SelectItem value="progresivo">Progresivo por días</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="diasGracia">Días de Gracia</Label>
                    <Input
                      id="diasGracia"
                      type="number"
                      value={nuevoRecargo.dias_gracia}
                      onChange={(e) => setNuevoRecargo(prev => ({ ...prev, dias_gracia: e.target.value }))}
                      placeholder="Días sin recargo después del vencimiento"
                    />
                  </div>

                  {nuevoRecargo.tipo === 'porcentaje' && (
                    <div>
                      <Label htmlFor="porcentaje">Porcentaje de Recargo (%)</Label>
                      <Input
                        id="porcentaje"
                        type="number"
                        step="0.1"
                        value={nuevoRecargo.porcentaje}
                        onChange={(e) => setNuevoRecargo(prev => ({ ...prev, porcentaje: e.target.value }))}
                        placeholder="Ej: 3 (para 3%)"
                      />
                    </div>
                  )}

                  {nuevoRecargo.tipo === 'fijo' && (
                    <div>
                      <Label htmlFor="montoFijo">Monto Fijo de Recargo ($)</Label>
                      <Input
                        id="montoFijo"
                        type="number"
                        value={nuevoRecargo.monto_fijo}
                        onChange={(e) => setNuevoRecargo(prev => ({ ...prev, monto_fijo: e.target.value }))}
                        placeholder="Ej: 200 (pesos mexicanos)"
                      />
                    </div>
                  )}

                  <div>
                    <Label htmlFor="montoMaximo">Monto Máximo de Recargo ($) - Opcional</Label>
                    <Input
                      id="montoMaximo"
                      type="number"
                      value={nuevoRecargo.monto_maximo}
                      onChange={(e) => setNuevoRecargo(prev => ({ ...prev, monto_maximo: e.target.value }))}
                      placeholder="Límite máximo del recargo"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="finesSemana"
                        checked={nuevoRecargo.aplica_fines_semana}
                        onCheckedChange={(checked) => setNuevoRecargo(prev => ({ ...prev, aplica_fines_semana: checked }))}
                      />
                      <Label htmlFor="finesSemana">Aplicar en fines de semana</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="festivos"
                        checked={nuevoRecargo.aplica_festivos}
                        onCheckedChange={(checked) => setNuevoRecargo(prev => ({ ...prev, aplica_festivos: checked }))}
                      />
                      <Label htmlFor="festivos">Aplicar en días festivos</Label>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleGuardarRecargo} className="flex-1">
                      {editingRecargo ? "Actualizar" : "Crear"} Regla
                    </Button>
                    <Button variant="outline" onClick={() => setShowRecargoModal(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reglasRecargo.map((regla) => (
              <Card key={regla.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{regla.nombre}</CardTitle>
                    <Badge variant={regla.activo ? "default" : "secondary"}>
                      {regla.activo ? "Activa" : "Inactiva"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-500" />
                      <span>{regla.dias_gracia} días de gracia</span>
                    </div>
                    
                    {regla.tipo === 'porcentaje' && (
                      <div className="flex items-center gap-2">
                        <Percent className="h-4 w-4 text-slate-500" />
                        <span>{regla.porcentaje}% del monto</span>
                      </div>
                    )}
                    
                    {regla.tipo === 'fijo' && (
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-slate-500" />
                        <span>${(regla.monto_fijo! / 100).toLocaleString()} MXN</span>
                      </div>
                    )}
                    
                    {regla.tipo === 'progresivo' && (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-slate-500" />
                        <span>Escalonado por días</span>
                      </div>
                    )}

                    {regla.monto_maximo && (
                      <div className="text-xs text-slate-500">
                        Máximo: ${(regla.monto_maximo / 100).toLocaleString()}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditarRecargo(regla)}
                      className="flex-1"
                    >
                      <Settings className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant={regla.activo ? "outline" : "default"}
                      size="sm"
                      onClick={() => toggleActivoRecargo(regla.id)}
                    >
                      {regla.activo ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => eliminarRecargo(regla.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}