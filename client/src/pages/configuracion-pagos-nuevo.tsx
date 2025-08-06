import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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

  const renderFechaCard = (fecha: FechaVencimiento) => {
    const mesTexto = fecha.mes_aplicacion === "todos" ? "Todos los meses" : 
                     fecha.mes_aplicacion === "agosto" ? "Agosto" :
                     fecha.mes_aplicacion === "febrero" ? "Febrero" : fecha.mes_aplicacion;

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
              onClick={() => toggleFechaMutation.mutate(fecha)}
              disabled={toggleFechaMutation.isPending}
            >
              <Settings className="w-4 h-4 mr-1" />
              {fecha.activo ? "Desactivar" : "Activar"}
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
              onClick={() => toggleReglaMutation.mutate(regla)}
              disabled={toggleReglaMutation.isPending}
            >
              <Settings className="w-4 h-4 mr-1" />
              {regla.activo ? "Desactivar" : "Activar"}
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
            <h2 className="text-xl font-semibold">Reglas de Recargo</h2>
            <p className="text-sm text-muted-foreground">
              Configure recargos automáticos por pagos extemporáneos
            </p>
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
    </div>
  );
}