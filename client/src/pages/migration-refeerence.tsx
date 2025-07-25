import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowRight, 
  Cloud, 
  Code, 
  Download, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle,
  Upload,
  Database,
  FileCode,
  Settings,
  Loader2,
  Copy,
  Eye
} from 'lucide-react';

interface ReplitProject {
  id: string;
  title: string;
  description: string;
  language: string;
  url: string;
  lastUpdated: string;
  isEdupay: boolean;
  filesCount?: number;
  dependenciesCount?: number;
  secretsCount?: number;
}

interface MigrationProgress {
  step: string;
  progress: number;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message: string;
  timestamp?: string;
}

interface MigrationSession {
  sessionId: string;
  status: string;
  currentStep: string;
  progress: number;
  history: MigrationProgress[];
  startedAt: string;
  completedAt?: string;
  result?: any;
}

export default function MigrationRefeerence() {
  const [replitToken, setReplitToken] = useState('');
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<ReplitProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ReplitProject | null>(null);
  const [migrationSession, setMigrationSession] = useState<MigrationSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentTab, setCurrentTab] = useState('setup');
  
  const { toast } = useToast();

  // Validar token de Replit
  const validateToken = async () => {
    if (!replitToken.trim()) {
      toast({
        title: "Token requerido",
        description: "Debes proporcionar un token válido de Replit",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/migration/validate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: replitToken })
      });

      const data = await response.json();
      
      if (data.valid) {
        setTokenValid(true);
        toast({
          title: "Token válido",
          description: "Token de Replit verificado correctamente"
        });
        await loadProjects();
      } else {
        setTokenValid(false);
        toast({
          title: "Token inválido",
          description: data.message || "El token no es válido",
          variant: "destructive"
        });
      }
    } catch (error) {
      setTokenValid(false);
      toast({
        title: "Error de conexión",
        description: "No se pudo verificar el token",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Cargar proyectos del usuario
  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/migration/projects', {
        headers: {
          'Authorization': `Bearer ${replitToken}`
        }
      });

      const data = await response.json();
      setProjects(data.projects || []);
      
      // Buscar proyecto EDUPAY automáticamente
      const edupayProject = data.projects.find((p: ReplitProject) => p.isEdupay);
      if (edupayProject) {
        setSelectedProject(edupayProject);
        await loadProjectDetails(edupayProject.id);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los proyectos",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Cargar detalles del proyecto
  const loadProjectDetails = async (projectId: string) => {
    try {
      const response = await fetch(`/api/migration/project/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${replitToken}`
        }
      });

      const data = await response.json();
      if (data.project) {
        setSelectedProject(prev => prev ? { ...prev, ...data.project } : data.project);
      }
    } catch (error) {
      console.error('Error loading project details:', error);
    }
  };

  // Iniciar migración
  const startMigration = async () => {
    if (!selectedProject) {
      toast({
        title: "Proyecto requerido",
        description: "Debes seleccionar un proyecto para migrar",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/migration/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${replitToken}`
        },
        body: JSON.stringify({
          projectId: selectedProject.id,
          config: {
            includeSecrets: true,
            includeDependencies: true,
            includeDatabase: true,
            preserveStructure: true
          }
        })
      });

      const data = await response.json();
      
      if (data.sessionId) {
        setMigrationSession({
          sessionId: data.sessionId,
          status: 'pending',
          currentStep: 'initialization',
          progress: 0,
          history: [],
          startedAt: new Date().toISOString()
        });
        
        setCurrentTab('progress');
        
        toast({
          title: "Migración iniciada",
          description: "La migración de EDUPAY ha comenzado"
        });

        // Iniciar polling del progreso
        pollMigrationProgress(data.sessionId);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo iniciar la migración",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Monitorear progreso de migración
  const pollMigrationProgress = async (sessionId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/migration/progress/${sessionId}`);
        const session = await response.json();
        
        setMigrationSession(session);
        
        if (session.status === 'completed' || session.status === 'error') {
          clearInterval(pollInterval);
          
          if (session.status === 'completed') {
            setCurrentTab('result');
            toast({
              title: "Migración completada",
              description: "EDUPAY ha sido migrado exitosamente"
            });
          } else {
            toast({
              title: "Migración falló",
              description: session.error || "Ocurrió un error durante la migración",
              variant: "destructive"
            });
          }
        }
      } catch (error) {
        console.error('Error polling migration progress:', error);
        clearInterval(pollInterval);
      }
    }, 2000);
  };

  // Descargar resultado de migración
  const downloadMigration = async () => {
    if (!migrationSession?.sessionId) return;

    try {
      const response = await fetch(`/api/migration/download/${migrationSession.sessionId}`);
      const data = await response.json();
      
      // Crear enlace de descarga
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.name || 'edupay_migrated.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Descarga iniciada",
        description: "Los archivos de EDUPAY se están descargando"
      });
    } catch (error) {
      toast({
        title: "Error de descarga",
        description: "No se pudo descargar la migración",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-2xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-white/20 rounded-xl">
            <ArrowRight className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Migración a Refeerence</h1>
            <p className="text-purple-100">Migra el proyecto EDUPAY desde Replit hacia tu plataforma Refeerence</p>
          </div>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={setCurrentTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="setup">Configuración</TabsTrigger>
          <TabsTrigger value="projects" disabled={!tokenValid}>Proyectos</TabsTrigger>
          <TabsTrigger value="progress" disabled={!migrationSession}>Progreso</TabsTrigger>
          <TabsTrigger value="result" disabled={migrationSession?.status !== 'completed'}>Resultado</TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="w-5 h-5" />
                <span>Configuración de Token Replit</span>
              </CardTitle>
              <CardDescription>
                Proporciona tu token de Replit para acceder a tus proyectos y migrar EDUPAY
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="replitToken">Token de Replit</Label>
                <div className="flex space-x-2 mt-1">
                  <Input
                    id="replitToken"
                    type="password"
                    placeholder="Pega aquí tu token de Replit"
                    value={replitToken}
                    onChange={(e) => setReplitToken(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={validateToken} 
                    disabled={loading || !replitToken.trim()}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Validar'
                    )}
                  </Button>
                </div>
              </div>

              {tokenValid !== null && (
                <div className={`p-4 rounded-lg border ${
                  tokenValid 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center space-x-2">
                    {tokenValid ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span className={`font-medium ${
                      tokenValid ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {tokenValid ? 'Token válido' : 'Token inválido'}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${
                    tokenValid ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {tokenValid 
                      ? 'Puedes proceder a seleccionar proyectos' 
                      : 'Verifica que el token sea correcto y tenga permisos'
                    }
                  </p>
                </div>
              )}

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">¿Cómo obtener el token?</h3>
                <ol className="text-sm text-blue-700 space-y-1">
                  <li>1. Ve a tu cuenta de Replit</li>
                  <li>2. Accede a Settings → Account</li>
                  <li>3. Busca la sección "API tokens"</li>
                  <li>4. Genera un nuevo token o copia uno existente</li>
                  <li>5. Pégalo en el campo de arriba</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Code className="w-5 h-5" />
                  <span>Proyectos Disponibles</span>
                </CardTitle>
                <CardDescription>
                  Selecciona el proyecto EDUPAY que quieres migrar a Refeerence
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>Cargando proyectos...</span>
                  </div>
                ) : projects.length > 0 ? (
                  <div className="space-y-4">
                    {projects.map((project) => (
                      <div 
                        key={project.id} 
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedProject?.id === project.id 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedProject(project)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-semibold">{project.title}</h3>
                              {project.isEdupay && (
                                <Badge variant="default">EDUPAY</Badge>
                              )}
                              <Badge variant="outline">{project.language}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {project.description || 'Sin descripción'}
                            </p>
                            <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                              <span>Actualizado: {new Date(project.lastUpdated).toLocaleDateString()}</span>
                              {project.filesCount && (
                                <span>{project.filesCount} archivos</span>
                              )}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" asChild>
                            <a href={project.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No se encontraron proyectos
                  </div>
                )}

                {selectedProject && (
                  <div className="mt-6 pt-6 border-t">
                    <h3 className="font-semibold mb-4">Proyecto Seleccionado</h3>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-sm font-medium">Nombre</div>
                        <div className="text-sm text-muted-foreground">{selectedProject.title}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium">Lenguaje</div>
                        <div className="text-sm text-muted-foreground">{selectedProject.language}</div>
                      </div>
                      {selectedProject.filesCount && (
                        <div>
                          <div className="text-sm font-medium">Archivos</div>
                          <div className="text-sm text-muted-foreground">{selectedProject.filesCount}</div>
                        </div>
                      )}
                      {selectedProject.dependenciesCount && (
                        <div>
                          <div className="text-sm font-medium">Dependencias</div>
                          <div className="text-sm text-muted-foreground">{selectedProject.dependenciesCount}</div>
                        </div>
                      )}
                    </div>
                    
                    <Button onClick={startMigration} disabled={loading} className="w-full">
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Iniciar Migración a Refeerence
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="progress">
          {migrationSession && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Cloud className="w-5 h-5" />
                    <span>Progreso de Migración</span>
                  </CardTitle>
                  <CardDescription>
                    Migrando EDUPAY desde Replit hacia Refeerence
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        {migrationSession.currentStep.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {migrationSession.progress}%
                      </span>
                    </div>
                    <Progress value={migrationSession.progress} className="w-full" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold">Historial de Progreso</h3>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {migrationSession.history.map((step, index) => (
                        <div key={index} className="flex items-center space-x-3 p-2 bg-gray-50 rounded">
                          {step.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-600" />}
                          {step.status === 'in_progress' && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                          {step.status === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                          <div className="flex-1">
                            <div className="text-sm font-medium">{step.message}</div>
                            {step.timestamp && (
                              <div className="text-xs text-muted-foreground">
                                {new Date(step.timestamp).toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="result">
          {migrationSession?.status === 'completed' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span>Migración Completada</span>
                  </CardTitle>
                  <CardDescription>
                    EDUPAY ha sido migrado exitosamente a Refeerence
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-900">Migración Exitosa</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      Todos los archivos y configuraciones han sido extraídos correctamente
                    </p>
                  </div>

                  {migrationSession.result?.summary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {migrationSession.result.summary.filesExtracted}
                        </div>
                        <div className="text-sm text-muted-foreground">Archivos</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {migrationSession.result.summary.dependencies}
                        </div>
                        <div className="text-sm text-muted-foreground">Dependencias</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-yellow-600">
                          {migrationSession.result.summary.secrets}
                        </div>
                        <div className="text-sm text-muted-foreground">Secrets</div>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">100%</div>
                        <div className="text-sm text-muted-foreground">Completado</div>
                      </div>
                    </div>
                  )}

                  <div className="flex space-x-4">
                    <Button onClick={downloadMigration} className="flex-1">
                      <Download className="w-4 h-4 mr-2" />
                      Descargar Migración
                    </Button>
                    <Button variant="outline" onClick={() => {
                      if (migrationSession.result?.summary?.originalUrl) {
                        window.open(migrationSession.result.summary.originalUrl, '_blank');
                      }
                    }}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Proyecto Original
                    </Button>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Siguiente Pasos</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        <span>Descargar los archivos migrados</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        <span>Importar el proyecto en tu plataforma Refeerence</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        <span>Configurar las variables de entorno y secrets</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        <span>Probar la funcionalidad en el nuevo entorno</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}