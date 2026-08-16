/**
 * shared/route-registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * §9.1 — Fuente única de verdad para rutas del panel administrativo de EduPay.
 *
 * REGLA: toda pantalla nueva debe tener una entrada aquí ANTES de ser desplegada.
 * El script `npm run check:routes` (§9.2) compara este archivo contra las rutas
 * reales de App.tsx y falla la build si encuentra alguna sin registrar.
 *
 * Este archivo es isomorfo: puede importarse tanto desde el servidor (Node.js)
 * como desde el cliente (Vite/React) sin dependencias específicas de plataforma.
 */

// ── Interfaz pública ──────────────────────────────────────────────────────────

export interface AppRoute {
  /** Path tal como aparece en <Route path="..."> en App.tsx */
  path: string;
  /** Nombre legible que ve el administrador */
  label: string;
  /** Palabras clave mínimas para el motor de intención del asistente */
  keywords: string[];
  /**
   * true → ruta técnica/utilitaria que no necesita cobertura del asistente
   * (alias de raíz, rutas de migración interna, etc.)
   */
  assistantExcluded?: boolean;
}

// ── Registro canónico ─────────────────────────────────────────────────────────

export const APP_ROUTES: AppRoute[] = [
  // ── Alias de raíz (excluidos del asistente, son redirecciones) ────────────
  { path: "/",                   label: "Inicio",                  keywords: [],                              assistantExcluded: true },
  { path: "/admin",              label: "Dashboard",               keywords: ["dashboard", "inicio", "resumen", "metricas", "panel"] },

  // ── Módulos principales ───────────────────────────────────────────────────
  { path: "/estudiantes",        label: "Estudiantes",             keywords: ["alumno", "alumnos", "estudiante", "inscribir", "expediente", "matricula"] },
  { path: "/familias",           label: "Familias",                keywords: ["familia", "familias", "padre", "tutor", "tutores", "apoderado"] },
  { path: "/cargos",             label: "Cargos",                  keywords: ["cargo", "cargos", "cobro", "cuota", "colegiatura", "adeudo"] },
  { path: "/pagos",              label: "Pagos",                   keywords: ["pago", "pagos", "registrar pago", "cobrar", "recibo", "comprobante"] },
  { path: "/cuentas-por-cobrar", label: "Cuentas por Cobrar",      keywords: ["cuentas por cobrar", "adeudo", "moroso", "morosidad", "cobranza", "vencido"] },
  { path: "/becas",              label: "Becas y Descuentos",       keywords: ["beca", "becas", "descuento", "descuentos", "apoyo", "subsidio"] },
  { path: "/aprobaciones",       label: "Aprobaciones",            keywords: ["aprobacion", "aprobar", "solicitud", "autorizar", "autorizacion"] },
  { path: "/planes-pago",        label: "Planes de Pago",          keywords: ["plan de pago", "meses", "parcialidades", "diferir", "convenio"] },

  // ── Catálogo y precios ────────────────────────────────────────────────────
  { path: "/catalogo-productos",  label: "Catálogo de Productos",  keywords: ["catalogo", "producto", "concepto de cobro", "precio", "tarifa"] },
  { path: "/asignacion-precios",  label: "Asignación de Precios",  keywords: ["asignacion de precios", "asignar precio", "tarifa por nivel", "monto"] },
  { path: "/emision-cargos",      label: "Emisión de Cargos",      keywords: ["emision de cargos", "emitir cargos", "cargos masivos", "generar cargos", "cargos del ciclo", "emision masiva"] },

  // ── Caja y finanzas ───────────────────────────────────────────────────────
  { path: "/caja-conciliacion",         label: "Caja y Conciliación",    keywords: ["caja", "conciliacion", "banco", "movimiento bancario", "cuadre", "corte"] },
  { path: "/excepciones-conciliacion",  label: "Excepciones Bancarias",  keywords: ["excepcion", "excepciones", "sin identificar", "bandeja de excepciones"] },
  { path: "/fiscal-contable",           label: "Fiscal y Contable",      keywords: ["factura", "cfdi", "facturacion", "fiscal", "timbrar", "sat", "xml"] },
  { path: "/reportes",                  label: "Reportes",               keywords: ["reporte", "reportes", "informe", "exportar", "excel", "pdf"] },
  { path: "/reportes-financieros",      label: "Reportes Financieros",   keywords: ["reporte financiero", "ingresos", "flujo de efectivo", "cierre mensual"] },
  { path: "/reporte-consejo",              label: "Reporte para el Consejo",   keywords: ["reporte consejo", "reporte directivo", "consejo escolar", "directivos", "informe consejo"] },
  { path: "/reporte-antiguedad-saldos",    label: "Antigüedad de Saldos",       keywords: ["antiguedad saldos", "cartera vencida", "dias vencido", "tramos cartera", "antigüedad de cartera", "vencidos", "morosidad por tramo"] },
  { path: "/semaforo-riesgo",           label: "Semáforo de Riesgo",     keywords: ["semaforo", "riesgo", "riesgo financiero", "indicador de riesgo", "cartera vencida"] },
  { path: "/calendario-financiero",     label: "Calendario Fiscal",      keywords: ["calendario", "fecha limite", "vencimiento", "plazo", "ciclo escolar"] },

  // ── Notificaciones y comunicados ──────────────────────────────────────────
  { path: "/notificaciones",     label: "Notificaciones",          keywords: ["notificacion", "aviso", "mensaje", "recordatorio", "correo", "whatsapp"] },

  // ── Dashboards por rol ────────────────────────────────────────────────────
  { path: "/dashboard-admisiones", label: "Dashboard de Admisiones", keywords: ["admisiones", "dashboard admisiones", "prospectos", "inscritos"] },
  { path: "/dashboard-caja",       label: "Dashboard de Caja",       keywords: ["dashboard caja", "resumen de caja", "ingresos del dia"] },

  // ── Operaciones y configuración ───────────────────────────────────────────
  { path: "/centro-comandos",    label: "Centro de Comandos",      keywords: ["centro de comandos", "comandos", "operaciones", "control", "centro operativo"] },
  { path: "/importacion-datos",  label: "Importación de Datos",    keywords: ["importar", "importacion", "carga masiva", "excel", "csv", "subir archivo"] },
  { path: "/configuracion",      label: "Configuración",           keywords: ["configuracion", "ajustes", "parametros", "datos institucionales", "ciclo escolar activo"] },
  { path: "/usuarios",           label: "Gestión de Usuarios",     keywords: ["usuario", "usuarios", "rol", "roles", "permisos", "acceso", "staff"] },
  { path: "/historial",          label: "Historial de Movimientos", keywords: ["historial", "auditoria", "movimientos", "registro", "bitacora", "trazabilidad"] },

  // ── Perfil personal ────────────────────────────────────────────────────────
  { path: "/perfil",             label: "Mi Perfil",               keywords: ["perfil", "mi perfil", "mi cuenta", "cambiar contrasena", "datos personales", "foto de perfil"] },

  // ── Reportes adicionales ──────────────────────────────────────────────────
  { path: "/reportes-admisiones",  label: "Reportes de Admisiones",  keywords: ["reportes admisiones", "reporte de inscritos", "reporte de prospectos", "captacion alumnos"] },
  { path: "/comandos-contador",    label: "Comandos del Contador",    keywords: ["comandos contador", "panel contador", "herramientas contables", "acciones contables"] },

  // ── Configuración avanzada ────────────────────────────────────────────────
  { path: "/configuracion-inicial",          label: "Configuración Inicial",         keywords: ["configuracion inicial", "setup inicial", "primer inicio", "configurar sistema por primera vez"] },
  { path: "/configuracion-pagos-completa",   label: "Configuración de Pagos",        keywords: ["configuracion de pagos", "metodos de pago", "pasarela de pago", "configurar pagos"] },

  // ── Portal de padres ──────────────────────────────────────────────────────
  { path: "/portal-3clics",    label: "Portal de Padres",           keywords: ["portal padres", "portal de pago", "liga de pago", "pago en linea padres"] },

  // ── Herramientas técnicas / rutas excluidas del asistente ─────────────────
  { path: "/migracion",               label: "Migración",                keywords: [], assistantExcluded: true },
  { path: "/migration-refeerence",    label: "Migration Reference",      keywords: [], assistantExcluded: true },
  { path: "/cuentas-standalone",      label: "Cuentas Standalone",       keywords: [], assistantExcluded: true },
  { path: "/demo-aprobaciones",       label: "Demo Aprobaciones",        keywords: [], assistantExcluded: true },
  { path: "/demo-setup",              label: "Demo Setup",               keywords: [], assistantExcluded: true },
  { path: "/profile",                 label: "Profile (alias)",           keywords: [], assistantExcluded: true },
  { path: "/pagar/:token",            label: "Pago con Liga",             keywords: [], assistantExcluded: true },
];

// ── Helpers de conveniencia ────────────────────────────────────────────────────

/** Rutas que el asistente puede mencionar (excluye aliases y utilidades técnicas) */
export const ASSISTANT_ROUTES = APP_ROUTES.filter((r) => !r.assistantExcluded);

/** Lookup rápido path → label */
export function getRouteLabelFromRegistry(path: string): string {
  return APP_ROUTES.find((r) => r.path === path)?.label ?? path;
}
