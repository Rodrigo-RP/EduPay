/**
 * Match de un tutor de Firebase con sus alumnos, para decidir si puede entrar a EduPay como padre.
 *
 * Lógica pura: no toca la base ni Firebase. Recibe registros ya leídos de `usuarios` y devuelve una
 * decisión explicable. Reglas (docs/HANDOFF-puente-dashboard-edupay.md §2, §5 y §6):
 *  - Solo el rol "Padre de familia" es elegible; "Padre/Madre", abuelos, tíos, etc. y cualquier rol de
 *    personal quedan fuera aunque tengan hijos vinculados.
 *  - El vínculo manda del lado del tutor (`idEstudiantes` + `estudiantes`); `idPadre` del alumno solo corrobora.
 *  - Solo cuentan los vínculos hacia usuarios que existen y son alumnos, de la misma escuela.
 *  - Un tutor sin `idEscuela` toma la de sus hijos; si son de varias, es ambiguo. Nunca se usa una escuela por defecto.
 *  - Un tutor sin hijos válidos no es elegible: no debe ver nada.
 */

export const PARENT_ROLE = "Padre de familia";
export const STUDENT_ROLE = "Estudiante/Alumno";

export interface FirebaseTutorRecord {
  uid: string;
  rol?: string | null;
  idEscuela?: string | null;
  idEstudiantes?: unknown;
  estudiantes?: unknown;
}

export interface FirebaseStudentRecord {
  rol?: string | null;
  idEscuela?: string | null;
  idPadre?: unknown;
}

export type MatchReason =
  | "rol_no_permitido"
  | "sin_hijos_vinculados"
  | "escuela_ambigua";

export type ParentMatch =
  | {
      eligible: true;
      idEscuela: string;
      studentUids: string[];
      /** Alumnos que además declaran a este tutor en `idPadre` (solo corrobora). */
      corroboratedUids: string[];
      dropped: DroppedLinks;
    }
  | { eligible: false; reason: MatchReason; dropped: DroppedLinks };

export interface DroppedLinks {
  /** El usuario referenciado no existe en `usuarios`. */
  missing: number;
  /** Existe, pero no es alumno. */
  notStudent: number;
  /** Alumno de otra escuela que el tutor. */
  otherSchool: number;
}

const emptyDropped = (): DroppedLinks => ({ missing: 0, notStudent: 0, otherSchool: 0 });

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(clean).filter(Boolean) : [];
}

/** Ids declarados por el tutor: `idEstudiantes` ∪ `estudiantes[].idEstudiante`, sin repetir. */
export function declaredStudentUids(tutor: FirebaseTutorRecord): string[] {
  const fromObjects = Array.isArray(tutor.estudiantes)
    ? tutor.estudiantes.map((e) => clean((e as { idEstudiante?: unknown } | null)?.idEstudiante)).filter(Boolean)
    : [];
  return Array.from(new Set([...asStringList(tutor.idEstudiantes), ...fromObjects]));
}

export function matchFirebaseParent(
  tutor: FirebaseTutorRecord,
  studentsByUid: ReadonlyMap<string, FirebaseStudentRecord>,
): ParentMatch {
  const dropped = emptyDropped();

  if (clean(tutor.rol) !== PARENT_ROLE) return { eligible: false, reason: "rol_no_permitido", dropped };

  const declared = declaredStudentUids(tutor);
  const real: Array<{ uid: string; rec: FirebaseStudentRecord }> = [];
  for (const uid of declared) {
    const rec = studentsByUid.get(uid);
    if (!rec) { dropped.missing++; continue; }
    if (clean(rec.rol) !== STUDENT_ROLE) { dropped.notStudent++; continue; }
    real.push({ uid, rec });
  }

  let idEscuela = clean(tutor.idEscuela);
  if (!idEscuela) {
    const schools = new Set(real.map((s) => clean(s.rec.idEscuela)).filter(Boolean));
    if (schools.size > 1) return { eligible: false, reason: "escuela_ambigua", dropped };
    idEscuela = schools.values().next().value ?? "";
  }

  const sameSchool = real.filter((s) => clean(s.rec.idEscuela) === idEscuela);
  dropped.otherSchool = real.length - sameSchool.length;

  if (!idEscuela || sameSchool.length === 0) return { eligible: false, reason: "sin_hijos_vinculados", dropped };

  return {
    eligible: true,
    idEscuela,
    studentUids: sameSchool.map((s) => s.uid),
    corroboratedUids: sameSchool.filter((s) => asStringList(s.rec.idPadre).includes(tutor.uid)).map((s) => s.uid),
    dropped,
  };
}
