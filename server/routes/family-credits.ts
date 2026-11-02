import type { Express, Request } from "express";
import { authenticateToken, hasPermissionForUser } from "./shared";
import { MODULES, ACTIONS } from "../../shared/permissions";
import { positiveId, centavos } from "../lib/financial-input";
import { applyFamilyCredits, assignOrphanCredit } from "../lib/family-credit-service";
import { CreditError, type CreditScope } from "../lib/stripe-family-credit";

export function registerFamilyCreditRoutes(app: Express) {
  for (const action of ["aplicar-propuesta", "asignar-familia"] as const) {
    app.post(`/api/admin/family-credits/${action}`, authenticateToken, async (req: Request & { user?: CreditScope }, res) => {
      const user = req.user;
      if (!user?.tenant_id || !user.campus_id ||
          !hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
        return res.status(403).json({ message: "Sin permiso para administrar saldos a favor" });
      }
      try {
        if (action === "asignar-familia") {
          const reason = req.body.justificacion;
          if (typeof reason !== "string" || !reason.trim() || reason.length > 2000) {
            return res.status(400).json({ message: "Escribe el motivo de la asignación" });
          }
          return res.json(await assignOrphanCredit(user, positiveId(req.body.credit_id),
            positiveId(req.body.family_id), reason.trim()));
        }
        if (!Array.isArray(req.body.credit_ids) || !req.body.credit_ids.length || req.body.credit_ids.length > 100) {
          return res.status(400).json({ message: "Selecciona los créditos de la propuesta" });
        }
        return res.json(await applyFamilyCredits(user, req.body.credit_ids.map((id: unknown) => positiveId(id)),
          positiveId(req.body.charge_id), centavos(req.body.monto_centavos)));
      } catch (error) {
        const status = error instanceof CreditError ? error.status :
          error instanceof Error && error.name === "FinancialInputError" ? 400 : 500;
        res.status(status).json({ message: status < 500 && error instanceof Error ? error.message :
          "No se pudo guardar. Actualiza e inténtalo de nuevo." });
      }
    });
  }
}
