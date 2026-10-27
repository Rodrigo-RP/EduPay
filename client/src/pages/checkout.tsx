import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CheckoutProps {
  charge?: {
    id: number;
    concept: { nombre: string };
    student: { nombre_completo: string };
    total_amount_centavos: number;
  };
  paymentMethods?: Array<{ id: number; tipo: string; last4: string }>;
  onClose: () => void;
  onSuccess: () => void;
}

/** El checkout heredado delega al portal con Stripe Elements; no captura PAN/CVV ni simula pagos. */
export default function Checkout({ charge, onClose }: CheckoutProps) {
  const configured = Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Pago seguro</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {charge ? (
            <>
              <p>{charge.concept.nombre} — {charge.student.nombre_completo}</p>
              <p className="text-xl font-semibold">{new Intl.NumberFormat("es-MX", {
                style: "currency", currency: "MXN",
              }).format(charge.total_amount_centavos / 100)}</p>
              <p>Continúa en el portal de pagos para ingresar tu tarjeta de forma segura y confirmar el cobro.</p>
              {configured ? (
                <Button asChild className="w-full">
                  <a href={`/portal-3clics?cargo=${charge.id}`}>Continuar al pago seguro</a>
                </Button>
              ) : (
                <div role="status">
                  <p>Pago con tarjeta no disponible por ahora</p>
                  <Button disabled className="w-full mt-2">Pago con tarjeta no disponible por ahora</Button>
                </div>
              )}
            </>
          ) : <p>No se encontró información del cargo a pagar.</p>}
          <Button variant="outline" className="w-full" onClick={() => onClose?.()}>Cerrar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
