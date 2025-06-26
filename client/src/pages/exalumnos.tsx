import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Plus, Search, Download, Eye, Mail, Phone, Building, FileText } from "lucide-react";

export default function ExAlumnos() {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSeccion, setSelectedSeccion] = useState("all");
  const [selectedCiclo, setSelectedCiclo] = useState("all");

  // Datos demo de ex-alumnos
  const exalumnos = [
    {
      id: 1,
      nombre_completo: "Andrea Patricia González Méndez",
      curp: "GOMA950815MDFRNR03",
      grado_egreso: "3ro Bachillerato",
      seccion_academica: "BACHILLERATO",
      ciclo_egreso: "2013-2014",
      fecha_egreso: "2014-06-15",
      correo: "andrea.gonzalez@universidad.edu.mx",
      telefono: "55-1234-5678",
      ocupacion_actual: "Ingeniera de Software",
      empresa_actual: "Tech Innovations México",
      documentos: [
        { tipo: "CERTIFICADO", descripcion: "Certificado de Bachillerato" },
        { tipo: "BOLETA", descripcion: "Boletas 1ro-3ro Bachillerato" }
      ]
    },
    {
      id: 2,
      nombre_completo: "Carlos Eduardo Ramírez Silva",
      curp: "RASC920310HDFMRL05",
      grado_egreso: "6to Primaria",
      seccion_academica: "PRIMARIA",
      ciclo_egreso: "2004-2005",
      fecha_egreso: "2005-06-20",
      correo: "carlos.ramirez@empresa.com",
      telefono: "55-9876-5432",
      ocupacion_actual: "Director de Marketing",
      empresa_actual: "Grupo Empresarial ABC",
      documentos: [
        { tipo: "CERTIFICADO", descripcion: "Certificado de Primaria" },
        { tipo: "BOLETA", descripcion: "Boletas 1ro-6to Primaria" }
      ]
    },
    {
      id: 3,
      nombre_completo: "María José Fernández López",
      curp: "FELM880925MDFPRR01",
      grado_egreso: "3ro Secundaria",
      seccion_academica: "SECUNDARIA", 
      ciclo_egreso: "2003-2004",
      fecha_egreso: "2004-06-18",
      correo: "mariajose.fernandez@clinica.mx",
      telefono: "55-5555-7777",
      ocupacion_actual: "Médico Pediatra",
      empresa_actual: "Hospital Infantil de México",
      documentos: [
        { tipo: "CERTIFICADO", descripcion: "Certificado de Secundaria" },
        { tipo: "BOLETA", descripcion: "Boletas 1ro-3ro Secundaria" },
        { tipo: "CONSTANCIA", descripcion: "Constancia de conducta" }
      ]
    },
    {
      id: 4,
      nombre_completo: "Luis Alberto Torres Mendoza",
      curp: "TOML850712HDFRRR08",
      grado_egreso: "3ro Kinder",
      seccion_academica: "KINDER",
      ciclo_egreso: "1988-1989",
      fecha_egreso: "1989-06-10",
      correo: "luis.torres@bufete.legal",
      telefono: "55-3333-9999",
      ocupacion_actual: "Abogado Corporativo",
      empresa_actual: "Bufete Legal Torres & Asociados",
      documentos: [
        { tipo: "CONSTANCIA", descripcion: "Constancia de estudios Kinder" }
      ]
    },
    {
      id: 5,
      nombre_completo: "Ana Cristina Herrera Vázquez",
      curp: "HEVA940204MDFRZN02",
      grado_egreso: "3ro Bachillerato",
      seccion_academica: "BACHILLERATO",
      ciclo_egreso: "2012-2013",
      fecha_egreso: "2013-06-14",
      correo: "ana.herrera@startup.mx",
      telefono: "55-7777-1111",
      ocupacion_actual: "CEO y Fundadora",
      empresa_actual: "EduTech Innovations",
      documentos: [
        { tipo: "CERTIFICADO", descripcion: "Certificado de Bachillerato" },
        { tipo: "BOLETA", descripcion: "Boletas completas Bachillerato" },
        { tipo: "CONSTANCIA", descripcion: "Constancia de excelencia académica" }
      ]
    }
  ];

  const filteredExAlumnos = exalumnos.filter(alumno => {
    const matchesSearch = alumno.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alumno.curp.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeccion = selectedSeccion === "all" || alumno.seccion_academica === selectedSeccion;
    const matchesCiclo = selectedCiclo === "all" || alumno.ciclo_egreso === selectedCiclo;
    return matchesSearch && matchesSeccion && matchesCiclo;
  });

  const estadisticas = {
    totalExAlumnos: exalumnos.length,
    egresadosBachillerato: exalumnos.filter(a => a.seccion_academica === "BACHILLERATO").length,
    egresadosSecundaria: exalumnos.filter(a => a.seccion_academica === "SECUNDARIA").length,
    documentosDigitales: exalumnos.reduce((sum, a) => sum + a.documentos.length, 0)
  };

  const getSeccionBadge = (seccion: string) => {
    const colors = {
      KINDER: "bg-pink-100 text-pink-800",
      PRIMARIA: "bg-blue-100 text-blue-800",
      SECUNDARIA: "bg-green-100 text-green-800",
      BACHILLERATO: "bg-purple-100 text-purple-800"
    };
    
    return (
      <Badge className={colors[seccion as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {seccion}
      </Badge>
    );
  };

  const getDocumentoBadge = (tipo: string) => {
    const colors = {
      CERTIFICADO: "bg-green-100 text-green-800",
      BOLETA: "bg-blue-100 text-blue-800",
      CONSTANCIA: "bg-orange-100 text-orange-800"
    };
    
    return (
      <Badge className={colors[tipo as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {tipo}
      </Badge>
    );
  };

  return (
    <div >
      <div >
        
        <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Ex-Alumnos</h1>
          <p className="text-slate-600">Gestión de egresados y archivo de documentos académicos</p>
            </div>
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
              <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar Ex-Alumno
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Registrar ex-alumno</DialogTitle>
                </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="md:col-span-2">
                    <Label>Nombre completo</Label>
                    <Input placeholder="Nombre completo del ex-alumno" />
                  </div>
              <div>
                    <Label>CURP</Label>
                    <Input placeholder="CURP del ex-alumno" />
                  </div>
              <div>
                    <Label>Fecha de nacimiento</Label>
                    <Input type="date" />
                  </div>
              <div>
                    <Label>Grado de egreso</Label>
                    <Input placeholder="3ro Bachillerato" />
                  </div>
              <div>
                    <Label>Sección académica</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar sección..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KINDER">Kinder</SelectItem>
                        <SelectItem value="PRIMARIA">Primaria</SelectItem>
                        <SelectItem value="SECUNDARIA">Secundaria</SelectItem>
                        <SelectItem value="BACHILLERATO">Bachillerato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
              <div>
                    <Label>Ciclo de egreso</Label>
                    <Input placeholder="2023-2024" />
                  </div>
              <div>
                    <Label>Fecha de egreso</Label>
                    <Input type="date" />
                  </div>
              <div>
                    <Label>Correo electrónico</Label>
                    <Input type="email" placeholder="correo@ejemplo.com" />
                  </div>
              <div>
                    <Label>Teléfono</Label>
                    <Input placeholder="55-1234-5678" />
                  </div>
              <div>
                    <Label>Ocupación actual</Label>
                    <Input placeholder="Profesión o trabajo actual" />
                  </div>
              <div>
                    <Label>Empresa actual</Label>
                    <Input placeholder="Nombre de la empresa" />
                  </div>
              <div className="md:col-span-2">
                    <Label>Dirección actual</Label>
                    <Input placeholder="Dirección completa actual" />
                  </div>
                </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancelar
                  </Button>
              <Button className="bg-blue-600 hover:bg-blue-700">
                    Registrar Ex-Alumno
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <GraduationCap className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.totalExAlumnos}</div>
            <div className="text-sm text-slate-600">Total ex-alumnos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{estadisticas.egresadosBachillerato}</div>
            <div className="text-sm text-slate-600">Egresados Bachillerato</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{estadisticas.egresadosSecundaria}</div>
            <div className="text-sm text-slate-600">Egresados Secundaria</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <FileText className="w-8 h-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.documentosDigitales}</div>
            <div className="text-sm text-slate-600">Documentos digitales</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="lista" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="lista">Lista de ex-alumnos</TabsTrigger>
              <TabsTrigger value="documentos">Gestión de documentos</TabsTrigger>
            </TabsList>

            <TabsContent value="lista">
              {/* Filtros */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Filtros y búsqueda</CardTitle>
                </CardHeader>
                <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                      <Label htmlFor="search">Buscar ex-alumno</Label>
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
                      <Label>Sección académica</Label>
                      <Select value={selectedSeccion} onValueChange={setSelectedSeccion}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas las secciones</SelectItem>
                          <SelectItem value="KINDER">Kinder</SelectItem>
                          <SelectItem value="PRIMARIA">Primaria</SelectItem>
                          <SelectItem value="SECUNDARIA">Secundaria</SelectItem>
                          <SelectItem value="BACHILLERATO">Bachillerato</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                <div>
                      <Label>Ciclo de egreso</Label>
                      <Select value={selectedCiclo} onValueChange={setSelectedCiclo}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los ciclos</SelectItem>
                          <SelectItem value="2013-2014">2013-2014</SelectItem>
                          <SelectItem value="2012-2013">2012-2013</SelectItem>
                          <SelectItem value="2004-2005">2004-2005</SelectItem>
                          <SelectItem value="2003-2004">2003-2004</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => {
                        setSearchTerm("");
                        setSelectedSeccion("all");
                        setSelectedCiclo("all");
                      }}>
                        Limpiar filtros
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ex-alumnos registrados ({filteredExAlumnos.length})</CardTitle>
                </CardHeader>
                <CardContent>
              <div className="space-y-4">
                    {filteredExAlumnos.map((alumno) => (
                  <div key={alumno.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 font-semibold">
                              {alumno.nombre_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
                            </span>
                          </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{alumno.nombre_completo}</h3>
                              {getSeccionBadge(alumno.seccion_academica)}
                            </div>
                        <p className="text-sm text-slate-600">{alumno.grado_egreso} • Egreso: {alumno.ciclo_egreso}</p>
                        <p className="text-sm text-slate-500">
                              {alumno.ocupacion_actual} en {alumno.empresa_actual}
                            </p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {alumno.correo}
                              </span>
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {alumno.telefono}
                              </span>
                              <span>{alumno.documentos.length} documentos</span>
                            </div>
                          </div>
                        </div>
                    <div className="text-right">
                      <div className="flex flex-wrap gap-1 mb-2">
                            {alumno.documentos.slice(0, 2).map((doc, index) => (
                          <div key={index}>
                                {getDocumentoBadge(doc.tipo)}
                              </div>
                            ))}
                            {alumno.documentos.length > 2 && (
                              <Badge variant="outline">+{alumno.documentos.length - 2}</Badge>
                            )}
                          </div>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            toast({
                              title: "Viendo Perfil",
                              description: `Abriendo expediente completo de ${alumno.nombre_completo}`,
                              duration: 2000,
                            });
                          }}
                        >
                              <Eye className="w-3 h-3" />
                            </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            toast({
                              title: "Descargando Documentos",
                              description: `${alumno.documentos.length} documentos de ${alumno.nombre_completo} descargados`,
                              duration: 2000,
                            });
                          }}
                        >
                              <Download className="w-3 h-3" />
                            </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            window.open(`mailto:${alumno.correo}`, '_blank');
                            toast({
                              title: "Contactando Ex-Alumno",
                              description: `Enviando email a ${alumno.nombre_completo}`,
                              duration: 2000,
                            });
                          }}
                        >
                              <Mail className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documentos">
              <Card>
                <CardHeader>
                  <CardTitle>Gestión de documentos académicos</CardTitle>
                </CardHeader>
                <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                      <Label>Seleccionar ex-alumno</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Buscar ex-alumno..." />
                        </SelectTrigger>
                        <SelectContent>
                          {exalumnos.map(alumno => (
                            <SelectItem key={alumno.id} value={alumno.id.toString()}>
                              {alumno.nombre_completo} - {alumno.grado_egreso}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                <div>
                      <Label>Tipo de documento</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CERTIFICADO">Certificado</SelectItem>
                          <SelectItem value="BOLETA">Boleta de calificaciones</SelectItem>
                          <SelectItem value="CONSTANCIA">Constancia</SelectItem>
                          <SelectItem value="DIPLOMA">Diploma</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                <div>
                      <Label>Grado/Período</Label>
                      <Input placeholder="1ro Primaria, 2024-2025, etc." />
                    </div>
                <div>
                      <Label>Fecha de emisión</Label>
                      <Input type="date" />
                    </div>
                <div className="md:col-span-2">
                      <Label>Subir documento</Label>
                  <div className="mt-2 border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                        <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Arrastra el archivo aquí o haz clic para seleccionar</p>
                    <p className="text-xs text-slate-400">PDF, DOC, JPG hasta 10MB</p>
                      </div>
                    </div>
                <div className="md:col-span-2">
                      <Label>Observaciones</Label>
                      <textarea 
                        className="w-full p-2 border rounded"
                        rows={2}
                        placeholder="Observaciones adicionales sobre el documento..."
                      />
                    </div>
                  </div>
              <Button className="mt-4 bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar documento
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