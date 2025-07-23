import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CuentasPorCobrarsTest() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Cuentas por Cobrar - Test</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Página de prueba funcionando</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Si puedes ver esto, la página está funcionando correctamente.</p>
        </CardContent>
      </Card>
    </div>
  );
}