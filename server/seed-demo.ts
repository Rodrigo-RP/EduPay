// @ts-nocheck
import bcrypt from "bcrypt";
import { db, pool } from "./db";
import {
  tenants, campuses, users, students, guardians,
  student_guardian, concepts, charges, payments, payment_methods,
  payment_applications,
} from "../shared/schema";
import { eq, and } from "drizzle-orm";

const DEMO_PASSWORD = "Demo2025!";
const DEMO_COUNT_TABLES = [
  "bank_transactions",
  "late_fee_calculations",
  "payment_plan_installments",
  "payment_plans",
  "family_payment_sources",
  "family_credits",
  "invoices",
  "scholarships",
  "discounts",
  "notifications",
  "payment_rules",
  "payment_surcharge_rules",
  "payment_due_dates",
  "scholarship_auto_rules",
  "scholarship_types",
  "pending_approvals",
  "approval_notifications",
  "approval_workflow_logs",
  "acciones_seguimiento",
  "magic_link_tokens",
  "payment_applications",
  "payment_events",
  "scholarship_criteria",
  "scholarship_benefits",
  "families",
  "products",
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

// Normaliza texto para uso en emails (elimina acentos y caracteres especiales)
function toEmailSlug(str: string): string {
  const map: Record<string, string> = {
    "\u00e1": "a", "\u00e9": "e", "\u00ed": "i", "\u00f3": "o", "\u00fa": "u",
    "\u00fc": "u", "\u00f1": "n",
    "\u00c1": "a", "\u00c9": "e", "\u00cd": "i", "\u00d3": "o", "\u00da": "u",
    "\u00dc": "u", "\u00d1": "n",
  };
  return str
    .split("")
    .map(c => map[c] !== undefined ? map[c] : c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function seedDemoData() {
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); console.log(msg); };

  try {
    // ── Preservar tablas de configuración externa (NO son dato demo) ────────
    //
    // Las siguientes tablas contienen configuración de integración real que
    // debe sobrevivir al reset de datos demo.  NO deben agregarse al TRUNCATE.
    //
    //   • campus_payment_config — credenciales Stripe Connect (stripe_account_id,
    //     flags de onboarding).  Borrarla implica perder la conexión entre el
    //     campus y su cuenta Stripe Express, que solo puede restaurarse repitiendo
    //     el flujo de onboarding desde el Dashboard de Stripe.
    //
    // Patrón: respaldo antes del TRUNCATE → restauración después de recrear
    // campuses/tenants.  El TRUNCATE CASCADE sobre `campuses` (línea de abajo)
    // alcanza campus_payment_config vía FK (campus_id → campuses.id ON DELETE
    // CASCADE), por lo que el respaldo es necesario aunque la tabla no esté
    // listada explícitamente.
    const { rows: stripeConfigBackup } = await pool.query<{
      campus_nombre:    string;
      payment_provider: string;
      stripe_account_id: string | null;
      charges_enabled:  boolean;
      payouts_enabled:  boolean;
      details_submitted: boolean;
    }>(`
      SELECT c.nombre          AS campus_nombre,
             cpc.payment_provider,
             cpc.stripe_account_id,
             cpc.charges_enabled,
             cpc.payouts_enabled,
             cpc.details_submitted
      FROM   campus_payment_config cpc
      JOIN   campuses c ON c.id = cpc.campus_id
    `);
    if (stripeConfigBackup.length > 0) {
      log(`💾 Respaldo: config Stripe de ${stripeConfigBackup.length} campus guardada antes del TRUNCATE`);
    }

    // ── Limpiar datos demo previos ──────────────────────────────────────────
    log("🧹 Limpiando datos demo previos...");
    // TRUNCATE ... RESTART IDENTITY CASCADE propaga a todos los referenciantes
    // independientemente de si tienen ON DELETE CASCADE o NO ACTION.
    // Evita tener que mantener un orden topológico manual al agregar tablas.
    //
    // ⚠️  TABLAS EXCLUIDAS INTENCIONALMENTE (configuración de integración externa):
    //   - campus_payment_config: ver comentario al inicio de esta función.
    //   Si agregan más tablas de configuración externa en el futuro, documentarlas
    //   aquí Y agregar el patrón de respaldo/restauración correspondiente.
    const client = await pool.connect();
    try {
      await client.query(`
        TRUNCATE TABLE
          acciones_seguimiento,
          bank_transactions,
          late_fee_calculations,
          payment_plan_installments,
          payment_plans,
          family_payment_sources,
          family_credits,
          family_students,
          families,
          magic_link_tokens,
          payment_applications,
          payment_events,
          invoices,
          payments,
          payment_methods,
          charges,
          scholarships,
          scholarship_criteria,
          scholarship_benefits,
          student_guardian,
          students,
          guardians,
          discounts,
          products,
          notifications,
          payment_rules,
          payment_surcharge_rules,
          payment_due_dates,
          scholarship_auto_rules,
          scholarship_types,
          concepts,
          pending_approvals,
          approval_notifications,
          approval_workflow_logs,
          users,
          campuses,
          tenants
        RESTART IDENTITY CASCADE
      `);
    } finally {
      client.release();
    }
    log("✅ Limpieza completada");

    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

    // ── Tenant ──────────────────────────────────────────────────────────────
    log("🏫 Creando tenant...");
    const [tenant] = await db.insert(tenants).values({
      nombre_legal: "Instituto JFR A.C.",
      rfc: "IJF950101AA1",
    }).returning();
    log(`✅ Tenant: ${tenant.nombre_legal} (ID: ${tenant.id})`);

    // ── Campuses ────────────────────────────────────────────────────────────
    log("🏢 Creando campus...");
    const [campusNorte] = await db.insert(campuses).values({
      tenant_id: tenant.id,
      nombre: "Campus Norte",
      clave_sep: "09DPR1234A",
    }).returning();
    const [campusSur] = await db.insert(campuses).values({
      tenant_id: tenant.id,
      nombre: "Campus Sur",
      clave_sep: "09DPR5678B",
    }).returning();
    log(`✅ Campus Norte (ID: ${campusNorte.id}), Campus Sur (ID: ${campusSur.id})`);

    // ── Restaurar configuración de integración externa ───────────────────────
    if (stripeConfigBackup.length > 0) {
      // Mapa nombre-de-campus → IDs recién asignados por RESTART IDENTITY.
      // Solo se restauran campus que el seed conoce; configs de campus que ya
      // no existen se descartan en silencio (fueron eliminados intencionalmente).
      const campusMap = new Map<string, { id: number; tenantId: number }>([
        [campusNorte.nombre, { id: campusNorte.id, tenantId: tenant.id }],
        [campusSur.nombre,   { id: campusSur.id,   tenantId: tenant.id }],
      ]);
      let restored = 0;
      for (const cfg of stripeConfigBackup) {
        const destino = campusMap.get(cfg.campus_nombre);
        if (!destino) continue;
        await pool.query(`
          INSERT INTO campus_payment_config
            (campus_id, tenant_id, payment_provider,
             stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (campus_id) DO UPDATE SET
            stripe_account_id = EXCLUDED.stripe_account_id,
            charges_enabled   = EXCLUDED.charges_enabled,
            payouts_enabled   = EXCLUDED.payouts_enabled,
            details_submitted = EXCLUDED.details_submitted,
            updated_at        = NOW()
        `, [
          destino.id, destino.tenantId, cfg.payment_provider,
          cfg.stripe_account_id, cfg.charges_enabled,
          cfg.payouts_enabled,   cfg.details_submitted,
        ]);
        restored++;
      }
      log(`✅ Config Stripe Connect restaurada para ${restored} campus`);
    }

    // ── Usuarios administrativos ─────────────────────────────────────────────
    log("👤 Creando usuarios administrativos...");
    await db.insert(users).values([
      {
        campus_id: campusNorte.id,
        tenant_id: tenant.id,
        email: "superadmin@edupay.mx",
        password_hash: hash,
        name: "Super Administrador",
        role: "super_admin",
        is_active: true,
        is_super_admin: true,
      },
      {
        campus_id: campusNorte.id,
        tenant_id: tenant.id,
        email: "directora@jfr.edu.mx",
        password_hash: hash,
        name: "Directora García López",
        role: "administrador_general",
        is_active: true,
      },
      {
        campus_id: campusNorte.id,
        tenant_id: tenant.id,
        email: "admin.campus@jfr.edu.mx",
        password_hash: hash,
        name: "Coordinadora Martínez",
        role: "administrador_campus",
        is_active: true,
      },
      {
        campus_id: campusNorte.id,
        tenant_id: tenant.id,
        email: "caja@jfr.edu.mx",
        password_hash: hash,
        name: "Auxiliar Caja Ramírez",
        role: "auxiliar_contable",
        is_active: true,
      },
      {
        campus_id: campusNorte.id,
        tenant_id: tenant.id,
        email: "contador@jfr.edu.mx",
        password_hash: hash,
        name: "Contador Herrera CPA",
        role: "contador_general",
        is_active: true,
      },
      {
        campus_id: campusSur.id,
        tenant_id: tenant.id,
        email: "admisiones@jfr.edu.mx",
        password_hash: hash,
        name: "Ejecutiva Admisiones Cruz",
        role: "admisiones",
        is_active: true,
      },
    ]);
    log("✅ 6 usuarios administrativos creados");

    // ── Conceptos de pago ────────────────────────────────────────────────────
    log("💰 Creando conceptos de pago...");
    const [concColNorte] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Colegiatura Mensual Primaria",
      tipo: "colegiatura",
      periodicidad: "mensual",
      monto_centavos: 280000,
      iva: false,
    }).returning();
    const [concColSec] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Colegiatura Mensual Secundaria",
      tipo: "colegiatura",
      periodicidad: "mensual",
      monto_centavos: 350000,
      iva: false,
    }).returning();
    const [concInsc] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Inscripción Ciclo 2025-2026",
      tipo: "inscripcion",
      periodicidad: "anual",
      monto_centavos: 450000,
      iva: false,
    }).returning();
    const [concMat] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Materiales y Útiles",
      tipo: "extra",
      periodicidad: "anual",
      monto_centavos: 120000,
      iva: true,
    }).returning();
    const [concColSurPrim] = await db.insert(concepts).values({
      campus_id: campusSur.id,
      nombre: "Colegiatura Mensual Kinder",
      tipo: "colegiatura",
      periodicidad: "mensual",
      monto_centavos: 220000,
      iva: false,
    }).returning();
    const [concColNorteKinder] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Colegiatura Mensual Kinder",
      tipo: "colegiatura",
      periodicidad: "mensual",
      monto_centavos: 220000,
      iva: false,
    }).returning();
    const [concColNorteBach] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Colegiatura Mensual Bachillerato",
      tipo: "colegiatura",
      periodicidad: "mensual",
      monto_centavos: 420000,
      iva: false,
    }).returning();
    const [concColSurSec] = await db.insert(concepts).values({
      campus_id: campusSur.id,
      nombre: "Colegiatura Mensual Secundaria",
      tipo: "colegiatura",
      periodicidad: "mensual",
      monto_centavos: 350000,
      iva: false,
    }).returning();
    const [concColSurBach] = await db.insert(concepts).values({
      campus_id: campusSur.id,
      nombre: "Colegiatura Mensual Bachillerato",
      tipo: "colegiatura",
      periodicidad: "mensual",
      monto_centavos: 420000,
      iva: false,
    }).returning();
    log("✅ 9 conceptos de pago creados");

    // ── Familias (padres, madres y estudiantes) ──────────────────────────────
    log("👨‍👩‍👧 Creando 10 familias con estudiantes...");

    const familias = [
      {
        padre: { nombres: "Carlos Eduardo", ap: "López", am: "Hernández", celular: "5591234567", curp: "LOHC850101HDFPRL01" },
        madre: { nombres: "María Fernanda", ap: "Hernández", am: "Ortiz", celular: "5598765432", curp: "HEOM880215MDFPRR01" },
        estudiante: { nombres: "Sofía Valentina", ap: "López", am: "Hernández", grado: "3°", grupo: "A", nivel: "Primaria", curp: "LOHS150310MDFPRL01" },
        campus: campusNorte, concept: concColNorte,
      },
      {
        padre: { nombres: "Javier Antonio", ap: "García", am: "Ruiz", celular: "5571234567", curp: "GARJ820520HDFCXV02" },
        madre: { nombres: "Patricia Elena", ap: "Ruiz", am: "Sánchez", celular: "5578901234", curp: "RUSP850930MDFCXT02" },
        estudiante: { nombres: "Mateo Alejandro", ap: "García", am: "Ruiz", grado: "1°", grupo: "B", nivel: "Secundaria", curp: "GARM100715HDFCXT02" },
        campus: campusNorte, concept: concColSec,
      },
      {
        padre: { nombres: "Roberto Miguel", ap: "Martínez", am: "Torres", celular: "5561234567", curp: "MATR780311HDFRRB03" },
        madre: { nombres: "Ana Lucía", ap: "Torres", am: "Flores", celular: "5568901234", curp: "TOFA820714MDFRRN03" },
        estudiante: { nombres: "Valentina Isabel", ap: "Martínez", am: "Torres", grado: "5°", grupo: "A", nivel: "Primaria", curp: "MATV120901MDFRRN03" },
        campus: campusNorte, concept: concColNorte,
      },
      {
        padre: { nombres: "Luis Fernando", ap: "Sánchez", am: "Cruz", celular: "5551234567", curp: "SACL800425HDFRRS04" },
        madre: { nombres: "Claudia Beatriz", ap: "Cruz", am: "Medina", celular: "5558901234", curp: "CUMC830617MDFRRN04" },
        estudiante: { nombres: "Diego Emmanuel", ap: "Sánchez", am: "Cruz", grado: "2°", grupo: "C", nivel: "Secundaria", curp: "SACD110330HDFRRG04" },
        campus: campusNorte, concept: concColSec,
      },
      {
        padre: { nombres: "Héctor Ramón", ap: "Flores", am: "Vega", celular: "5541234567", curp: "FOVH750812HDFRRK05" },
        madre: { nombres: "Margarita Azucena", ap: "Vega", am: "Luna", celular: "5548901234", curp: "VELM790103MDFRRG05" },
        estudiante: { nombres: "Camila Itzel", ap: "Flores", am: "Vega", grado: "4°", grupo: "B", nivel: "Primaria", curp: "FLVC130501MDFRRM05" },
        campus: campusNorte, concept: concColNorte,
      },
      {
        padre: { nombres: "Arturo Ismael", ap: "Ramírez", am: "Morales", celular: "5531234567", curp: "RAMA770605HDFRRT06" },
        madre: { nombres: "Silvia Guadalupe", ap: "Morales", am: "Acosta", celular: "5538901234", curp: "MOAS810220MDFRRG06" },
        estudiante: { nombres: "Emilio Santiago", ap: "Ramírez", am: "Morales", grado: "6°", grupo: "A", nivel: "Primaria", curp: "RAME110715HDFRRM06" },
        campus: campusNorte, concept: concColNorte,
      },
      {
        padre: { nombres: "Pedro Enrique", ap: "Jiménez", am: "Castillo", celular: "5521234567", curp: "JICP760930HDFRRD07" },
        madre: { nombres: "Rosa Alicia", ap: "Castillo", am: "Reyes", celular: "5528901234", curp: "CARR800415MDFRRN07" },
        estudiante: { nombres: "Isabella Renata", ap: "Jiménez", am: "Castillo", grado: "3°", grupo: "B", nivel: "Secundaria", curp: "JICI091120MDFRRN07" },
        campus: campusNorte, concept: concColSec,
      },
      {
        padre: { nombres: "Alejandro Daniel", ap: "Morales", am: "Guerrero", celular: "5511234567", curp: "MOGA840117HDFRRL08" },
        madre: { nombres: "Gabriela Ximena", ap: "Guerrero", am: "Ponce", celular: "5518901234", curp: "GUPG870825MDFRRN08" },
        estudiante: { nombres: "Andrés Felipe", ap: "Morales", am: "Guerrero", grado: "1°", grupo: "A", nivel: "Primaria", curp: "MOGA140305HDFRRN08" },
        campus: campusSur, concept: concColSurPrim,
      },
      {
        padre: { nombres: "Francisco Javier", ap: "Ortiz", am: "Cabrera", celular: "5501234567", curp: "ORCF790630HDFRRV09" },
        madre: { nombres: "Daniela Estela", ap: "Cabrera", am: "Villanueva", celular: "5508901234", curp: "CAVD820418MDFRRN09" },
        estudiante: { nombres: "Natalia Renée", ap: "Ortiz", am: "Cabrera", grado: "2°", grupo: "A", nivel: "Primaria", curp: "ORCN150814MDFRRN09" },
        campus: campusSur, concept: concColSurPrim,
      },
      {
        padre: { nombres: "Gerardo Alfonso", ap: "Pedraza", am: "Lara", celular: "5491234567", curp: "PELG730202HDFRRN10" },
        madre: { nombres: "Verónica Sofía", ap: "Lara", am: "Ibáñez", celular: "5498901234", curp: "LAIV770812MDFRRN10" },
        estudiante: { nombres: "Rodrigo Maximiliano", ap: "Pedraza", am: "Lara", grado: "2°", grupo: "B", nivel: "Kinder", curp: "PELR200310HDFRRG10" },
        campus: campusSur, concept: concColSurPrim,
      },
      {
        padre: { nombres: "Raúl Esteban", ap: "Navarro", am: "Mendoza", celular: "5481234567", curp: "NAMR820401HDFVRL11" },
        madre: { nombres: "Lucía Fernanda", ap: "Mendoza", am: "Soto", celular: "5488901234", curp: "MESL850710MDFNRC11" },
        estudiante: { nombres: "Alma Sofía", ap: "Navarro", am: "Mendoza", grado: "3°", grupo: "A", nivel: "Kinder", curp: "NAMA210413MDFVRL11" },
        campus: campusNorte, concept: concColNorteKinder,
      },
      {
        padre: { nombres: "Iván Ricardo", ap: "Salazar", am: "Pineda", celular: "5471234567", curp: "SAPI790602HDFLNV12" },
        madre: { nombres: "Teresa Alejandra", ap: "Pineda", am: "Cortés", celular: "5478901234", curp: "PICT820824MDFNRS12" },
        estudiante: { nombres: "Daniela Marisol", ap: "Salazar", am: "Pineda", grado: "2°", grupo: "A", nivel: "Bachillerato", curp: "SAPD090912MDFLNN12" },
        campus: campusNorte, concept: concColNorteBach,
      },
      {
        padre: { nombres: "Óscar Manuel", ap: "Cervantes", am: "Ríos", celular: "5461234567", curp: "CERO800309HDFRSC13" },
        madre: { nombres: "Mariana Isabel", ap: "Ríos", am: "Delgado", celular: "5468901234", curp: "RIDM830217MDFSLR13" },
        estudiante: { nombres: "Jorge Emiliano", ap: "Cervantes", am: "Ríos", grado: "3°", grupo: "B", nivel: "Secundaria", curp: "CERJ110818HDFRMR13" },
        campus: campusSur, concept: concColSurSec,
      },
      {
        padre: { nombres: "Sergio Adrián", ap: "Beltrán", am: "Vargas", celular: "5451234567", curp: "BEVS780427HDFLRR14" },
        madre: { nombres: "Karen Beatriz", ap: "Vargas", am: "Núñez", celular: "5458901234", curp: "VANK810614MDFRZR14" },
        estudiante: { nombres: "Renata Ximena", ap: "Beltrán", am: "Vargas", grado: "1°", grupo: "C", nivel: "Bachillerato", curp: "BEVR100625MDFLRN14" },
        campus: campusSur, concept: concColSurBach,
      },
    ];

    const today = startOfDay(new Date());
    const thisYear = today.getFullYear();
    const demoStudents: Array<{
      id: number;
      campusId: number;
      conceptId: number;
      padreId: number;
      madreId: number;
      becaPct: number;
      nivel: string;
      familyId: number;
    }> = [];
    const demoCharges: Array<{ id: number; studentId: number; conceptId: number; campusId: number; status: string; amount: number }> = [];
    const demoPayments: Array<{ id: number; chargeId: number; guardianId: number; amount: number }> = [];

    for (let i = 0; i < familias.length; i++) {
      const f = familias[i];
      const emailPadre = `${toEmailSlug(f.padre.ap)}.${toEmailSlug(f.padre.nombres.split(" ")[0])}@demo.mx`;
      const emailMadre = `${toEmailSlug(f.madre.ap)}.${toEmailSlug(f.madre.nombres.split(" ")[0])}@demo.mx`;

      const [padre] = await db.insert(guardians).values({
        tipo_guardian: "padre",
        es_padre: true,
        correo_institucional_familiar: emailPadre,
        nombres: f.padre.nombres,
        apellido_paterno: f.padre.ap,
        apellido_materno: f.padre.am,
        curp: f.padre.curp,
        celular: f.padre.celular,
        email: emailPadre,
        password_hash: hash,
        nombre_completo: `${f.padre.nombres} ${f.padre.ap} ${f.padre.am}`,
        campus_id: f.campus.id,
        tenant_id: tenant.id,
      }).returning();

      const [madre] = await db.insert(guardians).values({
        tipo_guardian: "madre",
        es_madre: true,
        correo_institucional_familiar: emailMadre,
        nombres: f.madre.nombres,
        apellido_paterno: f.madre.ap,
        apellido_materno: f.madre.am,
        curp: f.madre.curp,
        celular: f.madre.celular,
        email: emailMadre,
        password_hash: hash,
        nombre_completo: `${f.madre.nombres} ${f.madre.ap} ${f.madre.am}`,
        campus_id: f.campus.id,
        tenant_id: tenant.id,
      }).returning();

      const [student] = await db.insert(students).values({
        campus_id: f.campus.id,
        id_referencia: `MAT-${String(i + 1).padStart(4, "0")}`,
        nombres: f.estudiante.nombres,
        apellido_paterno: f.estudiante.ap,
        apellido_materno: f.estudiante.am,
        curp: f.estudiante.curp,
        nivel_escolar: f.estudiante.nivel,
        grado: f.estudiante.grado,
        grupo: f.estudiante.grupo,
        turno: "Matutino",
        nombre_completo: `${f.estudiante.nombres} ${f.estudiante.ap} ${f.estudiante.am}`,
        status: "activo",
      }).returning();

      await db.insert(student_guardian).values([
        { student_id: student.id, guardian_id: padre.id, porcentaje_responsabilidad: "50.00", es_responsable_pago: true },
        { student_id: student.id, guardian_id: madre.id, porcentaje_responsabilidad: "50.00", es_responsable_pago: false },
      ]);
      const { rows: createdFamilies } = await pool.query<{ id: number }>(
        `INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [tenant.id, f.campus.id, `Familia ${f.padre.ap} ${f.madre.ap}`, padre.id],
      );
      const familyId = createdFamilies[0]?.id;
      if (!familyId) throw new Error(`No se pudo crear la familia demo de ${f.padre.ap}`);
      await pool.query(
        `INSERT INTO family_students (family_id, student_id) VALUES ($1, $2)`,
        [familyId, student.id],
      );

      // Los porcentajes corresponden a las asignaciones de scholarships que se
      // crean más abajo. Así el ahorro mostrado en Becas sale de cargos reales.
      const becaPct = [50, 30, 20, 0, 0, 0, 0, 40, 0, 30, 20, 25, 20, 25][i] ?? 0;
      demoStudents.push({
        id: student.id,
        campusId: f.campus.id,
        conceptId: f.concept.id,
        padreId: padre.id,
        madreId: madre.id,
        becaPct,
        nivel: f.estudiante.nivel,
        familyId,
      });

      // Cargos del ciclo actual: fechas variadas para cobranza, antigüedad y emisión programada.
      const months = [
        { mes: "Colegiatura pagada", emision: isoDate(addDays(today, -45)), venc: isoDate(addDays(today, -35)), estado: "pagado" },
        { mes: "Por vencer", emision: isoDate(addDays(today, -10)), venc: isoDate(addDays(today, 5)), estado: "pendiente" },
        { mes: "Vence hoy", emision: isoDate(addDays(today, -15)), venc: isoDate(today), estado: "pendiente" },
        { mes: "Vencida reciente", emision: isoDate(addDays(today, -25)), venc: isoDate(addDays(today, -4)), estado: i < 3 ? "vencido" : "pendiente" },
        { mes: "Adeudo antiguo", emision: isoDate(addDays(today, -115)), venc: isoDate(addDays(today, -95)), estado: i < 3 ? "vencido" : "pendiente" },
        { mes: "Programada", emision: isoDate(addDays(today, 10)), venc: isoDate(addDays(today, 20)), estado: "scheduled" },
      ];

      for (const m of months) {
        const [charge] = await db.insert(charges).values({
          student_id: student.id,
          concept_id: f.concept.id,
          tenant_id: tenant.id,
          ciclo_escolar: "2026-2027",
          fecha_emision: m.emision,
          fecha_vencimiento: m.venc,
          monto_base_centavos: f.concept.monto_centavos,
          beca_aplicada: String(becaPct),
          recargo_aplicado_centavos: m.estado === "vencido" ? Math.round(f.concept.monto_centavos * 0.05) : 0,
          estado: m.estado,
          descripcion: m.mes,
        }).returning();
        demoCharges.push({
          id: charge.id,
          studentId: student.id,
          conceptId: f.concept.id,
          campusId: f.campus.id,
          status: m.estado,
          amount: f.concept.monto_centavos,
        });

        if (m.estado === "pagado") {
          const [payment] = await db.insert(payments).values({
            tenant_id: tenant.id,
            charge_id: charge.id,
            guardian_id: padre.id,
            metodo: "tarjeta",
            referencia_pasarela: `ref_demo_${charge.id}_${Date.now()}`,
            monto_centavos: f.concept.monto_centavos,
            estado: "exitoso",
          }).returning();
          await db.insert(payment_applications).values({
            payment_id: payment.id,
            charge_id: charge.id,
            amount_centavos: f.concept.monto_centavos,
          });
          demoPayments.push({ id: payment.id, chargeId: charge.id, guardianId: padre.id, amount: f.concept.monto_centavos });
        }
      }

      // Inscripción pagada (solo para los primeros 8 estudiantes)
      if (i < 8) {
        const [inscCharge] = await db.insert(charges).values({
          student_id: student.id,
          concept_id: concInsc.id,
          tenant_id: tenant.id,
          ciclo_escolar: "2026-2027",
          fecha_emision: isoDate(addDays(today, -60)),
          fecha_vencimiento: isoDate(addDays(today, -45)),
          monto_base_centavos: concInsc.monto_centavos,
          beca_aplicada: "0.00",
          recargo_aplicado_centavos: 0,
          estado: "pagado",
        }).returning();
        const [payment] = await db.insert(payments).values({
          tenant_id: tenant.id,
          charge_id: inscCharge.id,
          guardian_id: padre.id,
          metodo: "spei",
          referencia_pasarela: `spei_demo_${inscCharge.id}`,
          monto_centavos: concInsc.monto_centavos,
          estado: "exitoso",
        }).returning();
        await db.insert(payment_applications).values({
          payment_id: payment.id,
          charge_id: inscCharge.id,
          amount_centavos: concInsc.monto_centavos,
        });
        demoCharges.push({
          id: inscCharge.id,
          studentId: student.id,
          conceptId: concInsc.id,
          campusId: f.campus.id,
          status: "pagado",
          amount: concInsc.monto_centavos,
        });
        demoPayments.push({ id: payment.id, chargeId: inscCharge.id, guardianId: padre.id, amount: concInsc.monto_centavos });
      }

      // Método de pago guardado (tarjeta simulada)
      await db.insert(payment_methods).values({
        guardian_id: padre.id,
        tipo: "card",
        token_pasarela: `tok_demo_${padre.id}`,
        last4: String(4111 + i).padStart(4, "0").slice(-4),
        expiry: "12/27",
      });
    }

    log(`✅ ${familias.length} familias creadas (${familias.length} padres, ${familias.length} madres, ${familias.length} estudiantes)`);

    // ── Casos financieros y familiares para las pantallas reales ─────────────
    const familiaPrincipal = demoStudents[0];
    const estudianteConBeca = demoStudents[2];
    const segundoEstudiante = demoStudents[1];
    if (!familiaPrincipal || !estudianteConBeca || !segundoEstudiante) {
      throw new Error("El seed requiere al menos tres estudiantes demo");
    }

    // La relación operativa de hermanos se resuelve por student_guardian. La fila
    // en families existe solo como ancla requerida por family_credits y fuentes
    // SPEI; no sustituye esa relación para las pantallas de alumnos/tutores.
    const [hermano] = await db.insert(students).values({
      campus_id: familiaPrincipal.campusId,
      id_referencia: "MAT-0001-H",
      nombres: "Emilia Guadalupe",
      apellido_paterno: "López",
      apellido_materno: "Hernández",
      curp: "LOHE170620MDFPRM02",
      nivel_escolar: "Primaria",
      grado: "1°",
      grupo: "B",
      turno: "Matutino",
      nombre_completo: "Emilia Guadalupe López Hernández",
      status: "activo",
    }).returning();
    await db.insert(student_guardian).values([
      { student_id: hermano.id, guardian_id: familiaPrincipal.padreId, porcentaje_responsabilidad: "50.00", es_responsable_pago: true },
      { student_id: hermano.id, guardian_id: familiaPrincipal.madreId, porcentaje_responsabilidad: "50.00", es_responsable_pago: false },
    ]);
    demoStudents.push({
      id: hermano.id,
      campusId: familiaPrincipal.campusId,
      conceptId: familiaPrincipal.conceptId,
      padreId: familiaPrincipal.padreId,
      madreId: familiaPrincipal.madreId,
      becaPct: 0,
      nivel: "Primaria",
      familyId: familiaPrincipal.familyId,
    });
    await pool.query(
      `INSERT INTO family_students (family_id, student_id) VALUES ($1, $2)`,
      [familiaPrincipal.familyId, hermano.id],
    );

    const [cargoHermano] = await db.insert(charges).values({
      tenant_id: tenant.id,
      student_id: hermano.id,
      concept_id: familiaPrincipal.conceptId,
      ciclo_escolar: "2026-2027",
      fecha_emision: isoDate(addDays(today, -8)),
      fecha_vencimiento: isoDate(addDays(today, 5)),
      monto_base_centavos: 280000,
      beca_aplicada: "0.00",
      estado: "pendiente",
      descripcion: "Colegiatura hermana para pago familiar",
    }).returning();
    demoCharges.push({
      id: cargoHermano.id,
      studentId: hermano.id,
      conceptId: familiaPrincipal.conceptId,
      campusId: familiaPrincipal.campusId,
      status: "pendiente",
      amount: 280000,
    });

    const familyId = familiaPrincipal.familyId;

    const cargoPrimerHermano = demoCharges.find(
      (charge) => charge.studentId === familiaPrincipal.id && charge.status === "pendiente",
    );
    if (!cargoPrimerHermano) throw new Error("No se encontró un cargo pendiente para el pago de hermanos");

    const [pagoHermanos] = await db.insert(payments).values({
      tenant_id: tenant.id,
      charge_id: cargoPrimerHermano.id,
      guardian_id: familiaPrincipal.padreId,
      metodo: "spei",
      referencia_pasarela: "spei_demo_hermanos_2026",
      monto_centavos: cargoPrimerHermano.amount + cargoHermano.monto_base_centavos,
      estado: "exitoso",
    }).returning();
    await db.insert(payment_applications).values([
      { payment_id: pagoHermanos.id, charge_id: cargoPrimerHermano.id, amount_centavos: cargoPrimerHermano.amount },
      { payment_id: pagoHermanos.id, charge_id: cargoHermano.id, amount_centavos: cargoHermano.monto_base_centavos },
    ]);
    await pool.query(
      `UPDATE charges SET estado = 'pagado', updated_at = NOW() WHERE id = ANY($1::int[])`,
      [[cargoPrimerHermano.id, cargoHermano.id]],
    );
    demoPayments.push({
      id: pagoHermanos.id,
      chargeId: cargoPrimerHermano.id,
      guardianId: familiaPrincipal.padreId,
      amount: cargoPrimerHermano.amount + cargoHermano.monto_base_centavos,
    });

    const cargoParcial = demoCharges.find(
      (charge) => charge.studentId === segundoEstudiante.id && charge.status === "pendiente",
    );
    if (!cargoParcial) throw new Error("No se encontró un cargo para el pago parcial demo");
    const montoParcial = Math.round(cargoParcial.amount * 0.4);
    const [pagoParcial] = await db.insert(payments).values({
      tenant_id: tenant.id,
      charge_id: cargoParcial.id,
      guardian_id: segundoEstudiante.padreId,
      metodo: "efectivo",
      referencia_pasarela: "caja_demo_pago_parcial_2026",
      monto_centavos: montoParcial,
      estado: "exitoso",
    }).returning();
    await db.insert(payment_applications).values({
      payment_id: pagoParcial.id,
      charge_id: cargoParcial.id,
      amount_centavos: montoParcial,
    });
    await pool.query(`UPDATE charges SET estado = 'parcial', updated_at = NOW() WHERE id = $1`, [cargoParcial.id]);
    demoPayments.push({ id: pagoParcial.id, chargeId: cargoParcial.id, guardianId: segundoEstudiante.padreId, amount: montoParcial });

    const cargoExcedente = demoCharges.find(
      (charge) => charge.studentId === estudianteConBeca.id && charge.status === "pendiente",
    );
    if (!cargoExcedente) throw new Error("No se encontró un cargo para el pago excedente demo");
    const saldoFavorCentavos = 60000;
    const [pagoExcedente] = await db.insert(payments).values({
      tenant_id: tenant.id,
      charge_id: cargoExcedente.id,
      guardian_id: estudianteConBeca.padreId,
      metodo: "efectivo",
      referencia_pasarela: "caja_demo_excedente_2026",
      monto_centavos: cargoExcedente.amount + saldoFavorCentavos,
      estado: "exitoso",
    }).returning();
    const [aplicacionExcedente] = await db.insert(payment_applications).values({
      payment_id: pagoExcedente.id,
      charge_id: cargoExcedente.id,
      amount_centavos: cargoExcedente.amount,
    }).returning();
    await pool.query(`UPDATE charges SET estado = 'pagado', updated_at = NOW() WHERE id = $1`, [cargoExcedente.id]);
    await pool.query(
      `INSERT INTO family_credits
        (tenant_id, campus_id, family_id, student_id, payment_id, amount_centavos, origen, descripcion, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'excedente_caja', $7, 'activo')`,
      [
        tenant.id,
        familiaPrincipal.campusId,
        familyId,
        estudianteConBeca.id,
        pagoExcedente.id,
        saldoFavorCentavos,
        "Saldo a favor generado por pago demo excedente",
      ],
    );
    demoPayments.push({ id: pagoExcedente.id, chargeId: cargoExcedente.id, guardianId: estudianteConBeca.padreId, amount: pagoExcedente.monto_centavos });
    log("✅ Casos de pago familiar, parcial y saldo a favor creados");

    // ── Productos, becas, reglas y descuentos ────────────────────────────────
    const productDefinitions = [
      ["COL-MENSUAL", "Colegiatura mensual", "COLEGIATURAS", "SERVICIO", "86121500", 220000, 280000, 350000, 420000],
      ["INS-ANUAL", "Inscripción anual", "INSCRIPCIONES", "SERVICIO", "86121500", 380000, 450000, 520000, 620000],
      ["SEG-ESCOLAR", "Seguro escolar anual", "SEGURO_ESCOLAR", "SERVICIO", "84131600", 45000, 50000, 55000, 60000],
      ["LIB-PAQUETE", "Paquete de libros", "LIBROS", "PIEZA", "55101500", 90000, 110000, 130000, 150000],
    ];
    for (const campus of [campusNorte, campusSur]) {
      for (const [codigo, nombre, categoria, unidad, claveSat, kinder, primaria, secundaria, bachillerato] of productDefinitions) {
        await pool.query(
          `INSERT INTO products
            (campus_id, tenant_id, codigo, nombre, descripcion, categoria, unidad_medida, clave_sat,
             activo, precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11,$12)`,
          [
            campus.id,
            tenant.id,
            codigo,
            nombre,
            `${nombre} configurado para ${campus.nombre}`,
            categoria,
            unidad,
            claveSat,
            kinder,
            primaria,
            secundaria,
            bachillerato,
          ],
        );
      }
    }

    const { rows: scholarshipTypeRows } = await pool.query<{ id: number; nombre: string }>(
      `INSERT INTO scholarship_types (campus_id, nombre, categoria, descripcion, algoritmo, activo)
       VALUES
         ($1, 'Beca Excelencia Académica', 'academica', 'Reconoce alto desempeño académico', 'promedio', true),
         ($1, 'Beca Hermanos', 'descuento', 'Apoyo para familias con más de un estudiante', 'hermanos', true),
         ($1, 'Beca Deportiva', 'deportiva', 'Apoyo por representación deportiva', 'manual', true)
       RETURNING id, nombre`,
      [campusNorte.id],
    );
    const scholarshipTypeByName = new Map(scholarshipTypeRows.map((row) => [row.nombre, row.id]));
    const excelenciaId = scholarshipTypeByName.get("Beca Excelencia Académica");
    const hermanosId = scholarshipTypeByName.get("Beca Hermanos");
    const deportivaId = scholarshipTypeByName.get("Beca Deportiva");
    if (!excelenciaId || !hermanosId || !deportivaId) throw new Error("No se crearon los tipos de beca demo");
    const { rows: scholarshipTypeRowsSur } = await pool.query<{ id: number; nombre: string }>(
      `INSERT INTO scholarship_types (campus_id, nombre, categoria, descripcion, algoritmo, activo)
       VALUES
         ($1, 'Beca Excelencia Académica', 'academica', 'Reconoce alto desempeño académico', 'promedio', true),
         ($1, 'Beca Hermanos', 'descuento', 'Apoyo para familias con más de un estudiante', 'hermanos', true),
         ($1, 'Beca Deportiva', 'deportiva', 'Apoyo por representación deportiva', 'manual', true)
       RETURNING id, nombre`,
      [campusSur.id],
    );
    const scholarshipTypeSurByName = new Map(scholarshipTypeRowsSur.map((row) => [row.nombre, row.id]));
    const excelenciaSurId = scholarshipTypeSurByName.get("Beca Excelencia Académica");
    const hermanosSurId = scholarshipTypeSurByName.get("Beca Hermanos");
    const deportivaSurId = scholarshipTypeSurByName.get("Beca Deportiva");
    if (!excelenciaSurId || !hermanosSurId || !deportivaSurId) {
      throw new Error("No se crearon los tipos de beca demo de Campus Sur");
    }

    await pool.query(
      `INSERT INTO scholarship_criteria (scholarship_type_id, criterio, valor_minimo, valor_maximo, obligatorio)
       VALUES ($1, 'promedio_minimo', 9.00, NULL, true),
              ($2, 'hermanos_min', 2.00, NULL, true),
              ($3, 'promedio_minimo', 8.50, NULL, false)`,
      [excelenciaId, hermanosId, deportivaId],
    );
    await pool.query(
      `INSERT INTO scholarship_benefits
        (scholarship_type_id, tipo_beneficio, porcentaje_descuento, aplica_conceptos, vigencia_meses)
       VALUES ($1, 'porcentaje', 50, ARRAY['colegiatura'], 12),
              ($2, 'porcentaje', 30, ARRAY['colegiatura'], 12),
              ($3, 'porcentaje', 20, ARRAY['colegiatura'], 12)`,
      [excelenciaId, hermanosId, deportivaId],
    );
    const northKinder = demoStudents.find(
      (student) => student.campusId === campusNorte.id && student.nivel === "Kinder",
    );
    const northBachillerato = demoStudents.find(
      (student) => student.campusId === campusNorte.id && student.nivel === "Bachillerato",
    );
    const southPrimaria = demoStudents.find(
      (student) => student.campusId === campusSur.id && student.nivel === "Primaria",
    );
    const southKinder = demoStudents.find(
      (student) => student.campusId === campusSur.id && student.nivel === "Kinder",
    );
    const southSecundaria = demoStudents.find(
      (student) => student.campusId === campusSur.id && student.nivel === "Secundaria",
    );
    const southBachillerato = demoStudents.find(
      (student) => student.campusId === campusSur.id && student.nivel === "Bachillerato",
    );
    if (!northKinder || !northBachillerato || !southPrimaria || !southKinder || !southSecundaria || !southBachillerato) {
      throw new Error("El seed requiere estudiantes demo en los cuatro niveles de ambos campus");
    }
    await pool.query(
      `INSERT INTO scholarships
        (tenant_id, student_id, scholarship_type_id, porcentaje, motivo, vigencia_inicio, vigencia_fin)
       VALUES
         ($1,$2,$3,50.00,'Excelencia académica demo','2026-08-01','2027-07-31'),
         ($1,$4,$5,30.00,'Beneficio por hermanos demo','2026-08-01','2027-07-31'),
         ($1,$6,$7,20.00,'Representación deportiva demo','2026-08-01','2027-07-31'),
         ($1,$8,$7,20.00,'Talento deportivo en kinder demo','2026-08-01','2027-07-31'),
         ($1,$9,$3,25.00,'Excelencia en bachillerato demo','2026-08-01','2027-07-31'),
         ($1,$10,$11,40.00,'Excelencia académica Campus Sur','2026-08-01','2027-07-31'),
         ($1,$12,$13,30.00,'Beneficio por hermanos Campus Sur','2026-08-01','2027-07-31'),
         ($1,$14,$15,20.00,'Representación deportiva Campus Sur','2026-08-01','2027-07-31'),
         ($1,$16,$11,25.00,'Excelencia en bachillerato Campus Sur','2026-08-01','2027-07-31')`,
      [
        tenant.id,
        demoStudents[0].id, excelenciaId,
        demoStudents[1].id, hermanosId,
        demoStudents[2].id, deportivaId,
        northKinder.id,
        northBachillerato.id,
        southPrimaria.id, excelenciaSurId,
        southKinder.id, hermanosSurId,
        southSecundaria.id, deportivaSurId,
        southBachillerato.id,
      ],
    );
    await pool.query(
      `INSERT INTO discounts (campus_id, tenant_id, nombre, regla_sql, monto_pct)
       VALUES ($1,$2,'Pronto pago septiembre','Pago antes de fecha límite',5.00),
              ($3,$2,'Convenio personal demo','Descuento administrativo autorizado',10.00)`,
      [campusNorte.id, tenant.id, campusSur.id],
    );

    const { rows: paymentRuleRows } = await pool.query<{ id: number }>(
      `INSERT INTO payment_rules
        (campus_id, tenant_id, name, description, rule_type, late_fee_percentage,
         grace_period_days, max_late_fee_centavos, applies_to_concepts)
       VALUES ($1,$2,'Recargo mensual demo','5% después de tres días de gracia','percentage',5.00,3,35000,'["colegiatura"]')
       RETURNING id`,
      [campusNorte.id, tenant.id],
    );
    const paymentRuleId = paymentRuleRows[0]?.id;
    if (!paymentRuleId) throw new Error("No se creó la regla de pago demo");
    await pool.query(
      `INSERT INTO payment_surcharge_rules
        (campus_id, tenant_id, concepto, nombre, tipo, dias_gracia, porcentaje, activo)
       VALUES ($1,$2,'Colegiatura Mensual Primaria','Recargo por atraso demo','porcentaje',3,5.00,true)`,
      [campusNorte.id, tenant.id],
    );
    await pool.query(
      `INSERT INTO payment_due_dates (campus_id, tenant_id, concepto, dia_vencimiento, mes_aplicacion, activo)
       VALUES ($1,$2,'Colegiatura Mensual Primaria',10,'todos',true),
              ($3,$2,'Colegiatura Mensual Kinder',10,'todos',true)`,
      [campusNorte.id, tenant.id, campusSur.id],
    );
    await pool.query(
      `INSERT INTO scholarship_auto_rules (campus_id, tenant_id, nombre, tipo, condicion_json, descuento_porcentaje, aplica_a, activo)
       VALUES ($1,$2,'Regla hermanos demo','hermanos','{"minimo_hermanos":2}',10.00,'colegiatura',true)`,
      [campusNorte.id, tenant.id],
    );

    // ── Conciliación, facturación, planes y automatizaciones ──────────────────
    const cargoVencido = demoCharges.find(
      (charge) => charge.studentId === familiaPrincipal.id && charge.status === "vencido",
    );
    if (!cargoVencido) throw new Error("No se encontró cargo vencido para el cálculo de recargo demo");
    await pool.query(
      `INSERT INTO late_fee_calculations
        (charge_id, payment_rule_id, tenant_id, original_amount_centavos, due_date, adjusted_due_date,
         calculation_date, days_late, late_fee_amount_centavos, calculation_details, is_applied)
       VALUES ($1,$2,$3,$4,$5,$6,$7,95,14000,'Recargo calculado para adeudo antiguo demo',true)`,
      [
        cargoVencido.id,
        paymentRuleId,
        tenant.id,
        cargoVencido.amount,
        addDays(today, -95),
        addDays(today, -92),
        today,
      ],
    );

    const { rows: bankRows } = await pool.query<{ id: number }>(
      `INSERT INTO bank_transactions
        (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo, referencia, clabe_ordenante,
         nombre_ordenante, estado_conciliacion, charge_id, confianza_pct)
       VALUES
         ($1,$2,$3,'SPEI pendiente - pago de hermanos',560000,'credito','SPEI-DEMO-HERMANOS',
          '646180157000000001','Carlos Eduardo López Hernández','pendiente',$4,65),
         ($5,$2,$6,'Depósito con coincidencia sugerida',140000,'credito','SPEI-DEMO-REVISION',
          '646180157000000002','Javier Antonio García Ruiz','pendiente',$7,85),
         ($1,$2,$8,'Abono sin referencia para aclaración',95000,'credito','SPEI-DEMO-SIN-REF',
          '646180157000000003','Ordenante no identificado','pendiente',NULL,40)
       RETURNING id`,
      [
        campusNorte.id,
        tenant.id,
        isoDate(addDays(today, -1)),
        cargoPrimerHermano.id,
        campusSur.id,
        isoDate(today),
        cargoParcial.id,
        isoDate(addDays(today, -2)),
      ],
    );
    const bankTransactionId = bankRows[0]?.id;
    if (!bankTransactionId) throw new Error("No se crearon transacciones bancarias demo");

    await pool.query(
      `INSERT INTO family_payment_sources (tenant_id, family_id, clabe, nombre_inferido, confirmaciones)
       VALUES ($1,$2,'646180157000000001','Carlos Eduardo López Hernández',2)`,
      [tenant.id, familyId],
    );
    await pool.query(
      `INSERT INTO payment_events (tenant_id, provider, provider_event_id, payload, processed_at, status)
       VALUES
         ($1,'spei','evt_demo_spei_hermanos_2026','{"reference":"SPEI-DEMO-HERMANOS"}',NOW(),'processed'),
         ($1,'stripe','evt_demo_stripe_pago_2026','{"payment":"tarjeta demo"}',NOW(),'processed'),
         ($1,'spei','evt_demo_spei_revision_2026','{"reference":"SPEI-DEMO-REVISION"}',NULL,'received')`,
      [tenant.id],
    );

    const { rows: planRows } = await pool.query<{ id: number }>(
      `INSERT INTO payment_plans
        (campus_id, tenant_id, student_id, guardian_id, total_adeudo_centavos, monto_inicial_centavos,
         numero_pagos, frecuencia, fecha_inicio, estado, tipo_origen, charge_ids_origen, observaciones, created_by)
       SELECT $1,$2,$3,$4,420000,60000,3,'mensual',$5,'activo','reestructuracion',$6::jsonb,
              'Convenio demo para probar cuotas',id
       FROM users WHERE tenant_id = $2 AND role = 'administrador_general' LIMIT 1
       RETURNING id`,
      [
        campusNorte.id,
        tenant.id,
        familiaPrincipal.id,
        familiaPrincipal.padreId,
        isoDate(today),
        JSON.stringify([cargoVencido.id]),
      ],
    );
    const planId = planRows[0]?.id;
    if (!planId) throw new Error("No se creó el plan de pago demo");
    await pool.query(
      `INSERT INTO payment_plan_installments (plan_id, numero, monto_centavos, fecha_vencimiento, estado)
       VALUES ($1,1,120000,$2,'pendiente'),
              ($1,2,150000,$3,'pendiente'),
              ($1,3,150000,$4,'pendiente')`,
      [planId, isoDate(addDays(today, 15)), isoDate(addDays(today, 45)), isoDate(addDays(today, 75))],
    );

    const paidPayments = demoPayments.slice(0, 2);
    if (paidPayments.length < 2) throw new Error("No hay pagos suficientes para facturas demo");
    const demoPdf = Buffer.from("%PDF-1.4\n% CFDI simulado EduPay\n1 0 obj<</Type/Catalog>>endobj\n%%EOF").toString("base64");
    await pool.query(
      `INSERT INTO invoices
        (tenant_id, payment_id, uuid_cfdi, xml_url, pdf_url, estado, uso_cfdi, forma_pago,
         clave_prod_serv, clave_unidad, xml_content, pdf_base64)
       VALUES
         ($1,$2,'11111111-1111-4111-8111-111111111111','/demo/cfdi/11111111.xml','/demo/cfdi/11111111.pdf',
          'emitido','D10','03','86121500','E48',$3,$4),
         ($1,$5,'22222222-2222-4222-8222-222222222222','/demo/cfdi/22222222.xml','/demo/cfdi/22222222.pdf',
          'emitido','D10','04','86121500','E48',$6,$4)`,
      [
        tenant.id,
        paidPayments[0].id,
        '<cfdi:Comprobante version="4.0" Serie="DEMO" Folio="11111111">CFDI simulado EduPay</cfdi:Comprobante>',
        demoPdf,
        paidPayments[1].id,
        '<cfdi:Comprobante version="4.0" Serie="DEMO" Folio="22222222">CFDI simulado EduPay</cfdi:Comprobante>',
      ],
    );

    const { rows: adminRows } = await pool.query<{ id: number; email: string; role: string; campus_id: number }>(
      `SELECT id, email, role, campus_id
       FROM users
       WHERE tenant_id = $1
       ORDER BY id`,
      [tenant.id],
    );
    const directora = adminRows.find((user) => user.email === "directora@jfr.edu.mx");
    const contador = adminRows.find((user) => user.email === "contador@jfr.edu.mx");
    const caja = adminRows.find((user) => user.email === "caja@jfr.edu.mx");
    if (!directora || !contador || !caja) throw new Error("No se encontraron usuarios administrativos demo");

    await pool.query(
      `INSERT INTO notifications
        (tenant_id, user_id, guardian_id, student_id, canal, tipo, destinatario, asunto, mensaje, contenido, estado, intentos)
       VALUES
         ($1,$2,$3,$4,'EMAIL','RECORDATORIO_VENCIMIENTO','lopez.carlos@demo.mx','Pago próximo a vencer',
          'Tu colegiatura vence en cinco días.','Tu colegiatura vence en cinco días.','pendiente',0),
         ($1,$2,$5,$6,'WHATSAPP','AVISO_MORA','garcia.javier@demo.mx',NULL,
          'Tienes un saldo parcial pendiente.','Tienes un saldo parcial pendiente.','enviado',1),
         ($1,$7,$8,$9,'SMS','PAGO_CONFIRMADO','martinez.roberto@demo.mx',NULL,
          'Se registró un pago con saldo a favor.','Se registró un pago con saldo a favor.','enviado',1),
         ($1,$7,$3,$4,'EMAIL','CARGO_EMITIDO','lopez.carlos@demo.mx','Error de entrega demo',
          'Ejemplo de notificación con error.','Ejemplo de notificación con error.','error',3)`,
      [
        tenant.id,
        directora.id,
        familiaPrincipal.padreId,
        familiaPrincipal.id,
        segundoEstudiante.padreId,
        segundoEstudiante.id,
        contador.id,
        estudianteConBeca.padreId,
        estudianteConBeca.id,
      ],
    );

    const { rows: approvalRows } = await pool.query<{ id: number }>(
      `INSERT INTO pending_approvals
        (campus_id, tenant_id, requested_by, action_type, action_description, entity_type, entity_id,
         original_data, requested_data, reason, status, priority, expires_at)
       VALUES
         ($1,$2,$3,'modify_scholarship','Aumentar beca de excelencia demo','scholarship',$4,
          '{"porcentaje":50}','{"porcentaje":55}','Reconocimiento académico','pending','high',NOW() + INTERVAL '7 days'),
         ($1,$2,$5,'modify_payment_rule','Cambiar periodo de gracia demo','payment_rule',$6,
          '{"dias_gracia":3}','{"dias_gracia":5}','Apoyo temporal a familias','pending','medium',NOW() + INTERVAL '5 days')
       RETURNING id`,
      [campusNorte.id, tenant.id, caja.id, excelenciaId, directora.id, paymentRuleId],
    );
    if (approvalRows.length !== 2) throw new Error("No se crearon las aprobaciones demo");
    await pool.query(
      `INSERT INTO approval_notifications (approval_id, recipient_id, notification_type, title, message, is_read)
       VALUES ($1,$2,'approval_request','Beca pendiente de aprobación','Revisa la solicitud de modificación de beca.',false),
              ($3,$2,'approval_request','Regla de pago pendiente','Revisa el cambio de días de gracia.',false)`,
      [approvalRows[0].id, directora.id, approvalRows[1].id],
    );
    await pool.query(
      `INSERT INTO approval_workflow_logs (approval_id, user_id, action, notes, previous_status, new_status)
       VALUES ($1,$2,'created','Solicitud creada por auxiliar de caja',NULL,'pending'),
              ($3,$2,'created','Solicitud creada por dirección',NULL,'pending')`,
      [approvalRows[0].id, caja.id, approvalRows[1].id],
    );
    await pool.query(
      `INSERT INTO acciones_seguimiento
        (tenant_id, campus_id, entity_type, entity_id, tipo_hallazgo, status, titulo, descripcion, assigned_to, created_by, metadata)
       VALUES ($1,$2,'bank_transaction',$3,'excepcion_conciliacion','asignado',
               'Validar SPEI pendiente demo','Transacción sin conciliación automática para pruebas de caja.',
               $4,$5,'{"origen":"seed-demo","prioridad":"media"}'::jsonb)`,
      [tenant.id, campusNorte.id, bankTransactionId, caja.id, directora.id],
    );
    await pool.query(
      `INSERT INTO magic_link_tokens (tenant_id, guardian_id, token, expires_at, uses, max_uses, created_by)
       VALUES ($1,$2,'demo_magic_link_lopez_2026',NOW() + INTERVAL '14 days',0,3,$3)`,
      [tenant.id, familiaPrincipal.padreId, directora.id],
    );

    // ── Fixtures de vitest (tenant 29, campus 48, user 80) ──────────────────
    // ~28 archivos de tests usan campus_id=48 / tenant_id=29 / user_id=80
    // hardcodeados en JWTs sintéticos y consultas SQL.
    // El TRUNCATE RESTART IDENTITY los borra; los recreamos aquí con
    // ON CONFLICT DO NOTHING para no interferir con el seed demo.
    log("🔧 Restaurando fixtures de vitest (tenant 29, campus 48, user 80)...");
    const client2 = await pool.connect();
    try {
      await client2.query(`
        INSERT INTO tenants (id, nombre_legal, rfc)
        VALUES (29, 'Instituto JFR (Vitest Fixtures)', 'IJF950101AA0')
        ON CONFLICT (id) DO NOTHING
      `);
      await client2.query(`
        INSERT INTO campuses (id, tenant_id, nombre, clave_sep)
        VALUES (48, 29, 'Campus Norte (Vitest Fixtures)', '09DPR0048V')
        ON CONFLICT (id) DO NOTHING
      `);
      // User 80: requerido por audit_log.user_id FK y por tests que lo
      // consultan como "usuario administrador real del campus".
      await client2.query(
        `INSERT INTO users (id, campus_id, tenant_id, email, password_hash, name, role, is_active)
         VALUES (80, 48, 29, 'admin.campus.vitest@jfr.edu.mx', $1,
                 'Admin Campus Vitest', 'administrador_campus', true)
         ON CONFLICT (id) DO NOTHING`,
        [hash]   // hash ya computado arriba para DEMO_PASSWORD
      );
      // Concept de colegiatura: requerido por el import de adeudos migrados
      // (el endpoint busca concepts por tipo para el campus del JWT).
      await client2.query(`
        INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos, iva)
        VALUES (48, 29, 'Colegiatura (Vitest)', 'colegiatura', 'mensual', 100000, false)
        ON CONFLICT DO NOTHING
      `);
      // Avanzar secuencias para que futuros INSERTs automáticos no colisionen
      await client2.query(`
        SELECT setval('tenants_id_seq', GREATEST((SELECT MAX(id) FROM tenants) + 1, 50))
      `);
      await client2.query(`
        SELECT setval('campuses_id_seq', GREATEST((SELECT MAX(id) FROM campuses) + 1, 50))
      `);
      await client2.query(`
        SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users) + 1, 85))
      `);
    } finally {
      client2.release();
    }
    log("✅ Fixtures de vitest restaurados (tenant 29, campus 48, user 80)");

    const tableCounts = Object.fromEntries(
      await Promise.all(
        DEMO_COUNT_TABLES.map(async (table) => {
          const { rows } = await pool.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count FROM ${table}`,
          );
          return [table, rows[0]?.count ?? 0];
        }),
      ),
    );
    log("📊 Registros demo insertados por tabla:");
    for (const table of DEMO_COUNT_TABLES) {
      log(`   ${table}: ${tableCounts[table]}`);
    }

    log("🎉 Seed de datos demo completado exitosamente");

    return {
      success: true,
      logs,
      tableCounts,
      casosPrueba: {
        administradorCompleto: {
          rol: "Administrador general",
          email: "directora@jfr.edu.mx",
          password: DEMO_PASSWORD,
        },
        tutorHermanos: {
          nombre: "Carlos Eduardo López Hernández",
          email: "lopez.carlos@demo.mx",
          password: DEMO_PASSWORD,
          estudiantes: [
            "Sofía Valentina López Hernández",
            "Emilia Guadalupe López Hernández",
          ],
        },
        tutorBeca: {
          nombre: "Roberto Miguel Martínez Torres",
          email: "martinez.roberto@demo.mx",
          password: DEMO_PASSWORD,
          estudiante: "Valentina Isabel Martínez Torres",
          beca: "Beca Deportiva (20%)",
        },
      },
      credenciales: {
        administradores: [
          { rol: "Super Admin", email: "superadmin@edupay.mx", password: DEMO_PASSWORD },
          { rol: "Administrador General", email: "directora@jfr.edu.mx", password: DEMO_PASSWORD },
          { rol: "Admin Campus", email: "admin.campus@jfr.edu.mx", password: DEMO_PASSWORD },
          { rol: "Auxiliar Caja", email: "caja@jfr.edu.mx", password: DEMO_PASSWORD },
          { rol: "Contador General", email: "contador@jfr.edu.mx", password: DEMO_PASSWORD },
          { rol: "Admisiones", email: "admisiones@jfr.edu.mx", password: DEMO_PASSWORD },
        ],
        tutores: familias.map((f, i) => ({
          familia: `${f.padre.ap} ${f.madre.ap}`,
          emailPadre: `${toEmailSlug(f.padre.ap)}.${toEmailSlug(f.padre.nombres.split(" ")[0])}@demo.mx`,
          emailMadre: `${toEmailSlug(f.madre.ap)}.${toEmailSlug(f.madre.nombres.split(" ")[0])}@demo.mx`,
          password: DEMO_PASSWORD,
          estudiante: `${f.estudiante.nombres} ${f.estudiante.ap}`,
          campus: f.campus.nombre,
        })),
      },
    };
  } catch (error: any) {
    logs.push(`❌ Error: ${error.message}`);
    console.error("Seed error:", error);
    return { success: false, logs, error: error.message };
  }
}
