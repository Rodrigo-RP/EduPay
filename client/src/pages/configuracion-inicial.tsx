// Centro de Implementación — wizard guiado
// Pasos: escuela → alumnos → familias → becas → adeudos → validar → simular → activar
//
// Progreso derivado de DB (onboarding_steps_completados jsonb) — NO estado local.
// Los pasos de importación (alumnos/familias/becas/adeudos) solo se marcan completos
// si el import real devolvió successful >= 1 — nunca si todas las filas fallaron.
import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  CheckCircle, Circle, School, FileText, Users, Gift,
  Archive, ClipboardCheck, Play, Rocket, ArrowLeft, ArrowRight,
  ExternalLink, Download, Upload, AlertTriangle, AlertCircle,
  FileSpreadsheet, SkipForward, Loader2,
} from "lucide-react";

// ── Pasos del wizard ──────────────────────────────────────────────────────────

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: "escuela",  title: "Registro de la escuela",   description: "Nombre legal, RFC y datos fiscales",               icon: School         },
  { id: "alumnos",  title: "Importación de alumnos",   description: "Alumnos y responsables de pago",                   icon: FileText       },
  { id: "familias", title: "Familias y tutores",       description: "Grupos familiares y tutores legales",               icon: Users          },
  { id: "becas",    title: "Becas y descuentos",       description: "Asignación de apoyos económicos",                  icon: Gift           },
  { id: "adeudos",  title: "Adeudos migrados",         description: "Saldos pendientes de sistemas anteriores",         icon: Archive        },
  { id: "validar",  title: "Validación de datos",      description: "Revisión de consistencia antes de activar",        icon: ClipboardCheck },
  { id: "simular",  title: "Simulación de cargos",     description: "Vista previa de cargos que se generarán",          icon: Play           },
  { id: "activar",  title: "Activar plataforma",       description: "Confirmar configuración y abrir el sistema",       icon: Rocket         },
];

