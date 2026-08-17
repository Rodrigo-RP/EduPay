// @ts-nocheck
import bcrypt from "bcrypt";
import { db, pool } from "./db";
import {
  tenants, campuses, users, students, guardians,
  student_guardian, concepts, charges, payments, payment_methods,
} from "../shared/schema";
import { eq, and } from "drizzle-orm";

const DEMO_PASSWORD = "Demo2025!";

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
    // ── Limpiar datos demo previos ──────────────────────────────────────────
    log("🧹 Limpiando datos demo previos...");
    // TRUNCATE ... RESTART IDENTITY CASCADE propaga a todos los referenciantes
    // independientemente de si tienen ON DELETE CASCADE o NO ACTION.
    // Evita tener que mantener un orden topológico manual al agregar tablas.
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
          student_guardian,
          students,
          guardians,
          discounts,
          notifications,
          payment_rules,
          payment_surcharge_rules,
          payment_due_dates,
          campus_payment_config,
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
    log("✅ 5 conceptos de pago creados");

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
    ];

    const now = new Date();
    const thisYear = now.getFullYear();

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
        { student_id: student.id, guardian_id: padre.id, porcentaje_responsabilidad: "50.00" },
        { student_id: student.id, guardian_id: madre.id, porcentaje_responsabilidad: "50.00" },
      ]);

      // Cargos: 3 meses de colegiatura (abril pagado, mayo pagado, junio pendiente)
      const months = [
        { mes: "Abril 2025", emision: `${thisYear}-04-01`, venc: `${thisYear}-04-10`, estado: "pagado" },
        { mes: "Mayo 2025", emision: `${thisYear}-05-01`, venc: `${thisYear}-05-10`, estado: "pagado" },
        { mes: "Junio 2025", emision: `${thisYear}-06-01`, venc: `${thisYear}-06-10`, estado: "pendiente" },
        { mes: "Julio 2025", emision: `${thisYear}-07-01`, venc: `${thisYear}-07-10`, estado: i < 3 ? "vencido" : "pendiente" },
      ];

      for (const m of months) {
        const [charge] = await db.insert(charges).values({
          student_id: student.id,
          concept_id: f.concept.id,
          tenant_id: tenant.id,
          ciclo_escolar: "2025-2026",
          fecha_emision: m.emision,
          fecha_vencimiento: m.venc,
          monto_base_centavos: f.concept.monto_centavos,
          beca_aplicada: "0.00",
          recargo_aplicado_centavos: m.estado === "vencido" ? Math.round(f.concept.monto_centavos * 0.05) : 0,
          estado: m.estado,
        }).returning();

        if (m.estado === "pagado") {
          await db.insert(payments).values({
            charge_id: charge.id,
            guardian_id: padre.id,
            metodo: "tarjeta",
            referencia_pasarela: `ref_demo_${charge.id}_${Date.now()}`,
            monto_centavos: f.concept.monto_centavos,
            estado: "exitoso",
          });
        }
      }

      // Inscripción pagada (solo para los primeros 8 estudiantes)
      if (i < 8) {
        const [inscCharge] = await db.insert(charges).values({
          student_id: student.id,
          concept_id: concInsc.id,
          tenant_id: tenant.id,
          ciclo_escolar: "2025-2026",
          fecha_emision: `${thisYear}-01-15`,
          fecha_vencimiento: `${thisYear}-02-28`,
          monto_base_centavos: concInsc.monto_centavos,
          beca_aplicada: "0.00",
          recargo_aplicado_centavos: 0,
          estado: "pagado",
        }).returning();
        await db.insert(payments).values({
          charge_id: inscCharge.id,
          guardian_id: padre.id,
          metodo: "spei",
          referencia_pasarela: `spei_demo_${inscCharge.id}`,
          monto_centavos: concInsc.monto_centavos,
          estado: "exitoso",
        });
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

    log(`✅ 10 familias creadas (10 padres, 10 madres, 10 estudiantes)`);
    log("🎉 Seed de datos demo completado exitosamente");

    return {
      success: true,
      logs,
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
