/**
 * server/lib/narrative-insights.ts — Panel narrativo del Consejo Directivo
 *
 * Genera insights de texto fijo a partir de datos calculados.
 * FORMA A obligatoria: reglas de umbral explícitas con plantillas fijas,
 * nunca texto redactado por un modelo de lenguaje.
 *
 * ─── Reglas implementadas ────────────────────────────────────────────────────
 *
 *  NI-01  Concentración de riesgo por nivel (>60 % / >75 % del adeudo total)
 *  NI-02  Antigüedad de cartera: mora estructural (>30 % / >50 % con >90 días)
 *  NI-03  Alumnos en semáforo rojo real (≥5 / ≥10) usando computeRiesgoScore()
 *         exportada de conciliacion.ts — misma fórmula que GET /api/reportes/riesgo.
 *         El conteo de NI-03 debe coincidir exactamente con resumen.rojo.count
 *         de RPT-08 para el mismo campus (invariante RSG-14-like).
 *  NI-04  Caída de tasa de cobranza (≥10 pp / ≥15 pp vs mes anterior)
 *  NI-05  Deudores críticos: familias con >60 días Y adeudo >$5 000 (≥3 / ≥5)
 *
 * ─── Fuentes de datos ────────────────────────────────────────────────────────
 *
 *  NI-01, NI-02, NI-03, NI-05  Query SQL propia sobre la DB (pool).
 *  NI-04  tasa_cobro_anterior calculada en fetchConsejoData y pasada como param.
 *
 * ─── Contrato de auditabilidad ───────────────────────────────────────────────
 *
 *  Cada NarrativeInsight lleva dato_numerico (el número exacto que disparó la
 *  regla) y dato_label (qué representa), de modo que cualquier frase puede
 *  verificarse contra la DB sin ambigüedad.
 */

import { pool } from "../db";
import { computeRiesgoScore } from "../routes/conciliacion";

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type Severidad = "info" | "atencion" | "critico";

