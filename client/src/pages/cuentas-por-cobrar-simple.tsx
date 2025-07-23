import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, TrendingDown, Clock, DollarSign, Users, Search, Download, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";
import { useAuth } from "@/hooks/use-auth";

// Tipos de datos
interface CuentaPorCobrar {
  id: number;
  estudiante: string;
  nivel_academico: string;
  concepto: string;
  monto_original_centavos: number;
  pendiente_pagar_centavos: number;
  total_pagado_centavos: number;
  estado_cobranza: string;
  fecha_vencimiento: string;
  dias_vencido: number;
  telefono_contacto?: string;
  email_contacto?: string;
}

export default function CuentasPorCobrar() {
  // Estados para filtros
  const [selectedEstado, setSelectedEstado] = useState("all");
  const [filtroNombre, setFiltroNombre] = useState("");

  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();
  const { user } = useAuth();

  // Datos de prueba
  const cuentasPorCobrarData = [
    {
      id: 1,
      estudiante: "María González",
      nivel_academico: "Primaria",
      concepto: "Colegiatura Enero",
      monto_original_centavos: 280000,
      pendiente_pagar_centavos: 280000,
      total_pagado_centavos: 0,
      estado_cobranza: "VENCIDO",
      fecha_vencimiento: "2025-01-15",
      dias_vencido: 8,
      telefono_contacto: "5551234567",
      email_contacto: "maria.gonzalez@email.com"
    },
    {
      id: 2,
      estudiante: "Carlos Rodríguez",
      nivel_academico: "Secundaria",
      concepto: "Inscripción 2025",
      monto_original_centavos: 320000,
      pendiente_pagar_centavos: 160000,
      total_pagado_centavos: 160000,
      estado_cobranza: "PARCIAL",
      fecha_vencimiento: "2025-01-10",
      dias_vencido: 13,
      telefono_contacto: "5559876543",
      email_contacto: "carlos.rodriguez@email.com"
    }
  ];

  // Función para filtrar las cuentas
  const filtrarCuentas = (cuentas: CuentaPorCobrar[]) => {
    return cuentas.filter((cuenta) => {
      const matchEstado = selectedEstado === "all" || cuenta.estado_cobranza === selectedEstado;
      const matchNombre = !filtroNombre || cuenta.estudiante.toLowerCase().includes(filtroNombre.toLowerCase());
      
      return matchEstado && matchNombre;
    });
  };

  // Aplicar filtros
  const cuentasFiltradas = filtrarCuentas(cuentasPorCobrarData);

  // Calcular métricas
  const totalPorCobrar = cuentasFiltradas.reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const totalVencido = cuentasFiltradas.filter(c => c.estado_cobranza === "VENCIDO" || c.estado_cobranza === "MOROSO").reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);

  // Función para formatear moneda
  const formatCurrency = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  // Función para obtener color de badge por estado
  const getEstadoBadgeColor = (estado: string) => {
    switch (estado) {
      case "CORRIENTE": return "bg-green-100 text-green-800";
      case "VENCIDO": return "bg-yellow-100 text-yellow-800";
      case "MOROSO": return "bg-red-100 text-red-800";
      case "PAGADO": return "bg-blue-100 text-blue-800";
      case "PARCIAL": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cuentas por Cobrar</h1>
          <p className="text-slate-600">Gestión y seguimiento de cartera de cuentas por cobrar</p>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total por Cobrar</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPorCobrar)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Vencido</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalVencido)}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Cuentas</p>
                <p className="text-2xl font-bold text-slate-900">{cuentasFiltradas.length}</p>
              </div>
              <Users className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Promedio Días</p>
                <p className="text-2xl font-bold text-slate-900">
                  {Math.round(cuentasFiltradas.reduce((sum, c) => sum + c.dias_vencido, 0) / cuentasFiltradas.length || 0)}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lista" className="space-y-6">
        <TabsList>
          <TabsTrigger value="lista">Lista de Cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-6">
          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="estado">Estado</Label>
                  <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="CORRIENTE">Corriente</SelectItem>
                      <SelectItem value="VENCIDO">Vencido</SelectItem>
                      <SelectItem value="MOROSO">Moroso</SelectItem>
                      <SelectItem value="PAGADO">Pagado</SelectItem>
                      <SelectItem value="PARCIAL">Parcial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="nombre">Buscar Estudiante</Label>
                  <Input
                    id="nombre"
                    placeholder="Nombre del estudiante..."
                    value={filtroNombre}
                    onChange={(e) => setFiltroNombre(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSelectedEstado("all");
                      setFiltroNombre("");
                    }}
                  >
                    Limpiar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de cuentas */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Cuentas ({cuentasFiltradas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cuentasFiltradas.map((cuenta) => (
                  <div key={cuenta.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-slate-900">{cuenta.estudiante}</h3>
                        <p className="text-sm text-slate-600">{cuenta.nivel_academico} - {cuenta.concepto}</p>
                      </div>
                      <Badge className={getEstadoBadgeColor(cuenta.estado_cobranza)}>
                        {cuenta.estado_cobranza}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-600">Monto Original</p>
                        <p className="font-semibold">{formatCurrency(cuenta.monto_original_centavos)}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Pendiente</p>
                        <p className="font-semibold text-red-600">{formatCurrency(cuenta.pendiente_pagar_centavos)}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Vencimiento</p>
                        <p className="font-semibold">{cuenta.fecha_vencimiento}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Días Vencido</p>
                        <p className="font-semibold">{cuenta.dias_vencido}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t">
                      <div className="text-sm text-slate-600">
                        {cuenta.email_contacto && (
                          <span>{cuenta.email_contacto}</span>
                        )}
                        {cuenta.telefono_contacto && (
                          <span className="ml-2">{cuenta.telefono_contacto}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguimiento">
          <Card>
            <CardHeader>
              <CardTitle>Seguimiento de Cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Herramientas de seguimiento y gestión de cobranza en desarrollo.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <Card>
            <CardHeader>
              <CardTitle>Reportes de Cuentas por Cobrar</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Sistema de reportes en desarrollo.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}