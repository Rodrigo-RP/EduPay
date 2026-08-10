/**
 * assistant-knowledge.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Base de conocimiento interna del asistente EduPay.
 * Motor de intención 100% local — sin llamadas externas.
 *
 * DISEÑO PARA FUTURA INTEGRACIÓN LLM:
 * Cuando el sistema esté estable, reemplaza el cuerpo de `matchIntent()`
 * por una llamada a OpenAI/Claude. La firma del endpoint NO cambia.
 *
 * §9.1 — FUENTE ÚNICA DE RUTAS:
 * Todas las rutas del panel deben tener una entrada en `shared/route-registry.ts`.
 * KNOWLEDGE_BASE extiende esas entradas con keywords adicionales, descripción y roles.
 * El script `npm run check:routes` valida que ambos archivos estén en sincronía con App.tsx.
 */

import { ASSISTANT_ROUTES } from "../shared/route-registry";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface KnowledgeModule {
  route: string;
  label: string;
  description: string;
  keywords: string[];
  roles: string[]; // qué roles tienen acceso (vacío = todos)
}

export interface ActionDescriptor {
  actionId: string;
  params: Record<string, any>;
}

export interface IntentResult {
  reply: string;
  navigate?: { route: string; label: string };
  suggestions?: Array<{ route: string; label: string }>;
  /** Presente cuando el usuario reporta un problema → el widget lanza diagnóstico */
  diagnose?: { moduleId: string; label: string };
  /** Presente cuando el usuario hace una consulta de datos → el route la ejecuta */
  action?: ActionDescriptor;
}

// ── Base de conocimiento ──────────────────────────────────────────────────────

