import type { RequestHandler } from "express";
import * as XLSX from "xlsx";
import { centavos, FinancialInputError, isoFinancialDate, orderedDates, percentage, positiveId } from "./financial-input";

/** Preflight completo y sin SQL: nunca persiste las primeras filas de un archivo inválido. */
export function parseFinancialImport(
  file: { buffer: Buffer; mimetype: string; originalname: string }, category: string,
): Record<string, any>[] {
  const isText = /csv|tab-separated/.test(file.mimetype) || /\.(csv|tsv)$/i.test(file.originalname);
  const text = isText ? file.buffer.toString().split("\n").filter(line => line.trim() && !line.trim().startsWith("#")).join("\n") : "";
  const separator = text.includes("\t") ? "\t" : text.includes(";") ? ";" : ",";
  // raw impide que SheetJS normalice silenciosamente "2026-02-30".
  const workbook = isText
    ? XLSX.read(text, { type: "string", FS: separator, raw: true })
    : XLSX.read(file.buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[workbook.SheetNames[0]]);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    try {
      if (category === "adeudos") {
        centavos(row.monto_centavos);
        for (const key of ["fecha_emision", "fecha_vencimiento"]) {
          if (typeof row[key] === "number") {
            const parsed = XLSX.SSF.parse_date_code(row[key]);
            row[key] = parsed && `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
          }
        }
        isoFinancialDate(row.fecha_vencimiento);
        // Mantiene el default histórico: emisión = vencimiento si no se proporcionó.
        if (row.fecha_emision !== undefined) orderedDates(row.fecha_emision, row.fecha_vencimiento);
        if (row.concept_id !== undefined) positiveId(row.concept_id);
      }
      if (category === "becas") {
        percentage(row.valor_descuento);
        for (const key of ["vigencia_inicio", "vigencia_fin"]) {
          if (row[key] !== undefined && row[key] !== "") isoFinancialDate(row[key]);
        }
        if (row.vigencia_inicio && row.vigencia_fin) orderedDates(row.vigencia_inicio, row.vigencia_fin);
      }
      if (row.porcentaje_responsabilidad !== undefined) percentage(row.porcentaje_responsabilidad);
    } catch (error) {
      if (error instanceof FinancialInputError) throw new FinancialInputError(`Fila ${index + 2}: ${error.message}`);
      throw error;
    }
  }
  return rows;
}

/** Se registra después de multer y ANTES de autenticar (que puede consultar usuarios). */
export const financialImportPreflight: RequestHandler = (req, res, next) => {
  if (!["adeudos", "becas", "familias"].includes(String(req.params.category))) return next();
  if (!req.file) return res.status(400).json({ message: "No se encontró archivo para importar" });
  try {
    // Sólo valida: el handler conserva su parser y sus conversiones históricas
    // para los campos no financieros (por ejemplo, referencias de alumnos).
    parseFinancialImport(req.file, String(req.params.category));
    next();
  } catch (error) {
    res.status(400).json({ message: error instanceof FinancialInputError ? error.message : "No se pudo leer el archivo. Revisa su formato." });
  }
};
