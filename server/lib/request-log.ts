import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
export function requestMetadataLogger(write: (line: string) => void): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    // No confiar en identificadores enviados por el cliente: podrían ser un token.
    const correlationId = randomUUID();
    res.setHeader("X-Correlation-ID", correlationId);
    res.on("finish", () => {
      // Sólo plantilla registrada. Nunca URL original, query, params ni ruta 404.
      const route = typeof req.route?.path === "string" ? req.route.path : "[unmatched]";
      write(JSON.stringify({
        method: methods.has(req.method) ? req.method : "OTHER",
        route,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
        correlationId,
      }));
    });
    next();
  };
}
