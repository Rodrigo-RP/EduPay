/**
 * assistant-knowledge.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Base de conocimiento interna del asistente EduPay.
 * Motor de intención 100% local — sin llamadas externas.
 *
 * DISEÑO PARA FUTURA INTEGRACIÓN LLM:
 * Cuando el sistema esté estable, reemplaza el cuerpo de `matchIntent()`
 * por una llamada a OpenAI/Claude. La firma del endpoint NO cambia.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface KnowledgeModule {
  route: string;
  label: string;
  description: string;
  keywords: string[];
  roles: string[]; // qué roles tienen acceso (vacío = todos)
}

export interface IntentResult {
  reply: string;
  navigate?: { route: string; label: string };
  suggestions?: Array<{ route: string; label: string }>;
  /** Presente cuando el usuario reporta un problema → el widget lanza diagnóstico */
  diagnose?: { moduleId: string; label: string };
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
    description: "Alta y gestión de conceptos de cobro: colegiaturas, cuotas, servicios.",
    keywords: [
      "catalogo", "catálogo", "producto", "productos", "concepto de cobro",
      "crear concepto", "nuevo concepto", "precio", "precios", "tarifa", "tarifas",
      "colegiatura mensual", "cuota de inscripcion", "servicio", "servicios",
      "tipo de cobro", "catalogo de cobros", "lista de precios"
    ],
    roles: ["super_admin","administrador_general","contador_general"],
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
];

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

/** Palabras clave que indican que el usuario reporta un fallo */
const FAULT_KEYWORDS = [
  "no funciona", "no carga", "no guarda", "no aparece", "no puedo",
  "no abre", "no muestra", "no genera", "no se genera", "no se guarda",
  "error", "falla", "fallo", "problema", "bug", "roto", "rota",
  "tira error", "sale error", "marca error", "revisar", "diagnosticar",
  "revisar si funciona", "checar", "verificar si",
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

      // Coincidencia exacta en keywords → más peso
      if (normalizedKeywords.some((kw) => kw === token)) score += 3;
      // Keyword contiene el token
      else if (normalizedKeywords.some((kw) => kw.includes(token))) score += 2;
      // Token contiene keyword
      else if (normalizedKeywords.some((kw) => token.includes(kw) && kw.length > 3)) score += 1;
      // Match en label
      if (normalizedLabel.includes(token)) score += 2;
      // Match en descripción
      if (normalizedDesc.includes(token)) score += 1;
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
      "No encontré una sección que coincida con tu búsqueda. Aquí están las secciones disponibles:",
    suggestions: topModules,
  };
}
