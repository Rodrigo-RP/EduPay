import { useState, useRef } from "react";
import { getCurrentCiclo, generateCiclosList } from "@/hooks/use-academic-filter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Search, Edit, Trash2, UserCheck, UserX, Phone, Mail, MapPin, AlertTriangle, FileSpreadsheet, Download, Upload, Eye, Loader2, Settings, CreditCard, ShieldCheck, ShieldOff, Link2, Copy, CheckCircle, History } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ─── TutoresPanel ─────────────────────────────────────────────────────────────
// Subcomponente: lista los tutores de un alumno y permite cambiar el responsable
// de pago sin salir del modal.

interface GuardianRow {
  id: number;
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  nombre_completo: string | null;
  tipo_guardian: string | null;
  es_padre: boolean;
  es_madre: boolean;
  email: string | null;
  correo_institucional_familiar: string | null;
  celular: string | null;
  telefono: string | null;
  es_responsable_pago: boolean;
  porcentaje_responsabilidad: string | null;
}

function TutoresPanel({ studentId, isOpen }: { studentId?: number; isOpen: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // ── Liga mágica ───────────────────────────────────────────────────────────
  const [magicLinkDialog, setMagicLinkDialog] = useState<{ open: boolean; url: string; guardian: string; usos: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; guardianId: number; nombre: string } | null>(null);

  const magicLinkMutation = useMutation({
    mutationFn: async (guardianId: number) => {
      const res = await fetch("/api/admin/magic-link", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ guardian_id: guardianId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (data: any) => {
      setMagicLinkDialog({
        open:     true,
        url:      data.url,
        guardian: data.guardian?.nombre || "Tutor",
        usos:     3,
      });
    },
    onError: (err: Error) => {
      toast({ title: "No se pudo generar la liga", description: err.message, variant: "destructive" });
    },
  });

  const { data: historyData = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/magic-link/history", historyDialog?.guardianId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/magic-link/history/${historyDialog!.guardianId}`, { headers });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!historyDialog?.open && !!historyDialog.guardianId,
  });

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  // ─────────────────────────────────────────────────────────────────────────

  const { data: tutores = [], isLoading, isError } = useQuery<GuardianRow[]>({
    queryKey: ["/api/admin/students", studentId, "guardians"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/students/${studentId}/guardians`, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!studentId && isOpen,
  });

  const patchMutation = useMutation({
    mutationFn: async ({
      guardianId,
      es_responsable_pago,
    }: {
      guardianId: number;
      es_responsable_pago: boolean;
    }) => {
      const res = await fetch(`/api/admin/students/${studentId}/guardians/${guardianId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ es_responsable_pago }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? `Error ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students", studentId, "guardians"] });
      toast({ title: "Responsable actualizado", description: "El cambio se guardó correctamente." });
    },
    onError: (err: Error) => {
      toast({ title: "No se pudo actualizar", description: err.message, variant: "destructive" });
    },
  });

  if (!studentId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
        <span className="text-sm text-gray-500">Cargando tutores...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        No se pudieron cargar los tutores vinculados a este alumno.
      </div>
    );
  }

  if (tutores.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500">
        <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm">Este alumno no tiene tutores vinculados.</p>
      </div>
    );
  }

  const nombreCompleto = (t: GuardianRow) =>
    t.nombre_completo?.trim() ||
    [t.nombres, t.apellido_paterno, t.apellido_materno].filter(Boolean).join(" ");

  const contacto = (t: GuardianRow) =>
    t.email ?? t.correo_institucional_familiar ?? t.celular ?? t.telefono ?? "Sin contacto";

  const tipoLabel = (t: GuardianRow) => {
    if (t.es_madre) return "Madre";
    if (t.es_padre) return "Padre";
    return t.tipo_guardian ?? "Tutor";
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 bg-blue-50 rounded px-3 py-2">
        <strong>Responsable de pago</strong> — el tutor marcado recibe los cargos, estados de
        cuenta y notificaciones de cobro. Desactívalo solo si otro tutor asume la responsabilidad.
      </p>

      {tutores.map((tutor) => {
        const isPending = patchMutation.isPending && (patchMutation.variables as any)?.guardianId === tutor.id;

        return (
          <div
            key={tutor.id}
            className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
              tutor.es_responsable_pago
                ? "border-green-200 bg-green-50"
                : "border-gray-200 bg-white"
            }`}
          >
            {/* Avatar */}
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${
                tutor.es_responsable_pago
                  ? "bg-green-600 text-white"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {nombreCompleto(tutor).charAt(0).toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{nombreCompleto(tutor)}</span>
                <Badge variant="secondary" className="text-xs">{tipoLabel(tutor)}</Badge>
                {tutor.es_responsable_pago ? (
                  <Badge className="bg-green-100 text-green-800 text-xs gap-1">
                    <ShieldCheck className="w-3 h-3" />Responsable de pago
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs gap-1 text-gray-500">
                    <ShieldOff className="w-3 h-3" />Solo contacto
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{contacto(tutor)}</p>
              {tutor.porcentaje_responsabilidad && tutor.es_responsable_pago && (
                <div className="flex items-center gap-1 mt-1">
                  <CreditCard className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-500">
                    {parseFloat(tutor.porcentaje_responsabilidad).toFixed(0)}% del cargo
                  </span>
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              {/* Toggle responsable */}
              <div className="flex flex-col items-center gap-1">
                {isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                ) : (
                  <Switch
                    checked={tutor.es_responsable_pago}
                    onCheckedChange={(checked) =>
                      patchMutation.mutate({ guardianId: tutor.id, es_responsable_pago: checked })
                    }
                    disabled={patchMutation.isPending}
                  />
                )}
                <span className="text-xs text-gray-400">
                  {tutor.es_responsable_pago ? "Activo" : "Inactivo"}
                </span>
              </div>

              {/* Botón generar liga mágica */}
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => magicLinkMutation.mutate(tutor.id)}
                  disabled={magicLinkMutation.isPending}
                  title="Generar liga de pago sin contraseña"
                >
                  {magicLinkMutation.isPending && (magicLinkMutation.variables as any) === tutor.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Link2 className="w-3 h-3" />
                  )}
                  <span className="ml-1">Liga</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-gray-500 hover:bg-gray-100"
                  onClick={() => setHistoryDialog({ open: true, guardianId: tutor.id, nombre: nombreCompleto(tutor) })}
                  title="Historial de ligas generadas"
                >
                  <History className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {/* ── Dialog: Liga mágica generada ──────────────────────────────────── */}
      <Dialog
        open={!!magicLinkDialog?.open}
        onOpenChange={(open) => { if (!open) setMagicLinkDialog(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-500" />
              Liga de pago generada
            </DialogTitle>
            <DialogDescription>
              Envía esta liga a <strong>{magicLinkDialog?.guardian}</strong> por WhatsApp o correo. Expira en 72 horas y puede usarse hasta 3 veces.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 border break-all">
              <p className="text-sm font-mono text-slate-700">{magicLinkDialog?.url}</p>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={() => handleCopy(magicLinkDialog?.url || "")}
              >
                {copied ? (
                  <><CheckCircle className="w-4 h-4 mr-2" />¡Copiado!</>
                ) : (
                  <><Copy className="w-4 h-4 mr-2" />Copiar liga</>
                )}
              </Button>
              <Button variant="outline" onClick={() => setMagicLinkDialog(null)}>
                Cerrar
              </Button>
            </div>
            <p className="text-xs text-slate-400 text-center">
              El padre puede abrir esta liga directamente desde el teléfono, sin instalar nada ni recordar contraseñas.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Historial de ligas ─────────────────────────────────────── */}
      <Dialog
        open={!!historyDialog?.open}
        onOpenChange={(open) => { if (!open) setHistoryDialog(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-slate-500" />
              Historial de ligas — {historyDialog?.nombre}
            </DialogTitle>
            <DialogDescription>
              Últimas 10 ligas generadas para este tutor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {historyData.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Sin ligas generadas aún.</p>
            ) : (
              historyData.map((h: any) => (
                <div key={h.id} className={`rounded-lg border p-3 text-xs flex gap-3 items-start ${h.expirada || h.agotada ? "bg-slate-50 border-slate-200 opacity-60" : "bg-green-50 border-green-200"}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {h.expirada ? "Expirada" : h.agotada ? "Agotada" : "Vigente"}
                      </span>
                      <span className="text-slate-400">· {h.usos}/{h.max_usos} usos</span>
                    </div>
                    <p className="text-slate-500 mt-0.5">
                      Creada: {new Date(h.creado_en).toLocaleString("es-MX")} por {h.creado_por}
                    </p>
                    <p className="text-slate-400">
                      Expira: {new Date(h.expira_en).toLocaleString("es-MX")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <Button variant="outline" className="w-full mt-2" onClick={() => setHistoryDialog(null)}>
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function Estudiantes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrado, setSelectedGrado] = useState("all");
  const [selectedGrupo, setSelectedGrupo] = useState("all");
  const [selectedSeccion, setSelectedSeccion] = useState("all");
  const [selectedCicloEscolar, setSelectedCicloEscolar] = useState("all");
  const [selectedPeriodoEstudiantes, setSelectedPeriodoEstudiantes] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCodigoPostal, setSelectedCodigoPostal] = useState("all");
  const [selectedEdadRango, setSelectedEdadRango] = useState("all");
  const [selectedSexo, setSelectedSexo] = useState("all");
  const [selectedExtranjero, setSelectedExtranjero] = useState("all");
  const [selectedNacionalidad, setSelectedNacionalidad] = useState("all");
  const [selectedIdioma, setSelectedIdioma] = useState("all");
  const [selectedNecesidades, setSelectedNecesidades] = useState("all");
  const [selectedRepetidor, setSelectedRepetidor] = useState("all");
  const [selectedDialecto, setSelectedDialecto] = useState("all");
  const [showResumen, setShowResumen] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [gruposPersonalizados, setGruposPersonalizados] = useState(["A", "B", "C", "D", "E", "F", "G", "H"]);
  const [editandoGrupos, setEditandoGrupos] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState("");
  const [editandoGrupoIndex, setEditandoGrupoIndex] = useState<number | null>(null);
  const [nombreGrupoEditando, setNombreGrupoEditando] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [viewingStudent, setViewingStudent] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("individual");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Consulta real a la API para obtener estudiantes (campus dinámico desde cookie/token)
  const { data: estudiantes = [], isLoading, error } = useQuery({
    queryKey: ['/api/admin/students'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/students', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        throw new Error('Error al cargar estudiantes');
      }
      return response.json();
    }
  });

  // Formulario adaptado a estructura Excel "Concentrado_Estudiante y Padre" + credenciales individuales
  const [formData, setFormData] = useState({
    // PADRE DE FAMILIA (columnas 1-7 Excel) + credenciales
    padre_id_referencia: "",
    padre_username: "",
    padre_password: "",
    padre_correo_institucional_familiar: "",
    padre_nombres: "",
    padre_apellido_paterno: "",
    padre_apellido_materno: "",
    padre_curp: "",
    padre_celular: "",
    padre_telefono_casa_oficina: "",
    
    // MADRE DE FAMILIA + credenciales
    madre_id_referencia: "",
    madre_username: "",
    madre_password: "",
    madre_correo_institucional_familiar: "",
    madre_nombres: "",
    madre_apellido_paterno: "",
    madre_apellido_materno: "",
    madre_curp: "",
    madre_celular: "",
    madre_telefono_casa_oficina: "",
    
    // ESTUDIANTE (columnas 8-20 Excel) + credenciales
    estudiante_id_referencia: "",
    estudiante_username: "",
    estudiante_password: "",
    estudiante_nombres: "",
    estudiante_apellido_paterno: "",
    estudiante_apellido_materno: "",
    estudiante_curp: "",
    estudiante_fecha_nacimiento: "",
    estudiante_tipo_sangre: "",
    estudiante_correo_institucional: "",
    estudiante_nivel_escolar: "",
    estudiante_clave_centro_trabajo: "",
    estudiante_grado: "",
    estudiante_grupo: "",
    estudiante_turno: "",
    
    // DIRECCIÓN FAMILIAR (Nueva sección - Ficha Técnica)
    direccion_calle: "",
    direccion_colonia: "",
    direccion_codigo_postal: "",
    direccion_ciudad: "",
    direccion_estado: "",
    
    status: "activo"
  });

  // Mutación para crear estudiante
  const createStudentMutation = useMutation({
    mutationFn: async (studentData: any) => {
      return apiRequest('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify(studentData)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/students/1'] });
      toast({
        title: "Éxito",
        description: "Estudiante agregado correctamente"
      });
      setShowAddModal(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Error al agregar estudiante",
        variant: "destructive"
      });
    }
  });

  // Mutación para actualizar alumno
  const updateStudentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/admin/students/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Error'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/students'] });
      toast({ title: 'Alumno actualizado', description: 'Los cambios se guardaron correctamente.' });
      setShowEditModal(false);
      setEditingStudent(null);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // Mutación para importar estudiantes
  const importStudentsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch('/api/admin/students/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error en la importación');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/students/1'] });
      toast({
        title: "Importación completada",
        description: `${data.successful} estudiantes importados exitosamente`
      });
      setImportFile(null);
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error en la importación",
        description: error.message,
        variant: "destructive"
      });
      setIsImporting(false);
    }
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Función para combinar nombres separados en nombre completo
  const combineNames = (nombres: string, primerApellido: string, segundoApellido: string) => {
    const parts = [nombres, primerApellido, segundoApellido].filter(part => part.trim());
    return parts.join(' ');
  };

  const resetForm = () => {
    setFormData({
      // PADRE DE FAMILIA + credenciales
      padre_id_referencia: "",
      padre_username: "",
      padre_password: "",
      padre_correo_institucional_familiar: "",
      padre_nombres: "",
      padre_apellido_paterno: "",
      padre_apellido_materno: "",
      padre_curp: "",
      padre_celular: "",
      padre_telefono_casa_oficina: "",
      
      // MADRE DE FAMILIA + credenciales
      madre_id_referencia: "",
      madre_username: "",
      madre_password: "",
      madre_correo_institucional_familiar: "",
      madre_nombres: "",
      madre_apellido_paterno: "",
      madre_apellido_materno: "",
      madre_curp: "",
      madre_celular: "",
      madre_telefono_casa_oficina: "",
      
      // ESTUDIANTE + credenciales
      estudiante_id_referencia: "",
      estudiante_username: "",
      estudiante_password: "",
      estudiante_nombres: "",
      estudiante_apellido_paterno: "",
      estudiante_apellido_materno: "",
      estudiante_curp: "",
      estudiante_fecha_nacimiento: "",
      estudiante_tipo_sangre: "",
      estudiante_correo_institucional: "",
      estudiante_nivel_escolar: "",
      estudiante_clave_centro_trabajo: "",
      estudiante_grado: "",
      estudiante_grupo: "",
      estudiante_turno: "",
      
      // DIRECCIÓN FAMILIAR (Nueva sección - Ficha Técnica)
      direccion_calle: "",
      direccion_colonia: "",
      direccion_codigo_postal: "",
      direccion_ciudad: "",
      direccion_estado: "",
      
      status: "activo"
    });
  };

  const loadStudentForView = (student: any) => {
    setViewingStudent(student);
    setShowViewModal(true);
  };

  const loadStudentForEdit = (student: any) => {
    setEditingStudent(student);
    setFormData({
      // PADRE DE FAMILIA + credenciales
      padre_id_referencia: "",
      padre_username: "",
      padre_password: "", // No cargar contraseñas por seguridad
      padre_correo_institucional_familiar: "",
      padre_nombres: "",
      padre_apellido_paterno: "",
      padre_apellido_materno: "",
      padre_curp: "",
      padre_celular: "",
      padre_telefono_casa_oficina: "",
      
      // MADRE DE FAMILIA + credenciales
      madre_id_referencia: "",
      madre_username: "",
      madre_password: "", // No cargar contraseñas por seguridad
      madre_correo_institucional_familiar: "",
      madre_nombres: "",
      madre_apellido_paterno: "",
      madre_apellido_materno: "",
      madre_curp: "",
      madre_celular: "",
      madre_telefono_casa_oficina: "",
      
      // ESTUDIANTE + credenciales - datos del estudiante existente
      estudiante_id_referencia: student.id_referencia || "",
      estudiante_username: student.username || "",
      estudiante_password: "", // No cargar contraseña por seguridad
      estudiante_nombres: student.nombres || "",
      estudiante_apellido_paterno: student.apellido_paterno || "",
      estudiante_apellido_materno: student.apellido_materno || "",
      estudiante_curp: student.curp || "",
      estudiante_fecha_nacimiento: student.fecha_nacimiento || "",
      estudiante_tipo_sangre: student.tipo_sangre || "",
      estudiante_correo_institucional: student.correo_institucional || "",
      estudiante_nivel_escolar: student.nivel_escolar || "",
      estudiante_clave_centro_trabajo: student.clave_centro_trabajo || "",
      estudiante_grado: student.grado || "",
      estudiante_grupo: student.grupo || "",
      estudiante_turno: student.turno || "",
      
      // DIRECCIÓN FAMILIAR (campos existentes o vacíos)
      direccion_calle: student.direccion_calle || "",
      direccion_colonia: student.direccion_colonia || "",
      direccion_codigo_postal: student.direccion_codigo_postal || student.cp || "",
      direccion_ciudad: student.direccion_ciudad || "",
      direccion_estado: student.direccion_estado || "",
      
      status: student.status || "activo"
    });
    setShowEditModal(true);
  };

  // Funciones para exportar
  // ── Exportación del resumen estadístico ──────────────────────────────────
  const buildResumenData = () => {
    const count = (arr: any[], pred: (e: any) => boolean) => arr.filter(pred).length;
    const byKey = (arr: any[], getter: (e: any) => string) => {
      const map: Record<string, number> = {};
      arr.forEach(e => { const k = getter(e) || "Sin dato"; map[k] = (map[k] || 0) + 1; });
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    };
    return {
      total: filteredEstudiantes.length,
      porNivel:    byKey(filteredEstudiantes, e => e.nivel_escolar),
      porEstatus:  byKey(filteredEstudiantes, e => e.status),
      porSexo:     byKey(filteredEstudiantes, e => (e.sexo || "Sin dato")),
      porEdad:     rangoEdadOptions.map(r => ({ label: r.label, count: count(filteredEstudiantes, e => estaEnRangoEdad(calcularEdad(e.fecha_nacimiento || e.estudiante_fecha_nacimiento), r.value)) })),
      porOrigen:   [
        { label: "Mexicano",   count: count(filteredEstudiantes, e => !e.extranjero && !e.es_extranjero) },
        { label: "Extranjero", count: count(filteredEstudiantes, e => e.extranjero === true || e.es_extranjero === true) },
      ],
      porNacionalidad: byKey(filteredEstudiantes, e => e.nacionalidad),
      porIdioma:       byKey(filteredEstudiantes, e => e.idioma_natal || e.idioma),
      conNecesidades:  count(filteredEstudiantes, e => e.necesidades_especiales === true || e.necesidades_especiales === "si"),
      repetidores:     count(filteredEstudiantes, e => e.repetidor === true || e.repetidor === "si"),
    };
  };

  const exportResumenExcel = () => {
    const d = buildResumenData();
    const rows: string[][] = [
      ["RESUMEN DE ALUMNOS", "", ""],
      [`Generado: ${new Date().toLocaleDateString('es-MX')}`, "", ""],
      ["Total filtrado", String(d.total), ""],
      ["", "", ""],
      ["RUBRO", "CATEGORÍA", "CANTIDAD"],
      ...d.porNivel.map(([k, v]) => ["Nivel escolar", k, String(v)]),
      ...d.porEstatus.map(([k, v]) => ["Estatus", k, String(v)]),
      ...d.porSexo.map(([k, v]) => ["Sexo", k, String(v)]),
      ...d.porEdad.map(r => ["Edad", r.label, String(r.count)]),
      ...d.porOrigen.map(r => ["Origen", r.label, String(r.count)]),
      ...d.porNacionalidad.map(([k, v]) => ["Nacionalidad", k, String(v)]),
      ...d.porIdioma.map(([k, v]) => ["Idioma natal", k, String(v)]),
      ["Necesidades específicas", "Con necesidades", String(d.conNecesidades)],
      ["Repetidor de grado", "Sí repite", String(d.repetidores)],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `resumen_alumnos_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a); a.click();
    URL.revokeObjectURL(url); document.body.removeChild(a);
    toast({ title: "Excel exportado", description: "Resumen descargado como CSV (compatible con Excel)" });
  };

  const exportResumenPDF = () => {
    const d = buildResumenData();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Resumen de Alumnos</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;color:#1a1a1a}h1{color:#1e40af;font-size:20px}h2{color:#374151;font-size:14px;margin-top:16px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
    table{border-collapse:collapse;width:100%;margin-bottom:8px;font-size:12px}th{background:#1e40af;color:#fff;padding:6px 10px;text-align:left}td{padding:5px 10px;border-bottom:1px solid #f3f4f6}
    tr:nth-child(even) td{background:#f9fafb}.meta{color:#6b7280;font-size:12px;margin-bottom:16px}
    @media print{body{padding:10px}}</style></head><body>
    <h1>Resumen de Alumnos</h1>
    <p class="meta">Generado: ${new Date().toLocaleDateString('es-MX')} · Total: ${d.total} alumno(s)</p>
    ${[
      { title: "Por Nivel Escolar", rows: d.porNivel },
      { title: "Por Estatus", rows: d.porEstatus },
      { title: "Por Sexo", rows: d.porSexo },
      { title: "Por Origen", rows: d.porOrigen.map(r => [r.label, r.count] as [string, number]) },
      { title: "Por Nacionalidad", rows: d.porNacionalidad },
      { title: "Por Idioma Natal", rows: d.porIdioma },
    ].map(s => `<h2>${s.title}</h2><table><tr><th>Categoría</th><th>Cantidad</th></tr>${s.rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>`).join("")}
    <h2>Por Rango de Edad</h2><table><tr><th>Rango</th><th>Cantidad</th></tr>${d.porEdad.map(r => `<tr><td>${r.label}</td><td>${r.count}</td></tr>`).join("")}</table>
    <h2>Indicadores especiales</h2><table><tr><th>Indicador</th><th>Cantidad</th></tr>
    <tr><td>Con necesidades específicas</td><td>${d.conNecesidades}</td></tr>
    <tr><td>Repetidores de grado</td><td>${d.repetidores}</td></tr></table>
    </body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.focus(); win.print(); }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleExport = async (format: 'xlsx' | 'csv') => {
    try {
      const response = await apiRequest(`/api/admin/students/1/export?format=${format}`);
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estudiantes_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Exportación exitosa",
        description: `Archivo ${format.toUpperCase()} descargado correctamente`
      });
    } catch (error) {
      toast({
        title: "Error al exportar",
        description: "No se pudo exportar el archivo",
        variant: "destructive"
      });
    }
  };

  // Función para manejar la selección de archivo
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  // Función para iniciar importación
  const handleImport = () => {
    if (importFile) {
      setIsImporting(true);
      importStudentsMutation.mutate(importFile);
    }
  };

  // Función para descargar plantilla - estructura con credenciales individuales por usuario
  const downloadTemplate = () => {
    const templateData = [
      // Encabezados principales
      ['PADRE DE FAMILIA', '', '', '', '', '', '', '', '', '', 'MADRE DE FAMILIA', '', '', '', '', '', '', '', '', '', 'ESTUDIANTE', '', '', '', '', '', '', '', '', '', '', '', ''],
      // Campos específicos
      [
        'ID Reference Padre',
        'Usuario padre',
        'Contraseña padre',
        'Correo institucional familiar',
        'Nombre(s)',
        'Apellido paterno', 
        'Apellido Materno',
        'CURP',
        'Celular',
        'Telefono casa/oficina',
        'ID Reference Madre',
        'Usuario madre',
        'Contraseña madre',
        'Correo institucional familiar',
        'Nombre(s)',
        'Apellido paterno', 
        'Apellido Materno',
        'CURP',
        'Celular',
        'Telefono casa/oficina',
        'ID Reference Estudiante',
        'Usuario estudiante',
        'Contraseña estudiante',
        'Nombre(s)',
        'Apellido paterno',
        'Apellido Materno', 
        'CURP',
        'Fecha de nacimiento (DD/MM/YYYY)',
        'Tipo de Sangre',
        'Correo institucional',
        'Nivel escolar',
        'Clave del centro de Trabajo',
        'Grado',
        'Grupo',
        'Turno'
      ],
      // Ejemplo 1
      [
        'padre.juan@institutojfr.edu.mx',
        'Juan Carlos',
        'Pérez',
        'García',
        'PEGJ800515HDFRRN09',
        '5551234567',
        '5587654321',
        'María Fernanda',
        'Pérez',
        'López',
        'PELM120101MDFRRR08',
        '01/01/2012',
        'O+',
        'maria.perez@institutojfr.edu.mx',
        'Primaria',
        '09DPR0001X',
        '6°',
        'A',
        'Matutino',
        'Primaria'
      ],
      // Ejemplo 2
      [
        'responsable.ana@institutojfr.edu.mx',
        'Ana Cristina',
        'Martínez',
        'Hernández',
        'MAHA750820MDFRRR05',
        '5559876543',
        '5512345678',
        'Diego Alejandro',
        'Martínez',
        'Silva',
        'MASD130505HDFRRR01',
        '05/05/2013',
        'A-',
        'diego.martinez@institutojfr.edu.mx',
        'Primaria',
        '09DPR0001X',
        '5°',
        'B',
        'Matutino',
        'Primaria'
      ]
    ];
    
    const csvContent = templateData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_concentrado_estudiante_padre.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast({
      title: "Plantilla descargada",
      description: "Plantilla con estructura Excel: Concentrado Estudiante y Padre"
    });
  };

  // Filtros predefinidos para estudiantes con opciones específicas del sistema educativo mexicano
  const seccionesEducativas = [
    'Kinder',
    'Primaria', 
    'Secundaria',
    'Preparatoria'
  ];
  
  // Grados organizados por sección educativa para mejor identificación
  const gradosPorSeccion = {
    'Kinder': ['1° Kinder', '2° Kinder', '3° Kinder'],
    'Primaria': ['1° Primaria', '2° Primaria', '3° Primaria', '4° Primaria', '5° Primaria', '6° Primaria'],
    'Secundaria': ['7° (1° Secundaria)', '8° (2° Secundaria)', '9° (3° Secundaria)'],
    'Preparatoria': ['1° Semestre', '2° Semestre', '3° Semestre', '4° Semestre', '5° Semestre', '6° Semestre']
  };

  // Lista ordenada de todos los grados para filtros
  const gradosEducativos = [
    ...gradosPorSeccion['Kinder'],
    ...gradosPorSeccion['Primaria'],
    ...gradosPorSeccion['Secundaria'],
    ...gradosPorSeccion['Preparatoria']
  ];
  
  const gruposEducativos = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'
  ];
  
  const ciclosEducativos = generateCiclosList();

  // Rangos de edad para filtros inteligentes
  const rangoEdadOptions = Array.from({ length: 16 }, (_, i) => ({
    value: String(i + 5),
    label: `${i + 5} años`,
  }));

  // Función para calcular edad desde fecha de nacimiento
  const calcularEdad = (fechaNacimiento: string) => {
    if (!fechaNacimiento) return null;
    const hoy = new Date();
    const fechaNac = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - fechaNac.getFullYear();
    const mes = hoy.getMonth() - fechaNac.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
      edad--;
    }
    return edad;
  };

  // Compara edad exacta con el valor de rango (ahora son años individuales 5-20)
  const estaEnRangoEdad = (edad: number | null, rango: string) => {
    if (edad === null || edad === undefined) return false;
    return edad === parseInt(rango, 10);
  };

  // Filtros predefinidos inteligentes
  const aplicarFiltroPredefinido = (tipo: string) => {
    // Limpiar filtros actuales
    setSearchTerm("");
    setSelectedGrado("all");
    setSelectedGrupo("all");
    setSelectedSeccion("all");
    setSelectedCicloEscolar("all");
    setSelectedPeriodoEstudiantes("all");
    setSelectedCodigoPostal("all");
    setSelectedEdadRango("all");
    setSelectedSexo("all");
    setSelectedExtranjero("all");
    setSelectedNacionalidad("all");
    setSelectedIdioma("all");
    setSelectedNecesidades("all");
    setSelectedRepetidor("all");
    setSelectedDialecto("all");

    switch (tipo) {
      case 'activos':
        setSelectedStatus('activo');
        break;
      case 'nuevos':
        // Filtrar por ciclo escolar actual y activos
        setSelectedStatus('activo');
        setSelectedCicloEscolar(getCurrentCiclo());
        break;
      case 'pendientes':
        // Filtrar por status que indique documentos pendientes - usar términos más comunes
        setSelectedStatus('pendiente');
        break;
      case 'todos':
        setSelectedStatus("all");
        setShowAll(true);
        break;
    }
  };

  // Mantener opciones dinámicas de la base de datos como fallback
  const gradosBD = Array.from(new Set(estudiantes.map((e: any) => e.grado).filter(Boolean))) as string[];
  const gruposBD = Array.from(new Set(estudiantes.map((e: any) => e.grupo).filter(Boolean))) as string[];
  const seccionesBD = Array.from(new Set(estudiantes.map((e: any) => e.nivel_escolar).filter(Boolean))) as string[];
  const ciclosEscolaresBD = Array.from(new Set(estudiantes.map((e: any) => e.ciclo_escolar || '2024-2025').filter(Boolean))) as string[];
  
  // Combinar opciones predefinidas con las de la base de datos (sin duplicados)
  const grados = Array.from(new Set([...gradosEducativos, ...gradosBD]));
  const grupos = Array.from(new Set([...gruposEducativos, ...gruposBD])); 
  const secciones = Array.from(new Set([...seccionesEducativas, ...seccionesBD]));
  const ciclosEscolares = Array.from(new Set([...ciclosEducativos, ...ciclosEscolaresBD]));
  const statusOptions = Array.from(new Set(estudiantes.map((e: any) => e.status).filter(Boolean))) as string[];
  const codigosPostales = Array.from(new Set(
    estudiantes.map((e: any) => 
      e.codigo_postal || 
      e.cp || 
      e.direccion_codigo_postal || 
      e.postal_code ||
      (e.direccion && e.direccion.match && e.direccion.match(/\b\d{5}\b/))?.[0]
    ).filter(Boolean)
  )) as string[];

  // true cuando el usuario ha escrito, seleccionado un filtro, o pedido ver todos
  const hasActiveSearch = showAll ||
    !!searchTerm ||
    selectedGrado !== "all" ||
    selectedGrupo !== "all" ||
    selectedSeccion !== "all" ||
    selectedCicloEscolar !== "all" ||
    selectedPeriodoEstudiantes !== "all" ||
    selectedStatus !== "all" ||
    selectedCodigoPostal !== "all" ||
    selectedEdadRango !== "all" ||
    selectedSexo !== "all" ||
    selectedExtranjero !== "all" ||
    selectedNacionalidad !== "all" ||
    selectedIdioma !== "all" ||
    selectedNecesidades !== "all" ||
    selectedRepetidor !== "all" ||
    selectedDialecto !== "all";

  const filteredEstudiantes = estudiantes.filter((estudiante: any) => {
    const matchSearch = !searchTerm || 
      estudiante.nombre_completo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estudiante.curp?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estudiante.nombres?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estudiante.apellido_paterno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      estudiante.apellido_materno?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchGrado = selectedGrado === "all" || estudiante.grado === selectedGrado;
    const matchGrupo = selectedGrupo === "all" || estudiante.grupo === selectedGrupo;
    const matchSeccion = selectedSeccion === "all" || estudiante.nivel_escolar === selectedSeccion;
    const matchCiclo = selectedCicloEscolar === "all" || !estudiante.ciclo_escolar || estudiante.ciclo_escolar === selectedCicloEscolar;
    const matchStatus = selectedStatus === "all" || estudiante.status === selectedStatus;
    const matchCodigoPostal = selectedCodigoPostal === "all" || 
      estudiante.codigo_postal === selectedCodigoPostal ||
      estudiante.cp === selectedCodigoPostal ||
      estudiante.direccion_codigo_postal === selectedCodigoPostal ||
      estudiante.postal_code === selectedCodigoPostal ||
      (estudiante.direccion && estudiante.direccion.includes && estudiante.direccion.includes(selectedCodigoPostal));
    
    // Filtro por rango de edad
    const edad = calcularEdad(estudiante.fecha_nacimiento || estudiante.estudiante_fecha_nacimiento);
    const matchEdad = selectedEdadRango === "all" || estaEnRangoEdad(edad, selectedEdadRango);

    // Filtro por período de registro
    const matchPeriodo = (() => {
      if (selectedPeriodoEstudiantes === "all") return true;
      const raw = estudiante.created_at || estudiante.fecha_registro;
      if (!raw) return true;
      const fecha = new Date(raw);
      const now = new Date();
      if (selectedPeriodoEstudiantes === "hoy")   return fecha.toDateString() === now.toDateString();
      if (selectedPeriodoEstudiantes === "semana") return (now.getTime() - fecha.getTime()) <= 7 * 24 * 60 * 60 * 1000;
      if (selectedPeriodoEstudiantes === "mes")   return fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear();
      return true;
    })();

    // Filtros extendidos
    const matchSexo = selectedSexo === "all" || (estudiante.sexo || "").toLowerCase() === selectedSexo.toLowerCase();
    // "Originario" filtra por estado_origen; "Otro" = sin estado conocido y no extranjero
    const matchExtranjero = selectedExtranjero === "all" || (() => {
      const origen = (estudiante.estado_origen || "").toLowerCase().trim();
      if (selectedExtranjero === "Otro") return !origen && !estudiante.extranjero && !estudiante.es_extranjero;
      return origen === selectedExtranjero.toLowerCase().trim();
    })();
    const matchNacionalidad = selectedNacionalidad === "all" || (estudiante.nacionalidad || "") === selectedNacionalidad;
    const matchIdioma = selectedIdioma === "all" || (estudiante.idioma_natal || estudiante.idioma || "") === selectedIdioma;
    const matchNecesidades = selectedNecesidades === "all" ||
      (selectedNecesidades === "si" ? estudiante.necesidades_especiales === true || estudiante.necesidades_especiales === "si" : !estudiante.necesidades_especiales || estudiante.necesidades_especiales === false || estudiante.necesidades_especiales === "no");
    const matchRepetidor = selectedRepetidor === "all" ||
      (selectedRepetidor === "si" ? estudiante.repetidor === true || estudiante.repetidor === "si" : !estudiante.repetidor || estudiante.repetidor === false || estudiante.repetidor === "no");
    const matchDialecto = selectedDialecto === "all" ||
      (selectedDialecto === "si" ? estudiante.habla_dialecto === true || estudiante.habla_dialecto === "si" : !estudiante.habla_dialecto || estudiante.habla_dialecto === false || estudiante.habla_dialecto === "no");
    
    return matchSearch && matchGrado && matchGrupo && matchSeccion && matchCiclo && matchStatus && matchCodigoPostal && matchEdad && matchPeriodo &&
           matchSexo && matchExtranjero && matchNacionalidad && matchIdioma && matchNecesidades && matchRepetidor && matchDialecto;
  });

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error al cargar estudiantes</h2>
            <p className="text-muted-foreground">
              Hubo un problema al cargar la lista de estudiantes. Por favor, recarga la página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Estudiantes
              {!isLoading && hasActiveSearch && (
                <span className="ml-2 text-lg font-normal text-gray-500">
                  — {filteredEstudiantes.length} resultado{filteredEstudiantes.length !== 1 ? 's' : ''}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-600">
              Gestiona la información de todos los estudiantes
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Agregar estudiante
          </Button>
          <Button 
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Importar masivo
          </Button>
          <Button 
            variant="outline"
            onClick={() => handleExport('xlsx')}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button 
            variant="outline"
            onClick={() => handleExport('csv')}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button 
            variant="ghost"
            onClick={downloadTemplate}
            className="text-gray-600"
          >
            <Download className="h-4 w-4 mr-2" />
            Plantilla
          </Button>
        </div>
      </div>

      {/* Filtros Mejorados */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Barra de búsqueda principal */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Buscar por nombre, apellidos o CURP..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 text-base"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowResumen(v => !v)}
                className="flex items-center gap-2 text-indigo-700 border-indigo-200"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {showResumen ? 'Ocultar resumen' : 'Ver resumen'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                {showAdvancedFilters ? 'Ocultar filtros' : 'Más filtros'}
              </Button>
            </div>

            {/* Filtros predefinidos inteligentes */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700">Filtros rápidos</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedStatus === "all" && selectedCicloEscolar === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => aplicarFiltroPredefinido('todos')}
                  className="text-xs"
                >
                  <Users className="h-3 w-3 mr-1" />
                  Todos los estudiantes
                </Button>
                <Button
                  variant={selectedStatus === "activo" && selectedCicloEscolar === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => aplicarFiltroPredefinido('activos')}
                  className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                >
                  <UserCheck className="h-3 w-3 mr-1" />
                  Solo activos
                </Button>
                <Button
                  variant={selectedStatus === "activo" && selectedCicloEscolar === "2024-2025" ? "default" : "outline"}
                  size="sm"
                  onClick={() => aplicarFiltroPredefinido('nuevos')}
                  className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nuevos ingresos
                </Button>
                <Button
                  variant={selectedStatus === "pendiente" ? "default" : "outline"}
                  size="sm"
                  onClick={() => aplicarFiltroPredefinido('pendientes')}
                  className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Pendientes documentos
                </Button>
                {/* Selector de estatus inline */}
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="h-8 w-36 text-xs border rounded-full px-3 bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100">
                    <SelectValue placeholder="Estatus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Estatus</SelectItem>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="suspendido">Suspendido</SelectItem>
                    <SelectItem value="egresado">Egresado</SelectItem>
                    <SelectItem value="becado">Becado</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fila 1 — Filtros temporales: Ciclo + Período */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ciclo Escolar</Label>
                <Select value={selectedCicloEscolar} onValueChange={setSelectedCicloEscolar}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos los ciclos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los ciclos</SelectItem>
                    {ciclosEscolares.sort().reverse().map((ciclo) => (
                      <SelectItem key={ciclo} value={ciclo}>{ciclo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Período</Label>
                <Select value={selectedPeriodoEstudiantes} onValueChange={setSelectedPeriodoEstudiantes}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todo el tiempo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo el tiempo</SelectItem>
                    <SelectItem value="hoy">Hoy</SelectItem>
                    <SelectItem value="semana">Esta semana</SelectItem>
                    <SelectItem value="mes">Este mes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fila 2 — Filtros académicos: Nivel · Grado · Grupo · Estatus · CP */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nivel</Label>
                <Select value={selectedSeccion} onValueChange={setSelectedSeccion}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos los niveles" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las secciones</SelectItem>
                    {secciones.map((seccion) => (
                      <SelectItem key={seccion} value={seccion}>{seccion}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Grado</Label>
                <Select value={selectedGrado} onValueChange={setSelectedGrado}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos los grados" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los grados</SelectItem>
                    {Object.entries(gradosPorSeccion).map(([seccion, gradosSeccion]) => (
                      <div key={seccion}>
                        <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase bg-gray-100 sticky top-0">{seccion}</div>
                        {gradosSeccion.map((grado) => (
                          <SelectItem key={grado} value={grado} className="pl-4">{grado}</SelectItem>
                        ))}
                      </div>
                    ))}
                    {gradosBD.filter(g => !gradosEducativos.includes(g)).length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase bg-gray-100 sticky top-0">Otros</div>
                        {gradosBD.filter(g => !gradosEducativos.includes(g)).map((g) => (
                          <SelectItem key={g} value={g} className="pl-4">{g}</SelectItem>
                        ))}
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Grupo</Label>
                <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos los grupos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los grupos</SelectItem>
                    {grupos.sort().map((grupo) => (
                      <SelectItem key={grupo} value={grupo}>Grupo {grupo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estatus</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos los estatus" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estatus</SelectItem>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                    <SelectItem value="suspendido">Suspendido</SelectItem>
                    <SelectItem value="egresado">Egresado</SelectItem>
                    {statusOptions.filter(s => !['activo','inactivo','suspendido','egresado'].includes(s)).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Código Postal</Label>
                <Select value={selectedCodigoPostal} onValueChange={setSelectedCodigoPostal}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todas las zonas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las zonas</SelectItem>
                    {codigosPostales.sort().map((cp) => (
                      <SelectItem key={cp} value={cp}>CP {cp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Filtros avanzados (expandibles) */}
            {showAdvancedFilters && (
              <div className="border-t pt-4 mt-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {/* Edad — 5 a 20 años */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Edad</Label>
                    <Select value={selectedEdadRango} onValueChange={setSelectedEdadRango}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Todas las edades" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las edades</SelectItem>
                        {rangoEdadOptions.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sexo */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sexo</Label>
                    <Select value={selectedSexo} onValueChange={setSelectedSexo}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="masculino">M — Masculino</SelectItem>
                        <SelectItem value="femenino">F — Femenino</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Originario — estados de la república */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Originario</Label>
                    <Select value={selectedExtranjero} onValueChange={setSelectedExtranjero}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="all">Todos</SelectItem>
                        {["Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Ciudad de México","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","Estado de México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas","Otro"].map(e => (
                          <SelectItem key={e} value={e}>{e}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Nacionalidad — todos los países */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nacionalidad</Label>
                    <Select value={selectedNacionalidad} onValueChange={setSelectedNacionalidad}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value="all">Todas</SelectItem>
                        {["Afgana","Albanesa","Alemana","Andorrana","Angoleña","Antiguense","Árabe Saudí","Argelina","Argentina","Armenia","Australiana","Austriaca","Azerbaiyana","Bahameña","Bareiní","Bangladesí","Barbadense","Belga","Beliceña","Beninesa","Bielorrusa","Birmana","Boliviana","Bosnia","Botsuanesa","Brasileña","Bruneiense","Búlgara","Burkinesa","Burundesa","Butanesa","Caboverdiana","Camboyense","Camerunesa","Canadiense","Catarí","Chadiana","Chilena","China","Chipriota","Colombiana","Comorense","Congolesa","Costarricense","Croata","Cubana","Danesa","Dominicana","Ecuatoguineana","Ecuatoriana","Egipcia","Salvadoreña","Eritrea","Eslovaca","Eslovena","Española","Estadounidense","Estonia","Etíope","Fiyiana","Filipina","Finlandesa","Francesa","Gabonesa","Gambiana","Georgiana","Ghanesa","Granadina","Griega","Guatemalteca","Guineana","Guineana Bissau","Guyanesa","Haitiana","Hondureña","Húngara","India","Indonesia","Iraní","Iraquí","Irlandesa","Islandesa","Israelí","Italiana","Jamaicana","Japonesa","Jordana","Kazaja","Keniata","Kirguís","Kiribatiana","Kuwaití","Laosiana","Lesotense","Letona","Libanesa","Liberiana","Libia","Liechtensteiniana","Lituana","Luxemburguesa","Macedoniana","Malgache","Malasia","Malaui","Maldiva","Maliense","Maltesa","Marfileña","Marroquí","Mauriciana","Mauritana","Mexicana","Moldava","Monegasca","Mongola","Montenegrina","Mozambiqueña","Namibia","Nauruana","Nepalesa","Nicaragüense","Nigerina","Nigeriana","Noruega","Neozelandesa","Omaní","Pakistaní","Palauana","Palestina","Panameña","Papú","Paraguaya","Peruana","Polaca","Portuguesa","Ruandesa","Rumana","Rusa","Samoana","Santa Lucense","Santotomense","Senegalesa","Serbia","Seychellense","Sierraleonesa","Singapurense","Siria","Somalí","Sudafricana","Sudanesa","Sueca","Suiza","Surinamesa","Suazilandia","Tayika","Tailandesa","Tanzana","Timorense","Togolesa","Tongana","Trinitense","Tunecina","Turca","Turkmena","Tuvaluana","Ugandesa","Ucraniana","Uruguaya","Uzbeka","Vanuatense","Venezolana","Vietnamita","Yemení","Yibutiana","Zambiana","Zimbabuense"].map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Idioma natal — top 10 mundial */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Idioma natal</Label>
                    <Select value={selectedIdioma} onValueChange={setSelectedIdioma}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="Español">Español</SelectItem>
                        <SelectItem value="Inglés">Inglés</SelectItem>
                        <SelectItem value="Mandarín">Mandarín (Chino)</SelectItem>
                        <SelectItem value="Hindi">Hindi</SelectItem>
                        <SelectItem value="Árabe">Árabe</SelectItem>
                        <SelectItem value="Bengalí">Bengalí</SelectItem>
                        <SelectItem value="Portugués">Portugués</SelectItem>
                        <SelectItem value="Ruso">Ruso</SelectItem>
                        <SelectItem value="Japonés">Japonés</SelectItem>
                        <SelectItem value="Punjabi">Punjabi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Habla dialecto */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Habla dialecto</Label>
                    <Select value={selectedDialecto} onValueChange={setSelectedDialecto}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="si">Sí</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Necesidades específicas */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Necesidades específicas</Label>
                    <Select value={selectedNecesidades} onValueChange={setSelectedNecesidades}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="si">Con necesidades</SelectItem>
                        <SelectItem value="no">Sin necesidades</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Repetidor */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Repetidor de grado</Label>
                    <Select value={selectedRepetidor} onValueChange={setSelectedRepetidor}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="si">Sí, repite grado</SelectItem>
                        <SelectItem value="no">No repite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Acciones */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Acciones rápidas</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="text-xs"
                        onClick={() => {
                          setSearchTerm(""); setSelectedGrado("all"); setSelectedGrupo("all");
                          setSelectedSeccion("all"); setSelectedCicloEscolar("all");
                          setSelectedStatus("all"); setSelectedCodigoPostal("all");
                          setSelectedEdadRango("all"); setSelectedSexo("all");
                          setSelectedExtranjero("all"); setSelectedNacionalidad("all");
                          setSelectedIdioma("all"); setSelectedNecesidades("all");
                          setSelectedRepetidor("all"); setSelectedDialecto("all");
                          setSelectedPeriodoEstudiantes("all");
                        }}>
                        Limpiar filtros
                      </Button>
                      <Button variant="outline" size="sm"
                        className="text-xs text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
                        onClick={() => setShowResumen(v => !v)}>
                        {showResumen ? "Ocultar resumen" : "Ver resumen"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resumen de filtros activos */}
            {(searchTerm || selectedGrado !== "all" || selectedGrupo !== "all" || selectedSeccion !== "all" || selectedCicloEscolar !== "all" || selectedStatus !== "all" || selectedCodigoPostal !== "all" || selectedEdadRango !== "all") && (
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 p-2 rounded-md">
                <span className="font-medium">Filtros activos:</span>
                {searchTerm && <Badge variant="secondary">Búsqueda: {searchTerm}</Badge>}
                {selectedSeccion !== "all" && <Badge variant="secondary">Sección: {selectedSeccion}</Badge>}
                {selectedGrado !== "all" && <Badge variant="secondary">Grado: {selectedGrado}</Badge>}
                {selectedGrupo !== "all" && <Badge variant="secondary">Grupo: {selectedGrupo}</Badge>}
                {selectedCicloEscolar !== "all" && <Badge variant="secondary">Ciclo: {selectedCicloEscolar}</Badge>}
                {selectedStatus !== "all" && <Badge variant="secondary">Estatus: {selectedStatus}</Badge>}
                {selectedCodigoPostal !== "all" && <Badge variant="secondary">CP: {selectedCodigoPostal}</Badge>}
                {selectedEdadRango !== "all" && <Badge variant="secondary">Edad: {rangoEdadOptions.find(r => r.value === selectedEdadRango)?.label}</Badge>}
                <span className="ml-auto font-medium text-blue-600">
                  {filteredEstudiantes.length} de {estudiantes.length} estudiantes
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Resumen estadístico ────────────────────────────────────────────── */}
      {hasActiveSearch && showResumen && (() => {
        const d = buildResumenData();
        const StatTable = ({ title, rows }: { title: string; rows: [string, number][] }) => (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</p>
            <table className="w-full text-xs">
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-100 last:border-0">
                    <td className="py-1 text-gray-600">{k}</td>
                    <td className="py-1 text-right font-semibold text-gray-800">{v}</td>
                    <td className="py-1 pl-2 w-24">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((v / d.total) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        return (
          <Card className="border-indigo-100 bg-indigo-50/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base text-indigo-900">Resumen estadístico</CardTitle>
                  <p className="text-xs text-indigo-600 mt-0.5">
                    {d.total > 0 ? `${d.total} alumno(s) con los filtros actuales` : 'Sin coincidencias para los filtros seleccionados'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs border-green-300 text-green-700 bg-white hover:bg-green-50" onClick={exportResumenExcel} disabled={d.total === 0}>
                    <FileSpreadsheet className="h-3 w-3 mr-1" /> Exportar Excel
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs border-red-300 text-red-700 bg-white hover:bg-red-50" onClick={exportResumenPDF} disabled={d.total === 0}>
                    <Download className="h-3 w-3 mr-1" /> Exportar PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {d.total === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-3">
                    <Search className="h-6 w-6 text-indigo-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">No hay alumnos que coincidan</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs">
                    Prueba cambiando o quitando algún filtro para ver resultados y su desglose estadístico.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                  <StatTable title="Nivel escolar" rows={d.porNivel} />
                  <StatTable title="Estatus" rows={d.porEstatus} />
                  <StatTable title="Sexo" rows={d.porSexo} />
                  <StatTable title="Origen" rows={d.porOrigen.map(r => [r.label, r.count] as [string, number])} />
                  <StatTable title="Rango de edad" rows={d.porEdad.filter(r => r.count > 0).map(r => [r.label, r.count] as [string, number])} />
                  {d.porNacionalidad.length > 0 && <StatTable title="Nacionalidad" rows={d.porNacionalidad} />}
                  {d.porIdioma.length > 0 && <StatTable title="Idioma natal" rows={d.porIdioma} />}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Indicadores</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-gray-600">Con necesidades esp.</span><span className="font-semibold text-orange-700">{d.conNecesidades}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Repetidores de grado</span><span className="font-semibold text-red-700">{d.repetidores}</span></div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Lista de estudiantes */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Cargando estudiantes...</span>
        </div>
      ) : !hasActiveSearch ? (
        /* Estado vacío inicial — sin búsqueda ni filtro activo */
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">
              Busca un estudiante
            </h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">
              Ingresa un nombre, apellido o CURP en el buscador, o usa los filtros rápidos para ver resultados.
            </p>
          </CardContent>
        </Card>
      ) : filteredEstudiantes.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {estudiantes.length === 0 ? 'No hay estudiantes registrados' : 'Sin resultados'}
            </h3>
            <p className="text-gray-600 mb-4">
              {estudiantes.length === 0
                ? 'Agrega el primer estudiante para comenzar.'
                : 'Ningún alumno coincide con los filtros aplicados.'}
            </p>
            {estudiantes.length === 0 && (
              <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Agregar primer estudiante
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredEstudiantes.map((estudiante: any) => (
            <Card key={estudiante.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-sm">
                        {estudiante.nombre_completo?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {estudiante.nombre_completo}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {estudiante.grado} {estudiante.grupo ? `• CURP: ${estudiante.curp}` : ''}
                      </p>
                      <p className="text-sm text-gray-500">
                        Responsable: {estudiante.responsable} • {estudiante.telefono}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold text-green-600">
                        ${((estudiante.saldo_pendiente || 0) / 100).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">Saldo pendiente</p>
                    </div>

                    <Badge 
                      variant={estudiante.status === 'activo' ? 'default' : 
                               estudiante.status === 'becado' ? 'secondary' : 'outline'}
                    >
                      {estudiante.status}
                    </Badge>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadStudentForView(estudiante)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadStudentForEdit(estudiante)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Modal de vista del estudiante con gestión de tutores ────────────── */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              {viewingStudent?.nombre_completo}
            </DialogTitle>
            <DialogDescription>
              {viewingStudent?.grado} {viewingStudent?.grupo ? `· Grupo ${viewingStudent.grupo}` : ""}
              {viewingStudent?.nivel_escolar ? ` · ${viewingStudent.nivel_escolar}` : ""}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="tutores">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="datos">Datos del alumno</TabsTrigger>
              <TabsTrigger value="tutores">Tutores y pago</TabsTrigger>
            </TabsList>

            {/* ── Pestaña datos ─────────────────────────────────────────────── */}
            <TabsContent value="datos" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["CURP",       viewingStudent?.curp],
                  ["Correo institucional", viewingStudent?.correo_institucional],
                  ["Fecha de nacimiento", viewingStudent?.fecha_nacimiento],
                  ["Tipo de sangre",      viewingStudent?.tipo_sangre],
                  ["Turno",              viewingStudent?.turno],
                  ["Estatus",            viewingStudent?.status],
                ].map(([label, val]) => val ? (
                  <div key={label as string} className="bg-gray-50 rounded p-3">
                    <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                    <div className="font-medium">{val}</div>
                  </div>
                ) : null)}
              </div>
            </TabsContent>

            {/* ── Pestaña tutores ────────────────────────────────────────────── */}
            <TabsContent value="tutores" className="mt-4">
              <TutoresPanel
                studentId={viewingStudent?.id}
                isOpen={showViewModal}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ── Modal de edición del alumno ─────────────────────────────────────── */}
      <Dialog open={showEditModal} onOpenChange={(open) => { if (!open) { setShowEditModal(false); setEditingStudent(null); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar alumno
            </DialogTitle>
            <DialogDescription>
              {editingStudent?.nombre_completo}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Nombre */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Nombre(s) *</Label>
                <Input value={formData.estudiante_nombres} onChange={e => handleInputChange('estudiante_nombres', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Apellido paterno</Label>
                <Input value={formData.estudiante_apellido_paterno} onChange={e => handleInputChange('estudiante_apellido_paterno', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Apellido materno</Label>
                <Input value={formData.estudiante_apellido_materno} onChange={e => handleInputChange('estudiante_apellido_materno', e.target.value)} />
              </div>
            </div>

            {/* CURP y fecha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CURP</Label>
                <Input value={formData.estudiante_curp} onChange={e => handleInputChange('estudiante_curp', e.target.value)} maxLength={18} placeholder="18 caracteres" />
              </div>
              <div className="space-y-1">
                <Label>Fecha de nacimiento</Label>
                <Input type="date" value={formData.estudiante_fecha_nacimiento} onChange={e => handleInputChange('estudiante_fecha_nacimiento', e.target.value)} />
              </div>
            </div>

            {/* Nivel, grado, grupo, turno */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>Nivel</Label>
                <Select value={formData.estudiante_nivel_escolar} onValueChange={v => handleInputChange('estudiante_nivel_escolar', v)}>
                  <SelectTrigger><SelectValue placeholder="Nivel" /></SelectTrigger>
                  <SelectContent>
                    {['Kinder','Primaria','Secundaria','Preparatoria'].map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Grado</Label>
                <Input value={formData.estudiante_grado} onChange={e => handleInputChange('estudiante_grado', e.target.value)} placeholder="Ej: 3° Primaria" />
              </div>
              <div className="space-y-1">
                <Label>Grupo</Label>
                <Input value={formData.estudiante_grupo} onChange={e => handleInputChange('estudiante_grupo', e.target.value)} placeholder="Ej: A" />
              </div>
              <div className="space-y-1">
                <Label>Turno</Label>
                <Select value={formData.estudiante_turno} onValueChange={v => handleInputChange('estudiante_turno', v)}>
                  <SelectTrigger><SelectValue placeholder="Turno" /></SelectTrigger>
                  <SelectContent>
                    {['Matutino','Vespertino','Mixto'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Correo y estatus */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Correo institucional</Label>
                <Input type="email" value={formData.estudiante_correo_institucional} onChange={e => handleInputChange('estudiante_correo_institucional', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Estatus</Label>
                <Select value={formData.status} onValueChange={v => handleInputChange('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['activo','baja','suspendido','egresado','becado','pendiente'].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => { setShowEditModal(false); setEditingStudent(null); }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editingStudent) return;
                updateStudentMutation.mutate({
                  id: editingStudent.id,
                  data: {
                    nombres:               formData.estudiante_nombres,
                    apellido_paterno:      formData.estudiante_apellido_paterno,
                    apellido_materno:      formData.estudiante_apellido_materno,
                    curp:                  formData.estudiante_curp,
                    fecha_nacimiento:      formData.estudiante_fecha_nacimiento || null,
                    correo_institucional:  formData.estudiante_correo_institucional,
                    nivel_escolar:         formData.estudiante_nivel_escolar,
                    grado:                 formData.estudiante_grado,
                    grupo:                 formData.estudiante_grupo,
                    turno:                 formData.estudiante_turno,
                    status:                formData.status,
                  },
                });
              }}
              disabled={updateStudentMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateStudentMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
              ) : 'Guardar cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para agregar estudiante */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar nuevo estudiante</DialogTitle>
            <DialogDescription>
              Completa la información del estudiante. Los campos marcados con * son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* SECCIÓN: PADRE DE FAMILIA (Columnas 1-7 Excel) */}
            <div className="bg-blue-50 p-4 rounded-lg space-y-4">
              <h3 className="font-semibold text-blue-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                PADRE DE FAMILIA
              </h3>
              
              <div className="space-y-4">
                {/* Credenciales del Padre */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-blue-100 rounded">
                  <div>
                    <Label htmlFor="padre_id_referencia">ID de Reference Padre *</Label>
                    <Input
                      id="padre_id_referencia"
                      value={formData.padre_id_referencia}
                      onChange={(e) => handleInputChange('padre_id_referencia', e.target.value)}
                      placeholder="Ej: PAD-2024-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_username">Usuario del padre *</Label>
                    <Input
                      id="padre_username"
                      value={formData.padre_username}
                      onChange={(e) => handleInputChange('padre_username', e.target.value)}
                      placeholder="Ej: juan.perez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_password">Contraseña del padre *</Label>
                    <Input
                      id="padre_password"
                      type="password"
                      value={formData.padre_password}
                      onChange={(e) => handleInputChange('padre_password', e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="padre_correo_institucional_familiar">Correo institucional familiar *</Label>
                  <Input
                    id="padre_correo_institucional_familiar"
                    type="email"
                    value={formData.padre_correo_institucional_familiar}
                    onChange={(e) => handleInputChange('padre_correo_institucional_familiar', e.target.value)}
                    placeholder="Ej: padre.juan@institutojfr.edu.mx"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="padre_nombres">Nombre(s) *</Label>
                    <Input
                      id="padre_nombres"
                      value={formData.padre_nombres}
                      onChange={(e) => handleInputChange('padre_nombres', e.target.value)}
                      placeholder="Ej: Juan Carlos"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_apellido_paterno">Apellido paterno *</Label>
                    <Input
                      id="padre_apellido_paterno"
                      value={formData.padre_apellido_paterno}
                      onChange={(e) => handleInputChange('padre_apellido_paterno', e.target.value)}
                      placeholder="Ej: Pérez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_apellido_materno">Apellido Materno</Label>
                    <Input
                      id="padre_apellido_materno"
                      value={formData.padre_apellido_materno}
                      onChange={(e) => handleInputChange('padre_apellido_materno', e.target.value)}
                      placeholder="Ej: García"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="padre_curp">CURP del Padre</Label>
                    <Input
                      id="padre_curp"
                      value={formData.padre_curp}
                      onChange={(e) => handleInputChange('padre_curp', e.target.value.toUpperCase())}
                      placeholder="Ej: PEGJ800515HDFRRN09"
                      maxLength={18}
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_celular">Celular *</Label>
                    <Input
                      id="padre_celular"
                      value={formData.padre_celular}
                      onChange={(e) => handleInputChange('padre_celular', e.target.value)}
                      placeholder="Ej: 5551234567"
                    />
                  </div>
                  <div>
                    <Label htmlFor="padre_telefono_casa_oficina">Teléfono casa/oficina</Label>
                    <Input
                      id="padre_telefono_casa_oficina"
                      value={formData.padre_telefono_casa_oficina}
                      onChange={(e) => handleInputChange('padre_telefono_casa_oficina', e.target.value)}
                      placeholder="Ej: 5587654321"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* SECCIÓN: MADRE DE FAMILIA */}
            <div className="bg-pink-50 p-4 rounded-lg space-y-4">
              <h3 className="font-semibold text-pink-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-pink-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                MADRE DE FAMILIA
              </h3>
              
              <div className="space-y-4">
                {/* Credenciales de la Madre */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-pink-100 rounded">
                  <div>
                    <Label htmlFor="madre_id_referencia">ID de Reference Madre *</Label>
                    <Input
                      id="madre_id_referencia"
                      value={formData.madre_id_referencia}
                      onChange={(e) => handleInputChange('madre_id_referencia', e.target.value)}
                      placeholder="Ej: MAD-2024-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="madre_username">Usuario de la madre *</Label>
                    <Input
                      id="madre_username"
                      value={formData.madre_username}
                      onChange={(e) => handleInputChange('madre_username', e.target.value)}
                      placeholder="Ej: ana.martinez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="madre_password">Contraseña de la madre *</Label>
                    <Input
                      id="madre_password"
                      type="password"
                      value={formData.madre_password}
                      onChange={(e) => handleInputChange('madre_password', e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="madre_correo_institucional_familiar">Correo institucional familiar</Label>
                  <Input
                    id="madre_correo_institucional_familiar"
                    type="email"
                    value={formData.madre_correo_institucional_familiar}
                    onChange={(e) => handleInputChange('madre_correo_institucional_familiar', e.target.value)}
                    placeholder="Ej: madre.ana@institutojfr.edu.mx"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="madre_nombres">Nombre(s)</Label>
                    <Input
                      id="madre_nombres"
                      value={formData.madre_nombres}
                      onChange={(e) => handleInputChange('madre_nombres', e.target.value)}
                      placeholder="Ej: Ana Cristina"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="madre_apellido_paterno">Apellido paterno</Label>
                    <Input
                      id="madre_apellido_paterno"
                      value={formData.madre_apellido_paterno}
                      onChange={(e) => handleInputChange('madre_apellido_paterno', e.target.value)}
                      placeholder="Ej: Martínez"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="madre_apellido_materno">Apellido Materno</Label>
                    <Input
                      id="madre_apellido_materno"
                      value={formData.madre_apellido_materno}
                      onChange={(e) => handleInputChange('madre_apellido_materno', e.target.value)}
                      placeholder="Ej: Hernández"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="madre_curp">CURP de la Madre</Label>
                    <Input
                      id="madre_curp"
                      value={formData.madre_curp}
                      onChange={(e) => handleInputChange('madre_curp', e.target.value.toUpperCase())}
                      placeholder="Ej: MAHA750820MDFRRR05"
                      maxLength={18}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="madre_celular">Celular</Label>
                    <Input
                      id="madre_celular"
                      value={formData.madre_celular}
                      onChange={(e) => handleInputChange('madre_celular', e.target.value)}
                      placeholder="Ej: 5559876543"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="madre_telefono_casa_oficina">Teléfono casa/oficina</Label>
                    <Input
                      id="madre_telefono_casa_oficina"
                      value={formData.madre_telefono_casa_oficina}
                      onChange={(e) => handleInputChange('madre_telefono_casa_oficina', e.target.value)}
                      placeholder="Ej: 5512345678"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SECCIÓN: ESTUDIANTE (Columnas 8-20 Excel) */}
            <div className="bg-green-50 p-4 rounded-lg space-y-4">
              <h3 className="font-semibold text-green-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                ESTUDIANTE
              </h3>
              
              <div className="space-y-4">
                {/* Credenciales del Estudiante */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-green-100 rounded">
                  <div>
                    <Label htmlFor="estudiante_id_referencia">ID de Reference Estudiante *</Label>
                    <Input
                      id="estudiante_id_referencia"
                      value={formData.estudiante_id_referencia}
                      onChange={(e) => handleInputChange('estudiante_id_referencia', e.target.value)}
                      placeholder="Ej: EST-2024-001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_username">Usuario del estudiante *</Label>
                    <Input
                      id="estudiante_username"
                      value={formData.estudiante_username}
                      onChange={(e) => handleInputChange('estudiante_username', e.target.value)}
                      placeholder="Ej: maria.perez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_password">Contraseña del estudiante *</Label>
                    <Input
                      id="estudiante_password"
                      type="password"
                      value={formData.estudiante_password}
                      onChange={(e) => handleInputChange('estudiante_password', e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="estudiante_nombres">Nombre(s) *</Label>
                    <Input
                      id="estudiante_nombres"
                      value={formData.estudiante_nombres}
                      onChange={(e) => handleInputChange('estudiante_nombres', e.target.value)}
                      placeholder="Ej: María Fernanda"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_apellido_paterno">Apellido paterno *</Label>
                    <Input
                      id="estudiante_apellido_paterno"
                      value={formData.estudiante_apellido_paterno}
                      onChange={(e) => handleInputChange('estudiante_apellido_paterno', e.target.value)}
                      placeholder="Ej: Pérez"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_apellido_materno">Apellido Materno</Label>
                    <Input
                      id="estudiante_apellido_materno"
                      value={formData.estudiante_apellido_materno}
                      onChange={(e) => handleInputChange('estudiante_apellido_materno', e.target.value)}
                      placeholder="Ej: López"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="estudiante_curp">CURP *</Label>
                    <Input
                      id="estudiante_curp"
                      value={formData.estudiante_curp}
                      onChange={(e) => handleInputChange('estudiante_curp', e.target.value.toUpperCase())}
                      placeholder="Ej: PELM120101MDFRRR08"
                      maxLength={18}
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_fecha_nacimiento">Fecha de nacimiento (DD/MM/YYYY) *</Label>
                    <Input
                      id="estudiante_fecha_nacimiento"
                      type="date"
                      value={formData.estudiante_fecha_nacimiento}
                      onChange={(e) => handleInputChange('estudiante_fecha_nacimiento', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_tipo_sangre">Tipo de Sangre</Label>
                    <Select value={formData.estudiante_tipo_sangre} onValueChange={(value) => handleInputChange('estudiante_tipo_sangre', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="O+">O+</SelectItem>
                        <SelectItem value="O-">O-</SelectItem>
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estudiante_correo_institucional">Correo institucional</Label>
                    <Input
                      id="estudiante_correo_institucional"
                      type="email"
                      value={formData.estudiante_correo_institucional}
                      onChange={(e) => handleInputChange('estudiante_correo_institucional', e.target.value)}
                      placeholder="Ej: maria.perez@institutojfr.edu.mx"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_nivel_escolar">Nivel escolar *</Label>
                    <Select value={formData.estudiante_nivel_escolar} onValueChange={(value) => handleInputChange('estudiante_nivel_escolar', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar nivel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Kinder">Kinder</SelectItem>
                        <SelectItem value="Primaria">Primaria</SelectItem>
                        <SelectItem value="Secundaria">Secundaria</SelectItem>
                        <SelectItem value="Preparatoria">Preparatoria</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estudiante_clave_centro_trabajo">Clave del centro de Trabajo</Label>
                    <Input
                      id="estudiante_clave_centro_trabajo"
                      value={formData.estudiante_clave_centro_trabajo}
                      onChange={(e) => handleInputChange('estudiante_clave_centro_trabajo', e.target.value)}
                      placeholder="Ej: 09DPR0001X"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estudiante_turno">Turno</Label>
                    <Select value={formData.estudiante_turno} onValueChange={(value) => handleInputChange('estudiante_turno', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar turno" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Matutino">Matutino</SelectItem>
                        <SelectItem value="Vespertino">Vespertino</SelectItem>
                        <SelectItem value="Tiempo Completo">Tiempo Completo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estudiante_grado">Grado *</Label>
                    <Select value={formData.estudiante_grado} onValueChange={(value) => handleInputChange('estudiante_grado', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar grado" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(gradosPorSeccion).map(([seccion, grados]) => (
                          <div key={seccion}>
                            <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase bg-gray-100 sticky top-0">
                              {seccion}
                            </div>
                            {grados.map((grado) => (
                              <SelectItem key={grado} value={grado} className="pl-4">
                                {grado}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="estudiante_grupo">Grupo *</Label>
                    <Select value={formData.estudiante_grupo} onValueChange={(value) => handleInputChange('estudiante_grupo', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar grupo" />
                      </SelectTrigger>
                      <SelectContent>
                        {gruposEducativos.map((grupo) => (
                          <SelectItem key={grupo} value={grupo}>Grupo {grupo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* SECCIÓN: DIRECCIÓN FAMILIAR (Nueva Ficha Técnica) */}
            <div className="bg-orange-50 p-4 rounded-lg space-y-4">
              <h3 className="font-semibold text-orange-800 flex items-center gap-2">
                <span className="w-6 h-6 bg-orange-600 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                DIRECCIÓN FAMILIAR
              </h3>
              
              <div className="space-y-4">
                <div className="p-3 bg-orange-100 rounded">
                  <p className="text-xs text-orange-700 mb-3">
                    📍 Información del domicilio familiar para análisis geográfico y zona de procedencia
                  </p>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="direccion_calle">Calle y número *</Label>
                      <Input
                        id="direccion_calle"
                        value={formData.direccion_calle}
                        onChange={(e) => handleInputChange('direccion_calle', e.target.value)}
                        placeholder="Ej: Av. Benito Juárez #123"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <Label htmlFor="direccion_colonia">Colonia/Fraccionamiento *</Label>
                      <Input
                        id="direccion_colonia"
                        value={formData.direccion_colonia}
                        onChange={(e) => handleInputChange('direccion_colonia', e.target.value)}
                        placeholder="Ej: Centro"
                      />
                    </div>
                    <div>
                      <Label htmlFor="direccion_codigo_postal">Código Postal *</Label>
                      <Input
                        id="direccion_codigo_postal"
                        value={formData.direccion_codigo_postal}
                        onChange={(e) => handleInputChange('direccion_codigo_postal', e.target.value)}
                        placeholder="Ej: 77500"
                        maxLength={5}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <Label htmlFor="direccion_ciudad">Ciudad/Municipio *</Label>
                      <Input
                        id="direccion_ciudad"
                        value={formData.direccion_ciudad}
                        onChange={(e) => handleInputChange('direccion_ciudad', e.target.value)}
                        placeholder="Ej: Comalcalco"
                      />
                    </div>
                    <div>
                      <Label htmlFor="direccion_estado">Estado *</Label>
                      <Select value={formData.direccion_estado} onValueChange={(value) => handleInputChange('direccion_estado', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Aguascalientes">Aguascalientes</SelectItem>
                          <SelectItem value="Baja California">Baja California</SelectItem>
                          <SelectItem value="Baja California Sur">Baja California Sur</SelectItem>
                          <SelectItem value="Campeche">Campeche</SelectItem>
                          <SelectItem value="Chiapas">Chiapas</SelectItem>
                          <SelectItem value="Chihuahua">Chihuahua</SelectItem>
                          <SelectItem value="Ciudad de México">Ciudad de México</SelectItem>
                          <SelectItem value="Coahuila">Coahuila</SelectItem>
                          <SelectItem value="Colima">Colima</SelectItem>
                          <SelectItem value="Durango">Durango</SelectItem>
                          <SelectItem value="Estado de México">Estado de México</SelectItem>
                          <SelectItem value="Guanajuato">Guanajuato</SelectItem>
                          <SelectItem value="Guerrero">Guerrero</SelectItem>
                          <SelectItem value="Hidalgo">Hidalgo</SelectItem>
                          <SelectItem value="Jalisco">Jalisco</SelectItem>
                          <SelectItem value="Michoacán">Michoacán</SelectItem>
                          <SelectItem value="Morelos">Morelos</SelectItem>
                          <SelectItem value="Nayarit">Nayarit</SelectItem>
                          <SelectItem value="Nuevo León">Nuevo León</SelectItem>
                          <SelectItem value="Oaxaca">Oaxaca</SelectItem>
                          <SelectItem value="Puebla">Puebla</SelectItem>
                          <SelectItem value="Querétaro">Querétaro</SelectItem>
                          <SelectItem value="Quintana Roo">Quintana Roo</SelectItem>
                          <SelectItem value="San Luis Potosí">San Luis Potosí</SelectItem>
                          <SelectItem value="Sinaloa">Sinaloa</SelectItem>
                          <SelectItem value="Sonora">Sonora</SelectItem>
                          <SelectItem value="Tabasco">Tabasco</SelectItem>
                          <SelectItem value="Tamaulipas">Tamaulipas</SelectItem>
                          <SelectItem value="Tlaxcala">Tlaxcala</SelectItem>
                          <SelectItem value="Veracruz">Veracruz</SelectItem>
                          <SelectItem value="Yucatán">Yucatán</SelectItem>
                          <SelectItem value="Zacatecas">Zacatecas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                const studentData = {
                  ...formData,
                  nombre_completo: combineNames(formData.estudiante_nombres, formData.estudiante_apellido_paterno, formData.estudiante_apellido_materno)
                };
                createStudentMutation.mutate(studentData);
              }}
              disabled={createStudentMutation.isPending}
            >
              {createStudentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Agregar estudiante'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Input oculto para selección de archivos */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Modal de confirmación de importación */}
      {importFile && (
        <Dialog open={!!importFile} onOpenChange={() => {setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = '';}}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar importación</DialogTitle>
              <DialogDescription>
                ¿Deseas importar el archivo "{importFile.name}"?
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Formato esperado:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <strong>Nombre Completo</strong> (requerido)</li>
                  <li>• <strong>CURP</strong> (opcional, debe tener 18 caracteres)</li>
                  <li>• <strong>Grado</strong> (opcional)</li>
                  <li>• <strong>Grupo</strong> (opcional)</li>
                  <li>• <strong>Estatus</strong> (opcional, por defecto: activo)</li>
                </ul>
              </div>
              
              {isImporting && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Procesando archivo...</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={() => {
                  setImportFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={isImporting}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleImport}
                disabled={isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  'Confirmar importación'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}