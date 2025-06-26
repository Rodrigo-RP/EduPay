import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { School, Users, DollarSign, Settings, UserPlus, Edit, Eye, Trash2, Download, Upload, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Tenant {
  id: number;
  nombre_legal: string;
  rfc: string;
  campusCount: string;
  studentCount: string;
  status: string;
  created_at: string;
}

interface Campus {
  id: number;
  nombre: string;
  direccion: string;
  telefono: string;
  email: string;
  director: string;
  nivel_academico: string;
  tenant_id: number;
}

interface Student {
  id: number;
  nombre_completo: string;
  curp: string;
  email: string;
  telefono: string;
  grado: string;
  grupo: string;
  status: string;
  campus: Campus;
}

interface User {
  id: number;
  email: string;
  nombre_completo: string;
  role: string;
  campus_id: number;
  status: string;
  created_at: string;
}

export default function SuperAdminSchoolManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSchool, setSelectedSchool] = useState<Tenant | null>(null);
  const [schoolFilter, setSchoolFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTab, setSelectedTab] = useState("overview");
  const [newUserData, setNewUserData] = useState({
    email: "",
    nombre_completo: "",
    password: "",
    role: "staff",
    campus_id: ""
  });

  // Get all schools/tenants
  const { data: schools = [], isLoading: schoolsLoading } = useQuery({
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

  // Get specific school data when selected
  const { data: schoolData, isLoading: schoolDataLoading } = useQuery({
    queryKey: ["/api/super-admin/school-details", selectedSchool?.id],
    queryFn: async () => {
      if (!selectedSchool) return null;
      const response = await fetch(`/api/super-admin/school-details/${selectedSchool.id}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
    enabled: !!selectedSchool,
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: any) => {
      const response = await fetch("/api/super-admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify(userData),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Usuario creado",
        description: "Usuario creado exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/school-details"] });
      setNewUserData({
        email: "",
        nombre_completo: "",
        password: "",
        role: "staff",
        campus_id: ""
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear el usuario",
        variant: "destructive",
      });
    },
  });

  // Update school status mutation
  const updateSchoolStatusMutation = useMutation({
    mutationFn: async ({ schoolId, status }: { schoolId: number; status: string }) => {
      const response = await fetch(`/api/super-admin/update-school-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ schoolId, status }),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Estado actualizado",
        description: "Estado de la escuela actualizado exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/school-details"] });
    },
  });

  // Filter schools - ensure schools is an array
  const filteredSchools = (schools && Array.isArray(schools) ? schools : []).filter((school: Tenant) => {
    const matchesName = school.nombre_legal?.toLowerCase().includes(schoolFilter.toLowerCase());
    const matchesStatus = statusFilter === "all" || school.status === statusFilter;
    return matchesName && matchesStatus;
  });

  const handleCreateUser = () => {
    if (!selectedSchool || !newUserData.campus_id) {
      toast({
        title: "Error",
        description: "Selecciona un campus para el usuario",
        variant: "destructive",
      });
      return;
    }
    createUserMutation.mutate({
      ...newUserData,
      tenant_id: selectedSchool.id
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800">Activa</Badge>;
      case "inactive":
        return <Badge className="bg-red-100 text-red-800">Inactiva</Badge>;
      case "suspended":
        return <Badge className="bg-yellow-100 text-yellow-800">Suspendida</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-purple-100 text-purple-800">Administrador</Badge>;
      case "staff":
        return <Badge className="bg-blue-100 text-blue-800">Personal</Badge>;
      case "finance":
        return <Badge className="bg-green-100 text-green-800">Finanzas</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{role}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Escuelas</h1>
          <p className="text-muted-foreground">
            Administra y supervisa todas las escuelas de la plataforma
          </p>
        </div>
      </div>

      {/* School Selection Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <School className="h-5 w-5" />
            Seleccionar Escuela
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="school-filter">Buscar escuela</Label>
              <Input
                id="school-filter"
                placeholder="Nombre de la escuela..."
                value={schoolFilter}
                onChange={(e) => setSchoolFilter(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="status-filter">Estado</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activas</SelectItem>
                  <SelectItem value="inactive">Inactivas</SelectItem>
                  <SelectItem value="suspended">Suspendidas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              {selectedSchool && (
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedSchool(null)}
                  className="w-full"
                >
                  Limpiar selección
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSchools.map((school: Tenant) => (
              <Card 
                key={school.id} 
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedSchool?.id === school.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => setSelectedSchool(school)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-sm">{school.nombre_legal}</h3>
                    {getStatusBadge(school.status)}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">RFC: {school.rfc}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <School className="h-3 w-3" />
                      <span>{school.campusCount} campus</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{school.studentCount} estudiantes</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* School Dashboard */}
      {selectedSchool && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Dashboard: {selectedSchool.nombre_legal}
                </CardTitle>
                <CardDescription>
                  Gestión completa de la escuela seleccionada
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedSchool.status === "active" ? "destructive" : "default"}
                  size="sm"
                  onClick={() => updateSchoolStatusMutation.mutate({
                    schoolId: selectedSchool.id,
                    status: selectedSchool.status === "active" ? "inactive" : "active"
                  })}
                >
                  {selectedSchool.status === "active" ? "Desactivar" : "Activar"}
                </Button>
                {getStatusBadge(selectedSchool.status)}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Resumen</TabsTrigger>
                <TabsTrigger value="users">Usuarios</TabsTrigger>
                <TabsTrigger value="students">Estudiantes</TabsTrigger>
                <TabsTrigger value="campus">Campus</TabsTrigger>
                <TabsTrigger value="finances">Finanzas</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <School className="h-8 w-8 text-blue-500" />
                        <div>
                          <p className="text-2xl font-bold">{schoolData?.campusCount || 0}</p>
                          <p className="text-xs text-muted-foreground">Campus</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-8 w-8 text-green-500" />
                        <div>
                          <p className="text-2xl font-bold">{schoolData?.studentCount || 0}</p>
                          <p className="text-xs text-muted-foreground">Estudiantes</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-8 w-8 text-purple-500" />
                        <div>
                          <p className="text-2xl font-bold">{schoolData?.userCount || 0}</p>
                          <p className="text-xs text-muted-foreground">Usuarios</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-8 w-8 text-yellow-500" />
                        <div>
                          <p className="text-2xl font-bold">${schoolData?.monthlyRevenue || 0}</p>
                          <p className="text-xs text-muted-foreground">Revenue mensual</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Actividad Reciente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {schoolData?.recentActivity?.map((activity: any, index: number) => (
                        <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{activity.description}</p>
                            <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
                          </div>
                        </div>
                      )) || (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No hay actividad reciente
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="users" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Gestión de Usuarios</h3>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Crear Usuario
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                        <DialogDescription>
                          Agregar un nuevo usuario para la escuela {selectedSchool.nombre_legal}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="user-email">Email</Label>
                          <Input
                            id="user-email"
                            type="email"
                            value={newUserData.email}
                            onChange={(e) => setNewUserData({...newUserData, email: e.target.value})}
                            placeholder="usuario@escuela.com"
                          />
                        </div>
                        <div>
                          <Label htmlFor="user-name">Nombre Completo</Label>
                          <Input
                            id="user-name"
                            value={newUserData.nombre_completo}
                            onChange={(e) => setNewUserData({...newUserData, nombre_completo: e.target.value})}
                            placeholder="Juan Pérez"
                          />
                        </div>
                        <div>
                          <Label htmlFor="user-password">Contraseña</Label>
                          <Input
                            id="user-password"
                            type="password"
                            value={newUserData.password}
                            onChange={(e) => setNewUserData({...newUserData, password: e.target.value})}
                            placeholder="Contraseña segura"
                          />
                        </div>
                        <div>
                          <Label htmlFor="user-role">Rol</Label>
                          <Select 
                            value={newUserData.role} 
                            onValueChange={(value) => setNewUserData({...newUserData, role: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="staff">Personal</SelectItem>
                              <SelectItem value="finance">Finanzas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="user-campus">Campus</Label>
                          <Select 
                            value={newUserData.campus_id} 
                            onValueChange={(value) => setNewUserData({...newUserData, campus_id: value})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar campus" />
                            </SelectTrigger>
                            <SelectContent>
                              {schoolData?.campuses?.map((campus: Campus) => (
                                <SelectItem key={campus.id} value={campus.id.toString()}>
                                  {campus.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button 
                          onClick={handleCreateUser} 
                          className="w-full"
                          disabled={createUserMutation.isPending}
                        >
                          {createUserMutation.isPending ? "Creando..." : "Crear Usuario"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuario</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead>Campus</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schoolData?.users?.map((user: User) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.nombre_completo}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>{getRoleBadge(user.role)}</TableCell>
                            <TableCell>{user.campus_id}</TableCell>
                            <TableCell>{getStatusBadge(user.status)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline">
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )) || (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-4">
                              No hay usuarios registrados
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="students" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Gestión de Estudiantes</h3>
                  <div className="flex gap-2">
                    <Button variant="outline">
                      <Upload className="h-4 w-4 mr-2" />
                      Importar
                    </Button>
                    <Button variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Exportar
                    </Button>
                  </div>
                </div>

                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Estudiante</TableHead>
                          <TableHead>CURP</TableHead>
                          <TableHead>Grado</TableHead>
                          <TableHead>Campus</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schoolData?.students?.map((student: Student) => (
                          <TableRow key={student.id}>
                            <TableCell className="font-medium">{student.nombre_completo}</TableCell>
                            <TableCell className="font-mono text-xs">{student.curp}</TableCell>
                            <TableCell>{student.grado} {student.grupo}</TableCell>
                            <TableCell>{student.campus?.nombre}</TableCell>
                            <TableCell>{getStatusBadge(student.status)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline">
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )) || (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-4">
                              No hay estudiantes registrados
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="campus" className="space-y-4">
                <h3 className="text-lg font-semibold">Campus de la Escuela</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {schoolData?.campuses?.map((campus: Campus) => (
                    <Card key={campus.id}>
                      <CardHeader>
                        <CardTitle className="text-base">{campus.nombre}</CardTitle>
                        <CardDescription>{campus.direccion}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <p><strong>Director:</strong> {campus.director}</p>
                          <p><strong>Teléfono:</strong> {campus.telefono}</p>
                          <p><strong>Email:</strong> {campus.email}</p>
                          <p><strong>Nivel:</strong> {campus.nivel_academico}</p>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button size="sm" variant="outline">
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </Button>
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4 mr-2" />
                            Ver más
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )) || (
                    <p className="text-center text-muted-foreground col-span-2 py-8">
                      No hay campus registrados
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="finances" className="space-y-4">
                <h3 className="text-lg font-semibold">Estado Financiero</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-8 w-8 text-green-500" />
                        <div>
                          <p className="text-2xl font-bold">${schoolData?.paidAmount || 0}</p>
                          <p className="text-xs text-muted-foreground">Pagos al día</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-8 w-8 text-yellow-500" />
                        <div>
                          <p className="text-2xl font-bold">${schoolData?.pendingAmount || 0}</p>
                          <p className="text-xs text-muted-foreground">Pendientes</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-8 w-8 text-red-500" />
                        <div>
                          <p className="text-2xl font-bold">${schoolData?.overdueAmount || 0}</p>
                          <p className="text-xs text-muted-foreground">Vencidos</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Acciones Financieras</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Button variant="outline" className="h-20 flex-col">
                        <DollarSign className="h-6 w-6 mb-2" />
                        <span className="text-xs">Generar Reportes</span>
                      </Button>
                      <Button variant="outline" className="h-20 flex-col">
                        <Download className="h-6 w-6 mb-2" />
                        <span className="text-xs">Exportar Datos</span>
                      </Button>
                      <Button variant="outline" className="h-20 flex-col">
                        <AlertTriangle className="h-6 w-6 mb-2" />
                        <span className="text-xs">Revisar Morosos</span>
                      </Button>
                      <Button variant="outline" className="h-20 flex-col">
                        <Settings className="h-6 w-6 mb-2" />
                        <span className="text-xs">Configurar</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}