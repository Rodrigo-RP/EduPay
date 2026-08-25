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
  /** Presente para instrucciones locales; nunca produce una acción ejecutable. */
  guide?: { id: string; route: string; label: string; steps: string[] };
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

  // ── Catálogo de reportes (RPT-04, RPT-07, RPT-08) — antes sin cobertura ──

  {
    route: "/reportes-admisiones",
    label: "Reportes de Admisiones",
    description: "Métricas de captación, embudo de prospectos e inscritos por ciclo y nivel.",
    keywords: [
      "reportes admisiones", "reporte de admisiones", "reporte de inscritos",
      "captacion alumnos", "nuevos alumnos ciclo", "prospectos inscritos",
      "funnel admisiones", "tasa de conversion admisiones", "cuantos se inscribieron",
      "alumnos nuevos", "reporte admision", "cuantos ingresaron", "captacion escolar",
      "reporte de captacion", "reporte de prospectos"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","admisiones"],
  },
  {
    route: "/reporte-antiguedad-saldos",
    label: "Antigüedad de Saldos",
    description: "Cartera vencida organizada en tramos: 0-30, 31-60, 61-90, 91-120, 121-180, +180 días.",
    keywords: [
      "antiguedad de saldos", "antiguedad cartera", "cartera vencida tramos",
      "cuanto tiempo debe", "cuanto llevan sin pagar", "tramos de cartera",
      "tramos vencimiento", "30 dias vencido", "60 dias vencido", "90 dias vencido",
      "morosidad por tramo", "bucket vencimiento", "vencidos por tramo",
      "dias sin pagar", "cartera por antiguedad"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","auxiliar_contable"],
  },
  {
    // Distinción respecto a /semaforo-riesgo:
    //   Semáforo = dashboard operativo en tiempo real, filtrado client-side.
    //   Reporte de Riesgo = reporte formal exportable con scoring por alumno.
    // Keywords deliberadamente distintos: "reporte", "scoring", "exportar", "detalle"
    // nunca aparecen en las keywords de /semaforo-riesgo.
    route: "/reporte-riesgo",
    label: "Reporte de Riesgo de Cobranza",
    description: "Scoring predictivo de riesgo por alumno con semáforo exportable a Excel y PDF.",
    keywords: [
      "reporte de riesgo", "scoring de riesgo",
      "reporte formal riesgo", "exportar riesgo",
      "detalle de riesgo", "riesgo por alumno", "reporte scoring",
      "alumnos con riesgo exportar", "scoring por alumno"
    ],
    roles: ["super_admin","administrador_general","administrador_campus","contador_general","auxiliar_contable"],
  },

  // ── Rutas operativas sin cobertura previa ────────────────────────────────

  {
    route: "/comandos-contador",
    label: "Comandos del Contador",
    description: "Panel de acciones rápidas del contador: conciliación, cierre y herramientas contables avanzadas.",
    keywords: [
      "comandos contador", "panel contador", "herramientas contables",
      "acciones contables", "cierre contable", "comandos contables",
      "herramientas del contador", "acciones del contador"
    ],
    roles: ["super_admin","administrador_general","contador_general"],
  },
  {
    route: "/configuracion-inicial",
    label: "Configuración Inicial",
    description: "Asistente de primer inicio para configurar datos del campus, ciclo escolar y conceptos base.",
    keywords: [
      "configuracion inicial", "setup inicial", "primer inicio",
      "configurar por primera vez", "inicializar campus", "wizard configuracion",
      "configurar sistema primera vez", "inicio del sistema"
    ],
    roles: ["super_admin","administrador_general"],
  },
  {
    route: "/configuracion-pagos-completa",
    label: "Configuración de Pagos",
    description: "Configuración avanzada de métodos de pago, pasarelas y reglas de recargo.",
    keywords: [
      "configuracion de pagos", "metodos de pago", "pasarela de pago",
      "configurar pagos", "metodo de cobro", "configurar recargos",
      "reglas de pago", "configurar pasarela", "metodo pago avanzado"
    ],
    roles: ["super_admin","administrador_general"],
  },
  {
    route: "/portal-3clics",
    label: "Portal de Padres",
    description: "Portal de pago en línea para padres y tutores con liga de pago en tres clics.",
    keywords: [
      "portal padres", "portal de pago", "pago en linea padres",
      "liga de pago", "pago 3 clics", "portal tutor", "link de pago padre",
      "liga cobro", "pago en linea tutores", "portal familiar"
    ],
    roles: [],
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

/**
 * Estas solicitudes nunca pueden abandonar el proceso hacia un proveedor LLM,
 * aun cuando contengan términos del dominio escolar.
 */
export function containsSensitiveAssistantData(text: string): boolean {
  const normalized = normalize(text);
  const sensitiveTerms = [
    "curp", "rfc", "contrasena", "password", "token", "api key",
    "clave api", "authorization", "autorizacion", "credencial", "credenciales",
    "secreto", "secretos",
  ];
  const hasSensitiveTerm = sensitiveTerms.some((term) => normalized.includes(term));
  const valuePatterns = [
    /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/i, // CURP
    /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/i, // RFC
    /\bsk-ant-[A-Za-z0-9_-]{12,}\b/i,
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/i,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
    /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/i,
    /\bAIza[A-Za-z0-9_-]{20,}\b/,
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
    /\bhttps?:\/\/[^/\s:@]+:[^/\s@]+@/i,
    /\b(?:api[_ -]?key|secret|token|password|passwd|authorization)\s*[:=]\s*\S{8,}/i,
  ];
  return hasSensitiveTerm || valuePatterns.some((pattern) => pattern.test(text));
}

/**
 * Sólo las consultas claramente relacionadas con la operación escolar pueden
 * escalar al proveedor externo cuando el motor determinista no las reconoce.
 * Las guías, navegación y solicitudes de escritura se resuelven antes de llegar
 * a esta guarda en la ruta HTTP.
 */
export function isClaudeReadOnlyFallbackCandidate(message: string): boolean {
  if (containsSensitiveAssistantData(message)) return false;
  const normalized = normalize(message);
  const tokens = normalized.split(" ");
  const domainTerms = [
    "alumno", "alumnos", "estudiante", "estudiantes",
    "colegiatura", "colegiaturas", "adeudo", "adeudos", "deudor", "deudores", "saldo", "saldos",
    "cargo", "cargos", "cobranza", "pago", "pagos",
    "beca", "becas", "descuento", "descuentos",
    "familia", "familias", "tutor", "tutores",
    "nivel", "niveles", "grado", "grupos", "grupo",
    "vencido", "vencidos", "pendiente", "pendientes",
    "inscripcion", "inscripciones", "factura", "facturas",
  ];
  const queryTerms = [
    "que", "cual", "cuales", "quien", "quienes", "cuanto", "cuantos",
    "cuanta", "cuantas", "falta", "faltan", "deben", "adeudan", "pendiente",
    "pendientes", "vencido", "vencidos", "total",
  ];
  const navigationTerms = [
    "donde", "pagina", "pantalla", "modulo", "seccion", "navegar",
    "ir", "abrir", "acceder", "ver", "veo", "encuentro", "encuentran",
  ];
  return domainTerms.some((term) => tokens.includes(term))
    && queryTerms.some((term) => tokens.includes(term))
    && !navigationTerms.some((term) => tokens.includes(term));
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
  // Rutas agregadas al cerrar advertencia §9.1
  "/reportes-admisiones":          "Reportes de Admisiones",
  "/reporte-antiguedad-saldos":    "Antigüedad de Saldos",
  "/reporte-riesgo":               "Reporte de Riesgo de Cobranza",
  "/comandos-contador":            "Comandos del Contador",
  "/configuracion-inicial":        "Configuración Inicial",
  "/configuracion-pagos-completa": "Configuración de Pagos",
  "/portal-3clics":                "Portal de Padres",
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

  // ── Lista general de deudores ─────────────────────────────────────────────
  // Frases operativas cortas como "quién falta de pagar colegiaturas" y
  // "dame la lista de deudores" deben dar datos reales, no una sugerencia de
  // navegación. Se resuelven localmente para mantener la respuesta rápida y
  // determinista; las preguntas analíticas más amplias siguen siendo candidatas
  // del fallback read-only de Claude.
  const genericDebtList = (
    /\bdeudor(?:es)?\b/.test(n)
    || /\bquien(?:es)?\s+(?:falta[n]?|debe[n]?|adeuda[n]?)\b/.test(n)
  ) && !/\b(?:alumno|alumnos|estudiante|estudiantes)\b/.test(n);
  if (genericDebtList) {
    const now = new Date();
    let month = now.getMonth() + 1;
    let year = now.getFullYear();
    const monthNames = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    const namedMonth = monthNames.findIndex((name) => new RegExp(`\\b${name}\\b`).test(n));
    const namedYear = n.match(/\b(20\d{2})\b/);
    if (namedMonth >= 0) month = namedMonth + 1;
    if (namedYear) year = Number(namedYear[1]);
    if (/\b(?:ultimo|pasado|anterior)\s+mes\b/.test(n)) {
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
    return { actionId: "query:adeudos_nivel_periodo", params: { mes: month, anio: year, nivel: "" } };
  }

  // ── Discrepancia / inconsistencia de números ──────────────────────────────
  // "solo tengo 8 alumnos pero 78 becas", "no coincide", "por qué hay más becas"
  if (
    (n.includes("pero") || n.includes("y solo") || n.includes("sin embargo")) &&
    /\d/.test(n) &&
    (n.includes("becas") || n.includes("alumnos") || n.includes("pagos") || n.includes("cargos"))
  ) return { actionId: "query:discrepancia", params: {} };

  if (/(discrepancia|no coincide|diferencia entre|inconsistencia|por que (hay|tengo|aparecen?) (mas|menos|mas|solo))/.test(n))
    return { actionId: "query:discrepancia", params: {} };

  // ── Resumen ejecutivo financiero ──────────────────────────────────────────
  // El resumen agrega cobranza, cartera vencida y becas en una sola consulta.
  if (/(cuanto (se ha|hemos|lleva[ms]?) cobrado|resumen (?:del )?(?:estado )?financiero|resumen del mes|estado financiero|como vamos (?:este )?mes|total cobrado|cuanto llevamos|cuanto hay cobrado|cuanto tenemos cobrado)/.test(n)) {
    const now = new Date();
    const monthNames = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    const namedMonth = monthNames.findIndex((name) => new RegExp(`\\b${name}\\b`).test(n));
    const namedYear = n.match(/\b(20\d{2})\b/);
    const month = namedMonth >= 0 ? namedMonth + 1 : now.getMonth() + 1;
    const year = namedYear ? Number(namedYear[1]) : now.getFullYear();
    return { actionId: "query:resumen_ejecutivo_mes", params: { mes: month, anio: year } };
  }

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

// ── Guías locales ─────────────────────────────────────────────────────────────
// Catálogo cerrado y determinista. Este detector debe permanecer independiente
// de cualquier proveedor LLM: responder una guía jamás requiere una API externa.
export function detectGuideIntent(message: string): IntentResult | null {
  const n = normalize(message);
  const how = /\b(como|cómo|donde|dónde|pasos|instrucciones|configurar)\b/.test(n);
  if (!how) return null;

  if (/(importar|cargar|subir).*(excel|csv|archivo|alumnos|familias)|excel.*(alumnos|familias)/.test(n)) {
    return {
      reply: "Para importar datos masivos, sigue estos pasos:",
      guide: {
        id: "importar-excel",
        route: "/importacion-datos",
        label: "Importación de Datos",
        steps: [
          "Abre Importación de Datos.",
          "Descarga la plantilla correspondiente.",
          "Completa el Excel sin cambiar los encabezados.",
          "Súbelo y revisa la previsualización y los errores.",
          "Confirma la importación sólo cuando la previsualización sea correcta.",
        ],
      },
      navigate: { route: "/importacion-datos", label: "Importación de Datos" },
    };
  }

  if (/(alta|dar de alta|registrar|asignar).*(beca|descuento)|beca.*(25|porcentaje|alta)/.test(n)) {
    return {
      reply: "Para dar de alta una beca, hazlo manualmente desde Becas:",
      guide: {
        id: "alta-beca",
        route: "/becas",
        label: "Becas y Descuentos",
        steps: [
          "Abre Becas y Descuentos.",
          "Busca y selecciona al alumno.",
          "Captura el porcentaje y la vigencia.",
          "Revisa el resumen y guarda desde esa pantalla.",
        ],
      },
      navigate: { route: "/becas", label: "Becas y Descuentos" },
    };
  }

  if (/(colegiatura|cobro|cobrar|mensualidad).*(12 meses|anual|todo el ano|todo el año)|12 meses.*(cobro|colegiatura)/.test(n)) {
    return {
      reply: "Para configurar el cobro durante los 12 meses, hazlo manualmente en Configuración de Pagos:",
      guide: {
        id: "cobro-anual",
        route: "/configuracion-pagos-completa",
        label: "Configuración de Pagos",
        steps: [
          "Abre Configuración de Pagos.",
          "Selecciona la regla o concepto de colegiatura.",
          "Configura los 12 periodos de cobro del ciclo.",
          "Revisa fechas, vencimientos y recargos.",
          "Guarda la configuración desde la pantalla.",
        ],
      },
      navigate: { route: "/configuracion-pagos-completa", label: "Configuración de Pagos" },
    };
  }
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

  // Las guías locales tienen prioridad sobre cualquier acción o consulta.
  // Una orden como "cómo asigno una beca" sigue siendo sólo una guía.
  const guide = detectGuideIntent(message);
  if (guide) {
    const guideModule = KNOWLEDGE_BASE.find((module) => module.route === guide.guide?.route);
    if (guideModule?.roles.length && !guideModule.roles.includes(userRole)) {
      return {
        reply: "No tienes permiso para acceder a esa configuración. Pide a un administrador que realice el trámite desde el módulo correspondiente.",
      };
    }
    return guide;
  }

  // ── Detectar acción / consulta de datos PRIMERO ───────────────────────────
  const action = detectActionIntent(message);
  if (action) {
    return { reply: "Consultando los datos…", action };
  }

  // El motor local no tiene una consulta equivalente. Dejarlo como no resuelto
  // permite que la ruta use el fallback read-only, sin degradarlo a navegación.
  if (isClaudeReadOnlyFallbackCandidate(message)) {
    return {
      reply: "No entendí qué datos necesitas consultar.",
    };
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

  // ── Caso: ambigüedad — empate estricto en el puntaje máximo ─────────────────
  //
  // Se dispara SOLO cuando 2+ módulos comparten exactamente el puntaje máximo.
  // Un ganador único (aunque el segundo esté a 1 punto) navega directo, para
  // evitar falsos positivos en mensajes con intención clara como
  // "dónde registro un pago" (/pagos=4, segundo=3 → no hay empate → navega).
  //
  // Cuando SÍ hay empate, se amplía el pool con módulos a ≤1 punto del empate
  // para incluir alternativas cercanas (ej. /asignacion-precios=2 cuando el
  // empate es en 3).  Se muestran hasta 3 chips, excluyendo la página actual.

  if (best && best.score >= THRESHOLD) {
    const tiedWithBest = scored.filter((s) => s.score === best.score);

    if (tiedWithBest.length >= 2) {
      // Empate estricto: incluir empatados + módulos a ≤1 punto del empate
      const ambiguousCandidates = scored.filter(
        (s) => s.score >= THRESHOLD && s.score >= best.score - 1
      );

      // Excluir la página actual — el usuario ya está ahí
      const options = ambiguousCandidates
        .filter((s) => s.module.route !== currentPath)
        .slice(0, 3)
        .map((s) => ({ route: s.module.route, label: s.module.label }));

      if (options.length >= 2) {
        // 2-3 opciones reales → chips de desambiguación
        return {
          reply: "¿Buscabas alguna de estas pantallas?",
          suggestions: options,
        };
      }

      if (options.length === 1) {
        // Una sola opción real tras excluir currentPath → navegar directo
        const winner = ambiguousCandidates.find(
          (s) => s.module.route === options[0].route
        )!;
        return {
          reply: `**${winner.module.label}** — ${winner.module.description}`,
          navigate: { route: winner.module.route, label: winner.module.label },
        };
      }

      // options.length === 0: todos los empatados coinciden con currentPath
      // (imposible cuando tiedWithBest.length >= 2 salvo un caso degenerado)
      // → caer en "ya estás en X" a continuación
    }
  }

  // ── Caso: ya está en esa página (ganador claro, sin ambigüedad) ──────────────
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
    return {
      reply: `**${best.module.label}** — ${best.module.description}`,
      navigate: { route: best.module.route, label: best.module.label },
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

// ══════════════════════════════════════════════════════════════════════════════
// N4/N5 — Acciones con confirmación desde el asistente
// ══════════════════════════════════════════════════════════════════════════════

/** Señal que el asistente devuelve al frontend cuando reconoció una intención
 *  de escritura. El widget muestra el contexto al usuario y le pide confirmación
 *  ANTES de disparar cualquier llamada HTTP al endpoint real. */
export interface SuggestActionSignal {
  action: "pagar_manual" | "resolver_excepcion" | "asignar_beca" | "condonar_saldo";
  /** Endpoint completo con IDs embebidos, listo para el POST del widget */
  endpoint: string;
  /** Body parcial para el POST — se mergea con inputs_required antes de enviar */
  body: Record<string, any>;
  /** Etiqueta de la acción para mostrar al usuario */
  label: string;
  /** Campos que el frontend debe solicitar al usuario antes de habilitar Confirmar.
   *  Cada campo se mergea en el body final. undefined = body ya está completo. */
  inputs_required?: Array<{ key: string; label: string; minLength?: number }>;
  /** Contexto resuelto desde la DB — el usuario ve esto antes de confirmar */
  contexto: {
    alumno?: string;
    monto?: string;
    concepto?: string;
    cargo_id?: number;
    banco?: string;
    referencia?: string;
    tx_id?: number;
    // asignar_beca
    student_id?: number;
    porcentaje?: number;
    becas_vigentes?: number;
    vigencia_inicio?: string;
    vigencia_fin?: string;
    // condonar_saldo
    plan_id?: number;
    cuotas_pendientes?: number;
    tipo_origen?: string;
    monto_pendiente?: string;
  };
}

/** Resultado interno del detector de disparadores (puro, sin DB). */
export interface SuggestActionTrigger {
  action: "pagar_manual" | "resolver_excepcion" | "asignar_beca" | "condonar_saldo";
  /** Nombre del alumno extraído del mensaje */
  nombre?: string;
  /** Porcentaje de beca extraído del mensaje (para asignar_beca) */
  porcentaje?: number;
  /** Monto en centavos extraído del mensaje (para resolver_excepcion) */
  monto_centavos?: number;
  /** Referencia bancaria extraída del mensaje (para resolver_excepcion) */
  referencia?: string;
}

/** Forma A — solo regex/keywords, sin DB, sin IA externa.
 *  Mismo patrón que detectExportIntent y detectActionIntent.
 *
 *  Retorna `null` cuando:
 *  - No hay trigger de escritura supervisada en el mensaje.
 *  El caller (assistant.ts) llama a resolveSuggestContext() solo si no null. */
export function detectSuggestTrigger(message: string): SuggestActionTrigger | null {
  const n = normalize(message);

  // ── pagar_manual ──────────────────────────────────────────────────────────
  // Triggers: "marcar como pagado a X", "registrar pago manual de X",
  //           "pago manual de X", "ya pagó X", "cobré a X", "pagar cargo de X"
  const PAGO_RE =
    /(?:marcar?\s+(?:como\s+)?pagad[oa]|registrar?\s+pago\s+manual|pago\s+manual|ya\s+pag[oó]|cobr[eé]\s+(?:a\s+)?|pagar?\s+(?:el\s+)?cargo\s+de|marca\s+(?:como\s+)?pagad[oa])\s+(?:a\s+|de\s+|del?\s+alumno\s+)?(.{2,40})/i;
  // Detectar en normalizado (sin acentos) para trigger-matching,
  // pero extraer el nombre del mensaje ORIGINAL para preservar acentos en la
  // query ILIKE que hace la resolución en DB.
  if (PAGO_RE.test(n)) {
    const rawMatch = message.match(PAGO_RE);
    const nombre = (rawMatch?.[1] ?? "")
      .replace(/\s+con\b.*/i, "")
      .replace(/\s+por\b.*/i, "")
      .replace(/\s+en\b.*/i, "")
      .trim();
    if (nombre.length >= 2) return { action: "pagar_manual", nombre };
  }

  // ── resolver_excepcion ────────────────────────────────────────────────────
  // Triggers: "concilia la excepción/transacción", "aplica el SPEI/pago bancario",
  //           "aplica la transacción de $X", "resolver excepción"
  const RESOL_RE =
    /(?:concilia(?:r)?|aplica(?:r)?\s+(?:la\s+)?(?:transacci[oó]n|excepci[oó]n|(?:el\s+)?pago\s+(?:bancario|spei)|(?:el\s+)?spei)|resolver?\s+(?:la\s+)?excepci[oó]n)/;
  if (RESOL_RE.test(n)) {
    // Extraer monto del mensaje ORIGINAL (normalize() elimina $ y comas)
    // Acepta: "$3,500" | "$1200" | "3500 pesos" | "1,200 MXN"
    const montoMatch = message.match(/\$\s*([\d,]+(?:\.\d{1,2})?)|(?:^|\s)([\d,]{3,})\s*(?:pesos?|mxn)/i);
    const rawMonto = montoMatch?.[1] ?? montoMatch?.[2];
    const monto_centavos = rawMonto
      ? Math.round(parseFloat(rawMonto.replace(/,/g, "")) * 100)
      : undefined;
    // Extraer referencia bancaria del original también (alfanumérico ≥6 chars)
    const refMatch = message.match(/referencia\s+([A-Z0-9]{6,})/i);
    return { action: "resolver_excepcion", monto_centavos, referencia: refMatch?.[1] };
  }

  // ── asignar_beca ──────────────────────────────────────────────────────────
  // Triggers: "aplica una beca a X de 15%", "aplica beca de 20% a X",
  //           "asigna beca de 20% a X", "da beca para X 10%", "beca a X de 15%"
  // Detectar en normalizado; extraer nombre del mensaje ORIGINAL en dos pasadas:
  //   1. Nombre DESPUÉS del porcentaje: "de 20% a [NOMBRE]"
  //   2. Nombre ANTES del porcentaje:   "beca a/para [NOMBRE] de 20%"
  const BECA_DETECT_RE =
    /(?:aplica(?:r)?|asigna(?:r)?|da(?:r)?)\s+(?:una\s+)?beca|beca\s+(?:de\s+\d+\s*%\s+)?(?:a|para)\b/i;
  if (BECA_DETECT_RE.test(n)) {
    // Pasada 1: nombre tras porcentaje — "de X% a [NOMBRE]" / "de X% para [NOMBRE]"
    const postPctMatch = message.match(
      /\bde\s+(\d{1,3})\s*%\s+(?:a\s+|para\s+)(.{2,40})/i
    );
    // Pasada 2: nombre antes del porcentaje — "beca a/para [NOMBRE]"
    const prePctMatch = message.match(
      /(?:aplica(?:r)?\s+(?:una\s+)?beca|asigna(?:r)?\s+(?:una\s+)?beca|da(?:r)?\s+(?:una\s+)?beca|beca)\s+(?:a\s+|para\s+)(.{2,40})/i
    );

    let nombre = "";
    let porcentaje: number | undefined;

    if (postPctMatch) {
      porcentaje = parseFloat(postPctMatch[1]);
      nombre = (postPctMatch[2] ?? "")
        .replace(/\s+con\b.*/i, "")
        .replace(/\s+por\b.*/i, "")
        .trim();
    } else if (prePctMatch) {
      nombre = (prePctMatch[1] ?? "")
        .replace(/\s+de\s+\d+\s*%\b.*/i, "")
        .replace(/\s+con\b.*/i, "")
        .replace(/\s+\d+\s*%\s*$/i, "")
        .trim();
    }

    // Porcentaje desde el mensaje original si aún no se capturó
    if (!porcentaje) {
      const pctMatch = message.match(/\b(\d{1,3})\s*%/);
      porcentaje = pctMatch ? parseFloat(pctMatch[1]) : undefined;
    }

    if (nombre.length >= 2) {
      return { action: "asignar_beca", nombre, porcentaje };
    }
  }

  // ── condonar_saldo ────────────────────────────────────────────────────────
  // Triggers: "condona el saldo de X", "perdona el plan de X",
  //           "cancela y condona la deuda de X", "exonera el adeudo de X"
  const COND_RE =
    /(?:cond[oó]na(?:r)?|perdona(?:r)?|exonera(?:r)?|cancela(?:r)?\s+y\s+cond[oó]na(?:r)?)\s+(?:el\s+)?(?:saldo|plan|deuda|adeudo)?\s*(?:de(?:l?\s+alumno)?\s+)?(.{2,40})/i;
  if (COND_RE.test(n)) {
    const rawMatch = message.match(COND_RE);
    const nombre = (rawMatch?.[1] ?? "")
      .replace(/\s+con\b.*/i, "")
      .replace(/\s+por\b.*/i, "")
      .trim();
    if (nombre.length >= 2) return { action: "condonar_saldo", nombre };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// N3 — Exportación desde el asistente
// ══════════════════════════════════════════════════════════════════════════════

interface ExportReportDef {
  endpoint: string;
  /** Palabras clave para identificar el reporte en el mensaje del usuario */
  keywords: string[];
  /** Etiqueta legible para mostrar al usuario */
  label: string;
  /** Slug usado en el nombre de archivo sugerido */
  slug: string;
}

/** Catálogo de los 8 reportes exportables. El orden importa en caso de empate:
 *  los reportes más específicos deben ir antes que los más genéricos. */
const EXPORT_REPORTS: ExportReportDef[] = [
  {
    endpoint: "/api/reportes/financiero/exportar",
    keywords: [
      "financiero", "ingresos", "egresos", "flujo de efectivo",
      "estado de resultados", "cierre mensual", "recaudacion",
    ],
    label: "Reporte Financiero",
    slug: "financiero",
  },
  {
    endpoint: "/api/reportes/estudiantes/exportar",
    keywords: [
      "estudiantes", "padron", "padron de alumnos", "matricula",
      "alumnos inscritos",
    ],
    label: "Reporte de Estudiantes",
    slug: "estudiantes",
  },
  {
    endpoint: "/api/reportes/admisiones/exportar",
    keywords: [
      "admisiones", "captacion", "prospectos", "nuevos alumnos",
      "funnel admisiones",
    ],
    label: "Reporte de Admisiones",
    slug: "admisiones",
  },
  {
    endpoint: "/api/reportes/cobranza/exportar",
    keywords: [
      "cobranza", "cargos vencidos", "adeudos", "morosidad",
      "cuentas por cobrar", "alumnos morosos",
    ],
    label: "Reporte de Cobranza",
    slug: "cobranza",
  },
  {
    endpoint: "/api/reportes/consejo/exportar",
    keywords: [
      "consejo", "consejo directivo", "consejo escolar",
      "informe directivo", "reporte del consejo",
    ],
    label: "Reporte para el Consejo",
    slug: "consejo",
  },
  {
    endpoint: "/api/reportes/contable/exportar",
    keywords: [
      "contable", "integracion contable", "auxiliar contable",
      "reportes contables", "contabilidad",
    ],
    label: "Reporte Contable",
    slug: "contable",
  },
  {
    endpoint: "/api/reportes/antiguedad-saldos/exportar",
    keywords: [
      "antiguedad", "antiguedad de saldos", "cartera vencida",
      "tramos", "dias vencido", "saldos vencidos",
    ],
    label: "Antigüedad de Saldos",
    slug: "antiguedad-saldos",
  },
  {
    endpoint: "/api/reportes/riesgo/exportar",
    keywords: [
      "riesgo", "scoring", "riesgo de cobranza",
      "alumnos en riesgo", "score de riesgo",
    ],
    label: "Reporte de Riesgo de Cobranza",
    slug: "riesgo",
  },
];

/** Señal de exportación que el asistente devuelve al frontend.
 *  El widget hace el fetch con JWT y dispara la descarga del blob. */
export interface ExportIntent {
  /** Endpoint al que el widget hará POST */
  endpoint: string;
  /** Formato resuelto (excel por defecto) */
  format: "excel" | "pdf";
  /** Body completo listo para enviar (incluye la clave formato/format y filtros) */
  body: Record<string, string>;
  /** Nombre de archivo sugerido para el anchor-download */
  suggestedFilename: string;
  /** Etiqueta legible del reporte */
  reportLabel: string;
}

/** Extrae la intención de exportación del mensaje del usuario.
 *
 *  Retorna `null` cuando:
 *  - No hay un trigger de exportación explícito (verbo o mención de formato).
 *  - Hay trigger pero ningún reporte alcanzó score > 0.
 *
 *  En ambos casos el caller cae al flujo normal de `matchIntent`.
 */
export function detectExportIntent(message: string): ExportIntent | null {
  const norm = normalize(message);

  // ── Trigger: verbo de exportación ────────────────────────────────────────
  const EXPORT_VERBS = ["exportar", "descargar", "bajar"];
  const hasVerb = EXPORT_VERBS.some((v) => norm.includes(v));

  // ── Trigger: mención explícita de formato ─────────────────────────────────
  const hasFmt = /\b(excel|xlsx|pdf)\b/.test(norm);

  // Sin ningún trigger → no es una intención de exportación
  if (!hasVerb && !hasFmt) return null;

  // ── Detectar formato (default: excel) ─────────────────────────────────────
  const format: "excel" | "pdf" = /\bpdf\b/.test(norm) ? "pdf" : "excel";

  // ── Puntuar reportes ──────────────────────────────────────────────────────
  // Keywords más largas (multi-palabra) suman más; empate → primer match gana.
  let bestReport: ExportReportDef | null = null;
  let bestScore = 0;

  for (const rep of EXPORT_REPORTS) {
    let score = 0;
    for (const kw of rep.keywords) {
      const kwNorm = normalize(kw);
      if (norm.includes(kwNorm)) {
        score += kwNorm.split(" ").length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestReport = rep;
    }
  }

  // Sin reporte reconocido → no confiar en el resultado
  if (!bestReport || bestScore === 0) return null;

  // ── Extraer filtros del mensaje ───────────────────────────────────────────
  const body: Record<string, string> = { formato: format };

  // Ciclo escolar: "2025-2026", "2024-2025", "2025–2026" (guión largo)
  const cicloMatch = norm.match(/\b(20\d{2}[- ]\d{2,4})\b/);
  if (cicloMatch) {
    body.ciclo = cicloMatch[1].replace(" ", "-");
  }

  // Nivel educativo
  const NIVELES: [string, string][] = [
    ["primaria", "Primaria"],
    ["secundaria", "Secundaria"],
    ["preparatoria", "Preparatoria"],
    ["bachillerato", "Bachillerato"],
    ["preescolar", "Preescolar"],
    ["kinder", "Kinder"],
  ];
  for (const [kw, label] of NIVELES) {
    if (norm.includes(kw)) { body.nivel = label; break; }
  }

  const ext = format === "pdf" ? "pdf" : "xlsx";
  return {
    endpoint: bestReport.endpoint,
    format,
    body,
    suggestedFilename: `${bestReport.slug}.${ext}`,
    reportLabel: bestReport.label,
  };
}
