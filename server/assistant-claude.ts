/**
 * Fallback seguro de Claude para consultas que el motor local no reconoce.
 *
 * Este módulo sólo expone herramientas query:* registradas en el dispatcher.
 * Claude nunca recibe SQL, endpoints de escritura ni identificadores sensibles.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ACTIONS, MODULES } from "@shared/permissions";
import { executeAction, type ActionContext, type ActionResult } from "./assistant-actions";
import { containsSensitiveAssistantData } from "./assistant-knowledge";

export const CLAUDE_MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 4;
const MAX_TOKENS = 900;

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

export type ClaudeAnswer = {
  handled: boolean;
  reply?: string;
  trace: ClaudeTrace;
  error?: string;
};

type ToolDefinition = Anthropic.Tool;

const READ_PERMISSIONS: Record<string, readonly [string, string]> = {
  "query:resumen_financiero": [MODULES.FINANCIAL, ACTIONS.READ],
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
  const currentYear = new Date().getFullYear();
  return [
    "Eres el asistente de EduPay para consultas administrativas de solo lectura.",
    "Responde en español claro y breve. Usa una herramienta read-only cuando necesites datos; no inventes cifras.",
    "Sólo puedes consultar el tenant y campus ya delimitados por el servidor.",
    "Nunca solicites, reveles ni infieras CURP, RFC, contraseñas, tokens o datos de autenticación.",
    "Nunca propongas ni ejecutes pagos, cargos, becas, facturas, conciliaciones, configuraciones o cualquier modificación.",
    `La fecha de referencia del servidor está en el año ${currentYear}. Si indican un mes sin año, usa ${currentYear}.`,
    "Si no indican ningún periodo y es indispensable, pide la aclaración.",
  ].join(" ");
}

export async function answerWithClaude(
  message: string,
  context: AssistantClaudeContext,
  options: {
    client?: ClaudeClient | null;
    canRead: (actionId: string, params: Record<string, any>) => boolean;
    runAction?: (actionId: string, params: Record<string, any>, ctx: ActionContext) => Promise<ActionResult>;
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

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: message }];
  const runAction = options.runAction ?? executeAction;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      trace.rounds = round + 1;
      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: currentSystemPrompt(),
        tools: TOOLS,
        messages,
      });
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
        return { handled: Boolean(reply), reply: reply || "No pude obtener una respuesta de Claude.", trace };
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
            text: "Los resultados de las herramientas ya contienen los datos disponibles. Responde ahora con esos datos; no vuelvas a llamar una herramienta salvo que falte un dato indispensable.",
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