// Módulo 1: Configuración inicial — wizard guiado (Centro de Implementación)
// Pasos: escuela → alumnos → familias → becas → adeudos → validar → simular → activar
//
// Progreso derivado de DB (onboarding_steps_completados jsonb) — NO de estado local.
// Recargar la página no pierde el progreso; el wizard abre en el primer paso sin completar.
import React, { useState, useEffect } from "react";
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
  ExternalLink,
} from "lucide-react";

// ── Definición canónica de pasos ─────────────────────────────────────────────

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: "escuela",  title: "Registro de la escuela",    description: "Nombre legal, RFC y datos fiscales",                   icon: School         },
  { id: "alumnos",  title: "Importación de alumnos",    description: "Alumnos y responsables de pago",                       icon: FileText       },
  { id: "familias", title: "Familias y tutores",        description: "Grupos familiares y tutores legales",                   icon: Users          },
  { id: "becas",    title: "Becas y descuentos",        description: "Asignación de apoyos económicos",                      icon: Gift           },
  { id: "adeudos",  title: "Adeudos migrados",          description: "Saldos pendientes de sistemas anteriores",             icon: Archive        },
  { id: "validar",  title: "Validación de datos",       description: "Revisión de consistencia antes de activar",            icon: ClipboardCheck },
  { id: "simular",  title: "Simulación de cargos",      description: "Vista previa de cargos que se generarán",              icon: Play           },
  { id: "activar",  title: "Activar plataforma",        description: "Confirmar configuración y abrir el sistema",           icon: Rocket         },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function authFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

