import { Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function SuperAdminAccess() {
  const [, setLocation] = useLocation();

  return (
    <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <Shield className="h-8 w-8 text-blue-600" />
        </div>
        <CardTitle className="text-blue-900">Panel Super Administrador</CardTitle>
        <CardDescription className="text-blue-700">
          Acceso exclusivo para propietario de software
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <div className="text-sm text-blue-800">
          <p><strong>Email:</strong> superadmin@edupay.com</p>
          <p><strong>Password:</strong> SuperAdmin123!</p>
        </div>
        <Button 
          onClick={() => setLocation("/super-admin-login")}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          <Shield className="h-4 w-4 mr-2" />
          Acceder al Panel
        </Button>
        <p className="text-xs text-blue-600">
          Control de plataforma SaaS y módulo de seguridad cibernética
        </p>
      </CardContent>
    </Card>
  );
}