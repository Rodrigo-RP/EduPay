import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

import { FileText, Plus, AlertTriangle, CheckCircle, Clock, DollarSign } from "lucide-react";

export default function Cargos() {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Datos demo de cargos
  const cargos = [
    {
      id: 1,
      estudiante: "Carlos Pérez Méndez",
      concepto: "Colegiatura Enero",
      monto_base: 500000,
      beca_aplicada: 0,
      recargo: 0,
      total: 500000,
      fecha_emision: "2025-01-01",
      fecha_vencimiento: "2025-01-15",
      estado: "pendiente",
      tipo: "AUTOMATICA"
    },
    {
      id: 2,
      estudiante: "Andrea García Luna",
      concepto: "Materiales Didácticos",
      monto_base: 150000,
      beca_aplicada: 10,
      recargo: 0,
      total: 135000,
      fecha_emision: "2025-01-10",
      fecha_vencimiento: "2025-01-20",
      estado: "pendiente",
      tipo: "MANUAL"
    },
    {
      id: 3,
      estudiante: "Luis Martínez Gil",
      concepto: "Colegiatura Diciembre",
      monto_base: 500000,
      beca_aplicada: 0,
      recargo: 50000,
      total: 550000,
      fecha_emision: "2024-12-01",
      fecha_vencimiento: "2024-12-15",
      estado: "vencido",
      tipo: "AUTOMATICA"
    },
    {
      id: 4,
      estudiante: "Diego Martínez Gil",
      concepto: "Colegiatura Enero",
      monto_base: 500000,
      beca_aplicada: 15,
      recargo: 0,
      total: 425000,
      fecha_emision: "2025-01-01",
      fecha_vencimiento: "2025-01-15",
      estado: "pendiente",
      tipo: "AUTOMATICA"
    },
    {
      id: 5,
      estudiante: "Carlos Pérez Méndez",
      concepto: "Colegiatura Diciembre",
      monto_base: 500000,
      beca_aplicada: 0,
      recargo: 0,
      total: 500000,
      fecha_emision: "2024-12-01",
      fecha_vencimiento: "2024-12-15",
      estado: "pagado",
      tipo: "AUTOMATICA"
    }
  ];

  const filteredCargos = selectedStatus === "all" 
    ? cargos 
    : cargos.filter(cargo => cargo.estado === selectedStatus);

  const estadisticas = {
    total: cargos.length,
    pendientes: cargos.filter(c => c.estado === "pendiente").length,
    vencidos: cargos.filter(c => c.estado === "vencido").length,
    pagados: cargos.filter(c => c.estado === "pagado").length,
    montoTotal: cargos.filter(c => c.estado !== "pagado").reduce((sum, c) => sum + c.total, 0)
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "pendiente":
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case "vencido":
        return <Badge className="bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Vencido</Badge>;
      case "pagado":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Pagado</Badge>;
      default:
        return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  const isVencido = (fechaVencimiento: string) => {
    return new Date(fechaVencimiento) < new Date();
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <div className="flex-1 overflow-auto">
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Gestión de Cargos</h1>
              <p className="text-slate-600">Administra cargos automáticos, manuales y extraordinarios</p>
            </div>
            <div className="flex gap-2">
              <Button className="bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 mr-2" />
                Generar Cargos
              </Button>
              <Button variant="outline">
                <FileText className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <FileText className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.total}</div>
                <div className="text-sm text-slate-600">Total cargos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Clock className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.pendientes}</div>
                <div className="text-sm text-slate-600">Pendientes</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.vencidos}</div>
                <div className="text-sm text-slate-600">Vencidos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.pagados}</div>
                <div className="text-sm text-slate-600">Pagados</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <DollarSign className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">${(estadisticas.montoTotal / 100).toLocaleString()}</div>
                <div className="text-sm text-slate-600">Monto pendiente</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="lista" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="lista">Lista de cargos</TabsTrigger>
              <TabsTrigger value="generacion">Generación automática</TabsTrigger>
              <TabsTrigger value="extraordinarios">Cargos extraordinarios</TabsTrigger>
            </TabsList>

            <TabsContent value="lista">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Lista de cargos</CardTitle>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pendiente">Pendientes</SelectItem>
                        <SelectItem value="vencido">Vencidos</SelectItem>
                        <SelectItem value="pagado">Pagados</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredCargos.map((cargo) => (
                      <div key={cargo.id} className={`p-4 border rounded-lg ${isVencido(cargo.fecha_vencimiento) && cargo.estado === 'pendiente' ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{cargo.estudiante}</h3>
                              {getStatusBadge(cargo.estado)}
                              <Badge variant="outline" className="text-xs">
                                {cargo.tipo}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600">{cargo.concepto}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                              <span>Emitido: {cargo.fecha_emision}</span>
                              <span>Vence: {cargo.fecha_vencimiento}</span>
                              {cargo.beca_aplicada > 0 && (
                                <span className="text-green-600">Beca: {cargo.beca_aplicada}%</span>
                              )}
                              {cargo.recargo > 0 && (
                                <span className="text-red-600">Recargo: ${(cargo.recargo / 100).toLocaleString()}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">${(cargo.total / 100).toLocaleString()}</div>
                            {cargo.monto_base !== cargo.total && (
                              <div className="text-sm text-slate-500 line-through">
                                ${(cargo.monto_base / 100).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="generacion">
              <Card>
                <CardHeader>
                  <CardTitle>Generación automática de cargos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label>Período a generar</Label>
                        <Select defaultValue="2025-02">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2025-02">Febrero 2025</SelectItem>
                            <SelectItem value="2025-03">Marzo 2025</SelectItem>
                            <SelectItem value="2025-04">Abril 2025</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Conceptos a generar</Label>
                        <Select defaultValue="colegiaturas">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="colegiaturas">Solo colegiaturas</SelectItem>
                            <SelectItem value="todos">Todos los conceptos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <Button className="bg-blue-600 hover:bg-blue-700">
                        Previsualizar generación
                      </Button>
                      <Button className="bg-green-600 hover:bg-green-700">
                        Generar cargos
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="extraordinarios">
              <Card>
                <CardHeader>
                  <CardTitle>Crear cargo extraordinario</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label>Concepto</Label>
                      <Input placeholder="Excursión, Material especial, etc." />
                    </div>
                    <div>
                      <Label>Monto (MXN)</Label>
                      <Input type="number" placeholder="500" />
                    </div>
                    <div>
                      <Label>Aplicar a</Label>
                      <Select defaultValue="todos">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos los alumnos</SelectItem>
                          <SelectItem value="grado">Por grado</SelectItem>
                          <SelectItem value="grupo">Por grupo específico</SelectItem>
                          <SelectItem value="individual">Alumno individual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Fecha de vencimiento</Label>
                      <Input type="date" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Label>Descripción</Label>
                    <textarea 
                      className="w-full p-2 border rounded"
                      rows={3}
                      placeholder="Detalles del cargo extraordinario..."
                    />
                  </div>
                  <Button className="mt-4 bg-purple-600 hover:bg-purple-700">
                    Crear cargo extraordinario
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}