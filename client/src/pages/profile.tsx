import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Mail, Phone, Lock, Camera, Save } from "lucide-react";
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
      name: (profileData as any)?.name || (profileData as any)?.nombre_completo || "",
      email: (profileData as any)?.email || "",
      telefono: (profileData as any)?.telefono || "",
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

  // Update profile defaults when data loads
  if (profileData && !profileForm.formState.isDirty) {
    profileForm.reset({
      name: (profileData as any)?.name || (profileData as any)?.nombre_completo || "",
      email: (profileData as any)?.email || "",
      telefono: (profileData as any)?.telefono || "",
    });
  }

  // Profile update mutation
  const profileMutation = useMutation({
    mutationFn: async (data: ProfileForm & { foto_url?: string }) => {
      const payload = isGuardian 
        ? { nombre_completo: data.name, email: data.email, telefono: data.telefono, foto_url: data.foto_url }
        : { name: data.name, email: data.email, telefono: data.telefono, foto_url: data.foto_url };

      const response = await apiRequest("PUT", profileEndpoint, payload);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Perfil actualizado",
        description: "Tu información personal ha sido actualizada correctamente.",
      });
      queryClient.invalidateQueries({ queryKey: [profileEndpoint] });
      // Update auth context if needed
      if (data.profile) {
        // Update localStorage with new profile data
        const authUser = JSON.parse(localStorage.getItem("auth_user") || "{}");
        localStorage.setItem("auth_user", JSON.stringify({ ...authUser, ...data.profile }));
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error al actualizar perfil",
        description: error.message || "Hubo un problema al actualizar tu información.",
        variant: "destructive",
      });
    },
  });

  // Password update mutation
  const passwordMutation = useMutation({
    mutationFn: async (data: PasswordForm) => {
      const response = await apiRequest("PUT", passwordEndpoint, {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Contraseña actualizada",
        description: "Tu contraseña ha sido cambiada exitosamente.",
      });
      passwordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error al cambiar contraseña",
        description: error.message || "La contraseña actual es incorrecta.",
        variant: "destructive",
      });
    },
  });

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "El archivo es demasiado grande. Máximo 2MB.",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Solo se permiten archivos de imagen (PNG, JPG, SVG).",
        variant: "destructive",
      });
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const photoDataUrl = e.target?.result as string;
      setPhotoPreview(photoDataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const onProfileSubmit = (data: ProfileForm) => {
    profileMutation.mutate({
      ...data,
      foto_url: photoPreview || undefined,
    });
  };

  const onPasswordSubmit = (data: PasswordForm) => {
    passwordMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Mi Perfil</h1>
          <p className="text-slate-600">Administra tu información personal y configuración de seguridad</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Información Personal
            </CardTitle>
            <CardDescription>
              Actualiza tu información básica de contacto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                {/* Photo Upload */}
                <div className="space-y-2">
                  <Label>Foto de Perfil</Label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden">
                      {photoPreview || (profileData as any)?.foto_url ? (
                        <img 
                          src={photoPreview || (profileData as any)?.foto_url} 
                          alt="Profile" 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <Camera className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('photo-upload')?.click()}>
                        <Camera className="w-4 h-4 mr-2" />
                        Subir Foto
                      </Button>
                      {(photoPreview || (profileData as any)?.foto_url) && (
                        <Button type="button" variant="outline" size="sm" onClick={handleRemovePhoto}>
                          Quitar
                        </Button>
                      )}
                    </div>
                  </div>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>

                <FormField
                  control={profileForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Tu nombre completo" {...field} />
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
                      <FormLabel>Correo Electrónico</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                          <Input placeholder="tu@email.com" className="pl-10" {...field} />
                        </div>
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
                      <FormLabel>Teléfono (Opcional)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                          <Input placeholder="+52 123 456 7890" className="pl-10" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={profileMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {profileMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Seguridad
            </CardTitle>
            <CardDescription>
              Cambia tu contraseña para mantener tu cuenta segura
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
                        <Input type="password" placeholder="Tu contraseña actual" {...field} />
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
                        <Input type="password" placeholder="Mínimo 6 caracteres" {...field} />
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
                        <Input type="password" placeholder="Repite la nueva contraseña" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full bg-red-600 hover:bg-red-700"
                  disabled={passwordMutation.isPending}
                >
                  <Lock className="w-4 h-4 mr-2" />
                  {passwordMutation.isPending ? "Actualizando..." : "Cambiar Contraseña"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}