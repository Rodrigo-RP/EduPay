import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Database, Users, CreditCard, CheckCircle, Copy, RefreshCw, AlertCircle } from "lucide-react";

export default function DemoSetup() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState<string>("");

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("/api/demo/seed", { method: "POST" }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setResult(data);
      if (data.success) {
        toast({ title: "✅ Datos demo cargados", description: "Base de datos poblada correctamente" });
      } else {
        toast({ title: "Error al cargar datos", description: data.error, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error de conexión", variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuración Demo</h1>
          <p className="text-slate-500 mt-1">
            Carga datos de prueba para explorar todas las funcionalidades de Edupay.
          </p>
        </div>

        {/* Acción principal */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Database className="w-5 h-5" />
              Poblar base de datos con datos demo
            </CardTitle>
            <CardDescription className="text-blue-700">
              Esto creará: 1 escuela • 2 campus • 6 usuarios admin • 10 familias • 10 estudiantes •
              5 conceptos de pago • ~50 cargos • pagos y CFDI simulados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {seedMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Cargando datos...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Cargar datos demo
                  </span>
                )}
              </Button>
              {result?.success && (
                <span className="flex items-center gap-1 text-green-700 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" /> Completado
                </span>
              )}
              {result && !result.success && (
                <span className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" /> {result.error}
                </span>
              )}
            </div>

            <p className="text-xs text-blue-600 mt-3">
              ⚠️ Esto borrará todos los datos existentes y los reemplazará con datos de prueba.
            </p>
          </CardContent>
        </Card>

        {/* Credenciales */}
        {result?.credenciales && (
          <>
            {/* Usuarios admin */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <Users className="w-5 h-5 text-blue-600" />
                  Usuarios Administrativos
                </CardTitle>
                <CardDescription>Acceden por la pantalla de login principal</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.credenciales.administradores.map((u: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border text-sm">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs shrink-0">{u.rol}</Badge>
                        <div>
                          <p className="font-mono font-medium">{u.email}</p>
                          <p className="text-slate-500">pwd: <span className="font-mono">{u.password}</span></p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => copyToClipboard(u.email, `admin-${i}`)}
                      >
                        {copied === `admin-${i}` ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tutores */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <CreditCard className="w-5 h-5 text-green-600" />
                  Tutores (Portal de Padres)
                </CardTitle>
                <CardDescription>
                  Acceden en <code className="bg-slate-100 px-1 rounded">/portal-padres</code> — todos usan la misma contraseña:{" "}
                  <code className="bg-slate-100 px-1 rounded font-bold">Demo2025!</code>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {result.credenciales.tutores.map((t: any, i: number) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-lg border text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-slate-800">Familia {t.familia}</p>
                        <Badge variant="secondary" className="text-xs">{t.campus}</Badge>
                      </div>
                      <p className="text-slate-600 text-xs mb-1">Estudiante: <span className="font-medium">{t.estudiante}</span></p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1">
                          <p className="text-xs text-slate-500">Padre: <code className="font-mono text-slate-700">{t.emailPadre}</code></p>
                          <p className="text-xs text-slate-500">Madre: <code className="font-mono text-slate-700">{t.emailMadre}</code></p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 shrink-0"
                          onClick={() => copyToClipboard(t.emailPadre, `tutor-${i}`)}
                        >
                          {copied === `tutor-${i}` ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tarjetas de prueba */}
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-amber-800 text-base">🧪 Tarjetas de prueba (Portal Padres)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-white rounded border">
                    <div>
                      <code className="font-mono font-bold">4242 4242 4242 4242</code>
                      <p className="text-xs text-slate-500">Cualquier fecha futura · CVV: 123</p>
                    </div>
                    <Badge className="bg-green-100 text-green-700">✓ Exitoso</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-white rounded border">
                    <div>
                      <code className="font-mono font-bold">4000 0000 0000 0002</code>
                      <p className="text-xs text-slate-500">Cualquier fecha futura · CVV: 123</p>
                    </div>
                    <Badge className="bg-red-100 text-red-700">✗ Declinada</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Log de seed */}
        {result?.logs && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-slate-600">Log del proceso</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-900 text-slate-100 rounded p-3 text-xs font-mono max-h-48 overflow-y-auto space-y-0.5">
                {result.logs.map((line: string, i: number) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
