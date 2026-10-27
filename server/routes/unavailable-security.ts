import type { Express, Request, RequestHandler } from "express";

/** Funciones aún no implementadas: nunca confirmar cambios inexistentes. */
export function registerUnavailableSecurityRoutes(
  app: Express,
  authenticate: RequestHandler,
  canReadSecurity: (req: Request) => boolean,
): void {
  const routes = [
    ["/api/security/scan", "Sin permisos para ejecutar escaneos de seguridad"],
    ["/api/security/block-ip", "Sin permisos para gestionar bloqueos de seguridad"],
    ["/api/security/enable-2fa", "Sin permisos para configurar seguridad global"],
  ] as const;
  for (const [path, denied] of routes) {
    app.post(path, authenticate, (req, res) => {
      if (!canReadSecurity(req)) return res.status(403).json({ message: denied });
      return res.status(501).json({
        code: "NO_DISPONIBLE",
        message: "Esta función no está disponible todavía",
      });
    });
  }
}
