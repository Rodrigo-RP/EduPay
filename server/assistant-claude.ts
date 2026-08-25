/**
 * Fallback seguro de Claude para consultas que el motor local no reconoce.
 *
 * Este módulo sólo expone herramientas query:* registradas en el dispatcher.
 * Claude nunca recibe SQL, endpoints de escritura ni identificadores sensibles.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ACTIONS, MODULES } from "@shared/permissions";
import {
  executeAction,
  type ActionContext,
  type ActionResult,
  type StudentNavigationTarget,
} from "./assistant-actions";
import { containsSensitiveAssistantData } from "./assistant-knowledge";

export const CLAUDE_MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 4;
const MAX_TOKENS = 900;
export const MAX_CONVERSATION_TURNS = 8;
const MAX_HISTORY_TEXT_LENGTH = 4_000;
const MAX_HISTORICAL_TOOLS_PER_TURN = 4;

export type AssistantClaudeContext = ActionContext & {
  role: string;
};

export type ClaudeClient = {
  messages: {
    create: (params: Record<string, unknown>) => Promise<any>;
  };
};

export type ClaudeTrace = {
  model: string;
  toolCalls: string[];
  adeudosPeriodos: Array<{ mes: number | null; anio: number | null; nivel: "todos" | "filtrado" }>;
  rounds: number;
  stopReason: string | null;
};

export type AssistantConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClaudeConversationTool = {
  name: string;
  input: Record<string, unknown>;
};

/**
 * El cliente conserva sólo este resumen de un turno de Claude. No conserva
 * resultados de herramientas: al reutilizarlo, el servidor vuelve a comprobar
 * permisos y a ejecutar cada lectura en el tenant/campus actual.
 */
export type ClaudeConversationTurn = {
  user: string;
  assistant: string;
  tools: ClaudeConversationTool[];
};

export type AssistantConversationHistory = {
  messages?: unknown;
  claudeTurns?: unknown;
};

export type ClaudeAnswer = {
  handled: boolean;
  reply?: string;
  trace: ClaudeTrace;
  error?: string;
  conversationTurn?: ClaudeConversationTurn;
  studentTargets?: StudentNavigationTarget[];
};

type ToolDefinition = Anthropic.Tool;

const READ_PERMISSIONS: Record<string, readonly [string, string]> = {
  "query:resumen_financiero": [MODULES.FINANCIAL, ACTIONS.READ],
  "query:resumen_ejecutivo_mes": [MODULES.FINANCIAL, ACTIONS.READ],
  "query:discrepancia": [MODULES.FINANCIAL, ACTIONS.READ],
  "query:adeudos_nivel_periodo": [MODULES.FINANCIAL, ACTIONS.READ],
  "query:buscar_alumno": [MODULES.STUDENTS, ACTIONS.READ],
  "query:saldo_alumno": [MODULES.STUDENTS, ACTIONS.READ],
  "query:becas_alumno": [MODULES.SCHOLARSHIPS, ACTIONS.READ],
  "query:becas_nivel": [MODULES.SCHOLARSHIPS, ACTIONS.READ],
  "query:cargos_alumno": [MODULES.CHARGES, ACTIONS.READ],
  "query:familias_hijos": [MODULES.FAMILIES, ACTIONS.READ],
  "query:verificar_sistema": [MODULES.SYSTEM, ACTIONS.READ],
};

function getCountPermission(entity: unknown): readonly [string, string] | null {
  const normalized = String(entity || "").toLowerCase();
  if (normalized.includes("alumno") || normalized.includes("estudiante")) {
    return [MODULES.STUDENTS, ACTIONS.READ];
  }
  if (normalized.includes("beca") || normalized.includes("descuento")) {
    return [MODULES.SCHOLARSHIPS, ACTIONS.READ];
  }
  if (normalized.includes("pago")) {
    return [MODULES.PAYMENTS, ACTIONS.READ];
  }
  if (normalized.includes("cargo")) {
    return [MODULES.CHARGES, ACTIONS.READ];
  }
  if (normalized.includes("familia")) {
    return [MODULES.FAMILIES, ACTIONS.READ];
  }
  return null;
}

