import { NIVEL_NAMES, type NivelAcademico } from "@shared/academic-levels";

type ConceptLike = { id: number; nombre?: string | null; tipo?: string | null; periodicidad?: string | null };

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Concepto de colegiatura que corresponde a un nivel (Q-38).
 *
 * Los conceptos no tienen columna de nivel: el nivel va en el nombre ("Colegiatura Mensual Primaria").
 * - Si algún concepto de colegiatura nombra un nivel, el alumno recibe el de su nivel; sin coincidencia devuelve `null`
 *   (el alumno se omite y se informa; nunca se le cobra el de otro nivel).
 * - Si ninguno nombra un nivel (escuela con una sola colegiatura), el primero aplica a todos, como antes.
 */
export function colegiaturaConceptForLevel<T extends ConceptLike>(
  concepts: T[],
  level: NivelAcademico | null,
): T | null {
  const colegiaturas = concepts.filter((c) => fold(String(c.nombre ?? "")).includes("colegiatura"));
  if (colegiaturas.length === 0) return null;
  const levelWords = (Object.keys(NIVEL_NAMES) as NivelAcademico[]).map((l) => fold(NIVEL_NAMES[l]));
  const namesALevel = (c: T) => levelWords.some((w) => fold(String(c.nombre ?? "")).includes(w));
  if (!colegiaturas.some(namesALevel)) return colegiaturas[0];
  if (!level) return null;
  const word = fold(NIVEL_NAMES[level]);
  return colegiaturas.find((c) => fold(String(c.nombre ?? "")).includes(word)) ?? null;
}
