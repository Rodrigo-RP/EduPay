import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Cloud, 
  Code, 
  Settings, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle,
  Monitor,
  Zap,
  Users,
  Database
} from 'lucide-react';

interface ProjectInfo {
  id?: string;
  slug?: string;
  owner?: string;
  url?: string;
  isReplit: boolean;
}

interface ProjectMetrics {
  uptime: number;
  memory: any;
  platform: string;
  version: string;
  replitEnvironment: boolean;
}

export default function IntegracionReplit() {
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({ isReplit: false });
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null);
  const [availableFeatures, setAvailableFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [oauthConfig, setOauthConfig] = useState({
    clientId: '',
    clientSecret: '',
    redirectUri: ''
  });
  
  const { toast } = useToast();

  useEffect(() => {
    loadReplitInfo();
  }, []);

  const loadReplitInfo = async () => {
    try {
      setLoading(true);
      
      // Obtener información del proyecto
      const infoResponse = await fetch('/api/replit/project-info');
      const info = await infoResponse.json();
      setProjectInfo(info);

      // Obtener métricas
      const metricsResponse = await fetch('/api/replit/metrics');
      const metricsData = await metricsResponse.json();
      setMetrics(metricsData);

      // Obtener funcionalidades disponibles
      const featuresResponse = await fetch('/api/replit/features');
      const features = await featuresResponse.json();
      setAvailableFeatures(features);

    } catch (error) {
      console.error('Error loading Replit info:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar la información de Replit",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSetup = async () => {
    try {
      const response = await fetch('/api/replit/setup-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(oauthConfig)
      });

      if (response.ok) {
        toast({
          title: "OAuth configurado",
          description: "La integración OAuth con Replit ha sido configurada correctamente"
        });
        loadReplitInfo();
      } else {
        throw new Error('Failed to setup OAuth');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo configurar OAuth",
        variant: "destructive"
      });
    }
  };

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatMemory = (bytes: number): string => {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Cargando información de Replit...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-white/20 rounded-xl">
            <Cloud className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Integración con Replit</h1>
            <p className="text-blue-100">Configuración y gestión de la integración con la plataforma Replit</p>
          </div>
        </div>
      </div>

      {/* Estado del Proyecto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Monitor className="w-5 h-5" />
              <span>Estado del Proyecto</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Ejecutándose en Replit:</span>
                <Badge variant={projectInfo.isReplit ? "default" : "secondary"}>
                  {projectInfo.isReplit ? "Sí" : "No"}
                </Badge>
              </div>
              
              {projectInfo.isReplit && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Proyecto:</span>
                    <span className="text-sm">{projectInfo.slug}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Propietario:</span>
                    <span className="text-sm">{projectInfo.owner}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">URL del Proyecto:</span>
                    <Button variant="outline" size="sm" asChild>
                      <a href={projectInfo.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Abrir
                      </a>
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="w-5 h-5" />
              <span>Métricas</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics && (
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Tiempo activo</div>
                  <div className="font-semibold">{formatUptime(metrics.uptime)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Memoria utilizada</div>
                  <div className="font-semibold">{formatMemory(metrics.memory.heapUsed)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Node.js</div>
                  <div className="font-semibold">{metrics.version}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Plataforma</div>
                  <div className="font-semibold">{metrics.platform}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Funcionalidades */}
      <Tabs defaultValue="features" className="space-y-4">
        <TabsList>
          <TabsTrigger value="features">Funcionalidades</TabsTrigger>
          <TabsTrigger value="oauth">Autenticación OAuth</TabsTrigger>
          <TabsTrigger value="deployment">Deployment</TabsTrigger>
          <TabsTrigger value="api">API Integration</TabsTrigger>
        </TabsList>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Funcionalidades Disponibles</CardTitle>
              <CardDescription>
                Funcionalidades de Replit disponibles para tu proyecto Edupay
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { id: 'basic_info', name: 'Información Básica', icon: Monitor, available: availableFeatures.includes('basic_info') },
                  { id: 'metrics', name: 'Métricas del Sistema', icon: Database, available: availableFeatures.includes('metrics') },
                  { id: 'oauth_auth', name: 'Autenticación OAuth', icon: Users, available: availableFeatures.includes('oauth_auth') },
                  { id: 'deployment_info', name: 'Info de Deployment', icon: Cloud, available: availableFeatures.includes('deployment_info') },
                  { id: 'replit_integration', name: 'Integración Completa', icon: Code, available: availableFeatures.includes('replit_integration') }
                ].map((feature) => (
                  <div key={feature.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <feature.icon className="w-5 h-5" />
                    <div className="flex-1">
                      <div className="font-medium">{feature.name}</div>
                    </div>
                    {feature.available ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="oauth">
          <Card>
            <CardHeader>
              <CardTitle>Configuración OAuth</CardTitle>
              <CardDescription>
                Configura la autenticación OAuth para permitir que usuarios se conecten con sus cuentas de Replit
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clientId">Client ID</Label>
                  <Input
                    id="clientId"
                    value={oauthConfig.clientId}
                    onChange={(e) => setOauthConfig({...oauthConfig, clientId: e.target.value})}
                    placeholder="Tu Client ID de Replit"
                  />
                </div>
                <div>
                  <Label htmlFor="clientSecret">Client Secret</Label>
                  <Input
                    id="clientSecret"
                    type="password"
                    value={oauthConfig.clientSecret}
                    onChange={(e) => setOauthConfig({...oauthConfig, clientSecret: e.target.value})}
                    placeholder="Tu Client Secret de Replit"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="redirectUri">Redirect URI</Label>
                  <Input
                    id="redirectUri"
                    value={oauthConfig.redirectUri}
                    onChange={(e) => setOauthConfig({...oauthConfig, redirectUri: e.target.value})}
                    placeholder="https://tu-app.repl.co/auth/callback"
                  />
                </div>
              </div>
              
              <Button onClick={handleOAuthSetup} className="w-full">
                <Settings className="w-4 h-4 mr-2" />
                Configurar OAuth
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deployment">
          <Card>
            <CardHeader>
              <CardTitle>Información de Deployment</CardTitle>
              <CardDescription>
                Estado y configuración del deployment en Replit
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {projectInfo.isReplit ? (
                  <>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-green-900">Proyecto Desplegado</span>
                      </div>
                      <p className="text-sm text-green-700 mt-1">
                        Tu aplicación Edupay está ejecutándose en Replit
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-medium">URL Pública</div>
                        <div className="text-sm text-muted-foreground">Accede a tu aplicación desde cualquier lugar</div>
                      </div>
                      <Button variant="outline" asChild>
                        <a href={projectInfo.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Abrir App
                        </a>
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-yellow-600" />
                      <span className="font-medium text-yellow-900">No está en Replit</span>
                    </div>
                    <p className="text-sm text-yellow-700 mt-1">
                      Esta aplicación no está ejecutándose en Replit. Algunas funcionalidades pueden no estar disponibles.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>Integración API</CardTitle>
              <CardDescription>
                Configuración y uso de APIs de Replit en tu aplicación
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3">APIs Disponibles</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">Extensions API</div>
                        <div className="text-sm text-muted-foreground">Autenticación, archivos, comandos</div>
                      </div>
                      <Badge variant="default">Disponible</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">Replit Auth</div>
                        <div className="text-sm text-muted-foreground">OAuth para usuarios</div>
                      </div>
                      <Badge variant={availableFeatures.includes('oauth_auth') ? "default" : "secondary"}>
                        {availableFeatures.includes('oauth_auth') ? "Configurado" : "No configurado"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">GraphQL API</div>
                        <div className="text-sm text-muted-foreground">Metadatos del proyecto</div>
                      </div>
                      <Badge variant="outline">Experimental</Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Casos de Uso</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="font-medium mb-2">Autenticación de Usuarios</div>
                      <p className="text-sm text-muted-foreground">
                        Permite que usuarios de colegios se autentiquen con sus cuentas Replit
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="font-medium mb-2">Deploy Automático</div>
                      <p className="text-sm text-muted-foreground">
                        Integra deploys automáticos cuando se actualice el código
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="font-medium mb-2">Gestión de Configuración</div>
                      <p className="text-sm text-muted-foreground">
                        Sincroniza configuraciones entre diferentes instancias
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="font-medium mb-2">Monitoreo</div>
                      <p className="text-sm text-muted-foreground">
                        Monitorea el estado y rendimiento de la aplicación
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}