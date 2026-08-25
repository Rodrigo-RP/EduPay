/**
 * Memoria efímera y confiable del asistente.
 *
 * El navegador puede conservar la conversación para renderizarla, pero nunca es
 * fuente de verdad para Anthropic. Cada transcript se liga al hash de una sesión
 * autenticada y al contexto efectivo de usuario/tenant/campus/permisos.
 */
import { createHash } from "crypto";
import {
  MAX_CONVERSATION_TURNS,
  type AssistantConversationHistory,
  type ClaudeConversationTurn,
} from "./assistant-claude";

const CONVERSATION_TTL_MS = 30 * 60 * 1_000;
const MAX_STORED_SESSIONS = 500;

export type AssistantConversationBinding = {
  userId: number | null;
  tenantId: number | null;
  campusId: number | null;
  role: string;
  permissions: string[];
};

export type AssistantConversationSession = {
  key: string;
  binding: AssistantConversationBinding;
};

type StoredConversation = {
  binding: AssistantConversationBinding;
  turns: ClaudeConversationTurn[];
  updatedAt: number;
};

const conversations = new Map<string, StoredConversation>();

function sameBinding(
  left: AssistantConversationBinding,
  right: AssistantConversationBinding,
): boolean {
  return left.userId === right.userId
    && left.tenantId === right.tenantId
    && left.campusId === right.campusId
    && left.role === right.role
    && left.permissions.length === right.permissions.length
    && left.permissions.every((permission, index) => permission === right.permissions[index]);
}

function pruneExpiredConversations(now = Date.now()): void {
  for (const [key, conversation] of Array.from(conversations.entries())) {
    if (conversation.updatedAt + CONVERSATION_TTL_MS <= now) conversations.delete(key);
  }
  while (conversations.size > MAX_STORED_SESSIONS) {
    const oldestKey = conversations.keys().next().value;
    if (!oldestKey) break;
    conversations.delete(oldestKey);
  }
}

export function getAssistantConversationSession(
  authorization: string | undefined,
  user: any,
): AssistantConversationSession | null {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;
  return {
    key: createHash("sha256").update(token).digest("hex"),
    binding: {
      userId: Number.isInteger(user?.id) ? user.id : null,
      tenantId: Number.isInteger(user?.tenant_id) ? user.tenant_id : null,
      campusId: Number.isInteger(user?.campus_id) ? user.campus_id : null,
      role: typeof user?.role === "string" ? user.role : "asistente",
      permissions: Array.isArray(user?.custom_permissions)
        ? [...user.custom_permissions].filter((item): item is string => typeof item === "string").sort()
        : [],
    },
  };
}

export function getTrustedConversationHistory(
  session: AssistantConversationSession | null,
): AssistantConversationHistory {
  if (!session) return {};
  pruneExpiredConversations();
  const conversation = conversations.get(session.key);
  if (!conversation || !sameBinding(conversation.binding, session.binding)) {
    if (conversation) conversations.delete(session.key);
    return {};
  }

  const turns = conversation.turns.slice(-MAX_CONVERSATION_TURNS);
  return {
    messages: turns.flatMap((turn) => [
      { role: "user", content: turn.user },
      { role: "assistant", content: turn.assistant },
    ]),
    claudeTurns: turns,
  };
}

export function appendTrustedConversationTurn(
  session: AssistantConversationSession | null,
  turn: ClaudeConversationTurn,
): void {
  if (!session) return;
  pruneExpiredConversations();
  const existing = conversations.get(session.key);
  const turns = existing && sameBinding(existing.binding, session.binding)
    ? [...existing.turns, turn].slice(-MAX_CONVERSATION_TURNS)
    : [turn];
  conversations.set(session.key, {
    binding: session.binding,
    turns,
    updatedAt: Date.now(),
  });
}

/** Sólo para aislar pruebas de unidad; no expone limpieza al navegador. */
export function resetAssistantConversationStoreForTest(): void {
  conversations.clear();
}