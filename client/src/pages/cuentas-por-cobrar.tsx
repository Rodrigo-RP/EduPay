import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, TrendingDown, Clock, DollarSign, Users, Phone, Mail, Calendar, Search, Filter, Ban, PieChart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PieChartComponent } from "@/components/PieChartComponent";

export default function CuentasPorCobrar() {
  const { toast } = useToast();
  const [selectedEstado, setSelectedEstado] = useState("all");
  const [selectedDiasVencido, setSelectedDiasVencido] = useState("all");
  const [selectedConcepto, setSelectedConcepto] = useState("all");
  const [selectedNivel, setSelectedNivel] = useState("all");
  const [selectedEstudiante, setSelectedEstudiante] = useState("all");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [showCompromiseModal, setShowCompromiseModal] = useState(false);
  const [selectedCuenta, setSelectedCuenta] = useState<any>(null);


  // Colores para gráficos
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  // Datos estáticos para gráficos tipo pastel
  const statusData = [
    { name: 'Corriente', value: 5, color: '#00C49F' },
    { name: 'Vencido', value: 4, color: '#FFBB28' },
    { name: 'Moroso', value: 3, color: '#FF8042' },
    { name: 'Pagado', value: 2, color: '#0088FE' },
    { name: 'Parcial', value: 1, color: '#8884D8' }
  ];

  const daysOverdueData = [
    { name: '0-7 días', value: 6, color: '#00C49F' },
    { name: '8-30 días', value: 4, color: '#FFBB28' },
    { name: '31-60 días', value: 3, color: '#FF8042' },
    { name: '60+ días', value: 2, color: '#8884D8' }
  ];

  const amountRangeData = [
    { name: '$0-$2K', value: 7, color: '#0088FE' },
    { name: '$2K-$5K', value: 4, color: '#00C49F' },
    { name: '$5K-$10K', value: 3, color: '#FFBB28' },
    { name: '$10K+', value: 1, color: '#FF8042' }
  ];



  // Datos demo expandidos de cuentas por cobrar con todos los conceptos
  const cuentasPorCobrar = [
    {
      id: 1,
      estudiante: "Carlos Pérez Méndez",
      responsable: "Carlos Pérez",
      telefono: "5551234567",
      email: "carlos.perez@gmail.com",
      nivel_escolar: "PRIMARIA",
      grado: "3ro Primaria",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 500000,
      descuentos_centavos: 0,
      recargos_centavos: 25000,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 525000,
      dias_vencido: 5,
      estado_cobranza: "VENCIDO",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-18",
      observaciones_cobranza: "Padre confirmó pago para el 25 de enero"
    },
    {
      id: 2,
      estudiante: "Andrea García Luna",
      responsable: "Ana García",
      telefono: "5559876543",
      email: "ana.garcia@yahoo.com",
      nivel_escolar: "SECUNDARIA",
      grado: "2do Secundaria",
      concepto: "Reinscripción 2025-2026",
      fecha_cargo: "2025-01-10",
      monto_inicial_centavos: 350000,
      descuentos_centavos: 35000,
      recargos_centavos: 0,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 315000,
      dias_vencido: 0,
      estado_cobranza: "CORRIENTE",
      fecha_vencimiento: "2025-02-10",
      fecha_compromiso: "2025-01-30",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-12",
      observaciones_cobranza: "Cuenta al corriente, fecha compromiso acordada"
    },
    {
      id: 3,
      estudiante: "Luis Martínez Gil",
      responsable: "María Martínez",
      telefono: "5554567890",
      email: "maria.martinez@hotmail.com",
      nivel_escolar: "BACHILLERATO",
      grado: "3ro Bachillerato",
      concepto: "Colegiatura Diciembre 2024",
      fecha_cargo: "2024-12-01",
      monto_inicial_centavos: 550000,
      descuentos_centavos: 0,
      recargos_centavos: 55000,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 605000,
      dias_vencido: 35,
      estado_cobranza: "MOROSO",
      fecha_vencimiento: "2024-12-15",
      fecha_compromiso: "2025-01-25",
      cuenta_habilitada: false,
      fecha_ultimo_seguimiento: "2025-01-20",
      observaciones_cobranza: "Cuenta deshabilitada por falta de pago"
    },
    {
      id: 4,
      estudiante: "Sofía Hernández Castro",
      responsable: "Roberto Hernández",
      telefono: "5553456789",
      email: "roberto.hernandez@gmail.com",
      nivel_escolar: "PRIMARIA",
      grado: "5to Primaria",
      concepto: "Libros y materiales",
      fecha_cargo: "2025-01-05",
      monto_inicial_centavos: 100000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 50000,
      pendiente_pagar_centavos: 50000,
      dias_vencido: 0,
      estado_cobranza: "PARCIAL",
      fecha_vencimiento: "2025-02-12",
      fecha_compromiso: "2025-01-30",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-15",
      observaciones_cobranza: "Pago parcial recibido, pendiente saldo"
    },
    {
      id: 5,
      estudiante: "Emilia Santos Rivera",
      responsable: "María Rivera Santos",
      telefono: "5551234567",
      email: "maria.rivera@gmail.com",
      nivel_escolar: "KINDER",
      grado: "Kinder 1",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 480000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 480000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-05",
      observaciones_cobranza: "Pago completo recibido puntualmente"
    },
    {
      id: 6,
      estudiante: "Diego Ramírez Silva",
      responsable: "Patricia Silva Ramírez",
      telefono: "5553344556",
      email: "patricia.silva@gmail.com",
      nivel_escolar: "BACHILLERATO",
      grado: "1ro Bachillerato",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 850000,
      descuentos_centavos: 85000,
      recargos_centavos: 0,
      total_pagado_centavos: 400000,
      pendiente_pagar_centavos: 365000,
      dias_vencido: 0,
      estado_cobranza: "PARCIAL",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: "2025-01-30",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-18",
      observaciones_cobranza: "Beca del 10% aplicada, pago parcial recibido"
    },
    {
      id: 7,
      estudiante: "Isabella Morales Ruiz",
      responsable: "Fernando Morales Castro",
      telefono: "5555566778",
      email: "fernando.morales@outlook.com",
      nivel_escolar: "BACHILLERATO",
      grado: "2do Bachillerato",
      concepto: "Reinscripción 2025-2026",
      fecha_cargo: "2025-01-15",
      monto_inicial_centavos: 400000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 400000,
      dias_vencido: 0,
      estado_cobranza: "CORRIENTE",
      fecha_vencimiento: "2025-02-28",
      fecha_compromiso: "2025-02-15",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-16",
      observaciones_cobranza: "Proceso de reinscripción en curso"
    },
    {
      id: 8,
      estudiante: "Miguel Torres Vega",
      responsable: "Carmen Vega Torres",
      telefono: "5559900112",
      email: "carmen.vega@gmail.com",
      nivel_escolar: "SECUNDARIA",
      grado: "2do Secundaria",
      concepto: "Colegiatura Diciembre 2024",
      fecha_cargo: "2024-12-01",
      monto_inicial_centavos: 740000,
      descuentos_centavos: 0,
      recargos_centavos: 148000,
      total_pagado_centavos: 300000,
      pendiente_pagar_centavos: 588000,
      dias_vencido: 42,
      estado_cobranza: "MOROSO",
      fecha_vencimiento: "2024-12-10",
      fecha_compromiso: "2025-02-01",
      cuenta_habilitada: false,
      fecha_ultimo_seguimiento: "2025-01-21",
      observaciones_cobranza: "Cuenta suspendida, acuerdo de pago establecido"
    },
    {
      id: 9,
      estudiante: "Valeria López Cruz",
      responsable: "Eduardo López Mendoza",
      telefono: "5551122334",
      email: "eduardo.lopez@gmail.com",
      nivel_escolar: "SECUNDARIA",
      grado: "3ro Secundaria",
      concepto: "Examen de Admisión Bachillerato",
      fecha_cargo: "2025-01-10",
      monto_inicial_centavos: 150000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 150000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-20",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-11",
      observaciones_cobranza: "Pago de examen de admisión completado"
    },
    {
      id: 10,
      estudiante: "Alejandro Castillo Mendoza",
      responsable: "Gabriela Mendoza Castillo",
      telefono: "5557788990",
      email: "gabriela.mendoza@yahoo.com",
      nivel_escolar: "BACHILLERATO",
      grado: "3ro Bachillerato",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 890000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 890000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-02",
      observaciones_cobranza: "Pago anticipado recibido"
    },
    {
      id: 11,
      estudiante: "Camila Herrera Sandoval",
      responsable: "Fernando Herrera López",
      telefono: "5552233445",
      email: "fernando.herrera@yahoo.com",
      nivel_escolar: "PRIMARIA",
      grado: "4to Primaria",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 640000,
      descuentos_centavos: 320000,
      recargos_centavos: 0,
      total_pagado_centavos: 320000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-03",
      observaciones_cobranza: "Beca del 50% aplicada, pago completo"
    },
    {
      id: 12,
      estudiante: "Mateo Cruz Flores",
      responsable: "Laura Flores García",
      telefono: "5551122334",
      email: "laura.flores@hotmail.com",
      nivel_escolar: "KINDER",
      grado: "Kinder 2",
      concepto: "Seguro Escolar 2025",
      fecha_cargo: "2025-01-08",
      monto_inicial_centavos: 75000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 75000,
      dias_vencido: 0,
      estado_cobranza: "CORRIENTE",
      fecha_vencimiento: "2025-02-08",
      fecha_compromiso: "2025-01-25",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-19",
      observaciones_cobranza: "Seguro escolar pendiente de pago"
    },
    {
      id: 13,
      estudiante: "Daniel Morales Castro",
      responsable: "Lucía Castro Morales",
      telefono: "5553344556",
      email: "lucia.castro@hotmail.com",
      nivel_escolar: "PRIMARIA",
      grado: "5to Primaria",
      concepto: "Uniforme Deportivo",
      fecha_cargo: "2025-01-12",
      monto_inicial_centavos: 85000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 85000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-26",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-13",
      observaciones_cobranza: "Uniforme deportivo pagado y entregado"
    },
    {
      id: 14,
      estudiante: "Sebastián López Martínez",
      responsable: "Gloria Martínez Vega",
      telefono: "5555566778",
      email: "gloria.martinez@hotmail.com",
      nivel_escolar: "PRIMARIA",
      grado: "6to Primaria",
      concepto: "Graduación Primaria",
      fecha_cargo: "2025-01-05",
      monto_inicial_centavos: 200000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 100000,
      pendiente_pagar_centavos: 100000,
      dias_vencido: 0,
      estado_cobranza: "PARCIAL",
      fecha_vencimiento: "2025-03-15",
      fecha_compromiso: "2025-02-15",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-20",
      observaciones_cobranza: "Pago parcial para ceremonia de graduación"
    },
    {
      id: 15,
      estudiante: "Victoria Sandoval Guerrero",
      responsable: "Raúl Sandoval Herrera",
      telefono: "5558899001",
      email: "raul.sandoval@gmail.com",
      nivel_escolar: "BACHILLERATO",
      grado: "3ro Bachillerato",
      concepto: "Colegiatura Noviembre 2024",
      fecha_cargo: "2024-11-01",
      monto_inicial_centavos: 890000,
      descuentos_centavos: 0,
      recargos_centavos: 267000,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 1157000,
      dias_vencido: 73,
      estado_cobranza: "IRRECUPERABLE",
      fecha_vencimiento: "2024-11-10",
      fecha_compromiso: null,
      cuenta_habilitada: false,
      fecha_ultimo_seguimiento: "2025-01-15",
      observaciones_cobranza: "Cuenta en proceso de cobranza jurídica"
    }
  ];

  const filteredCuentas = cuentasPorCobrar.filter(cuenta => {
    const matchesEstado = selectedEstado === "all" || cuenta.estado_cobranza === selectedEstado;
    const matchesDias = selectedDiasVencido === "all" || 
      (selectedDiasVencido === "0-7" && cuenta.dias_vencido >= 0 && cuenta.dias_vencido <= 7) ||
      (selectedDiasVencido === "8-30" && cuenta.dias_vencido >= 8 && cuenta.dias_vencido <= 30) ||
      (selectedDiasVencido === "31+" && cuenta.dias_vencido > 30);
    const matchesConcepto = selectedConcepto === "all" || cuenta.concepto.toLowerCase().includes(selectedConcepto.toLowerCase());
    const matchesNivel = selectedNivel === "all" || cuenta.nivel_escolar === selectedNivel;
    const matchesEstudiante = selectedEstudiante === "all" || cuenta.estudiante.toLowerCase().includes(selectedEstudiante.toLowerCase());
    
    let matchesFecha = true;
    if (fechaInicio && fechaFin) {
      const fechaCargo = new Date(cuenta.fecha_cargo);
      const inicio = new Date(fechaInicio);
      const fin = new Date(fechaFin);
      matchesFecha = fechaCargo >= inicio && fechaCargo <= fin;
    }
    
    return matchesEstado && matchesDias && matchesConcepto && matchesNivel && matchesEstudiante && matchesFecha;
  });

  const estadisticas = {
    totalCuentas: cuentasPorCobrar.length,
    montoPendienteTotal: cuentasPorCobrar.reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0),
    cuentasVencidas: cuentasPorCobrar.filter(c => c.estado_cobranza === "VENCIDO").length,
    cuentasMorosas: cuentasPorCobrar.filter(c => c.estado_cobranza === "MOROSO").length,
    cuentasDeshabilitadas: cuentasPorCobrar.filter(c => !c.cuenta_habilitada).length,
    promedioTiempoVencimiento: cuentasPorCobrar.filter(c => c.dias_vencido > 0).reduce((sum, c) => sum + c.dias_vencido, 0) / cuentasPorCobrar.filter(c => c.dias_vencido > 0).length || 0
  };

  const getEstadoBadge = (estado: string, diasVencido: number, cuentaHabilitada: boolean) => {
    if (!cuentaHabilitada) {
      return <Badge className="bg-red-100 text-red-800">
        <Ban className="w-3 h-3 mr-1" />
        Deshabilitada
      </Badge>;
    }
    
    switch (estado) {
      case "CORRIENTE":
        return <Badge className="bg-green-100 text-green-800">Al corriente</Badge>;
      case "PAGADO":
        return <Badge className="bg-blue-100 text-blue-800">Pagado</Badge>;
      case "PARCIAL":
        return <Badge className="bg-orange-100 text-orange-800">Pago parcial</Badge>;
      case "VENCIDO":
        return <Badge className="bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Vencido ({diasVencido}d)
        </Badge>;
      case "MOROSO":
        return <Badge className="bg-red-100 text-red-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Moroso ({diasVencido}d)
        </Badge>;
      default:
        return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  const getPrioridadColor = (diasVencido: number, estado: string, cuentaHabilitada: boolean) => {
    if (!cuentaHabilitada) return "border-red-300 bg-red-100";
    if (estado === "MOROSO" || diasVencido > 30) return "border-red-200 bg-red-50";
    if (estado === "VENCIDO" || diasVencido > 0) return "border-yellow-200 bg-yellow-50";
    if (estado === "PAGADO") return "border-green-200 bg-green-50";
    return "border-slate-200";
  };

  const handleSetCompromise = (cuenta: any) => {
    setSelectedCuenta(cuenta);
    setShowCompromiseModal(true);
  };

  const handleIniciarCobranza = () => {
    const cuentasVencidas = cuentasPorCobrar.filter((c: any) => c.estado_cobranza === "VENCIDO" || c.estado_cobranza === "MOROSO");
    
    toast({
      title: "Proceso de Cobranza Iniciado",
      description: `Iniciando seguimiento para ${cuentasVencidas.length} cuentas vencidas. Se generarán llamadas y notificaciones automáticas.`,
      duration: 4000,
    });

    // Simular proceso de cobranza
    setTimeout(() => {
      toast({
        title: "Cobranza en Progreso",
        description: "Se han programado 15 llamadas y enviado 8 notificaciones de seguimiento.",
        duration: 3000,
      });
    }, 2000);
  };

  const handleEnviarRecordatorios = () => {
    const cuentasPendientes = cuentasPorCobrar.filter((c: any) => c.pendiente_pagar_centavos > 0);
    
    toast({
      title: "Enviando Recordatorios",
      description: `Enviando recordatorios de pago a ${cuentasPendientes.length} familias por email y SMS...`,
      duration: 3000,
    });

    // Simular envío de recordatorios
    setTimeout(() => {
      toast({
        title: "Recordatorios Enviados",
        description: `✓ ${cuentasPendientes.length} emails enviados\n✓ ${Math.floor(cuentasPendientes.length * 0.8)} SMS enviados\n✓ 3 llamadas programadas`,
        duration: 4000,
      });
    }, 2500);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cuentas por Cobrar</h1>
          <p className="text-slate-600">Gestión de cartera vencida y seguimiento de cobranza</p>
        </div>
        <div className="flex gap-2">
          <Button 
            className="bg-orange-600 hover:bg-orange-700"
            onClick={handleIniciarCobranza}
          >
            <Phone className="w-4 h-4 mr-2" />
            Iniciar Cobranza
          </Button>
          <Button 
            variant="outline"
            onClick={handleEnviarRecordatorios}
          >
            <Mail className="w-4 h-4 mr-2" />
            Enviar Recordatorios
          </Button>
        </div>
      </div>

      {/* KPIs de cobranza compactos */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="text-center">
              <Users className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <div className="text-lg font-bold">{estadisticas.totalCuentas}</div>
              <div className="text-xs text-slate-600">Total</div>
            </div>
            <div className="text-center">
              <DollarSign className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <div className="text-lg font-bold">${(estadisticas.montoPendienteTotal / 100000).toFixed(0)}K</div>
              <div className="text-xs text-slate-600">Por cobrar</div>
            </div>
            <div className="text-center">
              <Clock className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
              <div className="text-lg font-bold">{estadisticas.cuentasVencidas}</div>
              <div className="text-xs text-slate-600">Vencidas</div>
            </div>
            <div className="text-center">
              <AlertTriangle className="w-5 h-5 text-red-600 mx-auto mb-1" />
              <div className="text-lg font-bold">{estadisticas.cuentasMorosas}</div>
              <div className="text-xs text-slate-600">Morosas</div>
            </div>
            <div className="text-center">
              <Ban className="w-5 h-5 text-red-800 mx-auto mb-1" />
              <div className="text-lg font-bold">{estadisticas.cuentasDeshabilitadas}</div>
              <div className="text-xs text-slate-600">Deshabilitadas</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{estadisticas.promedioTiempoVencimiento.toFixed(0)}</div>
              <div className="text-xs text-slate-600">Días prom.</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lista">Lista de cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          {/* Filtros compactos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="w-4 h-4" />
                Filtros de búsqueda
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Buscar estudiante..."
                      value={selectedEstudiante === "all" ? "" : selectedEstudiante}
                      onChange={(e) => setSelectedEstudiante(e.target.value || "all")}
                      className="pl-10 h-9"
                    />
                  </div>
                </div>
                <div>
                  <Input
                    placeholder="Buscar concepto..."
                    value={selectedConcepto === "all" ? "" : selectedConcepto}
                    onChange={(e) => setSelectedConcepto(e.target.value || "all")}
                    className="h-9"
                  />
                </div>
                <div>
                  <Select value={selectedNivel} onValueChange={setSelectedNivel}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Nivel escolar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="KINDER">Kinder</SelectItem>
                      <SelectItem value="PRIMARIA">Primaria</SelectItem>
                      <SelectItem value="SECUNDARIA">Secundaria</SelectItem>
                      <SelectItem value="BACHILLERATO">Bachillerato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="CORRIENTE">Corriente</SelectItem>
                      <SelectItem value="PAGADO">Pagado</SelectItem>
                      <SelectItem value="PARCIAL">Parcial</SelectItem>
                      <SelectItem value="VENCIDO">Vencido</SelectItem>
                      <SelectItem value="MOROSO">Moroso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-9 w-full"
                    onClick={() => {
                      setSelectedEstado("all");
                      setSelectedConcepto("all");
                      setSelectedNivel("all");
                      setSelectedEstudiante("all");
                      setFechaInicio("");
                      setFechaFin("");
                    }}
                  >
                    Limpiar
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="h-9"
                    placeholder="Fecha desde"
                  />
                </div>
                <div>
                  <Input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="h-9"
                    placeholder="Fecha hasta"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gráficos de Análisis Visual */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Análisis Visual de Cuentas por Cobrar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <PieChartComponent 
                      data={statusData} 
                      title="Por Estado de Cobranza" 
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <PieChartComponent 
                      data={daysOverdueData} 
                      title="Por Días Vencidos" 
                    />
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Cuentas por cobrar ({filteredCuentas.length})</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-2 font-medium min-w-[200px]">Estudiante</th>
                      <th className="text-left p-2 font-medium min-w-[180px]">Concepto</th>
                      <th className="text-right p-2 font-medium min-w-[90px]">Inicial</th>
                      <th className="text-right p-2 font-medium min-w-[80px]">Desc.</th>
                      <th className="text-right p-2 font-medium min-w-[80px]">Rec.</th>
                      <th className="text-right p-2 font-medium min-w-[90px]">Pagado</th>
                      <th className="text-right p-2 font-medium min-w-[90px]">Pendiente</th>
                      <th className="text-center p-2 font-medium min-w-[100px]">Estado</th>
                      <th className="text-center p-2 font-medium min-w-[100px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCuentas.map((cuenta) => (
                      <tr key={cuenta.id} className={`border-b hover:bg-slate-50 ${getPrioridadColor(cuenta.dias_vencido, cuenta.estado_cobranza, cuenta.cuenta_habilitada)}`}>
                        <td className="p-2">
                          <div>
                            <div className="font-medium text-sm">{cuenta.estudiante}</div>
                            <div className="text-xs text-slate-500">{cuenta.grado}</div>
                            <div className="text-xs text-slate-500">{cuenta.responsable}</div>
                          </div>
                        </td>
                        <td className="p-2">
                          <div>
                            <div className="font-medium text-sm">{cuenta.concepto}</div>
                            <div className="text-xs text-slate-500">Vence: {cuenta.fecha_vencimiento}</div>
                            {cuenta.fecha_compromiso && (
                              <div className="text-xs text-blue-600">Compromiso: {cuenta.fecha_compromiso}</div>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-right font-medium">
                          ${(cuenta.monto_inicial_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-right text-green-600 text-sm">
                          -${(cuenta.descuentos_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-right text-red-600 text-sm">
                          +${(cuenta.recargos_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-right text-blue-600 font-medium">
                          ${(cuenta.total_pagado_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-right font-bold text-red-600">
                          ${(cuenta.pendiente_pagar_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-center">
                          {getEstadoBadge(cuenta.estado_cobranza, cuenta.dias_vencido, cuenta.cuenta_habilitada)}
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Llamar">
                              <Phone className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Email">
                              <Mail className="w-3 h-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 w-7 p-0" 
                              title="Compromiso pago"
                              onClick={() => handleSetCompromise(cuenta)}
                            >
                              <Calendar className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguimiento">
          <Card>
            <CardHeader>
              <CardTitle>Programar seguimiento de cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Seleccionar cuenta</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Buscar estudiante..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cuentasPorCobrar.filter(c => c.estado_cobranza !== "CORRIENTE").map(cuenta => (
                        <SelectItem key={cuenta.id} value={cuenta.id.toString()}>
                          {cuenta.estudiante} - ${(cuenta.monto_inicial_centavos / 100).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de seguimiento</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llamada">Llamada telefónica</SelectItem>
                      <SelectItem value="email">Correo electrónico</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="presencial">Visita presencial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha de seguimiento</Label>
                  <Input type="date" />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" />
                </div>
                <div className="md:col-span-2">
                  <Label>Observaciones</Label>
                  <Textarea placeholder="Detalles del seguimiento a realizar..." />
                </div>
              </div>
              <Button className="mt-4 bg-orange-600 hover:bg-orange-700">
                Programar seguimiento
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <Card>
            <CardHeader>
              <CardTitle>Reportes de cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Button variant="outline" className="h-20 flex flex-col">
                  <DollarSign className="w-6 h-6 mb-2" />
                  <span>Antigüedad de Saldos</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col">
                  <AlertTriangle className="w-6 h-6 mb-2" />
                  <span>Cartera Vencida</span>
                </Button>
                <Button variant="outline" className="h-20 flex flex-col">
                  <TrendingDown className="w-6 h-6 mb-2" />
                  <span>Eficiencia Cobranza</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Modal para establecer fecha compromiso */}
        <Dialog open={showCompromiseModal} onOpenChange={setShowCompromiseModal}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg">Fecha de pago compromiso</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {selectedCuenta && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="font-medium text-sm">{selectedCuenta.estudiante}</div>
                    <div className="text-sm text-slate-600">{selectedCuenta.concepto}</div>
                    <div className="text-sm text-red-600">
                      Pendiente: ${(selectedCuenta.pendiente_pagar_centavos / 100).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Fecha compromiso de pago</Label>
                      <Input type="date" defaultValue={selectedCuenta.fecha_compromiso || ""} className="h-9" />
                    </div>
                    
                    <div>
                      <Label className="text-sm">Nuevo monto (opcional)</Label>
                      <Input 
                        type="number" 
                        placeholder={(selectedCuenta.pendiente_pagar_centavos / 100).toString()}
                        className="h-9"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm">Descuento adicional (opcional)</Label>
                    <Input type="number" placeholder="0" className="h-9" />
                  </div>
                  
                  <div>
                    <Label className="text-sm">Observaciones</Label>
                    <Textarea placeholder="Observaciones sobre el acuerdo de pago..." className="h-20" />
                  </div>
                  
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <div className="text-xs text-yellow-800">
                      <strong>Advertencia:</strong> Si no cumple la fecha compromiso, 
                      la cuenta será deshabilitada automáticamente.
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" size="sm" onClick={() => setShowCompromiseModal(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                Establecer compromiso
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  );
}