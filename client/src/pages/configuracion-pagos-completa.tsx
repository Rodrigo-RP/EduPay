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
import { useAuth } from "@/hooks/use-auth";
import { hasPermission, MODULES, ACTIONS, type UserRole } from "@shared/permissions";
import { Calendar, Settings, Plus, Edit, Trash2, Percent, Clock, DollarSign, CreditCard, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";

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
  reglas_progresivas: TramoRecargo[];
  monto_maximo: string | number;
  aplica_fines_semana: boolean;
  aplica_festivos: boolean;
  activo: boolean;
}

interface TramoRecargo {
  dias_desde: number;
  dias_hasta: number;
  porcentaje: number;
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

const CATEGORIAS_CONCEPTOS_BASE = {
  'colegiatura': { label: 'Colegiaturas', color: 'bg-blue-100 text-blue-700', editable: false },
  'inscripcion': { label: 'Inscripción', color: 'bg-green-100 text-green-700', editable: false },
  'reinscripcion': { label: 'Reinscripción', color: 'bg-purple-100 text-purple-700', editable: false },
  'seguro': { label: 'Seguro Escolar', color: 'bg-orange-100 text-orange-700', editable: false },
  'libros': { label: 'Libros', color: 'bg-yellow-100 text-yellow-700', editable: false },
  'otros': { label: 'Otros', color: 'bg-gray-100 text-gray-700', editable: true }
};

const COLORES_CATEGORIAS = [
  'bg-indigo-100 text-indigo-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700'
];

export default function ConfiguracionPagosCompleta() {
  const [activeTab, setActiveTab] = useState("fechas");
  const [showFechaModal, setShowFechaModal] = useState(false);
  const [showRecargoModal, setShowRecargoModal] = useState(false);
  const [showConceptoModal, setShowConceptoModal] = useState(false);
  const [showCategoriaModal, setShowCategoriaModal] = useState(false);
  const [showDeleteConceptoModal, setShowDeleteConceptoModal] = useState(false);
  const [editingFecha, setEditingFecha] = useState<FechaVencimiento | null>(null);
  const [editingRecargo, setEditingRecargo] = useState<ReglaRecargo | null>(null);
  const [editingConcepto, setEditingConcepto] = useState<Concepto | null>(null);
  const [conceptoToDelete, setConceptoToDelete] = useState<Concepto | null>(null);
  const [categoriasPersonalizadas, setCategoriasPersonalizadas] = useState<Record<string, {label: string, color: string, editable: boolean}>>({});
  
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
    reglas_progresivas: [{ dias_desde: 1, dias_hasta: 15, porcentaje: 1 }] as TramoRecargo[],
    monto_maximo: '',
    aplica_fines_semana: false,
    aplica_festivos: false,
    activo: true
  });

  const [nuevoConcepto, setNuevoConcepto] = useState({
    nombre: '',
    tipo: 'otros',
    periodicidad: 'mensual',
    monto: 0,
    iva: true
  });

  const [nuevaCategoria, setNuevaCategoria] = useState({
    key: '',
    label: '',
    color: COLORES_CATEGORIAS[0]
  });

  const [aplicaTodosMeses, setAplicaTodosMeses] = useState(true);

  // ── Stripe Connect ──────────────────────────────────────────────────────────
  const { user } = useAuth();
  const [stripeMsg,     setStripeMsg]     = useState<string | null>(null);
  const [stipeRefreshing, setStripeRefreshing] = useState(false);
  const puedeConfigurar = hasPermission(
    (user?.role ?? "") as UserRole, MODULES.SETTINGS, ACTIONS.CONFIGURE
  );

  // Fetch estado Stripe Connect
  const { data: stripeEstado, refetch: refetchStripeEstado } = useQuery<{
    conectado: boolean;
    stripe_account_id: string | null;
    charges_enabled: boolean;
    payouts_enabled: boolean;
    details_submitted: boolean;
  }>({
    queryKey: ["/api/admin/campus-payment/estado"],
    enabled: !!user && puedeConfigurar,
    retry: false,
  });

  // Mutation: conectar Stripe (redirige al onboarding_url devuelto)
  const conectarStripeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/campus-payment/conectar-stripe", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || "Error al conectar Stripe");
      }
      return res.json() as Promise<{ onboarding_url: string; stripe_account_id: string }>;
    },
    onSuccess: (data) => {
      if (data.onboarding_url) {
        window.location.href = data.onboarding_url;
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Efecto: manejar ?stripe=completado y ?stripe=refresco al montar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeParam = params.get("stripe");
    if (stripeParam === "completado") {
      setStripeMsg(
        "Onboarding enviado a Stripe. La cuenta quedará activa cuando Stripe confirme los datos."
      );
      setActiveTab("stripe");
    } else if (stripeParam === "refresco") {
      // Auto-refrescar link y redirigir al usuario
      setActiveTab("stripe");
      setStripeRefreshing(true);
      apiRequest("/api/admin/campus-payment/refresh-link", { method: "POST" })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json() as { onboarding_url: string };
            if (data.onboarding_url) {
              window.location.href = data.onboarding_url;
            }
          }
        })
        .catch(() => {
          toast({ title: "Error", description: "No se pudo refrescar el enlace de Stripe", variant: "destructive" });
        })
        .finally(() => setStripeRefreshing(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Mutation para crear/editar conceptos
  const saveConceptoMutation = useMutation({
    mutationFn: async (data: any) => {
      const endpoint = editingConcepto 
        ? `/api/concepts/${editingConcepto.id}`
        : "/api/concepts";
      
      return apiRequest(endpoint, {
        method: editingConcepto ? "PUT" : "POST",
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
        title: editingConcepto ? "Concepto actualizado" : "Concepto creado",
        description: `El concepto se ha ${editingConcepto ? 'actualizado' : 'creado'} correctamente`,
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

  // Mutation para eliminar concepto
  const deleteConceptoMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/concepts/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/concepts"] });
      setShowDeleteConceptoModal(false);
      setConceptoToDelete(null);
      toast({
        title: "Concepto eliminado",
        description: "El concepto se ha eliminado correctamente",
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
      reglas_progresivas: [{ dias_desde: 1, dias_hasta: 15, porcentaje: 1 }],
      monto_maximo: '',
      aplica_fines_semana: false,
      aplica_festivos: false,
      activo: true
    });
  };

  const resetConceptoForm = () => {
    setNuevoConcepto({
      nombre: '',
      tipo: 'otros',
      periodicidad: 'mensual',
      monto: 0,
      iva: true
    });
    setEditingConcepto(null);
  };

  const resetCategoriaForm = () => {
    setNuevaCategoria({
      key: '',
      label: '',
      color: COLORES_CATEGORIAS[0]
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
      reglas_progresivas: recargo.reglas_progresivas?.length
        ? recargo.reglas_progresivas
        : [{ dias_desde: 1, dias_hasta: 15, porcentaje: 1 }],
      monto_maximo: typeof recargo.monto_maximo === 'number'
        ? recargo.monto_maximo.toString()
        : recargo.monto_maximo || '',
      aplica_fines_semana: Boolean(recargo.aplica_fines_semana),
      aplica_festivos: Boolean(recargo.aplica_festivos),
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
    } else if (nuevoRecargo.tipo_calculo === 'porcentaje_fijo') {
      if (nuevoRecargo.porcentaje_recargo <= 0) {
        toast({
          title: "Error",
          description: "El porcentaje de recargo debe ser mayor a 0",
          variant: "destructive",
        });
        return;
      }
    } else if (!nuevoRecargo.reglas_progresivas.length || nuevoRecargo.reglas_progresivas.some((tramo) =>
      tramo.dias_desde < 1 ||
      tramo.dias_hasta < tramo.dias_desde ||
      tramo.porcentaje <= 0 ||
      tramo.porcentaje > 100,
    )) {
      toast({
        title: "Error",
        description: "Define tramos de días válidos con porcentajes entre 0 y 100",
        variant: "destructive",
      });
      return;
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

  const handleEditConcepto = (concepto: Concepto) => {
    setEditingConcepto(concepto);
    setNuevoConcepto({
      nombre: concepto.nombre,
      tipo: concepto.tipo,
      periodicidad: concepto.periodicidad,
      monto: concepto.monto_centavos / 100,
      iva: concepto.iva
    });
    setShowConceptoModal(true);
  };

  const handleDeleteConcepto = (concepto: Concepto) => {
    setConceptoToDelete(concepto);
    setShowDeleteConceptoModal(true);
  };

  const handleGuardarCategoria = () => {
    if (!nuevaCategoria.key.trim() || !nuevaCategoria.label.trim()) {
      toast({
        title: "Error",
        description: "Completa todos los campos de la categoría",
        variant: "destructive",
      });
      return;
    }

    // Verificar que no exista ya una categoría con esa clave
    const todasCategorias = getTodasCategorias();
    if (todasCategorias[nuevaCategoria.key]) {
      toast({
        title: "Error",
        description: "Ya existe una categoría con esa clave",
        variant: "destructive",
      });
      return;
    }

    // Agregar la nueva categoría
    setCategoriasPersonalizadas(prev => ({
      ...prev,
      [nuevaCategoria.key]: {
        label: nuevaCategoria.label,
        color: nuevaCategoria.color,
        editable: true
      }
    }));

    setShowCategoriaModal(false);
    resetCategoriaForm();
    toast({
      title: "Categoría creada",
      description: "La nueva categoría se ha creado correctamente",
    });
  };

  // Función para obtener todas las categorías (base + personalizadas)
  const getTodasCategorias = (): Record<string, {label: string, color: string, editable: boolean}> => {
    return { ...CATEGORIAS_CONCEPTOS_BASE, ...categoriasPersonalizadas };
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
        <TabsList className="grid w-full grid-cols-4">
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
          <TabsTrigger value="stripe" className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Stripe Connect
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
                                <Badge className={getTodasCategorias()[concepto.tipo as keyof ReturnType<typeof getTodasCategorias>]?.color || 'bg-gray-100 text-gray-700'}>
                                  {getTodasCategorias()[concepto.tipo as keyof ReturnType<typeof getTodasCategorias>]?.label || concepto.tipo}
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
                                  <Badge className={getTodasCategorias()[concepto.tipo as keyof ReturnType<typeof getTodasCategorias>]?.color || 'bg-gray-100 text-gray-700'}>
                                    {getTodasCategorias()[concepto.tipo as keyof ReturnType<typeof getTodasCategorias>]?.label || concepto.tipo}
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
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
                                <Badge className={getTodasCategorias()[concepto.tipo as keyof ReturnType<typeof getTodasCategorias>]?.color || 'bg-gray-100 text-gray-700'}>
                                  {getTodasCategorias()[concepto.tipo as keyof ReturnType<typeof getTodasCategorias>]?.label || concepto.tipo}
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

                    {nuevoRecargo.tipo_calculo === 'porcentaje_fijo' ? (
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
                    ) : nuevoRecargo.tipo_calculo === 'monto_fijo' ? (
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
                    ) : (
                      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                        <div>
                          <Label>Tramos de porcentaje por días de atraso</Label>
                          <p className="text-xs text-slate-500 mt-1">
                            Se aplica el porcentaje del tramo que corresponda a los días vencidos después de la gracia.
                          </p>
                        </div>
                        {nuevoRecargo.reglas_progresivas.map((tramo, index) => (
                          <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                            <div className="space-y-1">
                              <Label className="text-xs">Desde</Label>
                              <Input type="number" min="1" value={tramo.dias_desde}
                                onChange={(e) => setNuevoRecargo(prev => ({
                                  ...prev,
                                  reglas_progresivas: prev.reglas_progresivas.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, dias_desde: parseInt(e.target.value) || 0 } : item
                                  ),
                                }))} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Hasta</Label>
                              <Input type="number" min="1" value={tramo.dias_hasta}
                                onChange={(e) => setNuevoRecargo(prev => ({
                                  ...prev,
                                  reglas_progresivas: prev.reglas_progresivas.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, dias_hasta: parseInt(e.target.value) || 0 } : item
                                  ),
                                }))} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">%</Label>
                              <Input type="number" min="0.01" max="100" step="0.01" value={tramo.porcentaje}
                                onChange={(e) => setNuevoRecargo(prev => ({
                                  ...prev,
                                  reglas_progresivas: prev.reglas_progresivas.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, porcentaje: parseFloat(e.target.value) || 0 } : item
                                  ),
                                }))} />
                            </div>
                            <Button type="button" variant="ghost" size="icon"
                              disabled={nuevoRecargo.reglas_progresivas.length === 1}
                              onClick={() => setNuevoRecargo(prev => ({
                                ...prev,
                                reglas_progresivas: prev.reglas_progresivas.filter((_, itemIndex) => itemIndex !== index),
                              }))}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm"
                          onClick={() => setNuevoRecargo(prev => ({
                            ...prev,
                            reglas_progresivas: [...prev.reglas_progresivas, {
                              dias_desde: (prev.reglas_progresivas.at(-1)?.dias_hasta ?? 0) + 1,
                              dias_hasta: (prev.reglas_progresivas.at(-1)?.dias_hasta ?? 0) + 15,
                              porcentaje: 1,
                            }],
                          }))}>
                          <Plus className="w-4 h-4 mr-1" /> Agregar tramo
                        </Button>
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
                          <SelectItem value="porcentaje_diario">Porcentaje por Día (escalonado)</SelectItem>
                          <SelectItem value="monto_fijo">Monto Fijo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3">
                      <div className="space-y-2">
                        <Label htmlFor="monto-maximo">Tope de recargo ($, opcional)</Label>
                        <Input id="monto-maximo" type="number" min="0.01" step="0.01"
                          value={nuevoRecargo.monto_maximo}
                          onChange={(e) => setNuevoRecargo(prev => ({ ...prev, monto_maximo: e.target.value }))} />
                      </div>
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center gap-2">
                          <Switch id="recargo-fin-semana" checked={nuevoRecargo.aplica_fines_semana}
                            onCheckedChange={(checked) => setNuevoRecargo(prev => ({ ...prev, aplica_fines_semana: checked }))} />
                          <Label htmlFor="recargo-fin-semana">Contar fines de semana</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch id="recargo-festivo" checked={nuevoRecargo.aplica_festivos}
                            onCheckedChange={(checked) => setNuevoRecargo(prev => ({ ...prev, aplica_festivos: checked }))} />
                          <Label htmlFor="recargo-festivo">Contar días festivos SEP</Label>
                        </div>
                      </div>
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
                                  <Badge className={getTodasCategorias()[concepto.tipo as keyof ReturnType<typeof getTodasCategorias>]?.color || 'bg-gray-100 text-gray-700'}>
                                    {getTodasCategorias()[concepto.tipo as keyof ReturnType<typeof getTodasCategorias>]?.label || concepto.tipo}
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
                                    : regla.tipo_calculo === 'porcentaje_diario'
                                      ? `Tramos: ${regla.reglas_progresivas?.map((tramo) => `${tramo.dias_desde}-${tramo.dias_hasta}: ${tramo.porcentaje}%`).join(', ') || 'sin definir'}`
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
              <div className="flex gap-2">
                <Dialog open={showConceptoModal} onOpenChange={setShowConceptoModal}>
                  <DialogTrigger asChild>
                    <Button onClick={resetConceptoForm}>
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo Concepto
                    </Button>
                  </DialogTrigger>
                <Dialog open={showCategoriaModal} onOpenChange={setShowCategoriaModal}>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={resetCategoriaForm}>
                      <Settings className="w-4 h-4 mr-2" />
                      Nueva Categoría
                    </Button>
                  </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingConcepto ? 'Editar Concepto' : 'Crear Nuevo Concepto'}
                    </DialogTitle>
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
                          {Object.entries(getTodasCategorias()).map(([key, value]: [string, {label: string, color: string, editable: boolean}]) => (
                            <SelectItem key={key} value={key}>
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${value.color.split(' ')[0]}`}></div>
                                {value.label}
                              </div>
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
                        {saveConceptoMutation.isPending 
                          ? (editingConcepto ? "Actualizando..." : "Creando...") 
                          : (editingConcepto ? "Actualizar" : "Crear")
                        }
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

              {/* Modal para crear nueva categoría */}
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear Nueva Categoría</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="clave-categoria">Clave de la Categoría</Label>
                    <Input
                      id="clave-categoria"
                      value={nuevaCategoria.key}
                      onChange={(e) => setNuevaCategoria(prev => ({ ...prev, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                      placeholder="ej. materiales_didacticos"
                    />
                    <p className="text-xs text-gray-600">Identificador único (solo letras, números y guiones bajos)</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nombre-categoria">Nombre de la Categoría</Label>
                    <Input
                      id="nombre-categoria"
                      value={nuevaCategoria.label}
                      onChange={(e) => setNuevaCategoria(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="ej. Materiales Didácticos"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Color de la Categoría</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {COLORES_CATEGORIAS.map((color, index) => (
                        <button
                          key={index}
                          type="button"
                          className={`w-full h-8 rounded ${color} border-2 ${
                            nuevaCategoria.color === color ? 'border-gray-800' : 'border-transparent'
                          }`}
                          onClick={() => setNuevaCategoria(prev => ({ ...prev, color }))}
                        >
                          <span className="text-xs font-medium">{color.split('-')[1]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleGuardarCategoria}>
                      Crear Categoría
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCategoriaModal(false);
                        resetCategoriaForm();
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {Object.entries(
                  conceptos.reduce((acc, concepto) => {
                    const todasCategorias = getTodasCategorias();
                    const categoria = todasCategorias[concepto.tipo as keyof typeof todasCategorias]?.label || concepto.tipo;
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
                        {conceptosCategoria.map((concepto) => {
                          const todasCategorias = getTodasCategorias();
                          const categoriaInfo = todasCategorias[concepto.tipo as keyof typeof todasCategorias];
                          const esEditable = categoriaInfo?.editable || concepto.tipo === 'otros';
                          
                          return (
                            <div key={concepto.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                              <div className="flex items-center gap-3">
                                <div>
                                  <div className="font-medium">{concepto.nombre}</div>
                                  <div className="text-sm text-slate-600">
                                    {concepto.periodicidad} • {formatMonto(concepto.monto_centavos)}
                                    {concepto.iva && " (+ IVA)"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={categoriaInfo?.color || 'bg-gray-100 text-gray-700'}>
                                  {categoriaInfo?.label || concepto.tipo}
                                </Badge>
                                {esEditable && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleEditConcepto(concepto)}
                                      title="Editar concepto"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDeleteConcepto(concepto)}
                                      title="Eliminar concepto"
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {!esEditable && (
                                  <div className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                                    Sistema
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: Stripe Connect ─────────────────────────────────────────── */}
        <TabsContent value="stripe" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Stripe Connect Express
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                Conecta la cuenta Stripe de este campus para cobrar con tarjeta real.
                El onboarding es gestionado directamente por Stripe.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Mensaje de estado (retorno de Stripe) */}
              {stripeMsg && (
                <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-blue-800">{stripeMsg}</p>
                </div>
              )}

              {stipeRefreshing && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  Refrescando enlace de onboarding...
                </div>
              )}

              {/* Estado actual */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium text-slate-700">Cobros</span>
                  {stripeEstado?.charges_enabled ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Activo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pendiente</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium text-slate-700">Transferencias</span>
                  {stripeEstado?.payouts_enabled ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Activo
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pendiente</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm font-medium text-slate-700">Datos enviados</span>
                  {stripeEstado?.details_submitted ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Sí
                    </Badge>
                  ) : (
                    <Badge variant="secondary">No</Badge>
                  )}
                </div>
              </div>

              {/* ID de cuenta Stripe (si existe) */}
              {stripeEstado?.stripe_account_id && (
                <div className="p-3 bg-slate-50 border rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">ID de cuenta Stripe</p>
                  <code className="text-sm font-mono text-slate-700">
                    {stripeEstado.stripe_account_id}
                  </code>
                </div>
              )}

              {/* Información sobre estado del webhook */}
              {stripeEstado?.stripe_account_id && !stripeEstado.charges_enabled && !stripeMsg && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Onboarding en progreso</p>
                    <p className="mt-1">
                      La cuenta existe en Stripe pero aún no está activa.
                      Completa el proceso en Stripe para habilitar cobros.
                    </p>
                  </div>
                </div>
              )}

              {/* Botón de acción (solo visible con SETTINGS.CONFIGURE) */}
              {puedeConfigurar && (
                <div className="flex flex-col sm:flex-row gap-3">
                  {!stripeEstado?.charges_enabled && (
                    <Button
                      onClick={() => conectarStripeMutation.mutate()}
                      disabled={conectarStripeMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      {conectarStripeMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Conectando...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          {stripeEstado?.stripe_account_id
                            ? "Continuar Onboarding en Stripe"
                            : "Conectar Stripe"}
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </>
                      )}
                    </Button>
                  )}

                  {stripeEstado?.charges_enabled && (
                    <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                      <CheckCircle2 className="w-5 h-5" />
                      Cuenta Stripe activa y lista para cobrar
                    </div>
                  )}
                </div>
              )}

              {!puedeConfigurar && (
                <p className="text-sm text-slate-500 italic">
                  Solo administradores pueden conectar o modificar la cuenta Stripe.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de confirmación para eliminar concepto */}
      <Dialog open={showDeleteConceptoModal} onOpenChange={setShowDeleteConceptoModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Concepto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              ¿Estás seguro de que deseas eliminar el concepto <strong>{conceptoToDelete?.nombre}</strong>?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <div className="w-5 h-5 text-yellow-600 mt-0.5">
                  ⚠️
                </div>
                <div className="text-sm">
                  <p className="font-medium text-yellow-800">Advertencia</p>
                  <p className="text-yellow-700 mt-1">
                    Esta acción no se puede deshacer. Se eliminarán también todas las configuraciones de fechas y recargos asociadas a este concepto.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button
                variant="destructive"
                onClick={() => conceptoToDelete && deleteConceptoMutation.mutate(conceptoToDelete.id)}
                disabled={deleteConceptoMutation.isPending}
              >
                {deleteConceptoMutation.isPending ? "Eliminando..." : "Sí, Eliminar"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteConceptoModal(false);
                  setConceptoToDelete(null);
                }}
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