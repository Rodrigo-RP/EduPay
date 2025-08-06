import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Percent, DollarSign, Plus, Trash2, Settings, CheckCircle2 } from "lucide-react";
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
}

interface ReglaRecargo {
  id: number;
  nombre: string;
  tipo: 'porcentaje' | 'fijo' | 'progresivo';
  dias_gracia: number;
  porcentaje?: number;
  monto_fijo_centavos?: number;
  aplica_fines_semana: boolean;
  aplica_festivos: boolean;
  monto_maximo_centavos?: number;
  activo: boolean;
}

export default function ConfiguracionPagos() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showFechaModal, setShowFechaModal] = useState(false);
  const [showRecargoModal, setShowRecargoModal] = useState(false);
  const [editingFecha, setEditingFecha] = useState<FechaVencimiento | null>(null);
  const [editingRecargo, setEditingRecargo] = useState<ReglaRecargo | null>(null);

  // Form states
  const [nuevaFecha, setNuevaFecha] = useState({
    concepto: "",
    dia_vencimiento: "",
    mes_aplicacion: "todos"
  });

  const [mesesSeleccionados, setMesesSeleccionados] = useState<string[]>([]);
  const [aplicaTodosLosMeses, setAplicaTodosLosMeses] = useState(true);

  const meses = [
    { id: "enero", nombre: "Enero" },
    { id: "febrero", nombre: "Febrero" },
    { id: "marzo", nombre: "Marzo" },
    { id: "abril", nombre: "Abril" },
    { id: "mayo", nombre: "Mayo" },
    { id: "junio", nombre: "Junio" },
    { id: "julio", nombre: "Julio" },
    { id: "agosto", nombre: "Agosto" },
    { id: "septiembre", nombre: "Septiembre" },
    { id: "octubre", nombre: "Octubre" },
    { id: "noviembre", nombre: "Noviembre" },
    { id: "diciembre", nombre: "Diciembre" }
  ];

  const [nuevoRecargo, setNuevoRecargo] = useState({
    nombre: "",
    tipo: "porcentaje" as const,
    dias_gracia: "",
    porcentaje: "",
    monto_fijo: "",
    aplica_fines_semana: false,
    aplica_festivos: false,
    monto_maximo: ""
  });

  // Fetch data from API
  const { data: fechasVencimiento = [], isLoading: loadingFechas } = useQuery({
    queryKey: ["/api/payment-config/due-dates"],
    enabled: !!user?.campus_id,
  });

  const { data: reglasRecargo = [], isLoading: loadingReglas } = useQuery({
    queryKey: ["/api/payment-config/surcharge-rules"],
    enabled: !!user?.campus_id,
  });

  // Toggle active state for fechas
  const toggleFechaMutation = useMutation({
    mutationFn: (fecha: FechaVencimiento) => 
      apiRequest(`/api/payment-config/due-dates/${fecha.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...fecha, activo: !fecha.activo }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/due-dates"] });
      toast({
        title: "Fecha actualizada",
        description: "La configuración de vencimiento se actualizó correctamente",
      });
    },
  });

  // Toggle active state for reglas
  const toggleReglaMutation = useMutation({
    mutationFn: (regla: ReglaRecargo) => 
      apiRequest(`/api/payment-config/surcharge-rules/${regla.id}`, {
        method: "PUT", 
        body: JSON.stringify({ ...regla, activo: !regla.activo }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/surcharge-rules"] });
      toast({
        title: "Regla actualizada",
        description: "La configuración de recargo se actualizó correctamente",
      });
    },
  });

  // Create/Update mutations for fechas
  const saveFechaMutation = useMutation({
    mutationFn: (data: any) => {
      const payload = {
        concepto: data.concepto,
        dia_vencimiento: parseInt(data.dia_vencimiento),
        mes_aplicacion: data.mes_aplicacion,
        activo: true
      };

      if (editingFecha) {
        return apiRequest(`/api/payment-config/due-dates/${editingFecha.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        return apiRequest("/api/payment-config/due-dates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/due-dates"] });
      setShowFechaModal(false);
      setEditingFecha(null);
      setNuevaFecha({ concepto: "", dia_vencimiento: "", mes_aplicacion: "todos" });
      setAplicaTodosLosMeses(true);
      setMesesSeleccionados([]);
      toast({
        title: editingFecha ? "Fecha actualizada" : "Fecha creada",
        description: editingFecha ? 
          "La configuración de vencimiento se actualizó correctamente" :
          "Nueva fecha de vencimiento configurada",
      });
    },
  });

  // Create/Update mutations for reglas
  const saveReglaMutation = useMutation({
    mutationFn: (data: any) => {
      const payload = {
        nombre: data.nombre,
        tipo: data.tipo,
        dias_gracia: parseInt(data.dias_gracia),
        porcentaje: data.tipo === 'porcentaje' ? parseFloat(data.porcentaje) : undefined,
        monto_fijo_centavos: data.tipo === 'fijo' ? parseInt(data.monto_fijo) * 100 : undefined,
        aplica_fines_semana: data.aplica_fines_semana,
        aplica_festivos: data.aplica_festivos,
        monto_maximo_centavos: data.monto_maximo ? parseInt(data.monto_maximo) * 100 : undefined,
        activo: true
      };

      if (editingRecargo) {
        return apiRequest(`/api/payment-config/surcharge-rules/${editingRecargo.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        return apiRequest("/api/payment-config/surcharge-rules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-config/surcharge-rules"] });
      setShowRecargoModal(false);
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
      toast({
        title: editingRecargo ? "Regla actualizada" : "Regla creada",
        description: editingRecargo ? 
          "La configuración de recargo se actualizó correctamente" :
          "Nueva regla de recargo configurada",
      });
    },
  });

  // Delete mutations
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

  // Form handlers
  const handleGuardarFecha = () => {
    if (!nuevaFecha.concepto || !nuevaFecha.dia_vencimiento) {
      toast({
        title: "Error",
        description: "Completa todos los campos requeridos",
        variant: "destructive"
      });
      return;
    }

    // Determinar mes_aplicacion según la selección
    let mes_aplicacion = "todos";
    if (!aplicaTodosLosMeses) {
      if (mesesSeleccionados.length === 0) {
        toast({
          title: "Error",
          description: "Selecciona al menos un mes o marca 'Todos los meses'",
          variant: "destructive"
        });
        return;
      }
      mes_aplicacion = JSON.stringify(mesesSeleccionados);
    }

    const payload = {
      ...nuevaFecha,
      mes_aplicacion
    };

    saveFechaMutation.mutate(payload);
  };

  const handleToggleMes = (mesId: string) => {
    setMesesSeleccionados(prev => 
      prev.includes(mesId) 
        ? prev.filter(m => m !== mesId)
        : [...prev, mesId]
    );
  };

  const handleToggleTodosLosMeses = (checked: boolean) => {
    setAplicaTodosLosMeses(checked);
    if (checked) {
      setMesesSeleccionados([]);
    }
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

    saveReglaMutation.mutate(nuevoRecargo);
  };

  const handleEditarFecha = (fecha: FechaVencimiento) => {
    setEditingFecha(fecha);
    setNuevaFecha({
      concepto: fecha.concepto,
      dia_vencimiento: fecha.dia_vencimiento.toString(),
      mes_aplicacion: fecha.mes_aplicacion
    });

    // Configurar selección de meses
    if (fecha.mes_aplicacion === "todos") {
      setAplicaTodosLosMeses(true);
      setMesesSeleccionados([]);
    } else {
      setAplicaTodosLosMeses(false);
      try {
        const mesesArray = JSON.parse(fecha.mes_aplicacion);
        setMesesSeleccionados(Array.isArray(mesesArray) ? mesesArray : []);
      } catch (e) {
        // Si no es JSON válido, asumir que es un solo mes
        setMesesSeleccionados([fecha.mes_aplicacion]);
      }
    }

    setShowFechaModal(true);
  };

  const handleEditarRegla = (regla: ReglaRecargo) => {
    setEditingRecargo(regla);
    setNuevoRecargo({
      nombre: regla.nombre,
      tipo: regla.tipo,
      dias_gracia: regla.dias_gracia.toString(),
      porcentaje: regla.porcentaje ? regla.porcentaje.toString() : "",
      monto_fijo: regla.monto_fijo_centavos ? (regla.monto_fijo_centavos / 100).toString() : "",
      aplica_fines_semana: regla.aplica_fines_semana,
      aplica_festivos: regla.aplica_festivos,
      monto_maximo: regla.monto_maximo_centavos ? (regla.monto_maximo_centavos / 100).toString() : ""
    });
    setShowRecargoModal(true);
  };

  const renderFechaCard = (fecha: FechaVencimiento) => {
    const mesTexto = (() => {
      if (fecha.mes_aplicacion === "todos") return "Todos los meses";
      
      try {
        // Intentar parsear como JSON (meses específicos)
        const mesesArray = JSON.parse(fecha.mes_aplicacion);
        if (Array.isArray(mesesArray)) {
          if (mesesArray.length === 1) {
            return mesesArray[0].charAt(0).toUpperCase() + mesesArray[0].slice(1);
          }
          const mesesNombres = mesesArray.map(m => m.charAt(0).toUpperCase() + m.slice(1));
          return mesesNombres.length > 3 
            ? `${mesesNombres.slice(0, 2).join(', ')} y ${mesesNombres.length - 2} más`
            : mesesNombres.join(', ');
        }
      } catch (e) {
        // No es JSON, es un mes individual
        return fecha.mes_aplicacion.charAt(0).toUpperCase() + fecha.mes_aplicacion.slice(1);
      }
      
      return fecha.mes_aplicacion;
    })();

    return (
      <Card key={fecha.id} className="relative">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg font-semibold">{fecha.concepto}</CardTitle>
            <Badge variant={fecha.activo ? "default" : "secondary"}>
              {fecha.activo ? "Activo" : "Inactivo"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Calendar className="w-4 h-4" />
            <span>Día {fecha.dia_vencimiento} de {mesTexto}</span>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleEditarFecha(fecha)}
            >
              <Settings className="w-4 h-4 mr-1" />
              Editar
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => toggleFechaMutation.mutate(fecha)}
              disabled={toggleFechaMutation.isPending}
            >
              {fecha.activo ? "Desactivar" : "Activar"}
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => deleteFechaMutation.mutate(fecha.id)}
              disabled={deleteFechaMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Eliminar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderReglaCard = (regla: ReglaRecargo) => {
    const getDetalleTexto = () => {
      if (regla.tipo === 'porcentaje' && regla.porcentaje) {
        return `${regla.porcentaje}% de recargo`;
      }
      if (regla.tipo === 'fijo' && regla.monto_fijo_centavos) {
        return `$${(regla.monto_fijo_centavos / 100).toFixed(2)} MXN`;
      }
      if (regla.tipo === 'progresivo') {
        return "Recargo escalonado por días";
      }
      return "Configurado";
    };

    return (
      <Card key={regla.id} className="relative">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <CardTitle className="text-lg font-semibold">{regla.nombre}</CardTitle>
            <Badge variant={regla.activo ? "default" : "secondary"}>
              {regla.activo ? "Activa" : "Inactiva"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              <span>{getDetalleTexto()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4" />
              <span>{regla.dias_gracia} días de gracia</span>
            </div>
            {regla.monto_maximo_centavos && (
              <div className="text-xs">
                Máximo: ${(regla.monto_maximo_centavos / 100).toFixed(2)} MXN
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleEditarRegla(regla)}
            >
              <Settings className="w-4 h-4 mr-1" />
              Editar
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => toggleReglaMutation.mutate(regla)}
              disabled={toggleReglaMutation.isPending}
            >
              {regla.activo ? "Desactivar" : "Activar"}
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => deleteReglaMutation.mutate(regla.id)}
              disabled={deleteReglaMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Eliminar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuración de Pagos</h1>
          <p className="text-muted-foreground">
            Define fechas de vencimiento y reglas de recargo automáticas
          </p>
        </div>
      </div>

      <Tabs defaultValue="fechas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fechas">📅 Fechas de Vencimiento</TabsTrigger>
          <TabsTrigger value="reglas">% Reglas de Recargo</TabsTrigger>
        </TabsList>

        <TabsContent value="fechas" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Fechas de Vencimiento</h2>
            <p className="text-sm text-muted-foreground">
              Define cuándo vencen los diferentes conceptos de pago
            </p>
          </div>

          {loadingFechas ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fechasVencimiento.map(renderFechaCard)}
            </div>
          )}

          {fechasVencimiento.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                La configuración de vencimiento se actualizó correctamente
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="reglas" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Reglas de Recargo</h2>
              <p className="text-sm text-muted-foreground">
                Configure recargos automáticos por pagos extemporáneos
              </p>
            </div>
            <Button 
              onClick={() => {
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
                setShowRecargoModal(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Regla
            </Button>
          </div>

          {loadingReglas ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reglasRecargo.map(renderReglaCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal de Botón Agregar para Fechas de Vencimiento */}
      <div className="fixed bottom-6 right-6">
        <Dialog open={showFechaModal} onOpenChange={setShowFechaModal}>
          <DialogTrigger asChild>
            <Button 
              size="lg" 
              className="rounded-full shadow-lg"
              onClick={() => {
                setEditingFecha(null);
                setNuevaFecha({ concepto: "", dia_vencimiento: "", mes_aplicacion: "todos" });
                setAplicaTodosLosMeses(true);
                setMesesSeleccionados([]);
              }}
            >
              <Plus className="w-5 h-5 mr-2" />
              Nueva Fecha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingFecha ? "Editar Fecha de Vencimiento" : "Nueva Fecha de Vencimiento"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="concepto">Concepto</Label>
                <Input
                  id="concepto"
                  value={nuevaFecha.concepto}
                  onChange={(e) => setNuevaFecha(prev => ({ ...prev, concepto: e.target.value }))}
                  placeholder="Ej: Colegiatura, Inscripción"
                />
              </div>
              <div>
                <Label htmlFor="dia">Día de vencimiento</Label>
                <Input
                  id="dia"
                  type="number"
                  min="1"
                  max="31"
                  value={nuevaFecha.dia_vencimiento}
                  onChange={(e) => setNuevaFecha(prev => ({ ...prev, dia_vencimiento: e.target.value }))}
                  placeholder="Ej: 10"
                />
              </div>
              <div>
                <Label>Aplicación en meses</Label>
                
                {/* Opción "Todos los meses" */}
                <div className="flex items-center space-x-2 mt-2 p-3 border rounded-lg">
                  <Checkbox
                    id="todos-meses"
                    checked={aplicaTodosLosMeses}
                    onCheckedChange={handleToggleTodosLosMeses}
                  />
                  <Label htmlFor="todos-meses" className="font-medium">
                    Todos los meses
                  </Label>
                </div>

                {/* Selección específica de meses */}
                {!aplicaTodosLosMeses && (
                  <div className="mt-3 p-3 border rounded-lg">
                    <Label className="text-sm text-muted-foreground mb-2 block">
                      Selecciona meses específicos:
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {meses.map((mes) => (
                        <div key={mes.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={mes.id}
                            checked={mesesSeleccionados.includes(mes.id)}
                            onCheckedChange={() => handleToggleMes(mes.id)}
                          />
                          <Label htmlFor={mes.id} className="text-sm">
                            {mes.nombre}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {!aplicaTodosLosMeses && mesesSeleccionados.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {mesesSeleccionados.length} mes{mesesSeleccionados.length !== 1 ? 'es' : ''} seleccionado{mesesSeleccionados.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleGuardarFecha}
                  disabled={saveFechaMutation.isPending}
                  className="flex-1"
                >
                  {saveFechaMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowFechaModal(false)}
                  disabled={saveFechaMutation.isPending}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Modal para Reglas de Recargo */}
      <Dialog open={showRecargoModal} onOpenChange={setShowRecargoModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecargo ? "Editar Regla de Recargo" : "Nueva Regla de Recargo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="nombre-regla">Nombre de la regla</Label>
              <Input
                id="nombre-regla"
                value={nuevoRecargo.nombre}
                onChange={(e) => setNuevoRecargo(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Ej: Estándar Mexicano, Recargo Básico"
              />
            </div>
            
            <div>
              <Label htmlFor="tipo-recargo">Tipo de recargo</Label>
              <Select 
                value={nuevoRecargo.tipo} 
                onValueChange={(value) => setNuevoRecargo(prev => ({ ...prev, tipo: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentaje">Porcentaje</SelectItem>
                  <SelectItem value="fijo">Monto fijo</SelectItem>
                  <SelectItem value="progresivo">Progresivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dias-gracia">Días de gracia</Label>
              <Input
                id="dias-gracia"
                type="number"
                min="0"
                value={nuevoRecargo.dias_gracia}
                onChange={(e) => setNuevoRecargo(prev => ({ ...prev, dias_gracia: e.target.value }))}
                placeholder="0"
              />
            </div>

            {nuevoRecargo.tipo === 'porcentaje' && (
              <div>
                <Label htmlFor="porcentaje">Porcentaje de recargo (%)</Label>
                <Input
                  id="porcentaje"
                  type="number"
                  step="0.1"
                  min="0"
                  value={nuevoRecargo.porcentaje}
                  onChange={(e) => setNuevoRecargo(prev => ({ ...prev, porcentaje: e.target.value }))}
                  placeholder="3.0"
                />
              </div>
            )}

            {nuevoRecargo.tipo === 'fijo' && (
              <div>
                <Label htmlFor="monto-fijo">Monto fijo (MXN)</Label>
                <Input
                  id="monto-fijo"
                  type="number"
                  min="0"
                  value={nuevoRecargo.monto_fijo}
                  onChange={(e) => setNuevoRecargo(prev => ({ ...prev, monto_fijo: e.target.value }))}
                  placeholder="200.00"
                />
              </div>
            )}

            <div>
              <Label htmlFor="monto-maximo">Monto máximo (MXN) - opcional</Label>
              <Input
                id="monto-maximo"
                type="number"
                min="0"
                value={nuevoRecargo.monto_maximo}
                onChange={(e) => setNuevoRecargo(prev => ({ ...prev, monto_maximo: e.target.value }))}
                placeholder="5000.00"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="fines-semana"
                checked={nuevoRecargo.aplica_fines_semana}
                onCheckedChange={(checked) => setNuevoRecargo(prev => ({ ...prev, aplica_fines_semana: checked }))}
              />
              <Label htmlFor="fines-semana">Aplicar en fines de semana</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="festivos"
                checked={nuevoRecargo.aplica_festivos}
                onCheckedChange={(checked) => setNuevoRecargo(prev => ({ ...prev, aplica_festivos: checked }))}
              />
              <Label htmlFor="festivos">Aplicar en días festivos</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                onClick={handleGuardarRecargo}
                disabled={saveReglaMutation.isPending}
                className="flex-1"
              >
                {saveReglaMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowRecargoModal(false)}
                disabled={saveReglaMutation.isPending}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}