/** Devuelve el índice del primer paso sin completar, o el último si todos están completos. */
function deriveInitialStep(steps: Record<string, boolean>): number {
  const firstIncomplete = WIZARD_STEPS.findIndex((s) => !steps[s.id]);
  return firstIncomplete === -1 ? WIZARD_STEPS.length - 1 : firstIncomplete;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ConfiguracionInicial() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // currentStep se inicializa desde la DB, no con un literal 0
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  // ── Estado del onboarding desde servidor ──────────────────────────────────
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

  // Derivar el paso inicial desde el server (una sola vez al montar)
  useEffect(() => {
    if (onboardingStatus && currentStep === null) {
      setCurrentStep(deriveInitialStep(onboardingStatus.steps ?? {}));
    }
  }, [onboardingStatus, currentStep]);

  const serverSteps: Record<string, boolean> = onboardingStatus?.steps ?? {};
  const completadoGlobal = onboardingStatus?.completado ?? false;

  // ── Marcar paso como completado en el servidor ─────────────────────────────
  async function markStepComplete(stepId: string): Promise<Record<string, boolean>> {
    const data = await authFetch(
      `/api/admin/configuracion/onboarding-step/${stepId}`,
      { method: "PATCH" }
    );
    const updated = data.steps as Record<string, boolean>;
    // Actualizar caché de React Query inmediatamente
    queryClient.setQueryData(["onboarding-status"], (old: any) => ({
      ...old,
      steps: updated,
    }));
    return updated;
  }

  // ── Navegación ─────────────────────────────────────────────────────────────
  function goBack() {
    setCurrentStep((s) => (s !== null && s > 0 ? s - 1 : s));
  }

  async function handleConfirmStep() {
    if (currentStep === null) return;
    const step = WIZARD_STEPS[currentStep];
    setConfirming(true);
    try {
      await markStepComplete(step.id);
      if (currentStep < WIZARD_STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    } catch {
      toast({ title: "Error", description: "No se pudo registrar el avance", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }

  async function handleActivar() {
    setConfirming(true);
    try {
      await markStepComplete("activar");
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/admin/configuracion/completar-onboarding", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("completar-onboarding");
      queryClient.setQueryData(["onboarding-status"], (old: any) => ({
        ...old,
        completado: true,
      }));
      toast({ title: "¡Plataforma activada!", description: "Su sistema está listo para generar cargos y recibir pagos" });
      navigate("/");
    } catch {
      toast({ title: "Error", description: "No se pudo activar la plataforma", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }

  // ── Spinner mientras carga ─────────────────────────────────────────────────
  if (isLoading || currentStep === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const step = WIZARD_STEPS[currentStep];

  // ── Pantalla de resumen si ya completó todo ────────────────────────────────
  if (completadoGlobal) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-2xl mx-auto text-center py-16">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Configuración completada</h1>
          <p className="text-slate-600 mb-6">
            Su plataforma ya está activa. Puede regresar al dashboard o revisar cualquier paso.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate("/")} className="bg-green-600 hover:bg-green-700">
              Ir al dashboard
            </Button>
            <Button variant="outline" onClick={() => setCurrentStep(0)}>
              Revisar pasos
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Layout principal ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Encabezado */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Centro de Implementación — Edupay
          </h1>
          <p className="text-slate-600">
            Configure su plataforma paso a paso. Puede avanzar, retroceder o reanudar en cualquier
            momento — su progreso se guarda automáticamente.
          </p>
          {/* Enlace no bloqueante a Ajustes Institucionales */}
          <a
            href="/configuracion"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
          >
            <ExternalLink className="w-3 h-3" />
            Configura tus conceptos de cobro aquí (Ajustes Institucionales)
          </a>
        </div>

        {/* Barra de progreso — pasos completados son clicables */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex items-start justify-between min-w-max gap-1 px-2">
            {WIZARD_STEPS.map((s, index) => {
              const Icon = s.icon;
              const isActive    = index === currentStep;
              const isCompleted = !!serverSteps[s.id];
              const clickable   = isCompleted && !isActive;

              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!clickable && !isActive}
                  onClick={() => isCompleted ? setCurrentStep(index) : undefined}
                  className={[
                    "flex flex-col items-center gap-1 px-2 py-1 rounded transition-colors min-w-[72px]",
                    clickable   ? "cursor-pointer hover:bg-green-50"  : "",
                    isActive    ? "cursor-default"                    : "",
                    !isCompleted && !isActive ? "cursor-default opacity-50" : "",
                  ].join(" ")}
                  title={isCompleted ? `Volver a: ${s.title}` : s.title}
                >
                  <div className={[
                    "w-10 h-10 rounded-full border-2 flex items-center justify-center",
                    isCompleted ? "bg-green-500 border-green-500 text-white" :
                    isActive    ? "bg-blue-500  border-blue-500  text-white" :
                                  "bg-white     border-gray-300  text-gray-400",
                  ].join(" ")}>
                    {isCompleted
                      ? <CheckCircle className="w-5 h-5" />
                      : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={[
                    "text-xs text-center leading-tight max-w-[68px]",
                    isActive ? "font-semibold text-blue-700" : "",
                    isCompleted ? "text-green-700" : "",
                  ].join(" ")}>
                    {s.title}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Línea de progreso visual */}
          <div className="mt-2 h-1 bg-gray-200 rounded mx-4">
            <div
              className="h-1 bg-green-500 rounded transition-all duration-300"
              style={{
                width: `${(Object.values(serverSteps).filter(Boolean).length / WIZARD_STEPS.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Contenido del paso activo */}
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
              confirming={confirming}
            />
          </CardContent>
        </Card>

        {/* Controles de navegación */}
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={currentStep === 0 || confirming}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Atrás
          </Button>

          <span className="text-sm text-slate-500">
            {currentStep + 1} / {WIZARD_STEPS.length}
          </span>

          {currentStep < WIZARD_STEPS.length - 1 ? (
            <Button
              onClick={handleConfirmStep}
              disabled={confirming}
              className="flex items-center gap-2"
            >
              {confirming ? "Guardando…" : "Confirmar y continuar"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleActivar}
              disabled={confirming}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
            >
              {confirming ? "Activando…" : "Activar plataforma"}
              <Rocket className="w-4 h-4" />
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Contenido por paso ────────────────────────────────────────────────────────
// EscuelaForm tiene UI real; el resto son placeholders hasta conectarlos.

interface StepContentProps {
  stepId: string;
  onConfirm: () => void;
  confirming: boolean;
}

function StepContent({ stepId, onConfirm, confirming }: StepContentProps) {
  switch (stepId) {
    case "escuela":
      return <EscuelaForm onSuccess={onConfirm} confirming={confirming} />;
    default:
      return <PlaceholderStep stepId={stepId} />;
  }
}

// ── EscuelaForm ───────────────────────────────────────────────────────────────

interface EscuelaFormProps {
  onSuccess: () => void;
  confirming: boolean;
}

function EscuelaForm({ onSuccess, confirming }: EscuelaFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nombre_legal: "",
    rfc: "",
    direccion: "",
    telefono: "",
    email: "",
    pac_proveedor: "FACTURAMA",
    pasarela_pagos: "STRIPE",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("/api/admin/configuracion/escuela", {
        method: "POST",
        body: JSON.stringify(formData),
      });
      toast({ title: "Datos de la escuela guardados" });
      onSuccess();
    } catch {
      toast({ title: "Error", description: "No se pudo guardar la configuración", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const set = (k: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [k]: e.target.value });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="nombre_legal">Nombre legal de la institución *</Label>
          <Input
            id="nombre_legal"
            value={formData.nombre_legal}
            onChange={set("nombre_legal")}
            placeholder="Instituto JFR A.C."
            required
          />
        </div>
        <div>
          <Label htmlFor="rfc">RFC de la institución</Label>
          <Input
            id="rfc"
            value={formData.rfc}
            onChange={set("rfc")}
            placeholder="CSP123456789"
            maxLength={13}
          />
        </div>
        <div>
          <Label htmlFor="direccion">Dirección fiscal</Label>
          <Input id="direccion" value={formData.direccion} onChange={set("direccion")} placeholder="Av. Reforma 100" />
        </div>
        <div>
          <Label htmlFor="telefono">Teléfono principal</Label>
          <Input id="telefono" value={formData.telefono} onChange={set("telefono")} placeholder="555-000-0000" />
        </div>
        <div>
          <Label htmlFor="email">Email institucional</Label>
          <Input id="email" type="email" value={formData.email} onChange={set("email")} placeholder="contacto@escuela.mx" />
        </div>
        <div>
          <Label>Proveedor PAC para CFDI</Label>
          <Select value={formData.pac_proveedor} onValueChange={(v) => setFormData({ ...formData, pac_proveedor: v })}>
            <SelectTrigger><span>{formData.pac_proveedor}</span></SelectTrigger>
            <SelectContent>
              <SelectItem value="FACTURAMA">Facturama</SelectItem>
              <SelectItem value="ENLACE_FISCAL">Enlace Fiscal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Pasarela de pagos</Label>
          <Select value={formData.pasarela_pagos} onValueChange={(v) => setFormData({ ...formData, pasarela_pagos: v })}>
            <SelectTrigger><span>{formData.pasarela_pagos}</span></SelectTrigger>
            <SelectContent>
              <SelectItem value="STRIPE">Stripe</SelectItem>
              <SelectItem value="OPENPAY">Openpay</SelectItem>
              <SelectItem value="CONEKTA">Conekta</SelectItem>
              <SelectItem value="EVO_PAYMENT">Evo Payment</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={submitting || confirming} className="w-full mt-2">
        {submitting ? "Guardando…" : "Guardar datos de la escuela y continuar"}
      </Button>
    </form>
  );
}

// ── Placeholder para pasos aún no implementados ───────────────────────────────

const PLACEHOLDER_INFO: Record<string, { note: string }> = {
  alumnos:  { note: "Importa el padrón de alumnos mediante CSV o registro manual." },
  familias: { note: "Agrupa alumnos en familias y asigna tutores y responsables de pago." },
  becas:    { note: "Asigna becas y descuentos a los alumnos que apliquen." },
  adeudos:  { note: "Migra saldos pendientes de sistemas anteriores (opcional si eres nuevo cliente)." },
  validar:  { note: "El sistema revisará la consistencia de alumnos, familias y conceptos antes de activar." },
  simular:  { note: "Vista previa de los cargos que se generarán al activar la plataforma." },
  activar:  { note: "Confirma la configuración y activa el sistema de cobros. Este es el último paso." },
};

function PlaceholderStep({ stepId }: { stepId: string }) {
  const info = PLACEHOLDER_INFO[stepId];
  return (
    <div className="text-center py-10 space-y-3">
      <Circle className="w-10 h-10 text-slate-300 mx-auto" />
      <p className="text-slate-600 max-w-sm mx-auto">
        {info?.note ?? "Este paso se configurará próximamente."}
      </p>
      <p className="text-xs text-slate-400">
        Usa los botones de navegación para avanzar o retroceder.
      </p>
    </div>
  );
}
