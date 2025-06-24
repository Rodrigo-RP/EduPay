import { Building2, Users, CreditCard, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SaaSInfo() {
  return (
    <Card className="mb-6 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          Plataforma SaaS Multi-Tenant
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-green-600" />
            <span>Múltiples instituciones educativas</span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-purple-600" />
            <span>Procesamiento unificado de pagos</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <span>Aislamiento completo de datos</span>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-600">
          Esta es una solución SaaS web que permite a múltiples colegios gestionar sus pagos desde una sola plataforma,
          manteniendo la separación total de datos entre instituciones.
        </div>
      </CardContent>
    </Card>
  );
}