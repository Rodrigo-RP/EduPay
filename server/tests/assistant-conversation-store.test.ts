import { describe, expect, it, beforeEach } from "vitest";
import {
  appendTrustedConversationTurn,
  getTrustedConversationHistory,
  resetAssistantConversationStoreForTest,
  type AssistantConversationSession,
} from "../assistant-conversation-store";

const session: AssistantConversationSession = {
  key: "test-session",
  binding: {
    userId: 80,
    tenantId: 29,
    campusId: 48,
    role: "administrador_general",
    permissions: ["FINANCIAL:READ"],
  },
};

describe("memoria confiable del asistente", () => {
  beforeEach(() => resetAssistantConversationStoreForTest());

  it("entrega sólo turnos previamente registrados por el servidor", () => {
    appendTrustedConversationTurn(session, {
      user: "quién debe agosto",
      assistant: "Alma tiene adeudo.",
      tools: [{ name: "query_adeudos_nivel_periodo", input: { mes: 8, anio: 2026, nivel: "" } }],
    });

    expect(getTrustedConversationHistory(session)).toMatchObject({
      messages: [
        { role: "user", content: "quién debe agosto" },
        { role: "assistant", content: "Alma tiene adeudo." },
      ],
      claudeTurns: [
        expect.objectContaining({ user: "quién debe agosto" }),
      ],
    });
  });

  it("invalida la memoria si cambia el campus o los permisos efectivos", () => {
    appendTrustedConversationTurn(session, {
      user: "quién debe agosto",
      assistant: "Alma tiene adeudo.",
      tools: [],
    });

    expect(getTrustedConversationHistory({
      ...session,
      binding: { ...session.binding, campusId: 99 },
    })).toEqual({});
  });
});