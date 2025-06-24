import { Building2, Users, CreditCard, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SaaSInfo() {
  return (
    <Card className="mb-6 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          Plataforma SaaS - Pagos Escolares
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-green-600" />
            <span>Reduce carga operativa</span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-purple-600" />
            <span>Automatiza cobros y reduce morosidad</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <span>Conciliación automática + CFDI</span>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-600">
          <strong>Meta:</strong> Funcionar sin papel, sin llamadas de cobranza manuales y con tasa de pagos 
          antes del vencimiento superior al 80%. No es ERP ni LMS - solo pagos escolares.
        </div>
      </CardContent>
    </Card>
  );
}