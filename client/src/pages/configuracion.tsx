import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useInstitution } from "@/hooks/use-institution";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Bell, Key, Mail, Settings, Shield, School, CreditCard, Database, Palette, Globe, Users, FileText, Upload, Plus, Edit, Trash2, ToggleLeft, ToggleRight, DollarSign, Activity, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Play, Loader2 } from "lucide-react";
import { generateCiclosList, getCurrentCiclo, useAcademicFilter } from "@/hooks/use-academic-filter";

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
  
  // Estados para conceptos personalizados
  const [conceptosPersonalizados, setConceptosPersonalizados] = useState([
    { id: 1, nombre: "Papelería", activo: true, categoria: "materiales" },
    { id: 2, nombre: "Transporte Escolar", activo: true, categoria: "servicios" },
    { id: 3, nombre: "Eventos Especiales", activo: false, categoria: "actividades" }
  ]);
  const [nuevoConcepto, setNuevoConcepto] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("otros");
  const [editandoConcepto, setEditandoConcepto] = useState<{id: number, nombre: string} | null>(null);
  
  // Cargar datos institucionales existentes
  const { data: institutionalData, isLoading } = useQuery({
    queryKey: ['/api/institutional-info'],
    queryFn: async () => {
      const response = await apiRequest('/api/institutional-info');
      return response.json();
    }
  });

  // Cargar datos cuando se obtienen de la API
  useEffect(() => {
    if (institutionalData && Object.keys(institutionalData).length > 0) {
      setRfc(institutionalData.rfc || "");
      setDireccionFiscal(institutionalData.direccion_fiscal || "");
      setCiudad(institutionalData.ciudad || "");
      setCodigoPostal(institutionalData.codigo_postal || "");
      setTelefonoPrincipal(institutionalData.telefono_principal || "");
      setEmailInstitucional(institutionalData.email_institucional || "");
      setSitioWeb(institutionalData.sitio_web || "");
      
      // Cargar logo desde la base de datos si existe
      if (institutionalData.logo_url) {
        setLogoPreview(institutionalData.logo_url);
        setLogoUrl(institutionalData.logo_url);
      } else {
        // Si no hay logo en BD, limpiar preview local
        setLogoPreview(null);
      }
    }
  }, [institutionalData]);
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
      // No actualizar sidebar hasta que se guarde en BD
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
      // Guardar información institucional incluyendo el logo
      const institutionalData = {
        rfc,
        direccion_fiscal: direccionFiscal,
        ciudad,
        codigo_postal: codigoPostal,
        telefono_principal: telefonoPrincipal,
        email_institucional: emailInstitucional,
        sitio_web: sitioWeb,
        nombre_legal: institutionName,
        logo_url: logoPreview // Incluir el logo en los datos institucionales
      };

      await apiRequest('/api/institutional-info', {
        method: 'POST',
        body: JSON.stringify(institutionalData),
      });

      // Invalidar caché para recargar los datos y actualizar logo en sidebar
      queryClient.invalidateQueries({ queryKey: ['/api/institutional-info'] });
      
      // Actualizar el logo en el contexto institucional inmediatamente
      if (logoPreview) {
        setLogoUrl(logoPreview);
      } else {
        setLogoUrl(null);
      }
      
      toast({
        title: "Cambios guardados",
        description: "La configuración institucional se ha actualizado correctamente.",
      });
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
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="institucional">Institución</TabsTrigger>
              <TabsTrigger value="pagos">Pagos</TabsTrigger>
              <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
              <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
              <TabsTrigger value="diagnostico">🔍 Diagnóstico</TabsTrigger>
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
                          <Select defaultValue={getCurrentCiclo()}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {generateCiclosList().map(c => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
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


            {/* ── TAB: Diagnóstico del Asistente ─────────────────────────── */}
            <TabsContent value="diagnostico">
              <AssistantDiagnosticPanel />
            </TabsContent>

          </Tabs>
    </div>
  );
}

// ── Panel de Diagnóstico del Asistente ────────────────────────────────────────

interface IssueReport {
  id: number;
  createdAt: string;
  action: string;
  moduleId: string;
  status: string;
  failedChecks: Array<{ name: string; detail: string }>;
  userName: string;
  fix?: string | null;
}

interface HealthModule {
  status: "ok" | "config_error" | "technical_error";
  moduleId: string;
  label: string;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
}

interface HealthCheckResult {
  summary: { ok: number; config_error: number; technical_error: number; total: number };
  modules: HealthModule[];
}

