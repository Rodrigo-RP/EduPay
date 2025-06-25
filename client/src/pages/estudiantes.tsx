import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import { Users, Plus, Search, Edit, Trash2, UserCheck, UserX } from "lucide-react";

export default function Estudiantes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrado, setSelectedGrado] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);

  // Datos demo de estudiantes
  const estudiantes = [
    {
      id: 1,
      nombre_completo: "Carlos Pérez Méndez",
      curp: "PEMC051215HDFRZR09",
      grado: "3ro",
      grupo: "A",
      status: "activo",
      responsable: "Carlos Pérez",
      telefono: "5551234567",
      saldo_pendiente: 500000,
      fecha_inscripcion: "2024-08-15"
    },
    {
      id: 2,
      nombre_completo: "Andrea García Luna",
      curp: "GALN040312MDFPPR03",
      grado: "2do",
      grupo: "B",
      status: "activo",
      responsable: "Ana García",
      telefono: "5559876543",
      saldo_pendiente: 535000,
      fecha_inscripcion: "2024-08-16"
    },
    {
      id: 3,
      nombre_completo: "Luis Martínez Gil",
      curp: "MAGL070118HDFRNR05",
      grado: "1ro",
      grupo: "A",
      status: "activo",
      responsable: "Luis Martínez",
      telefono: "5555678901",
      saldo_pendiente: 550000,
      fecha_inscripcion: "2024-08-17"
    },
    {
      id: 4,
      nombre_completo: "Diego Martínez Gil",
      curp: "MAGL090320HDFRNR06",
      grado: "Kinder",
      grupo: "C",
      status: "activo",
      responsable: "Luis Martínez",
      telefono: "5555678901",
      saldo_pendiente: 425000,
      fecha_inscripcion: "2024-08-17"
    }
  ];

  const filteredStudents = estudiantes.filter(student => {
    const matchesSearch = student.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.curp.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrado = selectedGrado === "all" || student.grado === selectedGrado;
    return matchesSearch && matchesGrado;
  });

  const estadisticas = {
    total: estudiantes.length,
    activos: estudiantes.filter(s => s.status === "activo").length,
    saldoPendiente: estudiantes.reduce((sum, s) => sum + s.saldo_pendiente, 0),
    promedioSaldo: estudiantes.reduce((sum, s) => sum + s.saldo_pendiente, 0) / estudiantes.length
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <SaaSInfo />
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Gestión de Estudiantes</h1>
              <p className="text-slate-600">Administra alumnos, responsables y información académica</p>
            </div>
            <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Agregar Estudiante
            </Button>
          </div>

          {/* Estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.total}</div>
                <div className="text-sm text-slate-600">Total estudiantes</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <UserCheck className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold">{estadisticas.activos}</div>
                <div className="text-sm text-slate-600">Estudiantes activos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">${(estadisticas.saldoPendiente / 100).toLocaleString()}</div>
                <div className="text-sm text-slate-600">Saldo pendiente total</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">${(estadisticas.promedioSaldo / 100).toLocaleString()}</div>
                <div className="text-sm text-slate-600">Promedio por estudiante</div>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filtros y búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="search">Buscar estudiante</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="search"
                      placeholder="Nombre o CURP..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <Label>Filtrar por grado</Label>
                  <Select value={selectedGrado} onValueChange={setSelectedGrado}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los grados</SelectItem>
                      <SelectItem value="Kinder">Kinder</SelectItem>
                      <SelectItem value="1ro">1ro</SelectItem>
                      <SelectItem value="2do">2do</SelectItem>
                      <SelectItem value="3ro">3ro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => {
                    setSearchTerm("");
                    setSelectedGrado("all");
                  }}>
                    Limpiar filtros
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de estudiantes */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de estudiantes ({filteredStudents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredStudents.map((student) => (
                  <div key={student.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-semibold">
                          {student.nombre_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-medium">{student.nombre_completo}</h3>
                        <p className="text-sm text-slate-600">{student.grado} {student.grupo} • CURP: {student.curp}</p>
                        <p className="text-xs text-slate-500">Responsable: {student.responsable} • {student.telefono}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="font-semibold">${(student.saldo_pendiente / 100).toLocaleString()}</div>
                        <div className="text-xs text-slate-500">Saldo pendiente</div>
                      </div>
                      <Badge variant={student.status === 'activo' ? 'default' : 'secondary'}>
                        {student.status}
                      </Badge>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="outline">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <UserX className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}