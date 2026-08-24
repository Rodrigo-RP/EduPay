import { describe, expect, it, vi } from "vitest";
import {
  answerWithClaude,
  getClaudeToolDefinitions,
  type ClaudeClient,
} from "../assistant-claude";
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
    expect(names.every((name) => name.startsWith("query_"))).toBe(true);
    expect(names).not.toContain("crear_pago");
    expect(names).not.toContain("ejecutar_sql");
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