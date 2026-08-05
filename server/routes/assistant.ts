/**
 * server/routes/assistant.ts
 * POST /api/assistant/chat
 *
 * Recibe el mensaje del usuario, llama a matchIntent() y devuelve la respuesta.
 * Diseño: cuando se quiera integrar LLM, solo se reemplaza el cuerpo de
 * matchIntent() en assistant-knowledge.ts — la interfaz de este endpoint no cambia.
 */

import type { Express } from "express";
import { authenticateToken } from "./shared";
import { matchIntent } from "../assistant-knowledge";

export function registerAssistantRoutes(app: Express): void {
  /**
   * POST /api/assistant/chat
   * Body: { message: string, userRole?: string, currentPath?: string }
   * Returns: { reply: string, navigate?: { route, label }, suggestions?: [{ route, label }] }
   */
  app.post("/api/assistant/chat", authenticateToken, async (req: any, res) => {
    try {
      const { message, currentPath } = req.body as {
        message?: string;
        currentPath?: string;
      };

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "El campo message es requerido." });
      }

      if (message.trim().length > 500) {
        return res.status(400).json({ error: "El mensaje no puede superar 500 caracteres." });
      }

      // Obtener el rol del usuario desde el token autenticado
      const userRole: string = req.user?.role || "asistente";

      const result = matchIntent(message.trim(), userRole, currentPath);

      return res.json(result);
    } catch (err: any) {
      console.error("[assistant] Error procesando mensaje:", err.message);
      return res.status(500).json({
        reply: "Ocurrió un error interno. Por favor intenta de nuevo.",
      });
    }
  });
}
