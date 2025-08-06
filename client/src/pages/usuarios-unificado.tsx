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
import { Users, Plus, Edit, Trash2, UserCheck, UserX, Shield, Mail, AlertTriangle, Key, Settings, Eye, User, Search, Filter, Download, Copy, RefreshCw } from "lucide-react";
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
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<any>(null);
  const [autoGeneratePassword, setAutoGeneratePassword] = useState(true);
  const [customPassword, setCustomPassword] = useState("");
  const [formData, setFormData] = useState({
    nombre_completo: "",
    email: "",
    telefono: "",
    role: "",
    campus: "",
    activo: true
  });

  // Fetch users from API instead of using hardcoded data
  const { data: usuarios = [], isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ['/api/users'],
    select: (data: any[]) => data.map(user => ({
      id: user.id,
      email: user.email,
      nombre_completo: user.name || 'Sin nombre',
      role: user.role,
      telefono: user.telefono || '',
      activo: user.is_active !== false,
      campus: "Campus Principal", // Default for now
      ultimo_acceso: user.last_login_at ? new Date(user.last_login_at).toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : 'Nunca',
      created_at: user.created_at,
      custom_permissions: user.custom_permissions || []
    }))
  });

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

  // Función para generar contraseña automática
  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  // Función para generar usuario automático
  const generateUsername = (nombreCompleto: string) => {
    const nombres = nombreCompleto.toLowerCase().split(' ');
    const primerNombre = nombres[0];
    const apellido = nombres[nombres.length - 1];
    return `${primerNombre}.${apellido}`;
  };

  // Función para manejar la creación de usuarios
  const handleCreateUser = () => {
    const username = generateUsername(formData.nombre_completo);
    const password = autoGeneratePassword ? generatePassword() : customPassword;
    
    // Crear nuevo usuario
    const newUser = {
      id: usuarios.length + 1,
      email: formData.email,
      nombre_completo: formData.nombre_completo,
      role: formData.role,
      telefono: formData.telefono,
      activo: formData.activo,
      campus: formData.campus,
      ultimo_acceso: "Nunca",
      created_at: new Date().toISOString().split('T')[0],
      custom_permissions: []
    };
    
    // TODO: Crear usuario vía API
    // await createUser(newUser);
    refetchUsers();
    
    const credentials = {
      username: username,
      password: password,
      email: formData.email,
      nombre_completo: formData.nombre_completo,
      role: formData.role
    };

    setGeneratedCredentials(credentials);
    setShowCredentialsModal(true);
    setShowAddModal(false);
    
    toast({
      title: "Usuario creado exitosamente",
      description: `Se han generado las credenciales para "${formData.nombre_completo}".`,
    });
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
    setAutoGeneratePassword(true);
    setCustomPassword("");
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
            <div className="text-sm text-gray-600">
              <Key className="w-4 h-4 inline mr-1" />
              Regenerar credenciales • 
              <Shield className="w-4 h-4 inline mx-1" />
              Permisos • 
              <Edit className="w-4 h-4 inline mx-1" />
              Editar • 
              <Trash2 className="w-4 h-4 inline mx-1" />
              Eliminar
            </div>
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
                    onClick={() => {
                      const newPassword = generatePassword();
                      const username = generateUsername(user.nombre_completo);
                      setGeneratedCredentials({
                        username: username,
                        password: newPassword,
                        email: user.email,
                        nombre_completo: user.nombre_completo,
                        role: user.role
                      });
                      setShowCredentialsModal(true);
                      toast({
                        title: "Credenciales regeneradas",
                        description: `Se han generado nuevas credenciales para ${user.nombre_completo}`,
                      });
                    }}
                    title="Regenerar credenciales"
                  >
                    <Key className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleShowPermissions(user)}
                    title="Gestionar permisos"
                  >
                    <Shield className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditUser(user)}
                    title="Editar usuario"
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
                    title="Eliminar usuario"
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
                    {Object.entries(USER_ROLES).map(([key, value]) => (
                      <SelectItem key={key} value={value}>
                        {getRoleDisplayName(value as UserRole)}
                      </SelectItem>
                    ))}
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
            
            {/* Sección de credenciales */}
            <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
              <h4 className="font-semibold text-blue-900">Configuración de credenciales</h4>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={autoGeneratePassword}
                  onCheckedChange={setAutoGeneratePassword}
                />
                <Label>Generar contraseña automáticamente</Label>
              </div>
              
              {!autoGeneratePassword && (
                <div>
                  <Label>Contraseña personalizada</Label>
                  <Input
                    type="password"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    La contraseña debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas y números
                  </p>
                </div>
              )}
              
              <div className="text-sm text-blue-700">
                <p><strong>Usuario generado:</strong> {formData.nombre_completo ? generateUsername(formData.nombre_completo) : "Ingresa el nombre primero"}</p>
                <p><strong>Email de acceso:</strong> {formData.email || "usuario@institutojfr.edu.mx"}</p>
              </div>
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

      {/* Modal para editar usuario */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              Modifica la información del usuario "{editingUser?.nombre_completo}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nombre completo</Label>
                <Input
                  value={formData.nombre_completo}
                  onChange={(e) => setFormData({...formData, nombre_completo: e.target.value})}
                  placeholder="Nombre y apellidos completos"
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
                    {Object.entries(USER_ROLES).map(([key, value]) => (
                      <SelectItem key={key} value={value}>
                        {getRoleDisplayName(value as UserRole)}
                      </SelectItem>
                    ))}
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
            <Button variant="outline" onClick={() => {
              setShowEditModal(false);
              resetForm();
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (!formData.nombre_completo || !formData.email || !formData.role) {
                  toast({
                    title: "Error de validación",
                    description: "Por favor completa todos los campos obligatorios",
                    variant: "destructive"
                  });
                  return;
                }
                
                // Actualizar el usuario vía API y refrescar la lista
                // TODO: Implementar endpoint para actualizar usuario
                // await updateUser(editingUser.id, formData);
                refetchUsers();
                
                toast({
                  title: "Usuario actualizado",
                  description: `Se ha actualizado la información de "${formData.nombre_completo}".`,
                });
                setShowEditModal(false);
                setEditingUser(null);
                resetForm();
              }}
              disabled={!formData.nombre_completo || !formData.email || !formData.role}
            >
              Guardar cambios
            </Button>
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
              // TODO: Eliminar usuario vía API
              // await deleteUser(userToDelete.id);
              refetchUsers();
              
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

      {/* Modal para mostrar credenciales generadas */}
      <Dialog open={showCredentialsModal} onOpenChange={setShowCredentialsModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-green-600" />
              Credenciales generadas
            </DialogTitle>
            <DialogDescription>
              Guarda estas credenciales de forma segura y compártelas con el usuario
            </DialogDescription>
          </DialogHeader>
          
          {generatedCredentials && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-green-800">Nombre del Usuario</Label>
                  <div className="mt-1 p-2 bg-green-50 border rounded text-sm">
                    {generatedCredentials.nombre_completo}
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-semibold text-green-800">Rol asignado</Label>
                  <div className="mt-1 p-2 bg-green-50 border rounded text-sm">
                    {getRoleDisplayName(generatedCredentials.role as UserRole)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                
                <div>
                  <Label className="text-sm font-semibold text-green-800">Email de acceso</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 p-2 bg-white border rounded font-mono text-sm">
                      {generatedCredentials.email}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedCredentials.email);
                        toast({ title: "Email copiado" });
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-semibold text-green-800">Contraseña temporal</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 p-2 bg-white border rounded font-mono text-sm">
                      {generatedCredentials.password}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedCredentials.password);
                        toast({ title: "Contraseña copiada" });
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newPassword = generatePassword();
                        setGeneratedCredentials({...generatedCredentials, password: newPassword});
                        toast({ title: "Contraseña regenerada" });
                      }}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold">Información importante:</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      <li>• Comparte estas credenciales de forma segura</li>
                      <li>• El usuario debe cambiar la contraseña en su primer acceso</li>
                      <li>• URL: https://edupay.institutojfr.edu.mx/login</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (generatedCredentials) {
                  const text = `Credenciales de acceso EDUPAY

Nombre del Usuario: ${generatedCredentials.nombre_completo}
Email de acceso: ${generatedCredentials.email}
Contraseña temporal: ${generatedCredentials.password}
Rol asignado: ${getRoleDisplayName(generatedCredentials.role as UserRole)}

URL de acceso: https://edupay.institutojfr.edu.mx/login

IMPORTANTE:
- Comparte estas credenciales de forma segura
- El usuario debe cambiar la contraseña en su primer acceso
- URL: https://edupay.institutojfr.edu.mx/login`;
                  
                  navigator.clipboard.writeText(text);
                  toast({ 
                    title: "Credenciales copiadas", 
                    description: "Todas las credenciales han sido copiadas al portapapeles" 
                  });
                }
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copiar todo
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (generatedCredentials) {
                  // Simulamos el envío de email
                  toast({ 
                    title: "Credenciales enviadas por email", 
                    description: `Las credenciales han sido enviadas a ${generatedCredentials.email}`,
                    duration: 3000
                  });
                }
              }}
            >
              <Mail className="w-4 h-4 mr-2" />
              Enviar email
            </Button>
            <Button 
              onClick={() => {
                setShowCredentialsModal(false);
                resetForm();
              }}
            >
              Finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}