export interface NarrativeInsight {
  /** Identificador de la regla — NI-01…NI-05. Usado en tests y audit trail. */
  regla:         string;
  /** Frase lista para mostrar al usuario (nunca generada por LLM). */
  texto:         string;
  severidad:     Severidad;
  /** El número exacto que disparó la regla (auditable contra la DB). */
  dato_numerico: number;
  /** Descripción de qué representa dato_numerico. */
  dato_label:    string;
}

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface Kpis {
  tasa_cobro: number;
  [key: string]: unknown;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function formatMXN(centavos: number): string {
  return new Intl.NumberFormat("es-MX", {
    style:                 "currency",
    currency:              "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(centavos / 100);
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Evalúa las 5 reglas narrativas y devuelve solo las que se disparan.
 * Si no se dispara ninguna → array vacío (el frontend muestra "Sin alertas").
 *
 * @param campusId            Campus del JWT, delimitador de tenant.
 * @param kpis                KPIs ya calculados en fetchConsejoData.
 * @param tasa_cobro_anterior Tasa del mes anterior calculada en fetchConsejoData
 *                            (null si no hay datos del mes anterior).
 */
export async function generateNarrativeInsights(
  campusId:            number,
  kpis:                Kpis,
  tasa_cobro_anterior: number | null,
): Promise<NarrativeInsight[]> {

  const insights: NarrativeInsight[] = [];

  // ── NI-01: Concentración de riesgo por nivel ─────────────────────────────
  //
  // Umbral: atencion ≥ 60 % | critico ≥ 75 %
  // Justificación: distribución natural entre niveles ≤ 55 %; superar el 60 %
  // indica riesgo sistémico concentrado en un segmento específico.
  // Fuente: query directa sobre charges pendientes (por_nivel de la respuesta
  // principal excluye charges sin pagos, por eso se re-consulta aquí).
  try {
    const r01 = await pool.query<{ nivel: string; adeudo_centavos: string }>(
      `SELECT COALESCE(s.nivel_escolar, 'Sin nivel')         AS nivel,
              COALESCE(SUM(c.monto_base_centavos), 0)        AS adeudo_centavos
       FROM   charges  c
       JOIN   students s ON s.id = c.student_id
       WHERE  s.campus_id = $1
         AND  c.estado    = 'pendiente'
       GROUP  BY s.nivel_escolar
       ORDER  BY adeudo_centavos DESC`,
      [campusId],
    );
    const rows01 = r01.rows.map(r => ({
      nivel:           r.nivel,
      adeudo_centavos: Number(r.adeudo_centavos || 0),
    }));
    const total01 = rows01.reduce((a, r) => a + r.adeudo_centavos, 0);
    if (total01 > 0 && rows01.length > 0) {
      const top01 = rows01[0];
      const pct01 = Math.round((top01.adeudo_centavos / total01) * 100);
      if (pct01 >= 60) {
        insights.push({
          regla:         "NI-01",
          texto:         `Nivel ${top01.nivel}: concentra el ${pct01}% del adeudo total (${formatMXN(top01.adeudo_centavos)}). Riesgo concentrado en un solo segmento — revisar si hay causas estructurales en ese nivel.`,
          severidad:     pct01 >= 75 ? "critico" : "atencion",
          dato_numerico: pct01,
          dato_label:    `% del adeudo total concentrado en ${top01.nivel}`,
        });
      }
    }
  } catch (e: any) {
    console.error("[narrative-insights NI-01]", e.message);
  }

  // ── NI-02: Antigüedad de cartera — mora estructural ──────────────────────
  //
  // Umbral: atencion ≥ 30 % | critico ≥ 50 % de la cartera con >90 días
  // Justificación: 90 días es el umbral donde la prob. de recuperación cae
  // por debajo del 50 % sin gestión activa. 30 % indica que un tercio de la
  // cartera está en zona de difícil recuperación.
  try {
    const r02 = await pool.query<{ mora_90d: string; total_cartera: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN CURRENT_DATE - c.fecha_vencimiento::date > 90
                           THEN c.monto_base_centavos ELSE 0 END), 0) AS mora_90d,
         COALESCE(SUM(c.monto_base_centavos), 0)                      AS total_cartera
       FROM   charges  c
       JOIN   students s ON s.id = c.student_id
       WHERE  s.campus_id = $1
         AND  c.estado    = 'pendiente'`,
      [campusId],
    );
    const mora90d      = Number(r02.rows[0]?.mora_90d      || 0);
    const totalCartera = Number(r02.rows[0]?.total_cartera || 0);
    if (totalCartera > 0) {
      const pct02 = Math.round((mora90d / totalCartera) * 100);
      if (pct02 >= 30) {
        insights.push({
          regla:         "NI-02",
          texto:         `El ${pct02}% de la cartera (${formatMXN(mora90d)}) lleva más de 90 días vencida. La probabilidad de recuperación disminuye significativamente pasado ese umbral.`,
          severidad:     pct02 >= 50 ? "critico" : "atencion",
          dato_numerico: pct02,
          dato_label:    "% de cartera con más de 90 días vencidos",
        });
      }
    }
  } catch (e: any) {
    console.error("[narrative-insights NI-02]", e.message);
  }

  // ── NI-03: Alumnos en semáforo rojo — computeRiesgoScore canónico ────────
  //
  // Umbral: atencion ≥ 5 | critico ≥ 10
  // Justificación: 5 casos críticos en una institución típica justifican
  // acción directiva concreta; 10 es señal de problema sistémico.
  //
  // IMPLEMENTACIÓN: usa la misma SQL que fetchRiesgoData en reportes-riesgo.ts
  // (sin filtros adicionales) y aplica computeRiesgoScore() row-by-row para
  // garantizar que el conteo de NI-03 coincide exactamente con el campo
  // resumen.rojo.count que devuelve GET /api/reportes/riesgo (invariante NIT-07).
  try {
    const r03 = await pool.query(
      `SELECT
         s.id                                                                     AS student_id,
         COALESCE(
           SUM(CASE WHEN c.estado = 'pendiente' THEN c.monto_base_centavos ELSE 0 END),
           0
         )                                                                        AS adeudo_centavos,
         COALESCE(
           MAX(GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date)::int)
           FILTER (WHERE c.estado = 'pendiente' AND c.fecha_vencimiento::date < CURRENT_DATE),
           0
         )                                                                        AS dias_vencido,
         COALESCE(
           ROUND(
             (COUNT(p.id)  FILTER (WHERE p.created_at  > NOW() - INTERVAL '6 months'))::numeric /
             NULLIF(
               COUNT(c2.id) FILTER (WHERE c2.created_at > NOW() - INTERVAL '6 months'),
               0
             ) * 100
           ),
           0
         )                                                                        AS tasa_pago_historica
       FROM   students s
       LEFT JOIN charges  c  ON c.student_id  = s.id
       LEFT JOIN payments p  ON p.charge_id IN (SELECT id FROM charges WHERE student_id = s.id)
       LEFT JOIN charges  c2 ON c2.student_id = s.id
       WHERE  s.campus_id = $1
       GROUP  BY s.id
       HAVING COUNT(c2.id) > 0
       ORDER  BY adeudo_centavos DESC
       LIMIT  500`,
      [campusId],
    );

    let countRojo = 0;
    let montoRojo = 0;
    for (const row of r03.rows) {
      const { semaforo } = computeRiesgoScore({
        diasVencido:    Number(row.dias_vencido        || 0),
        adeudoCentavos: Number(row.adeudo_centavos     || 0),
        tasaPago:       Number(row.tasa_pago_historica || 0),
      });
      if (semaforo === "rojo") {
        countRojo++;
        montoRojo += Number(row.adeudo_centavos || 0);
      }
    }

    if (countRojo >= 5) {
      insights.push({
        regla:         "NI-03",
        texto:         `${countRojo} alumnos en semáforo rojo con adeudo total de ${formatMXN(montoRojo)}. Requieren gestión directa de cobranza, no solo recordatorios.`,
        severidad:     countRojo >= 10 ? "critico" : "atencion",
        dato_numerico: countRojo,
        dato_label:    "alumnos en semáforo rojo (computeRiesgoScore canónico)",
      });
    }
  } catch (e: any) {
    console.error("[narrative-insights NI-03]", e.message);
  }

  // ── NI-04: Caída en tasa de cobranza mes a mes ───────────────────────────
  //
  // Umbral: atencion ≥ 10 pp | critico ≥ 15 pp de caída
  // Justificación: variación natural ≈ ±3-5 pp; 10 pp excede en >2× el ruido
  // esperado y señala un evento concreto (inicio de ciclo, problema técnico).
  // Fuente: tasa_cobro_anterior calculada en fetchConsejoData (no se requiere
  // query adicional aquí — se pasa como parámetro para evitar duplicación).
  if (tasa_cobro_anterior !== null) {
    const delta = tasa_cobro_anterior - kpis.tasa_cobro;
    if (delta >= 10) {
      insights.push({
        regla:         "NI-04",
        texto:         `La tasa de cobranza bajó de ${tasa_cobro_anterior}% a ${kpis.tasa_cobro}% (${delta} pp en un mes). Variación atípica — verificar si hay cargos no generados o problemas en el proceso de cobro.`,
        severidad:     delta >= 15 ? "critico" : "atencion",
        dato_numerico: delta,
        dato_label:    "pp de caída en tasa de cobranza vs mes anterior",
      });
    }
  }

  // ── NI-05: Deudores críticos — familias con >60 días y >$5 000 ──────────
  //
  // Umbral: atencion ≥ 3 | critico ≥ 5
  // Justificación: 60 días implica decisión activa de no pagar; $5 000 MXN
  // es el mínimo donde el impacto justifica gestión directiva. 3 familias
  // en simultáneo indica patrón (no casos aislados).
  // Fuente: query directa para no depender del top-10 de top_deudores.
  try {
    const r05 = await pool.query<{ count_criticos: string; monto_critico: string }>(
      `SELECT
         COUNT(*)                                   AS count_criticos,
         COALESCE(SUM(adeudo_centavos), 0)          AS monto_critico
       FROM (
         SELECT
           c.student_id,
           SUM(c.monto_base_centavos)                                              AS adeudo_centavos,
           MAX(GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date)::int)         AS dias_vencido
         FROM   charges  c
         JOIN   students s ON s.id = c.student_id
         WHERE  s.campus_id = $1
           AND  c.estado    = 'pendiente'
         GROUP  BY c.student_id
         HAVING SUM(c.monto_base_centavos) > 500000
            AND MAX(GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date)::int) > 60
       ) sub`,
      [campusId],
    );
    const countCriticos = Number(r05.rows[0]?.count_criticos || 0);
    const montoCritico  = Number(r05.rows[0]?.monto_critico  || 0);
    if (countCriticos >= 3) {
      insights.push({
        regla:         "NI-05",
        texto:         `${countCriticos} familias con adeudo mayor a $5,000 y más de 60 días vencido (total acumulado: ${formatMXN(montoCritico)}). Requieren acción de cobro formal inmediata.`,
        severidad:     countCriticos >= 5 ? "critico" : "atencion",
        dato_numerico: countCriticos,
        dato_label:    "familias con adeudo > $5,000 y > 60 días vencidos",
      });
    }
  } catch (e: any) {
    console.error("[narrative-insights NI-05]", e.message);
  }

  return insights;
}
