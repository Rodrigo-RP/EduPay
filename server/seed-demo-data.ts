// Script para crear datos demo según especificaciones del documento
import { db } from "./db";
import { 
  tenants, 
  campuses, 
  users, 
  students, 
  guardians, 
  student_guardian,
  concepts,
  charges,
  payments,
  payment_methods
} from "@shared/schema";
import bcrypt from "bcrypt";

export async function seedDemoData() {
  console.log("🌱 Creando datos demo para EscuelaPay...");

  try {
    // 1. Crear tenants (grupos escolares)
    const [tenantJFR] = await db.insert(tenants).values({
      nombre_legal: "Instituto JFR A.C.",
      rfc: "IJF123456789",
      timbrado_sat: "SAT001122334455",
      pac_proveedor: "FACTURAMA",
      pasarela_pagos: "STRIPE",
      onboarding_completado: true
    }).returning();

    const [tenantMontessori] = await db.insert(tenants).values({
      nombre_legal: "Instituto Montessori del Valle S.C.",
      rfc: "IMV987654321", 
      timbrado_sat: "SAT556677889900",
      pac_proveedor: "ENLACE_FISCAL",
      pasarela_pagos: "OPENPAY",
      onboarding_completado: true
    }).returning();

    // 2. Crear campus
    const [campusNorte] = await db.insert(campuses).values({
      tenant_id: tenantJFR.id,
      nombre: "Campus Norte",
      clave_sep: "21DPR0001K"
    }).returning();

    const [campusSur] = await db.insert(campuses).values({
      tenant_id: tenantJFR.id,
      nombre: "Campus Sur", 
      clave_sep: "21DPR0002L"
    }).returning();

    const [campusMontessori] = await db.insert(campuses).values({
      tenant_id: tenantMontessori.id,
      nombre: "Campus Principal",
      clave_sep: "21DPR0003M"
    }).returning();

    // 3. Crear usuarios administrativos (5 roles según especificaciones)
    const hashedPassword = await bcrypt.hash("demo123", 10);

    // Super Admin
    await db.insert(users).values({
      campus_id: campusNorte.id,
      email: "superadmin@escuelapay.com",
      password_hash: hashedPassword,
      role: "super_admin"
    });

    // Admin Campus
    await db.insert(users).values({
      campus_id: campusNorte.id,
      email: "admin@jfr.edu.mx",
      password_hash: hashedPassword,
      role: "admin"
    });

    // Finanzas/Caja
    await db.insert(users).values({
      campus_id: campusNorte.id,
      email: "caja@jfr.edu.mx", 
      password_hash: hashedPassword,
      role: "caja"
    });

    // Contador externo (read-only)
    await db.insert(users).values({
      campus_id: campusNorte.id,
      email: "contador@contabilidad.com",
      password_hash: hashedPassword,
      role: "contador"
    });

    // Admin Montessori
    await db.insert(users).values({
      campus_id: campusMontessori.id,
      email: "admin@montessori.edu.mx",
      password_hash: hashedPassword,
      role: "admin"
    });

    // 4. Crear conceptos de pago según especificaciones
    const [colegiaturaMensual] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Colegiatura Mensual",
      tipo: "COLEGIATURA_MENSUAL",
      periodicidad: "MENSUAL", 
      monto_centavos: 500000, // $5,000 MXN
      iva: false,
      genera_cfdi: true,
      descuento_pronto_pago: 5,
      dias_pronto_pago: 5,
      generacion_automatica: true
    }).returning();

    const [inscripcionAnual] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Inscripción Anual",
      tipo: "INSCRIPCION_ANUAL", 
      periodicidad: "ANUAL",
      monto_centavos: 300000, // $3,000 MXN
      iva: false,
      genera_cfdi: true,
      generacion_automatica: false
    }).returning();

    // Conceptos de inscripción específicos por nivel
    const [inscripcionKinder] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Inscripción Kinder",
      tipo: "INSCRIPCION_KINDER",
      periodicidad: "ANUAL",
      monto_centavos: 250000, // $2,500 MXN
      iva: false,
      genera_cfdi: true,
      generacion_automatica: false
    }).returning();

    const [inscripcionPrimaria] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Inscripción Primaria",
      tipo: "INSCRIPCION_PRIMARIA",
      periodicidad: "ANUAL",
      monto_centavos: 280000, // $2,800 MXN
      iva: false,
      genera_cfdi: true,
      generacion_automatica: false
    }).returning();

    const [inscripcionSecundaria] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Inscripción Secundaria",
      tipo: "INSCRIPCION_SECUNDARIA",
      periodicidad: "ANUAL",
      monto_centavos: 320000, // $3,200 MXN
      iva: false,
      genera_cfdi: true,
      generacion_automatica: false
    }).returning();

    const [materiales] = await db.insert(concepts).values({
      campus_id: campusNorte.id,
      nombre: "Materiales Didácticos",
      tipo: "CUOTA_ESPECIAL",
      periodicidad: "ANUAL",
      monto_centavos: 150000, // $1,500 MXN
      iva: true,
      genera_cfdi: true,
      generacion_automatica: false
    }).returning();

    // Conceptos Montessori (montos diferentes)
    await db.insert(concepts).values({
      campus_id: campusMontessori.id,
      nombre: "Colegiatura Mensual",
      tipo: "COLEGIATURA_MENSUAL",
      periodicidad: "MENSUAL",
      monto_centavos: 800000, // $8,000 MXN (más caro)
      iva: false,
      genera_cfdi: true,
      descuento_pronto_pago: 10,
      dias_pronto_pago: 7,
      generacion_automatica: true
    });

    // 5. Crear padres/tutores (responsables de pago)
    const [guardian1] = await db.insert(guardians).values({
      email: "carlos.perez@gmail.com",
      password_hash: hashedPassword,
      nombre_completo: "Carlos Pérez Martínez",
      telefono: "5551234567",
      direccion: "Av. Reforma 123, Col. Centro"
    }).returning();

    const [guardian2] = await db.insert(guardians).values({
      email: "ana.garcia@yahoo.com",
      password_hash: hashedPassword,
      nombre_completo: "Ana García López",
      telefono: "5559876543", 
      direccion: "Calle Juárez 456, Col. Roma Norte"
    }).returning();

    const [guardian3] = await db.insert(guardians).values({
      email: "luis.martinez@hotmail.com",
      password_hash: hashedPassword,
      nombre_completo: "Luis Martínez González",
      telefono: "5555678901",
      direccion: "Paseo de la Reforma 789, Col. Polanco"
    }).returning();

    // 6. Crear estudiantes
    const [student1] = await db.insert(students).values({
      campus_id: campusNorte.id,
      curp: "PEMC051215HDFRZR09",
      nombre_completo: "Carlos Pérez Méndez",
      grado: "3ro",
      grupo: "A",
      status: "activo"
    }).returning();

    const [student2] = await db.insert(students).values({
      campus_id: campusNorte.id,
      curp: "GALN040312MDFPPR03", 
      nombre_completo: "Andrea García Luna",
      grado: "2do",
      grupo: "B",
      status: "activo"
    }).returning();

    const [student3] = await db.insert(students).values({
      campus_id: campusNorte.id,
      curp: "MAGL070118HDFRNR05",
      nombre_completo: "Luis Martínez Gil", 
      grado: "1ro",
      grupo: "A",
      status: "activo"
    }).returning();

    // Estudiante hermano (mismo responsable)
    const [student4] = await db.insert(students).values({
      campus_id: campusNorte.id,
      curp: "MAGL090320HDFRNR06",
      nombre_completo: "Diego Martínez Gil",
      grado: "Kinder",
      grupo: "C", 
      status: "activo"
    }).returning();

    // 7. Asociar estudiantes con responsables de pago
    await db.insert(student_guardian).values([
      { student_id: student1.id, guardian_id: guardian1.id },
      { student_id: student2.id, guardian_id: guardian2.id },
      { student_id: student3.id, guardian_id: guardian3.id },
      { student_id: student4.id, guardian_id: guardian3.id } // Luis tiene 2 hijos
    ]);

    // 8. Crear MUCHOS cargos pendientes y pagados (para alimentar todas las funciones)
    
    // CARGOS PENDIENTES
    const [cargo1] = await db.insert(charges).values({
      student_id: student1.id,
      concept_id: colegiaturaMensual.id,
      ciclo_escolar: "2024-2025",
      fecha_emision: new Date("2025-01-01"),
      fecha_vencimiento: new Date("2025-01-15"),
      monto_base_centavos: 500000,
      beca_aplicada: "0",
      recargo_aplicado_centavos: 0,
      total_amount_centavos: 500000,
      estado: "pendiente",
      tipo_generacion: "AUTOMATICA",
      permite_pago_parcial: true
    }).returning();

    const [cargo2] = await db.insert(charges).values({
      student_id: student2.id,
      concept_id: materiales.id,
      ciclo_escolar: "2024-2025",
      fecha_emision: new Date("2025-01-10"),
      fecha_vencimiento: new Date("2025-01-20"),
      monto_base_centavos: 150000,
      beca_aplicada: "10", // 10% de beca
      recargo_aplicado_centavos: 0,
      total_amount_centavos: 135000, // Con descuento por beca
      estado: "pendiente",
      tipo_generacion: "MANUAL"
    }).returning();

    // Cargo vencido (para mostrar mora y recargos)
    const [cargoVencido] = await db.insert(charges).values({
      student_id: student3.id,
      concept_id: colegiaturaMensual.id,
      ciclo_escolar: "2024-2025",
      fecha_emision: new Date("2024-12-01"),
      fecha_vencimiento: new Date("2024-12-15"), // Vencido hace más de 1 mes
      monto_base_centavos: 500000,
      beca_aplicada: "0",
      recargo_aplicado_centavos: 50000, // $500 recargo por mora
      total_amount_centavos: 550000,
      estado: "pendiente",
      tipo_generacion: "AUTOMATICA"
    }).returning();

    // Cargos para hermanos (mismo responsable - Luis Martínez)
    await db.insert(charges).values({
      student_id: student4.id,
      concept_id: colegiaturaMensual.id,
      ciclo_escolar: "2024-2025", 
      fecha_emision: new Date("2025-01-01"),
      fecha_vencimiento: new Date("2025-01-15"),
      monto_base_centavos: 500000,
      beca_aplicada: "15", // 15% beca hermanos
      recargo_aplicado_centavos: 0,
      total_amount_centavos: 425000,
      estado: "pendiente",
      tipo_generacion: "AUTOMATICA"
    });

    // Más cargos pendientes para demo completo - Inscripciones específicas por nivel
    await db.insert(charges).values([
      {
        student_id: student1.id,
        concept_id: inscripcionKinder.id,
        ciclo_escolar: "2024-2025",
        fecha_emision: new Date("2024-08-01"),
        fecha_vencimiento: new Date("2024-08-15"),
        monto_base_centavos: 250000,
        beca_aplicada: "0",
        recargo_aplicado_centavos: 0,
        total_amount_centavos: 250000,
        estado: "pendiente",
        tipo_generacion: "AUTOMATICA"
      },
      {
        student_id: student2.id,
        concept_id: inscripcionPrimaria.id,
        ciclo_escolar: "2024-2025",
        fecha_emision: new Date("2024-08-01"),
        fecha_vencimiento: new Date("2024-08-15"),
        monto_base_centavos: 280000,
        beca_aplicada: "0",
        recargo_aplicado_centavos: 0,
        total_amount_centavos: 280000,
        estado: "pendiente",
        tipo_generacion: "AUTOMATICA"
      },
      {
        student_id: student3.id,
        concept_id: inscripcionSecundaria.id,
        ciclo_escolar: "2024-2025",
        fecha_emision: new Date("2024-08-01"),
        fecha_vencimiento: new Date("2024-08-15"),
        monto_base_centavos: 320000,
        beca_aplicada: "0",
        recargo_aplicado_centavos: 0,
        total_amount_centavos: 320000,
        estado: "pendiente",
        tipo_generacion: "AUTOMATICA"
      },
      {
        student_id: student2.id,
        concept_id: colegiaturaMensual.id,
        ciclo_escolar: "2024-2025",
        fecha_emision: new Date("2025-01-01"),
        fecha_vencimiento: new Date("2025-01-15"),
        monto_base_centavos: 500000,
        beca_aplicada: "20", // 20% beca socioeconómica
        recargo_aplicado_centavos: 0,
        total_amount_centavos: 400000,
        estado: "pendiente",
        tipo_generacion: "AUTOMATICA"
      }
    ]);

    // CARGOS PAGADOS (histórico para dashboard)
    const chargesPagados = await db.insert(charges).values([
      {
        student_id: student1.id,
        concept_id: colegiaturaMensual.id,
        ciclo_escolar: "2024-2025",
        fecha_emision: new Date("2024-12-01"),
        fecha_vencimiento: new Date("2024-12-15"),
        monto_base_centavos: 500000,
        beca_aplicada: "0",
        recargo_aplicado_centavos: 0,
        total_amount_centavos: 500000,
        estado: "pagado",
        tipo_generacion: "AUTOMATICA",
        monto_pagado_centavos: 500000,
        fecha_ultimo_pago: new Date("2024-12-10")
      },
      {
        student_id: student2.id,
        concept_id: colegiaturaMensual.id,
        ciclo_escolar: "2024-2025",
        fecha_emision: new Date("2024-11-01"),
        fecha_vencimiento: new Date("2024-11-15"),
        monto_base_centavos: 500000,
        beca_aplicada: "10",
        recargo_aplicado_centavos: 0,
        total_amount_centavos: 450000,
        estado: "pagado",
        tipo_generacion: "AUTOMATICA",
        monto_pagado_centavos: 450000,
        fecha_ultimo_pago: new Date("2024-11-12")
      },
      {
        student_id: student3.id,
        concept_id: colegiaturaMensual.id,
        ciclo_escolar: "2024-2025",
        fecha_emision: new Date("2024-10-01"),
        fecha_vencimiento: new Date("2024-10-15"),
        monto_base_centavos: 500000,
        beca_aplicada: "0",
        recargo_aplicado_centavos: 0,
        total_amount_centavos: 500000,
        estado: "pagado",
        tipo_generacion: "AUTOMATICA",
        monto_pagado_centavos: 500000,
        fecha_ultimo_pago: new Date("2024-10-08")
      }
    ]).returning();

    // 9. Crear métodos de pago guardados
    await db.insert(payment_methods).values([
      {
        guardian_id: guardian1.id,
        tipo: "TARJETA",
        last4: "4242",
        token_pasarela: "tok_demo_visa_4242",
        marca_tarjeta: "VISA",
        banco_emisor: "BBVA",
        is_default: true,
        pago_recurrente_activo: true
      },
      {
        guardian_id: guardian2.id, 
        tipo: "TARJETA",
        last4: "1234",
        token_pasarela: "tok_demo_mastercard_1234",
        marca_tarjeta: "MASTERCARD",
        banco_emisor: "Santander",
        is_default: true,
        pago_recurrente_activo: false
      },
      {
        guardian_id: guardian3.id,
        tipo: "CUENTA_BANCARIA",
        last4: "5678",
        token_pasarela: "acc_demo_banamex_5678",
        banco_emisor: "Banamex",
        is_default: true,
        pago_recurrente_activo: true
      }
    ]);

    // 10. Crear MUCHOS pagos completados (histórico para reportes y dashboard)
    await db.insert(payments).values([
      // Pagos recientes
      {
        charge_id: chargesPagados[0].id,
        guardian_id: guardian1.id,
        metodo: "TARJETA",
        referencia_pasarela: "pi_1234567890",
        monto_centavos: 500000,
        es_pago_parcial: false,
        estado: "completado",
        cfdi_uuid: "A001-12345-ABCDE-67890",
        cfdi_xml_url: "https://facturama.mx/cfdi/A001.xml",
        cfdi_pdf_url: "https://facturama.mx/cfdi/A001.pdf",
        origen_pago: "PORTAL",
        fecha_pago: new Date("2024-12-10")
      },
      {
        charge_id: chargesPagados[1].id,
        guardian_id: guardian2.id,
        metodo: "SPEI",
        referencia_pasarela: "SPEI789012345",
        monto_centavos: 450000,
        es_pago_parcial: false,
        estado: "completado",
        cfdi_uuid: "A002-23456-BCDEF-78901",
        cfdi_xml_url: "https://facturama.mx/cfdi/A002.xml",
        cfdi_pdf_url: "https://facturama.mx/cfdi/A002.pdf",
        origen_pago: "PORTAL",
        fecha_pago: new Date("2024-11-12")
      },
      {
        charge_id: chargesPagados[2].id,
        guardian_id: guardian3.id,
        metodo: "EFECTIVO",
        referencia_pasarela: "CASH001",
        monto_centavos: 500000,
        es_pago_parcial: false,
        estado: "completado",
        cfdi_uuid: "A003-34567-CDEFG-89012",
        cfdi_xml_url: "https://facturama.mx/cfdi/A003.xml",
        cfdi_pdf_url: "https://facturama.mx/cfdi/A003.pdf",
        origen_pago: "CAJA_FISICA",
        usuario_captura: 3, // Usuario caja
        observaciones: "Pago en efectivo - billetes de $500",
        fecha_pago: new Date("2024-10-08")
      },
      // Pagos históricos para estadísticas
      {
        charge_id: cargo1.id,
        guardian_id: guardian1.id,
        metodo: "PAYPAL",
        referencia_pasarela: "PAYPAL456789",
        monto_centavos: 250000, // Pago parcial
        es_pago_parcial: true,
        monto_pendiente_centavos: 250000,
        estado: "completado",
        cfdi_uuid: "A004-45678-DEFGH-90123",
        cfdi_xml_url: "https://facturama.mx/cfdi/A004.xml",
        cfdi_pdf_url: "https://facturama.mx/cfdi/A004.pdf",
        origen_pago: "PORTAL",
        fecha_pago: new Date("2024-09-15")
      },
      {
        charge_id: cargo2.id,
        guardian_id: guardian2.id,
        metodo: "OXXOPAY",
        referencia_pasarela: "OXXO987654321",
        monto_centavos: 135000,
        es_pago_parcial: false,
        estado: "completado",
        cfdi_uuid: "A005-56789-EFGHI-01234",
        cfdi_xml_url: "https://facturama.mx/cfdi/A005.xml",
        cfdi_pdf_url: "https://facturama.mx/cfdi/A005.pdf",
        origen_pago: "PORTAL",
        fecha_pago: new Date("2024-08-20")
      }
    ]);

    console.log("✅ DATOS DEMO COMPLETOS CREADOS EXITOSAMENTE!");
    console.log("\n📧 USUARIOS DEMO CREADOS:");
    console.log("🔧 Super Admin: superadmin@escuelapay.com / demo123");
    console.log("🏫 Admin Campus: admin@sanpatricio.edu.mx / demo123");
    console.log("💰 Caja: caja@sanpatricio.edu.mx / demo123");
    console.log("📊 Contador: contador@contabilidad.com / demo123");
    console.log("👨‍👩‍👧‍👦 PADRES DE FAMILIA:");
    console.log("👨 Carlos Pérez: carlos.perez@gmail.com / demo123 (1 hijo)");
    console.log("👩 Ana García: ana.garcia@yahoo.com / demo123 (1 hija)");
    console.log("👨 Luis Martínez: luis.martinez@hotmail.com / demo123 (2 hijos)");
    
    console.log("\n💰 DATOS FINANCIEROS DEMO:");
    console.log("- Cargos pendientes: 6 (incluye recargos por mora)");
    console.log("- Cargos pagados: 3 (histórico)");
    console.log("- Pagos procesados: 5 (TARJETA, SPEI, EFECTIVO, PAYPAL, OXXO)");
    console.log("- Becas aplicadas: 10%, 15%, 20%");
    console.log("- Recargos por mora: $500, $300");
    console.log("- Métodos de pago guardados: 3");
    console.log("- Facturas CFDI: 5 generadas");
    
    console.log("\n🎯 META ESCUELAPAY: 80% pagos antes del vencimiento");
    console.log("📊 DASHBOARD TENDRÁ DATOS COMPLETOS PARA PRUEBAS");

  } catch (error) {
    console.error("❌ Error creando datos demo:", error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}