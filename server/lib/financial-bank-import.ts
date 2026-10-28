import type { RequestHandler } from "express";
import { getParser } from "./bank-parsers/index";
import { centavos, FinancialInputError, isoFinancialDate } from "./financial-input";

/** Parseo y validación íntegra antes de authenticateToken y de cualquier SQL. */
export const financialBankImportPreflight: RequestHandler = async (req, res, next) => {
  if (!req.file) return res.status(400).json({ message: "Se requiere un archivo bancario (campo: pdf)" });
  try {
    const bank = req.body?.banco ?? req.query.banco ?? "BBVA";
    if (typeof bank !== "string") throw new FinancialInputError("Indica un banco válido.");
    let parser;
    try { parser = getParser(bank.trim()); }
    catch { return res.status(400).json({ message: `El banco ${bank.trim().slice(0, 40)} no está soportado.` }); }
    let result;
    try { result = await parser.parse(req.file.buffer); }
    catch { return res.status(422).json({ message: "No se pudo interpretar el archivo bancario." }); }
    for (const row of result.transactions) {
      isoFinancialDate(row.fecha);
      centavos(row.monto_centavos);
    }
    (req as any).financialBankImport = { parser, result };
    next();
  } catch (error) {
    if (!(error instanceof FinancialInputError)) return next(error);
    res.status(400).json({ message: error.message });
  }
};
