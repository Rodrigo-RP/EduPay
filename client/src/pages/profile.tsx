import { useState, useEffect } from "react";
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

  // Profile form with static default values
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
      profileForm.setValue("name", (profileData as any)?.name || (profileData as any)?.nombre_completo || "");
      profileForm.setValue("email", (profileData as any)?.email || "");
      profileForm.setValue("telefono", (profileData as any)?.telefono || "");
    }
  }, [profileData, profileForm.setValue]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-cyan-400/10 rounded-full blur-3xl"></div>
        <div className="absolute top-40 right-20 w-48 h-48 bg-gradient-to-br from-purple-400/10 to-pink-400/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-20 left-1/3 w-56 h-56 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl"></div>
      </div>
      
      <div className="container mx-auto p-6 max-w-4xl relative z-10">
        <div className="flex items-center justify-between mb-8 animate-slide-up">
          <div>
            <h1 className="text-4xl font-bold edupay-text-gradient mb-2">Mi Perfil</h1>
            <p className="text-slate-600 text-lg">Administra tu información personal y configuración de seguridad</p>
          </div>
          <div className="edupay-icon-bounce">
            <User className="w-12 h-12 text-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Profile Information */}
        <Card className="edupay-card-shadow edupay-card-hover animate-fade-scale">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-t-lg">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-blue-100 rounded-lg">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <span className="edupay-text-gradient">Información Personal</span>
            </CardTitle>
            <CardDescription className="text-slate-600 ml-11">
              Actualiza tu información básica de contacto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                {/* Photo Upload Premium */}
                <div className="space-y-4">
                  <Label className="text-lg font-semibold text-slate-700">Foto de Perfil</Label>
                  <div className="flex items-center gap-6 p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200">
                    <div className="relative">
                      <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-full flex items-center justify-center overflow-hidden shadow-lg ring-4 ring-white">
                        {photoPreview || (profileData as any)?.foto_url ? (
                          <img 
                            src={photoPreview || (profileData as any)?.foto_url} 
                            alt="Profile" 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <Camera className="w-10 h-10 text-blue-500" />
                        )}
                      </div>
                      {/* Status indicator */}
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                        <Camera className="w-3 h-3 text-white" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-600 mb-3">Personaliza tu perfil con una foto profesional</p>
                      <div className="flex gap-3">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          className="bg-white hover:bg-blue-50 border-blue-200 text-blue-600 hover:text-blue-700 shadow-sm"
                          onClick={() => document.getElementById('photo-upload')?.click()}
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          {photoPreview || (profileData as any)?.foto_url ? 'Cambiar Foto' : 'Subir Foto'}
                        </Button>
                        {(photoPreview || (profileData as any)?.foto_url) && (
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            className="bg-red-50 hover:bg-red-100 border-red-200 text-red-600 hover:text-red-700 shadow-sm"
                            onClick={handleRemovePhoto}
                          >
                            <X className="w-4 h-4 mr-2" />
                            Quitar
                          </Button>
                        )}
                      </div>
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
                        <Input placeholder="Tu nombre completo" className="edupay-input-focus" {...field} />
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
                          <Input placeholder="tu@email.com" className="pl-10 edupay-input-focus" {...field} />
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
                          <Input placeholder="+52 123 456 7890" className="pl-10 edupay-input-focus" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full edupay-button-primary"
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
        <Card className="edupay-card-shadow edupay-card-hover animate-fade-scale">
          <CardHeader className="bg-gradient-to-r from-red-50 to-pink-50 rounded-t-lg">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-red-100 rounded-lg">
                <Lock className="w-6 h-6 text-red-600" />
              </div>
              <span className="bg-gradient-to-r from-red-600 to-pink-600 bg-clip-text text-transparent font-bold">Seguridad</span>
            </CardTitle>
            <CardDescription className="text-slate-600 ml-11">
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
                        <Input type="password" placeholder="Tu contraseña actual" className="edupay-input-focus" {...field} />
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
                        <Input type="password" placeholder="Mínimo 6 caracteres" className="edupay-input-focus" {...field} />
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
                        <Input type="password" placeholder="Repite la nueva contraseña" className="edupay-input-focus" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full edupay-button-danger"
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
    </div>
  );
}