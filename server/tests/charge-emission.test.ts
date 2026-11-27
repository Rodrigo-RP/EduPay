/**
 * TESTS — Emisión de cargos (paquete P3 de docs/qa/plan-correcciones-2026-11.md)
 *
 * CEM-01: el nivel sale de nivel_escolar y no se adivina (vacío o desconocido = null).
 * CEM-02: la colegiatura se elige por nivel; sin concepto para el nivel no se usa el de otro nivel.
 * CEM-03: la clave de periodo (mensual, largo, único por ciclo y extraordinario).
 * CEM-04: el índice único parcial impide duplicar (alumno, concepto, periodo), pero no estorba a los cancelados,
 *         a los cargos sin periodo ni a otros periodos.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import { levelFromNivelEscolar } from "../../shared/academic-levels";
import { colegiaturaConceptForLevel } from "../lib/monthly-concept";
import { chargePeriodKey, isPeriodDuplicate, studentsWithPeriodCharge } from "../lib/charge-period";

describe("Nivel del alumno", () => {
  it("CEM-01: reconoce nivel_escolar sin adivinar", () => {
    expect(levelFromNivelEscolar("Primaria")).toBe("PRIMARIA");
    expect(levelFromNivelEscolar("primaria")).toBe("PRIMARIA");
    expect(levelFromNivelEscolar("Secundaria")).toBe("SECUNDARIA");
    expect(levelFromNivelEscolar("Kínder")).toBe("KINDER");
    expect(levelFromNivelEscolar("Preescolar 2")).toBe("KINDER");
    expect(levelFromNivelEscolar("Preparatoria")).toBe("BACHILLERATO");
    expect(levelFromNivelEscolar("Bachillerato")).toBe("BACHILLERATO");
    expect(levelFromNivelEscolar("")).toBeNull();
    expect(levelFromNivelEscolar(null)).toBeNull();
    expect(levelFromNivelEscolar("3°")).toBeNull();
    expect(levelFromNivelEscolar("Universidad")).toBeNull();
  });
});

describe("Concepto de colegiatura por nivel", () => {
  const porNivel = [
    { id: 1, nombre: "Colegiatura Mensual Primaria" },
    { id: 2, nombre: "Colegiatura Mensual Secundaria" },
    { id: 3, nombre: "Inscripción Ciclo 2025-2026" },
    { id: 6, nombre: "Colegiatura Mensual Kinder" },
  ];
  it("CEM-02: cada nivel recibe su concepto y el que no tiene concepto queda sin él", () => {
    expect(colegiaturaConceptForLevel(porNivel, "PRIMARIA")?.id).toBe(1);
    expect(colegiaturaConceptForLevel(porNivel, "SECUNDARIA")?.id).toBe(2);
    expect(colegiaturaConceptForLevel(porNivel, "KINDER")?.id).toBe(6);
    expect(colegiaturaConceptForLevel(porNivel, "BACHILLERATO")).toBeNull();
    expect(colegiaturaConceptForLevel(porNivel, null)).toBeNull();
  });
  it("CEM-02: con una sola colegiatura sin nivel en el nombre aplica a todos; sin colegiatura no hay concepto", () => {
    const unica = [{ id: 9, nombre: "Colegiatura" }, { id: 10, nombre: "Inscripción" }];
    expect(colegiaturaConceptForLevel(unica, "SECUNDARIA")?.id).toBe(9);
    expect(colegiaturaConceptForLevel(unica, null)?.id).toBe(9);
    expect(colegiaturaConceptForLevel([{ id: 10, nombre: "Inscripción" }], "PRIMARIA")).toBeNull();
  });
});

describe("Clave de periodo", () => {
  it("CEM-03: mensual, largo, único por ciclo y extraordinario", () => {
    expect(chargePeriodKey("mensual", { periodo: "2026-12" }, "2026-11-27")).toBe("2026-12");
    expect(chargePeriodKey("mensual", {}, "2026-11-27")).toBe("2026-11");
    expect(chargePeriodKey("mensual", { periodo: "diciembre" }, "2026-11-27")).toBeNull();
    expect(chargePeriodKey("anual", { ciclo_escolar: "2026-2027" }, "2026-11-27")).toBe("2026-2027|ANUAL");
    expect(chargePeriodKey("semestral", { ciclo_escolar: "2026-2027", periodo_clave: "S1" }, "2026-11-27")).toBe("2026-2027|S1");
    expect(chargePeriodKey("unica", { ciclo_escolar: "2026-2027" }, "2026-11-27")).toBeNull();
    expect(chargePeriodKey("unica", { ciclo_escolar: "2026-2027" }, "2026-11-27", { uniquePerCycle: true })).toBe("2026-2027");
    expect(chargePeriodKey("eventual", {}, "2026-11-27", { uniquePerCycle: true })).toBeNull();
  });
});

describe("Índice único por periodo", () => {
  const ts = Date.now();
  let tenantId: number, campusId: number, studentId: number, conceptId: number;
  const insertar = (periodo: string | null, estado = "pendiente") => pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, ciclo_escolar, fecha_emision, fecha_vencimiento, monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado, periodo)
     VALUES ($1,$2,$3,'2026-2027','2026-12-01','2026-12-10',100000,'0.00',0,$4,$5) RETURNING id`,
    [tenantId, studentId, conceptId, estado, periodo]);

  beforeAll(async () => {
    tenantId = (await pool.query(`INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`, [`CEM Tenant ${ts}`, `CEM${ts}`.slice(0, 13)])).rows[0].id;
    campusId = (await pool.query(`INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`, [`Campus CEM ${ts}`, tenantId])).rows[0].id;
    studentId = (await pool.query(
      `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, grado, grupo, id_referencia, status)
       VALUES ($1,$2,'CEM','Alumno',$3,'1','A',$4,'activo') RETURNING id`, [tenantId, campusId, `CEM ${ts}`, `CEM-${ts}`])).rows[0].id;
    conceptId = (await pool.query(
      `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1,$2,'Colegiatura CEM','colegiatura','mensual',100000) RETURNING id`, [tenantId, campusId])).rows[0].id;
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM charges WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM concepts WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM students WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
  });

  it("CEM-04: rechaza el duplicado; permite cancelados, sin periodo y otro periodo", async () => {
    await insertar("2026-12");
    const error: any = await insertar("2026-12").then(() => null, (e) => e);
    expect(error).not.toBeNull();
    expect(isPeriodDuplicate(error)).toBe(true);
    await insertar("2027-01");
    await insertar(null);
    await insertar(null);
    await insertar("2026-12", "cancelado");
    expect([...(await studentsWithPeriodCharge(pool as any, conceptId, "2026-12"))]).toEqual([studentId]);
    expect((await studentsWithPeriodCharge(pool as any, conceptId, "2027-02")).size).toBe(0);
  });

  it("CEM-04: un cargo cancelado libera el periodo para emitirlo de nuevo", async () => {
    const { rows } = await insertar("2027-03");
    await pool.query(`UPDATE charges SET estado = 'cancelado' WHERE id = $1`, [rows[0].id]);
    expect((await studentsWithPeriodCharge(pool as any, conceptId, "2027-03")).size).toBe(0);
    await insertar("2027-03");
  });
});
