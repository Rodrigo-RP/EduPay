import type { Express, Request } from "express";
import { pool } from "../db";
import { authenticateToken, hasPermissionForUser } from "./shared";
import { MODULES, ACTIONS } from "../../shared/permissions";
import { positiveId } from "../lib/financial-input";
import { CreditError } from "../lib/stripe-family-credit";
import { type RefundScope } from "../lib/credit-refund-policy";
import {
  assertRefundRole, assertRefundTotp, creditRefundOptions, prepareCreditRefund,
  confirmCreditRefund, publicRefund, type RefundRow,
} from "../lib/credit-refund-service";
import { retryRefund } from "../lib/credit-refund-stripe";
import { stripeRefundProvider, type RefundProvider } from "../lib/refund-provider";
import { schoolDateSQL } from "../../shared/school-date";

/** Únicamente campos públicos; nunca TOTP, claves internas ni datos bancarios. */
export async function listCreditRefunds(scope: Pick<RefundScope, "tenant_id" | "campus_id">) {
  const history = await pool.query<RefundRow & { fecha: string; clave_rastreo: string | null }>(
    `SELECT r.*,COALESCE(r.business_date,${schoolDateSQL("r.created_at AT TIME ZONE 'UTC'")})::text AS fecha,
      r.tracking_key AS clave_rastreo
     FROM credit_refunds r WHERE tenant_id=$1 AND campus_id=$2 ORDER BY id DESC`,
    [scope.tenant_id, scope.campus_id]);
  return history.rows.map(row => ({ ...publicRefund(row), fecha: row.fecha, clave_rastreo: row.clave_rastreo }));
}
export async function refundExceptions(scope: Pick<RefundScope, "tenant_id" | "campus_id">) {
  const history = await listCreditRefunds(scope);
  return history.filter(row => row.incident).map(row => ({
    id: `refund:${row.id}`, refund_id: row.id, origen: "credit_refund",
    descripcion: row.incident, monto_centavos: row.monto_centavos, fecha: row.fecha,
    dias_sin_conciliar: 0, estado_conciliacion: row.status, return_status: row.return_status,
    verificacion: row.verificacion,
  }));
}
export function registerCreditRefundRoutes(app: Express, provider?: RefundProvider) {
  const gateway = () => provider ?? stripeRefundProvider();
  app.get("/api/admin/credit-refunds", authenticateToken, async (req: Request & { user?: RefundScope }, res) => {
    try {
      const user = req.user;
      if (!user) throw new CreditError(403, "Inicia sesión");
      assertRefundRole(user);
      if (!hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.READ))
        throw new CreditError(403, "Sin permiso para consultar devoluciones");
      const credits = await pool.query(
        `SELECT fc.id,fc.family_id,fc.amount_centavos::text,fc.status,fc.origen,f.nombre AS familia
         FROM family_credits fc LEFT JOIN families f ON f.id=fc.family_id AND f.tenant_id=fc.tenant_id AND f.campus_id=fc.campus_id
         WHERE fc.tenant_id=$1 AND fc.campus_id=$2 AND fc.status IN ('activo','en_devolucion')
         ORDER BY fc.id`,
        [user.tenant_id, user.campus_id]);
      res.json({ credits: credits.rows, refunds: await listCreditRefunds(user) });
    } catch (error) { respondError(res, error); }
  });
  app.get("/api/admin/credit-refunds/:creditId/opciones", authenticateToken, async (req: Request & { user?: RefundScope }, res) => {
    try {
      const user = req.user;
      if (!user || !hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.PROCESS)) throw new CreditError(403, "Sin permiso para devolver");
      res.json(await creditRefundOptions(user, positiveId(req.params.creditId), gateway()));
    } catch (error) { respondError(res, error); }
  });
  for (const action of ["preparar", "confirmar", "reintentar"] as const) {
    app.post(`/api/admin/credit-refunds/${action}`, authenticateToken, async (req: Request & { user?: RefundScope }, res) => {
      try {
        const user = req.user;
        if (!user || !hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.PROCESS))
          throw new CreditError(403, "Sin permiso para devolver saldo a favor");
        assertRefundRole(user);
        // Lista cerrada: no se admiten cuentas/CLABE ni campos bancarios del padre.
        const allowed = new Set(["credit_id", "monto_centavos", "method", "motivo", "refund_id",
          "confirmacion", "dinero_entregado", "clave_rastreo", "fecha", "totp"]);
        if (Object.keys(req.body).some(key => !allowed.has(key)))
          throw new CreditError(400, "No incluyas datos bancarios ni campos ajenos a la devolución");
        if (action === "preparar") return res.json(await prepareCreditRefund(user, req.body, gateway()));
        const id = positiveId(req.body.refund_id);
        if (action === "confirmar") return res.json(await confirmCreditRefund(user, id, req.body, gateway()));
        if (req.body.confirmacion !== true) throw new CreditError(400, "Confirma el reintento");
        await assertRefundTotp(user, req.body.totp);
        res.json(await retryRefund(user, id, gateway()));
      } catch (error) { respondError(res, error); }
    });
  }
}
function respondError(res: import("express").Response, error: unknown) {
  const status = error instanceof CreditError ? error.status :
    error instanceof Error && error.name === "FinancialInputError" ? 400 : 500;
  res.status(status).json({ message: (status < 500 || error instanceof CreditError) && error instanceof Error ? error.message :
    "No se pudo completar la devolución. El dinero sigue registrado; revisa su estado antes de reintentar." });
}
