import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Bell, Key, Mail, Settings, Shield, School, CreditCard, Database, Palette, Globe, Users, FileText } from "lucide-react";

export default function Configuracion() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoGenerationEnabled, setAutoGenerationEnabled] = useState(true);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Configuración del Sistema</h1>
          <p className="text-slate-600">Administra la configuración general de EscuelaPay</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700">
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
              <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
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
                        <Input defaultValue="EscuelaPay - Plataforma SaaS" />
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
                      <Input defaultValue="Colegio San Patricio A.C." />
                    </div>
                <div>
                      <Label>RFC</Label>
                      <Input defaultValue="CSP123456789" />
                    </div>
                <div>
                      <Label>Dirección fiscal</Label>
                      <Input defaultValue="Av. Reforma 123, Col. Centro" />
                    </div>
                <div>
                      <Label>Ciudad</Label>
                      <Input defaultValue="Ciudad de México" />
                    </div>
                <div>
                      <Label>Código postal</Label>
                      <Input defaultValue="06000" />
                    </div>
                <div>
                      <Label>Teléfono principal</Label>
                      <Input defaultValue="55-1234-5678" />
                    </div>
                <div>
                      <Label>Email institucional</Label>
                      <Input defaultValue="admin@sanpatricio.edu.mx" />
                    </div>
                <div>
                      <Label>Sitio web</Label>
                      <Input defaultValue="www.sanpatricio.edu.mx" />
                    </div>
                <div className="md:col-span-2">
                      <Label>Logo de la institución</Label>
                  <div className="mt-2 border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                    <p className="text-sm text-slate-500">Arrastra tu logo aquí o haz clic para seleccionar</p>
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

            <TabsContent value="usuarios">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Gestión de usuarios y roles
                  </CardTitle>
                </CardHeader>
                <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                        <Label>Rol predeterminado para nuevos usuarios</Label>
                        <Select defaultValue="caja">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="caja">Caja</SelectItem>
                            <SelectItem value="contador">Contador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Auto-aprobación de nuevos usuarios</Label>
                        <Switch />
                      </div>
                    </div>

                <div>
                      <Label className="text-lg font-semibold">Permisos por rol</Label>
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
                      <div className="font-medium">Función</div>
                      <div className="text-center font-medium">Admin</div>
                      <div className="text-center font-medium">Caja</div>
                      <div className="text-center font-medium">Contador</div>
                        </div>
                    <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
                      <div>Gestión de estudiantes</div>
                      <div className="text-center">✓</div>
                      <div className="text-center">✓</div>
                      <div className="text-center">-</div>
                        </div>
                    <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
                      <div>Registro de pagos</div>
                      <div className="text-center">✓</div>
                      <div className="text-center">✓</div>
                      <div className="text-center">-</div>
                        </div>
                    <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
                      <div>Reportes fiscales</div>
                      <div className="text-center">✓</div>
                      <div className="text-center">-</div>
                      <div className="text-center">✓</div>
                        </div>
                    <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg">
                      <div>Configuración del sistema</div>
                      <div className="text-center">✓</div>
                      <div className="text-center">-</div>
                      <div className="text-center">-</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
    </div>
  );
}