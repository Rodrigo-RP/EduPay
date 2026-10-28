import { describe, expect, it } from "vitest";
import { scholarshipDashboard } from "../../shared/scholarship-dashboard";
import { currentScholarshipScope } from "../lib/scholarship-scope";
import { SCHOOL_TODAY_SQL } from "../../shared/school-date";

const current = {
  student_id: 1, vigente: true, student_status: "activo", estado: "activa",
  porcentaje_aplicado: "50", monto_descuento_centavos: "140000",
};

describe("Panel de becas: alumnos distintos, asignaciones y ahorro real", () => {
  it("no fabrica cifras cuando no hay datos", () => {
    expect(scholarshipDashboard([])).toEqual({
      vigente: [], beneficiaries: 0, assignments: 0, savingsCentavos: 0, averagePercentage: 0,
    });
  });
  it("dos becas del mismo alumno no duplican beneficiario ni ahorro", () => {
    const result = scholarshipDashboard([current, { ...current, porcentaje_aplicado: "20" }]);
    expect(result.beneficiaries).toBe(1);
    expect(result.assignments).toBe(2);
    expect(result.savingsCentavos).toBe(140000);
    expect(result.averagePercentage).toBe(35);
  });
  it("excluye alumnos inactivos, suspendidas, futuras y vencidas", () => {
    const result = scholarshipDashboard([
      current,
      { ...current, student_id: 2, student_status: "inactivo" },
      { ...current, student_id: 3, estado: "suspendida" },
      { ...current, student_id: 4, vigente: false },
      { ...current, student_id: 5, vigente: false },
    ]);
    expect(result.beneficiaries).toBe(1);
    expect(result.assignments).toBe(1);
  });
  it("los alumnos se suman una sola vez aunque compartan tipo", () => {
    const result = scholarshipDashboard([current, { ...current, student_id: 2 }, current]);
    expect(result.beneficiaries).toBe(2);
    expect(result.assignments).toBe(3);
    expect(result.savingsCentavos).toBe(280000);
  });
  it("el alcance SQL exige campus, tenant, alumno activo, estado y vigencia inclusiva", () => {
    const sql = currentScholarshipScope("sh", "s", "$1", "$2");
    for (const clause of [
      "s.campus_id = $1", "sh.tenant_id = $2", "s.status = 'activo'",
      "COALESCE(sh.estado, 'activa') = 'activa'", `sh.vigencia_inicio <= ${SCHOOL_TODAY_SQL}`,
      `sh.vigencia_fin IS NULL OR sh.vigencia_fin >= ${SCHOOL_TODAY_SQL}`,
    ]) expect(sql).toContain(clause);
  });
});
