import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Sidebar from "@/components/layout/sidebar";
import SaaSInfo from "@/components/saas-info";
import { Gift, Percent, Users, Plus, Edit, Trash2 } from "lucide-react";

export default function Becas() {
  const [showAddModal, setShowAddModal] = useState(false);

  // Datos demo de becas y descuentos
  const becas = [
    {
      id: 1,
      nombre: "Beca de Excelencia Académica",
      tipo: "BECA",
      porcentaje: 50,
      criterios: "Promedio >= 9.0",
      estudiantesAplicados: 8,
      activa: true,
      vigencia: "2024-2025"
    },
    {
      id: 2,
      nombre: "Beca Socioeconómica",
      tipo: "BECA",
      porcentaje: 30,
      criterios: "Estudio socioeconómico",
      estudiantesAplicados: 12,
      activa: true,
      vigencia: "2024-2025"
    },
    {
      id: 3,
      nombre: "Descuento Hermanos",
      tipo: "DESCUENTO",
      porcentaje: 15,
      criterios: "2 o más hermanos inscritos",
      estudiantesAplicados: 6,
      activa: true,
      vigencia: "2024-2025"
    },
    {
      id: 4,
      nombre: "Descuento Pronto Pago",
      tipo: "DESCUENTO",
      porcentaje: 5,
      criterios: "Pago antes de 5 días del vencimiento",
      estudiantesAplicados: 25,
      activa: true,
      vigencia: "2024-2025"
    },
    {
      id: 5,
      nombre: "Beca Deportiva",
      tipo: "BECA",
      porcentaje: 25,
      criterios: "Participación en equipos representativos",
      estudiantesAplicados: 4,
      activa: false,
      vigencia: "2024-2025"
    }
  ];

  const estadisticas = {
    totalBecas: becas.filter(b => b.tipo === "BECA").length,
    totalDescuentos: becas.filter(b => b.tipo === "DESCUENTO").length,
    estudiantesBeneficiados: becas.reduce((sum, b) => sum + b.estudiantesAplicados, 0),
    ahorroPorcentual: becas.filter(b => b.activa).reduce((sum, b) => sum + (b.porcentaje * b.estudiantesAplicados), 0) / becas.filter(b => b.activa).reduce((sum, b) => sum + b.estudiantesAplicados, 0) || 0
  };

  const getBadgeColor = (tipo: string, activa: boolean) => {
    if (!activa) return "bg-gray-100 text-gray-600";
    return tipo === "BECA" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800";
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <SaaSInfo />
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Becas y Descuentos</h1>
              <p className="text-slate-600">Gestiona apoyos económicos y descuentos para estudiantes</p>
            </div>
            <Button onClick={() => setShowAddModal(true)} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Beca/Descuento
            </Button>
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Gift className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.totalBecas}</div>
                <div className="text-sm text-slate-600">Becas activas</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Percent className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.totalDescuentos}</div>
                <div className="text-sm text-slate-600">Descuentos activos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.estudiantesBeneficiados}</div>
                <div className="text-sm text-slate-600">Estudiantes beneficiados</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{estadisticas.ahorroPorcentual.toFixed(1)}%</div>
                <div className="text-sm text-slate-600">Ahorro promedio</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="lista" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="lista">Lista de becas/descuentos</TabsTrigger>
              <TabsTrigger value="asignacion">Asignación individual</TabsTrigger>
              <TabsTrigger value="reportes">Reportes y estadísticas</TabsTrigger>
            </TabsList>

            <TabsContent value="lista">
              <Card>
                <CardHeader>
                  <CardTitle>Becas y descuentos configurados</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {becas.map((beca) => (
                      <div key={beca.id} className="p-4 border rounded-lg hover:bg-slate-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{beca.nombre}</h3>
                              <Badge className={getBadgeColor(beca.tipo, beca.activa)}>
                                {beca.tipo}
                              </Badge>
                              {!beca.activa && (
                                <Badge variant="secondary">Inactiva</Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-600">{beca.criterios}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                              <span>Vigencia: {beca.vigencia}</span>
                              <span>{beca.estudiantesAplicados} estudiantes beneficiados</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-2xl font-bold text-purple-600">{beca.porcentaje}%</div>
                              <div className="text-xs text-slate-500">Descuento</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch checked={beca.activa} />
                              <Button size="sm" variant="outline">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="asignacion">
              <Card>
                <CardHeader>
                  <CardTitle>Asignar beca/descuento individual</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label>Estudiante</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Buscar estudiante..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Carlos Pérez Méndez - 3ro A</SelectItem>
                          <SelectItem value="2">Andrea García Luna - 2do B</SelectItem>
                          <SelectItem value="3">Luis Martínez Gil - 1ro A</SelectItem>
                          <SelectItem value="4">Diego Martínez Gil - Kinder C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Beca/Descuento</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar beca..." />
                        </SelectTrigger>
                        <SelectContent>
                          {becas.filter(b => b.activa).map(beca => (
                            <SelectItem key={beca.id} value={beca.id.toString()}>
                              {beca.nombre} - {beca.porcentaje}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Porcentaje personalizado (opcional)</Label>
                      <Input type="number" placeholder="25" min="0" max="100" />
                    </div>
                    <div>
                      <Label>Vigencia</Label>
                      <Select defaultValue="2024-2025">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2024-2025">Ciclo 2024-2025</SelectItem>
                          <SelectItem value="permanente">Permanente</SelectItem>
                          <SelectItem value="temporal">Temporal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Label>Justificación</Label>
                    <textarea 
                      className="w-full p-2 border rounded"
                      rows={3}
                      placeholder="Motivo o criterios para la asignación de esta beca/descuento..."
                    />
                  </div>
                  <Button className="mt-4 bg-purple-600 hover:bg-purple-700">
                    Asignar beca/descuento
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reportes">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Reporte de impacto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span>Total de becas otorgadas:</span>
                        <span className="font-semibold">{becas.filter(b => b.tipo === "BECA" && b.activa).length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total de descuentos aplicados:</span>
                        <span className="font-semibold">{becas.filter(b => b.tipo === "DESCUENTO" && b.activa).length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Estudiantes beneficiados:</span>
                        <span className="font-semibold">{estadisticas.estudiantesBeneficiados}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ahorro total estimado:</span>
                        <span className="font-semibold text-green-600">$45,000 MXN</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Acciones rápidas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Button className="w-full" variant="outline">
                        Exportar lista de beneficiarios
                      </Button>
                      <Button className="w-full" variant="outline">
                        Generar reporte de impacto económico
                      </Button>
                      <Button className="w-full" variant="outline">
                        Revisar criterios de elegibilidad
                      </Button>
                      <Button className="w-full bg-purple-600 hover:bg-purple-700">
                        Crear nueva campaña de becas
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}