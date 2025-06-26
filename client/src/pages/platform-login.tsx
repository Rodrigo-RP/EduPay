import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { 
  Headphones, Rocket, Shield, Eye, EyeOff, 
  Users, Target, Settings, Zap 
} from "lucide-react";

export default function PlatformLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileType, setProfileType] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const profileConfig = {
    support: {
      title: "Soporte Técnico",
      description: "Atención al cliente y resolución de incidencias",
      icon: Headphones,
      color: "bg-blue-600",
      dashboard: "/support-dashboard",
      features: [
        "Gestión de tickets",
        "Atención al cliente",
        "Resolución de incidencias",
        "Métricas de satisfacción"
      ]
    },
    implementation: {
      title: "Implementación",
      description: "Onboarding y configuración de nuevas escuelas",
      icon: Rocket,
      color: "bg-purple-600",
      dashboard: "/implementation-dashboard",
      features: [
        "Gestión de proyectos",
        "Configuración de sistemas",
        "Capacitación",
        "Go-live y seguimiento"
      ]
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/platform-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          email, 
          password, 
          profile_type: profileType 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Verificar que el usuario tenga el perfil correcto
        if (data.user?.role === profileType || (data.profile && data.profile.profile_type === profileType)) {
          localStorage.setItem("token", data.token);
          localStorage.setItem("user", JSON.stringify(data.user));
          localStorage.setItem("profile", JSON.stringify(data.profile));
          
          toast({
            title: "Acceso Autorizado",
            description: `Bienvenido al panel de ${profileConfig[profileType as keyof typeof profileConfig]?.title}`,
          });
          
          setLocation(profileConfig[profileType as keyof typeof profileConfig]?.dashboard || "/");
        } else {
          toast({
            title: "Acceso Denegado",
            description: `No tienes permisos para acceder al perfil de ${profileType}`,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Error de Autenticación",
          description: data.message || "Credenciales inválidas",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error de Conexión",
        description: "No se pudo conectar con el servidor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedProfile = profileType ? profileConfig[profileType as keyof typeof profileConfig] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side - Profile Selection */}
        <div className="space-y-6">
          <div className="text-center lg:text-left">
            <h1 className="text-4xl font-bold text-white mb-4">
              EscuelaPay Platform
            </h1>
            <p className="text-xl text-blue-200">
              Portal de acceso para equipos especializados
            </p>
          </div>

          <div className="grid gap-4">
            {Object.entries(profileConfig).map(([key, config]) => {
              const IconComponent = config.icon;
              return (
                <Card 
                  key={key}
                  className={`cursor-pointer transition-all duration-200 ${
                    profileType === key 
                      ? 'ring-2 ring-blue-400 bg-blue-50' 
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setProfileType(key)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className={`${config.color} rounded-lg p-3`}>
                        <IconComponent className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          {config.title}
                        </h3>
                        <p className="text-gray-600 mb-3">
                          {config.description}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {config.features.map((feature, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="flex items-center justify-center">
          <Card className="w-full max-w-md shadow-2xl border-slate-200">
            <CardHeader className="space-y-4 text-center">
              {selectedProfile ? (
                <div className="flex justify-center">
                  <div className={`h-16 w-16 ${selectedProfile.color} rounded-full flex items-center justify-center`}>
                    <selectedProfile.icon className="h-8 w-8 text-white" />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <div className="h-16 w-16 bg-gray-400 rounded-full flex items-center justify-center">
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                </div>
              )}
              <div>
                <CardTitle className="text-2xl font-bold text-gray-900">
                  {selectedProfile ? selectedProfile.title : "Selecciona un Perfil"}
                </CardTitle>
                <CardDescription className="text-gray-600">
                  {selectedProfile 
                    ? "Inicia sesión para acceder a tu dashboard especializado" 
                    : "Selecciona tu perfil profesional para continuar"
                  }
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profile">Perfil Profesional</Label>
                  <Select value={profileType} onValueChange={setProfileType} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona tu perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="support">
                        <div className="flex items-center gap-2">
                          <Headphones className="h-4 w-4" />
                          Soporte Técnico
                        </div>
                      </SelectItem>
                      <SelectItem value="implementation">
                        <div className="flex items-center gap-2">
                          <Rocket className="h-4 w-4" />
                          Especialista en Implementación
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Corporativo</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu.nombre@escuelapay.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={!profileType}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={!profileType}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={!password}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </Button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading || !profileType || !email || !password}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Verificando acceso...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {selectedProfile && <selectedProfile.icon className="h-4 w-4" />}
                      Acceder al Dashboard
                    </div>
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  ¿Problemas para acceder?{" "}
                  <a href="#" className="text-blue-600 hover:underline">
                    Contacta al administrador
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}