export const KNOWLEDGE_BASE: KnowledgeModule[] = [
  {
    route: "/admin",
    label: "Dashboard",
    description: "Vista general del campus con métricas de cobranza, alumnos y pagos.",
    keywords: [
      "dashboard", "inicio", "home", "principal", "resumen", "metricas", "metricas",
      "estadisticas", "kpi", "indicadores", "panel", "inicio", "vista general",
      "cuantos alumnos", "cuantos pagos", "resumen del dia"
    ],
    roles: [],
  },
  {
    route: "/estudiantes",
    label: "Estudiantes",
    description: "Alta, baja, búsqueda y expediente de alumnos del campus.",
    keywords: [
      "alumno", "alumnos", "estudiante", "estudiantes", "inscribir", "inscripcion",
      "dar de alta", "registrar alumno", "nuevo alumno", "agregar alumno",
      "expediente", "ficha", "buscar alumno", "baja alumno", "matricula",
      "curp", "grado", "grupo", "nivel", "primaria", "secundaria", "preescolar",
      "kinder", "lista de alumnos", "buscar estudiante", "sexo", "edad",
      "repetidor", "necesidades especiales"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","asistente","admisiones"],
  },
  {
    route: "/familias",
    label: "Familias",
    description: "Gestión de familias, tutores, padres y vínculos con alumnos.",
    keywords: [
      "familia", "familias", "padre", "madre", "tutor", "tutores", "papas",
      "papá", "mamá", "apoderado", "familiar", "responsable", "hermanos",
      "datos del padre", "datos de la madre", "contacto familiar", "estado civil",
      "divorciado", "divorciada", "viudo", "soltero", "vinculo", "familia numerosa"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","asistente","admisiones"],
  },
  {
    route: "/cargos",
    label: "Cargos",
    description: "Emisión, consulta y edición de cargos por concepto educativo.",
    keywords: [
      "cargo", "cargos", "emitir cargo", "generar cargo", "cobro", "cobros",
      "concepto", "conceptos", "cuota", "cuotas", "colegiatura", "inscripcion",
      "uniforme", "material", "actividades", "evento", "cargo pendiente",
      "cargo vencido", "adeudo", "deuda", "hacer un cargo", "nuevo cargo",
      "asignar cargo", "cuanto le debo", "emision"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","auxiliar_contable","asistente"],
  },
  {
    route: "/pagos",
    label: "Pagos",
    description: "Registro, búsqueda y consulta de pagos recibidos.",
    keywords: [
      "pago", "pagos", "registrar pago", "nuevo pago", "cobrar", "cobro",
      "recibo", "recibos", "comprobante", "transferencia", "deposito", "efectivo",
      "tarjeta", "pago en linea", "pago realizado", "pago procesado",
      "pago del padre", "buscar pago", "historial de pagos", "aplicar pago",
      "pagó", "ya pagó", "cuanto pagó"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","auxiliar_contable","asistente"],
  },
  {
    route: "/cuentas-por-cobrar",
    label: "Cuentas por Cobrar",
    description: "Lista de adeudos pendientes, morosidad y seguimiento de cobranza.",
    keywords: [
      "cuentas por cobrar", "cuenta por cobrar", "adeudo", "adeudos", "moroso",
      "morosidad", "deuda", "deudas", "vencido", "vencidos", "pendiente de pago",
      "quien debe", "no ha pagado", "cobranza", "recuperacion", "saldo pendiente",
      "saldo vencido", "dias vencidos", "alumnos con adeudo", "deudores"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","auxiliar_contable"],
  },
  {
    route: "/caja-conciliacion",
    label: "Caja y Conciliación",
    description: "Movimientos bancarios, conciliación y cuadre de caja.",
    keywords: [
      "caja", "conciliacion", "conciliación", "banco", "bancos", "movimiento bancario",
      "movimientos", "deposito bancario", "estado de cuenta", "cuadre", "corte de caja",
      "transferencia bancaria", "conciliar", "cierre del dia", "saldo en banco",
      "abono", "cargo bancario", "extracto"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","auxiliar_contable"],
  },
  {
    route: "/excepciones-conciliacion",
    label: "Excepciones Bancarias",
    description: "Pagos sin identificar, depósitos manuales y excepciones de conciliación.",
    keywords: [
      "excepcion", "excepciones", "sin identificar", "no identificado", "error bancario",
      "pago sin aplicar", "deposito sin identificar", "excepcion bancaria",
      "bandeja de excepciones", "conciliacion pendiente", "pago extraño"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","auxiliar_contable"],
  },
  {
    route: "/catalogo-productos",
    label: "Catálogo de Productos",
    description: "Catálogo de plantillas de precio por nivel académico (Kinder, Primaria, Secundaria, Bachillerato) con metadata fiscal SAT: clave de producto y unidad de medida para CFDI.",
    keywords: [
      "catalogo", "catálogo", "producto", "productos",
      "precio", "precios", "tarifa", "tarifas", "lista de precios",
      "precio por nivel", "precios por nivel", "precio kinder", "precio primaria",
      "precio secundaria", "precio bachillerato", "nivel academico", "nivel académico",
      "clave sat", "unidad de medida", "metadata fiscal", "plantilla de precio",
      "agregar producto", "nuevo producto", "editar producto"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general"],
  },
  {
    route: "/asignacion-precios",
    label: "Asignación de Precios",
    description: "Asignar precios por nivel, grado o grupo.",
    keywords: [
      "asignacion de precios", "asignar precio", "precio por nivel", "precio por grado",
      "tarifa por nivel", "precio colegiatura", "cuanto cobrar", "configurar precio",
      "monto", "asignar tarifa"
    ],
    roles: ["super_admin","administrador_general","contador_general"],
  },
  {
    route: "/becas",
    label: "Becas y Descuentos",
    description: "Asignación y seguimiento de becas y descuentos a alumnos.",
    keywords: [
      "beca", "becas", "descuento", "descuentos", "apoyo", "apoyos",
      "alumno becado", "asignar beca", "beca academica", "media beca",
      "beca completa", "porcentaje descuento", "subsidio", "beca de hermanos",
      "quitar beca", "cancelar beca", "beneficio", "beca deportiva"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","admisiones"],
  },
  {
    route: "/fiscal-contable",
    label: "Fiscal y Contable",
    description: "CFDIs, facturas, notas de crédito y módulo fiscal.",
    keywords: [
      "factura", "facturas", "cfdi", "cfdi4", "facturacion", "fiscal", "contable",
      "nota de credito", "timbrado", "timbrar", "sat", "rfc", "razon social",
      "comprobante fiscal", "xml", "pdf fiscal", "cancelar factura", "factura electronica",
      "comprobante electronico", "cfdi sin timbrar"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","auxiliar_contable"],
  },
  {
    route: "/notificaciones",
    label: "Notificaciones",
    description: "Envío de avisos, recordatorios y alertas a padres y tutores.",
    keywords: [
      "notificacion", "notificaciones", "aviso", "avisos", "mensaje", "mensajes",
      "recordatorio", "recordatorios", "alerta", "alertas", "correo", "email",
      "whatsapp", "sms", "enviar mensaje", "notificar padre", "aviso de pago",
      "recordar pago", "comunicado", "circular"
    ],
    roles: [],
  },
  {
    route: "/reportes",
    label: "Reportes",
    description: "Reportes académicos, financieros y de admisiones.",
    keywords: [
      "reporte", "reportes", "informe", "informes", "estadistica", "estadísticas",
      "exportar", "excel", "pdf", "descarga", "reporte de pagos", "reporte de alumnos",
      "resumen mensual", "reporte financiero", "graficas", "analisis"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","asistente","admisiones"],
  },
  {
    route: "/reportes-financieros",
    label: "Reportes Financieros",
    description: "Reportes detallados de ingresos, egresos y cobranza.",
    keywords: [
      "reporte financiero", "reporte de ingresos", "ingresos del mes", "flujo de efectivo",
      "estado de resultados", "cobranza mensual", "recaudacion", "reporte contable",
      "cierre mensual", "reporte de caja"
    ],
    roles: ["super_admin","administrador_general","contador_general","auxiliar_contable"],
  },
  {
    route: "/importacion-datos",
    label: "Importación de Datos",
    description: "Carga masiva de alumnos y familias desde Excel o CSV.",
    keywords: [
      "importar", "importacion", "importación", "carga masiva", "excel", "csv",
      "subir archivo", "cargar alumnos", "cargar estudiantes", "bulk", "masivo",
      "lista de alumnos excel", "importar familias", "migrar datos"
    ],
    roles: ["super_admin","administrador_general","admisiones"],
  },
  {
    route: "/aprobaciones",
    label: "Aprobaciones",
    description: "Solicitudes pendientes de aprobación por parte del administrador.",
    keywords: [
      "aprobacion", "aprobaciones", "aprobar", "solicitud", "solicitudes",
      "pendiente de aprobar", "cambio pendiente", "autorizar", "autorizacion",
      "revisar solicitud", "solicitud de beca", "solicitud de descuento",
      "flujo de aprobacion", "requiere aprobacion"
    ],
    roles: ["super_admin","administrador_general","administrador_campus"],
  },
  {
    route: "/semaforo-riesgo",
    label: "Semáforo de Riesgo",
    description: "Indicadores de riesgo financiero por campus y grupo de alumnos.",
    keywords: [
      "semaforo", "riesgo", "riesgo financiero", "indicador de riesgo",
      "alumnos en riesgo", "morosidad alta", "semáforo", "nivel de riesgo",
      "alerta de riesgo", "rojo", "amarillo", "verde", "cartera vencida"
    ],
    roles: ["super_admin","administrador_general","contador_general"],
  },
  {
    route: "/planes-pago",
    label: "Planes de Pago",
    description: "Creación y seguimiento de planes de pago a meses para familias.",
    keywords: [
      "plan de pago", "planes de pago", "meses", "mensualidades", "parcialidades",
      "pagar en partes", "diferir", "diferido", "acuerdo de pago", "convenio",
      "convenio de pago", "cuotas mensuales", "financiar", "pago diferido"
    ],
    roles: ["super_admin","administrador_general","contador_general"],
  },
  {
    route: "/calendario-financiero",
    label: "Calendario Fiscal",
    description: "Fechas límite, vencimientos y eventos fiscales del ciclo escolar.",
    keywords: [
      "calendario", "calendario fiscal", "fecha limite", "fecha de vencimiento",
      "vencimiento", "plazo", "plazo de pago", "ciclo escolar", "periodo",
      "cuando vence", "fecha de corte", "evento fiscal", "calendario de pagos",
      "cuando pagar", "fechas importantes"
    ],
    roles: ["super_admin","administrador_general","contador_general"],
  },
  {
    route: "/configuracion",
    label: "Configuración",
    description: "Ajustes generales del campus, institución y parámetros del sistema.",
    keywords: [
      "configuracion", "configuración", "ajustes", "ajuste", "parametros",
      "parametros del sistema", "datos del instituto", "datos institucionales",
      "nombre del instituto", "logo", "ciclo escolar activo", "configurar sistema",
      "cambiar configuracion"
    ],
    roles: ["super_admin","administrador_general"],
  },
  {
    route: "/usuarios",
    label: "Gestión de Usuarios",
    description: "Alta, baja y permisos de usuarios administrativos del campus.",
    keywords: [
      "usuario", "usuarios", "agregar usuario", "nuevo usuario", "crear usuario",
      "rol", "roles", "permisos", "permiso", "acceso", "contraseña", "password",
      "cambiar rol", "asignar rol", "personal", "staff", "administrador",
      "contador", "asistente"
    ],
    roles: ["super_admin","administrador_general","administrador_campus"],
  },
  {
    route: "/historial",
    label: "Historial de Movimientos",
    description: "Registro de todos los eventos y cambios realizados en el sistema.",
    keywords: [
      "historial", "log", "auditoria", "auditoría", "movimientos", "registro",
      "quien hizo", "que paso", "cambio", "cambios", "actividad", "bitacora",
      "bitácora", "evento", "eventos", "trazabilidad", "que cambio"
    ],
    roles: ["super_admin","administrador_general","contador_general"],
  },

  // ── Rutas agregadas por §9.1 (antes sin cobertura del asistente) ──────────

  {
    route: "/emision-cargos",
    label: "Emisión de Cargos",
    description: "Generación masiva de cargos por ciclo, nivel o grupo.",
    keywords: [
      "emision de cargos", "emitir cargos", "cargos masivos", "generar cargos",
      "cargos del ciclo", "emision masiva", "lanzar cargos", "aplicar cargos",
      "cargos por nivel", "cargos por grupo"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general"],
  },
  {
    route: "/centro-comandos",
    label: "Centro de Comandos",
    description: "Panel de operaciones avanzadas, tareas programadas y control del sistema.",
    keywords: [
      "centro de comandos", "comandos", "operaciones", "control del sistema",
      "centro operativo", "tareas programadas", "jobs", "procesos", "automatizacion",
      "pipeline", "scheduler"
    ],
    roles: ["super_admin","administrador_general"],
  },
  {
    route: "/reporte-consejo",
    label: "Reporte para el Consejo",
    description: "Informe ejecutivo de cobranza y finanzas para el consejo directivo.",
    keywords: [
      "reporte consejo", "reporte directivo", "consejo escolar", "directivos",
      "informe consejo", "reporte ejecutivo", "presentacion directiva", "board report",
      "informe directivo", "reporte de direccion"
    ],
    roles: ["super_admin","administrador_general"],
  },
  {
    route: "/perfil",
    label: "Mi Perfil",
    description: "Datos personales, cambio de contraseña y foto del usuario actual.",
    keywords: [
      "perfil", "mi perfil", "mi cuenta", "cambiar contrasena", "cambiar password",
      "datos personales", "foto de perfil", "nombre de usuario", "cuenta"
    ],
    roles: [],
  },
  {
    route: "/dashboard-admisiones",
    label: "Dashboard de Admisiones",
    description: "Métricas de admisiones, prospectos e inscritos del ciclo actual.",
    keywords: [
      "admisiones", "dashboard admisiones", "prospectos", "inscritos",
      "nuevos alumnos", "captacion", "proceso de admision", "pipeline admisiones"
    ],
    roles: ["super_admin","administrador_general","admisiones"],
  },
  {
    route: "/dashboard-caja",
    label: "Dashboard de Caja",
    description: "Resumen del día de caja: ingresos, pagos recibidos y saldo.",
    keywords: [
      "dashboard caja", "resumen de caja", "ingresos del dia", "caja del dia",
      "cuanto entrò hoy", "resumen diario", "cierre del dia"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","auxiliar_contable"],
  },
];

// ── §9.1 Validación en tiempo de inicio: KNOWLEDGE_BASE vs route-registry ────
// Detecta rutas del registro que aún no tienen cobertura completa en KNOWLEDGE_BASE.
// Esto es una advertencia de desarrollo, no un error fatal en producción.
const _missingFromKB = ASSISTANT_ROUTES.filter(
  (r) => !KNOWLEDGE_BASE.some((m) => m.route === r.path)
);
if (_missingFromKB.length > 0) {
  console.warn(
    `[assistant] §9.1 ADVERTENCIA — ${_missingFromKB.length} ruta(s) en route-registry sin cobertura en KNOWLEDGE_BASE:`,
    _missingFromKB.map((r) => r.path).join(", ")
  );
}

// ── Utilidades de normalización ───────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // quitar acentos
    .replace(/[^a-z0-9\s]/g, " ")      // solo alfanumérico
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text).split(" ").filter(t => t.length > 1);
}

// Mapeo de páginas actuales a nombres legibles
const ROUTE_LABELS: Record<string, string> = {
  "/admin": "Dashboard",
  "/estudiantes": "Estudiantes",
  "/familias": "Familias",
  "/cargos": "Cargos",
  "/pagos": "Pagos",
  "/cuentas-por-cobrar": "Cuentas por Cobrar",
  "/caja-conciliacion": "Caja y Conciliación",
  "/excepciones-conciliacion": "Excepciones Bancarias",
  "/catalogo-productos": "Catálogo de Productos",
  "/asignacion-precios": "Asignación de Precios",
  "/becas": "Becas y Descuentos",
  "/fiscal-contable": "Fiscal y Contable",
  "/notificaciones": "Notificaciones",
  "/reportes": "Reportes",
  "/reportes-financieros": "Reportes Financieros",
  "/importacion-datos": "Importación de Datos",
  "/aprobaciones": "Aprobaciones",
  "/semaforo-riesgo": "Semáforo de Riesgo",
  "/planes-pago": "Planes de Pago",
  "/calendario-financiero": "Calendario Fiscal",
  "/configuracion": "Configuración",
  "/usuarios": "Gestión de Usuarios",
  "/historial": "Historial de Movimientos",
};

export function getPageLabel(route: string): string {
  return ROUTE_LABELS[route] || route;
}

// ── Motor de intención ────────────────────────────────────────────────────────

interface ScoredModule {
  module: KnowledgeModule;
  score: number;
}

// ── Detección de acciones ─────────────────────────────────────────────────────

/**
 * Detecta si el mensaje es una consulta de datos o solicitud de acción.
 * Se verifica ANTES del motor de navegación.
 */
export function detectActionIntent(message: string): ActionDescriptor | null {
  const n = normalize(message);

  // ── Discrepancia / inconsistencia de números ──────────────────────────────
  // "solo tengo 8 alumnos pero 78 becas", "no coincide", "por qué hay más becas"
  if (
    (n.includes("pero") || n.includes("y solo") || n.includes("sin embargo")) &&
    /\d/.test(n) &&
    (n.includes("becas") || n.includes("alumnos") || n.includes("pagos") || n.includes("cargos"))
  ) return { actionId: "query:discrepancia", params: {} };

  if (/(discrepancia|no coincide|diferencia entre|inconsistencia|por que (hay|tengo|aparecen?) (mas|menos|mas|solo))/.test(n))
    return { actionId: "query:discrepancia", params: {} };

  // ── Resumen financiero ────────────────────────────────────────────────────
  if (/(cuanto (se ha|hemos|lleva[ms]?) cobrado|resumen financiero|resumen del mes|total cobrado|cuanto llevamos|cuanto hay cobrado|cuanto tenemos cobrado)/.test(n))
    return { actionId: "query:resumen_financiero", params: {} };

  // ── Contar entidades ──────────────────────────────────────────────────────
  // Acepta masculino (cuántos) y femenino (cuántas)
  const countMatch = n.match(/cu[aá]nt[ao]s?\s+(alumnos?|estudiantes?|pagos?|cargos?|becas?|familias?|descuentos?)/);
  if (countMatch)
    return { actionId: "query:contar", params: { entity: countMatch[1] } };

  // ── Becas de un alumno específico ─────────────────────────────────────────
  // DEBE ir ANTES que becas_nivel: "qué becas tiene García", "becas de Juan"
  // El patrón captura un apellido/nombre después de "tiene", "de", etc.
  const becasMatch = n.match(/(?:qu[eé] becas? (?:tiene|hay para|tiene asignada?s?)|becas? de|descuentos? de)\s+(.{2,40})/);
  if (becasMatch)
    return { actionId: "query:becas_alumno", params: { nombre: becasMatch[1].trim() } };

  // ── Becas por nivel / sección ─────────────────────────────────────────────
  // "alumnos con beca de primaria", "qué alumnos tienen beca de secundaria",
  // "becas de la sección preparatoria", "alumnos becados en kinder"
  const NIVELES = ["primaria", "secundaria", "preparatoria", "preescolar", "kinder", "bachillerato", "prescolar", "inicial"];
  const nivelEnMensaje = NIVELES.find((nv) => n.includes(nv));
  if (nivelEnMensaje && (n.includes("beca") || n.includes("becado") || n.includes("descuento"))) {
    return { actionId: "query:becas_nivel", params: { nivel: nivelEnMensaje } };
  }
  // Sin nivel específico: "qué alumnos tienen beca", "lista de becados"
  if (
    (n.includes("beca") || n.includes("becados") || n.includes("alumnos con descuento")) &&
    (n.startsWith("que ") || n.startsWith("cuales ") || n.startsWith("lista") || n.includes("tienen beca") || n.includes("estan becados"))
  ) {
    return { actionId: "query:becas_nivel", params: { nivel: "" } };
  }

  // ── Cargos / adeudos de un alumno ─────────────────────────────────────────
  // "qué cargos tiene García", "qué cargos debe García", "adeudos de Juan", "cuánto debe García"
  const cargosMatch = n.match(/(?:qu[eé] (?:cargos?|adeudos?) (?:tiene|hay para|debe|adeuda)|adeudos? de|cu[aá]nto (?:debe|adeuda)|cargos? de)\s+(?:el alumno\s+|la alumna\s+)?(.{2,40})/);
  if (cargosMatch)
    return { actionId: "query:cargos_alumno", params: { nombre: (cargosMatch[2] || cargosMatch[0].split(" de ")[1] || "").trim() } };

  // ── Saldo de un alumno ────────────────────────────────────────────────────
  const saldoMatch = n.match(/saldo (?:del?|de) (?:alumno\s+|estudiante\s+)?(.{2,40})/);
  if (saldoMatch)
    return { actionId: "query:saldo_alumno", params: { nombre: saldoMatch[1].trim() } };

  // ── Verificar sistema / detectar errores ──────────────────────────────────
  // "qué no funciona", "verifica todo", "hay errores", "revisa el sistema",
  // "qué queries están rotas", "el asistente tiene errores", "audita el sistema"
  if (
    n.match(/verif[ií]c[ao]|qu[eé] no funciona|hay errores?|revisa( el sistema| todo|las queries?)?|audita|todo funciona|qu[eé] est[aá] roto|queries? rota|sistema funciona|checa errores?/)
  ) {
    return { actionId: "query:verificar_sistema", params: {} };
  }

  // ── Familias con N o más hijos ────────────────────────────────────────────
  // "qué familias tienen más de 1 hijo", "familias con 2 o más alumnos",
  // "familias con hermanos", "cuántas familias tienen varios hijos"
  const famHijosMatch = n.match(
    /(?:que|cual(?:es)?|cuantas?)\s+familias?\s+(?:tienen?|tienen?[^?]{0,20})\s*(?:mas de\s*(\d+)|(\d+)\s*o\s*(?:mas|m[aá]s)|varios|m[uú]ltiples|hermanos?|dos|tres|cuatro)/
  );
  if (famHijosMatch) {
    const num = famHijosMatch[1] ? parseInt(famHijosMatch[1], 10)
              : famHijosMatch[2] ? parseInt(famHijosMatch[2], 10) - 1
              : 1; // "hermanos" / "varios" → mínimo 2 hijos (>1)
    return { actionId: "query:familias_hijos", params: { minHijos: num } };
  }
  // "familias con mas de N hijos/alumnos"
  const famHijosMatch2 = n.match(/famili[ao]s?\s+con\s+(?:mas de\s*(\d+)|(\d+)\s*o\s*(?:mas|m[aá]s)|varios|hermanos?)\s*(?:hijos?|alumnos?|estudiantes?|inscritos?)?/);
  if (famHijosMatch2) {
    const num = famHijosMatch2[1] ? parseInt(famHijosMatch2[1], 10)
              : famHijosMatch2[2] ? parseInt(famHijosMatch2[2], 10) - 1
              : 1;
    return { actionId: "query:familias_hijos", params: { minHijos: num } };
  }

  // ── Búsqueda de alumno ────────────────────────────────────────────────────
  // "busca al alumno García", "encuentra a Juan", "buscar estudiante López"
  const searchMatch = n.match(/(?:bus[cq][au][ea]?[r]?|encuentra[r]?|localiza[r]?)\s+(?:al?\s+)?(?:alumno\s+|estudiante\s+)?(.{2,40})/);
  if (searchMatch && (n.includes("alumno") || n.includes("estudiante") || n.includes("buscar") || n.includes("busca") || n.includes("encuentra")))
    return { actionId: "query:buscar_alumno", params: { nombre: searchMatch[1].trim() } };

  return null;
}

/** Palabras clave que indican que el usuario reporta un fallo */
const FAULT_KEYWORDS = [
  // Negaciones directas
  "no funciona", "no carga", "no guarda", "no aparece", "no puedo",
  "no abre", "no muestra", "no genera", "no se genera", "no se guarda",
  "no me deja", "no me permite", "no descarga", "no se descargo",
  "no se genero", "no importa", "no se importo", "no procesa",
  "no jala", "no sirve", "no responde",
  // Palabras de fallo genérico
  "error", "falla", "fallo", "problema", "bug", "roto", "rota",
  "tira error", "sale error", "marca error",
  // Frases de solicitud de diagnóstico
  "revisar", "diagnosticar", "revisar si funciona", "checar", "verificar si",
];

function hasFaultIntent(normalizedMsg: string): boolean {
  return FAULT_KEYWORDS.some((kw) => normalizedMsg.includes(normalize(kw)));
}

export function matchIntent(
  message: string,
  userRole: string,
  currentPath?: string
): IntentResult {
  const tokens = tokenize(message);
  const normalizedMsg = normalize(message);

  if (tokens.length === 0) {
    return {
      reply: "No entendí tu mensaje. Puedes preguntarme dónde está una función, por ejemplo: _\"¿dónde registro un pago?\"_ o _\"quiero ver las becas\"_.",
    };
  }

  // ── Detectar acción / consulta de datos PRIMERO ───────────────────────────
  const action = detectActionIntent(message);
  if (action) {
    return { reply: "Consultando los datos…", action };
  }

  // Detectar intención de fallo
  const isFaultReport = hasFaultIntent(normalizedMsg);

  // Filtrar módulos accesibles según el rol
  const accessible = KNOWLEDGE_BASE.filter(
    (m) => m.roles.length === 0 || m.roles.includes(userRole)
  );

  // Puntuar módulos
  const scored: ScoredModule[] = accessible.map((m) => {
    const normalizedKeywords = m.keywords.map(normalize);
    const normalizedLabel = normalize(m.label);
    const normalizedDesc = normalize(m.description);
    let score = 0;

    for (const token of tokens) {
      // Ignorar tokens de palabras de fallo para el scoring de módulo
      if (FAULT_KEYWORDS.some((kw) => normalize(kw).split(" ").includes(token))) continue;

      // Coincidencia exacta: el keyword completo es igual al token
      if (normalizedKeywords.some((kw) => kw === token)) score += 3;
      // El token aparece como PALABRA COMPLETA dentro de un keyword multi-palabra
      // (evita que "hace" matchee "hacer un cargo")
      else if (token.length >= 4 && normalizedKeywords.some((kw) =>
        kw.split(" ").includes(token))) score += 2;
      // El token contiene un keyword corto dentro de sí (ej. "pagado" contiene "pago")
      else if (normalizedKeywords.some((kw) => token.includes(kw) && kw.length > 3)) score += 1;
      // Label: coincidencia de palabra completa
      if (token.length >= 4 && normalizedLabel.split(" ").includes(token)) score += 2;
      // Descripción: coincidencia de palabra completa
      if (token.length >= 4 && normalizedDesc.split(" ").includes(token)) score += 1;
    }

    return { module: m, score };
  });

  // Ordenar por puntaje
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const THRESHOLD = 2;

  // ── Caso: reporte de fallo — prioridad 1: módulo de la página actual ──────────
  if (isFaultReport && currentPath) {
    // Buscar el módulo que corresponde a la ruta actual (ignorar restricciones de rol,
    // el usuario ya está en la página así que tiene acceso)
    const currentModule = KNOWLEDGE_BASE.find((m) => m.route === currentPath);
    if (currentModule) {
      const moduleId = currentModule.route.replace(/^\//, "");
      return {
        reply: `Voy a hacer una prueba del módulo **${currentModule.label}** ahora mismo…`,
        diagnose: { moduleId, label: currentModule.label },
      };
    }
  }

  // ── Caso: reporte de fallo + módulo identificado por keywords ─────────────────
  if (isFaultReport && best && best.score >= THRESHOLD) {
    const moduleId = best.module.route.replace(/^\//, "");
    return {
      reply: `Voy a hacer una prueba del módulo **${best.module.label}** ahora mismo…`,
      diagnose: { moduleId, label: best.module.label },
    };
  }

  // ── Caso: reporte de fallo sin módulo claro ───────────────────────────────────
  if (isFaultReport && (!best || best.score < THRESHOLD)) {
    return {
      reply: "Entiendo que algo no está funcionando. ¿A qué módulo se refiere el problema? Selecciona uno para que haga la prueba:",
      suggestions: accessible.slice(0, 8).map((m) => ({ route: m.route, label: m.label })),
    };
  }

  // ── Caso: ya está en esa página ──────────────────────────────────────────────
  if (
    best &&
    best.score >= THRESHOLD &&
    currentPath &&
    best.module.route === currentPath
  ) {
    return {
      reply: `Ya estás en **${best.module.label}**. ${best.module.description}`,
    };
  }

  // ── Caso: coincidencia clara ─────────────────────────────────────────────────
  if (best && best.score >= THRESHOLD) {
    const secondBest = scored[1];
    const suggestions =
      secondBest && secondBest.score >= THRESHOLD
        ? [
            { route: secondBest.module.route, label: secondBest.module.label },
            ...(scored[2]?.score >= THRESHOLD
              ? [{ route: scored[2].module.route, label: scored[2].module.label }]
              : []),
          ]
        : undefined;

    return {
      reply: `**${best.module.label}** — ${best.module.description}`,
      navigate: { route: best.module.route, label: best.module.label },
      suggestions: suggestions?.length ? suggestions : undefined,
    };
  }

  // ── Caso: sin coincidencia — mostrar secciones disponibles ───────────────────
  const topModules = accessible.slice(0, 8).map((m) => ({
    route: m.route,
    label: m.label,
  }));

  return {
    reply:
      "No entendí qué estás buscando. Aquí están las secciones disponibles — selecciona una o escribe tu duda con más detalle:",
    suggestions: topModules,
  };
}
