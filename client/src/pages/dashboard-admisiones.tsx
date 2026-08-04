import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoleBasedData } from "@/hooks/useRoleBasedData";
import { useInstitution } from "@/hooks/use-institution";
import { 
  Users, 
  UserPlus, 
  GraduationCap, 
  DollarSign, 
  BookOpen, 
  TrendingUp,
  Calendar,
  Award,
  FileText,
  Phone,
  Mail,
  Clock
} from 'lucide-react';

export default function DashboardAdmisiones() {
  const { 
    filterPaymentData, 
    filterChargesData, 
    canViewMetric,
    getDashboardTitle,
    getDashboardDescription 
  } = useRoleBasedData();
  const { institutionName, logoUrl } = useInstitution();

  // Obtener datos de estudiantes
  const { data: students = [], isLoading: studentsLoading, isError: studentsError } = useQuery<any[]>({
    queryKey: ['/api/students']
  });

  // Obtener datos de pagos (filtrados por rol)
  const { data: payments = [], isLoading: paymentsLoading, isError: paymentsError } = useQuery<any[]>({
    queryKey: ['/api/payments'],
    select: (data) => filterPaymentData(data)
  });

  // Obtener datos de cargos (filtrados por rol)
  const { data: charges = [], isLoading: chargesLoading, isError: chargesError } = useQuery<any[]>({
    queryKey: ['/api/charges'],
    select: (data) => filterChargesData(data)
  });

  // Obtener datos de becas (lista de becas individuales)
  const { data: scholarships = [], isLoading: scholarshipsLoading } = useQuery<any[]>({
    queryKey: ['/api/scholarships']
  });

  // Reporte de admisiones con estadísticas de becas reales
  const { data: admissionsReport } = useQuery<any>({
    queryKey: ['/api/admin/admissions-report']
  });

  // Obtener datos de CRM (prospectos)
  const { data: prospects = [], isLoading: prospectsLoading } = useQuery<any[]>({
    queryKey: ['/api/crm/prospects']
  });

  // Calcular métricas específicas para Admisiones
  const admissionMetrics = {
    totalStudents: students.length,
    newEnrollments: students.filter(s => s.status === 'activo' && new Date(s.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
    enrollmentRevenue: payments
      .filter(p => p.concept?.name?.toLowerCase().includes('inscripcion') || p.concept?.name?.toLowerCase().includes('inscription'))
      .reduce((sum, p) => sum + p.amount, 0),
    activeScholarships: admissionsReport?.becas?.total_activas ?? scholarships.filter(s => s.estado === 'activa').length,
    pendingEnrollments: prospects.filter(p => p.status === 'interested' || p.status === 'pending').length,
    completedEnrollments: prospects.filter(p => p.status === 'enrolled').length,
    totalProspects: prospects.length,
    conversionRate: prospects.length > 0 ? (prospects.filter(p => p.status === 'enrolled').length / prospects.length * 100).toFixed(1) : 0
  };

  // Filtrar estudiantes por nivel académico
  const studentsByLevel = {
    kinder: students.filter(s => s.grado?.toLowerCase().includes('kinder') || s.grado?.toLowerCase().includes('preescolar')).length,
    primaria: students.filter(s => s.grado?.toLowerCase().includes('primaria') || (s.grado && ['1°', '2°', '3°', '4°', '5°', '6°'].some(g => s.grado.includes(g)))).length,
    secundaria: students.filter(s => s.grado?.toLowerCase().includes('secundaria') || (s.grado && ['1° sec', '2° sec', '3° sec'].some(g => s.grado.includes(g)))).length,
    bachillerato: students.filter(s => s.grado?.toLowerCase().includes('bachillerato') || s.grado?.toLowerCase().includes('preparatoria')).length
  };

  // Filtrar pagos de inscripción del mes actual
  const currentMonthEnrollmentPayments = payments.filter(p => {
    const paymentDate = new Date(p.created_at);
    const currentMonth = new Date().getMonth();
    const paymentMonth = paymentDate.getMonth();
    return paymentMonth === currentMonth && 
           (p.concept?.name?.toLowerCase().includes('inscripcion') || p.concept?.name?.toLowerCase().includes('inscription'));
  });



  if (studentsLoading || paymentsLoading || chargesLoading || scholarshipsLoading || prospectsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg font-medium">Cargando dashboard de admisiones...</p>
        </div>
      </div>
    );
  }

  if (studentsError || paymentsError || chargesError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-red-600">Error al cargar datos</p>
          <p className="text-sm text-slate-500">No se pudo conectar con el servidor. Intenta recargar la página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header personalizado para Admisiones */}
      <div className="border-b pb-4">
        <div className="flex items-center gap-4 mb-3">
          {logoUrl && logoUrl.length > 50 && logoUrl.includes('data:image') ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-blue-200">
              <img 
                src={logoUrl} 
                alt="Logo institucional" 
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-blue-600" />
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{getDashboardTitle}</h1>
            <p className="text-gray-600">{getDashboardDescription}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            <GraduationCap className="w-3 h-3 mr-1" />
            Admisiones
          </Badge>
          <Badge variant="outline">
            <Calendar className="w-3 h-3 mr-1" />
            Ciclo Escolar 2025-2026
          </Badge>
          {institutionName && (
            <Badge variant="outline" className="text-gray-600">
              {institutionName}
            </Badge>
          )}
        </div>
      </div>

      {/* Métricas principales para Admisiones */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Estudiantes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-gray-900">{admissionMetrics.totalStudents}</div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500 mt-1">Estudiantes activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Nuevas Inscripciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-green-600">{admissionMetrics.newEnrollments}</div>
              <UserPlus className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-sm text-gray-500 mt-1">Últimos 30 días</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Ingresos por Inscripción</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-purple-600">
                ${admissionMetrics.enrollmentRevenue.toLocaleString()}
              </div>
              <DollarSign className="w-8 h-8 text-purple-600" />
            </div>
            <p className="text-sm text-gray-500 mt-1">Pagos de inscripción</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Becas Activas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-yellow-600">{admissionMetrics.activeScholarships}</div>
              <Award className="w-8 h-8 text-yellow-600" />
            </div>
            <p className="text-sm text-gray-500 mt-1">Becas otorgadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Pestañas específicas para Admisiones */}
      <Tabs defaultValue="students" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="students">Estudiantes por Nivel</TabsTrigger>
          <TabsTrigger value="prospects">Prospectos</TabsTrigger>
          <TabsTrigger value="scholarships">Becas</TabsTrigger>
          <TabsTrigger value="enrollments">Inscripciones</TabsTrigger>
        </TabsList>

        {/* Pestaña de Estudiantes por Nivel */}
        <TabsContent value="students" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Kinder</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-pink-600">{studentsByLevel.kinder}</div>
                <p className="text-sm text-gray-500">Preescolar</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Primaria</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{studentsByLevel.primaria}</div>
                <p className="text-sm text-gray-500">1° - 6° Primaria</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Secundaria</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{studentsByLevel.secundaria}</div>
                <p className="text-sm text-gray-500">1° - 3° Secundaria</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Bachillerato</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{studentsByLevel.bachillerato}</div>
                <p className="text-sm text-gray-500">Preparatoria</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de estudiantes recientes */}
          <Card>
            <CardHeader>
              <CardTitle>Estudiantes Recientes</CardTitle>
              <CardDescription>Últimas inscripciones registradas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {students.slice(0, 5).map((student) => (
                  <div key={student.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{student.nombre_completo}</p>
                        <p className="text-sm text-gray-500">{student.grado} • {student.grupo}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {student.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pestaña de Prospectos */}
        <TabsContent value="prospects" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Prospectos Totales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{admissionMetrics.totalProspects}</div>
                <p className="text-sm text-gray-500">Familias interesadas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Tasa de Conversión</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{admissionMetrics.conversionRate}%</div>
                <p className="text-sm text-gray-500">Prospectos inscritos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{admissionMetrics.pendingEnrollments}</div>
                <p className="text-sm text-gray-500">En proceso</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de prospectos */}
          <Card>
            <CardHeader>
              <CardTitle>Prospectos Recientes</CardTitle>
              <CardDescription>Familias interesadas en inscribirse</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {prospects.slice(0, 5).map((prospect) => (
                  <div key={prospect.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                        <Phone className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium">{prospect.family_name}</p>
                        <p className="text-sm text-gray-500">{prospect.student_name} • {prospect.grade}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={prospect.status === 'enrolled' ? 'default' : 'secondary'}>
                        {prospect.status}
                      </Badge>
                      <Button size="sm" variant="outline">
                        <Mail className="w-4 h-4 mr-1" />
                        Contactar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pestaña de Becas */}
        <TabsContent value="scholarships" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Becas Activas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{admissionMetrics.activeScholarships}</div>
                <p className="text-sm text-gray-500">Estudiantes beneficiados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Monto Descontado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  ${(((admissionsReport?.becas?.monto_total_descuento_centavos ?? 0) / 100)).toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                </div>
                <p className="text-sm text-gray-500">Descuentos otorgados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Alumnos Beneficiados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {admissionsReport?.becas?.alumnos_con_beca ?? scholarships.filter(s => s.estado === 'activa').length}
                </div>
                <p className="text-sm text-gray-500">Con beca activa</p>
              </CardContent>
            </Card>
          </div>

          {/* Distribución por tipo de beca */}
          {admissionsReport?.becas?.por_tipo?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Tipo de Beca</CardTitle>
                <CardDescription>Becas activas agrupadas por categoría</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {admissionsReport.becas.por_tipo.map((tipo: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                          <Award className="w-4 h-4 text-yellow-600" />
                        </div>
                        <div>
                          <p className="font-medium">{tipo.tipo ?? "Sin tipo"}</p>
                          <p className="text-sm text-gray-500 capitalize">{tipo.categoria ?? "general"}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-yellow-700">{tipo.cantidad}</p>
                        <p className="text-xs text-gray-500">becas</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de becas individuales */}
          <Card>
            <CardHeader>
              <CardTitle>Becas Otorgadas</CardTitle>
              <CardDescription>Estudiantes con apoyo económico activo</CardDescription>
            </CardHeader>
            <CardContent>
              {scholarships.filter(s => s.estado === 'activa').length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No hay becas activas registradas para este campus.</p>
              ) : (
                <div className="space-y-3">
                  {scholarships.filter(s => s.estado === 'activa').slice(0, 8).map((scholarship: any) => (
                    <div key={scholarship.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                          <Award className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div>
                          <p className="font-medium">{scholarship.alumno}</p>
                          <p className="text-sm text-gray-500">
                            {scholarship.tipo_nombre ?? "Beca"} •{" "}
                            {scholarship.porcentaje_aplicado != null
                              ? `${scholarship.porcentaje_aplicado}% de descuento`
                              : scholarship.monto_fijo_aplicado_centavos
                              ? `$${(scholarship.monto_fijo_aplicado_centavos / 100).toLocaleString("es-MX")} fijo`
                              : "Sin monto definido"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Activa
                        </span>
                        {scholarship.vigencia_fin && (
                          <p className="text-xs text-gray-400 mt-1">
                            Vence: {new Date(scholarship.vigencia_fin).toLocaleDateString("es-MX")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pestaña de Inscripciones */}
        <TabsContent value="enrollments" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Inscripciones del Mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{currentMonthEnrollmentPayments.length}</div>
                <p className="text-sm text-gray-500">Pagos procesados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Ingresos del Mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${currentMonthEnrollmentPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                </div>
                <p className="text-sm text-gray-500">Inscripciones cobradas</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de inscripciones recientes */}
          <Card>
            <CardHeader>
              <CardTitle>Inscripciones Recientes</CardTitle>
              <CardDescription>Pagos de inscripción procesados</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {currentMonthEnrollmentPayments.slice(0, 5).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">{payment.student?.nombre_completo}</p>
                        <p className="text-sm text-gray-500">{payment.concept?.name} • {payment.method}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">${payment.amount.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(payment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}