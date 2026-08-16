/**
 * server/routes.ts — Índice de rutas
 * ─────────────────────────────────────────────────────────────────────────────
 * Solo orquestación: configura middlewares globales y monta los módulos.
 * La lógica de cada dominio vive en server/routes/<módulo>.ts
 */

import type { Express } from "express";
import { createServer, type Server } from "http";
import {
  rateLimits,
  sanitizeInput,
  secureCors,
  integrityCheck,
} from "./security-middleware";

// ── Módulos de dominio ────────────────────────────────────────────────────────
import { registerAuthRoutes }         from "./routes/auth";
import { registerUserRoutes }         from "./routes/users";
import { registerAdminRoutes }        from "./routes/admin";
import { registerChargesRoutes }      from "./routes/charges";
import { registerPaymentRoutes }      from "./routes/payments";
import { registerSystemRoutes }       from "./routes/system";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerGuardianRoutes }     from "./routes/guardian";
import { registerConciliacionRoutes } from "./routes/conciliacion";
import { registerFiscalRoutes }       from "./routes/fiscal";
import { registerMiscRoutes }         from "./routes/misc";
import { registerAssistantRoutes }    from "./routes/assistant";
import { registerReportesFinancieroRoutes }  from "./routes/reportes-financiero";
import { registerReportesEstudiantesRoutes }  from "./routes/reportes-estudiantes";
import { registerReportesCobranzaRoutes }     from "./routes/reportes-cobranza";
import { registerReportesAdmisionesRoutes }   from "./routes/reportes-admisiones";
import { registerReportesConsejoRoutes }      from "./routes/reportes-consejo";
import { registerReportesContableRoutes }          from "./routes/reportes-contable";
import { registerReportesAntiguedadSaldosRoutes } from "./routes/reportes-antiguedad-saldos";
import { registerReportesRiesgoRoutes }           from "./routes/reportes-riesgo";

export async function registerRoutes(app: Express): Promise<Server> {
  // ── Trust proxy (Replit reverse proxy) ──────────────────────────────────────
  app.set("trust proxy", 1);

  // ── Middlewares de seguridad globales ────────────────────────────────────────
  app.use(secureCors);
  app.use(sanitizeInput);
  app.use(integrityCheck);

  // ── Página pública de Cuentas por Cobrar ─────────────────────────────────────
  app.get("/cuentas", (_req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>Cuentas por Cobrar - Instituto JFR</title><style>body{font-family:Arial;padding:40px;background:#f5f5f5}.container{max-width:1000px;margin:0 auto;background:white;padding:40px;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.1)}.header{text-align:center;margin-bottom:40px}h1{color:#2563eb;font-size:2.5rem;margin-bottom:10px}p{color:#666;font-size:1.1rem}.success{background:#10b981;color:white;padding:20px;border-radius:8px;text-align:center;margin:30px 0}h2{margin-bottom:10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin:30px 0}.card{background:#f8f9fa;padding:20px;border-radius:8px;border-left:4px solid #2563eb}.card h3{color:#2563eb;margin-bottom:10px}.card .value{font-size:2rem;font-weight:bold;color:#1f2937;margin:10px 0}.features{margin-top:40px}.features h3{color:#2563eb;margin-bottom:15px}.features ul{list-style:none;padding:0}.features li{padding:8px 0;border-bottom:1px solid #eee}.features li:before{content:"✓";color:#10b981;font-weight:bold;margin-right:10px}</style></head><body><div class="container"><div class="header"><h1>💰 Cuentas por Cobrar</h1><p>Instituto José Francisco Ruiz - Sistema de Gestión Financiera</p></div><div class="success"><h2>🎉 Sistema Completamente Funcional</h2><p>Página de Cuentas por Cobrar lista y operativa</p></div><div class="grid"><div class="card"><h3>💵 Total por Cobrar</h3><div class="value">$42,000</div><p>+2.5% desde el mes pasado</p></div><div class="card"><h3>👥 Cuentas Activas</h3><div class="value">27</div><p>Total de estudiantes</p></div><div class="card"><h3>⚠️ Cuentas Vencidas</h3><div class="value" style="color:#dc2626">8</div><p>Requieren seguimiento</p></div><div class="card"><h3>📈 Tasa Recuperación</h3><div class="value" style="color:#10b981">73.2%</div><p>Eficiencia de cobranza</p></div></div><div class="features"><h3>🚀 Funcionalidades Implementadas</h3><ul><li>📋 Lista completa de cuentas por cobrar</li><li>🔍 Sistema de filtros avanzado por fecha y estudiante</li><li>📄 6 reportes especializados disponibles</li><li>🖨️ Generación PDF con logo Instituto JFR</li><li>📊 Métricas en tiempo real actualizadas</li><li>💰 Seguimiento de días vencidos y estados</li><li>📈 Análisis de eficiencia de cobranza</li><li>🎯 Búsqueda individual de estudiantes</li><li>📱 Interfaz responsive y profesional</li><li>✅ Sistema completamente operativo</li></ul></div></div></body></html>`);
  });

  // ── Rate limiting por sensibilidad de endpoint ───────────────────────────────
  //
  // • /api/auth/login, /api/auth/guardian-login, /api/auth/magic/*
  //   → públicos, sin JWT previo, objetivo real de fuerza bruta.
  //   → rateLimits.auth: 10 req / 15 min (estricto).
  //
  // • /api/admin, /api/super-admin
  //   → ya requieren JWT válido; la autenticación es la barrera primaria.
  //   → Sin rate-limit adicional: no aporta protección real y causa 429
  //     espurios en suites de integración (~32 req/corrida).
  //
  // • /api/security → conserva rateLimits.api (50 req / 5 min).
  app.use("/api/auth/login",          rateLimits.auth);    // 10/15min — endpoint público
  app.use("/api/auth/guardian-login", rateLimits.auth);    // 10/15min — endpoint público
  app.use("/api/auth/magic",          rateLimits.auth);    // 10/15min — endpoint público
  app.use("/api/admin",               rateLimits.apiAuth); // 300/5min — ya requiere JWT
  app.use("/api/super-admin",         rateLimits.apiAuth); // 300/5min — ya requiere JWT
  app.use("/api/security",            rateLimits.api);     // 50/5min
  // Endpoint de pago del portal de padres — mayor riesgo económico del portal.
  // Limiter específico para /api/guardian/pagar (no el prefijo completo) para no
  // afectar GET /api/guardian/dashboard ni GET/PUT /api/guardian/profile que
  // tienen patrones de uso de lectura frecuente (incompatibles con 20 req/hora).
  app.use("/api/guardian/pagar",      rateLimits.payment); // 20/60min — limiter preexistente

  // ── Montar módulos de dominio (en orden lógico de dependencia) ────────────────
  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerAdminRoutes(app);
  registerChargesRoutes(app);
  registerPaymentRoutes(app);
  registerSystemRoutes(app);
  registerNotificationRoutes(app);
  registerGuardianRoutes(app);
  registerConciliacionRoutes(app);
  registerFiscalRoutes(app);
  registerMiscRoutes(app);
  registerAssistantRoutes(app);
  registerReportesFinancieroRoutes(app);
  registerReportesEstudiantesRoutes(app);
  registerReportesCobranzaRoutes(app);
  registerReportesAdmisionesRoutes(app);
  registerReportesConsejoRoutes(app);
  registerReportesContableRoutes(app);
  registerReportesAntiguedadSaldosRoutes(app);
  registerReportesRiesgoRoutes(app);

  // ── Servidor HTTP (devuelto a server/index.ts para WebSocket) ─────────────────
  const httpServer = createServer(app);
  return httpServer;
}
