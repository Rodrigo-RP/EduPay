import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Shield, 
  Lock, 
  Eye, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  Users,
  Activity,
  Download,
  Settings,
  Smartphone,
  Globe,
  Key,
  RefreshCw,
  Clock,
  BarChart3,
  FileText,
  Bell
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SecurityMetrics {
  totalThreats: number;
  blockedAttacks: number;
  activeUsers: number;
  securityScore: number;
  lastUpdate: string;
}

interface SecurityEvent {
  id: string;
  type: 'LOGIN_ATTEMPT' | 'PAYMENT_REQUEST' | 'DATA_ACCESS' | 'ATTACK_BLOCKED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  timestamp: string;
  ipAddress: string;
  resolved: boolean;
}

interface ThreatAlert {
  id: string;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string;
  action: string;
}

export default function SeguridadCibernetica() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [securityMetrics, setSecurityMetrics] = useState<SecurityMetrics>({
    totalThreats: 127,
    blockedAttacks: 89,
    activeUsers: 1542,
    securityScore: 94,
    lastUpdate: new Date().toLocaleString()
  });

  const [securityEvents] = useState<SecurityEvent[]>([
    {
      id: "1",
      type: "ATTACK_BLOCKED",
      severity: "CRITICAL",
      description: "Intento de inyección SQL bloqueado",
      timestamp: "2025-06-26 17:23:15",
      ipAddress: "192.168.1.100",
      resolved: true
    },
    {
      id: "2", 
      type: "LOGIN_ATTEMPT",
      severity: "HIGH",
      description: "Múltiples intentos de login fallidos desde IP sospechosa",
      timestamp: "2025-06-26 17:18:42",
      ipAddress: "10.0.0.45",
      resolved: true
    },
    {
      id: "3",
      type: "DATA_ACCESS",
      severity: "MEDIUM", 
      description: "Acceso desde ubicación geográfica inusual",
      timestamp: "2025-06-26 16:55:30",
      ipAddress: "172.16.0.25",
      resolved: false
    }
  ]);

  const [threatAlerts] = useState<ThreatAlert[]>([
    {
      id: "1",
      title: "Patrón de ataque DDoS detectado",
      description: "Se detectaron 1,247 requests simultáneos desde 23 IPs diferentes",
      severity: "CRITICAL",
      timestamp: "Hace 12 minutos",
      action: "Activar protección DDoS automática"
    },
    {
      id: "2",
      title: "Dispositivo no reconocido",
      description: "Usuario admin.campus@escuela.mx accedió desde dispositivo nuevo",
      severity: "MEDIUM",
      timestamp: "Hace 45 minutos", 
      action: "Requerir autenticación 2FA"
    }
  ]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'LOW': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleRunSecurityScan = () => {
    toast({
      title: "Escaneo de seguridad iniciado",
      description: "Analizando todos los sistemas de protección..."
    });

    setTimeout(() => {
      setSecurityMetrics(prev => ({
        ...prev,
        securityScore: 98,
        lastUpdate: new Date().toLocaleString()
      }));
      
      toast({
        title: "Escaneo completado",
        description: "Sistema seguro - No se detectaron vulnerabilidades críticas"
      });
    }, 3000);
  };

  const handleGenerateReport = () => {
    const reportData = {
      fecha: new Date().toLocaleDateString(),
      metricas: securityMetrics,
      eventos: securityEvents,
      alertas: threatAlerts,
      recomendaciones: [
        "Actualizar contraseñas de administradores cada 90 días",
        "Revisar permisos de usuarios inactivos",
        "Implementar backup cifrado diario",
        "Auditoría de accesos privilegiados mensual"
      ]
    };

    const reportText = `
REPORTE DE SEGURIDAD CIBERNÉTICA - ESCUELAPAY
=============================================
Fecha: ${reportData.fecha}
Score de Seguridad: ${reportData.metricas.securityScore}/100

MÉTRICAS GENERALES:
- Amenazas detectadas: ${reportData.metricas.totalThreats}
- Ataques bloqueados: ${reportData.metricas.blockedAttacks}  
- Usuarios activos: ${reportData.metricas.activeUsers}
- Última actualización: ${reportData.metricas.lastUpdate}

EVENTOS RECIENTES:
${reportData.eventos.map(e => `- ${e.timestamp}: ${e.description} [${e.severity}]`).join('\n')}

ALERTAS ACTIVAS:
${reportData.alertas.map(a => `- ${a.title}: ${a.description} [${a.severity}]`).join('\n')}

RECOMENDACIONES:
${reportData.recomendaciones.map(r => `- ${r}`).join('\n')}
    `;

    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-seguridad-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Reporte generado",
      description: "Reporte de seguridad descargado exitosamente"
    });
  };

  const handleBlockIP = (ipAddress: string) => {
    toast({
      title: "IP bloqueada",
      description: `La dirección ${ipAddress} ha sido bloqueada permanentemente`,
      variant: "destructive"
    });
  };

  const handleEnable2FA = () => {
    toast({
      title: "2FA activado",
      description: "Autenticación de dos factores habilitada para todos los usuarios admin"
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-blue-600" />
            Seguridad Cibernética
          </h1>
          <p className="text-gray-600 mt-2">
            Centro de comando para protección avanzada de la plataforma de pagos
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleRunSecurityScan} className="bg-blue-600 hover:bg-blue-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            Escaneo Completo
          </Button>
          <Button onClick={handleGenerateReport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Reporte
          </Button>
        </div>
      </div>

      {/* Dashboard Principal */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Score de Seguridad</p>
                <p className="text-3xl font-bold text-green-600">{securityMetrics.securityScore}/100</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <Progress value={securityMetrics.securityScore} className="mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ataques Bloqueados</p>
                <p className="text-3xl font-bold text-red-600">{securityMetrics.blockedAttacks}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <Shield className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Últimas 24 horas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Usuarios Activos</p>
                <p className="text-3xl font-bold text-blue-600">{securityMetrics.activeUsers}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-green-600 mt-2">↑ 12% vs ayer</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Amenazas Detectadas</p>
                <p className="text-3xl font-bold text-orange-600">{securityMetrics.totalThreats}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Última semana</p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas Críticas */}
      {threatAlerts.some(alert => alert.severity === 'CRITICAL') && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Alerta crítica:</strong> Se detectaron {threatAlerts.filter(a => a.severity === 'CRITICAL').length} amenazas críticas que requieren atención inmediata.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="encriptacion">Encriptación</TabsTrigger>
          <TabsTrigger value="autenticacion">2FA/MFA</TabsTrigger>
          <TabsTrigger value="firewall">Firewall</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Estado de Protecciones */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Estado de Protecciones
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { name: "Firewall WAF", status: "ACTIVO", color: "green" },
                  { name: "Rate Limiting", status: "ACTIVO", color: "green" },
                  { name: "Detección de Fraude", status: "ACTIVO", color: "green" },
                  { name: "Encriptación AES-256", status: "ACTIVO", color: "green" },
                  { name: "Autenticación 2FA", status: "OPCIONAL", color: "yellow" },
                  { name: "Respaldo Automático", status: "ACTIVO", color: "green" }
                ].map((protection, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{protection.name}</span>
                    <Badge className={`${protection.color === 'green' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {protection.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Actividad en Tiempo Real */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Actividad en Tiempo Real
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {securityEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        event.severity === 'CRITICAL' ? 'bg-red-500' :
                        event.severity === 'HIGH' ? 'bg-orange-500' :
                        event.severity === 'MEDIUM' ? 'bg-yellow-500' : 'bg-green-500'
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{event.description}</p>
                        <p className="text-xs text-gray-500">{event.timestamp} • {event.ipAddress}</p>
                      </div>
                      {event.resolved ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="eventos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Registro de Eventos de Seguridad</CardTitle>
              <p className="text-sm text-gray-600">Monitoreo en tiempo real de todas las actividades de seguridad</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {securityEvents.map((event) => (
                  <div key={event.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={getSeverityColor(event.severity)}>
                            {event.severity}
                          </Badge>
                          <Badge variant="outline">{event.type}</Badge>
                        </div>
                        <h4 className="font-medium">{event.description}</h4>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {event.timestamp}
                          </span>
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {event.ipAddress}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleBlockIP(event.ipAddress)}
                        >
                          Bloquear IP
                        </Button>
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="encriptacion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Sistema de Encriptación Avanzada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-800">AES-256-CBC</h4>
                  <p className="text-sm text-green-600">Datos sensibles protegidos</p>
                  <Badge className="mt-2 bg-green-100 text-green-800">ACTIVO</Badge>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-800">PBKDF2</h4>
                  <p className="text-sm text-blue-600">Derivación de claves segura</p>
                  <Badge className="mt-2 bg-blue-100 text-blue-800">ACTIVO</Badge>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <h4 className="font-semibold text-purple-800">HMAC-SHA256</h4>
                  <p className="text-sm text-purple-600">Integridad de datos</p>
                  <Badge className="mt-2 bg-purple-100 text-purple-800">ACTIVO</Badge>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Configuraciones de Encriptación</h4>
                <div className="space-y-3">
                  {[
                    { item: "Contraseñas de usuarios", method: "Bcrypt (12 rounds)", status: "✓" },
                    { item: "Datos de tarjetas", method: "AES-256-CBC + Salt", status: "✓" },
                    { item: "Tokens de sesión", method: "JWT + HMAC", status: "✓" },
                    { item: "Comunicación HTTPS", method: "TLS 1.3", status: "✓" },
                    { item: "Base de datos", method: "Encriptación en reposo", status: "✓" }
                  ].map((config, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <span className="font-medium">{config.item}</span>
                        <p className="text-sm text-gray-600">{config.method}</p>
                      </div>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="autenticacion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Autenticación Multifactor (2FA/MFA)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-3">Métodos Disponibles</h4>
                  <div className="space-y-3">
                    {[
                      { method: "Google Authenticator (TOTP)", enabled: true, users: 23 },
                      { method: "SMS", enabled: true, users: 45 },
                      { method: "Email", enabled: true, users: 78 },
                      { method: "Códigos de respaldo", enabled: true, users: 23 }
                    ].map((auth, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <span className="font-medium">{auth.method}</span>
                          <p className="text-sm text-gray-600">{auth.users} usuarios activos</p>
                        </div>
                        <Badge className={auth.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {auth.enabled ? "ACTIVO" : "INACTIVO"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Estadísticas de Uso</h4>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Adopción 2FA</span>
                        <span className="text-sm font-medium">67%</span>
                      </div>
                      <Progress value={67} />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Verificaciones exitosas</span>
                        <span className="text-sm font-medium">94%</span>
                      </div>
                      <Progress value={94} />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">Usuarios con respaldo</span>
                        <span className="text-sm font-medium">45%</span>
                      </div>
                      <Progress value={45} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleEnable2FA} className="bg-blue-600 hover:bg-blue-700">
                  <Key className="h-4 w-4 mr-2" />
                  Forzar 2FA Global
                </Button>
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar Políticas
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firewall" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Firewall de Aplicación Web (WAF)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <h4 className="text-2xl font-bold text-red-600">89</h4>
                  <p className="text-sm text-red-600">Ataques bloqueados hoy</p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg text-center">
                  <h4 className="text-2xl font-bold text-yellow-600">1,247</h4>
                  <p className="text-sm text-yellow-600">Requests analizados</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <h4 className="text-2xl font-bold text-green-600">99.7%</h4>
                  <p className="text-sm text-green-600">Disponibilidad</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Reglas de Protección Activas</h4>
                <div className="space-y-3">
                  {[
                    { rule: "Protección SQL Injection", threats: 23, status: "ACTIVO" },
                    { rule: "Protección XSS", threats: 15, status: "ACTIVO" },
                    { rule: "Rate Limiting", threats: 34, status: "ACTIVO" },
                    { rule: "Geoblocking", threats: 8, status: "ACTIVO" },
                    { rule: "Bot Protection", threats: 9, status: "ACTIVO" }
                  ].map((rule, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <span className="font-medium">{rule.rule}</span>
                        <p className="text-sm text-gray-600">{rule.threats} amenazas bloqueadas</p>
                      </div>
                      <Badge className="bg-green-100 text-green-800">{rule.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auditoria" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Auditoría y Cumplimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-3">Estándares de Cumplimiento</h4>
                  <div className="space-y-3">
                    {[
                      { standard: "PCI DSS v4.0", compliance: 94, status: "CUMPLE" },
                      { standard: "ISO 27001", compliance: 87, status: "CUMPLE" },
                      { standard: "OWASP Top 10", compliance: 100, status: "CUMPLE" },
                      { standard: "GDPR", compliance: 92, status: "CUMPLE" }
                    ].map((std, index) => (
                      <div key={index} className="p-3 border rounded">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">{std.standard}</span>
                          <Badge className="bg-green-100 text-green-800">{std.status}</Badge>
                        </div>
                        <Progress value={std.compliance} />
                        <p className="text-xs text-gray-500 mt-1">{std.compliance}% cumplimiento</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Logs de Auditoría</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {[
                      "Usuario admin.campus@escuela.mx inició sesión",
                      "Configuración de firewall actualizada",
                      "Backup automático completado",
                      "Usuario padre.familia@gmail.com realizó pago",
                      "Escaneo de vulnerabilidades ejecutado",
                      "Certificado SSL renovado automáticamente"
                    ].map((log, index) => (
                      <div key={index} className="text-sm p-2 bg-gray-50 rounded">
                        <span className="text-gray-500">{new Date().toLocaleTimeString()}</span> - {log}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={handleGenerateReport}>
                  <Download className="h-4 w-4 mr-2" />
                  Reporte de Auditoría
                </Button>
                <Button variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Análisis de Cumplimiento
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}