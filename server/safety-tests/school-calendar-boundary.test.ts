import { afterEach, describe, expect, it, vi } from "vitest";
import { schoolDate } from "../../shared/school-date";
import { detectActionIntent } from "../assistant-knowledge";
import {
  calculateSurcharge, calendarMonthKey, getEligibleSurchargePeriods,
  type SurchargeRuleForCalculation,
} from "../lib/surcharge-calculator";

vi.mock("../assistant-actions", () => ({ executeAction: vi.fn() }));
import { answerWithClaude } from "../assistant-claude";

const originalTZ = process.env.TZ;
const context = { tenantId: 29, campusId: 48, userId: 80, role: "administrador_general" };
const rule: SurchargeRuleForCalculation = {
  tipo: "progresivo", dias_gracia: 0,
  aplica_fines_semana: true, aplica_festivos: true,
  fecha_inicio_acumulacion: "2026-10-01",
  reglas_progresivas: [
    { dias_desde: 1, dias_hasta: 1, porcentaje: 10 },
    { dias_desde: 2, dias_hasta: 100, porcentaje: 20 },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

for (const tz of ["UTC", "America/Mexico_City"]) {
  describe(`Calendario escolar con proceso TZ=${tz}`, () => {
    for (const clock of [
      { instant: "2026-11-01T00:31:00Z", date: "2026-10-31", month: 10, prior: 9 },
      { instant: "2026-11-01T06:01:00Z", date: "2026-11-01", month: 11, prior: 10 },
    ]) {
      describe(clock.instant, () => {
        function freeze() {
          process.env.TZ = tz;
          vi.useFakeTimers({ toFake: ["Date"] });
          vi.setSystemTime(new Date(clock.instant));
        }
        it("el día y los deudores usan el mes escolar, no el del proceso", () => {
          freeze();
          expect(schoolDate()).toBe(clock.date);
          for (const message of ["dime quiénes son los deudores", "quien falta de pagar colegiaturas"]) {
            expect(detectActionIntent(message)).toMatchObject({
              actionId: "query:adeudos_nivel_periodo",
              params: { mes: clock.month, anio: 2026 },
            });
          }
        });
        it("el resumen y el mes anterior usan el mismo calendario; conserva mes explícito", () => {
          freeze();
          expect(detectActionIntent("resumen del mes")?.params).toMatchObject({
            mes: clock.month, anio: 2026,
          });
          expect(detectActionIntent("dame los deudores del último mes")?.params).toMatchObject({
            mes: clock.prior, anio: 2026,
          });
          expect(detectActionIntent("resumen financiero de agosto 2025")?.params).toMatchObject({
            mes: 8, anio: 2025,
          });
        });
        it("el prompt de Claude recibe mes y año escolares con proveedor simulado", async () => {
          freeze();
          const create = vi.fn(async (_params: Record<string, unknown>) => ({
            content: [{ type: "text", text: "Indica qué información administrativa necesitas." }],
            stop_reason: "end_turn",
          }));
          await answerWithClaude("necesito orientación administrativa", context, {
            client: { messages: { create } }, canRead: () => true,
          });
          expect(create).toHaveBeenCalledOnce();
          expect(create.mock.calls[0][0].system).toContain(`mes ${clock.month} de 2026`);
        });
        it("no anticipa mora ni vencimientos del primero de noviembre", () => {
          freeze();
          const result = calculateSurcharge(rule, 1_000, "2026-10-31");
          expect(result.daysLate).toBe(clock.month === 10 ? 0 : 1);
          expect(result.amountCentavos).toBe(clock.month === 10 ? 0 : 100);
          expect(calculateSurcharge(rule, 1_000, "2026-11-01").amountCentavos).toBe(0);
          expect(calculateSurcharge(rule, 1_000, "2026-10-30").daysLate)
            .toBe(clock.month === 10 ? 1 : 2);
        });
        it("no genera un periodo mensual de noviembre antes de medianoche escolar", () => {
          freeze();
          expect(getEligibleSurchargePeriods(rule, "2026-09-30", schoolDate())).toEqual(
            clock.month === 10 ? ["2026-10-01"] : ["2026-10-01", "2026-11-01"],
          );
        });
        it("conserva el día literal de un DATE recibido del controlador", () => {
          freeze();
          // pg entrega DATE a medianoche local del proceso, no como instante UTC.
          const databaseDate = new Date(2026, 10, 1);
          expect(calendarMonthKey(databaseDate)).toBe("2026-11-01");
          expect(calculateSurcharge(rule, 1_000, databaseDate).amountCentavos).toBe(0);
        });
      });
    }
  });
}
