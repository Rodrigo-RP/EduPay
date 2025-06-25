import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CheckoutProps {
  charge?: {
    id: number;
    concept: { nombre: string };
    student: { nombre_completo: string };
    total_amount_centavos: number;
  };
  paymentMethods?: Array<{
    id: number;
    tipo: string;
    last4: string;
  }>;
  onClose: () => void;
  onSuccess: () => void;
}

export default function Checkout({ charge, paymentMethods = [], onClose, onSuccess }: CheckoutProps) {
  const [paymentMethod, setPaymentMethod] = useState("saved-card");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const formatCurrency = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  const processPaymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      const response = await apiRequest("POST", "/api/payments/process", paymentData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "¡Pago exitoso!",
        description: "Tu pago ha sido procesado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/guardian/dashboard"] });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error en el pago",
        description: error.message || "No se pudo procesar el pago",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!charge) return;

    const paymentData = {
      charge_id: charge.id,
      payment_method: paymentMethod === "saved-card" ? "tarjeta" : "tarjeta",
      amount_centavos: charge.total_amount_centavos,
    };

    processPaymentMutation.mutate(paymentData);
  };

  if (!charge) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-slate-600">No se encontró información del cargo a pagar</p>
            <Button onClick={onClose} className="mt-4">Cerrar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="pb-4">
      <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-slate-900">
              Confirmar Pago
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600"
            >
              <i className="fas fa-times"></i>
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Payment Details */}
        <div className="bg-slate-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Concepto:</span>
                <span className="font-medium text-slate-900">{charge.concept.nombre}</span>
              </div>
          <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Estudiante:</span>
                <span className="font-medium text-slate-900">{charge.student.nombre_completo}</span>
              </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-sm text-slate-600">Total a pagar:</span>
                <span className="text-xl font-bold text-primary-600">
                  {formatCurrency(charge.total_amount_centavos)}
                </span>
              </div>
            </div>

            {/* Payment Method Selection */}
        <div>
              <Label className="text-sm font-medium text-slate-900 mb-3 block">
                Método de pago
              </Label>
              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                {paymentMethods.length > 0 && (
              <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg">
                    <RadioGroupItem value="saved-card" id="saved-card" />
                    <Label htmlFor="saved-card" className="flex items-center flex-1 cursor-pointer">
                      <i className="fas fa-credit-card text-slate-400 mr-3"></i>
                  <div>
                    <p className="font-medium text-slate-900">•••• •••• •••• {paymentMethods[0]?.last4}</p>
                    <p className="text-sm text-slate-500">
                          {paymentMethods[0]?.tipo.charAt(0).toUpperCase() + paymentMethods[0]?.tipo.slice(1)} terminada en {paymentMethods[0]?.last4}
                        </p>
                      </div>
                    </Label>
                  </div>
                )}
                
            <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg">
                  <RadioGroupItem value="new-card" id="new-card" />
                  <Label htmlFor="new-card" className="flex items-center cursor-pointer">
                    <i className="fas fa-plus text-slate-400 mr-3"></i>
                    <span className="text-slate-700">Nueva tarjeta</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* New Card Form */}
            {paymentMethod === "new-card" && (
          <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
            <div>
                  <Label htmlFor="card-name" className="text-sm">Nombre en la tarjeta</Label>
                  <Input
                    id="card-name"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="Juan Pérez González"
                    required
                  />
                </div>
            <div>
                  <Label htmlFor="card-number" className="text-sm">Número de tarjeta</Label>
                  <Input
                    id="card-number"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    required
                  />
                </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                    <Label htmlFor="expiry" className="text-sm">MM/AA</Label>
                    <Input
                      id="expiry"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      placeholder="12/25"
                      maxLength={5}
                      required
                    />
                  </div>
              <div>
                    <Label htmlFor="cvv" className="text-sm">CVV</Label>
                    <Input
                      id="cvv"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      placeholder="123"
                      maxLength={4}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
        <div className="flex space-x-3 pt-4">
          <Button 
                type="button"
                variant="secondary"
                onClick={onClose}
                className="flex-1"
                disabled={processPaymentMutation.isPending}
              >
                Cancelar
              </Button>
          <Button 
                type="submit"
                className="flex-1 bg-primary-600 hover:bg-primary-700"
                disabled={processPaymentMutation.isPending}
              >
                {processPaymentMutation.isPending ? (
              <div className="flex items-center">
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Procesando...
                  </div>
                ) : (
                  `Pagar ${formatCurrency(charge.total_amount_centavos)}`
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
