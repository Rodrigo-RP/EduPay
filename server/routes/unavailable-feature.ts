import type { RequestHandler } from "express";

/** No consulta SQL, no escribe y no llama a proveedores. Autenticar antes. */
export function unavailableFeature(canAccess: (user: any) => boolean): RequestHandler {
  return (req: any, res) => {
    if (!canAccess(req.user)) {
      return res.status(403).json({ message: "Sin permisos para esta función" });
    }
    return res.status(501).json({
      code: "NO_DISPONIBLE",
      message: "No disponible por ahora",
    });
  };
}
