import { Card, CardContent } from "@/components/ui/card";

export interface StripeReviewItem {
  id: number | string;
  event_id?: number;
  origen?: string;
  alumno?: string;
  concepto?: string | null;
  monto_centavos: number;
  fecha: string;
  payment_intent_id?: string;
  descripcion: string;
}

export function StripeReviewCard({ item }: { item: StripeReviewItem }) {
  return (
    <Card data-testid={`stripe-review-${item.event_id}`}>
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold">Cobro Stripe por revisar</h3>
        <p>{item.descripcion}</p>
        <p>Alumno: {item.alumno} · Concepto: {item.concepto ?? "Sin concepto"}</p>
        <p>Monto: ${(item.monto_centavos / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          {" · "}Fecha local: {item.fecha}</p>
        <p className="text-sm break-all">PaymentIntent: {item.payment_intent_id}</p>
      </CardContent>
    </Card>
  );
}
