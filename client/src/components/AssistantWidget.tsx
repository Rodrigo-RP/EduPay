/**
 * AssistantWidget.tsx
 * Widget de chat flotante del Asistente EduPay.
 * Vive en la esquina inferior derecha de todas las pantallas de staff.
 */

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { BotMessageSquare, X, Send, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface NavTarget {
  route: string;
  label: string;
}

interface ChatMessage {
  id: number;
  role: "assistant" | "user";
  text: string;
  navigate?: NavTarget;
  suggestions?: NavTarget[];
  ts: number;
}

interface AssistantResponse {
  reply: string;
  navigate?: NavTarget;
  suggestions?: NavTarget[];
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
  // Soporta **negrita** y _cursiva_ básicos
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
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

  // Scroll automático al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus al input cuando se abre
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setUnread(0);
    }
  }, [open]);

  // Mensaje de bienvenida la primera vez que se abre
  useEffect(() => {
    if (open && !welcomed) {
      setWelcomed(true);
      const pageName = PAGE_LABELS[location];
      const locationHint = pageName ? ` Estás en **${pageName}**.` : "";
      const welcome: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: `¡Hola${user?.name?.trim() ? `, ${user.name.trim().split(/\s+/)[0]}` : ""}! Soy el asistente de EduPay. Puedo ayudarte a encontrar cualquier función del sistema.${locationHint} ¿En qué te ayudo?`,
        ts: Date.now(),
      };
      setMessages([welcome]);
    }
  }, [open, welcomed, location, user]);

  // ── Enviar mensaje ──────────────────────────────────────────────────────────

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

      const assistantMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: data.reply,
        navigate: data.navigate,
        suggestions: data.suggestions,
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
    setInput("");
    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      text,
      ts: Date.now(),
    };
    const botMsg: ChatMessage = {
      id: newId(),
      role: "assistant",
      text: `Te llevo a **${s.label}** ahora.`,
      navigate: s,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Panel de chat ─────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200"
          style={{ width: 320, height: 420 }}
          role="dialog"
          aria-label="Asistente EduPay"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <BotMessageSquare className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold leading-none">Asistente EduPay</p>
                <p className="text-blue-200 text-xs mt-0.5">Navegación inteligente</p>
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
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
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

                <div className={`max-w-[220px] space-y-1.5 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                  {/* Burbuja de texto */}
                  <div
                    className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm"
                    }`}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                  />

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

            {/* Indicador de carga */}
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
          <div className="p-3 border-t border-slate-200 bg-white rounded-b-2xl">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="¿Dónde está...?"
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
                <Send className="w-3.5 h-3.5 text-white disabled:text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Botón flotante ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
        aria-label={open ? "Cerrar asistente" : "Abrir asistente EduPay"}
        title="Asistente EduPay"
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <BotMessageSquare className="w-6 h-6 text-white" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </>
        )}
      </button>
    </>
  );
}
