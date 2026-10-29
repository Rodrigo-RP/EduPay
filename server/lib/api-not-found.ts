import type { RequestHandler } from "express";
// Se monta después de las APIs y antes del frontend: una API inexistente
// nunca debe convertirse en el HTML de la SPA con HTTP 200.
export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
};
