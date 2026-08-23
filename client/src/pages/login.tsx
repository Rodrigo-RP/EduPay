import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Shield, Users, Building2, Calculator, UserCheck, ClipboardList, GraduationCap, Smartphone, ArrowLeft } from "lucide-react";

type Step = "credentials" | "totp";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [step, setStep] = useState<Step>("credentials");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login } = useAuth();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Step 1: credentials only; Step 2: credentials + TOTP code
      await login(email, password, step === "totp" ? totpCode : undefined);
      toast({
        title: "Acceso autorizado",
        description: "Bienvenido al sistema administrativo",
      });
    } catch (error: any) {
      if (error?.requires_totp) {
        // Server confirmed credentials and is asking for TOTP
        setStep("totp");
        setTotpCode("");
        setIsLoading(false);
        return;
      }
      toast({
        title: "Error de autenticación",
        description: error.message || "Credenciales inválidas o acceso no autorizado",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const administrativeRoles = [
    { icon: Shield, title: "Super Administrador", description: "Control total del sistema" },
    { icon: Users, title: "Administrador General", description: "Gestión completa de la institución" },
    { icon: Building2, title: "Administrador de Campus", description: "Administración de campus específico" },
    { icon: Calculator, title: "Contador General", description: "Gestión financiera y contable" },
    { icon: UserCheck, title: "Auxiliar Contable", description: "Asistencia en procesos contables" },
    { icon: ClipboardList, title: "Asistente Administrativo", description: "Apoyo en tareas administrativas" },
    { icon: GraduationCap, title: "Personal de Admisiones", description: "Gestión de procesos de admisión" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">

        {/* Left Side - Branding and Role Information */}
        <div className="space-y-8">
          <div className="text-center lg:text-left">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl flex items-center justify-center mx-auto lg:mx-0 mb-6 shadow-lg">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Edupay</h1>
            <p className="text-lg text-slate-600 mb-4">Plataforma Administrativa SaaS</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Roles Administrativos</h3>
            <div className="grid gap-3">
              {administrativeRoles.map((role, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-white/70 rounded-lg border border-slate-200/50">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <role.icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{role.title}</p>
                    <p className="text-xs text-slate-600">{role.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="w-full max-w-md mx-auto">
          <Card className="shadow-xl border border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl text-slate-900 flex items-center justify-center gap-2">
                {step === "totp" ? (
                  <><Smartphone className="w-6 h-6 text-blue-600" />Verificación en dos pasos</>
                ) : (
                  <><Shield className="w-6 h-6 text-blue-600" />Acceso Administrativo</>
                )}
              </CardTitle>
              <p className="text-sm text-slate-600">
                {step === "totp"
                  ? "Ingresa el código de 6 dígitos de tu aplicación de autenticación"
                  : "Sistema restringido para personal autorizado"}
              </p>
            </CardHeader>
            <CardContent>
              {step === "credentials" && (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-700">Correo Institucional</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="usuario@institucion.edu.mx"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-white border-slate-300 focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-700">Contraseña</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="bg-white border-slate-300 focus:border-blue-500 pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-slate-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-slate-500" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center">
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Verificando credenciales...
                      </div>
                    ) : (
                      <><Shield className="w-4 h-4 mr-2" />Ingresar al Sistema</>
                    )}
                  </Button>
                </form>
              )}

              {step === "totp" && (
                <form onSubmit={handleLogin} className="space-y-5">
                  {/* 2FA info banner */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                    <Smartphone className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">Abre tu app de autenticación</p>
                      <p className="text-xs text-blue-600">Google Authenticator, Authy u otra compatible con TOTP</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="totp" className="text-slate-700">Código de verificación</Label>
                    <Input
                      id="totp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      placeholder="000000"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      autoFocus
                      className="bg-white border-slate-300 focus:border-blue-500 text-center text-2xl tracking-[0.5em] font-mono"
                    />
                    <p className="text-xs text-slate-500 text-center">
                      El código cambia cada 30 segundos
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3"
                    disabled={isLoading || totpCode.length < 6}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Verificando código...
                      </div>
                    ) : (
                      <><Shield className="w-4 h-4 mr-2" />Confirmar acceso</>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-slate-600 hover:text-slate-800"
                    onClick={() => { setStep("credentials"); setTotpCode(""); }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver al inicio de sesión
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Security Footer */}
          <div className="text-center mt-6 space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
              <Shield className="w-4 h-4" />
              <span>Conexión segura y cifrada</span>
            </div>
            <p className="text-xs text-slate-500">© 2024 Edupay SaaS. Sistema exclusivo para instituciones educativas.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
