// Módulo 3: Portal del padre/tutor - Pago en 3 clics máximo (móvil-first)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { Elements, CardElement, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CreditCard,
  Smartphone,
  Clock,
  CheckCircle,
  DollarSign,
  ArrowLeft,
  Receipt,
  Shield,
} from "lucide-react";

// ── Stripe ────────────────────────────────────────────────────────────────────
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)
  : null;

// Tarjetas de prueba de Stripe (entorno de desarrollo)
const TEST_CARDS = [
  { number: "4242 4242 4242 4242", result: "success",  label: "Pago exitoso" },
  { number: "4000 0000 0000 9995", result: "funds",    label: "Fondos insuficientes" },
  { number: "4000 0000 0000 0002", result: "declined", label: "Tarjeta declinada" },
];

// Opciones visuales para CardElement (paleta de la app)
const CARD_ELEMENT_OPTIONS: React.ComponentProps<typeof CardElement>["options"] = {
  style: {
    base: {
      fontSize: "16px",
      color: "#1e293b",
      fontFamily: '"Inter", system-ui, sans-serif',
      "::placeholder": { color: "#94a3b8" },
    },
    invalid: { color: "#dc2626", iconColor: "#dc2626" },
  },
};

// Mapeo de errores de Stripe al español claro
function stripeErrorToSpanish(error: {
  code?: string;
  decline_code?: string;
  message?: string;
}): string {
  switch (error.decline_code) {
    case "insufficient_funds":
      return "El banco rechazó el pago por fondos insuficientes.";
    case "lost_card":
      return "Esta tarjeta está reportada como perdida. Usa otra tarjeta.";
    case "stolen_card":
      return "Esta tarjeta está reportada como robada. Usa otra tarjeta.";
    case "do_not_honor":
      return "El banco no autorizó el pago. Contacta a tu banco.";
    case "fraudulent":
      return "El pago fue rechazado por seguridad. Contacta a tu banco.";
  }
  switch (error.code) {
    case "card_declined":
      return "El banco rechazó la tarjeta. Intenta con otra.";
    case "expired_card":
      return "La tarjeta está vencida.";
    case "incorrect_cvc":
      return "El código de seguridad (CVV) es incorrecto.";
    case "incorrect_number":
      return "El número de tarjeta es incorrecto.";
    case "invalid_expiry_year":
    case "invalid_expiry_month":
      return "La fecha de vencimiento no es válida.";
    case "processing_error":
      return "Error al procesar el pago. Intenta nuevamente.";
    case "incomplete_number":
      return "El número de tarjeta está incompleto.";
    case "incomplete_expiry":
      return "La fecha de vencimiento está incompleta.";
    case "incomplete_cvc":
      return "El código de seguridad (CVV) está incompleto.";
  }
  return error.message ?? "Error inesperado. Intenta nuevamente.";
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface PendingCharge {
  id: number;
  concept: { nombre: string };
  student: { nombre_completo: string };
  fecha_vencimiento: string;
  monto_base_centavos: number;
  beca_aplicada: string;
  recargo_aplicado_centavos: number;
  total_amount_centavos: number;
}

interface SpeiIntent {
  paymentIntentId: string;
  clientSecret: string;
}

/**
 * Formulario aislado porque PaymentElement necesita su propio ElementsProvider
 * configurado con el clientSecret del PaymentIntent SPEI.
 */
function SpeiPaymentElementForm({
  onConfirmed,
}: {
  onConfirmed: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setConfirming(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (result.error) {
      setError(stripeErrorToSpanish(result.error));
      setConfirming(false);
      return;
    }

    // Para SPEI, la confirmación muestra instrucciones/CLABE y el pago queda
    // pendiente hasta que Stripe envía payment_intent.succeeded al webhook.
    onConfirmed();
  };

  return (
    <form onSubmit={confirm} className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-semibold">Transferencia SPEI</p>
        <p className="mt-1">
          Elige transferencia para ver la CLABE y las instrucciones de tu banco.
          También puedes usar tarjeta como alternativa.
        </p>
      </div>
      <PaymentElement
        options={{
          paymentMethodOrder: ["customer_balance", "card"],
          layout: "tabs",
        }}
      />
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Button
        className="w-full bg-green-600 hover:bg-green-700 text-lg"
        size="lg"
        type="submit"
        disabled={!stripe || confirming}
      >
        {confirming ? "Preparando tu transferencia..." : "Ver datos para transferir"}
      </Button>
    </form>
  );
}

// ── Componente interno (necesita estar dentro de <Elements>) ──────────────────
function PortalPadres3ClicsInner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Hooks de Stripe — llamados al nivel del componente que está dentro de <Elements>
  const stripe = useStripe();
  const elements = useElements();

  // Estado de navegación y pago
  const [selectedCharges, setSelectedCharges] = useState<number[]>([]);
  const [step, setStep] = useState<"select" | "pay" | "confirm" | "spei-pending" | "success">("select");
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [cardComplete, setCardComplete] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastPaymentResult, setLastPaymentResult] = useState<any>(null);
  const [speiIntent, setSpeiIntent] = useState<SpeiIntent | null>(null);

  const { data: dashboardData, isLoading } = useQuery<any>({
    queryKey: ["/api/guardian/dashboard"],
  });

  const totalSeleccionado = selectedCharges.reduce((total, chargeId) => {
    const charge = dashboardData?.pendingCharges?.find((c: any) => c.id === chargeId);
    return total + (charge?.total_amount_centavos || 0);
  }, 0);

  // ── Mutation ────────────────────────────────────────────────────────────────
  const confirmarPago = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/guardian/pagar", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setProcessing(false);
      setLastPaymentResult(data);
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["/api/guardian/dashboard"] });
    },
    onError: (err: any) => {
      setProcessing(false);
      // apiRequest lanza Error("${status}: ${body_text}") en respuestas no-ok
      const msg: string = err?.message ?? "";
      if (msg.startsWith("402:")) {
        try {
          const body = JSON.parse(msg.slice(4).trim());
          toast({
            title: "Pago rechazado",
            description: body.message ?? "El banco rechazó la tarjeta. Intenta con otra.",
            variant: "destructive",
          });
        } catch {
          toast({
            title: "Pago rechazado",
            description: "El banco rechazó la tarjeta. Intenta con otra.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Error en el pago",
          description: "No se pudo procesar el pago. Intenta nuevamente.",
          variant: "destructive",
        });
      }
    },
  });

  // ── Función de pago ─────────────────────────────────────────────────────────
  const procesarPagoFinal = async () => {
    if (selectedMethod === "tarjeta") {
      if (!stripe || !elements) {
        toast({
          title: "Error",
          description: "El procesador de pagos no está listo. Recarga la página.",
          variant: "destructive",
        });
        return;
      }
      const cardEl = elements.getElement(CardElement);
      if (!cardEl) return;

      setProcessing(true);
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardEl,
      });

      if (error) {
        setProcessing(false);
        toast({
          title: "Error con la tarjeta",
          description: stripeErrorToSpanish(error),
          variant: "destructive",
        });
        return;
      }

      confirmarPago.mutate({
        charge_ids: selectedCharges,
        metodo_pago: "tarjeta",
        payment_method_id: paymentMethod.id,
      });
    } else {
      setProcessing(true);
      confirmarPago.mutate({
        charge_ids: selectedCharges,
        metodo_pago: selectedMethod || "spei",
      });
    }
  };

  const iniciarPagoSpei = async () => {
    setProcessing(true);
    try {
      const response = await apiRequest("/api/guardian/spei-intent", {
        method: "POST",
        body: JSON.stringify({ charge_ids: selectedCharges }),
      });
      const data = await response.json();
      setSpeiIntent({
        paymentIntentId: data.payment_intent_id,
        clientSecret: data.client_secret,
      });
    } catch (error: any) {
      const message = String(error?.message || "");
      toast({
        title: "No pudimos preparar la transferencia",
        description: message.startsWith("409:")
          ? "Tu plantel aún no tiene transferencias habilitadas o ya existe una transferencia pendiente."
          : "Intenta nuevamente en un momento.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  // ── Paso 1: Seleccionar cargos ────────────────────────────────────────────
  const SelectCharges = () => {
    const toggleCharge = (chargeId: number) =>
      setSelectedCharges(prev =>
        prev.includes(chargeId) ? prev.filter(id => id !== chargeId) : [...prev, chargeId]
      );

    const pagarTodo = () => {
      const allIds = dashboardData?.pendingCharges?.map((c: any) => c.id) || [];
      setSelectedCharges(allIds);
      setSelectedMethod("spei");
      setStep("pay");
    };

    return (
      <div className="space-y-4">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 font-medium">Saldo pendiente total</p>
                <p className="text-2xl font-bold text-green-800">
                  ${(dashboardData?.totalPendingBalance || 0).toLocaleString("es-MX", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  MXN
                </p>
              </div>
              <DollarSign className="w-10 h-10 text-green-600 opacity-60" />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {(dashboardData?.pendingCharges || []).length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="font-medium">¡Todo al corriente!</p>
              <p className="text-sm">No hay pagos pendientes</p>
            </div>
          ) : (
            (dashboardData?.pendingCharges || []).map((charge: PendingCharge) => {
              const isSelected = selectedCharges.includes(charge.id);
              const isOverdue = new Date(charge.fecha_vencimiento) < new Date();
              return (
                <Card
                  key={charge.id}
                  className={`cursor-pointer transition-all border-2 ${
                    isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200"
                  }`}
                  onClick={() => toggleCharge(charge.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-slate-900 truncate">
                            {charge.concept?.nombre}
                          </p>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs shrink-0">
                              Vencido
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">{charge.student?.nombre_completo}</p>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Vence:{" "}
                          {new Date(charge.fecha_vencimiento).toLocaleDateString("es-MX")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-slate-900">
                          $
                          {((charge.total_amount_centavos || 0) / 100).toLocaleString("es-MX", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        {charge.recargo_aplicado_centavos > 0 && (
                          <p className="text-xs text-red-500">
                            +${(charge.recargo_aplicado_centavos / 100).toLocaleString()} recargo
                          </p>
                        )}
                        <div
                          className={`w-5 h-5 mt-2 rounded border-2 ml-auto flex items-center justify-center ${
                            isSelected ? "bg-blue-500 border-blue-500" : "border-slate-300"
                          }`}
                        >
                          {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {(dashboardData?.pendingCharges || []).length > 0 && (
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (selectedCharges.length === 0) {
                  toast({ title: "Selecciona al menos un cargo", variant: "destructive" });
                } else {
                  setSelectedMethod("spei");
                  setStep("pay");
                }
              }}
            >
              Pagar seleccionados ({selectedCharges.length})
            </Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={pagarTodo}>
              Pagar todo
            </Button>
          </div>
        )}
      </div>
    );
  };

  // ── Paso 2: Método de pago ─────────────────────────────────────────────────
  const PaymentMethod = () => (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setStep("select")}
          className="text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-slate-900">Método de pago</h2>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
        <p className="text-blue-800 font-semibold text-lg">
          Total a pagar: $
          {(totalSeleccionado / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
        </p>
      </div>

      {/* Selector de método */}
      <div className="space-y-2">
        {[
          { id: "spei",    label: "Transferencia SPEI",        icon: Smartphone },
          { id: "tarjeta", label: "Tarjeta de crédito/débito", icon: CreditCard },
          { id: "oxxo",   label: "Pago en OXXO",              icon: Receipt },
        ].map(m => (
          <Card
            key={m.id}
            className={`cursor-pointer border-2 transition-all ${
              selectedMethod === m.id ? "border-blue-500 bg-blue-50" : "border-slate-200"
            }`}
            onClick={() => setSelectedMethod(m.id)}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <m.icon className="w-5 h-5 text-slate-600" />
              <span className="font-medium">{m.label}</span>
              <div
                className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedMethod === m.id ? "border-blue-500" : "border-slate-300"
                }`}
              >
                {selectedMethod === m.id && (
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Nota de tarjeta: los datos se ingresan en el paso siguiente */}
      {selectedMethod === "tarjeta" && (
        <Card className="border-blue-100 bg-blue-50">
          <CardContent className="p-4 flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Pago seguro con Stripe</p>
              <p className="text-xs text-blue-600 mt-1">
                Ingresarás los datos de tu tarjeta en el siguiente paso de forma segura.
                Nunca almacenamos datos de tarjeta.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedMethod === "spei" && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 text-sm text-blue-800 space-y-2">
            <p className="font-semibold">Transferencia segura por SPEI</p>
            <p>
              En el siguiente paso te mostraremos la CLABE y las instrucciones
              reales para completar tu transferencia.
            </p>
          </CardContent>
        </Card>
      )}

      <Button
        className="w-full bg-green-600 hover:bg-green-700"
        size="lg"
        disabled={!selectedMethod}
        onClick={() => setStep("confirm")}
      >
        Continuar
      </Button>
    </div>
  );

  // ── Paso 3: Confirmar y pagar ─────────────────────────────────────────────
  const PaymentConfirm = () => {
    if (selectedMethod === "spei" && speiIntent) {
      const options: StripeElementsOptions = {
        clientSecret: speiIntent.clientSecret,
        locale: "es",
        appearance: {
          theme: "stripe",
          variables: { fontSizeBase: "16px", spacingUnit: "6px" },
        },
      };
      return (
        <div className="space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => {
                setSpeiIntent(null);
                setStep("pay");
              }}
              className="text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-slate-900">Completa tu transferencia</h2>
          </div>
          <Elements stripe={stripePromise} options={options}>
            <SpeiPaymentElementForm onConfirmed={() => setStep("spei-pending")} />
          </Elements>
        </div>
      );
    }

    return (
      <div className="space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setStep("pay")}
          className="text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-slate-900">Confirmar pago</h2>
      </div>

      <div className="text-center py-3">
        <p className="text-4xl font-bold text-green-600">
          $
          {(totalSeleccionado / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
        </p>
      </div>

      {/* Resumen de cargos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-600">Resumen del pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {selectedCharges.map(chargeId => {
            const charge = dashboardData?.pendingCharges?.find((c: any) => c.id === chargeId);
            if (!charge) return null;
            return (
              <div
                key={charge.id}
                className="flex justify-between items-center py-2 border-b last:border-0 text-sm"
              >
                <div>
                  <p className="font-medium">{charge.concept?.nombre}</p>
                  <p className="text-slate-500 text-xs">{charge.student?.nombre_completo}</p>
                </div>
                <p className="font-semibold">
                  $
                  {((charge.total_amount_centavos || 0) / 100).toLocaleString("es-MX", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Formulario de tarjeta real con Stripe Elements */}
      {selectedMethod === "tarjeta" && (
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
              <Shield className="w-4 h-4 text-green-600" />
              Datos de tarjeta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* CardElement: Stripe renderiza el campo dentro de un iframe seguro */}
            <div className="border rounded-md px-3 py-3 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-shadow">
              <CardElement
                options={CARD_ELEMENT_OPTIONS}
                onChange={e => setCardComplete(e.complete)}
              />
            </div>

            {/* Tarjetas de prueba (solo en dev) */}
            {import.meta.env.DEV && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-xs font-semibold text-amber-700 mb-2">🧪 Tarjetas de prueba:</p>
                {TEST_CARDS.map(tc => (
                  <div
                    key={tc.number}
                    className="flex items-center justify-between text-xs text-amber-800 mb-1"
                  >
                    <code className="font-mono">{tc.number}</code>
                    <span
                      className={
                        tc.result === "success" ? "text-green-700" : "text-red-600"
                      }
                    >
                      → {tc.label}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-amber-600 mt-1">CVV y vencimiento: cualquier valor válido</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Método seleccionado */}
      <div className="bg-slate-50 border rounded-lg p-3 text-sm text-slate-600 space-y-1">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          <span>
            {selectedMethod === "tarjeta"
              ? "Tarjeta de crédito/débito"
              : selectedMethod === "spei"
              ? "Transferencia SPEI"
              : "Pago en OXXO"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-green-700">
          <Shield className="w-4 h-4" />
          <span>Pago seguro con encriptación SSL</span>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
        <CheckCircle className="w-4 h-4 inline mr-1" />
        Se generará factura CFDI automáticamente y será enviada a su email.
      </div>

      <Button
        className="w-full bg-green-600 hover:bg-green-700 text-lg"
        size="lg"
        onClick={selectedMethod === "spei" ? iniciarPagoSpei : procesarPagoFinal}
        disabled={
          processing ||
          (selectedMethod === "tarjeta" && !cardComplete)
        }
      >
        {processing ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Procesando pago...
          </span>
        ) : (
          `Confirmar pago $${(totalSeleccionado / 100).toLocaleString("es-MX", {
            minimumFractionDigits: 2,
          })}`
        )}
      </Button>
      </div>
    );
  };

  const SpeiPending = () => (
    <div className="text-center space-y-5 py-6">
      <div className="flex items-center justify-center">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
          <Clock className="w-12 h-12 text-blue-600" />
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Estamos confirmando tu transferencia</h2>
        <p className="text-slate-600 mt-2">
          Cuando tu banco complete el SPEI, actualizaremos tus cargos automáticamente.
          Puede tomar unos minutos.
        </p>
      </div>
      <Button
        className="w-full bg-blue-600 hover:bg-blue-700"
        onClick={() => {
          setSpeiIntent(null);
          setSelectedCharges([]);
          setSelectedMethod("");
          setStep("select");
          queryClient.invalidateQueries({ queryKey: ["/api/guardian/dashboard"] });
        }}
      >
        Volver al inicio
      </Button>
    </div>
  );

  // ── Paso 4: Éxito ──────────────────────────────────────────────────────────
  const PaymentSuccess = () => (
    <div className="text-center space-y-5 py-6">
      <div className="flex items-center justify-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-bold text-slate-900">¡Pago exitoso!</h2>
        <p className="text-slate-600 mt-1">
          $
          {(totalSeleccionado / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
          procesados
        </p>
      </div>

      {lastPaymentResult?.payments?.map((p: any) => (
        <Card key={p.payment_id} className="bg-green-50 border-green-200 text-left">
          <CardContent className="p-4 text-sm space-y-1">
            <div className="flex items-center gap-2 text-green-700 font-semibold">
              <Receipt className="w-4 h-4" />
              Folio de pago #{p.payment_id}
            </div>
            {p.cfdi && (
              <div className="text-green-600">
                <span className="text-slate-500">UUID CFDI: </span>
                <code className="text-xs">{p.cfdi}</code>
              </div>
            )}
            <p className="text-xs text-slate-500">
              El comprobante CFDI fue enviado a su correo institucional.
            </p>
          </CardContent>
        </Card>
      ))}

      <Button
        className="w-full bg-blue-600 hover:bg-blue-700"
        onClick={() => {
          setSelectedCharges([]);
          setSelectedMethod("");
          setCardComplete(false);
          setLastPaymentResult(null);
          setStep("select");
        }}
      >
        Volver al inicio
      </Button>
    </div>
  );

  // ── Historial de pagos ──────────────────────────────────────────────────────
  const PaymentHistory = () => (
    <div className="space-y-3">
      {(dashboardData?.paymentHistory || []).length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>Sin historial de pagos aún</p>
        </div>
      ) : (
        (dashboardData?.paymentHistory || []).map((p: any) => (
          <Card key={p.id} className="border-slate-200">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-slate-900">
                    {p.charge?.concept?.nombre || "Pago"}
                  </p>
                  <p className="text-sm text-slate-500">{p.charge?.student?.nombre_completo}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(p.fecha_pago || p.created_at).toLocaleDateString("es-MX")} •{" "}
                    {p.metodo}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">
                    $
                    {((p.monto_centavos || 0) / 100).toLocaleString("es-MX", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                  <Badge
                    variant="secondary"
                    className="text-xs mt-1 bg-green-100 text-green-700"
                  >
                    {p.estado}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  // ── Cargando ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Mi Portal de Pagos</h1>
          <p className="text-slate-500 text-sm">Instituto JFR — Ciclo 2025-2026</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5 border-b">
          <button
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              ["select", "pay", "confirm", "spei-pending", "success"].includes(step)
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500"
            }`}
            onClick={() => setStep("select")}
          >
            Pagar
          </button>
          <button
            className="pb-2 px-1 text-sm font-medium border-b-2 border-transparent text-slate-500"
            onClick={() => setStep("select")}
          >
            Historial
          </button>
        </div>

        {/* Stepper */}
        {step !== "success" && step !== "spei-pending" && (
          <div className="flex items-center justify-center gap-1 mb-6 text-xs">
            {[
              { key: "select",  label: "1. Seleccionar" },
              { key: "pay",     label: "2. Método" },
              { key: "confirm", label: "3. Confirmar" },
            ].map((s, i) => (
              <div key={s.key} className="flex items-center gap-1">
                <span
                  className={`px-2 py-0.5 rounded-full font-medium ${
                    step === s.key
                      ? "bg-blue-600 text-white"
                      : (["pay", "confirm"].includes(step) && i === 0) ||
                        (step === "confirm" && i === 1)
                      ? "bg-green-500 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {s.label}
                </span>
                {i < 2 && <span className="text-slate-300">→</span>}
              </div>
            ))}
          </div>
        )}

        {/* Contenido del paso */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          {step === "select"  && <SelectCharges />}
          {step === "pay"     && <PaymentMethod />}
          {step === "confirm" && <PaymentConfirm />}
          {step === "spei-pending" && <SpeiPending />}
          {step === "success" && <PaymentSuccess />}
        </div>

        {/* Historial (visible en paso select) */}
        {step === "select" && dashboardData?.paymentHistory?.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Pagos recientes</h3>
            <PaymentHistory />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Exportación: envuelve con <Elements> para proveer contexto de Stripe ──────
export default function PortalPadres3Clics() {
  return (
    <Elements stripe={stripePromise}>
      <PortalPadres3ClicsInner />
    </Elements>
  );
}
