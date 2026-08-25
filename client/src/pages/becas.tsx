import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { createAuthenticatedRequest, handleAuthError } from "@/lib/authUtils";
import { Gift, Percent, Users, Plus, Edit, Trash2, GraduationCap, DollarSign, Calculator, Zap, Target, Award, FileText, Building, Download, AlertTriangle, CheckCircle, XCircle, Clock, MoreVertical, Upload, FileSpreadsheet, Eye } from "lucide-react";

// ── Motor de Becas Automáticas ────────────────────────────────────────────────
function BecasReglaAuto() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const campusId = user?.campus_id || 1;
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nombre: "", tipo: "hermanos", descuento_porcentaje: "", condicion_json: "", aplica_a: "todos" });

  const { data: reglas, isLoading } = useQuery<any[]>({
    queryKey: ["/api/becas-auto/reglas", campusId],
  });
  const { data: alertas = [] } = useQuery<any[]>({
    queryKey: ["/api/becas-auto/alertas", campusId],
  });

  const crearRegla = useMutation({
    mutationFn: (data: any) => apiRequest("/api/becas-auto/reglas", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Regla creada", description: "La regla automática quedó activa" });
      setShowModal(false);
      setForm({ nombre: "", tipo: "hermanos", descuento_porcentaje: "", condicion_json: "", aplica_a: "todos" });
      queryClient.invalidateQueries({ queryKey: ["/api/becas-auto/reglas"] });
    },
    onError: () => toast({ title: "Error al crear regla", variant: "destructive" }),
  });

  const eliminarRegla = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/becas-auto/reglas/${id}`, { method: "DELETE", body: JSON.stringify({}) }),
    onSuccess: () => { toast({ title: "Regla eliminada" }); queryClient.invalidateQueries({ queryKey: ["/api/becas-auto/reglas"] }); },
  });

  const ejecutarBecas = useMutation({
    mutationFn: () => apiRequest("/api/becas-auto/ejecutar", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/becas-auto/alertas"] });
      toast({
        title: "Motor ejecutado",
        description: r?.mensaje || "Becas automáticas procesadas",
      });
    },
  });

  const TIPOS: Record<string, { label: string; desc: string; icon: string }> = {
    hermanos: { label: "Descuento por hermanos", desc: "Se aplica a familias con 2+ estudiantes activos", icon: "👨‍👩‍👧‍👦" },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Motor de Becas Automáticas
          </h3>
          <p className="text-slate-500 text-sm">Define reglas: el sistema aplica las becas automáticamente sin trabajo manual</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => ejecutarBecas.mutate()} disabled={ejecutarBecas.isPending}>
            <Zap className={`w-4 h-4 ${ejecutarBecas.isPending ? "animate-spin" : ""}`} />
            {ejecutarBecas.isPending ? "Calculando..." : "Ejecutar motor"}
          </Button>
          <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" /> Nueva regla
          </Button>
        </div>
      </div>

      {/* Tipos disponibles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(TIPOS).map(([k, v]) => (
          <div key={k} className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${form.tipo === k ? "border-green-500 bg-green-50" : "border-slate-200 hover:border-slate-300"}`}
            onClick={() => { if (showModal) setForm(f => ({ ...f, tipo: k })); }}>
            <div className="text-2xl mb-1">{v.icon}</div>
            <p className="font-semibold text-sm text-slate-800">{v.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{v.desc}</p>
          </div>
        ))}
      </div>

      {/* Modal para crear regla */}
      {showModal && (
        <Card className="border-2 border-green-300 bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nueva regla automática
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nombre de la regla</Label>
                <Input placeholder="Ej: Beca segundo hermano 15%" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <Label>Tipo de regla</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS).map(([k, v]) => <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Descuento (%)</Label>
                <Input type="number" placeholder="15" min="1" max="100" value={form.descuento_porcentaje}
                  onChange={e => setForm(f => ({ ...f, descuento_porcentaje: e.target.value }))} />
              </div>
              <div>
                <Label>Aplica a</Label>
                <Select value={form.aplica_a} onValueChange={v => setForm(f => ({ ...f, aplica_a: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los hijos</SelectItem>
                    <SelectItem value="segundo_hijo">Segundo hijo</SelectItem>
                    <SelectItem value="tercer_hijo">Tercer hijo en adelante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button className="bg-green-600 hover:bg-green-700"
                disabled={!form.nombre || !form.descuento_porcentaje || crearRegla.isPending}
                onClick={() => crearRegla.mutate({ ...form, campus_id: campusId, descuento_porcentaje: Number(form.descuento_porcentaje) })}>
                {crearRegla.isPending ? "Creando..." : "Crear regla"}
              </Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de reglas activas */}
      {alertas.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-4 h-4" />
              Revisión administrativa requerida
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alertas.map((alerta: any) => (
              <div key={alerta.id} className="text-sm text-amber-900">
                <strong>{alerta.alumno}</strong>: {alerta.mensaje ||
                  `La beca automática de ${alerta.porcentaje_aplicado}% supera la beca manual vigente de ${alerta.porcentaje_manual}%.`}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin w-6 h-6 border-4 border-green-600 border-t-transparent rounded-full" />
        </div>
      ) : (reglas || []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">
            <Zap className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="font-medium">No hay reglas automáticas configuradas</p>
            <p className="text-sm">Crea la primera regla con el botón "Nueva regla"</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(reglas || []).map((r: any) => {
            const cfg = TIPOS[r.tipo] || { label: r.tipo, desc: "", icon: "📋" };
            return (
              <Card key={r.id} className="border border-slate-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cfg.icon}</span>
                    <div>
                      <p className="font-semibold text-slate-900">{r.nombre}</p>
                      <p className="text-sm text-slate-500">{cfg.label} • Aplica a: {r.aplica_a}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-700">{r.descuento_porcentaje}%</p>
                      <p className="text-xs text-slate-500">descuento</p>
                    </div>
                    <Badge className={r.activo ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}>
                      {r.activo ? "Activa" : "Inactiva"}
                    </Badge>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => eliminarRegla.mutate(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Becas() {
  const { user } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState("becas");
  const [showAsignarModal, setShowAsignarModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [selectedBeca, setSelectedBeca] = useState<any>(null);
  const [selectedEstudiante, setSelectedEstudiante] = useState<any>(null);
  const [editingType, setEditingType] = useState<any>(null);
  const [statusChange, setStatusChange] = useState<{ assignment: any; estado: "activa" | "suspendida" } | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [assignmentEdit, setAssignmentEdit] = useState({
    porcentaje: "",
    motivo: "",
    vigenciaInicio: "",
    vigenciaFin: "",
    motivoCambio: "",
  });
  const [typeForm, setTypeForm] = useState({
    nombre: "",
    categoria: "socioeconomica",
    descripcion: "",
    algoritmo: "manual",
    porcentaje: "",
    vigenciaMeses: "12",
    activo: true,
    criterios: "",
    motivoCambio: "",
  });
  const [activeAssignTab, setActiveAssignTab] = useState("individual");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<any>(null);
  const [showImportResults, setShowImportResults] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const campusId = user?.campus_id;
  const { data: scholarshipAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/scholarships", campusId],
    enabled: Boolean(campusId),
  });
  const { data: scholarshipTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/scholarship-types", campusId],
    enabled: Boolean(campusId),
  });
  const { data: students = [], isLoading: studentsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/students", campusId],
    enabled: Boolean(campusId),
  });
  const [manualAssignment, setManualAssignment] = useState(() => {
    const start = new Date();
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    return {
      studentId: "",
      tipoBeca: "",
      porcentaje: "",
      vigenciaInicio: start.toISOString().split("T")[0],
      vigenciaFin: end.toISOString().split("T")[0],
      motivo: "",
    };
  });
  const [assignmentResult, setAssignmentResult] = useState<any>(null);
  const asignarBecaIndividual = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/admin/students/${manualAssignment.studentId}/beca`, {
        method: "POST",
        body: JSON.stringify({
          porcentaje: Number(manualAssignment.porcentaje),
          scholarship_type_id: Number(manualAssignment.tipoBeca),
          motivo: manualAssignment.motivo || undefined,
          vigencia_inicio: manualAssignment.vigenciaInicio || undefined,
          vigencia_fin: manualAssignment.vigenciaFin || undefined,
        }),
      });
      return response.json();
    },
    onSuccess: (result: any) => {
      setAssignmentResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/scholarships"] });
      toast({
        title: result.overlap_warning ? "Beca asignada con advertencia" : "Beca asignada",
        description: result.overlap_warning
          ? "El alumno ya tenía una beca vigente. Revisa el aviso antes de continuar."
          : "La asignación quedó guardada correctamente.",
        variant: result.overlap_warning ? "default" : undefined,
      });
    },
    onError: (error: any) => {
      let message = "No se pudo asignar la beca.";
      const rawMessage = String(error?.message || "");
      try {
        const parsed = JSON.parse(rawMessage.replace(/^\d+:\s*/, ""));
        message = parsed.message || message;
      } catch {
        if (rawMessage) message = rawMessage.replace(/^\d+:\s*/, "");
      }
      toast({ title: "Error al asignar beca", description: message, variant: "destructive" });
    },
  });

  const refreshScholarshipData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/scholarships"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/scholarship-types"] });
  };

  const updateAssignment = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/admin/scholarships/${selectedBeca.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          porcentaje: Number(assignmentEdit.porcentaje),
          motivo: assignmentEdit.motivo || null,
          vigencia_inicio: assignmentEdit.vigenciaInicio,
          vigencia_fin: assignmentEdit.vigenciaFin,
          motivo_cambio: assignmentEdit.motivoCambio,
        }),
      });
      return response.json();
    },
    onSuccess: (result: any) => {
      setShowEditModal(false);
      refreshScholarshipData();
      toast({ title: "Beca actualizada", description: result.message });
    },
    onError: (error: any) => toast({
      title: "No se pudo actualizar la beca",
      description: String(error?.message || "").replace(/^\d+:\s*/, ""),
      variant: "destructive",
    }),
  });

  const changeAssignmentStatus = useMutation({
    mutationFn: async () => {
      if (!statusChange) throw new Error("No hay una beca seleccionada");
      const response = await apiRequest(`/api/admin/scholarships/${statusChange.assignment.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: statusChange.estado, motivo: statusReason }),
      });
      return response.json();
    },
    onSuccess: (result: any) => {
      setStatusChange(null);
      setStatusReason("");
      refreshScholarshipData();
      toast({ title: "Estado actualizado", description: result.message });
    },
    onError: (error: any) => toast({
      title: "No se pudo cambiar el estado",
      description: String(error?.message || "").replace(/^\d+:\s*/, ""),
      variant: "destructive",
    }),
  });

  const saveScholarshipType = useMutation({
    mutationFn: async () => {
      const payload = {
        nombre: typeForm.nombre,
        categoria: typeForm.categoria,
        descripcion: typeForm.descripcion || null,
        algoritmo: typeForm.algoritmo,
        activo: typeForm.activo,
        beneficio: {
          porcentaje_descuento: Number(typeForm.porcentaje),
          aplica_conceptos: ["colegiatura"],
          vigencia_meses: Number(typeForm.vigenciaMeses),
        },
        criterios: typeForm.criterios
          .split(",")
          .map((criterio) => criterio.trim())
          .filter(Boolean)
          .map((criterio) => ({ criterio, obligatorio: true })),
        ...(editingType ? { motivo_cambio: typeForm.motivoCambio } : {}),
      };
      const response = await apiRequest(
        editingType
          ? `/api/admin/scholarship-types/${editingType.id}`
          : "/api/admin/scholarship-types",
        { method: editingType ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      return response.json();
    },
    onSuccess: () => {
      setShowAddModal(false);
      setEditingType(null);
      refreshScholarshipData();
      toast({ title: "Tipo de beca guardado", description: "La definición se actualizó sin alterar asignaciones existentes." });
    },
    onError: (error: any) => toast({
      title: "No se pudo guardar el tipo de beca",
      description: String(error?.message || "").replace(/^\d+:\s*/, ""),
      variant: "destructive",
    }),
  });

  // Funciones para importación masiva de CSV - usando el mismo patrón que estudiantes
  const generateBecasTemplate = () => {
    const headers = [
      "id_estudiante",
      "curp_estudiante",
      "nombre_estudiante",
      "tipo_beca",
      "tipo_descuento",
      "valor_descuento",
      "vigencia_inicio",
      "vigencia_fin",
      "observaciones"
    ];
    
    const exampleData = [
      [
        "1",
        "GOLM051215MDFNPR03",
        "María González López",
        "Beca USEBEQ",
        "porcentaje",
        "50",
        "2024-08-15",
        "2025-07-15",
        "Beca por excelencia académica"
      ],
      [
        "2",
        "RAMS031020HDFMND04",
        "Carlos Ramírez Sánchez",
        "Descuento Empleados",
        "cantidad",
        "1500",
        "2024-08-15",
        "2025-07-15",
        "Descuento por ser hijo de empleado"
      ],
      [
        "3",
        "MAGL080912MDFLRN01",
        "Luis Martínez Gil",
        "Beca Deportiva",
        "porcentaje",
        "25",
        "2024-08-15",
        "2025-07-15",
        "Beca por destacar en fútbol"
      ]
    ];
    
    // Crear CSV con BOM UTF-8 para compatibilidad con Excel
    const csvContent = "\uFEFF" + [headers, ...exampleData].map(row => 
      row.map(cell => `"${cell}"`).join(",")
    ).join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_asignaciones_becas.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Plantilla descargada",
      description: "La plantilla CSV ha sido descargada exitosamente con 3 ejemplos de asignaciones de becas.",
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportResults(null);
      setShowImportResults(false);
    }
  };

  const handleImportFile = async () => {
    if (!importFile) {
      toast({
        title: "Error",
        description: "Por favor selecciona un archivo CSV para importar.",
        variant: "destructive",
      });
      return;
    }

    try {
      setImportProgress(0);
      
      const formData = new FormData();
      formData.append('file', importFile);

      const response = await createAuthenticatedRequest('/api/import/data/becas/asignaciones', {
        method: 'POST',
        body: formData,
      });

      const results = await response.json();
      setImportResults(results);
      setShowImportResults(true);
      setImportProgress(100);

      toast({
        title: "Importación completada",
        description: `Se procesaron ${results.successful} asignaciones exitosamente.`,
      });
    } catch (error: any) {
      if (error.message.includes('sesión')) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
        setTimeout(() => {
          window.location.href = '/login';
        }, 1000);
      } else {
        toast({
          title: "Error en importación",
          description: "No se pudo procesar el archivo. Verifica el formato y datos.",
          variant: "destructive",
        });
      }
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportResults(null);
    setShowImportResults(false);
    setImportProgress(0);
  };

  // Sistema de gestión administrativa de becas y descuentos
  const becasYDescuentosMock = [
    {
      id: 1,
      nombre: "Beca USEBEQ",
      categoria: "usebeq",
      tipo: "manual",
      descripcion: "Beca de la Unidad de Servicios para la Educación Básica en el Estado de Querétaro",
      porcentaje_max: 100,
      estudiantes_aplicados: 15,
      monto_total_descuento: 3200000, // $32,000 MXN
      asignacion: "Manual por área académica",
      documentos_requeridos: ["Estudio socioeconómico", "Comprobante de ingresos", "Carta solicitud"],
      vigencia: "2026-2027",
      activa: true
    },
    {
      id: 2,
      nombre: "Descuento por Hermanos",
      categoria: "familiar",
      tipo: "automatico",
      descripcion: "Descuento automático aplicado cuando hay múltiples hermanos inscritos",
      porcentaje_max: 40,
      estudiantes_aplicados: 22,
      monto_total_descuento: 1950000, // $19,500 MXN
      asignacion: "Automático al detectar hermanos en sistema",
      criterios: "2 hermanos: 20%, 3 hermanos: 30%, 4+ hermanos: 40%",
      vigencia: "2026-2027",
      activa: true
    },
    {
      id: 3,
      nombre: "Beca por Convenio Empresarial",
      categoria: "convenio",
      tipo: "manual",
      descripcion: "Becas otorgadas por convenios con empresas patrocinadoras",
      porcentaje_max: 75,
      estudiantes_aplicados: 8,
      monto_total_descuento: 1800000, // $18,000 MXN
      asignacion: "Manual según convenio vigente",
      empresas_convenio: ["Grupo Industrial SA", "Tech Solutions", "Comercial del Norte"],
      vigencia: "2026-2027",
      activa: true
    },
    {
      id: 4,
      nombre: "Beca por Mérito Deportivo",
      categoria: "deportiva",
      tipo: "manual",
      descripcion: "Reconocimiento a estudiantes destacados en actividades deportivas",
      porcentaje_max: 50,
      estudiantes_aplicados: 6,
      monto_total_descuento: 720000, // $7,200 MXN
      asignacion: "Manual por coordinación deportiva",
      documentos_requeridos: ["Constancia participación", "Resultados competencias"],
      vigencia: "2026-2027",
      activa: true
    },
    {
      id: 5,
      nombre: "Beca Cultural y Artística",
      categoria: "cultural",
      tipo: "manual",
      descripcion: "Apoyo a estudiantes con talento en actividades culturales y artísticas",
      porcentaje_max: 45,
      estudiantes_aplicados: 4,
      monto_total_descuento: 540000, // $5,400 MXN
      asignacion: "Manual por área cultural",
      documentos_requeridos: ["Portfolio artístico", "Carta recomendación"],
      vigencia: "2026-2027",
      activa: true
    },
    {
      id: 6,
      nombre: "Descuento Empleados",
      categoria: "empleado",
      tipo: "automatico",
      descripcion: "Descuento especial para hijos de empleados de la institución",
      porcentaje_max: 60,
      estudiantes_aplicados: 12,
      monto_total_descuento: 2400000, // $24,000 MXN
      asignacion: "Automático al verificar relación laboral",
      criterios: "Personal administrativo: 30%, Docentes: 50%, Directivos: 60%",
      vigencia: "2026-2027",
      activa: true
    },
    {
      id: 7,
      nombre: "Descuento Cantidad Fija - Básico",
      categoria: "cantidad_fija",
      tipo: "manual",
      descripcion: "Descuento de cantidad fija para casos especiales",
      monto_fijo: 150000, // $1,500 MXN fijos
      estudiantes_aplicados: 8,
      monto_total_descuento: 1200000, // $12,000 MXN total (8 × $1,500)
      asignacion: "Manual por área administrativa",
      beneficios: "$1,500 pesos fijos descontados mensualmente",
      vigencia: "2026-2027",
      activa: true
    },
    {
      id: 8,
      nombre: "Descuento Cantidad Fija - Premium",
      categoria: "cantidad_fija",
      tipo: "manual",
      descripcion: "Descuento premium de cantidad fija para beneficiarios especiales",
      monto_fijo: 250000, // $2,500 MXN fijos
      estudiantes_aplicados: 3,
      monto_total_descuento: 750000, // $7,500 MXN total (3 × $2,500)
      asignacion: "Manual por dirección académica",
      beneficios: "$2,500 pesos fijos descontados mensualmente",
      vigencia: "2026-2027",
      activa: true
    }
  ];

  // `vigente` se calcula en el backend con la misma regla que usa el asistente.
  // Las suspendidas permanecen en pantalla, pero no cuentan como activas.
  const becasVigentes = scholarshipAssignments.filter(
    (beca) => beca.vigente && beca.student_status === "activo" && beca.estado === "activa",
  );
  const estudiantesParaBecas = scholarshipAssignments
    .filter((beca) => beca.student_status === "activo")
    .map((beca) => ({
    id: beca.id,
    nombre_completo: beca.alumno,
    grado: [beca.nivel_escolar, beca.grado, beca.grupo].filter(Boolean).join(" · "),
    hermanos_inscritos: 0,
    tipo_solicitud: beca.tipo_nombre || "Beca sin tipo",
    porcentaje_asignado: Number(beca.porcentaje_aplicado || 0),
    estado: beca.estado === "suspendida" ? "Suspendida" : "Activa",
    fecha_asignacion: beca.vigencia_inicio,
    observaciones: beca.observaciones || "Asignación vigente",
    vigencia_fin: beca.vigencia_fin,
  }));
  const becasAgrupadas = new Map<string, any>();
  for (const beca of becasVigentes) {
    const key = String(beca.scholarship_type_id ?? beca.tipo_nombre ?? beca.id);
    const estudianteAsignado = {
      id: beca.student_id,
      nombre_completo: beca.alumno,
      grado: beca.grado || beca.nivel_escolar || "Sin grado",
      grupo: beca.grupo || "",
      porcentaje_asignado: Number(beca.porcentaje_aplicado || 0),
      estado: "Activa",
      monto_mensual_descuento: Number(beca.monto_descuento_centavos || 0),
    };
    const actual = becasAgrupadas.get(key) ?? {
      id: beca.scholarship_type_id ?? beca.id,
      nombre: beca.tipo_nombre || "Beca sin tipo",
      categoria: beca.tipo_categoria || "manual",
      tipo: beca.tipo_algoritmo || "manual",
      descripcion: beca.observaciones || "Beca asignada a estudiantes activos",
      porcentaje_max: 0,
      estudiantes: new Set<number>(),
      estudiantes_detalle: [],
      monto_total_descuento: 0,
      asignacion: "Asignación vigente registrada",
      vigencia: "Vigente",
      activa: true,
    };
    actual.porcentaje_max = Math.max(actual.porcentaje_max, Number(beca.porcentaje_aplicado || 0));
    actual.estudiantes.add(Number(beca.student_id));
    actual.estudiantes_detalle.push(estudianteAsignado);
    actual.monto_total_descuento += Number(beca.monto_descuento_centavos || 0);
    becasAgrupadas.set(key, actual);
  }
  const becasYDescuentos = Array.from(becasAgrupadas.values()).map((beca) => ({
    ...beca,
    estudiantes_aplicados: beca.estudiantes.size,
    estudiantes: beca.estudiantes_detalle,
  }));
  const tiposCatalogo = scholarshipTypes.map((type) => {
    const typeAssignments = scholarshipAssignments.filter(
      (assignment) => Number(assignment.scholarship_type_id) === Number(type.id),
    );
    const activeAssignments = typeAssignments.filter(
      (assignment) => assignment.estado === "activa" && assignment.vigente,
    );
    return {
      id: type.id,
      nombre: type.nombre,
      categoria: type.categoria,
      tipo: type.algoritmo,
      descripcion: type.descripcion || "Sin descripción",
      porcentaje_max: Number(type.beneficio?.porcentaje_descuento || 0),
      estudiantes_aplicados: activeAssignments.length,
      estudiantes: activeAssignments.map((assignment) => ({
        id: assignment.id,
        nombre_completo: assignment.alumno,
        grado: assignment.grado || assignment.nivel_escolar || "Sin grado",
        porcentaje_asignado: Number(assignment.porcentaje_aplicado || 0),
      })),
      monto_total_descuento: activeAssignments.reduce(
        (sum, assignment) => sum + Number(assignment.monto_descuento_centavos || 0),
        0,
      ),
      asignacion: type.algoritmo === "automatico"
        ? "Disponible para reglas automáticas explícitamente configuradas"
        : "Asignación manual caso por caso",
      criterios: (type.criterios || []).map((criterion: any) => criterion.criterio).join(", "),
      activa: Boolean(type.activo),
      raw: type,
    };
  });
  const totalTiposBecas = tiposCatalogo.length;
  const totalEstudiantesBeneficiados = new Set(
    becasVigentes.map((beca) => Number(beca.student_id)),
  ).size;
  const montoTotalDescuentos = becasYDescuentos.reduce(
    (sum, beca) => sum + beca.monto_total_descuento,
    0,
  );
  const promedioDescuento = becasVigentes.length
    ? becasVigentes.reduce((sum, beca) => sum + Number(beca.porcentaje_aplicado || 0), 0) / becasVigentes.length
    : 0;

  // Funciones para manejar acciones de botones
  const handleEditBeca = (beca: any) => {
    setSelectedBeca(beca);
    setAssignmentEdit({
      porcentaje: String(beca.porcentaje_asignado || beca.porcentaje_aplicado || ""),
      motivo: beca.observaciones || "",
      vigenciaInicio: String(beca.fecha_asignacion || beca.vigencia_inicio || "").slice(0, 10),
      vigenciaFin: String(beca.vigencia_fin || "").slice(0, 10),
      motivoCambio: "",
    });
    setShowEditModal(true);
  };

  const openTypeEditor = (type: any) => {
    const raw = type.raw || type;
    setEditingType(raw);
    setTypeForm({
      nombre: raw.nombre || "",
      categoria: raw.categoria || "socioeconomica",
      descripcion: raw.descripcion || "",
      algoritmo: raw.algoritmo || "manual",
      porcentaje: String(raw.beneficio?.porcentaje_descuento || ""),
      vigenciaMeses: String(raw.beneficio?.vigencia_meses || 12),
      activo: Boolean(raw.activo),
      criterios: (raw.criterios || []).map((criterion: any) => criterion.criterio).join(", "),
      motivoCambio: "",
    });
    setShowAddModal(true);
  };

  const handleViewDocuments = (estudiante: any) => {
    setSelectedEstudiante(estudiante);
    setShowDocumentModal(true);
  };

  const handleGenerateReport = (formato: 'excel' | 'pdf' | 'word') => {
    const reportData = {
      fecha: new Date().toLocaleDateString(),
      tipos_becas: totalTiposBecas,
      estudiantes_beneficiados: totalEstudiantesBeneficiados,
      monto_total: montoTotalDescuentos / 100,
      promedio_descuento: promedioDescuento.toFixed(1)
    };

    // Simular descarga de reporte
    const fileName = `reporte_becas_${new Date().toISOString().split('T')[0]}.${formato}`;
    
    if (formato === 'excel') {
      // Crear contenido CSV para simular Excel
      const csvContent = [
        'Tipo de Beca,Estudiantes,Monto Total,Porcentaje Max',
        ...becasYDescuentos.map(b => `${b.nombre},${b.estudiantes_aplicados},${b.monto_total_descuento/100},${b.porcentaje_max}%`)
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace('.excel', '.csv');
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      // Para PDF y Word, crear contenido de texto
      const content = `
REPORTE DE BECAS Y DESCUENTOS
Fecha: ${reportData.fecha}

RESUMEN EJECUTIVO:
- Tipos de becas activas: ${reportData.tipos_becas}
- Estudiantes beneficiados: ${reportData.estudiantes_beneficiados}
- Monto total de descuentos: $${reportData.monto_total.toLocaleString()}
- Promedio de descuento: ${reportData.promedio_descuento}%

DETALLE POR TIPO DE BECA:
${becasYDescuentos.map(b => `
${b.nombre}:
- Estudiantes: ${b.estudiantes_aplicados}
- Monto: $${(b.monto_total_descuento/100).toLocaleString()}
- Porcentaje máximo: ${b.porcentaje_max}%
- Estado: ${b.activa ? 'Activa' : 'Inactiva'}
`).join('')}
      `;

      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace(formato, 'txt');
      a.click();
      window.URL.revokeObjectURL(url);
    }

    toast({
      title: "Reporte Generado",
      description: `Reporte en formato ${formato.toUpperCase()} descargado exitosamente.`,
    });
  };

  const handleCalculateTotal = () => {
    const calculo = {
      becas_activas: totalTiposBecas,
      estudiantes_totales: totalEstudiantesBeneficiados,
      ahorro_mensual: montoTotalDescuentos / 100,
      ahorro_anual: (montoTotalDescuentos / 100) * 10, // 10 meses del ciclo escolar
      beneficio_promedio: (montoTotalDescuentos / 100) / totalEstudiantesBeneficiados
    };

    toast({
      title: "Cálculo Total Completado",
      description: `Ahorro anual estimado: $${calculo.ahorro_anual.toLocaleString()} | Beneficio promedio por estudiante: $${calculo.beneficio_promedio.toLocaleString()}`,
    });
  };

  const handleAuditAssignments = () => {
    const auditResults = {
      total_asignaciones: totalEstudiantesBeneficiados,
      asignaciones_manuales: becasYDescuentos.filter(b => b.tipo === 'manual').reduce((sum, b) => sum + b.estudiantes_aplicados, 0),
      asignaciones_automaticas: becasYDescuentos.filter(b => b.tipo === 'automatico').reduce((sum, b) => sum + b.estudiantes_aplicados, 0),
      pendientes_revision: estudiantesParaBecas.filter(e => e.estado === 'Pendiente Renovación').length
    };

    toast({
      title: "Auditoría Completada",
      description: `${auditResults.total_asignaciones} asignaciones revisadas. ${auditResults.pendientes_revision} requieren atención.`,
    });
  };

  const handleManualAssignment = () => {
    setShowAsignarModal(true);
    toast({
      title: "Asignación Manual Activada",
      description: "Selecciona estudiantes para asignar becas manualmente caso por caso.",
    });
  };

  const handleActivateAllBecas = () => {
    toast({
      title: "Asignaciones vigentes mostradas",
      description: "La información se consulta directamente de las becas vigentes. Para cambiar una asignación usa el flujo de alta o edición correspondiente.",
    });
  };

  const handleViewStudents = (beca: any) => {
    setSelectedBeca(beca);
    setShowStudentsModal(true);
  };

  const estudiantesDeBecaSeleccionada = selectedBeca?.estudiantes || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión Administrativa de Becas y Descuentos</h1>
          <p className="text-muted-foreground">Herramienta para asignación manual eficiente y control administrativo</p>
        </div>
        <div className="flex space-x-2">
          <Dialog open={showAsignarModal} onOpenChange={setShowAsignarModal}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Users className="mr-2 h-4 w-4" />
                Asignar Beca
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Asignar Beca/Descuento a Estudiante</DialogTitle>
                <DialogDescription>
                  Asigna becas y descuentos de forma individual o masiva usando Excel
                </DialogDescription>
              </DialogHeader>
              <Tabs value={activeAssignTab} onValueChange={setActiveAssignTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="individual">Individual</TabsTrigger>
                  <TabsTrigger value="excel">Importar Excel</TabsTrigger>
                </TabsList>
                
                <TabsContent value="individual" className="space-y-6 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="estudiante">Estudiante</Label>
                      <Select
                        value={manualAssignment.studentId}
                        onValueChange={(studentId) => {
                          setAssignmentResult(null);
                          setManualAssignment((current) => ({ ...current, studentId }));
                        }}
                      >
                        <SelectTrigger id="estudiante">
                          <SelectValue placeholder={studentsLoading ? "Cargando alumnos..." : "Buscar estudiante..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {students.map((student: any) => (
                            <SelectItem key={student.id} value={String(student.id)}>
                              {student.nombre_completo || `${student.nombre || ""} ${student.apellido || ""}`.trim() || `Alumno #${student.id}`}
                              {student.grado ? ` — ${student.grado}` : ""}
                            </SelectItem>
                          ))}
                          {!studentsLoading && students.length === 0 && (
                            <SelectItem value="sin-alumnos" disabled>No hay alumnos en este campus</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="tipo_beca">Tipo de Beca</Label>
                      <Select
                        value={manualAssignment.tipoBeca}
                        onValueChange={(tipoBeca) => {
                          setAssignmentResult(null);
                            const type = scholarshipTypes.find((item) => String(item.id) === tipoBeca);
                            setManualAssignment((current) => ({
                              ...current,
                              tipoBeca,
                              porcentaje: current.porcentaje || String(type?.beneficio?.porcentaje_descuento || ""),
                            }));
                        }}
                      >
                        <SelectTrigger id="tipo_beca">
                          <SelectValue placeholder="Seleccionar motivo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {scholarshipTypes.filter((type) => type.activo).map((type) => (
                            <SelectItem key={type.id} value={String(type.id)}>
                              {type.nombre}
                            </SelectItem>
                          ))}
                          {scholarshipTypes.length === 0 && (
                            <SelectItem value="sin-tipos" disabled>
                              Primero crea un tipo de beca
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="porcentaje">Porcentaje de descuento (%)</Label>
                      <Input
                        id="porcentaje"
                        type="number"
                        min="1"
                        max="100"
                        placeholder="50"
                        value={manualAssignment.porcentaje}
                        onChange={(event) => {
                          setAssignmentResult(null);
                          setManualAssignment((current) => ({ ...current, porcentaje: event.target.value }));
                        }}
                        className="text-center font-bold text-lg"
                      />
                    </div>
                    <div>
                      <Label htmlFor="vigencia_inicio">Inicio de vigencia</Label>
                      <Input
                        id="vigencia_inicio"
                        type="date"
                        value={manualAssignment.vigenciaInicio}
                        onChange={(event) => setManualAssignment((current) => ({ ...current, vigenciaInicio: event.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="vigencia_fin">Fin de vigencia</Label>
                      <Input
                        id="vigencia_fin"
                        type="date"
                        value={manualAssignment.vigenciaFin}
                        onChange={(event) => setManualAssignment((current) => ({ ...current, vigenciaFin: event.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                    <div className="flex items-center space-x-2 mb-1">
                      <Calculator className="h-4 w-4 text-blue-600" />
                      <h4 className="font-medium">Descuento por porcentaje</h4>
                    </div>
                    Se aplicará sobre cada colegiatura. El endpoint no admite montos fijos para una asignación individual.
                  </div>

                  {assignmentResult?.overlap_warning && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-950" role="alert">
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-4 w-4" />
                        El alumno ya tiene una beca vigente
                      </div>
                      <p className="mt-1">
                        Esta asignación se guardó, pero existen {assignmentResult.becas_vigentes_previas?.length || 1} beca(s) vigente(s).
                        La generación de cargos conservará el porcentaje más alto.
                      </p>
                    </div>
                  )}

                  {assignmentResult && !assignmentResult.overlap_warning && (
                    <div className="bg-green-50 border border-green-300 rounded-lg p-4 text-sm text-green-900">
                      Beca de {assignmentResult.porcentaje}% asignada a {assignmentResult.alumno}.
                    </div>
                  )}

                  <div>
                    <Label htmlFor="observaciones">Observaciones</Label>
                    <Textarea
                      id="observaciones"
                      value={manualAssignment.motivo}
                      onChange={(event) => {
                        setAssignmentResult(null);
                        setManualAssignment((current) => ({ ...current, motivo: event.target.value }));
                      }}
                      placeholder="Motivo de la beca, documentos adjuntos o condiciones especiales..."
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setShowAsignarModal(false)}>
                      Cancelar
                    </Button>
                    <Button
                      disabled={
                        !manualAssignment.studentId ||
                        !manualAssignment.tipoBeca ||
                        !manualAssignment.porcentaje ||
                        asignarBecaIndividual.isPending
                      }
                      onClick={() => asignarBecaIndividual.mutate()}
                    >
                      {asignarBecaIndividual.isPending ? "Asignando..." : "Asignar Beca"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="excel" className="space-y-6 mt-4">
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                        <h4 className="font-medium text-blue-900">Importación Masiva de Becas</h4>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">
                        Asigna múltiples becas y descuentos usando un archivo CSV. Descarga la plantilla, llénala con los datos y súbela para procesamiento automático.
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
                          <span className="text-sm">Descarga la plantilla CSV</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
                          <span className="text-sm">Llena los datos: ID estudiante, tipo de beca, descuento, vigencia, observaciones</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
                          <span className="text-sm">Guarda y sube el archivo completado</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Paso 1: Descargar Plantilla</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground mb-4">
                            Plantilla CSV con ejemplos de asignación de becas
                          </p>
                          <div className="space-y-2">
                            <Button onClick={generateBecasTemplate} className="w-full">
                              <Download className="mr-2 h-4 w-4" />
                              Descargar Plantilla CSV
                            </Button>
                            <p className="text-xs text-gray-600">
                              Compatible con Excel, Numbers y Google Sheets
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Paso 2: Subir Archivo</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div>
                              <Input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleFileSelect}
                                className="mb-2"
                              />
                              {importFile && (
                                <p className="text-sm text-muted-foreground">
                                  Archivo seleccionado: {importFile.name}
                                </p>
                              )}
                            </div>
                            <Button 
                              onClick={handleImportFile}
                              disabled={!importFile}
                              className="w-full"
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Procesar Archivo
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {importProgress > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Progreso de Importación</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Progress value={importProgress} className="mb-2" />
                          <p className="text-sm text-muted-foreground">
                            {importProgress}% completado
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {showImportResults && importResults && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center">
                            <CheckCircle className="mr-2 h-5 w-5 text-green-600" />
                            Resultados de Importación
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">
                                {importResults.successful || 0}
                              </div>
                              <div className="text-sm text-muted-foreground">Exitosos</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-red-600">
                                {importResults.failed || 0}
                              </div>
                              <div className="text-sm text-muted-foreground">Fallidos</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600">
                                {importResults.total || 0}
                              </div>
                              <div className="text-sm text-muted-foreground">Total</div>
                            </div>
                          </div>
                          
                          {importResults.errors && importResults.errors.length > 0 && (
                            <div className="mt-4">
                              <h4 className="font-medium mb-2">Errores encontrados:</h4>
                              <div className="max-h-40 overflow-y-auto">
                                {importResults.errors.map((error: string, index: number) => (
                                  <div key={index} className="text-sm text-red-600 py-1">
                                    • {error}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div className="flex justify-end space-x-2 mt-4">
                            <Button variant="outline" onClick={resetImport}>
                              Limpiar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>

          <Dialog open={showAddModal} onOpenChange={(open) => {
            setShowAddModal(open);
            if (!open) setEditingType(null);
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => {
                setEditingType(null);
                setTypeForm({
                  nombre: "",
                  categoria: "socioeconomica",
                  descripcion: "",
                  algoritmo: "manual",
                  porcentaje: "",
                  vigenciaMeses: "12",
                  activo: true,
                  criterios: "",
                  motivoCambio: "",
                });
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Tipo de Beca
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingType ? "Editar Tipo de Beca" : "Configurar Nuevo Tipo de Beca"}</DialogTitle>
                <DialogDescription>
                  Guardar esta definición no modifica asignaciones ni cargos ya emitidos.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nombre">Nombre de la Beca/Descuento</Label>
                    <Input id="nombre" value={typeForm.nombre} onChange={(event) => setTypeForm((form) => ({ ...form, nombre: event.target.value }))} placeholder="Ej: Beca Excelencia Académica" />
                  </div>
                  <div>
                    <Label htmlFor="categoria">Categoría</Label>
                    <Select value={typeForm.categoria} onValueChange={(categoria) => setTypeForm((form) => ({ ...form, categoria }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="socioeconomica">Socioeconómica</SelectItem>
                        <SelectItem value="convenio">Por Convenio</SelectItem>
                        <SelectItem value="deportiva">Deportiva</SelectItem>
                        <SelectItem value="cultural">Cultural/Artística</SelectItem>
                        <SelectItem value="familiar">Familiar</SelectItem>
                        <SelectItem value="empleado">Empleados</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="tipo">Método de Asignación</Label>
                  <Select value={typeForm.algoritmo} onValueChange={(algoritmo) => setTypeForm((form) => ({ ...form, algoritmo }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual - Asignación caso por caso</SelectItem>
                      <SelectItem value="automatico">Automático - Detecta criterios en sistema</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Textarea id="descripcion" value={typeForm.descripcion} onChange={(event) => setTypeForm((form) => ({ ...form, descripcion: event.target.value }))} placeholder="Describe los criterios y objetivos de esta beca..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="porcentaje_max">Porcentaje Máximo (%)</Label>
                    <Input id="porcentaje_max" type="number" min="1" max="100" value={typeForm.porcentaje} onChange={(event) => setTypeForm((form) => ({ ...form, porcentaje: event.target.value }))} placeholder="50" />
                  </div>
                  <div>
                    <Label htmlFor="vigencia_default">Vigencia por Defecto</Label>
                    <Select value={typeForm.vigenciaMeses} onValueChange={(vigenciaMeses) => setTypeForm((form) => ({ ...form, vigenciaMeses }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar vigencia" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">Un semestre</SelectItem>
                        <SelectItem value="12">Ciclo completo</SelectItem>
                        <SelectItem value="120">10 años</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch id="activa" checked={typeForm.activo} onCheckedChange={(activo) => setTypeForm((form) => ({ ...form, activo }))} />
                  <Label htmlFor="activa">Activar inmediatamente</Label>
                </div>
                <div>
                  <Label htmlFor="criterios">Criterios (opcional)</Label>
                  <Input
                    id="criterios"
                    value={typeForm.criterios}
                    onChange={(event) => setTypeForm((form) => ({ ...form, criterios: event.target.value }))}
                    placeholder="Promedio mínimo, comprobante de ingresos"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Separa cada criterio con una coma.</p>
                </div>
                {editingType && (
                  <div>
                    <Label htmlFor="motivo_cambio_tipo">Motivo del cambio</Label>
                    <Textarea
                      id="motivo_cambio_tipo"
                      value={typeForm.motivoCambio}
                      onChange={(event) => setTypeForm((form) => ({ ...form, motivoCambio: event.target.value }))}
                      placeholder="Explica la razón del cambio (mínimo 10 caracteres)"
                    />
                  </div>
                )}

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={!typeForm.nombre || !typeForm.porcentaje || (Boolean(editingType) && typeForm.motivoCambio.trim().length < 10) || saveScholarshipType.isPending}
                    onClick={() => saveScholarshipType.mutate()}
                  >
                    {saveScholarshipType.isPending ? "Guardando..." : editingType ? "Guardar cambios" : "Crear Tipo de Beca"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tipos de Becas</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTiposBecas}</div>
            <p className="text-xs text-muted-foreground">Activos en el sistema</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estudiantes Beneficiados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEstudiantesBeneficiados}</div>
            <p className="text-xs text-muted-foreground">Con descuentos aplicados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ahorro Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(montoTotalDescuentos / 100).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Descuentos otorgados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promedio Descuento</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{promedioDescuento.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Beneficio promedio</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="becas">Tipos de Becas</TabsTrigger>
          <TabsTrigger value="estudiantes">Estudiantes con Becas</TabsTrigger>
          <TabsTrigger value="reglas-auto">⚡ Reglas automáticas</TabsTrigger>
          <TabsTrigger value="reportes">Reportes y Control</TabsTrigger>
        </TabsList>

        <TabsContent value="becas" className="space-y-4">
          <div className="grid gap-4">
            {tiposCatalogo.map((beca) => (
              <Card key={beca.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        {beca.categoria === 'socioeconomica' && <DollarSign className="h-5 w-5 text-green-500" />}
                        {beca.categoria === 'familiar' && <Users className="h-5 w-5 text-blue-500" />}
                        {beca.categoria === 'convenio' && <Building className="h-5 w-5 text-purple-500" />}
                        {beca.categoria === 'deportiva' && <Target className="h-5 w-5 text-orange-500" />}
                        {beca.categoria === 'cultural' && <Award className="h-5 w-5 text-pink-500" />}
                        {beca.categoria === 'empleado' && <GraduationCap className="h-5 w-5 text-gray-500" />}
                        {beca.nombre}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{beca.descripcion}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={beca.activa ? "default" : "secondary"}>
                        {beca.activa ? "Activa" : "Inactiva"}
                      </Badge>
                      <Badge variant="outline">
                        <Zap className="h-3 w-3 mr-1" />
                        {beca.tipo}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm font-medium">Descuento Máximo</p>
                      <p className="text-2xl font-bold text-green-600">{beca.porcentaje_max}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Método Asignación</p>
                      <p className="text-lg font-semibold">{beca.tipo}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Estudiantes Activos</p>
                      <p className="text-lg font-semibold text-blue-600">{beca.estudiantes_aplicados}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Ahorro Total</p>
                      <p className="text-lg font-semibold text-green-600">
                        ${(beca.monto_total_descuento / 100).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Proceso de Asignación:</p>
                    <p className="text-sm text-muted-foreground">{beca.asignacion}</p>
                    {beca.criterios && (
                      <p className="text-sm text-muted-foreground">Criterios: {beca.criterios}</p>
                    )}
                    {beca.empresas_convenio && (
                      <div>
                        <p className="text-sm font-medium">Empresas con Convenio:</p>
                        <p className="text-sm text-muted-foreground">{beca.empresas_convenio.join(", ")}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end space-x-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => openTypeEditor(beca)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleViewStudents(beca)}>
                      Ver Estudiantes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="estudiantes" className="space-y-4">
          <div className="grid gap-4">
            {estudiantesParaBecas.map((estudiante) => (
              <Card key={estudiante.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{estudiante.nombre_completo}</CardTitle>
                      <p className="text-sm text-muted-foreground">{estudiante.grado}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={estudiante.estado === "Activa" ? "default" : estudiante.estado === "Automática" ? "secondary" : "destructive"}>
                        {estudiante.estado}
                      </Badge>
                      <Badge variant="outline">
                        {estudiante.porcentaje_asignado}% descuento
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm font-medium">Tipo de Beca</p>
                      <p className="text-sm text-muted-foreground">{estudiante.tipo_solicitud}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Fecha Asignación</p>
                      <p className="text-sm text-muted-foreground">{estudiante.fecha_asignacion}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Hermanos Inscritos</p>
                      <p className="text-sm text-muted-foreground">{estudiante.hermanos_inscritos}</p>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div>
                    <p className="text-sm font-medium">Observaciones:</p>
                    <p className="text-sm text-muted-foreground">{estudiante.observaciones}</p>
                  </div>

                  <div className="flex justify-end space-x-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => handleEditBeca(estudiante)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Modificar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleViewDocuments(estudiante)}>
                      <FileText className="h-4 w-4 mr-2" />
                      Documentos
                    </Button>
                    <Button
                      variant={estudiante.estado === "Suspendida" ? "default" : "destructive"}
                      size="sm"
                      onClick={() => {
                        setStatusReason("");
                        setStatusChange({
                          assignment: estudiante,
                          estado: estudiante.estado === "Suspendida" ? "activa" : "suspendida",
                        });
                      }}
                    >
                      {estudiante.estado === "Suspendida" ? (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      {estudiante.estado === "Suspendida" ? "Reactivar" : "Suspender"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Reglas automáticas de becas ───────────────────────────── */}
        <TabsContent value="reglas-auto" className="space-y-4">
          <BecasReglaAuto />
        </TabsContent>

        <TabsContent value="reportes" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Tipo de Beca</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {becasYDescuentos.filter(b => b.activa).map((beca) => {
                  const porcentajeDelTotal = (beca.estudiantes_aplicados / totalEstudiantesBeneficiados) * 100;
                  return (
                    <div key={beca.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{beca.nombre}</span>
                        <span>{beca.estudiantes_aplicados} estudiantes</span>
                      </div>
                      <Progress value={porcentajeDelTotal} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribución de Beneficios ($)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {becasYDescuentos.filter(b => b.activa).map((beca) => {
                  const porcentajeDelTotal = (beca.monto_total_descuento / montoTotalDescuentos) * 100;
                  return (
                    <div key={beca.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{beca.categoria}</span>
                        <span>${(beca.monto_total_descuento / 100).toLocaleString()}</span>
                      </div>
                      <Progress value={porcentajeDelTotal} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Controles Administrativos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="h-20 flex flex-col items-center justify-center">
                      <FileText className="h-6 w-6 mb-2" />
                      Generar Reporte Mensual
                      <Download className="h-3 w-3 mt-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleGenerateReport('excel')}>
                      <FileText className="h-4 w-4 mr-2" />
                      Descargar Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateReport('pdf')}>
                      <FileText className="h-4 w-4 mr-2" />
                      Descargar PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateReport('word')}>
                      <FileText className="h-4 w-4 mr-2" />
                      Descargar Word
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col items-center justify-center"
                  onClick={handleCalculateTotal}
                >
                  <Calculator className="h-6 w-6 mb-2" />
                  Calcular Ahorro Total
                </Button>

                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col items-center justify-center"
                  onClick={handleAuditAssignments}
                >
                  <Users className="h-6 w-6 mb-2" />
                  Auditar Asignaciones
                </Button>

                <Button 
                  variant="default" 
                  className="h-20 flex flex-col items-center justify-center bg-green-600 hover:bg-green-700"
                  onClick={handleActivateAllBecas}
                >
                  <CheckCircle className="h-6 w-6 mb-2" />
                  ACTIVA
                </Button>

                <Button 
                  variant="secondary" 
                  className="h-20 flex flex-col items-center justify-center"
                  onClick={handleManualAssignment}
                >
                  <Target className="h-6 w-6 mb-2" />
                  Manual
                </Button>
              </div>

              <Separator />

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Resumen del Sistema</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>• El sistema gestiona {totalTiposBecas} tipos diferentes de becas y descuentos</p>
                  <p>• Actualmente beneficia a {totalEstudiantesBeneficiados} estudiantes</p>
                  <p>• Ahorro total generado: ${(montoTotalDescuentos / 100).toLocaleString()} MXN</p>
                  <p>• Asignación {becasYDescuentos.filter(b => b.tipo === "manual").length} manual + {becasYDescuentos.filter(b => b.tipo === "automatico").length} automática</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal para Editar Beca */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modificar asignación de beca</DialogTitle>
            <DialogDescription>
              Los cambios aplican sólo a cargos generados después de guardarlos. Los cargos ya emitidos no se recalculan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_estudiante">Estudiante</Label>
                <Input id="edit_estudiante" value={selectedBeca?.nombre_completo || ""} disabled />
              </div>
              <div>
                <Label htmlFor="edit_tipo">Tipo de Beca</Label>
                <Input id="edit_tipo" value={selectedBeca?.tipo_solicitud || "Beca sin tipo"} disabled />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="edit_porcentaje">Porcentaje (%)</Label>
                <Input
                  id="edit_porcentaje"
                  type="number"
                  min="1"
                  max="100"
                  value={assignmentEdit.porcentaje}
                  onChange={(event) => setAssignmentEdit((form) => ({ ...form, porcentaje: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit_inicio">Inicio de vigencia</Label>
                <Input
                  id="edit_inicio"
                  type="date"
                  value={assignmentEdit.vigenciaInicio}
                  onChange={(event) => setAssignmentEdit((form) => ({ ...form, vigenciaInicio: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit_fin">Fin de vigencia</Label>
                <Input
                  id="edit_fin"
                  type="date"
                  value={assignmentEdit.vigenciaFin}
                  onChange={(event) => setAssignmentEdit((form) => ({ ...form, vigenciaFin: event.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit_observaciones">Motivo de la beca</Label>
              <Textarea
                id="edit_observaciones"
                value={assignmentEdit.motivo}
                onChange={(event) => setAssignmentEdit((form) => ({ ...form, motivo: event.target.value }))}
                placeholder="Condiciones o comentarios de la asignación..."
              />
            </div>
            <div>
              <Label htmlFor="edit_motivo_cambio">Motivo del cambio</Label>
              <Textarea
                id="edit_motivo_cambio"
                value={assignmentEdit.motivoCambio}
                onChange={(event) => setAssignmentEdit((form) => ({ ...form, motivoCambio: event.target.value }))}
                placeholder="Explica la razón del cambio (mínimo 10 caracteres)"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  !assignmentEdit.porcentaje
                  || !assignmentEdit.vigenciaInicio
                  || !assignmentEdit.vigenciaFin
                  || assignmentEdit.motivoCambio.trim().length < 10
                  || updateAssignment.isPending
                }
                onClick={() => updateAssignment.mutate()}
              >
                {updateAssignment.isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(statusChange)} onOpenChange={(open) => {
        if (!open) {
          setStatusChange(null);
          setStatusReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusChange?.estado === "suspendida" ? "Suspender beca" : "Reactivar beca"}
            </DialogTitle>
            <DialogDescription>
              {statusChange?.estado === "suspendida"
                ? "La suspensión evitará que se use esta beca en cargos futuros; no cambia pagos ni cargos existentes."
                : "La reactivación permitirá usar la beca en cargos futuros dentro de su vigencia."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="motivo_estado">Motivo</Label>
            <Textarea
              id="motivo_estado"
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
              placeholder="Explica el motivo (mínimo 10 caracteres)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStatusChange(null)}>Cancelar</Button>
            <Button
              variant={statusChange?.estado === "suspendida" ? "destructive" : "default"}
              disabled={statusReason.trim().length < 10 || changeAssignmentStatus.isPending}
              onClick={() => changeAssignmentStatus.mutate()}
            >
              {changeAssignmentStatus.isPending
                ? "Guardando..."
                : statusChange?.estado === "suspendida" ? "Suspender" : "Reactivar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para Ver Documentos */}
      <Dialog open={showDocumentModal} onOpenChange={setShowDocumentModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Documentos de Beca - {selectedEstudiante?.nombre_completo}</DialogTitle>
            <DialogDescription>
              Gestión de documentos requeridos y adjuntos para la beca
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-4">Documentos Requeridos</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Estudio socioeconómico</span>
                    </div>
                    <Badge variant="default">Completo</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Comprobante de ingresos</span>
                    </div>
                    <Badge variant="default">Completo</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Carta de solicitud</span>
                    </div>
                    <Badge variant="secondary">Pendiente</Badge>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-4">Documentos Adicionales</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="text-sm">Acta de nacimiento</span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        toast({
                          title: "Abriendo Documento",
                          description: "Acta de nacimiento descargada exitosamente",
                          duration: 2000,
                        });
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Ver
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="text-sm">CURP</span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        toast({
                          title: "Descargando CURP",
                          description: "Documento CURP descargado exitosamente",
                          duration: 2000,
                        });
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Ver
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-4">Subir Nuevo Documento</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="doc_tipo">Tipo de Documento</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solicitud">Carta de solicitud</SelectItem>
                      <SelectItem value="ingresos">Comprobante de ingresos</SelectItem>
                      <SelectItem value="estudio">Estudio socioeconómico</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="doc_file">Archivo</Label>
                  <Input id="doc_file" type="file" accept=".pdf,.jpg,.png,.docx" />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowDocumentModal(false)}>
                Cerrar
              </Button>
              <Button onClick={() => {
                setShowDocumentModal(false);
                toast({
                  title: "Documento Subido",
                  description: "El documento ha sido adjuntado exitosamente.",
                });
              }}>
                Subir Documento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para Ver Estudiantes de la Beca */}
      <Dialog open={showStudentsModal} onOpenChange={setShowStudentsModal}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Estudiantes con {selectedBeca?.nombre}</DialogTitle>
            <DialogDescription>
              Lista completa de estudiantes beneficiados con esta beca
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {selectedBeca?.estudiantes_aplicados || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Beneficiados</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      ${((selectedBeca?.monto_total_descuento || 0) / 100).toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">Descuento Total</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {selectedBeca?.porcentaje_max || 0}%
                    </div>
                    <div className="text-sm text-muted-foreground">Descuento Máximo</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="border rounded-lg">
              <div className="p-4 border-b bg-muted/50">
                <h4 className="font-medium">Lista de Estudiantes</h4>
              </div>
              <div className="divide-y">
                {estudiantesDeBecaSeleccionada.length > 0 ? (
                  estudiantesDeBecaSeleccionada.map((estudiante: any, index: number) => (
                    <div key={index} className="p-4 hover:bg-muted/50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <GraduationCap className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <div className="font-medium">{estudiante.nombre_completo}</div>
                              <div className="text-sm text-muted-foreground">
                                {estudiante.grado} - {estudiante.grupo}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="font-medium text-green-600">
                              {estudiante.porcentaje_asignado}% descuento
                            </div>
                            <div className="text-sm text-muted-foreground">
                              ${((estudiante.monto_mensual_descuento || 0) / 100).toLocaleString()} acumulado
                            </div>
                          </div>
                          <Badge 
                            variant={estudiante.estado === 'Activa' ? 'default' : 
                                   estudiante.estado === 'Suspendida' ? 'destructive' : 'secondary'}
                          >
                            {estudiante.estado}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-muted-foreground">
                    No hay estudiantes asociados a esta asignación vigente.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowStudentsModal(false)}>
                Cerrar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Lista
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => {
                    const csvContent = [
                      'Nombre,Grado,Grupo,Porcentaje,Descuento Acumulado,Estado',
                      ...estudiantesDeBecaSeleccionada
                        .map((e: any) => `${e.nombre_completo},${e.grado},${e.grupo || 'N/A'},${e.porcentaje_asignado}%,$${((e.monto_mensual_descuento || 0)/100).toLocaleString()},${e.estado}`)
                    ].join('\n');
                    
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `estudiantes_${selectedBeca?.nombre.replace(/\s+/g, '_').toLowerCase()}.csv`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                    
                    toast({
                      title: "Lista Exportada",
                      description: "Lista de estudiantes descargada en formato Excel.",
                    });
                  }}>
                    <FileText className="h-4 w-4 mr-2" />
                    Descargar Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}