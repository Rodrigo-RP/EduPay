/**
 * AssistantWidget.tsx
 * Widget de chat flotante del Asistente EduPay.
 * Vive en la esquina inferior derecha de todas las pantallas de staff.
 */

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { BotMessageSquare, X, Send, ChevronRight, CheckCircle2, XCircle, AlertTriangle, Wrench, Loader2, FileDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface NavTarget {
  route: string;
  label: string;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
  expectedBehavior: string;
}

interface AuditLayer {
  layer: 1 | 2 | 3 | 4;
  name: string;
  ok: boolean;
  detail: string;
}

export interface DiagnosticResult {
  status: "ok" | "config_error" | "technical_error";
  moduleId: string;
  label: string;
  checks: CheckResult[];
  auditLayers?: AuditLayer[];
  fixAvailable?: boolean;
  fixDescription?: string;
}

interface ActionResultRow {
  label: string;
  value: string | number;
  highlight?: boolean;
}

interface ActionResult {
  success: boolean;
  title: string;
  summary: string;
  rows?: ActionResultRow[];
}

/** Señal N3: el servidor reconoció una intención de exportación.
 *  El widget hace fetch + blob + anchor-download con estos datos. */
interface ExportSignal {
  endpoint: string;
  format: "excel" | "pdf";
  body: Record<string, string>;
  suggestedFilename: string;
  reportLabel: string;
}

interface ChatMessage {
  id: number;
  role: "assistant" | "user";
  text: string;
  navigate?: NavTarget;
  suggestions?: NavTarget[];
  /** Señal de diagnóstico pendiente (se auto-ejecuta al aparecer en el chat) */
  diagnosePending?: { moduleId: string; label: string };
  /** Ruta al módulo diagnosticado (persiste para el botón de navegación) */
  diagnoseNav?: NavTarget;
  /** Resultado real del diagnóstico */
  diagnosticResult?: DiagnosticResult;
  /** Loading del diagnóstico */
  diagnosing?: boolean;
  /** Resultado de una consulta/acción de datos */
  actionResult?: ActionResult;
  /** N3: señal de exportación de reporte */
  export?: ExportSignal;
  ts: number;
}

interface AssistantResponse {
  reply: string;
  navigate?: NavTarget;
  suggestions?: NavTarget[];
  diagnose?: { moduleId: string; label: string };
  actionResult?: ActionResult;
  /** N3: señal de exportación */
  export?: ExportSignal;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let msgId = 0;
const newId = () => ++msgId;

const PAGE_LABELS: Record<string, string> = {
  "/admin": "Dashboard",
  "/estudiantes": "Estudiantes",
  "/familias": "Familias",
  "/cargos": "Cargos",
  "/pagos": "Pagos",
  "/cuentas-por-cobrar": "Cuentas por Cobrar",
  "/caja-conciliacion": "Caja y Conciliación",
  "/excepciones-conciliacion": "Excepciones Bancarias",
  "/catalogo-productos": "Catálogo de Productos",
  "/asignacion-precios": "Asignación de Precios",
  "/becas": "Becas y Descuentos",
  "/fiscal-contable": "Fiscal y Contable",
  "/notificaciones": "Notificaciones",
  "/reportes": "Reportes",
  "/reportes-financieros": "Reportes Financieros",
  "/importacion-datos": "Importación de Datos",
  "/aprobaciones": "Aprobaciones",
  "/semaforo-riesgo": "Semáforo de Riesgo",
  "/planes-pago": "Planes de Pago",
  "/calendario-financiero": "Calendario Fiscal",
  "/configuracion": "Configuración",
  "/usuarios": "Gestión de Usuarios",
  "/historial": "Historial de Movimientos",
};

function renderMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

// ── Subcomponente: ExportCard (N3) ───────────────────────────────────────────

function ExportCard({ signal }: { signal: ExportSignal }) {
  const [phase, setPhase] = useState<"idle" | "downloading" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function triggerDownload() {
    setPhase("downloading");
    try {
      const token = localStorage.getItem("auth_token") ?? "";
      const res = await fetch(signal.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(signal.body),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = signal.suggestedFilename;
      a.click();
      URL.revokeObjectURL(url);
      setPhase("done");
    } catch (e: any) {
      setErrMsg(e.message ?? "Error al descargar");
      setPhase("error");
    }
  }

  return (
    <div className="rounded-xl border p-3 text-xs max-w-[240px] bg-indigo-50 border-indigo-200">
      <div className="flex items-center gap-1.5 mb-2">
        <FileDown className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
        <span className="font-semibold text-slate-800 truncate flex-1">{signal.reportLabel}</span>
        <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-medium uppercase">
          {signal.format}
        </span>
      </div>

      {phase === "idle" && (
        <button
          onClick={triggerDownload}
          className="w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-full transition-colors"
        >
          Descargar {signal.format === "pdf" ? "PDF" : "Excel"}
        </button>
      )}
      {phase === "downloading" && (
        <div className="flex items-center gap-1.5 text-indigo-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          Descargando…
        </div>
      )}
      {phase === "done" && (
        <div className="flex items-center gap-1.5 text-green-700">
          <CheckCircle2 className="w-3 h-3" />
          Listo: {signal.suggestedFilename}
        </div>
      )}
      {phase === "error" && (
        <div className="flex items-center gap-1.5 text-red-600">
          <XCircle className="w-3 h-3" />
          {errMsg}
        </div>
      )}
    </div>
  );
}

// ── Subcomponente: ActionResultCard ──────────────────────────────────────────

function ActionResultCard({ result }: { result: ActionResult }) {
  return (
    <div className={`rounded-xl border p-3 text-xs max-w-[240px] ${result.success ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {result.success
          ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        <p className="font-semibold text-slate-800 truncate">{result.title}</p>
      </div>

      {result.rows && result.rows.length > 0 && (
        <div className="space-y-1 mb-2">
          {result.rows.map((row, i) => (
            <div key={i} className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg ${row.highlight ? "bg-blue-100" : "bg-white/70"}`}>
              <span className="text-slate-600 text-[10px] leading-tight flex-1 min-w-0">{row.label}</span>
              <span className={`font-semibold text-[11px] flex-shrink-0 ${row.highlight ? "text-blue-700" : "text-slate-700"}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Subcomponente: DiagnosticCard ─────────────────────────────────────────────

function DiagnosticCard({
  result,
  msgId: mId,
  onAutoFix,
}: {
  result: DiagnosticResult;
  msgId: number;
  onAutoFix: (moduleId: string, msgId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    ok: {
      color: "bg-green-50 border-green-200",
      icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
      badge: "bg-green-100 text-green-700",
      label: "✅ Todo funciona",
    },
    config_error: {
      color: "bg-amber-50 border-amber-200",
      icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
      badge: "bg-amber-100 text-amber-700",
      label: "⚠️ Configuración incompleta",
    },
    technical_error: {
      color: "bg-red-50 border-red-200",
      icon: <XCircle className="w-4 h-4 text-red-600" />,
      badge: "bg-red-100 text-red-700",
      label: "❌ Error técnico",
    },
  }[result.status];

  const failedChecks = result.checks.filter((c) => !c.ok);

  return (
    <div className={`rounded-xl border p-3 text-xs ${statusConfig.color} max-w-[240px]`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        {statusConfig.icon}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{result.label}</p>
          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mt-0.5 ${statusConfig.badge}`}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Protocolo de Auditoría E2E — 4 capas */}
      {result.auditLayers && result.auditLayers.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Auditoría E2E
          </p>
          <div className="space-y-1">
            {result.auditLayers.map((l) => (
              <div key={l.layer} className="flex items-start gap-1.5">
                {l.ok
                  ? <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                  : <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <span className={`leading-tight text-[10px] font-medium ${l.ok ? "text-slate-600" : "text-red-700"}`}>
                    C{l.layer}: {l.name}
                  </span>
                  {!l.ok && (
                    <p className="text-[10px] text-red-600 mt-0.5 leading-tight">{l.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 mt-2 mb-2" />
        </div>
      )}

      {/* Checks de datos del módulo */}
      <div className="space-y-1 mb-2">
        {result.checks.map((c, i) => (
          <div key={i} className="flex items-start gap-1.5">
            {c.ok
              ? <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
              : <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />}
            <span className={`leading-tight ${c.ok ? "text-slate-600" : "text-red-700 font-medium"}`}>
              {c.name}
            </span>
          </div>
        ))}
      </div>

      {/* Detalle de checks fallidos */}
      {failedChecks.length > 0 && (
        <div className="mt-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-slate-500 underline"
          >
            {expanded ? "Ocultar detalle" : "Ver detalle"}
          </button>
          {expanded && (
            <div className="mt-1.5 space-y-1.5">
              {failedChecks.map((c, i) => (
                <div key={i} className="bg-white rounded p-1.5 border border-red-100">
                  <p className="font-medium text-red-700">{c.name}</p>
                  <p className="text-slate-500 mt-0.5">{c.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sugerencia según status */}
      {result.status === "ok" && (
        <p className="text-slate-500 text-[10px] mt-1">
          Si el problema persiste, revisa los filtros activos o recarga la página.
        </p>
      )}

      {result.status === "config_error" && (
        <div className="mt-2">
          {result.fixAvailable ? (
            <button
              onClick={() => onAutoFix(result.moduleId, mId)}
              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-medium rounded-lg transition-colors"
            >
              <Wrench className="w-3 h-3" />
              Corregir automáticamente
            </button>
          ) : (
            <p className="text-amber-700 text-[10px]">
              Revisa los pasos indicados en el detalle para corregir la configuración.
            </p>
          )}
        </div>
      )}

      {result.status === "technical_error" && (
        <p className="text-red-600 text-[10px] mt-1 font-medium">
          Este fallo fue registrado para el administrador.
        </p>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AssistantWidget() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [welcomed, setWelcomed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Escuchar el botón del header
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener('assistant:toggle', handler);
    return () => window.removeEventListener('assistant:toggle', handler);
  }, []);

  // Scroll automático
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setUnread(0);
    }
  }, [open]);

  // Bienvenida la primera vez
  useEffect(() => {
    if (open && !welcomed) {
      setWelcomed(true);
      const pageName = PAGE_LABELS[location];
      const locationHint = pageName ? ` Estás en **${pageName}**.` : "";
      const firstName = user?.name?.trim() ? user.name.trim().split(/\s+/)[0] : "";
      const welcome: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: `¡Hola${firstName ? `, ${firstName}` : ""}! Soy el asistente de EduPay. Puedo ayudarte a navegar y también a revisar si algo no funciona.${locationHint} ¿En qué te ayudo?`,
        ts: Date.now(),
      };
      setMessages([welcome]);
    }
  }, [open, welcomed, location, user]);

  // ── Auto-diagnóstico ─────────────────────────────────────────────────────────

  const executeDiagnosis = async (moduleId: string, targetMsgId: number) => {
    // Marcar como "diagnosticando"
    setMessages((prev) =>
      prev.map((m) =>
        m.id === targetMsgId ? { ...m, diagnosing: true, diagnosePending: undefined } : m
      )
    );

    try {
      const res = await apiRequest("/api/assistant/diagnose", {
        method: "POST",
        body: JSON.stringify({ module: moduleId }),
      });
      const data: DiagnosticResult = await res.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === targetMsgId ? { ...m, diagnosing: false, diagnosticResult: data } : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === targetMsgId
            ? {
                ...m,
                diagnosing: false,
                text: "No pude conectarme al servidor para hacer la prueba. ¿Inténtalo nuevamente?",
              }
            : m
        )
      );
    }
  };

  // Observar mensajes con diagnosePending y ejecutar automáticamente
  useEffect(() => {
    const pending = messages.find((m) => m.diagnosePending && !m.diagnosing && !m.diagnosticResult);
    if (pending?.diagnosePending) {
      executeDiagnosis(pending.diagnosePending.moduleId, pending.id);
    }
  }, [messages]);

  // ── Auto-fix ─────────────────────────────────────────────────────────────────

  const handleAutoFix = async (moduleId: string, sourceMsgId: number) => {
    const confirmMsg: ChatMessage = {
      id: newId(),
      role: "user",
      text: "Sí, corrige automáticamente",
      ts: Date.now(),
    };
    const waitMsg: ChatMessage = {
      id: newId(),
      role: "assistant",
      text: "Aplicando corrección…",
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, confirmMsg, waitMsg]);
    const waitMsgId = waitMsg.id;

    try {
      const res = await apiRequest("/api/assistant/diagnose", {
        method: "POST",
        body: JSON.stringify({ module: moduleId, autoFixConfirmed: true }),
      });
      const data: DiagnosticResult = await res.json();

      const resultMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: data.status === "ok"
          ? "✅ Corrección aplicada con éxito. El módulo ahora debería funcionar correctamente."
          : "La corrección se aplicó pero algunos problemas requieren atención manual:",
        diagnosticResult: data,
        ts: Date.now(),
      };
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== waitMsgId),
        resultMsg,
      ]);
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === waitMsgId
            ? { ...m, text: "Error al aplicar la corrección. Inténtalo de nuevo." }
            : m
        )
      );
    }
  };

  // ── Enviar mensaje ───────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      text,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await apiRequest("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, currentPath: location }),
      });

      const data: AssistantResponse = await res.json();

      // Si hay señal de diagnóstico, crear mensaje con diagnosePending
      const assistantMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: data.reply,
        navigate: data.navigate,
        suggestions: data.suggestions,
        ...(data.diagnose
          ? {
              diagnosePending: data.diagnose,
              diagnoseNav: {
                route: `/${data.diagnose.moduleId}`,
                label: data.diagnose.label,
              },
            }
          : {}),
        ...(data.actionResult ? { actionResult: data.actionResult } : {}),
        ...(data.export     ? { export: data.export }             : {}),
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (!open) setUnread((n) => n + 1);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: "Ocurrió un error al conectar con el asistente. Intenta de nuevo.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const navigateTo = (route: string) => {
    setLocation(route);
    setOpen(false);
  };

  const handleSuggestionClick = (s: NavTarget) => {
    const text = `Llevarme a ${s.label}`;
    const userMsg: ChatMessage = { id: newId(), role: "user", text, ts: Date.now() };
    const botMsg: ChatMessage = {
      id: newId(),
      role: "assistant",
      text: `Te llevo a **${s.label}** ahora.`,
      navigate: s,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Panel de chat ─────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed top-16 right-4 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200"
          style={{ width: 332, height: 460 }}
          role="dialog"
          aria-label="Asistente EduPay"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <BotMessageSquare className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold leading-none">Asistente EduPay</p>
                <p className="text-blue-200 text-xs mt-0.5">Navegación · diagnóstico · consultas</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/70 hover:text-white transition-colors"
              aria-label="Cerrar asistente"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 min-h-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar del asistente */}
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <BotMessageSquare className="w-4 h-4 text-white" />
                  </div>
                )}

                <div className={`max-w-[240px] space-y-1.5 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                  {/* Burbuja de texto */}
                  <div
                    className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm"
                    }`}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                  />

                  {/* Indicador de diagnóstico en curso */}
                  {msg.diagnosing && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Ejecutando pruebas…
                    </div>
                  )}

                  {/* N3: tarjeta de exportación de reporte */}
                  {msg.export && (
                    <ExportCard signal={msg.export} />
                  )}

                  {/* Tarjeta de resultado de acción/consulta */}
                  {msg.actionResult && (
                    <ActionResultCard result={msg.actionResult} />
                  )}

                  {/* Tarjeta de diagnóstico */}
                  {msg.diagnosticResult && (
                    <>
                      <DiagnosticCard
                        result={msg.diagnosticResult}
                        msgId={msg.id}
                        onAutoFix={handleAutoFix}
                      />
                      {msg.diagnoseNav && (
                        <button
                          onClick={() => navigateTo(msg.diagnoseNav!.route)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full transition-colors shadow-sm"
                        >
                          <ChevronRight className="w-3 h-3" />
                          Ir a {msg.diagnoseNav.label}
                        </button>
                      )}
                    </>
                  )}

                  {/* Botón de navegación */}
                  {msg.navigate && (
                    <button
                      onClick={() => navigateTo(msg.navigate!.route)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-full transition-colors shadow-sm"
                    >
                      <ChevronRight className="w-3 h-3" />
                      Ir a {msg.navigate.label}
                    </button>
                  )}

                  {/* Chips de sugerencias */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {msg.suggestions.map((s) => (
                        <button
                          key={s.route}
                          onClick={() => handleSuggestionClick(s)}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs rounded-full transition-colors"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Indicador de carga del chat */}
            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <BotMessageSquare className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-200 bg-white rounded-b-2xl flex-shrink-0">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="¿Dónde está...? / No funciona..."
                maxLength={500}
                disabled={loading}
                className="flex-1 text-xs px-3 py-2 rounded-full border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-slate-400 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 flex items-center justify-center transition-colors flex-shrink-0"
                aria-label="Enviar mensaje"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB eliminado — el botón vive ahora en el header */}
    </>
  );
}
