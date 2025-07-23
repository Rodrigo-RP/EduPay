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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Mail, Phone, Lock, Camera, Save, X, Upload, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

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

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function Profile() {
  const { user, guardian } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGuardian = !!guardian;
  const profileEndpoint = isGuardian ? "/api/guardian/profile" : "/api/profile";
  const passwordEndpoint = isGuardian ? "/api/guardian/profile/password" : "/api/profile/password";

  // Fetch current profile data
  const { data: profileData, isLoading } = useQuery({
    queryKey: [profileEndpoint],
    enabled: !!(user || guardian),
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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

  // Handle form submissions
  const onProfileSubmit = (data: ProfileForm) => {
    profileMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordForm) => {
    passwordMutation.mutate(data);
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
      </Tabs>
    </div>
  );
}