export function getAssistantActionPermission(
  actionId: string,
  params: Record<string, unknown> = {},
): readonly [string, string] | null {
  if (actionId === "query:contar") return getCountPermission(params.entity);
  return READ_PERMISSIONS[actionId] ?? null;
}

const TOOLS: ToolDefinition[] = [
  {
    name: "query_contar",
    description: "Cuenta alumnos, becas, pagos, cargos o familias del campus actual.",
    input_schema: {
      type: "object",
      properties: { entity: { type: "string", enum: ["alumnos", "becas", "pagos", "cargos", "familias"] } },
      required: ["entity"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "query_resumen_financiero",
    description: "Obtiene cobrado, pendiente, vencido y cantidad de cargos del campus actual.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "query_resumen_ejecutivo_mes",
    description: "Genera un resumen financiero ejecutivo de un mes: cobrado, por cobrar no vencido, vencido y becas activas con descuentos. Úsala para preguntas de resumen, estado financiero o cómo va el mes. Usa mes 1-12 y año actual cuando no indiquen otro periodo.",
    input_schema: {
      type: "object",
      properties: {
        mes: { type: "integer", description: "Mes calendario de 1 a 12." },
        anio: { type: "integer", description: "Año de cuatro dígitos." },
      },
      required: ["mes", "anio"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "query_adeudos_nivel_periodo",
    description: "Lista alumnos con saldo pendiente por mes de vencimiento y nivel escolar. Usa mes 1-12 y año; deja nivel vacío para todos.",
    input_schema: {
      type: "object",
      properties: {
        mes: { type: "integer" },
        anio: { type: "integer" },
        nivel: { type: "string", description: "Nivel escolar; cadena vacía significa todos los niveles." },
      },
      required: ["mes", "anio", "nivel"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "query_buscar_alumno",
    description: "Busca alumnos por nombre dentro del campus y devuelve sólo nombre, grado, grupo, matrícula, estado y saldo. Nunca devuelve CURP ni RFC.",
    input_schema: {
      type: "object",
      properties: { nombre: { type: "string" } },
      required: ["nombre"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "query_becas_alumno",
    description: "Consulta becas asignadas a alumnos por nombre en el campus actual.",
    input_schema: {
      type: "object",
      properties: { nombre: { type: "string" } },
      required: ["nombre"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "query_becas_nivel",
    description: "Lista alumnos con beca activa, opcionalmente filtrados por nivel escolar.",
    input_schema: {
      type: "object",
      properties: { nivel: { type: "string" } },
      required: ["nivel"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "query_cargos_alumno",
    description: "Consulta cargos pendientes o vencidos de un alumno por nombre.",
    input_schema: {
      type: "object",
      properties: { nombre: { type: "string" } },
      required: ["nombre"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "query_familias_hijos",
    description: "Lista familias con más del número indicado de hijos inscritos.",
    input_schema: {
      type: "object",
      properties: { minHijos: { type: "integer" } },
      required: ["minHijos"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "query_discrepancia",
    description: "Investiga diferencias entre conteos de alumnos, becas, cargos y pagos.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
];

const TOOL_TO_ACTION: Record<string, string> = {
  query_contar: "query:contar",
  query_resumen_financiero: "query:resumen_financiero",
  query_resumen_ejecutivo_mes: "query:resumen_ejecutivo_mes",
  query_adeudos_nivel_periodo: "query:adeudos_nivel_periodo",
  query_buscar_alumno: "query:buscar_alumno",
  query_becas_alumno: "query:becas_alumno",
  query_becas_nivel: "query:becas_nivel",
  query_cargos_alumno: "query:cargos_alumno",
  query_familias_hijos: "query:familias_hijos",
  query_discrepancia: "query:discrepancia",
};

export function getClaudeToolDefinitions(): ToolDefinition[] {
  return TOOLS.map((tool) => ({ ...tool }));
}

function createClient(): ClaudeClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? (new Anthropic({ apiKey, timeout: 45_000, maxRetries: 0 }) as unknown as ClaudeClient) : null;
}

function inputObject(input: unknown): Record<string, any> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, any>
    : {};
}

function safeHistoryText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, MAX_HISTORY_TEXT_LENGTH);
  return text && !containsSensitiveAssistantData(text) ? text : null;
}

function normalizeVisibleHistory(
  value: unknown,
  currentMessage: string,
): Array<{ user: string; assistant: string }> {
  if (!Array.isArray(value)) return [];

  const messages: AssistantConversationMessage[] = value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const role = (candidate as any).role;
    const content = safeHistoryText((candidate as any).content);
    return (role === "user" || role === "assistant") && content
      ? [{ role, content }]
      : [];
  });

  // El widget incluye la pregunta actual en history para que el backend reciba
  // toda la conversación. Evitamos duplicarla antes de añadirla al final.
  if (
    messages.at(-1)?.role === "user"
    && messages.at(-1)?.content === currentMessage.trim()
  ) {
    messages.pop();
  }

  const exchanges: Array<{ user: string; assistant: string }> = [];
  let pendingUser: string | null = null;
  for (const item of messages) {
    if (item.role === "user") {
      pendingUser = item.content;
    } else if (pendingUser) {
      exchanges.push({ user: pendingUser, assistant: item.content });
      pendingUser = null;
    }
  }
  return exchanges.slice(-MAX_CONVERSATION_TURNS);
}

function normalizeHistoricalToolInput(
  toolName: string,
  rawInput: unknown,
): Record<string, unknown> | null {
  const input = inputObject(rawInput);
  const safeText = (value: unknown, allowEmpty = false): string | null => {
    if (typeof value !== "string") return null;
    const text = value.trim().slice(0, 100);
    return (allowEmpty || text.length > 0) && !containsSensitiveAssistantData(text) ? text : null;
  };
  const safeInteger = (value: unknown, min: number, max: number): number | null => {
    const number = Number(value);
    return Number.isInteger(number) && number >= min && number <= max ? number : null;
  };

  switch (toolName) {
    case "query_contar": {
      const entity = safeText(input.entity);
      return entity && ["alumnos", "becas", "pagos", "cargos", "familias"].includes(entity)
        ? { entity }
        : null;
    }
    case "query_adeudos_nivel_periodo": {
      const mes = safeInteger(input.mes, 1, 12);
      const anio = safeInteger(input.anio, 2000, 2100);
      const nivel = safeText(input.nivel, true);
      return mes !== null && anio !== null && nivel !== null ? { mes, anio, nivel } : null;
    }
    case "query_resumen_ejecutivo_mes": {
      const mes = safeInteger(input.mes, 1, 12);
      const anio = safeInteger(input.anio, 2000, 2100);
      return mes !== null && anio !== null ? { mes, anio } : null;
    }
    case "query_buscar_alumno":
    case "query_saldo_alumno":
    case "query_becas_alumno":
    case "query_cargos_alumno": {
      const nombre = safeText(input.nombre);
      return nombre && nombre.length >= 2 ? { nombre } : null;
    }
    case "query_becas_nivel": {
      const nivel = safeText(input.nivel, true);
      return nivel !== null ? { nivel } : null;
    }
    case "query_familias_hijos": {
      const minHijos = safeInteger(input.minHijos, 1, 20);
      return minHijos !== null ? { minHijos } : null;
    }
    case "query_resumen_financiero":
    case "query_discrepancia":
      return {};
    default:
      return null;
  }
}

function normalizeClaudeTurns(value: unknown): ClaudeConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const user = safeHistoryText((candidate as any).user);
    const assistant = safeHistoryText((candidate as any).assistant);
    if (!user || !assistant) return [];
    const tools = Array.isArray((candidate as any).tools)
      ? (candidate as any).tools
        .slice(0, MAX_HISTORICAL_TOOLS_PER_TURN)
        .flatMap((tool: unknown) => {
          if (!tool || typeof tool !== "object" || typeof (tool as any).name !== "string") return [];
          const input = normalizeHistoricalToolInput((tool as any).name, (tool as any).input);
          return input ? [{ name: (tool as any).name, input }] : [];
        })
      : [];
    return [{ user, assistant, tools }];
  }).slice(-MAX_CONVERSATION_TURNS);
}

async function appendRevalidatedHistoricalTurn(
  messages: Anthropic.MessageParam[],
  exchange: { user: string; assistant: string },
  storedTurn: ClaudeConversationTurn | undefined,
  index: number,
  context: AssistantClaudeContext,
  options: {
    canRead: (actionId: string, params: Record<string, any>) => boolean;
  },
  runAction: (actionId: string, params: Record<string, any>, ctx: ActionContext) => Promise<ActionResult>,
): Promise<void> {
  if (!storedTurn?.tools.length) {
    messages.push(
      { role: "user", content: exchange.user },
      { role: "assistant", content: exchange.assistant },
    );
    return;
  }

  const toolUses: any[] = [];
  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  let omitHistoricalTurn = false;
  for (let toolIndex = 0; toolIndex < storedTurn.tools.length; toolIndex++) {
    const storedTool = storedTurn.tools[toolIndex];
    const actionId = TOOL_TO_ACTION[storedTool.name];
    const input = normalizeHistoricalToolInput(storedTool.name, storedTool.input);
    if (!actionId || !input) {
      omitHistoricalTurn = true;
      break;
    }

    const toolUseId = `history-${index}-${toolIndex}`;
    toolUses.push({
      type: "tool_use",
      id: toolUseId,
      name: storedTool.name,
      input,
    });

    if (!options.canRead(actionId, input)) {
      omitHistoricalTurn = true;
      break;
    }

    try {
      const result = await runAction(actionId, input, context);
      if (!result.success) {
        omitHistoricalTurn = true;
        break;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUseId,
        content: JSON.stringify(serializeToolResult(storedTool.name, result)),
      });
    } catch {
      omitHistoricalTurn = true;
      break;
    }
  }

  // Si una consulta histórica ya no es visible en la sesión actual, no mandamos
  // tampoco el texto antiguo a Anthropic: podría contener cifras protegidas.
  if (omitHistoricalTurn) return;

  if (toolUses.length === 0) {
    messages.push(
      { role: "user", content: exchange.user },
      { role: "assistant", content: exchange.assistant },
    );
    return;
  }

  // Formato oficial de Anthropic: user → assistant/tool_use → user/tool_result
  // → assistant. Los resultados se regeneran arriba, nunca se aceptan del cliente.
  messages.push(
    { role: "user", content: exchange.user },
    { role: "assistant", content: toolUses },
    { role: "user", content: toolResults },
    { role: "assistant", content: exchange.assistant },
  );
}

async function buildConversationMessages(
  currentMessage: string,
  history: AssistantConversationHistory | undefined,
  context: AssistantClaudeContext,
  options: {
    canRead: (actionId: string, params: Record<string, any>) => boolean;
  },
  runAction: (actionId: string, params: Record<string, any>, ctx: ActionContext) => Promise<ActionResult>,
): Promise<Anthropic.MessageParam[]> {
  const exchanges = normalizeVisibleHistory(history?.messages, currentMessage);
  const storedTurns = normalizeClaudeTurns(history?.claudeTurns);
  const usedTurnIndexes = new Set<number>();
  const messages: Anthropic.MessageParam[] = [];

  for (let index = 0; index < exchanges.length; index++) {
    const exchange = exchanges[index];
    const storedIndex = storedTurns.findIndex(
      (turn, turnIndex) => !usedTurnIndexes.has(turnIndex)
        && turn.user === exchange.user
        && turn.assistant === exchange.assistant,
    );
    if (storedIndex >= 0) usedTurnIndexes.add(storedIndex);
    await appendRevalidatedHistoricalTurn(
      messages,
      exchange,
      storedIndex >= 0 ? storedTurns[storedIndex] : undefined,
      index,
      context,
      options,
      runAction,
    );
  }

  messages.push({ role: "user", content: currentMessage });
  return messages;
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block: any) => block?.type === "text" && typeof block.text === "string")
    .map((block: any) => block.text)
    .join("\n")
    .trim();
}

function safeErrorMessage(error: any): string {
  return String(error?.message || "unknown_error")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/x-api-key[^,\s]*/gi, "x-api-key=[redacted]")
    .slice(0, 240);
}

function safeProviderField(value: string | number): string | number {
  if (typeof value === "number") return value;
  const text = String(value).slice(0, 300);
  return containsSensitiveAssistantData(text) ? "[dato protegido]" : text;
}

function numericTokens(value: string): string[] {
  return value.match(/(?:\$\s*)?\d[\d,.]*(?:%?)/g) ?? [];
}

function containsExactToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\d)${escaped}(?!\\d)`).test(text);
}

function preservesToolFigures(reply: string, sources: string[]): boolean {
  const sourceTokens = new Set(sources.flatMap(numericTokens));
  const replyTokens = numericTokens(reply);
  const requiredFigures = Array.from(sourceTokens).filter((token) => {
    if (token.includes("$") || token.includes("%")) return true;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return sources.some((source) => new RegExp(`\\*\\*\\s*${escaped}(?=\\s|\\*)`).test(source));
  });
  return requiredFigures.every((token) => containsExactToken(reply, token))
    && replyTokens.every((token) => sourceTokens.has(token));
}

function containsOnlyToolFigures(reply: string, sources: string[]): boolean {
  const sourceTokens = new Set(sources.flatMap(numericTokens));
  return numericTokens(reply).every((token) => sourceTokens.has(token));
}

function preservesExecutiveMetricAssociations(
  reply: string,
  rows: Array<{ label: string; value: string }>,
): boolean {
  if (rows.length < 5) return true;
  const expectedMetrics = [
    { label: /cobrad/i, terms: /cobrad|recaud|ingres/i },
    { label: /por cobrar|no vencid/i, terms: /por cobrar|pendient|no vencid/i },
    { label: /^vencido$/i, terms: /vencid|atrasad/i },
    { label: /beca/i, terms: /beca/i },
    { label: /descuent/i, terms: /descuent/i },
  ];
  return expectedMetrics.every(({ label, terms }) => {
    const row = rows.find((candidate) => label.test(candidate.label));
    if (!row) return false;
    const escapedValue = row.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const valuePattern = new RegExp(`(?<!\\d)${escapedValue}(?!\\d)`, "g");
    const matches = Array.from(reply.matchAll(valuePattern));
    return matches.some((match) => {
      const index = match.index ?? 0;
      const context = reply.slice(Math.max(0, index - 45), index + row.value.length + 45);
      return terms.test(context);
    });
  });
}

function boldVerifiedFigures(reply: string, sources: string[]): string {
  const sourceTokens = new Set(sources.flatMap(numericTokens));
  const requiredFigures = Array.from(sourceTokens).filter((token) => {
    if (token.includes("$") || token.includes("%")) return true;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return sources.some((source) => new RegExp(`\\*\\*\\s*${escaped}(?=\\s|\\*)`).test(source));
  });
  return requiredFigures.reduce((text, token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(
      new RegExp(`(?<!\\d)${escaped}(?!\\d)`, "g"),
      (match, offset, fullText) => {
        const boldMarkersBefore = (fullText.slice(0, offset).match(/\*\*/g) ?? []).length;
        return boldMarkersBefore % 2 === 1 ? match : `**${match}**`;
      },
    );
  }, reply);
}

/**
 * Convierte el resultado interno a un DTO explícito antes de cruzar el límite
 * hacia Anthropic. Nunca se envían errores SQL ni texto libre de motivos de beca.
 */
function serializeToolResult(toolName: string, result: ActionResult): Record<string, unknown> {
  if (!result.success) {
    return {
      success: false,
      title: "Consulta no disponible",
      summary: "No fue posible completar esta consulta con los datos disponibles.",
      rows: [],
    };
  }

  const rows = (result.rows ?? []).slice(0, 100).map((row) => {
    const value = toolName === "query_becas_alumno" || toolName === "query_becas_nivel"
      ? String(row.value).split("·")[0].trim()
      : row.value;
    return {
      label: safeProviderField(row.label),
      value: safeProviderField(value),
      highlight: Boolean(row.highlight),
    };
  });
  const dto = {
    success: true,
    title: safeProviderField(result.title),
    summary: safeProviderField(result.summary),
    rows,
  };

  return containsSensitiveAssistantData(JSON.stringify(dto))
    ? {
      success: false,
      title: "Consulta no disponible",
      summary: "Los resultados contienen datos protegidos que no se pueden enviar al asistente externo.",
      rows: [],
    }
    : dto;
}

function currentSystemPrompt(): string {
  const now = new Date();
  const currentYear = new Date().getFullYear();
  const currentMonth = now.getMonth() + 1;
  return [
    "Eres el asistente de EduPay para consultas administrativas de solo lectura.",
    "Responde en español claro y breve. Usa una herramienta read-only cuando necesites datos; no inventes cifras.",
    "Sólo puedes consultar el tenant y campus ya delimitados por el servidor.",
    "Nunca solicites, reveles ni infieras CURP, RFC, contraseñas, tokens o datos de autenticación.",
    "Nunca propongas ni ejecutes pagos, cargos, becas, facturas, conciliaciones, configuraciones o cualquier modificación.",
    `La fecha de referencia del servidor está en el año ${currentYear}. Si indican un mes sin año, usa ${currentYear}.`,
    `Para un resumen ejecutivo o estado financiero mensual, usa siempre query_resumen_ejecutivo_mes. “Este mes” corresponde a mes ${currentMonth} de ${currentYear}.`,
    "Para preguntas sobre quién debe, deudores o quién falta de pagar sin periodo explícito, consulta los adeudos del mes en curso y menciona el periodo usado. Para otros tipos de consulta, pide aclaración sólo si el periodo es indispensable.",
    "Habla como un asistente cercano que ayuda al director de la escuela: usa un tono cálido, natural y conversacional, no una tabla de Excel narrada. No uses emojis. Prefiere frases corridas y usa listas sólo cuando el usuario pida una lista o haya varios alumnos que enumerar.",
    "Las cifras de las herramientas son una frontera estricta: conserva cada monto y cifra exacta tal como aparece, incluyendo el signo $, separadores y negritas Markdown. No redondees, aproximes, conviertas a palabras ni inventes cifras nuevas. Si no puedes reformular sin cambiar una cifra, usa el texto verificado de la herramienta.",
    "En un resumen ejecutivo menciona explícitamente cobrado, por cobrar no vencido, vencido, alumnos con beca activa y descuentos aplicados, con la cifra asociada a cada indicador aunque dos importes coincidan.",
    "Cuando una herramienta ya entregó todos los datos, responde con ellos directamente en un mensaje breve y natural; no vuelvas a llamar herramientas innecesariamente.",
    "Si el usuario pregunta por “esos”, “esas” o resultados anteriores, limita la respuesta a las personas ya mencionadas en el historial y verifica cualquier dato nuevo con herramientas de sólo lectura.",
  ].join(" ");
}

export async function answerWithClaude(
  message: string,
  context: AssistantClaudeContext,
  options: {
    client?: ClaudeClient | null;
    canRead: (actionId: string, params: Record<string, any>) => boolean;
    runAction?: (actionId: string, params: Record<string, any>, ctx: ActionContext) => Promise<ActionResult>;
    history?: AssistantConversationHistory;
    requiredTool?: "query_resumen_ejecutivo_mes" | "query_adeudos_nivel_periodo";
    prefetchedTool?: {
      name: "query_resumen_ejecutivo_mes" | "query_adeudos_nivel_periodo";
      input: Record<string, unknown>;
      result: ActionResult;
    };
  },
): Promise<ClaudeAnswer> {
  const trace: ClaudeTrace = {
    model: CLAUDE_MODEL,
    toolCalls: [],
    adeudosPeriodos: [],
    rounds: 0,
    stopReason: null,
  };
  if (containsSensitiveAssistantData(message)) {
    return {
      handled: true,
      reply: "No puedo consultar ni compartir CURP, RFC, contraseñas, tokens, credenciales o secretos.",
      trace,
    };
  }
  const client = options.client === undefined ? createClient() : options.client;
  if (!client) return { handled: false, trace, error: "missing_api_key" };

  const runAction = options.runAction ?? executeAction;
  const messages = await buildConversationMessages(
    message,
    options.history,
    context,
    options,
    runAction,
  );
  const conversationTools: ClaudeConversationTool[] = [];
  const studentTargets = new Map<number, StudentNavigationTarget>();
  const toolFactSources: string[] = [];
  const toolFallbackReplies: string[] = [];
  const toolFactRequirements: string[] = [];
  const toolFallbackRows: Array<{ label: string; value: string }> = [];
  const toolNaturalFallbacks: string[] = [];
  let executiveSummaryRows: Array<{ label: string; value: string }> = [];
  const addVerifiedToolFacts = (toolName: string, result: ActionResult) => {
    if (!result.success) return;
    const rows = (result.rows ?? []).map((row) => ({
      label: String(row.label),
      value: String(row.value),
    }));
    toolFactSources.push(result.summary);
    toolFactSources.push(...rows.map((row) => row.value));
    toolFactRequirements.push(...rows.map((row) => `${row.label}: ${row.value}`));
    toolFallbackRows.push(...rows);
    toolFallbackReplies.push(result.summary);
    if (toolName === "query_resumen_ejecutivo_mes" && rows.length >= 5) {
      executiveSummaryRows = rows;
      toolNaturalFallbacks.push(
        `El mes va avanzando: ya se han cobrado **${rows[0].value}**. ` +
        `Aún quedan **${rows[1].value}** por recuperar antes de vencer y **${rows[2].value}** ya vencido, que conviene atender. ` +
        `Actualmente **${rows[3].value}** alumnos tienen beca activa, con **${rows[4].value}** en descuentos aplicados.`,
      );
    }
  };

  if (options.prefetchedTool) {
    const safeInput = normalizeHistoricalToolInput(options.prefetchedTool.name, options.prefetchedTool.input);
    if (!safeInput) {
      return {
        handled: false,
        trace,
        error: "invalid_prefetched_tool",
      };
    }
    const toolUseId = "prefetched-current-query";
    trace.toolCalls.push(options.prefetchedTool.name);
    conversationTools.push({ name: options.prefetchedTool.name, input: safeInput });
    addVerifiedToolFacts(options.prefetchedTool.name, options.prefetchedTool.result);
    messages.push(
      {
        role: "assistant",
        content: [{
          type: "tool_use",
          id: toolUseId,
          name: options.prefetchedTool.name,
          input: safeInput,
        }],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: JSON.stringify(serializeToolResult(options.prefetchedTool.name, options.prefetchedTool.result)),
          },
          {
            type: "text",
            text: [
              "Los resultados de las herramientas ya contienen los datos disponibles.",
              "Responde ahora con tono cercano y natural; no vuelvas a llamar una herramienta salvo que falte un dato indispensable.",
              options.prefetchedTool.name === "query_resumen_ejecutivo_mes"
                ? "Para este resumen usa 2 o 3 frases corridas, sin viñetas ni emojis."
                : "Para este resultado usa frases breves y naturales; enumera alumnos sólo si el detalle lo requiere.",
              `Incluye literalmente todos estos valores verificados: ${Array.from(new Set(toolFactSources.flatMap(numericTokens))).join(", ") || "ninguno"}.`,
              `Menciona cada indicador verificado, sin fusionarlos: ${toolFactRequirements.join(" | ") || "usa el summary de la herramienta"}.`,
              "No agregues ninguna cifra distinta.",
            ].join(" "),
          },
        ],
      },
    );
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      trace.rounds = round + 1;
      const request: Record<string, unknown> = {
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: currentSystemPrompt(),
        tools: TOOLS,
        messages,
      };
      if (round === 0 && options.requiredTool) {
        request.tool_choice = { type: "tool", name: options.requiredTool };
      }
      const response = await client.messages.create(request);
      trace.stopReason = response.stop_reason ?? null;

      const toolUses = Array.isArray(response.content)
        ? response.content.filter((block: any) => block?.type === "tool_use")
        : [];
      const reply = textFromContent(response.content);

      if (toolUses.length === 0) {
        if (containsSensitiveAssistantData(reply)) {
          return {
            handled: true,
            reply: "No puedo mostrar datos sensibles como CURP, RFC, contraseñas, tokens, credenciales o secretos.",
            trace,
          };
        }
        const verifiedDetails = toolFallbackRows.length
          ? `\n\nDetalle verificado:\n${toolFallbackRows.map((row) => `- ${row.label}: ${row.value}`).join("\n")}`
          : "";
        const verifiedFallbackBase = (toolNaturalFallbacks.length
          ? toolNaturalFallbacks
          : toolFallbackReplies
        ).filter(Boolean).join("\n\n");
        const verifiedFallback = toolNaturalFallbacks.length
          ? verifiedFallbackBase
          : verifiedDetails
            ? `Estos son los adeudos que conviene revisar este mes. ${verifiedFallbackBase}${verifiedDetails}`
            : verifiedFallbackBase;
        const hasAdeudosResult = conversationTools.some(
          (tool) => tool.name === "query_adeudos_nivel_periodo",
        );
        const hasVerifiedExecutiveAssociations = preservesExecutiveMetricAssociations(
          reply,
          executiveSummaryRows,
        );
        const finalReply = hasAdeudosResult
          ? boldVerifiedFigures(verifiedFallback, toolFactSources)
          : reply && preservesToolFigures(reply, toolFactSources) && hasVerifiedExecutiveAssociations
          ? boldVerifiedFigures(reply, toolFactSources)
          : reply && executiveSummaryRows.length === 0 && containsOnlyToolFigures(reply, toolFactSources) && verifiedDetails
            ? boldVerifiedFigures(`${reply}${verifiedDetails}`, toolFactSources)
            : boldVerifiedFigures(verifiedFallback, toolFactSources) || "No pude obtener una respuesta de Claude.";
        return {
          handled: Boolean(reply),
          reply: finalReply,
          trace,
          conversationTurn: {
            user: message,
            assistant: finalReply,
            tools: conversationTools,
          },
          studentTargets: studentTargets.size ? Array.from(studentTargets.values()) : undefined,
        };
      }

      messages.push({ role: "assistant", content: response.content as any });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        const actionId = TOOL_TO_ACTION[toolUse.name];
        trace.toolCalls.push(toolUse.name);
        const toolInput = inputObject(toolUse.input);
        if (
          toolUse.name === "query_adeudos_nivel_periodo"
          && /\btodos?\s+los\s+niveles\b/i.test(message)
        ) {
          toolInput.nivel = "";
        }
        if (toolUse.name === "query_adeudos_nivel_periodo") {
          const nivel = typeof toolInput.nivel === "string" ? toolInput.nivel.trim() : "";
          trace.adeudosPeriodos.push({
            mes: Number.isInteger(Number(toolInput.mes)) ? Number(toolInput.mes) : null,
            anio: Number.isInteger(Number(toolInput.anio)) ? Number(toolInput.anio) : null,
            nivel: /^(todos?|todas?)\b/i.test(nivel) || !nivel ? "todos" : "filtrado",
          });
        }
        if (!actionId) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            is_error: true,
            content: "Herramienta no permitida.",
          });
          continue;
        }

        if (!options.canRead(actionId, toolInput)) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            is_error: true,
            content: "No tienes permiso para consultar esta información.",
          });
          continue;
        }

        const result = await runAction(actionId, toolInput, context);
        for (const target of result.studentTargets ?? []) {
          const id = Number(target.id);
          const name = typeof target.name === "string" ? target.name.trim() : "";
          if (Number.isSafeInteger(id) && id > 0 && name) {
            studentTargets.set(id, { id, name });
          }
        }
        const safeToolInput = normalizeHistoricalToolInput(toolUse.name, toolInput);
        if (safeToolInput) {
          conversationTools.push({ name: toolUse.name, input: safeToolInput });
        }
        if (result.success) {
          addVerifiedToolFacts(toolUse.name, result);
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(serializeToolResult(toolUse.name, result)),
        });
      }

      messages.push({
        role: "user",
        content: [
          ...toolResults,
          {
            type: "text",
            text: [
              "Los resultados de las herramientas ya contienen los datos disponibles.",
              "Responde ahora con tono cercano y natural; no vuelvas a llamar una herramienta salvo que falte un dato indispensable.",
              `Incluye literalmente todos estos valores verificados: ${Array.from(new Set(toolFactSources.flatMap(numericTokens))).join(", ") || "ninguno"}.`,
              `Menciona cada indicador verificado, sin fusionarlos: ${toolFactRequirements.join(" | ") || "usa el summary de la herramienta"}.`,
              "No agregues ninguna cifra distinta.",
            ].join(" "),
          },
        ],
      });
    }

    return {
      handled: true,
      reply: "La consulta requiere más pasos de los permitidos. Intenta hacerla más específica.",
      trace,
    };
  } catch (error: any) {
    console.error("[assistant][claude] request failed", {
      model: CLAUDE_MODEL,
      toolCalls: trace.toolCalls,
      rounds: trace.rounds,
      error: error?.name || "unknown_error",
      status: error?.status ?? null,
      message: safeErrorMessage(error),
    });
    return {
      handled: true,
      reply: "No pude consultar Claude en este momento. Intenta de nuevo o usa el módulo correspondiente.",
      trace,
      error: error?.name || "claude_request_failed",
    };
  }
}