function AssistantDiagnosticPanel() {
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [runningHealth, setRunningHealth] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Cargar reportes al montar
  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const res = await apiRequest("/api/assistant/issue-reports");
      const data = await res.json();
      setReports(data.reports || []);
    } catch {
      toast({ title: "Error", description: "No se pudieron cargar los reportes.", variant: "destructive" });
    } finally {
      setLoadingReports(false);
    }
  };

  const runFullHealthCheck = async () => {
    setRunningHealth(true);
    setHealthResult(null);
    try {
      const res = await apiRequest("/api/assistant/health-check", { method: "POST" });
      const data: HealthCheckResult = await res.json();
      setHealthResult(data);
      toast({ title: "Health-check completado", description: `${data.summary.ok}/${data.summary.total} módulos operativos.` });
    } catch {
      toast({ title: "Error", description: "No se pudo ejecutar el health-check.", variant: "destructive" });
    } finally {
      setRunningHealth(false);
    }
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId);
      return next;
    });
  };

  const statusIcon = (status: string) => {
    if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "config_error") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const statusBadge = (status: string) => {
    if (status === "ok") return <Badge className="bg-green-100 text-green-700 border-0">Operativo</Badge>;
    if (status === "config_error") return <Badge className="bg-amber-100 text-amber-700 border-0">Configuración incompleta</Badge>;
    if (status === "fixed") return <Badge className="bg-blue-100 text-blue-700 border-0">Auto-corregido</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-0">Error técnico</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* ── Health-check completo ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Health-check del sistema
          </CardTitle>
          <CardDescription>
            Ejecuta pruebas automáticas en todos los módulos del sistema para verificar su funcionamiento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={runFullHealthCheck}
            disabled={runningHealth}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            {runningHealth
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Ejecutando pruebas…</>
              : <><Play className="w-4 h-4" /> Ejecutar health-check completo</>
            }
          </Button>

          {healthResult && (
            <div className="mt-4 space-y-3">
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{healthResult.summary.ok}</p>
                  <p className="text-xs text-green-600 mt-1">Operativos</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{healthResult.summary.config_error}</p>
                  <p className="text-xs text-amber-600 mt-1">Config incompleta</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{healthResult.summary.technical_error}</p>
                  <p className="text-xs text-red-600 mt-1">Errores técnicos</p>
                </div>
              </div>

              {/* Módulos */}
              <div className="space-y-2 mt-3">
                {healthResult.modules.map((mod) => (
                  <div key={mod.moduleId} className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleModule(mod.moduleId)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {statusIcon(mod.status)}
                        <span className="text-sm font-medium text-slate-700">{mod.label}</span>
                        {statusBadge(mod.status)}
                      </div>
                      {expandedModules.has(mod.moduleId)
                        ? <ChevronUp className="w-4 h-4 text-slate-400" />
                        : <ChevronDown className="w-4 h-4 text-slate-400" />
                      }
                    </button>

                    {expandedModules.has(mod.moduleId) && (
                      <div className="px-4 py-3 bg-slate-50 border-t space-y-2">
                        {mod.checks.map((c, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            {c.ok
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                              : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                            }
                            <div>
                              <p className={c.ok ? "text-slate-600" : "text-red-700 font-medium"}>{c.name}</p>
                              {c.detail && <p className="text-xs text-slate-500 mt-0.5">{c.detail}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Reportes del asistente ────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-slate-600" />
                Reportes del asistente
              </CardTitle>
              <CardDescription>
                Historial de fallos detectados y correcciones aplicadas por el asistente virtual.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadReports} disabled={loadingReports}>
              {loadingReports ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualizar"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingReports ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando reportes…
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Sin reportes de fallos — el sistema está limpio.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 text-xs text-slate-500 font-medium">Fecha</th>
                    <th className="pb-2 pr-4 text-xs text-slate-500 font-medium">Módulo</th>
                    <th className="pb-2 pr-4 text-xs text-slate-500 font-medium">Estado</th>
                    <th className="pb-2 pr-4 text-xs text-slate-500 font-medium">Usuario</th>
                    <th className="pb-2 text-xs text-slate-500 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reports.map((r) => (
                    <tr key={r.id} className="py-2">
                      <td className="py-2 pr-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="py-2 pr-4 text-xs font-medium text-slate-700">{r.moduleId}</td>
                      <td className="py-2 pr-4">{statusBadge(r.status)}</td>
                      <td className="py-2 pr-4 text-xs text-slate-500">{r.userName}</td>
                      <td className="py-2 text-xs text-slate-500 max-w-[200px]">
                        {r.failedChecks?.length > 0
                          ? r.failedChecks.map(c => c.name).join(", ")
                          : r.fix || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}