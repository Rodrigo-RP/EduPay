import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Plus, Edit, Trash2, UserCheck, UserX, Shield, Mail, AlertTriangle, Key, Settings, Eye, User, Search, Filter, Download } from "lucide-react";
import { USER_ROLES, PERMISSIONS, hasPermission, getUserPermissions, getRoleDisplayName, getRoleDescription, UserRole } from "@shared/user-roles";

export default function UsuariosUnificado() {
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
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    nombre_completo: "",
    email: "",
    telefono: "",
    role: "",
    campus: "",
    activo: true
  });

  // Datos demo de usuarios del sistema con nuevos roles
  const usuarios = [
    {
      id: 1,
      email: "admin@institutojfr.edu.mx",
      nombre_completo: "María Elena Rodríguez",
      role: "administrador_general",
      telefono: "55-1234-5678",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-08-06 08:30",
      created_at: "2024-08-01",
      custom_permissions: []
    },
    {
      id: 2,
      email: "direccion@institutojfr.edu.mx", 
      nombre_completo: "Carlos Alberto Méndez",
      role: "administrador_campus",
      telefono: "55-2345-6789",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-08-06 09:15",
      created_at: "2024-08-15",
      custom_permissions: []
    },
    {
      id: 3,
      email: "auxiliar1@institutojfr.edu.mx",
      nombre_completo: "Ana Patricia López",
      role: "auxiliar_contable",
      telefono: "55-3456-7890",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-08-06 10:45",
      created_at: "2024-09-01",
      custom_permissions: []
    },
    {
      id: 4,
      email: "contador@institutojfr.edu.mx",
      nombre_completo: "Jorge Luis Herrera",
      role: "contador_general",
      telefono: "55-4567-8901",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-08-05 16:30",
      created_at: "2024-09-15",
      custom_permissions: []
    },
    {
      id: 5,
      email: "auxiliar2@institutojfr.edu.mx",
      nombre_completo: "Laura Beatriz Silva",
      role: "auxiliar_contable",
      telefono: "55-5678-9012",
      activo: false,
      campus: "Campus Principal",
      ultimo_acceso: "2025-08-01 14:20",
      created_at: "2024-10-01",
      custom_permissions: []
    },
    {
      id: 6,
      email: "admin2@institutojfr.edu.mx",
      nombre_completo: "Roberto Carlos Vega",
      role: "administrador_campus",
      telefono: "55-6789-0123",
      activo: true,
      campus: "Campus Norte",
      ultimo_acceso: "2025-08-06 11:30",
      created_at: "2024-08-20",
      custom_permissions: []
    },
    {
      id: 7,
      email: "admisiones@institutojfr.edu.mx",
      nombre_completo: "Carmen Rosa Martínez",
      role: "admisiones",
      telefono: "55-7890-1234",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-08-06 13:15",
      created_at: "2024-11-01",
      custom_permissions: []
    },
    {
      id: 8,
      email: "asistente@institutojfr.edu.mx",
      nombre_completo: "Patricia Fernández Ruiz",
      role: "asistente",
      telefono: "55-8901-2345",
      activo: true,
      campus: "Campus Principal",
      ultimo_acceso: "2025-08-06 12:00",
      created_at: "2024-12-01",
      custom_permissions: []
    }
  ];

  // Función para obtener icono del rol
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "administrador_general":
        return "fas fa-crown";
      case "administrador_campus":
        return "fas fa-user-shield";
      case "auxiliar_contable":
        return "fas fa-cash-register";
      case "contador_general":
        return "fas fa-calculator";
      case "admisiones":
        return "fas fa-graduation-cap";
      case "asistente":
        return "fas fa-user-tie";
      default:
        return "fas fa-user";
    }
  };

  // Función para obtener color del rol
  const getRoleColor = (role: string) => {
    switch (role) {
      case "administrador_general":
        return "bg-purple-100 text-purple-800";
      case "administrador_campus":
        return "bg-blue-100 text-blue-800";
      case "auxiliar_contable":
        return "bg-green-100 text-green-800";
      case "contador_general":
        return "bg-orange-100 text-orange-800";
      case "admisiones":
        return "bg-cyan-100 text-cyan-800";
      case "asistente":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Filtrar usuarios
  const filteredUsers = usuarios.filter(user => {
    const matchesSearch = user.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === "all" || user.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  // Función para manejar la creación de usuarios
  const handleCreateUser = () => {
    toast({
      title: "Usuario creado",
      description: `Se ha creado el usuario "${formData.nombre_completo}" exitosamente.`,
    });
    resetForm();
    setShowAddModal(false);
  };

  // Función para manejar la edición de usuarios
  const handleEditUser = (user: any) => {
    setEditingUser(user);
    setFormData({
      nombre_completo: user.nombre_completo,
      email: user.email,
      telefono: user.telefono,
      role: user.role,
      campus: user.campus,
      activo: user.activo
    });
    setShowEditModal(true);
  };

  // Función para resetear el formulario
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
  };

  // Función para mostrar modal de permisos
  const handleShowPermissions = (user: any) => {
    setSelectedUserForPermissions(user);
    setCustomPermissions(user.custom_permissions || []);
    setShowPermissionsModal(true);
  };

  // Función para obtener permisos disponibles
  const getAvailablePermissions = () => {
    return Object.entries(PERMISSIONS).map(([key, description]) => ({
      id: key,
      description: description,
      module: key.split('.')[0],
      action: key.split('.')[1]
    }));
  };

  // Función para agrupar permisos por módulo
  const groupPermissionsByModule = () => {
    const permissions = getAvailablePermissions();
    const grouped: { [key: string]: any[] } = {};
    
    permissions.forEach(permission => {
      if (!grouped[permission.module]) {
        grouped[permission.module] = [];
      }
      grouped[permission.module].push(permission);
    });
    
    return grouped;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Usuarios</h1>
          <p className="text-slate-600">Sistema unificado de gestión de usuarios y roles</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      {/* Filtros y búsqueda */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros y búsqueda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Buscar usuario</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Nombre o email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label>Filtrar por rol</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los roles</SelectItem>
                  <SelectItem value="administrador_general">Administrador General</SelectItem>
                  <SelectItem value="administrador_campus">Administrador Campus</SelectItem>
                  <SelectItem value="contador_general">Contador General</SelectItem>
                  <SelectItem value="auxiliar_contable">Auxiliar Contable</SelectItem>
                  <SelectItem value="asistente">Asistente</SelectItem>
                  <SelectItem value="admisiones">Admisiones</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Exportar Lista
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de usuarios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Usuarios del Sistema ({filteredUsers.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                    {user.nombre_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{user.nombre_completo}</h3>
                      <Badge className={getRoleColor(user.role)}>
                        <i className={`${getRoleIcon(user.role)} mr-1`}></i>
                        {getRoleDisplayName(user.role as UserRole)}
                      </Badge>
                      {!user.activo && <Badge variant="destructive">Inactivo</Badge>}
                    </div>
                    <p className="text-sm text-slate-600">{user.email}</p>
                    <p className="text-xs text-slate-500">
                      Último acceso: {user.ultimo_acceso} • {user.campus}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleShowPermissions(user)}
                  >
                    <Shield className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditUser(user)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUserToDelete(user);
                      setShowDeleteModal(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal para crear usuario */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear nuevo usuario</DialogTitle>
            <DialogDescription>
              Completa la información para crear un nuevo usuario del sistema
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nombre completo</Label>
                <Input
                  value={formData.nombre_completo}
                  onChange={(e) => setFormData({...formData, nombre_completo: e.target.value})}
                  placeholder="Juan Pérez García"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="usuario@institutojfr.edu.mx"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={formData.telefono}
                  onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                  placeholder="55-1234-5678"
                />
              </div>
              <div>
                <Label>Rol del sistema</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({...formData, role: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar rol..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrador_campus">Administrador de Campus</SelectItem>
                    <SelectItem value="contador_general">Contador General</SelectItem>
                    <SelectItem value="auxiliar_contable">Auxiliar Contable</SelectItem>
                    <SelectItem value="asistente">Asistente</SelectItem>
                    <SelectItem value="admisiones">Admisiones</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Campus</Label>
              <Input
                value={formData.campus}
                onChange={(e) => setFormData({...formData, campus: e.target.value})}
                placeholder="Campus Principal"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData({...formData, activo: checked})}
              />
              <Label>Usuario activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser}>Crear Usuario</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para gestión de permisos */}
      <Dialog open={showPermissionsModal} onOpenChange={setShowPermissionsModal}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestión de permisos</DialogTitle>
            <DialogDescription>
              Usuario: {selectedUserForPermissions?.nombre_completo} - {getRoleDisplayName(selectedUserForPermissions?.role as UserRole)}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="default" className="w-full">
            <TabsList>
              <TabsTrigger value="default">Permisos por defecto</TabsTrigger>
              <TabsTrigger value="custom">Permisos personalizados</TabsTrigger>
            </TabsList>
            
            <TabsContent value="default" className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-2">Permisos del rol: {getRoleDisplayName(selectedUserForPermissions?.role as UserRole)}</h4>
                <p className="text-sm text-gray-600 mb-3">{getRoleDescription(selectedUserForPermissions?.role as UserRole)}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {selectedUserForPermissions && getUserPermissions(selectedUserForPermissions.role as UserRole).map(permission => (
                    <div key={permission} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      {PERMISSIONS[permission as keyof typeof PERMISSIONS] || permission}
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="custom" className="space-y-4">
              <div className="space-y-4">
                {Object.entries(groupPermissionsByModule()).map(([module, permissions]) => (
                  <Card key={module}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base capitalize">{module}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-2">
                        {permissions.map(permission => (
                          <div key={permission.id} className="flex items-center space-x-2">
                            <Checkbox
                              checked={customPermissions.includes(permission.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setCustomPermissions(prev => [...prev, permission.id]);
                                } else {
                                  setCustomPermissions(prev => prev.filter(p => p !== permission.id));
                                }
                              }}
                            />
                            <Label className="text-sm">{permission.description}</Label>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissionsModal(false)}>Cancelar</Button>
            <Button onClick={() => {
              toast({
                title: "Permisos actualizados",
                description: `Se han actualizado los permisos de ${selectedUserForPermissions?.nombre_completo}`,
              });
              setShowPermissionsModal(false);
            }}>
              Guardar permisos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para eliminar usuario */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Confirmar eliminación
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar al usuario "{userToDelete?.nombre_completo}"? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => {
              toast({
                title: "Usuario eliminado",
                description: `El usuario "${userToDelete?.nombre_completo}" ha sido eliminado del sistema.`,
              });
              setShowDeleteModal(false);
              setUserToDelete(null);
            }}>
              Eliminar usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}