import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Mail, Phone, Lock, Camera, Save, X, Upload, Eye, EyeOff, Building2, Calendar, Shield, Plus, Edit, Trash2, Bell, Smartphone, CheckCircle, AlertCircle, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { CredentialNotifications, CredentialNotificationsBadge } from "@/components/credential-notifications";

// Profile form schema
const profileSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  telefono: z.string().optional(),
});

// Password form schema
const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Contraseña actual requerida"),
  newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
  confirmPassword: z.string().min(1, "Confirmar contraseña requerida"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

// Institutional credentials schema
const institutionalCredentialSchema = z.object({
  credential_type: z.string().min(1, "Tipo de credencial requerido"),
  credential_name: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  expiration_date: z.string().optional(),
});

// Institutional info schema
const institutionalInfoSchema = z.object({
  seccion_educativa: z.string().min(1, "Sección educativa requerida"),
  rfc: z.string().optional(),
  cct: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;
type InstitutionalCredentialForm = z.infer<typeof institutionalCredentialSchema>;
type InstitutionalInfoForm = z.infer<typeof institutionalInfoSchema>;

export default function Profile() {
  const { user, guardian } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCredentialPassword, setShowCredentialPassword] = useState<{[key: number]: boolean}>({});
  const [isCredentialDialogOpen, setIsCredentialDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<any>(null);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [editingInfo, setEditingInfo] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 2FA state ──────────────────────────────────────────────────────────────
  type TwofaStep = "idle" | "qr" | "disabling";
  const [twofaStep, setTwofaStep]           = useState<TwofaStep>("idle");
  const [twofaSecret, setTwofaSecret]       = useState("");
  const [twofaQrUrl, setTwofaQrUrl]         = useState("");
  const [twofaCode, setTwofaCode]           = useState("");
  const [twofaDisableCode, setTwofaDisableCode] = useState("");

  const isGuardian = !!guardian;
  const profileEndpoint = isGuardian ? "/api/guardian/profile" : "/api/profile";
  const passwordEndpoint = isGuardian ? "/api/guardian/profile/password" : "/api/profile/password";
  
  // Only show institutional tab for admin users (not guardians)
  const canViewInstitutional = !isGuardian && (user?.role === 'admin' || user?.role === 'super_admin');

  // Fetch current profile data
  const { data: profileData, isLoading } = useQuery({
    queryKey: [profileEndpoint],
    enabled: !!(user || guardian),
  });

  // Fetch institutional credentials for admin users
  const { data: institutionalCredentials, isLoading: isLoadingCredentials } = useQuery({
    queryKey: ["/api/profile/institutional-credentials"],
    enabled: canViewInstitutional,
  });

  // Fetch institutional info for admin users
  const { data: institutionalInfo, isLoading: isLoadingInfo } = useQuery({
    queryKey: ["/api/profile/institutional-info"],
    enabled: canViewInstitutional,
  });

  // Profile form
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      email: "",
      telefono: "",
    },
  });

  // Password form
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Institutional credential form
  const credentialForm = useForm<InstitutionalCredentialForm>({
    resolver: zodResolver(institutionalCredentialSchema),
    defaultValues: {
      credential_type: "",
      credential_name: "",
      username: "",
      password: "",
      expiration_date: "",
    },
  });

  // Institutional info form
  const infoForm = useForm<InstitutionalInfoForm>({
    resolver: zodResolver(institutionalInfoSchema),
    defaultValues: {
      seccion_educativa: "",
      rfc: "",
      cct: "",
    },
  });

  // Update form values when profile data is loaded
  useEffect(() => {
    if (profileData) {
      const name = isGuardian 
        ? (profileData as any)?.nombre_completo 
        : (profileData as any)?.name;
      
      profileForm.setValue("name", name || "");
      profileForm.setValue("email", (profileData as any)?.email || "");
      profileForm.setValue("telefono", (profileData as any)?.telefono || "");
      
      // Set photo preview if exists
      if ((profileData as any)?.foto_url) {
        setPhotoPreview((profileData as any).foto_url);
      }
    }
  }, [profileData, profileForm, isGuardian]);

  // Profile update mutation
  const profileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const payload = isGuardian ? {
        nombre_completo: data.name,
        email: data.email,
        telefono: data.telefono,
      } : data;

      return apiRequest(profileEndpoint, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({
        title: "✅ Perfil actualizado",
        description: "Los datos de tu perfil se han guardado correctamente.",
      });
      queryClient.invalidateQueries({ queryKey: [profileEndpoint] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo actualizar el perfil",
        variant: "destructive",
      });
    },
  });

  // Password update mutation
  const passwordMutation = useMutation({
    mutationFn: async (data: PasswordForm) => {
      return apiRequest(passwordEndpoint, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "✅ Contraseña actualizada",
        description: "Tu contraseña se ha cambiado correctamente.",
      });
      passwordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo actualizar la contraseña",
        variant: "destructive",
      });
    },
  });

  // Photo upload mutation
  const photoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await fetch('/api/profile/photo', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error uploading photo');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Foto actualizada",
        description: "Tu foto de perfil se ha actualizado correctamente.",
      });
      setPhotoPreview(data.foto_url);
      queryClient.invalidateQueries({ queryKey: [profileEndpoint] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo actualizar la foto",
        variant: "destructive",
      });
    },
  });

  // ── 2FA mutations ──────────────────────────────────────────────────────────
  const setup2faMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (data: any) => {
      setTwofaSecret(data.manual_code);  // manual_code es el código de respaldo para la app
      setTwofaQrUrl(data.qr_data_url);
      setTwofaCode("");
      setTwofaStep("qr");
    },
    onError: (err: any) => toast({ title: "Error iniciando 2FA", description: err.message, variant: "destructive" }),
  });

  const confirm2faMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("auth_token");
      // El servidor lee el secreto de su propio estado pendiente — solo enviamos el código
      const res = await fetch("/api/auth/2fa/confirm", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ totp_code: twofaCode }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "2FA activado", description: "Autenticación de dos factores activada correctamente." });
      setTwofaStep("idle");
      setTwofaSecret("");
      setTwofaQrUrl("");
      setTwofaCode("");
      queryClient.invalidateQueries({ queryKey: [profileEndpoint] });
    },
    onError: (err: any) => toast({ title: "Código incorrecto", description: err.message, variant: "destructive" }),
  });

  const disable2faMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/auth/2fa", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ totp_code: twofaDisableCode }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "2FA desactivado", description: "Autenticación de dos factores desactivada." });
      setTwofaStep("idle");
      setTwofaDisableCode("");
      queryClient.invalidateQueries({ queryKey: [profileEndpoint] });
    },
    onError: (err: any) => toast({ title: "Código incorrecto", description: err.message, variant: "destructive" }),
  });

  // Institutional credential mutations
  const credentialMutation = useMutation({
    mutationFn: async (data: InstitutionalCredentialForm) => {
      const endpoint = editingCredential 
        ? `/api/profile/institutional-credentials/${editingCredential.id}`
        : "/api/profile/institutional-credentials";
      const method = editingCredential ? "PUT" : "POST";
      
      return apiRequest(endpoint, {
        method,
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "✅ Credencial guardada",
        description: editingCredential 
          ? "Las credenciales se han actualizado correctamente."
          : "Las credenciales se han guardado correctamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/institutional-credentials"] });
      setIsCredentialDialogOpen(false);
      setEditingCredential(null);
      credentialForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "No se pudieron guardar las credenciales",
        variant: "destructive",
      });
    },
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: async (credentialId: number) => {
      return apiRequest(`/api/profile/institutional-credentials/${credentialId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "✅ Credencial eliminada",
        description: "Las credenciales se han eliminado correctamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/institutional-credentials"] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo eliminar la credencial",
        variant: "destructive",
      });
    },
  });

  // Institutional info mutations
  const infoMutation = useMutation({
    mutationFn: async (data: InstitutionalInfoForm) => {
      const endpoint = editingInfo 
        ? `/api/profile/institutional-info/${editingInfo.id}`
        : "/api/profile/institutional-info";
      const method = editingInfo ? "PUT" : "POST";
      
      return apiRequest(endpoint, {
        method,
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "✅ Información guardada",
        description: editingInfo 
          ? "La información institucional se ha actualizado correctamente."
          : "La información institucional se ha guardado correctamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/institutional-info"] });
      setIsInfoDialogOpen(false);
      setEditingInfo(null);
      infoForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo guardar la información",
        variant: "destructive",
      });
    },
  });

  const deleteInfoMutation = useMutation({
    mutationFn: async (infoId: number) => {
      return apiRequest(`/api/profile/institutional-info/${infoId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "✅ Información eliminada",
        description: "La información institucional se ha eliminado correctamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/institutional-info"] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo eliminar la información",
        variant: "destructive",
      });
    },
  });

  // Handle form submissions
  const onProfileSubmit = (data: ProfileForm) => {
    profileMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordForm) => {
    passwordMutation.mutate(data);
  };

  const onCredentialSubmit = (data: InstitutionalCredentialForm) => {
    credentialMutation.mutate(data);
  };

  const onInfoSubmit = (data: InstitutionalInfoForm) => {
    infoMutation.mutate(data);
  };

  // Helper functions for institutional credentials
  const handleEditCredential = (credential: any) => {
    setEditingCredential(credential);
    credentialForm.reset({
      credential_type: credential.credential_type,
      credential_name: credential.credential_name || "",
      username: credential.username || "",
      password: "", // Don't pre-fill password for security
      expiration_date: credential.expiration_date || "",
    });
    setIsCredentialDialogOpen(true);
  };

  const handleDeleteCredential = (credentialId: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta credencial?")) {
      deleteCredentialMutation.mutate(credentialId);
    }
  };

  const handleAddCredential = () => {
    setEditingCredential(null);
    credentialForm.reset();
    setIsCredentialDialogOpen(true);
  };

  // Helper functions for institutional info
  const handleEditInfo = (info: any) => {
    setEditingInfo(info);
    infoForm.reset({
      seccion_educativa: info.seccion_educativa,
      rfc: info.rfc || "",
      cct: info.cct || "",
    });
    setIsInfoDialogOpen(true);
  };

  const handleDeleteInfo = (infoId: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta información?")) {
      deleteInfoMutation.mutate(infoId);
    }
  };

  const handleAddInfo = () => {
    setEditingInfo(null);
    infoForm.reset();
    setIsInfoDialogOpen(true);
  };

  const getSectionLabel = (section: string) => {
    const sections: { [key: string]: string } = {
      "KINDER": "Kinder / Preescolar",
      "PRIMARIA": "Primaria",
      "SECUNDARIA": "Secundaria",
      "BACHILLERATO": "Bachillerato / Preparatoria",
    };
    return sections[section] || section;
  };

  const getCredentialTypeLabel = (type: string) => {
    const types: { [key: string]: string } = {
      firma_electronica: "Firma Electrónica",
      sellos_digitales: "Sellos Digitales",
      idse: "IDSE",
      tarjeta_patronal: "Tarjeta Patronal",
      infonavit: "INFONAVIT",
      otra: "Otra",
    };
    return types[type] || type;
  };

  const getExpirationStatus = (expirationDate: string) => {
    if (!expirationDate) return null;
    
    const today = new Date();
    const expDate = new Date(expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { status: "expired", label: "Vencida", color: "bg-red-100 text-red-800" };
    } else if (diffDays <= 15) {
      return { status: "expiring", label: `Vence en ${diffDays} días`, color: "bg-yellow-100 text-yellow-800" };
    } else {
      return { status: "active", label: "Vigente", color: "bg-green-100 text-green-800" };
    }
  };

  // Handle photo selection
  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "❌ Error",
          description: "Por favor selecciona un archivo de imagen válido",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "❌ Error",
          description: "La imagen debe ser menor a 5MB",
          variant: "destructive",
        });
        return;
      }

      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload photo
      photoMutation.mutate(file);
    }
  };

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    const name = isGuardian 
      ? (profileData as any)?.nombre_completo 
      : (profileData as any)?.name || "Usuario";
    
    return name
      .split(' ')
      .map((word: string) => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <Avatar className="w-20 h-20">
            <AvatarImage src={photoPreview || (profileData as any)?.foto_url} />
            <AvatarFallback className="text-lg font-semibold">
              {getUserInitials()}
            </AvatarFallback>
          </Avatar>
          <Button
            size="sm"
            variant="outline"
            className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={photoMutation.isPending}
          >
            {photoMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            className="hidden"
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mi Perfil</h1>
          <p className="text-muted-foreground">
            Gestiona tu información personal y configuración de cuenta
          </p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Información Personal</TabsTrigger>
          <TabsTrigger value="password">Cambiar Contraseña</TabsTrigger>
          {!isGuardian && ['administrador_general','administrador_campus','super_admin','contador_general','auxiliar_contable','asistente','admisiones'].includes(user?.role ?? '') && (
            <TabsTrigger value="seguridad" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Seguridad
            </TabsTrigger>
          )}
          {canViewInstitutional && (
            <TabsTrigger value="institutional">Información Institucional</TabsTrigger>
          )}
          {canViewInstitutional && (
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notificaciones
              <CredentialNotificationsBadge />
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Información Personal
              </CardTitle>
              <CardDescription>
                Actualiza tu información de contacto y datos personales
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                  <FormField
                    control={profileForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre Completo</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Tu nombre completo"
                            className="max-w-md"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Correo Electrónico
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="tu@email.com"
                            className="max-w-md"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={profileForm.control}
                    name="telefono"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          Teléfono
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="+52 55 1234 5678"
                            className="max-w-md"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2 pt-4">
                    <Button
                      type="submit"
                      disabled={profileMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      {profileMutation.isPending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Guardar Cambios
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Cambiar Contraseña
              </CardTitle>
              <CardDescription>
                Actualiza tu contraseña para mantener tu cuenta segura
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña Actual</FormLabel>
                        <FormControl>
                          <div className="relative max-w-md">
                            <Input
                              {...field}
                              type={showCurrentPassword ? "text" : "password"}
                              placeholder="Tu contraseña actual"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            >
                              {showCurrentPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nueva Contraseña</FormLabel>
                        <FormControl>
                          <div className="relative max-w-md">
                            <Input
                              {...field}
                              type={showNewPassword ? "text" : "password"}
                              placeholder="Tu nueva contraseña"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                            >
                              {showNewPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar Nueva Contraseña</FormLabel>
                        <FormControl>
                          <div className="relative max-w-md">
                            <Input
                              {...field}
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="Confirma tu nueva contraseña"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2 pt-4">
                    <Button
                      type="submit"
                      disabled={passwordMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      {passwordMutation.isPending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                      Cambiar Contraseña
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => passwordForm.reset()}
                      className="flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Cancelar
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {!isGuardian && ['administrador_general','administrador_campus','super_admin','contador_general','auxiliar_contable','asistente','admisiones'].includes(user?.role ?? '') && (
          <TabsContent value="seguridad" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Autenticación de dos factores (2FA)
                </CardTitle>
                <CardDescription>
                  Protege tu cuenta con un código temporal generado por tu aplicación de autenticación.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Status banner */}
                {(profileData as any)?.has_twofa ? (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                      <p className="font-medium text-green-800">2FA activado</p>
                      <p className="text-sm text-green-600">Tu cuenta está protegida con autenticación de dos factores.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800">2FA no activado</p>
                      <p className="text-sm text-amber-600">Tu cuenta solo está protegida por contraseña. Activa 2FA para mayor seguridad.</p>
                    </div>
                  </div>
                )}

                {/* ── ACTIVAR 2FA ─────────────────────────────────── */}
                {!(profileData as any)?.has_twofa && twofaStep === "idle" && (
                  <Button
                    onClick={() => setup2faMutation.mutate()}
                    disabled={setup2faMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {setup2faMutation.isPending ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generando QR...
                      </div>
                    ) : (
                      <><QrCode className="w-4 h-4 mr-2" />Activar 2FA</>
                    )}
                  </Button>
                )}

                {/* ── QR + confirmación ───────────────────────────── */}
                {twofaStep === "qr" && (
                  <div className="space-y-4 border rounded-lg p-5">
                    <div className="space-y-2">
                      <p className="font-medium text-slate-800">Paso 1 — Escanea el código QR</p>
                      <p className="text-sm text-slate-500">
                        Abre Google Authenticator, Authy u otra app compatible con TOTP y escanea el código:
                      </p>
                      {twofaQrUrl && (
                        <div className="flex justify-center py-3">
                          <img src={twofaQrUrl} alt="QR 2FA" className="w-48 h-48 border rounded-lg" />
                        </div>
                      )}
                      <p className="text-xs text-slate-400 text-center">
                        ¿No puedes escanear? Código manual:
                        <code className="ml-1 bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-700">{twofaSecret}</code>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-slate-800">Paso 2 — Confirma con el primer código</p>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="000000"
                          value={twofaCode}
                          onChange={(e) => setTwofaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className="flex-1 border rounded-md px-3 py-2 text-center text-lg tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <Button
                          onClick={() => confirm2faMutation.mutate()}
                          disabled={twofaCode.length < 6 || confirm2faMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {confirm2faMutation.isPending ? "Verificando..." : "Confirmar"}
                        </Button>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setTwofaStep("idle"); setTwofaSecret(""); setTwofaQrUrl(""); }}>
                      Cancelar
                    </Button>
                  </div>
                )}

                {/* ── DESACTIVAR 2FA ──────────────────────────────── */}
                {(profileData as any)?.has_twofa && twofaStep === "idle" && (
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => { setTwofaStep("disabling"); setTwofaDisableCode(""); }}
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    Desactivar 2FA
                  </Button>
                )}

                {twofaStep === "disabling" && (
                  <div className="space-y-3 border border-red-200 rounded-lg p-5 bg-red-50">
                    <p className="font-medium text-red-800">Confirma tu identidad para desactivar 2FA</p>
                    <p className="text-sm text-red-600">Ingresa el código de 6 dígitos de tu aplicación de autenticación:</p>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={twofaDisableCode}
                        onChange={(e) => setTwofaDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="flex-1 border rounded-md px-3 py-2 text-center text-lg tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
                      />
                      <Button
                        onClick={() => disable2faMutation.mutate()}
                        disabled={twofaDisableCode.length < 6 || disable2faMutation.isPending}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        {disable2faMutation.isPending ? "Desactivando..." : "Desactivar"}
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setTwofaStep("idle"); setTwofaDisableCode(""); }}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canViewInstitutional && (
          <TabsContent value="institutional" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Información Institucional
                </CardTitle>
                <CardDescription>
                  Gestiona las credenciales institucionales del campus. Recibe notificaciones automáticas 15 días antes del vencimiento.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-6">
                  <div className="text-sm text-muted-foreground">
                    {Array.isArray(institutionalCredentials) ? institutionalCredentials.length : 0} credenciales guardadas
                  </div>
                  <Button onClick={handleAddCredential} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Agregar Credencial
                  </Button>
                </div>

                {isLoadingCredentials ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : Array.isArray(institutionalCredentials) && institutionalCredentials.length > 0 ? (
                  <div className="space-y-4">
                    {institutionalCredentials.map((credential: any) => {
                      const expirationStatus = getExpirationStatus(credential.expiration_date);
                      return (
                        <div key={credential.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Shield className="w-5 h-5 text-muted-foreground" />
                              <div>
                                <h3 className="font-medium">
                                  {credential.credential_type === 'otra' 
                                    ? credential.credential_name || 'Otra credencial'
                                    : getCredentialTypeLabel(credential.credential_type)
                                  }
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  Usuario: {credential.username || "No especificado"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {expirationStatus && (
                                <Badge variant="secondary" className={expirationStatus.color}>
                                  {expirationStatus.label}
                                </Badge>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditCredential(credential)}
                                className="flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" />
                                Editar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteCredential(credential.id)}
                                className="flex items-center gap-1 text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
                                Eliminar
                              </Button>
                            </div>
                          </div>
                          
                          {credential.expiration_date && (
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              <span>Vence: {new Date(credential.expiration_date).toLocaleDateString('es-ES')}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No hay credenciales institucionales guardadas</p>
                    <p className="text-sm">Agrega credenciales para recibir notificaciones de vencimiento</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* RFC/CCT Management Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  RFC y CCT por Sección Educativa
                </CardTitle>
                <CardDescription>
                  Gestiona los códigos RFC y CCT para cada sección educativa del instituto.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-6">
                  <div className="text-sm text-muted-foreground">
                    {Array.isArray(institutionalInfo) ? institutionalInfo.length : 0} secciones configuradas
                  </div>
                  <Button onClick={handleAddInfo} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Agregar Sección
                  </Button>
                </div>

                {isLoadingInfo ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : Array.isArray(institutionalInfo) && institutionalInfo.length > 0 ? (
                  <div className="space-y-4">
                    {institutionalInfo.map((info: any) => (
                      <div key={info.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Building2 className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <h3 className="font-medium">
                                {getSectionLabel(info.seccion_educativa)}
                              </h3>
                              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                                <span>RFC: {info.rfc || "No especificado"}</span>
                                <span>CCT: {info.cct || "No especificado"}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditInfo(info)}
                              className="flex items-center gap-1"
                            >
                              <Edit className="w-4 h-4" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteInfo(info.id)}
                              className="flex items-center gap-1 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                              Eliminar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No hay información institucional configurada</p>
                    <p className="text-sm mt-2">Agrega RFC y CCT para cada sección educativa</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dialog para agregar/editar credenciales */}
            <Dialog open={isCredentialDialogOpen} onOpenChange={setIsCredentialDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingCredential ? "Editar Credencial" : "Agregar Credencial"}
                  </DialogTitle>
                  <DialogDescription>
                    Ingresa los datos de la credencial institucional. Recibirás notificaciones 15 días antes del vencimiento.
                  </DialogDescription>
                </DialogHeader>
                
                <Form {...credentialForm}>
                  <form onSubmit={credentialForm.handleSubmit(onCredentialSubmit)} className="space-y-4">
                    <FormField
                      control={credentialForm.control}
                      name="credential_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Credencial</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona el tipo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="firma_electronica">Firma Electrónica</SelectItem>
                              <SelectItem value="sellos_digitales">Sellos Digitales</SelectItem>
                              <SelectItem value="idse">IDSE</SelectItem>
                              <SelectItem value="tarjeta_patronal">Tarjeta Patronal</SelectItem>
                              <SelectItem value="infonavit">INFONAVIT</SelectItem>
                              <SelectItem value="otra">Otra</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {credentialForm.watch("credential_type") === "otra" && (
                      <FormField
                        control={credentialForm.control}
                        name="credential_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre de la Credencial</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Especifica el nombre" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={credentialForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Usuario</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Usuario o email de acceso" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={credentialForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contraseña</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="password" 
                              placeholder={editingCredential ? "Dejar vacío para mantener actual" : "Contraseña"}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={credentialForm.control}
                      name="expiration_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha de Vencimiento</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="date"
                              className="max-w-xs"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCredentialDialogOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={credentialMutation.isPending}
                        className="flex items-center gap-2"
                      >
                        {credentialMutation.isPending ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {editingCredential ? "Actualizar" : "Guardar"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            {/* Dialog para agregar/editar información institucional */}
            <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingInfo ? "Editar Información" : "Agregar Información"}
                  </DialogTitle>
                  <DialogDescription>
                    Configura el RFC y CCT para una sección educativa específica.
                  </DialogDescription>
                </DialogHeader>
                
                <Form {...infoForm}>
                  <form onSubmit={infoForm.handleSubmit(onInfoSubmit)} className="space-y-4">
                    <FormField
                      control={infoForm.control}
                      name="seccion_educativa"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sección Educativa</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona la sección" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="KINDER">Kinder / Preescolar</SelectItem>
                              <SelectItem value="PRIMARIA">Primaria</SelectItem>
                              <SelectItem value="SECUNDARIA">Secundaria</SelectItem>
                              <SelectItem value="BACHILLERATO">Bachillerato / Preparatoria</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={infoForm.control}
                      name="rfc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>RFC</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="RFC de la sección educativa"
                              maxLength={13}
                              style={{ textTransform: 'uppercase' }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={infoForm.control}
                      name="cct"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CCT</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Clave de Centro de Trabajo"
                              maxLength={20}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsInfoDialogOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={infoMutation.isPending}
                        className="flex items-center gap-2"
                      >
                        {infoMutation.isPending ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {editingInfo ? "Actualizar" : "Guardar"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}

        {canViewInstitutional && (
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5" />
                  Notificaciones de Credenciales
                </CardTitle>
                <CardDescription>
                  Alertas sobre credenciales institucionales próximas a vencer
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CredentialNotifications />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}