import { describe, expect, it, vi } from "vitest";
import {
  answerWithClaude,
  getAssistantActionPermission,
  getClaudeToolDefinitions,
  type ClaudeClient,
} from "../assistant-claude";
import { executeAction } from "../assistant-actions";
import { isClaudeReadOnlyFallbackCandidate, matchIntent } from "../assistant-knowledge";
import { resolveJwtSecret } from "../routes/shared";

const context = {
  campusId: 48,
  tenantId: 29,
  userId: 80,
  role: "administrador_general",
};

function clientWith(responses: any[]): ClaudeClient {
  return {
    messages: {
      create: vi.fn().mockImplementation(async () => responses.shift()),
    },
  };
}

describe("fallback de Claude con herramientas read-only", () => {
  it("publica únicamente herramientas de consulta cerradas", () => {
    const names = getClaudeToolDefinitions().map((tool) => tool.name);
    expect(names).toContain("query_adeudos_nivel_periodo");
    expect(names).toContain("query_resumen_ejecutivo_mes");
    expect(names.every((name) => name.startsWith("query_"))).toBe(true);
    expect(names).not.toContain("crear_pago");
    expect(names).not.toContain("ejecutar_sql");
  });

  it("devuelve el resumen ejecutivo determinista en una sola respuesta", async () => {
    const client = clientWith([
      {
        stop_reason: "tool_use",
        content: [{
          type: "tool_use",
          id: "tool-resumen-ejecutivo",
          name: "query_resumen_ejecutivo_mes",
          input: { mes: 8, anio: 2026 },
        }],
      },
    ]);
    const runAction = vi.fn().mockResolvedValue({
      success: true,
      title: "Resumen ejecutivo — Agosto 2026",
      summary:
        "En **Agosto 2026** se han cobrado **$1,500**. " +
        "Quedan **$625** por cobrar y **$980** vencido. " +
        "Actualmente **2 alumnos** tienen beca activa, con **$625** en descuentos aplicados al periodo.",
      rows: [],
    });

    const result = await answerWithClaude(
      "dame un resumen del estado financiero de este mes",
      context,
      { client, canRead: () => true, runAction },
    );

    expect(result.handled).toBe(true);
    expect(result.reply).toContain("**$1,500**");
    expect(result.reply).toContain("**$625** por cobrar");
    expect(result.reply).toContain("**$980** vencido");
    expect(result.reply).toContain("**2 alumnos** tienen beca activa");
    expect(result.trace.toolCalls).toEqual(["query_resumen_ejecutivo_mes"]);
    expect(runAction).toHaveBeenCalledWith(
      "query:resumen_ejecutivo_mes",
      { mes: 8, anio: 2026 },
      context,
    );
    expect(client.messages.create).toHaveBeenCalledTimes(1);
    expect(getAssistantActionPermission("query:resumen_ejecutivo_mes")).toEqual(
      getAssistantActionPermission("query:resumen_financiero"),
    );
  });

  it("rechaza un periodo ejecutivo inválido sin consultar ni modificar datos", async () => {
    const result = await executeAction(
      "query:resumen_ejecutivo_mes",
      { mes: 13, anio: 2026 },
      context,
    );

    expect(result).toMatchObject({
      success: false,
      title: "Periodo inválido",
    });
    expect(result.summary).toMatch(/mes entre 1 y 12/i);
  });

  it("ejecuta la consulta permitida y devuelve la respuesta final de Claude", async () => {
    const client = clientWith([
      {
        stop_reason: "tool_use",
        content: [{
          type: "tool_use",
          id: "tool-adeudos",
          name: "query_adeudos_nivel_periodo",
          input: { mes: 8, anio: 2026, nivel: "" },
        }],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Hay dos alumnos con adeudo en agosto." }],
      },
    ]);
    const runAction = vi.fn().mockResolvedValue({
      success: true,
      title: "Alumnos con adeudo",
      summary: "Encontré dos alumnos.",
      rows: [{ label: "Alumno de prueba", value: "$1,000" }],
      studentTargets: [{ id: 321, name: "Alumno de prueba" }],
    });

    const result = await answerWithClaude(
      "qué alumnos faltan de pagar la colegiatura de agosto de todos los niveles",
      context,
      { client, canRead: () => true, runAction },
    );

    expect(result.reply).toBe("Hay dos alumnos con adeudo en agosto.");
    expect(result.trace.toolCalls).toEqual(["query_adeudos_nivel_periodo"]);
    expect(runAction).toHaveBeenCalledWith(
      "query:adeudos_nivel_periodo",
      { mes: 8, anio: 2026, nivel: "" },
      context,
    );
    expect(client.messages.create).toHaveBeenCalledTimes(2);
    expect(result.studentTargets).toEqual([{ id: 321, name: "Alumno de prueba" }]);
    const toolResult = (client.messages.create as any).mock.calls[1][0].messages.at(-1).content[0].content;
    expect(JSON.parse(toolResult).students).toBeUndefined();
  });

  it("reconstruye un turno histórico con tool_use y tool_result validados", async () => {
    const firstQuestion = "qué alumnos faltan de pagar la colegiatura de agosto";
    const firstAnswer = "Alma Claude y Bruno Claude tienen adeudo.";
    const client = clientWith([
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "De esos alumnos, sólo Alma Claude tiene una beca vigente." }],
      },
    ]);
    const runAction = vi.fn().mockResolvedValue({
      success: true,
      title: "Alumnos con adeudo",
      summary: "Encontré dos alumnos.",
      rows: [
        { label: "Alma Claude", value: "$1,250" },
        { label: "Bruno Claude", value: "$980" },
      ],
    });
    const canRead = vi.fn(() => true);

    await answerWithClaude(
      "¿y de esos, cuáles ya tienen beca?",
      context,
      {
        client,
        canRead,
        runAction,
        history: {
          messages: [
            { role: "user", content: firstQuestion },
            { role: "assistant", content: firstAnswer },
            { role: "user", content: "¿y de esos, cuáles ya tienen beca?" },
          ],
          claudeTurns: [{
            user: firstQuestion,
            assistant: firstAnswer,
            tools: [{
              name: "query_adeudos_nivel_periodo",
              input: { mes: 8, anio: 2026, nivel: "" },
            }],
          }],
        },
      },
    );

    const request = (client.messages.create as any).mock.calls[0][0];
    expect(request.messages).toHaveLength(5);
    expect(request.messages[0]).toMatchObject({ role: "user", content: firstQuestion });
    expect(request.messages[1].content[0]).toMatchObject({
      type: "tool_use",
      name: "query_adeudos_nivel_periodo",
      id: "history-0-0",
    });
    expect(request.messages[2].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "history-0-0",
    });
    expect(request.messages[3]).toMatchObject({ role: "assistant", content: firstAnswer });
    expect(request.messages[4]).toMatchObject({ role: "user", content: "¿y de esos, cuáles ya tienen beca?" });
    expect(canRead).toHaveBeenCalledWith(
      "query:adeudos_nivel_periodo",
      { mes: 8, anio: 2026, nivel: "" },
    );
    expect(runAction).toHaveBeenCalledWith(
      "query:adeudos_nivel_periodo",
      { mes: 8, anio: 2026, nivel: "" },
      context,
    );
  });

  it("no reutiliza datos históricos si el permiso actual ya no permite la consulta", async () => {
    const client = clientWith([
      { stop_reason: "end_turn", content: [{ type: "text", text: "No tengo permiso actual para ver esa beca." }] },
    ]);
    const runAction = vi.fn();

    await answerWithClaude("¿y de esos, cuáles tienen beca?", context, {
      client,
      canRead: () => false,
      runAction,
      history: {
        messages: [
          { role: "user", content: "qué alumnos tienen adeudo" },
          { role: "assistant", content: "Alma tiene adeudo." },
        ],
        claudeTurns: [{
          user: "qué alumnos tienen adeudo",
          assistant: "Alma tiene adeudo.",
          tools: [{ name: "query_adeudos_nivel_periodo", input: { mes: 8, anio: 2026, nivel: "" } }],
        }],
      },
    });

    const request = (client.messages.create as any).mock.calls[0][0];
    expect(JSON.stringify(request.messages)).not.toContain("Alma tiene adeudo.");
    expect(JSON.stringify(request.messages)).not.toContain("query_adeudos_nivel_periodo");
    expect(runAction).not.toHaveBeenCalled();
  });

  it("revalida el permiso de un resumen ejecutivo histórico antes de exponerlo", async () => {
    const client = clientWith([
      { stop_reason: "end_turn", content: [{ type: "text", text: "No tengo permiso actual para ese resumen." }] },
    ]);
    const runAction = vi.fn();

    await answerWithClaude("¿y cómo cambió desde entonces?", context, {
      client,
      canRead: () => false,
      runAction,
      history: {
        messages: [
          { role: "user", content: "dame un resumen del estado financiero de agosto" },
          { role: "assistant", content: "Resumen de agosto." },
        ],
        claudeTurns: [{
          user: "dame un resumen del estado financiero de agosto",
          assistant: "Resumen de agosto.",
          tools: [{ name: "query_resumen_ejecutivo_mes", input: { mes: 8, anio: 2026 } }],
        }],
      },
    });

    const request = (client.messages.create as any).mock.calls[0][0];
    expect(JSON.stringify(request.messages)).not.toContain("Resumen de agosto.");
    expect(JSON.stringify(request.messages)).not.toContain("query_resumen_ejecutivo_mes");
    expect(runAction).not.toHaveBeenCalled();
  });

  it("acota el historial a los últimos ocho intercambios", async () => {
    const history = Array.from({ length: 9 }, (_, index) => ([
      { role: "user", content: `pregunta ${index}` },
      { role: "assistant", content: `respuesta ${index}` },
    ])).flat();
    const client = clientWith([
      { stop_reason: "end_turn", content: [{ type: "text", text: "Respuesta final." }] },
    ]);

    await answerWithClaude("pregunta actual", context, {
      client,
      canRead: () => true,
      history: { messages: history },
    });

    const messages = (client.messages.create as any).mock.calls[0][0].messages;
    expect(messages).toHaveLength(17);
    expect(messages[0]).toMatchObject({ content: "pregunta 1" });
    expect(messages.at(-1)).toMatchObject({ content: "pregunta actual" });
  });

  it("rechaza una herramienta no registrada sin ejecutar ninguna consulta", async () => {
    const client = clientWith([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tool-unknown", name: "ejecutar_sql", input: { sql: "DELETE FROM charges" } }],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "No puedo ejecutar esa acción." }],
      },
    ]);
    const runAction = vi.fn();

    const result = await answerWithClaude(
      "borra todos los cargos",
      context,
      { client, canRead: () => true, runAction },
    );

    expect(result.reply).toBe("No puedo ejecutar esa acción.");
    expect(runAction).not.toHaveBeenCalled();
    expect(result.trace.toolCalls).toEqual(["ejecutar_sql"]);
  });

  it("no ejecuta conteos cuando la entidad no está autorizada", async () => {
    const client = clientWith([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tool-family-count", name: "query_contar", input: { entity: "familias" } }],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "No tienes permiso." }],
      },
    ]);
    const runAction = vi.fn();
    const canRead = vi.fn((_actionId: string, params: Record<string, unknown>) => params.entity !== "familias");

    await answerWithClaude("cuántas familias hay", context, { client, canRead, runAction });

    expect(canRead).toHaveBeenCalledWith("query:contar", { entity: "familias" });
    expect(runAction).not.toHaveBeenCalled();
  });

  it("admite consultas escolares amplias y mantiene la navegación local", () => {
    expect(
      isClaudeReadOnlyFallbackCandidate(
        "qué alumnos faltan de pagar la colegiatura de agosto de todos los niveles",
      ),
    ).toBe(true);
    expect(isClaudeReadOnlyFallbackCandidate("dame una receta de pasta")).toBe(false);
    expect(isClaudeReadOnlyFallbackCandidate("¿dónde veo a los alumnos?")).toBe(false);
    expect(
      matchIntent(
        "qué alumnos faltan de pagar la colegiatura de agosto de todos los niveles",
        "administrador_general",
      ).navigate,
    ).toBeUndefined();
  });

  it.each([
    "dime quiénes son los deudores",
    "quien falta de pagar colegiaturas",
  ])("resuelve una consulta natural de deudores con datos locales: %s", (message) => {
    expect(isClaudeReadOnlyFallbackCandidate(message)).toBe(true);
    const intent = matchIntent(message, "super_admin");
    expect(intent.navigate).toBeUndefined();
    expect(intent.action).toMatchObject({
      actionId: "query:adeudos_nivel_periodo",
      params: {
        mes: new Date().getMonth() + 1,
        anio: new Date().getFullYear(),
        nivel: "",
      },
    });
  });

  it("usa el mes anterior cuando se pide la lista de deudores del último mes", () => {
    const now = new Date();
    const expectedMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const expectedYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    expect(matchIntent("dame la lista de deudores del último mes", "super_admin").action).toMatchObject({
      actionId: "query:adeudos_nivel_periodo",
      params: { mes: expectedMonth, anio: expectedYear, nivel: "" },
    });
  });

  it.each([
    "¿cuál es el CURP de MARI010101HDFRRL09?",
    "revisa esta clave sk-ant-api03-abcdefghijklmnopqrstuv",
    "usa el token ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    "consulta esto con eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_value_here",
  ])("no envía valores sensibles al proveedor: %s", async (message) => {
    const client = clientWith([]);
    const result = await answerWithClaude(message, context, { client, canRead: () => true });

    expect(result.reply).toMatch(/no puedo consultar ni compartir/i);
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it("nunca envía motivos de beca ni errores internos en tool results", async () => {
    const client = clientWith([
      {
        stop_reason: "tool_use",
        content: [{
          type: "tool_use",
          id: "tool-beca",
          name: "query_becas_alumno",
          input: { nombre: "Ana" },
        }],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Consulta terminada." }],
      },
    ]);
    const runAction = vi.fn().mockResolvedValue({
      success: true,
      title: "Becas asignadas",
      summary: "Encontré una beca.",
      rows: [{ label: "Ana", value: "50% · MARI010101HDFRRL09", highlight: true }],
    });

    await answerWithClaude("qué beca tiene Ana", context, {
      client,
      canRead: () => true,
      runAction,
    });

    const secondRequest = (client.messages.create as any).mock.calls[1][0];
    const toolContent = secondRequest.messages.at(-1).content[0].content;
    expect(toolContent).toContain("50%");
    expect(toolContent).not.toContain("MARI010101HDFRRL09");

    const errorClient = clientWith([
      {
        stop_reason: "tool_use",
        content: [{
          type: "tool_use",
          id: "tool-beca-error",
          name: "query_becas_alumno",
          input: { nombre: "Ana" },
        }],
      },
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "La consulta no se pudo completar." }],
      },
    ]);
    await answerWithClaude("qué beca tiene Ana", context, {
      client: errorClient,
      canRead: () => true,
      runAction: async () => ({
        success: false,
        title: "Error en becas",
        summary: "password=super-secret-db-error",
      }),
    });
    const errorRequest = (errorClient.messages.create as any).mock.calls[1][0];
    const errorToolContent = errorRequest.messages.at(-1).content[0].content;
    expect(errorToolContent).toContain("Consulta no disponible");
    expect(errorToolContent).not.toContain("password=super-secret-db-error");
  });

  it("exige un secreto de firma configurado", () => {
    expect(() => resolveJwtSecret({} as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET o SESSION_SECRET/);
  });
});