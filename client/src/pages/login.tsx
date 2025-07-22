import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [adminEmail, setAdminEmail] = useState("contador@jfr.edu.mx");
  const [adminPassword, setAdminPassword] = useState("demo123");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPassword, setGuardianPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const { login, guardianLogin } = useAuth();
  const { toast } = useToast();

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await login(adminEmail, adminPassword);
      toast({
        title: "Bienvenido",
        description: "Has iniciado sesión correctamente",
      });
    } catch (error: any) {
      toast({
        title: "Error al iniciar sesión",
        description: error.message || "Credenciales inválidas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuardianLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await guardianLogin(guardianEmail, guardianPassword);
      toast({
        title: "Bienvenido",
        description: "Has iniciado sesión correctamente",
      });
    } catch (error: any) {
      toast({
        title: "Error al iniciar sesión",
        description: error.message || "Credenciales inválidas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
      <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-graduation-cap text-white text-2xl"></i>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">EscuelaPay</h1>
          <p className="text-slate-600 mt-2">Plataforma de Pagos Escolares</p>
        </div>

        <Card className="shadow-lg border border-slate-200">
          <CardHeader>
            <CardTitle className="text-center text-xl text-slate-900">
              Iniciar Sesión
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="guardian" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="guardian">Padres de Familia</TabsTrigger>
                <TabsTrigger value="admin">Administrador</TabsTrigger>
              </TabsList>
              
              <TabsContent value="guardian" className="mt-6">
                <form onSubmit={handleGuardianLogin} className="space-y-4">
              <div className="space-y-2">
                    <Label htmlFor="guardian-email">Correo electrónico</Label>
                    <Input
                      id="guardian-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={guardianEmail}
                      onChange={(e) => setGuardianEmail(e.target.value)}
                      required
                    />
                  </div>
              <div className="space-y-2">
                    <Label htmlFor="guardian-password">Contraseña</Label>
                    <Input
                      id="guardian-password"
                      type="password"
                      placeholder="••••••••"
                      value={guardianPassword}
                      onChange={(e) => setGuardianPassword(e.target.value)}
                      required
                    />
                  </div>
              <Button 
                    type="submit" 
                    className="w-full bg-primary-600 hover:bg-primary-700"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Iniciando sesión...
                      </div>
                    ) : (
                      "Iniciar sesión como Padre"
                    )}
                  </Button>
                </form>
                
                {/* Demo credentials hint */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700 font-medium mb-1">Credenciales de demo:</p>
              <p className="text-xs text-blue-600">Email: padre@demo.com</p>
              <p className="text-xs text-blue-600">Contraseña: demo123</p>
                </div>
              </TabsContent>
              
              <TabsContent value="admin" className="mt-6">
                <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="space-y-2">
                    <Label htmlFor="admin-email">Correo electrónico</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      placeholder="admin@escuela.edu.mx"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                    />
                  </div>
              <div className="space-y-2">
                    <Label htmlFor="admin-password">Contraseña</Label>
                    <Input
                      id="admin-password"
                      type="password"
                      placeholder="••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                    />
                  </div>
              <Button 
                    type="submit" 
                    className="w-full bg-primary-600 hover:bg-primary-700"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Iniciando sesión...
                      </div>
                    ) : (
                      "Iniciar sesión como Admin"
                    )}
                  </Button>
                </form>
                
                {/* Demo credentials hint */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700 font-medium mb-1">Credenciales de demo:</p>
              <p className="text-xs text-blue-600">Email: admin@demo.com</p>
              <p className="text-xs text-blue-600">Contraseña: admin123</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-500">
          <p>Plataforma segura para pagos escolares</p>
          <p className="mt-1">© 2024 EscuelaPay. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  );
}
