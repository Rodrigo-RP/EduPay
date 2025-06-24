import Checkout from "@/pages/checkout";

interface PaymentModalProps {
  charge: {
    id: number;
    concept: { nombre: string };
    student: { nombre_completo: string };
    total_amount_centavos: number;
  };
  paymentMethods: Array<{
    id: number;
    tipo: string;
    last4: string;
  }>;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentModal({ charge, paymentMethods, onClose, onSuccess }: PaymentModalProps) {
  return (
    <Checkout
      charge={charge}
      paymentMethods={paymentMethods}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