// Pasos que gestionan su propio botón de avance (no usan el botón exterior "Confirmar y continuar")
const SELF_MANAGED_STEP_IDS = new Set(["alumnos", "familias", "becas", "adeudos", "validar", "simular"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthToken() {
  return localStorage.getItem("auth_token") ?? "";
}

async function authFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function deriveInitialStep(steps: Record<string, boolean>): number {
  const first = WIZARD_STEPS.findIndex((s) => !steps[s.id]);
  return first === -1 ? WIZARD_STEPS.length - 1 : first;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ConfiguracionInicial() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data: onboardingStatus, isLoading } = useQuery<{
    completado: boolean;
    campus_id: number;
    steps: Record<string, boolean>;
  }>({
    queryKey: ["onboarding-status"],
    queryFn: () => authFetch("/api/admin/configuracion/onboarding-status"),
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (onboardingStatus && currentStep === null) {
      setCurrentStep(deriveInitialStep(onboardingStatus.steps ?? {}));
    }
  }, [onboardingStatus, currentStep]);

  const serverSteps: Record<string, boolean> = onboardingStatus?.steps ?? {};
  const completadoGlobal = onboardingStatus?.completado ?? false;

  async function markStepComplete(stepId: string): Promise<Record<string, boolean>> {
    const data = await authFetch(
      `/api/admin/configuracion/onboarding-step/${stepId}`,
      { method: "PATCH" }
    );
    const updated = data.steps as Record<string, boolean>;
    queryClient.setQueryData(["onboarding-status"], (old: any) => ({
      ...old,
      steps: updated,
    }));
    return updated;
  }

  function goBack() {
    setCurrentStep((s) => (s !== null && s > 0 ? s - 1 : s));
  }

  // Para pasos que no son de import (escuela, validar, simular, activar)
  async function handleConfirmStep() {
    if (currentStep === null) return;
    const step = WIZARD_STEPS[currentStep];
    setConfirming(true);
    try {
      await markStepComplete(step.id);
      if (currentStep < WIZARD_STEPS.length - 1) setCurrentStep(currentStep + 1);
    } catch {
      toast({ title: "Error", description: "No se pudo registrar el avance", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }

  // Llamado por ImportStep DESPUÉS de que ya hizo el PATCH internamente
  function handleImportAdvance() {
    if (currentStep !== null && currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  }

  async function handleActivar() {
    setConfirming(true);
    try {
      await markStepComplete("activar");
      const res = await fetch("/api/admin/configuracion/completar-onboarding", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      queryClient.setQueryData(["onboarding-status"], (old: any) => ({ ...old, completado: true }));
      toast({ title: "¡Plataforma activada!", description: "Su sistema está listo para recibir pagos." });
      navigate("/");
    } catch {
      toast({ title: "Error", description: "No se pudo activar la plataforma", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }

  if (isLoading || currentStep === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (completadoGlobal) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-2xl mx-auto text-center py-16">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Configuración completada</h1>
          <p className="text-slate-600 mb-6">Su plataforma está activa. Puede regresar al dashboard o revisar cualquier paso.</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate("/")} className="bg-green-600 hover:bg-green-700">Ir al dashboard</Button>
            <Button variant="outline" onClick={() => setCurrentStep(0)}>Revisar pasos</Button>
          </div>
        </div>
      </div>
    );
  }

  const step = WIZARD_STEPS[currentStep];
  const isSelfManagedStep = SELF_MANAGED_STEP_IDS.has(step.id);
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Centro de Implementación — Edupay</h1>
          <p className="text-slate-600">Su progreso se guarda automáticamente. Puede cerrar y retomar en cualquier momento.</p>
          <a href="/configuracion" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2">
            <ExternalLink className="w-3 h-3" />
            Configura tus conceptos de cobro aquí (Ajustes Institucionales)
          </a>
        </div>

        {/* Barra de progreso */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex items-start justify-between min-w-max gap-1 px-2">
            {WIZARD_STEPS.map((s, index) => {
              const Icon = s.icon;
              const isActive    = index === currentStep;
              const isCompleted = !!serverSteps[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => isCompleted ? setCurrentStep(index) : undefined}
                  disabled={!isCompleted && !isActive}
                  className={[
                    "flex flex-col items-center gap-1 px-2 py-1 rounded transition-colors min-w-[72px]",
                    isCompleted && !isActive ? "cursor-pointer hover:bg-green-50" : "cursor-default",
                    !isCompleted && !isActive ? "opacity-50" : "",
                  ].join(" ")}
                  title={isCompleted ? `Ir a: ${s.title}` : s.title}
                >
                  <div className={[
                    "w-10 h-10 rounded-full border-2 flex items-center justify-center",
                    isCompleted ? "bg-green-500 border-green-500 text-white" :
                    isActive    ? "bg-blue-500  border-blue-500  text-white" :
                                  "bg-white     border-gray-300  text-gray-400",
                  ].join(" ")}>
                    {isCompleted ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={[
                    "text-xs text-center leading-tight max-w-[68px]",
                    isActive    ? "font-semibold text-blue-700"  : "",
                    isCompleted ? "text-green-700"               : "",
                  ].join(" ")}>
                    {s.title}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 h-1 bg-gray-200 rounded mx-4">
            <div
              className="h-1 bg-green-500 rounded transition-all duration-300"
              style={{ width: `${(Object.values(serverSteps).filter(Boolean).length / WIZARD_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Paso activo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {React.createElement(step.icon, { className: "w-5 h-5" })}
              <span>Paso {currentStep + 1} de {WIZARD_STEPS.length} — {step.title}</span>
              {serverSteps[step.id] && (
                <span className="ml-2 text-xs font-normal text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Completado
                </span>
              )}
            </CardTitle>
            <p className="text-slate-600 text-sm">{step.description}</p>
          </CardHeader>
          <CardContent>
            <StepContent
              stepId={step.id}
              onConfirm={step.id === "activar" ? handleActivar : handleConfirmStep}
              onImportAdvance={handleImportAdvance}
              markStepComplete={markStepComplete}
              confirming={confirming}
            />
          </CardContent>
        </Card>

        {/* Controles de navegación — el botón "Siguiente" se oculta para pasos de import */}
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={currentStep === 0 || confirming}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Atrás
          </Button>

          <span className="text-sm text-slate-500">{currentStep + 1} / {WIZARD_STEPS.length}</span>

          {!isSelfManagedStep && (
            isLastStep ? (
              <Button onClick={handleActivar} disabled={confirming} className="flex items-center gap-2 bg-green-600 hover:bg-green-700">
                {confirming ? "Activando…" : "Activar plataforma"}
                <Rocket className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={handleConfirmStep} disabled={confirming} className="flex items-center gap-2">
                {confirming ? "Guardando…" : "Confirmar y continuar"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            )
          )}

          {/* Espacio vacío para mantener centrado el contador cuando el paso gestiona su propio avance */}
          {isSelfManagedStep && <div className="w-32" />}
        </div>

      </div>
    </div>
  );
}

// ── Despachador de pasos ──────────────────────────────────────────────────────

interface StepContentProps {
  stepId: string;
  onConfirm: () => void;
  onImportAdvance: () => void;
  markStepComplete: (stepId: string) => Promise<Record<string, boolean>>;
  confirming: boolean;
}

function StepContent({ stepId, onConfirm, onImportAdvance, markStepComplete, confirming }: StepContentProps) {
  switch (stepId) {
    case "escuela":
      return <EscuelaForm onSuccess={onConfirm} confirming={confirming} />;

    case "alumnos":
      return (
        <ImportStep
          stepId="alumnos"
          category="estudiantes"
          templateId="estudiantes"
          importEndpoint="/api/import/data/estudiantes/estudiantes"
          templateFileName="plantilla_alumnos.csv"
          fieldsNote="Columnas requeridas: nombre_completo, curp. Opcionales: fecha_nacimiento, grado, grupo, nivel_academico, status."
          markStepComplete={markStepComplete}
          onAdvance={onImportAdvance}
        />
      );

    case "familias":
      return (
        <ImportStep
          stepId="familias"
          category="familias"
          templateId="tutores"
          importEndpoint="/api/import/data/familias/tutores"
          templateFileName="plantilla_familias_tutores.csv"
          fieldsNote="Columnas clave: nombre_familia (agrupa tutores de la misma familia), id_referencia_alumno o curp_alumno, tipo_guardian, nombres_tutor, apellido_paterno_tutor, email_tutor."
          markStepComplete={markStepComplete}
          onAdvance={onImportAdvance}
        />
      );

    case "becas":
      return (
        <ImportStep
          stepId="becas"
          category="becas"
          templateId="asignaciones"
          importEndpoint="/api/import/data/becas/asignaciones"
          templateFileName="plantilla_becas.csv"
          fieldsNote="Columnas requeridas: curp_estudiante o id_estudiante, tipo_beca, valor_descuento (0–100, porcentaje). Opcionales: vigencia_inicio, vigencia_fin, observaciones."
          markStepComplete={markStepComplete}
          onAdvance={onImportAdvance}
        />
      );

    case "adeudos":
      return (
        <ImportStep
          stepId="adeudos"
          category="adeudos"
          templateId="migrados"
          importEndpoint="/api/import/data/adeudos/migrados"
          templateFileName="plantilla_adeudos_migrados.csv"
          fieldsNote="Columnas requeridas: curp_estudiante o id_estudiante, tipo_concepto, monto_centavos (entero, sin símbolo), fecha_vencimiento (YYYY-MM-DD). Opcional si eres nuevo cliente — puedes omitir este paso."
          markStepComplete={markStepComplete}
          onAdvance={onImportAdvance}
        />
      );

    case "validar":
      return <ValidacionStep markStepComplete={markStepComplete} onAdvance={onImportAdvance} />;

    case "simular":
      return <SimulacionStep markStepComplete={markStepComplete} onAdvance={onImportAdvance} />;

    default:
      return <PlaceholderStep stepId={stepId} />;
  }
}

// ── ImportStep ────────────────────────────────────────────────────────────────
// Componente reutilizable para los 4 pasos de importación masiva.
// Regla crítica: PATCH solo si successful >= 1 (nunca si todas las filas fallaron).

interface ImportStepProps {
  stepId: string;
  category: string;
  templateId: string;
  importEndpoint: string;
  templateFileName: string;
  fieldsNote: string;
  markStepComplete: (stepId: string) => Promise<Record<string, boolean>>;
  onAdvance: () => void;
}

type ImportPhase = "idle" | "previewing" | "preview_done" | "confirming" | "skipping";

interface ImportPreview {
  successful: number;
  failed: number;
  total: number;
  errors: string[];
  warnings: string[];
}

function ImportStep({
  stepId, category, templateId, importEndpoint,
  templateFileName, fieldsNote, markStepComplete, onAdvance,
}: ImportStepProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Descarga de plantilla ──────────────────────────────────────────────────
  async function downloadTemplate() {
    try {
      const res = await fetch(`/api/import/template/${category}/${templateId}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = templateFileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Plantilla descargada", description: "Completa los datos y súbela para importar." });
    } catch {
      toast({ title: "Error", description: "No se pudo descargar la plantilla.", variant: "destructive" });
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPhase("idle");
      setPreview(null);
      toast({ title: "Archivo seleccionado", description: `${f.name} listo para previsualizar.` });
    }
  }

  function resetFile() {
    setFile(null);
    setPhase("idle");
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Fase 1: Preview (dry_run — NO escribe nada en DB) ─────────────────────
  async function runPreview() {
    if (!file) return;
    setPhase("previewing");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${importEndpoint}?dry_run=true`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error al previsualizar", description: data.message ?? "Error desconocido", variant: "destructive" });
        setPhase("idle");
        return;
      }
      setPreview(data);
      setPhase("preview_done");
    } catch {
      toast({ title: "Error de red", description: "No se pudo conectar con el servidor.", variant: "destructive" });
      setPhase("idle");
    }
  }

  // ── Fase 2: Import real (escribe en DB, PATCH solo si successful >= 1) ────
  async function confirmImport() {
    if (!file) return;
    setPhase("confirming");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(importEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error al importar", description: data.message ?? "Error desconocido", variant: "destructive" });
        setPhase("preview_done");
        return;
      }

      const successCount: number = data.successful ?? 0;

      if (successCount >= 1) {
        // Marcar el paso como completo SOLO si al menos 1 fila fue importada
        await markStepComplete(stepId);
        toast({
          title: "Importación completada",
          description: `${successCount} registro(s) importado(s).${data.failed > 0 ? ` ${data.failed} con error.` : ""}`,
        });
        resetFile();
        onAdvance();
      } else {
        // successful === 0: todas las filas fallaron — NO se marca el paso
        toast({
          title: "Sin registros importados",
          description: "Todas las filas tienen errores. Corrige el archivo y vuelve a intentarlo.",
          variant: "destructive",
        });
        setPreview(data);
        setPhase("preview_done");
      }
    } catch {
      toast({ title: "Error de red", description: "No se pudo conectar con el servidor.", variant: "destructive" });
      setPhase("preview_done");
    }
  }

  // ── Omitir: decisión consciente del usuario — SÍ marca el paso ───────────
  async function skipStep() {
    setPhase("skipping");
    try {
      await markStepComplete(stepId);
      toast({ title: "Paso omitido", description: "Puedes completarlo más tarde desde esta pantalla." });
      onAdvance();
    } catch {
      toast({ title: "Error", description: "No se pudo registrar el paso.", variant: "destructive" });
      setPhase("idle");
    }
  }

  const busy = phase === "previewing" || phase === "confirming" || phase === "skipping";

  return (
    <div className="space-y-5">
      {/* Descarga de plantilla — prominente, arriba de todo */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-900 mb-1">Paso 1 — Descarga la plantilla CSV</p>
            <p className="text-xs text-blue-700 mb-3">{fieldsNote}</p>
            <Button onClick={downloadTemplate} variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-100">
              <Download className="w-4 h-4 mr-2" />
              Descargar plantilla {templateFileName}
            </Button>
          </div>
        </div>
      </div>

      {/* Selector de archivo */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-slate-700 mb-3">Paso 2 — Sube el archivo completado</p>
        <div>
          <Label htmlFor={`file-${stepId}`} className="text-sm">Seleccionar archivo CSV</Label>
          <Input
            id={`file-${stepId}`}
            type="file"
            accept=".csv"
            onChange={onFileChange}
            ref={fileRef}
            disabled={busy}
            className="mt-1"
          />
        </div>

        {file && phase === "idle" && (
          <div className="mt-3 bg-green-50 border border-green-200 p-2 rounded flex items-center gap-2 text-sm text-green-800">
            <Upload className="w-4 h-4 text-green-600 shrink-0" />
            <strong>{file.name}</strong> — listo para previsualizar
          </div>
        )}
      </div>

      {/* Resultado del preview */}
      {phase === "previewing" && (
        <div className="bg-slate-50 border rounded-lg p-4 text-sm text-slate-600">Validando sin guardar nada…</div>
      )}

      {phase === "preview_done" && preview && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">Resultado de la validación (nada se ha guardado aún):</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-50 border rounded-lg p-3">
              <div className="text-2xl font-bold text-slate-700">{preview.total}</div>
              <div className="text-xs text-slate-500 mt-1">Total filas</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-700">{preview.successful}</div>
              <div className="text-xs text-green-600 mt-1">Válidas</div>
            </div>
            <div className={`border rounded-lg p-3 ${preview.failed > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
              <div className={`text-2xl font-bold ${preview.failed > 0 ? "text-red-700" : "text-green-700"}`}>{preview.failed}</div>
              <div className={`text-xs mt-1 ${preview.failed > 0 ? "text-red-600" : "text-green-600"}`}>Con error</div>
            </div>
          </div>

          {preview.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-semibold text-red-800">Errores ({preview.errors.length}) — estas filas no se importarán</span>
              </div>
              <ul className="space-y-1 max-h-36 overflow-y-auto">
                {preview.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-700">• {typeof e === "string" ? e : JSON.stringify(e)}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">Avisos ({preview.warnings.length})</span>
              </div>
              <ul className="space-y-1 max-h-28 overflow-y-auto">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.successful === 0 && (
            <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-700">
              No hay filas válidas para importar. Corrige los errores y vuelve a intentarlo.
            </div>
          )}
        </div>
      )}

      {phase === "confirming" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          Importando en la base de datos…
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
        {/* Izquierda: omitir */}
        <Button
          variant="ghost"
          size="sm"
          onClick={skipStep}
          disabled={busy}
          className="text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <SkipForward className="w-4 h-4" />
          {phase === "skipping" ? "Omitiendo…" : "Omitir este paso"}
        </Button>

        {/* Derecha: acciones principales */}
        <div className="flex gap-2">
          {phase === "preview_done" && (
            <Button variant="outline" size="sm" onClick={resetFile} disabled={busy}>
              Cambiar archivo
            </Button>
          )}

          {(phase === "idle" || phase === "previewing") && (
            <Button onClick={runPreview} disabled={!file || phase === "previewing"} size="sm">
              {phase === "previewing" ? "Validando…" : "Vista previa (sin guardar)"}
            </Button>
          )}

          {phase === "preview_done" && preview && preview.successful > 0 && (
            <Button onClick={confirmImport} disabled={busy} size="sm">
              Confirmar importación ({preview.successful} registro{preview.successful !== 1 ? "s" : ""})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── EscuelaForm ───────────────────────────────────────────────────────────────

interface EscuelaFormProps {
  onSuccess: () => void;
  confirming: boolean;
}

function EscuelaForm({ onSuccess, confirming }: EscuelaFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nombre_legal: "", rfc: "", direccion: "", telefono: "", email: "",
    pac_proveedor: "FACTURAMA", pasarela_pagos: "STRIPE",
  });
  const [submitting, setSubmitting] = useState(false);
  const set = (k: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [k]: e.target.value });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("/api/admin/configuracion/escuela", { method: "POST", body: JSON.stringify(formData) });
      toast({ title: "Datos de la escuela guardados" });
      onSuccess();
    } catch {
      toast({ title: "Error", description: "No se pudo guardar la configuración", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="nombre_legal">Nombre legal *</Label>
          <Input id="nombre_legal" value={formData.nombre_legal} onChange={set("nombre_legal")} placeholder="Instituto JFR A.C." required />
        </div>
        <div>
          <Label htmlFor="rfc">RFC</Label>
          <Input id="rfc" value={formData.rfc} onChange={set("rfc")} placeholder="CSP123456789" maxLength={13} />
        </div>
        <div>
          <Label htmlFor="direccion">Dirección fiscal</Label>
          <Input id="direccion" value={formData.direccion} onChange={set("direccion")} placeholder="Av. Reforma 100" />
        </div>
        <div>
          <Label htmlFor="telefono">Teléfono</Label>
          <Input id="telefono" value={formData.telefono} onChange={set("telefono")} placeholder="555-000-0000" />
        </div>
        <div>
          <Label htmlFor="email">Email institucional</Label>
          <Input id="email" type="email" value={formData.email} onChange={set("email")} placeholder="contacto@escuela.mx" />
        </div>
        <div>
          <Label>Proveedor PAC</Label>
          <Select value={formData.pac_proveedor} onValueChange={(v) => setFormData({ ...formData, pac_proveedor: v })}>
            <SelectTrigger><span>{formData.pac_proveedor}</span></SelectTrigger>
            <SelectContent>
              <SelectItem value="FACTURAMA">Facturama</SelectItem>
              <SelectItem value="ENLACE_FISCAL">Enlace Fiscal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={submitting || confirming} className="w-full">
        {submitting ? "Guardando…" : "Guardar datos de la escuela y continuar"}
      </Button>
    </form>
  );
}

// ── ValidacionStep ────────────────────────────────────────────────────────────
// Llama a GET /api/admin/configuracion/validacion-onboarding y muestra resultado.
// Errores → bloqueantes (deshabilitan el botón de confirmar).
// Warnings → informativos (no impiden avanzar).

interface ValidacionResult {
  errores: string[];
  warnings: string[];
  ok: boolean;
}

function ValidacionStep({
  markStepComplete,
  onAdvance,
}: {
  markStepComplete: (id: string) => Promise<Record<string, boolean>>;
  onAdvance: () => void;
}) {
  const { toast } = useToast();
  const [result, setResult] = useState<ValidacionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function runValidation() {
    setLoading(true);
    setResult(null);
    try {
      const data = await authFetch("/api/admin/configuracion/validacion-onboarding");
      setResult(data);
    } catch {
      toast({ title: "Error", description: "No se pudo ejecutar la validación", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runValidation(); }, []);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await markStepComplete("validar");
      onAdvance();
    } catch {
      toast({ title: "Error", description: "No se pudo registrar el avance", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <span className="text-sm text-slate-600">Validando integridad de los datos…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {result
            ? result.ok
              ? "Todos los checks pasaron correctamente."
              : "Se encontraron problemas que deben resolverse antes de activar."
            : ""}
        </p>
        <Button variant="outline" size="sm" onClick={runValidation} disabled={loading}>
          Volver a validar
        </Button>
      </div>

      {result && result.errores.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-800">
              Errores bloqueantes ({result.errores.length}) — deben resolverse antes de continuar
            </span>
          </div>
          <ul className="space-y-1">
            {result.errores.map((e, i) => (
              <li key={i} className="text-sm text-red-700">• {e}</li>
            ))}
          </ul>
          <p className="text-xs text-red-600 mt-2">
            Use los pasos anteriores para importar o corregir los datos.
          </p>
        </div>
      )}

      {result && result.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">
              Avisos ({result.warnings.length}) — no impiden activar la plataforma
            </span>
          </div>
          <ul className="space-y-1">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-700">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {result && result.ok && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="text-sm text-green-800">
            Todos los datos son consistentes. Puede continuar al siguiente paso.
          </span>
        </div>
      )}

      <div className="flex justify-end pt-2 border-t">
        <Button
          onClick={handleConfirm}
          disabled={!result || !result.ok || confirming}
          className="flex items-center gap-2"
        >
          {confirming ? "Guardando…" : "Confirmar validación y continuar"}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── SimulacionStep ────────────────────────────────────────────────────────────
// Llama a GET /api/admin/configuracion/simulacion-cargos.
// Siempre permite continuar — es informativo.

interface SimulacionConcepto {
  concepto_id: number;
  nombre: string;
  tipo: string;
  periodicidad: string;
  monto_unitario_centavos: number;
  cargos_proyectados: number;
  subtotal_centavos: number;
}

interface SimulacionResult {
  total_alumnos: number;
  total_cargos_proyectados_centavos: number;
  sin_conceptos: boolean;
  desglose_por_concepto: SimulacionConcepto[];
}

function SimulacionStep({
  markStepComplete,
  onAdvance,
}: {
  markStepComplete: (id: string) => Promise<Record<string, boolean>>;
  onAdvance: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<SimulacionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function runSimulation() {
    setLoading(true);
    try {
      const result = await authFetch("/api/admin/configuracion/simulacion-cargos");
      setData(result);
    } catch {
      toast({ title: "Error", description: "No se pudo ejecutar la simulación", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runSimulation(); }, []);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await markStepComplete("simular");
      onAdvance();
    } catch {
      toast({ title: "Error", description: "No se pudo registrar el avance", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }

  async function handleSkip() {
    try {
      await markStepComplete("simular");
      onAdvance();
    } catch {
      toast({ title: "Error", description: "No se pudo omitir el paso", variant: "destructive" });
    }
  }

  function pesos(centavos: number) {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(centavos / 100);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <span className="text-sm text-slate-600">Calculando proyección de cargos…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sin conceptos — aviso especial con enlace */}
      {data?.sin_conceptos && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">No hay conceptos de cobro configurados</span>
          </div>
          <p className="text-sm text-amber-700">
            Sin conceptos no se generarán cargos automáticos.{" "}
            <a href="/configuracion" className="underline font-medium hover:text-amber-900">
              Configura tus conceptos en Ajustes Institucionales
            </a>{" "}
            y regresa a este paso para ver la proyección.
          </p>
        </div>
      )}

      {/* Resumen + desglose */}
      {data && !data.sin_conceptos && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-blue-700">{data.total_alumnos}</div>
              <div className="text-xs text-blue-600 mt-1">Alumnos activos</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-green-700">
                {pesos(data.total_cargos_proyectados_centavos)}
              </div>
              <div className="text-xs text-green-600 mt-1">Total proyectado por concepto</div>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-slate-700">Concepto</th>
                  <th className="text-center p-3 font-medium text-slate-700">Periodicidad</th>
                  <th className="text-right p-3 font-medium text-slate-700">Monto unitario</th>
                  <th className="text-right p-3 font-medium text-slate-700">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {data.desglose_por_concepto.map((c, i) => (
                  <tr key={c.concepto_id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="p-3 text-slate-800">{c.nombre}</td>
                    <td className="p-3 text-center text-slate-600">{c.periodicidad}</td>
                    <td className="p-3 text-right text-slate-800">{pesos(c.monto_unitario_centavos)}</td>
                    <td className="p-3 text-right font-medium">{pesos(c.subtotal_centavos)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 border-t">
                <tr>
                  <td colSpan={3} className="p-3 font-semibold text-slate-800">Total proyectado</td>
                  <td className="p-3 text-right font-bold text-slate-900">
                    {pesos(data.total_cargos_proyectados_centavos)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-slate-500">
            Esta proyección asume que todos los conceptos aplican a todos los alumnos activos.
            Los descuentos por beca se aplicarán al generar los cargos reales.
          </p>
        </>
      )}

      {data && data.total_alumnos === 0 && !data.sin_conceptos && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-600 text-center">
          No hay alumnos activos. Importe alumnos antes de simular los cargos.
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        Este paso es informativo — no genera ningún cargo real.
      </p>

      <div className="flex items-center justify-between pt-2 border-t">
        <Button
          variant="ghost" size="sm"
          onClick={handleSkip}
          disabled={confirming}
          className="text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <SkipForward className="w-4 h-4" />
          Omitir este paso
        </Button>
        <Button onClick={handleConfirm} disabled={!data || confirming} className="flex items-center gap-2">
          {confirming ? "Guardando…" : "Continuar"}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Placeholder para pasos no implementados ───────────────────────────────────

const PLACEHOLDER_NOTES: Record<string, string> = {
  activar: "Confirma la configuración y activa el sistema de cobros. Este es el último paso.",
};

function PlaceholderStep({ stepId }: { stepId: string }) {
  return (
    <div className="text-center py-10 space-y-3">
      <Circle className="w-10 h-10 text-slate-300 mx-auto" />
      <p className="text-slate-600 max-w-sm mx-auto text-sm">{PLACEHOLDER_NOTES[stepId] ?? "Este paso se configurará próximamente."}</p>
      <p className="text-xs text-slate-400">Usa los botones de navegación para avanzar o retroceder.</p>
    </div>
  );
}
