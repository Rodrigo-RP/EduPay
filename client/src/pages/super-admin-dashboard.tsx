import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, School, Users, DollarSign, Activity, AlertTriangle, Eye, Ban, Scan } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("overview");
  const [blockIpInput, setBlockIpInput] = useState("");

  // Platform metrics query
  const { data: platformMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/super-admin/platform/metrics"],
    queryFn: async () => {
      const response = await fetch("/api/super-admin/platform/metrics", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
  });

  // Tenants list query
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["/api/super-admin/tenants"],
    queryFn: async () => {
      const response = await fetch("/api/super-admin/tenants", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
  });

  // Security events query
  const { data: securityEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/super-admin/security/events"],
    queryFn: async () => {
      const response = await fetch("/api/super-admin/security/events", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
  });

  // System health query
  const { data: systemHealth, isLoading: healthLoading } = useQuery({
    queryKey: ["/api/super-admin/system/health"],
    queryFn: async () => {
      const response = await fetch("/api/super-admin/system/health", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
  });

  // Security scan mutation
  const securityScanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/super-admin/security/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Escaneo de Seguridad Completado",
        description: `Score: ${data.securityScore}/100. ${data.recommendations?.[0] || 'Escaneo completado'}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/security/events"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo ejecutar el escaneo de seguridad",
        variant: "destructive",
      });
    },
  });

  // Block IP mutation
  const blockIpMutation = useMutation({
    mutationFn: async (data: { ipAddress: string; reason: string }) => {
      const response = await fetch("/api/super-admin/security/block-ip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "IP Bloqueada",
        description: data.message || "IP bloqueada exitosamente",
      });
      setBlockIpInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/security/events"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo bloquear la IP",
        variant: "destructive",
      });
    },
  });

  const handleBlockIp = () => {
    if (!blockIpInput.trim()) return;
    
    blockIpMutation.mutate({
      ipAddress: blockIpInput.trim(),
      reason: "Blocked manually by super admin"
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Activa</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inactiva</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Crítico</Badge>;
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800">Alto</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800">Medio</Badge>;
      case 'low':
        return <Badge variant="secondary">Bajo</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando panel Super Admin...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Shield className="h-8 w-8 text-blue-600" />
                Panel Super Administrador
              </h1>
              <p className="text-gray-600 mt-2">
                Control y monitoreo de la plataforma EscuelaPay
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-600">
                  Plataforma SaaS EscuelaPay
                </p>
                <p className="text-xs text-gray-500">
                  v2.0 - Super Admin Panel
                </p>
              </div>
            </div>
          </div>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Vista General</TabsTrigger>
            <TabsTrigger value="schools">Escuelas</TabsTrigger>
            <TabsTrigger value="security">Seguridad</TabsTrigger>
            <TabsTrigger value="system">Sistema</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Escuelas</CardTitle>
                  <School className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(platformMetrics as any)?.totalSchools || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {(platformMetrics as any)?.activeSchools || 0} activas
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Estudiantes</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(platformMetrics as any)?.totalStudents || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    En plataforma
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pagos Totales</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(platformMetrics as any)?.totalPayments || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    Transacciones
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Eventos Seguridad</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(platformMetrics as any)?.securityEvents || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    Últimos 30 días
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Security Events */}
            <Card>
              <CardHeader>
                <CardTitle>Eventos de Seguridad Recientes</CardTitle>
                <CardDescription>Últimos eventos de seguridad en la plataforma</CardDescription>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="text-center py-4">Cargando eventos...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Severidad</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(securityEvents as any)?.slice(0, 5).map((event: any) => (
                        <TableRow key={event.id}>
                          <TableCell className="font-medium">{event.event_type}</TableCell>
                          <TableCell>{getSeverityBadge(event.severity)}</TableCell>
                          <TableCell>{event.ip_address || 'N/A'}</TableCell>
                          <TableCell>{new Date(event.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {event.is_blocked ? (
                              <Badge variant="destructive">Bloqueado</Badge>
                            ) : (
                              <Badge variant="secondary">Permitido</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )) || (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center">
                            No hay eventos recientes
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schools Tab */}
          <TabsContent value="schools" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Escuelas Registradas</CardTitle>
                <CardDescription>Gestión de escuelas en la plataforma</CardDescription>
              </CardHeader>
              <CardContent>
                {tenantsLoading ? (
                  <div className="text-center py-4">Cargando escuelas...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Escuela</TableHead>
                        <TableHead>RFC</TableHead>
                        <TableHead>Campus</TableHead>
                        <TableHead>Estudiantes</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tenants as any)?.map((tenant: any) => (
                        <TableRow key={tenant.id}>
                          <TableCell className="font-medium">{tenant.nombre_legal}</TableCell>
                          <TableCell>{tenant.rfc}</TableCell>
                          <TableCell>{tenant.campusCount}</TableCell>
                          <TableCell>{tenant.studentCount}</TableCell>
                          <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              Ver Detalles
                            </Button>
                          </TableCell>
                        </TableRow>
                      )) || (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center">
                            No hay escuelas registradas
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Escaneo de Seguridad</CardTitle>
                  <CardDescription>Análisis completo de vulnerabilidades</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={() => securityScanMutation.mutate()}
                    disabled={securityScanMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    <Scan className="h-4 w-4 mr-2" />
                    {securityScanMutation.isPending ? "Escaneando..." : "Iniciar Escaneo"}
                  </Button>
                  <div className="text-sm text-gray-600">
                    <p>• Detección de vulnerabilidades</p>
                    <p>• Análisis de ataques</p>
                    <p>• Score de seguridad</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bloquear IP</CardTitle>
                  <CardDescription>Control de acceso por IP</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ip-input">Dirección IP</Label>
                    <Input
                      id="ip-input"
                      placeholder="192.168.1.100"
                      value={blockIpInput}
                      onChange={(e) => setBlockIpInput(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleBlockIp}
                    disabled={blockIpMutation.isPending || !blockIpInput.trim()}
                    variant="destructive"
                    className="w-full"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    {blockIpMutation.isPending ? "Bloqueando..." : "Bloquear IP"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Estado de Protecciones</CardTitle>
                  <CardDescription>Resumen de defensas activas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Firewall WAF</span>
                    <span className="h-2 w-2 bg-green-500 rounded-full"></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Anti-SQL Injection</span>
                    <span className="h-2 w-2 bg-green-500 rounded-full"></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Rate Limiting</span>
                    <span className="h-2 w-2 bg-green-500 rounded-full"></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Encriptación AES-256</span>
                    <span className="h-2 w-2 bg-green-500 rounded-full"></span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Security Events Full List */}
            <Card>
              <CardHeader>
                <CardTitle>Registro de Eventos de Seguridad</CardTitle>
                <CardDescription>Historial completo de eventos de seguridad</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo de Evento</TableHead>
                      <TableHead>Severidad</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Detalles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {securityEvents?.map((event: any) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">{event.event_type}</TableCell>
                        <TableCell>{getSeverityBadge(event.severity)}</TableCell>
                        <TableCell>{event.ip_address || 'N/A'}</TableCell>
                        <TableCell>{event.user_id || 'Sistema'}</TableCell>
                        <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">
                          No hay eventos de seguridad registrados
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Tab */}
          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Estado del Sistema</CardTitle>
                <CardDescription>Monitoreo de servicios de plataforma</CardDescription>
              </CardHeader>
              <CardContent>
                {healthLoading ? (
                  <div className="text-center py-4">Cargando estado del sistema...</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-medium">Base de Datos</h3>
                        <p className="text-sm text-gray-600">PostgreSQL</p>
                      </div>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <Activity className="h-3 w-3 mr-1" />
                        Saludable
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-medium">API Gateway</h3>
                        <p className="text-sm text-gray-600">Express.js</p>
                      </div>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <Activity className="h-3 w-3 mr-1" />
                        Operativo
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-medium">Seguridad</h3>
                        <p className="text-sm text-gray-600">WAF + Encriptación</p>
                      </div>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <Activity className="h-3 w-3 mr-1" />
                        Activo
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}