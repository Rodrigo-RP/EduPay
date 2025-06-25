// Módulo 3: Portal del padre/tutor - Pago en 3 clics máximo (móvil-first)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  CreditCard, 
  Smartphone, 
  Clock, 
  CheckCircle, 
  DollarSign, 
  Download,
  Bell,
  User,
  Heart,
  AlertCircle
} from "lucide-react";

interface PendingCharge {
  id: number;
  concept: {
    nombre: string;
  };
  student: {
    nombre_completo: string;
  };
  fecha_vencimiento: string;
  monto_base_centavos: number;
  beca_aplicada: string;
  recargo_aplicado_centavos: number;
  total_amount_centavos: number;
}

export default function PortalPadres3Clics() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCharges, setSelectedCharges] = useState<number[]>([]);
  const [step, setStep] = useState<"select" | "pay" | "confirm">("select");

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["/api/guardian/dashboard"],
  });

  // Paso 1: Seleccionar cargos (1 clic)
  const SelectCharges = () => {
    const toggleCharge = (chargeId: number) => {
      setSelectedCharges(prev => 
        prev.includes(chargeId) 
          ? prev.filter(id => id !== chargeId)
          : [...prev, chargeId]
      );
    };

    const pagarTodo = () => {
      const allCharges = dashboardData?.pendingCharges?.map((c: any) => c.id) || [];
      setSelectedCharges(allCharges);
      setStep("pay");
    };

    const pagarSeleccionados = () => {
      if (selectedCharges.length > 0) {
        setStep("pay");
      }
    };

    const totalSeleccionado = selectedCharges.reduce((total, chargeId) => {
      const charge = dashboardData?.pendingCharges?.find((c: any) => c.id === chargeId);
      return total + (charge?.total_amount_centavos || 0);
    }, 0);

    return (
      <div className="space-y-4">
        {/* Resumen móvil-first */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-green-700">
                  ${((dashboardData?.totalPendingBalance || 0) / 100).toLocaleString()}
                </div>
            <div className="text-sm text-green-600">Saldo total pendiente</div>
              </div>
              <Button 
                onClick={pagarTodo}
                className="bg-green-600 hover:bg-green-700 text-white"
                size="lg"
              >
                <Heart className="w-4 h-4 mr-2" />
                Pagar todo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de cargos pendientes */}
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-900">Conceptos pendientes de pago</h3>
          {dashboardData?.pendingCharges?.map((charge: PendingCharge) => {
            const isSelected = selectedCharges.includes(charge.id);
            const isVencido = new Date(charge.fecha_vencimiento) < new Date();
            
            return (
              <Card 
                key={charge.id} 
                className={`cursor-pointer transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                } ${isVencido ? 'border-red-300 bg-red-50' : ''}`}
                onClick={() => toggleCharge(charge.id)}
              >
                <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{charge.concept.nombre}</div>
                        {isVencido && <AlertCircle className="w-4 h-4 text-red-500" />}
                      </div>
                  <div className="text-sm text-slate-600">{charge.student.nombre_completo}</div>
                  <div className="text-sm text-slate-500">
                        Vence: {new Date(charge.fecha_vencimiento).toLocaleDateString('es-MX')}
                      </div>
                      {charge.beca_aplicada && parseFloat(charge.beca_aplicada) > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          Beca {charge.beca_aplicada}%
                        </Badge>
                      )}
                    </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-slate-900">
                        ${(charge.total_amount_centavos / 100).toLocaleString()}
                      </div>
                      {charge.recargo_aplicado_centavos > 0 && (
                    <div className="text-sm text-red-600">
                          +${(charge.recargo_aplicado_centavos / 100).toLocaleString()} recargo
                        </div>
                      )}
                  <div className="w-6 h-6 border-2 rounded border-slate-300 flex items-center justify-center mt-2">
                        {isSelected && <CheckCircle className="w-4 h-4 text-blue-500" />}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Botón de pagar seleccionados */}
        {selectedCharges.length > 0 && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">
                    {selectedCharges.length} concepto{selectedCharges.length > 1 ? 's' : ''} seleccionado{selectedCharges.length > 1 ? 's' : ''}
                  </div>
              <div className="text-2xl font-bold text-blue-700">
                    ${(totalSeleccionado / 100).toLocaleString()} MXN
                  </div>
                </div>
                <Button 
                  onClick={pagarSeleccionados}
                  className="bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  Pagar selección
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // Paso 2: Método de pago (1 clic)
  const PaymentMethod = () => {
    const [selectedMethod, setSelectedMethod] = useState<string>("");

    const metodosPago = [
      { id: "tarjeta_guardada", name: "Tarjeta •••• 4242", icon: CreditCard, primary: true },
      { id: "nueva_tarjeta", name: "Nueva tarjeta", icon: CreditCard },
      { id: "spei", name: "Transferencia SPEI", icon: Smartphone },
      { id: "oxxo", name: "Pago en OXXO", icon: Smartphone },
      { id: "paypal", name: "PayPal", icon: Smartphone }
    ];

    const procesarPago = () => {
      if (selectedMethod) {
        setStep("confirm");
      }
    };

    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Método de pago</h2>
      <div className="text-3xl font-bold text-green-600 mt-2">
            ${(selectedCharges.reduce((total, chargeId) => {
              const charge = dashboardData?.pendingCharges?.find((c: any) => c.id === chargeId);
              return total + (charge?.total_amount_centavos || 0);
            }, 0) / 100).toLocaleString()} MXN
          </div>
        </div>

        <div className="space-y-3">
          {metodosPago.map((metodo) => {
            const Icon = metodo.icon;
            const isSelected = selectedMethod === metodo.id;
            
            return (
              <Card 
                key={metodo.id}
                className={`cursor-pointer transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
                } ${metodo.primary ? 'border-green-300 bg-green-50' : ''}`}
                onClick={() => setSelectedMethod(metodo.id)}
              >
                <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                      <Icon className="w-6 h-6 text-slate-600" />
                  <div>
                    <div className="font-semibold">{metodo.name}</div>
                        {metodo.primary && (
                          <Badge variant="secondary" className="text-xs">Predeterminada</Badge>
                        )}
                      </div>
                    </div>
                <div className="w-6 h-6 border-2 rounded-full border-slate-300 flex items-center justify-center">
                      {isSelected && <div className="w-3 h-3 bg-blue-500 rounded-full" />}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex gap-3 mt-6">
          <Button 
            variant="outline" 
            onClick={() => setStep("select")}
            className="flex-1"
          >
            Regresar
          </Button>
          <Button 
            onClick={procesarPago}
            disabled={!selectedMethod}
            className="flex-1 bg-green-600 hover:bg-green-700"
            size="lg"
          >
            Procesar pago
          </Button>
        </div>
      </div>
    );
  };

  // Paso 3: Confirmación (1 clic)
  const PaymentConfirm = () => {
    const [processing, setProcessing] = useState(false);

    const confirmarPago = useMutation({
      mutationFn: (data: any) => apiRequest("POST", "/api/guardian/pagar", data),
      onSuccess: (data) => {
        setProcessing(false);
        toast({
          title: "¡Pago exitoso!",
          description: "Su factura CFDI será enviada por email en unos minutos"
        });
        // Reset
        setSelectedCharges([]);
        setStep("select");
        queryClient.invalidateQueries({ queryKey: ["/api/guardian/dashboard"] });
      },
      onError: () => {
        setProcessing(false);
        toast({
          title: "Error en el pago",
          description: "No se pudo procesar el pago. Intente nuevamente.",
          variant: "destructive"
        });
      }
    });

    const procesarPagoFinal = () => {
      setProcessing(true);
      confirmarPago.mutate({
        charge_ids: selectedCharges,
        metodo_pago: "tarjeta_guardada"
      });
    };

    return (
      <div className="space-y-6">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900">Confirmar pago</h2>
      <div className="text-3xl font-bold text-green-600 mt-2">
            ${(selectedCharges.reduce((total, chargeId) => {
              const charge = dashboardData?.pendingCharges?.find((c: any) => c.id === chargeId);
              return total + (charge?.total_amount_centavos || 0);
            }, 0) / 100).toLocaleString()} MXN
          </div>
        </div>

        {/* Resumen del pago */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumen del pago</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedCharges.map(chargeId => {
              const charge = dashboardData?.pendingCharges?.find((c: any) => c.id === chargeId);
              if (!charge) return null;
              
              return (
            <div key={charge.id} className="flex justify-between items-center py-2 border-b last:border-b-0">
              <div>
                <div className="font-medium">{charge.concept.nombre}</div>
                <div className="text-sm text-slate-600">{charge.student.nombre_completo}</div>
                  </div>
              <div className="font-semibold">
                    ${(charge.total_amount_centavos / 100).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
        <div className="text-sm text-green-800">
          <div className="font-semibold mb-1">Se generará factura CFDI automáticamente</div>
          <div>El comprobante fiscal será enviado a su email registrado.</div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => setStep("pay")}
            className="flex-1"
            disabled={processing}
          >
            Cambiar método
          </Button>
          <Button 
            onClick={procesarPagoFinal}
            disabled={processing}
            className="flex-1 bg-green-600 hover:bg-green-700"
            size="lg"
          >
            {processing ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Procesando...
              </div>
            ) : (
              "Confirmar pago"
            )}
          </Button>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header móvil-first */}
      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-4 text-center">
        <div className="text-lg font-bold">Portal Padres - Pago 3 clics</div>
        <div className="text-green-100 text-sm">Meta: 80% pagos antes del vencimiento</div>
      </div>

      <div className="max-w-md mx-auto p-4">
        {/* Indicador de pasos */}
        <div className="flex items-center justify-center gap-2 mb-6 pt-4">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
            step === "select" ? "bg-green-500 text-white" : "bg-green-100 text-green-600"
          }`}>
            1
          </div>
      <div className="w-8 h-1 bg-slate-200">
        <div className={`h-full transition-all ${step !== "select" ? "bg-green-500" : ""}`} />
          </div>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
            step === "pay" ? "bg-green-500 text-white" : step === "confirm" ? "bg-green-100 text-green-600" : "bg-slate-200 text-slate-400"
          }`}>
            2
          </div>
      <div className="w-8 h-1 bg-slate-200">
        <div className={`h-full transition-all ${step === "confirm" ? "bg-green-500" : ""}`} />
          </div>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
            step === "confirm" ? "bg-green-500 text-white" : "bg-slate-200 text-slate-400"
          }`}>
            3
          </div>
        </div>

        {/* Contenido por paso */}
        {step === "select" && <SelectCharges />}
        {step === "pay" && <PaymentMethod />}
        {step === "confirm" && <PaymentConfirm />}
      </div>
    </div>
  );
}