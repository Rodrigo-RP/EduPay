import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";
import { Calendar, Bell, Key, Mail, Settings, Shield, School, CreditCard, Database, Palette, Globe, Users, FileText, Upload } from "lucide-react";

export default function Configuracion() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoGenerationEnabled, setAutoGenerationEnabled] = useState(true);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  
  // Estados para información institucional
  const [rfc, setRfc] = useState("CSP123456789");
  const [direccionFiscal, setDireccionFiscal] = useState("Av. Reforma 123, Col. Centro");
  const [ciudad, setCiudad] = useState("Ciudad de México");
  const [codigoPostal, setCodigoPostal] = useState("06000");
  const [telefonoPrincipal, setTelefonoPrincipal] = useState("55-1234-5678");
  const [emailInstitucional, setEmailInstitucional] = useState("admin@jfr.edu.mx");
  const [sitioWeb, setSitioWeb] = useState("www.jfr.edu.mx");
  const { toast } = useToast();
  const { 
    institutionName, 
    campusName, 
    logoUrl, 
    setInstitutionName, 
    setCampusName, 
    setLogoUrl 
  } = useInstitution();

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tamaño (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "El archivo es demasiado grande. Máximo 2MB.",
        variant: "destructive"
      });
      return;
    }

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Solo se permiten archivos de imagen (PNG, JPG, SVG).",
        variant: "destructive"
      });
      return;
    }

    // Crear vista previa y actualizar inmediatamente el sidebar
    const reader = new FileReader();
    reader.onload = (e) => {
      const logoDataUrl = e.target?.result as string;
      setLogoPreview(logoDataUrl);
      setLogoUrl(logoDataUrl); // Actualizar inmediatamente el sidebar
      toast({
        title: "Logo actualizado",
        description: "El logo se ha actualizado en el sidebar. Los cambios se guardarán automáticamente.",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoUrl(null); // Remover inmediatamente del sidebar
    const fileInput = document.getElementById('logo-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
    toast({
      title: "Logo eliminado",
      description: "El logo ha sido eliminado del sidebar.",
    });
  };

  const handleSaveChanges = async () => {
    try {
      // Guardar información institucional
      const institutionalData = {
        rfc,
        direccion_fiscal: direccionFiscal,
        ciudad,
        codigo_postal: codigoPostal,
        telefono_principal: telefonoPrincipal,
        email_institucional: emailInstitucional,
        sitio_web: sitioWeb,
        nombre_legal: institutionName
      };

      const response = await fetch('/api/institutional-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(institutionalData),
      });

      if (response.ok) {
        toast({
          title: "Cambios guardados",
          description: "La configuración institucional se ha actualizado correctamente.",
        });
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      console.error('Error saving institutional info:', error);
      toast({
        title: "Error",
        description: "No se pudieron guardar los cambios. Intenta nuevamente.",
        variant: "destructive"
      });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Configuración del Sistema</h1>
          <p className="text-slate-600">Administra la configuración general de Edupay</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSaveChanges}>
          <Settings className="w-4 h-4 mr-2" />
          Guardar Cambios
        </Button>
      </div>

          <Tabs defaultValue="general" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="institucional">Institución</TabsTrigger>
              <TabsTrigger value="pagos">Pagos</TabsTrigger>
              <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
              <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
            </TabsList>

            <TabsContent value="general">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      Configuración general
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-4">
                  <div>
                        <Label>Nombre del sistema</Label>
                        <Input defaultValue="Edupay - Plataforma SaaS" />
                      </div>
                  <div>
                        <Label>Zona horaria</Label>
                        <Select defaultValue="america/mexico">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="america/mexico">América/Ciudad de México</SelectItem>
                            <SelectItem value="america/cancun">América/Cancún</SelectItem>
                            <SelectItem value="america/tijuana">América/Tijuana</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                  <div>
                        <Label>Moneda predeterminada</Label>
                        <Select defaultValue="MXN">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MXN">Peso Mexicano (MXN)</SelectItem>
                            <SelectItem value="USD">Dólar Americano (USD)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Modo de mantenimiento</Label>
                        <Switch />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Configuración Académica
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                          <Label>Ciclo escolar actual</Label>
                          <Select defaultValue="2024-2025">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="2024-2025">2024-2025</SelectItem>
                              <SelectItem value="2025-2026">2025-2026</SelectItem>
                              <SelectItem value="2023-2024">2023-2024</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                    <div>
                          <Label>Estado del ciclo</Label>
                          <Select defaultValue="activo">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="activo">Activo</SelectItem>
                              <SelectItem value="proximo">Próximo</SelectItem>
                              <SelectItem value="cerrado">Cerrado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                          <Label>Fecha inicio ciclo</Label>
                          <Input type="date" defaultValue="2024-08-15" />
                        </div>
                    <div>
                          <Label>Fecha fin ciclo</Label>
                          <Input type="date" defaultValue="2025-06-30" />
                        </div>
                      </div>

                  <div>
                        <Label>Niveles académicos disponibles</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="flex items-center space-x-2">
                            <input type="checkbox" id="kinder" defaultChecked className="rounded" />
                            <label htmlFor="kinder" className="text-sm">Kinder (3-6 años)</label>
                          </div>
                      <div className="flex items-center space-x-2">
                            <input type="checkbox" id="primaria" defaultChecked className="rounded" />
                            <label htmlFor="primaria" className="text-sm">Primaria (6-12 años)</label>
                          </div>
                      <div className="flex items-center space-x-2">
                            <input type="checkbox" id="secundaria" defaultChecked className="rounded" />
                            <label htmlFor="secundaria" className="text-sm">Secundaria (12-15 años)</label>
                          </div>
                      <div className="flex items-center space-x-2">
                            <input type="checkbox" id="bachillerato" defaultChecked className="rounded" />
                            <label htmlFor="bachillerato" className="text-sm">Bachillerato (15-18 años)</label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5" />
                      Notificaciones
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                        <Label>Notificaciones automáticas</Label>
                        <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Recordatorios de vencimiento</Label>
                        <Switch defaultChecked />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Avisos de mora</Label>
                        <Switch defaultChecked />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Confirmaciones de pago</Label>
                        <Switch defaultChecked />
                      </div>
                  <div>
                        <Label>Días de recordatorio antes del vencimiento</Label>
                        <Input type="number" defaultValue="3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="institucional">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <School className="w-5 h-5" />
                    Información institucional
                  </CardTitle>
                </CardHeader>
                <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                      <Label>Nombre legal de la institución</Label>
                      <Input 
                        value={institutionName} 
                        onChange={(e) => setInstitutionName(e.target.value)}
                        placeholder="Nombre de la institución"
                      />
                    </div>
                <div>
                      <Label>RFC</Label>
                      <Input 
                        value={rfc}
                        onChange={(e) => setRfc(e.target.value)}
                        placeholder="RFC de la institución"
                      />
                    </div>
                <div>
                      <Label>Dirección fiscal</Label>
                      <Input 
                        value={direccionFiscal}
                        onChange={(e) => setDireccionFiscal(e.target.value)}
                        placeholder="Dirección fiscal completa"
                      />
                    </div>
                <div>
                      <Label>Ciudad</Label>
                      <Input 
                        value={ciudad}
                        onChange={(e) => setCiudad(e.target.value)}
                        placeholder="Ciudad"
                      />
                    </div>
                <div>
                      <Label>Código postal</Label>
                      <Input 
                        value={codigoPostal}
                        onChange={(e) => setCodigoPostal(e.target.value)}
                        placeholder="Código postal"
                      />
                    </div>
                <div>
                      <Label>Teléfono principal</Label>
                      <Input 
                        value={telefonoPrincipal}
                        onChange={(e) => setTelefonoPrincipal(e.target.value)}
                        placeholder="Teléfono principal"
                      />
                    </div>
                <div>
                      <Label>Email institucional</Label>
                      <Input 
                        value={emailInstitucional}
                        onChange={(e) => setEmailInstitucional(e.target.value)}
                        placeholder="Email institucional"
                      />
                    </div>
                <div>
                      <Label>Sitio web</Label>
                      <Input 
                        value={sitioWeb}
                        onChange={(e) => setSitioWeb(e.target.value)}
                        placeholder="Sitio web institucional"
                      />
                    </div>
                <div className="md:col-span-2">
                      <Label>Logo de la institución</Label>
                      <p className="text-xs text-slate-500 mb-2">Este logo aparecerá en el sidebar y será visible para todos los usuarios</p>
                  <div className="mt-2 border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-blue-400 transition-colors cursor-pointer">
                        <input type="file" accept="image/*" className="hidden" id="logo-upload" onChange={handleLogoUpload} />
                        <label htmlFor="logo-upload" className="cursor-pointer">
                          <div className="text-center">
                            <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-lg flex items-center justify-center">
                              <i className="fas fa-university text-slate-400 text-2xl"></i>
                            </div>
                            <p className="text-sm font-medium text-slate-700">Subir logo de la institución</p>
                            <p className="text-xs text-slate-500 mt-1">PNG, JPG o SVG (máximo 2MB)</p>
                            <p className="text-xs text-slate-500">Recomendado: 200x200px</p>
                          </div>
                        </label>
                      </div>
                      
                      {/* Vista previa del logo actual */}
                      <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                        <Label className="text-sm font-medium text-slate-700">Vista previa actual</Label>
                        <div className="mt-2 flex items-center space-x-3">
                          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg overflow-hidden">
                            {logoUrl || logoPreview ? (
                              <img src={logoUrl || logoPreview || ""} alt="Logo preview" className="w-full h-full object-cover" />
                            ) : (
                              <i className="fas fa-university text-white text-lg"></i>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{institutionName}</p>
                            <p className="text-xs text-slate-500">Como aparece en el sidebar</p>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" onClick={handleSaveChanges}>
                            <i className="fas fa-save w-4 h-4 mr-2"></i>
                            Guardar cambios
                          </Button>
                          {logoPreview && (
                            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={handleRemoveLogo}>
                              <i className="fas fa-trash w-4 h-4 mr-2"></i>
                              Eliminar logo
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pagos">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5" />
                      Configuración de pagos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-4">
                  <div>
                        <Label>Pasarela de pagos principal</Label>
                        <Select defaultValue="stripe">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stripe">Stripe</SelectItem>
                            <SelectItem value="openpay">Openpay</SelectItem>
                            <SelectItem value="conekta">Conekta</SelectItem>
                            <SelectItem value="evo">Evo Payment</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Permitir pagos parciales</Label>
                        <Switch defaultChecked />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Generación automática de cargos</Label>
                        <Switch checked={autoGenerationEnabled} onCheckedChange={setAutoGenerationEnabled} />
                      </div>
                  <div>
                        <Label>Recargo por mora (%)</Label>
                        <Input type="number" defaultValue="10" />
                      </div>
                  <div>
                        <Label>Descuento por pronto pago (%)</Label>
                        <Input type="number" defaultValue="5" />
                      </div>
                  <div>
                        <Label>Días para pronto pago</Label>
                        <Input type="number" defaultValue="5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Métodos de pago habilitados</CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                        <Label>Tarjetas de crédito/débito</Label>
                        <Switch defaultChecked />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Transferencias SPEI</Label>
                        <Switch defaultChecked />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>PayPal</Label>
                        <Switch defaultChecked />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>OXXO Pay</Label>
                        <Switch defaultChecked />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Pagos en efectivo (caja física)</Label>
                        <Switch defaultChecked />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Domiciliación bancaria</Label>
                        <Switch />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="fiscal">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Configuración fiscal y CFDI
                  </CardTitle>
                </CardHeader>
                <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                      <Label>Proveedor PAC</Label>
                      <Select defaultValue="facturama">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="facturama">Facturama</SelectItem>
                          <SelectItem value="enlace-fiscal">Enlace Fiscal</SelectItem>
                          <SelectItem value="otro">Otro PAC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                <div>
                      <Label>Certificado SAT (archivo .cer)</Label>
                      <Input type="file" accept=".cer" />
                    </div>
                <div>
                      <Label>Llave privada (archivo .key)</Label>
                      <Input type="file" accept=".key" />
                    </div>
                <div>
                      <Label>Contraseña de llave privada</Label>
                      <Input type="password" placeholder="••••••••" />
                    </div>
                <div>
                      <Label>Régimen fiscal</Label>
                      <Select defaultValue="601">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="601">601 - General de Ley Personas Morales</SelectItem>
                          <SelectItem value="603">603 - Personas Morales con Fines no Lucrativos</SelectItem>
                          <SelectItem value="612">612 - Personas Físicas con Actividades Empresariales</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                <div>
                      <Label>Lugar de expedición (CP)</Label>
                      <Input defaultValue="06000" />
                    </div>
                <div className="flex items-center justify-between">
                      <Label>Generar CFDI automáticamente</Label>
                      <Switch defaultChecked />
                    </div>
                <div className="flex items-center justify-between">
                      <Label>Enviar CFDI por email</Label>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="seguridad">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Configuración de seguridad
                  </CardTitle>
                </CardHeader>
                <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                      <Label>Tiempo de sesión (minutos)</Label>
                      <Input type="number" defaultValue="60" />
                    </div>
                <div>
                      <Label>Intentos de login antes de bloqueo</Label>
                      <Input type="number" defaultValue="3" />
                    </div>
                <div>
                      <Label>Longitud mínima de contraseña</Label>
                      <Input type="number" defaultValue="8" />
                    </div>
                <div className="flex items-center justify-between">
                      <Label>Requerir autenticación de dos factores</Label>
                      <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
                    </div>
                <div className="flex items-center justify-between">
                      <Label>Requerir contraseñas complejas</Label>
                      <Switch defaultChecked />
                    </div>
                <div className="flex items-center justify-between">
                      <Label>Forzar cambio de contraseña</Label>
                      <Switch />
                    </div>
                <div>
                      <Label>Días para cambio de contraseña</Label>
                      <Input type="number" defaultValue="90" />
                    </div>
                <div className="flex items-center justify-between">
                      <Label>Registro de auditoría detallado</Label>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>


          </Tabs>
    </div>
  );
}