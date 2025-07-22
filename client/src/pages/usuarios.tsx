import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Plus, Edit, Trash2, UserCheck, UserX, Shield, Mail, AlertTriangle, Key, Settings, Eye, User } from "lucide-react";
import { ROLE_PERMISSIONS, hasPermission, getRolePermissions, UserRole } from "@shared/permissions";

export default function Usuarios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState("all");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<any>(null);
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'assign'>('list');
  const [selectedUserForAssignment, setSelectedUserForAssignment] = useState<any>(null);
  const [assignmentPermissions, setAssignmentPermissions] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    nombre_completo: "",
    email: "",
    telefono: "",
    role: "",
    campus: "",
    activo: true
  });

  // Datos demo de usuarios del sistema
  const usuarios = [
    {
      id: 1,
      email: "admin@sanpatricio.edu.mx",
      nombre_completo: "María Elena Rodríguez",
      role: "SUPER_ADMIN",
      telefono: "55-1234-5678",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-01-20 08:30",
      created_at: "2024-08-01"
    },
    {
      id: 2,
      email: "direccion@sanpatricio.edu.mx", 
      nombre_completo: "Carlos Alberto Méndez",
      role: "ADMIN_CAMPUS",
      telefono: "55-2345-6789",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-01-20 09:15",
      created_at: "2024-08-15"
    },
    {
      id: 3,
      email: "caja1@sanpatricio.edu.mx",
      nombre_completo: "Ana Patricia López",
      role: "CAJA",
      telefono: "55-3456-7890",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-01-20 10:45",
      created_at: "2024-09-01"
    },
    {
      id: 4,
      email: "contador@jfr.edu.mx",
      nombre_completo: "Jorge Luis Herrera",
      role: "CONTADOR",
      telefono: "55-4567-8901",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-01-19 16:30",
      created_at: "2024-09-15"
    },
    {
      id: 5,
      email: "caja2@sanpatricio.edu.mx",
      nombre_completo: "Laura Beatriz Silva",
      role: "CAJA",
      telefono: "55-5678-9012",
      activo: false,
      campus: "Campus Principal",
      ultimo_acceso: "2025-01-10 14:20",
      created_at: "2024-10-01"
    },
    {
      id: 6,
      email: "finanzas@sanpatricio.edu.mx",
      nombre_completo: "Roberto Carlos Vega",
      role: "ADMIN_CAMPUS",
      telefono: "55-6789-0123",
      activo: true,
      campus: "Campus Norte",
      ultimo_acceso: "2025-01-20 11:30",
      created_at: "2024-08-20"
    },
    {
      id: 7,
      email: "admisiones@jfr.edu.mx",
      nombre_completo: "Carmen Rosa Martínez",
      role: "ADMISIONES",
      telefono: "55-7890-1234",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-01-20 13:15",
      created_at: "2024-11-01"
    },
    {
      id: 8,
      email: "asistente@sanpatricio.edu.mx",
      nombre_completo: "Patricia Fernández Ruiz",
      role: "ASISTENTE",
      telefono: "55-8901-2345",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-01-20 14:30",
      created_at: "2024-11-15"
    },
    {
      id: 9,
      email: "admisiones.norte@sanpatricio.edu.mx",
      nombre_completo: "Luis Alberto Sánchez",
      role: "ADMISIONES",
      telefono: "55-9012-3456",
      activo: true,
      campus: "Campus Norte",
      ultimo_acceso: "2025-01-20 09:45",
      created_at: "2024-12-01"
    },
    {
      id: 11,
      email: "asistente.norte@sanpatricio.edu.mx",
      nombre_completo: "Rosa María García",
      role: "ASISTENTE",
      telefono: "55-7890-1234",
      activo: true,
      campus: "Campus Norte",
      ultimo_acceso: "2025-01-20 13:15",
      created_at: "2024-09-10"
    },
    {
      id: 12,
      email: "sistemas@sanpatricio.edu.mx",
      nombre_completo: "Daniel Eduardo Torres",
      role: "SUPER_ADMIN",
      telefono: "55-8901-2345",
      activo: true,
      campus: "Soporte Técnico",
      ultimo_acceso: "2025-01-20 07:45",
      created_at: "2024-07-15"
    }
  ];

  const filteredUsuarios = selectedRole === "all" 
    ? usuarios 
    : usuarios.filter(user => user.role === selectedRole);

  const estadisticas = {
    totalUsuarios: usuarios.length,
    usuariosActivos: usuarios.filter(u => u.activo).length,
    adminsCampus: usuarios.filter(u => u.role === "ADMIN_CAMPUS").length,
    usuariosCaja: usuarios.filter(u => u.role === "CAJA").length,
    usuariosAdmisiones: usuarios.filter(u => u.role === "ADMISIONES").length,
    usuariosAsistente: usuarios.filter(u => u.role === "ASISTENTE").length
  };

  const getRoleBadge = (role: string) => {
    const colors = {
      SUPER_ADMIN: "bg-red-100 text-red-800",
      ADMIN_CAMPUS: "bg-blue-100 text-blue-800", 
      CAJA: "bg-green-100 text-green-800",
      CONTADOR: "bg-purple-100 text-purple-800",
      ADMISIONES: "bg-orange-100 text-orange-800",
      ASISTENTE: "bg-gray-100 text-gray-800"
    };
    
    const names = {
      SUPER_ADMIN: "Super Admin",
      ADMIN_CAMPUS: "Admin Campus",
      CAJA: "Caja",
      CONTADOR: "Contador",
      ADMISIONES: "Admisiones",
      ASISTENTE: "Asistente"
    };
    
    return (
      <Badge className={colors[role as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        <Shield className="w-3 h-3 mr-1" />
        {names[role as keyof typeof names] || role}
      </Badge>
    );
  };

  const handleToggleActive = async (userId: number, currentStatus: boolean) => {
    try {
      // Simular API call
      toast({
        title: currentStatus ? "Usuario deshabilitado" : "Usuario habilitado",
        description: `El usuario ha sido ${currentStatus ? "deshabilitado" : "habilitado"} correctamente.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del usuario.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = (userId: number, userName: string) => {
    const user = usuarios.find(u => u.id === userId);
    if (user) {
      setUserToDelete(user);
      setShowDeleteModal(true);
    }
  }

  const handleViewPermissions = (usuario: any) => {
    setSelectedUserForPermissions(usuario);
    setShowPermissionsModal(true);
  };

  // Traducciones para módulos y acciones
  const moduleTranslations: { [key: string]: string } = {
    'dashboard': 'Panel de Control',
    'students': 'Estudiantes',
    'families': 'Familias',
    'charges': 'Cargos',
    'payments': 'Pagos',
    'concepts': 'Conceptos',
    'scholarships': 'Becas',
    'users': 'Usuarios',
    'reports': 'Reportes',
    'settings': 'Configuración',
    'financial': 'Finanzas',
    'crm': 'CRM',
    'providers': 'Proveedores',
    'alumni': 'Ex-Alumnos',
    'receivables': 'Cuentas por Cobrar',
    'security': 'Seguridad',
    'system': 'Sistema'
  };

  const actionTranslations: { [key: string]: string } = {
    'read': 'Leer',
    'create': 'Crear',
    'update': 'Actualizar',
    'delete': 'Eliminar',
    'export': 'Exportar',
    'import': 'Importar',
    'approve': 'Aprobar',
    'assign': 'Asignar',
    'process': 'Procesar',
    'configure': 'Configurar'
  };

  // Función para obtener todos los permisos disponibles
  const getAllAvailablePermissions = () => {
    const allPermissions: { id: string; module: string; action: string; description: string; scope: string }[] = [];
    
    ROLE_PERMISSIONS.forEach(role => {
      role.permissions.forEach(permission => {
        const permissionId = `${permission.module}_${permission.action}_${permission.scope}`;
        if (!allPermissions.some(p => p.id === permissionId)) {
          allPermissions.push({
            id: permissionId,
            module: moduleTranslations[permission.module] || permission.module,
            action: actionTranslations[permission.action] || permission.action,
            description: permission.description,
            scope: permission.scope
          });
        }
      });
    });
    
    return allPermissions.sort((a, b) => a.module.localeCompare(b.module));
  };

  const handlePermissionToggle = (permissionId: string) => {
    setCustomPermissions(prev => 
      prev.includes(permissionId) 
        ? prev.filter(id => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const handleAssignmentPermissionToggle = (permissionId: string) => {
    setAssignmentPermissions(prev => 
      prev.includes(permissionId) 
        ? prev.filter(id => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const handleAssignPermissions = () => {
    if (selectedUserForAssignment) {
      toast({
        title: "Permisos asignados",
        description: `Se han asignado ${assignmentPermissions.length} permisos a ${selectedUserForAssignment.nombre_completo}`,
      });
      setSelectedUserForAssignment(null);
      setAssignmentPermissions([]);
    }
  };

  const resetForm = () => {
    setFormData({
      nombre_completo: "",
      email: "",
      telefono: "",
      role: "",
      campus: "",
      activo: true
    });
    setCustomPermissions([]);
    setUseCustomPermissions(false);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    
    try {
      // Simular API call
      toast({
        title: "Usuario eliminado",
        description: `El usuario "${userToDelete.nombre_completo}" ha sido eliminado permanentemente del sistema.`,
      });
      
      setShowDeleteModal(false);
      setUserToDelete(null);
    } catch (error) {
      toast({
        title: "Error al eliminar", 
        description: "No se pudo eliminar el usuario. Intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const resetFormComplete = () => {
    setFormData({
      nombre_completo: "",
      email: "",
      telefono: "",
      role: "",
      campus: "",
      activo: true
    });
    setCustomPermissions([]);
    setUseCustomPermissions(false);
  };

  const handleEdit = (usuario: any) => {
    setEditingUser(usuario);
    setFormData({
      nombre_completo: usuario.nombre_completo,
      email: usuario.email,
      telefono: usuario.telefono,
      role: usuario.role,
      campus: usuario.campus,
      activo: usuario.activo
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    toast({
      title: "Usuario actualizado",
      description: `${formData.nombre_completo} ha sido actualizado exitosamente.`,
    });
    setShowEditModal(false);
    resetForm();
    setEditingUser(null);
  };

  const handleAdd = () => {
    const permissionsMessage = useCustomPermissions 
      ? `con ${customPermissions.length} permisos personalizados`
      : `con rol ${formData.role}`;
    
    toast({
      title: "Usuario creado",
      description: `${formData.nombre_completo} ha sido agregado al sistema ${permissionsMessage}.`,
    });
    setShowAddModal(false);
    resetFormComplete();
  };

  return (
    <div >
      <div >
        
        <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Usuarios</h1>
          <p className="text-slate-600">Administra usuarios del sistema, roles y permisos</p>
            </div>
            
            {/* Pestañas */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('list')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'list'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Lista de Usuarios
              </button>
              <button
                onClick={() => setActiveTab('assign')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'assign'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Asignar Permisos
              </button>
            </div>
          </div>
          
          {/* Contenido de la pestaña Lista de Usuarios */}
          {activeTab === 'list' && (
            <div>
              <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Agregar Usuario
                    </Button>
                </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Crear nuevo usuario</DialogTitle>
                  <DialogDescription>
                    Completa la información para crear un nuevo usuario del sistema
                  </DialogDescription>
                </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div>
                    <Label>Nombre completo</Label>
                    <Input 
                      placeholder="Juan Pérez García" 
                      value={formData.nombre_completo}
                      onChange={(e) => handleInputChange("nombre_completo", e.target.value)}
                    />
                  </div>
              <div>
                    <Label>Email</Label>
                    <Input 
                      type="email" 
                      placeholder="usuario@sanpatricio.edu.mx"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                    />
                  </div>
              <div>
                    <Label>Teléfono</Label>
                    <Input 
                      placeholder="55-1234-5678"
                      value={formData.telefono}
                      onChange={(e) => handleInputChange("telefono", e.target.value)}
                    />
                  </div>
              <div>
                    <Label>Rol del sistema</Label>
                    <Select value={formData.role} onValueChange={(value) => handleInputChange("role", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar rol..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN_CAMPUS">Administrador Campus</SelectItem>
                        <SelectItem value="ADMISIONES">Admisiones</SelectItem>
                        <SelectItem value="ASISTENTE">Asistente</SelectItem>
                        <SelectItem value="CAJA">Personal de Caja</SelectItem>
                        <SelectItem value="CONTADOR">Contador Externo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
              <div>
                    <Label>Campus</Label>
                    <Input 
                      placeholder="Campus Principal"
                      value={formData.campus}
                      onChange={(e) => handleInputChange("campus", e.target.value)}
                    />
                  </div>
              <div className="flex items-center space-x-2">
                    <Switch 
                      checked={formData.activo}
                      onCheckedChange={(checked) => handleInputChange("activo", checked)}
                    />
                    <Label>Usuario activo</Label>
                  </div>
                </div>

                {/* Sección de Permisos Personalizados */}
                <div className="mt-6 pt-4 border-t">
                  <div className="flex items-center space-x-2 mb-4">
                    <Switch 
                      checked={useCustomPermissions}
                      onCheckedChange={setUseCustomPermissions}
                    />
                    <Label className="font-semibold">Configurar permisos personalizados</Label>
                  </div>
                  
                  {useCustomPermissions && (
                    <div className="space-y-4">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-blue-700 mb-2">
                          <strong>Nota:</strong> Al activar permisos personalizados, se ignoran los permisos predeterminados del rol seleccionado.
                        </p>
                        <p className="text-sm text-blue-600">
                          Selecciona específicamente qué funcionalidades puede acceder este usuario.
                        </p>
                      </div>
                      
                      {/* Botones de selección rápida */}
                      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCustomPermissions(getAllAvailablePermissions().map(p => p.id))}
                        >
                          Seleccionar todos
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCustomPermissions([])}
                        >
                          Deseleccionar todos
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const basicPermissions = getAllAvailablePermissions()
                              .filter(p => ['Panel de Control', 'Estudiantes', 'Familias'].includes(p.module))
                              .map(p => p.id);
                            setCustomPermissions(basicPermissions);
                          }}
                        >
                          Permisos básicos
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const financialPermissions = getAllAvailablePermissions()
                              .filter(p => ['Pagos', 'Cargos', 'Finanzas', 'Cuentas por Cobrar'].includes(p.module))
                              .map(p => p.id);
                            setCustomPermissions(financialPermissions);
                          }}
                        >
                          Solo finanzas
                        </Button>
                      </div>
                      
                      <div className="max-h-80 overflow-y-auto space-y-3">
                        {getAllAvailablePermissions().map((permission) => (
                          <div key={permission.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                            <input
                              type="checkbox"
                              id={permission.id}
                              checked={customPermissions.includes(permission.id)}
                              onChange={() => handlePermissionToggle(permission.id)}
                              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">
                                  {permission.module}
                                </Badge>
                                <Badge variant="outline" className="text-xs bg-green-100 text-green-800">
                                  {permission.action}
                                </Badge>
                                <Badge variant="outline" className="text-xs bg-gray-100">
                                  {permission.scope === 'all' ? 'Toda la plataforma' : 
                                   permission.scope === 'campus' ? 'Solo su campus' : 
                                   permission.scope === 'own' ? 'Solo sus registros' : 'Solo lectura'}
                                </Badge>
                              </div>
                              <label 
                                htmlFor={permission.id} 
                                className="text-sm text-gray-700 cursor-pointer"
                              >
                                {permission.description}
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">
                          <strong>Permisos seleccionados:</strong> {customPermissions.length} de {getAllAvailablePermissions().length}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => {
                setShowAddModal(false);
                resetFormComplete();
              }}>
                    Cancelar
                  </Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleAdd}>
                    Crear Usuario
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          
          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.totalUsuarios}</div>
            <div className="text-sm text-slate-600">Total usuarios</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <UserCheck className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.usuariosActivos}</div>
            <div className="text-sm text-slate-600">Usuarios activos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Shield className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.adminsCampus}</div>
            <div className="text-sm text-slate-600">Admins Campus</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <UserCheck className="w-8 h-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.usuariosAdmisiones}</div>
            <div className="text-sm text-slate-600">Admisiones</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <User className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.usuariosAsistente}</div>
            <div className="text-sm text-slate-600">Asistentes</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Mail className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.usuariosCaja}</div>
            <div className="text-sm text-slate-600">Personal Caja</div>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filtros de usuarios</CardTitle>
            </CardHeader>
            <CardContent>
          <div className="flex gap-4">
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los roles</SelectItem>
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                    <SelectItem value="ADMIN_CAMPUS">Admin Campus</SelectItem>
                    <SelectItem value="ADMISIONES">Admisiones</SelectItem>
                    <SelectItem value="ASISTENTE">Asistente</SelectItem>
                    <SelectItem value="CAJA">Personal Caja</SelectItem>
                    <SelectItem value="CONTADOR">Contador</SelectItem>
                  </SelectContent>
                </Select>
            <Button variant="outline" onClick={() => setSelectedRole("all")}>
                  Limpiar filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Lista de usuarios */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de usuarios ({filteredUsuarios.length})</CardTitle>
            </CardHeader>
            <CardContent>
          <div className="space-y-4">
                {filteredUsuarios.map((usuario) => (
              <div key={usuario.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-semibold">
                          {usuario.nombre_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </span>
                      </div>
                  <div>
                        <h3 className="font-medium">{usuario.nombre_completo}</h3>
                    <p className="text-sm text-slate-600 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {usuario.email}
                        </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                          <span>Tel: {usuario.telefono}</span>
                          <span>Último acceso: {usuario.ultimo_acceso}</span>
                          <span>Campus: {usuario.campus}</span>
                        </div>
                      </div>
                    </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                        {getRoleBadge(usuario.role)}
                    <div className="mt-1">
                          <Badge variant={usuario.activo ? "default" : "secondary"}>
                            {usuario.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                      </div>
                  <div className="flex items-center gap-2">
                        <Switch 
                          checked={usuario.activo}
                          onCheckedChange={() => handleToggleActive(usuario.id, usuario.activo)}
                        />
                    <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleViewPermissions(usuario)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(usuario)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                    <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleDeleteUser(usuario.id, usuario.nombre_completo)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Modal de Edición de Usuario */}
          <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editar usuario</DialogTitle>
                <DialogDescription>
                  Modifica la información del usuario seleccionado
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                <div>
                  <Label>Nombre completo</Label>
                  <Input 
                    value={formData.nombre_completo}
                    onChange={(e) => handleInputChange("nombre_completo", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input 
                    type="email" 
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input 
                    value={formData.telefono}
                    onChange={(e) => handleInputChange("telefono", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Rol del sistema</Label>
                  <Select value={formData.role} onValueChange={(value) => handleInputChange("role", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                      <SelectItem value="ADMIN_CAMPUS">Administrador Campus</SelectItem>
                      <SelectItem value="ADMISIONES">Admisiones</SelectItem>
                      <SelectItem value="ASISTENTE">Asistente</SelectItem>
                      <SelectItem value="CAJA">Personal de Caja</SelectItem>
                      <SelectItem value="CONTADOR">Contador Externo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Campus</Label>
                  <Input 
                    value={formData.campus}
                    onChange={(e) => handleInputChange("campus", e.target.value)}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={formData.activo}
                    onCheckedChange={(checked) => handleInputChange("activo", checked)}
                  />
                  <Label>Usuario activo</Label>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveEdit}>
                  Guardar cambios
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal de confirmación de eliminación */}
          <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-red-600">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  Advertencia de Eliminación
                </DialogTitle>
                <DialogDescription>
                  Confirma la eliminación permanente del usuario del sistema
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                <p className="text-sm text-slate-600 mb-4">
                  ¿Estás completamente seguro de que deseas eliminar al usuario{" "}
                  <strong className="text-slate-900">"{userToDelete?.nombre_completo}"</strong>?
                </p>
                
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                  <p className="text-sm font-medium text-red-800 mb-2">
                    Esta acción NO se puede deshacer y eliminará:
                  </p>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• Acceso completo al sistema</li>
                    <li>• Todos los permisos y configuraciones</li>
                    <li>• Historial de actividades del usuario</li>
                  </ul>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowDeleteModal(false);
                    setUserToDelete(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={confirmDeleteUser}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar Usuario
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal de Permisos de Usuario */}
          <Dialog open={showPermissionsModal} onOpenChange={setShowPermissionsModal}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-blue-600" />
                  Permisos de Usuario - {selectedUserForPermissions?.nombre_completo}
                </DialogTitle>
                <DialogDescription>
                  {selectedUserForPermissions && getRolePermissions(selectedUserForPermissions.role.toLowerCase() as UserRole)?.description}
                </DialogDescription>
              </DialogHeader>
              
              {selectedUserForPermissions && (
                <div className="space-y-6">
                  {/* Información básica del rol */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Shield className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-blue-900">
                        {getRolePermissions(selectedUserForPermissions.role.toLowerCase() as UserRole)?.name}
                      </h3>
                    </div>
                    <p className="text-sm text-blue-700 mb-3">
                      {getRolePermissions(selectedUserForPermissions.role.toLowerCase() as UserRole)?.description}
                    </p>
                    
                    {/* Scope de permisos */}
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="bg-white">
                        {selectedUserForPermissions.role === 'SUPER_ADMIN' ? 'Alcance: Toda la plataforma' : 
                         selectedUserForPermissions.role === 'ADMIN_CAMPUS' ? 'Alcance: Solo su campus' : 
                         'Alcance: Solo su campus (limitado)'}
                      </Badge>
                      <Badge variant="outline" className="bg-white">
                        Campus: {selectedUserForPermissions.campus}
                      </Badge>
                    </div>
                  </div>

                  {/* Permisos específicos */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Permisos Específicos
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getRolePermissions(selectedUserForPermissions.role.toLowerCase() as UserRole)?.permissions.map((permission, index) => (
                        <div key={index} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs bg-white">
                              {permission.module}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-green-100 text-green-800">
                              {permission.action}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600">{permission.description}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Alcance: {permission.scope === 'all' ? 'Toda la plataforma' : 
                                     permission.scope === 'campus' ? 'Solo su campus' : 
                                     permission.scope === 'own' ? 'Solo sus registros' : 'Solo lectura'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Restricciones */}
                  {getRolePermissions(selectedUserForPermissions.role.toLowerCase() as UserRole)?.restrictions.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2 text-red-700">
                        <AlertTriangle className="w-4 h-4" />
                        Restricciones
                      </h4>
                      <div className="bg-red-50 rounded-lg p-4">
                        <ul className="space-y-2">
                          {getRolePermissions(selectedUserForPermissions.role.toLowerCase() as UserRole)?.restrictions.map((restriction, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm text-red-700">
                              <span className="text-red-500 font-bold">•</span>
                              {restriction}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex justify-end pt-4">
                <Button variant="outline" onClick={() => setShowPermissionsModal(false)}>
                  Cerrar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
            </div>
          )}
          
          {/* Contenido de la pestaña Asignar Permisos */}
          {activeTab === 'assign' && (
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Asignar Permisos Personalizados</CardTitle>
                  <CardDescription>
                    Selecciona un usuario existente y asígnale permisos específicos manualmente
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Selector de usuario */}
                    <div>
                      <Label className="text-base font-semibold mb-3 block">1. Seleccionar Usuario</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {usuarios.map((usuario) => (
                          <div 
                            key={usuario.id}
                            className={`border rounded-lg p-4 cursor-pointer transition-all ${
                              selectedUserForAssignment?.id === usuario.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            onClick={() => setSelectedUserForAssignment(usuario)}
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-blue-600" />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{usuario.nombre_completo}</p>
                                <p className="text-xs text-gray-500">{usuario.email}</p>
                                <Badge variant="outline" className="text-xs mt-1">
                                  {usuario.role === 'SUPER_ADMIN' ? 'Super Admin' :
                                   usuario.role === 'ADMIN_CAMPUS' ? 'Admin Campus' :
                                   usuario.role === 'ADMISIONES' ? 'Admisiones' :
                                   usuario.role === 'ASISTENTE' ? 'Asistente' :
                                   usuario.role === 'CAJA' ? 'Caja' : 'Contador'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Selección de permisos */}
                    {selectedUserForAssignment && (
                      <div>
                        <Label className="text-base font-semibold mb-3 block">
                          2. Seleccionar Permisos para {selectedUserForAssignment.nombre_completo}
                        </Label>
                        
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-600" />
                            <p className="text-sm font-medium text-yellow-800">
                              Nota importante sobre permisos personalizados
                            </p>
                          </div>
                          <p className="text-sm text-yellow-700">
                            Los permisos asignados manualmente reemplazarán completamente los permisos predeterminados del rol "{selectedUserForAssignment.role}". 
                            Asegúrate de incluir todos los permisos necesarios para el correcto funcionamiento del usuario.
                          </p>
                        </div>
                        
                        {/* Botones de selección rápida */}
                        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg mb-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAssignmentPermissions(getAllAvailablePermissions().map(p => p.id))}
                          >
                            Seleccionar todos
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAssignmentPermissions([])}
                          >
                            Deseleccionar todos
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const basicPermissions = getAllAvailablePermissions()
                                .filter(p => ['Panel de Control', 'Estudiantes', 'Familias'].includes(p.module))
                                .map(p => p.id);
                              setAssignmentPermissions(basicPermissions);
                            }}
                          >
                            Permisos básicos
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const financialPermissions = getAllAvailablePermissions()
                                .filter(p => ['Pagos', 'Cargos', 'Finanzas', 'Cuentas por Cobrar'].includes(p.module))
                                .map(p => p.id);
                              setAssignmentPermissions(financialPermissions);
                            }}
                          >
                            Solo finanzas
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const rolePermissions = getRolePermissions(selectedUserForAssignment.role.toLowerCase() as UserRole);
                              if (rolePermissions) {
                                const currentRolePermissions = rolePermissions.permissions.map(p => 
                                  `${p.module}_${p.action}_${p.scope}`
                                );
                                setAssignmentPermissions(currentRolePermissions);
                              }
                            }}
                          >
                            Permisos del rol actual
                          </Button>
                        </div>
                        
                        {/* Lista de permisos */}
                        <div className="max-h-80 overflow-y-auto space-y-3 mb-4">
                          {getAllAvailablePermissions().map((permission) => (
                            <div key={permission.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                              <input
                                type="checkbox"
                                id={`assign-${permission.id}`}
                                checked={assignmentPermissions.includes(permission.id)}
                                onChange={() => handleAssignmentPermissionToggle(permission.id)}
                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    {permission.module}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs bg-green-100 text-green-800">
                                    {permission.action}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs bg-gray-100">
                                    {permission.scope === 'all' ? 'Toda la plataforma' : 
                                     permission.scope === 'campus' ? 'Solo su campus' : 
                                     permission.scope === 'own' ? 'Solo sus registros' : 'Solo lectura'}
                                  </Badge>
                                </div>
                                <label 
                                  htmlFor={`assign-${permission.id}`} 
                                  className="text-sm text-gray-700 cursor-pointer"
                                >
                                  {permission.description}
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Resumen y botón de asignación */}
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-blue-800">
                              Resumen de asignación
                            </p>
                            <Badge variant="outline" className="bg-blue-100 text-blue-800">
                              {assignmentPermissions.length} permisos seleccionados
                            </Badge>
                          </div>
                          <p className="text-sm text-blue-700 mb-4">
                            Se asignarán {assignmentPermissions.length} permisos personalizados a{' '}
                            <strong>{selectedUserForAssignment.nombre_completo}</strong>
                          </p>
                          <Button 
                            onClick={handleAssignPermissions}
                            className="w-full"
                            disabled={assignmentPermissions.length === 0}
                          >
                            <Key className="w-4 h-4 mr-2" />
                            Asignar Permisos Personalizados
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}