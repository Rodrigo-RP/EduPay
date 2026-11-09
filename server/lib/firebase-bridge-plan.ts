/**
 * Plan de sincronización Firebase → EduPay (puente `puenteEduPayLectura` del Dashboard).
 *
 * Lógica pura: recibe la proyección del puente y una foto del estado local, y devuelve qué crear, qué
 * actualizar y qué se omitió. No toca la base ni la red. Reglas (docs/SINCRONIZACION-DASHBOARD.md):
 *  - Clave de enlace: `uid` de Firebase, nunca correo ni CURP. Nada se vincula por correo.
 *  - Solo tutores con rol "Padre de familia" que declaran al alumno (lado del tutor); lo demás se omite.
 *  - Un alumno cuyo nivel no tiene campus en `firebase_campus_map` se omite, junto con sus vínculos.
 *  - Nunca borra nada ni toca dinero: bajas y vínculos que desaparecen solo se reportan.
 *  - No decide al responsable de pago: los vínculos nuevos nacen con el valor por defecto de la tabla y, si el
 *    alumno tiene varios tutores, se cuenta para que la escuela lo marque. Un vínculo existente no se modifica.
 *  - El saldo de Firebase no existe en la proyección y no se copia.
 */
import { PARENT_ROLE } from "./firebase-parent-match";

export interface BridgeStudent {
  uid: string;
  estado: "activo" | "baja";
  idEscuela: string | null;
  nivel: string | null;
  grado: string | null;
  grupo: string | null;
  turno: string | null;
  nombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
}

export interface BridgeTutor {
  uid: string;
  estado: "activo" | "baja";
  rol: string | null;
  idEscuela: string | null;
  nombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
  email: string | null;
  telefono: string | null;
  telefonoCasa: string | null;
}

export interface BridgeLink {
  tutorUid: string;
  alumnoUid: string;
  declaradoPorTutor: boolean;
  declaradoPorAlumno: boolean;
}

export interface BridgePayload {
  generadoEn: string;
  escuelas: string[];
  alumnos: BridgeStudent[];
  tutores: BridgeTutor[];
  vinculos: BridgeLink[];
}

export interface LocalStudent {
  studentId: number;
  campusId: number | null;
  nivel: string | null;
  grado: string | null;
  grupo: string | null;
  turno: string | null;
  status: string | null;
  familyId: number | null;
}

export interface LocalState {
  tenantId: number;
  /** `tenants.firebase_id_escuela`; sin él no se sincroniza nada. */
  firebaseIdEscuela: string | null;
  /** Nivel (minúsculas) → campus, de `firebase_campus_map`. */
  campusByNivel: ReadonlyMap<string, number>;
  /** uid → alumno ya enlazado (`firebase_students`). */
  studentByUid: ReadonlyMap<string, LocalStudent>;
  /** uid → tutor ya enlazado (`external_identities`, proveedor firebase). */
  guardianByUid: ReadonlyMap<string, { guardianId: number; email: string | null }>;
  /** Pares `studentId:guardianId` que ya existen en `student_guardian`. */
  existingLinks: ReadonlySet<string>;
  /** Alumnos locales sin enlace de Firebase, por nombre normalizado + campus (para no duplicar altas manuales). */
  unlinkedStudentKeys: ReadonlySet<string>;
  /** Correos (minúsculas) de tutores locales sin identidad de Firebase (para no duplicar altas manuales). */
  unlinkedGuardianEmails: ReadonlySet<string>;
}

export interface StudentCreate {
  uid: string;
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  nombre_completo: string;
  nivel_escolar: string;
  grado: string | null;
  grupo: string | null;
  turno: string | null;
  campus_id: number;
  status: "activo" | "baja";
  /** Familia existente a la que se une, o clave de una familia nueva del mismo plan. */
  family: { existingId: number } | { newKey: string };
}

export interface StudentUpdate {
  studentId: number;
  uid: string;
  fields: Partial<{ nivel_escolar: string; grado: string | null; grupo: string | null; turno: string | null; campus_id: number; status: string }>;
}

export interface GuardianCreate {
  uid: string;
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  nombre_completo: string;
  email: string;
  celular: string | null;
  telefono_casa_oficina: string | null;
  campus_id: number;
}

export interface NewFamily {
  key: string;
  nombre: string;
  campus_id: number;
  /** uid del tutor principal (el primero por uid). */
  principalGuardianUid: string | null;
}

export interface SyncReport {
  generadoEn: string;
  studentsToCreate: number;
  studentsToUpdate: number;
  studentsBaja: number;
  guardiansToCreate: number;
  linksToCreate: number;
  familiesToCreate: number;
  alumnosConVariosTutores: number;
  skipped: Record<SkipReason, number>;
  /** Cosas que alguien debe revisar; nunca se corrigen solas. */
  warnings: Record<WarningKey, number>;
}

export type SkipReason =
  | "escuela_no_habilitada"
  | "alumno_sin_escuela"
  | "alumno_sin_nombre"
  | "nivel_sin_campus"
  | "alumno_posible_duplicado"
  | "tutor_rol_no_permitido"
  | "tutor_sin_correo"
  | "tutor_posible_duplicado"
  | "tutor_sin_alumnos_validos"
  | "vinculo_no_declarado_por_tutor"
  | "vinculo_sin_alumno_o_tutor";

export type WarningKey =
  | "vinculosLocalesAusentesEnPuente"
  | "alumnosLocalesAusentesEnPuente"
  | "correoDeTutorCambio"
  | "alumnosNuevosEnBaja";

export interface SyncPlan {
  tenantId: number;
  studentCreates: StudentCreate[];
  studentUpdates: StudentUpdate[];
  guardianCreates: GuardianCreate[];
  families: NewFamily[];
  /** Alumno y tutor por uid; se resuelven a ids al aplicar. */
  links: Array<{ studentUid: string; guardianUid: string }>;
  report: SyncReport;
}

const clean = (v: string | null | undefined): string => (typeof v === "string" ? v.trim() : "");
const orNull = (v: string | null | undefined): string | null => clean(v) || null;
const norm = (v: string | null | undefined): string => clean(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

export const fullName = (n: { nombre?: string | null; primerApellido?: string | null; segundoApellido?: string | null }): string =>
  [n.nombre, n.primerApellido, n.segundoApellido].map(clean).filter(Boolean).join(" ");

/** Clave para detectar un alumno local equivalente: nombre completo normalizado + campus. */
export const studentKey = (nombreCompleto: string, campusId: number | null): string => `${norm(nombreCompleto)}|${campusId ?? ""}`;

const emptySkips = (): Record<SkipReason, number> => ({
  escuela_no_habilitada: 0, alumno_sin_escuela: 0, alumno_sin_nombre: 0, nivel_sin_campus: 0, alumno_posible_duplicado: 0,
  tutor_rol_no_permitido: 0, tutor_sin_correo: 0, tutor_posible_duplicado: 0, tutor_sin_alumnos_validos: 0,
  vinculo_no_declarado_por_tutor: 0, vinculo_sin_alumno_o_tutor: 0,
});

const emptyWarnings = (): Record<WarningKey, number> => ({
  vinculosLocalesAusentesEnPuente: 0, alumnosLocalesAusentesEnPuente: 0, correoDeTutorCambio: 0, alumnosNuevosEnBaja: 0,
});

export function planFirebaseSync(payload: BridgePayload, local: LocalState): SyncPlan {
  const skipped = emptySkips();
  const warnings = emptyWarnings();
  const empty = (): SyncPlan => ({
    tenantId: local.tenantId, studentCreates: [], studentUpdates: [], guardianCreates: [], families: [], links: [],
    report: {
      generadoEn: payload.generadoEn, studentsToCreate: 0, studentsToUpdate: 0, studentsBaja: 0, guardiansToCreate: 0,
      linksToCreate: 0, familiesToCreate: 0, alumnosConVariosTutores: 0, skipped, warnings,
    },
  });

  const school = clean(local.firebaseIdEscuela);
  if (!school || !payload.escuelas.includes(school)) {
    skipped.escuela_no_habilitada = payload.alumnos.length + payload.tutores.length;
    return empty();
  }

  // 1. Alumnos aceptables: de esta escuela y con campus para su nivel.
  const acceptedStudents = new Map<string, { s: BridgeStudent; campusId: number }>();
  for (const s of payload.alumnos) {
    if (!clean(s.idEscuela)) { skipped.alumno_sin_escuela++; continue; }
    if (clean(s.idEscuela) !== school) { skipped.escuela_no_habilitada++; continue; }
    const campusId = local.campusByNivel.get(norm(s.nivel));
    if (campusId === undefined) { skipped.nivel_sin_campus++; continue; }
    acceptedStudents.set(s.uid, { s, campusId });
  }

  // 2. Tutores aceptables: rol permitido, de esta escuela y con correo (guardians.email es obligatorio).
  const acceptedTutors = new Map<string, BridgeTutor>();
  for (const t of payload.tutores) {
    if (clean(t.rol) !== PARENT_ROLE) { skipped.tutor_rol_no_permitido++; continue; }
    if (clean(t.idEscuela) !== school) { skipped.escuela_no_habilitada++; continue; }
    const linked = local.guardianByUid.get(t.uid);
    const email = clean(t.email).toLowerCase();
    if (linked && email && clean(linked.email).toLowerCase() !== email) warnings.correoDeTutorCambio++;
    if (!linked && !email) { skipped.tutor_sin_correo++; continue; }
    if (!linked && local.unlinkedGuardianEmails.has(email)) { skipped.tutor_posible_duplicado++; continue; }
    acceptedTutors.set(t.uid, t);
  }

  // 3. Vínculos aceptables: el tutor declara al alumno y ambos extremos pasaron los filtros.
  const links: Array<{ studentUid: string; guardianUid: string }> = [];
  for (const l of payload.vinculos) {
    if (!l.declaradoPorTutor) { skipped.vinculo_no_declarado_por_tutor++; continue; }
    if (!acceptedStudents.has(l.alumnoUid) || !acceptedTutors.has(l.tutorUid)) { skipped.vinculo_sin_alumno_o_tutor++; continue; }
    links.push({ studentUid: l.alumnoUid, guardianUid: l.tutorUid });
  }
  links.sort((a, b) => (a.studentUid + a.guardianUid).localeCompare(b.studentUid + b.guardianUid));

  // Un tutor sin ningún alumno válido no entra: no debe ver nada.
  const tutorsWithKids = new Set(links.map((l) => l.guardianUid));
  for (const uid of Array.from(acceptedTutors.keys())) {
    if (!tutorsWithKids.has(uid)) { acceptedTutors.delete(uid); skipped.tutor_sin_alumnos_validos++; }
  }

  // 4. Alumnos: altas y cambios. Se crean solo los que algún tutor elegible declara; el resto no tiene quién lo pague.
  const studentsWithTutor = new Set(links.map((l) => l.studentUid));
  const studentCreates: StudentCreate[] = [];
  const studentUpdates: StudentUpdate[] = [];
  const pendingCreates: Array<{ uid: string; create: Omit<StudentCreate, "family"> }> = [];
  for (const [uid, { s, campusId }] of Array.from(acceptedStudents).sort(([a], [b]) => a.localeCompare(b))) {
    const existing = local.studentByUid.get(uid);
    if (existing) {
      const fields: StudentUpdate["fields"] = {};
      const nivel = clean(s.nivel).toLowerCase();
      if (nivel && nivel !== clean(existing.nivel).toLowerCase()) fields.nivel_escolar = nivel;
      if (orNull(s.grado) !== orNull(existing.grado)) fields.grado = orNull(s.grado);
      if (orNull(s.grupo) !== orNull(existing.grupo)) fields.grupo = orNull(s.grupo);
      if (orNull(s.turno) !== orNull(existing.turno)) fields.turno = orNull(s.turno);
      if (existing.campusId !== campusId) fields.campus_id = campusId;
      // Solo cruza activo ↔ baja; un estado local manual (suspendido, egresado) no se pisa.
      if (s.estado === "baja" && existing.status === "activo") fields.status = "baja";
      if (s.estado === "activo" && existing.status === "baja") fields.status = "activo";
      if (Object.keys(fields).length) studentUpdates.push({ studentId: existing.studentId, uid, fields });
      continue;
    }
    if (!studentsWithTutor.has(uid)) continue;
    const nombre = fullName(s);
    if (!clean(s.nombre) || !nombre) { skipped.alumno_sin_nombre++; continue; }
    if (local.unlinkedStudentKeys.has(studentKey(nombre, campusId))) { skipped.alumno_posible_duplicado++; continue; }
    if (s.estado === "baja") warnings.alumnosNuevosEnBaja++;
    pendingCreates.push({
      uid,
      create: {
        uid, nombres: clean(s.nombre), apellido_paterno: orNull(s.primerApellido), apellido_materno: orNull(s.segundoApellido),
        nombre_completo: nombre, nivel_escolar: clean(s.nivel).toLowerCase(), grado: orNull(s.grado), grupo: orNull(s.grupo),
        turno: orNull(s.turno), campus_id: campusId, status: s.estado,
      },
    });
  }

  // Los vínculos hacia alumnos que no se pudieron crear (duplicado, sin nombre) no pasan.
  const creatable = new Set(pendingCreates.map((p) => p.uid));
  const effectiveLinks = links.filter((l) => local.studentByUid.has(l.studentUid) || creatable.has(l.studentUid));

  // 5. Familias: alumnos que comparten tutor van juntos (componentes conexos). Si alguno ya tiene familia, se unen a ella.
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  for (const l of effectiveLinks) { for (const n of [`s:${l.studentUid}`, `g:${l.guardianUid}`]) if (!parent.has(n)) parent.set(n, n); union(`s:${l.studentUid}`, `g:${l.guardianUid}`); }

  const componentFamily = new Map<string, number>(); // raíz → familia existente (la de menor id)
  for (const l of effectiveLinks) {
    const fam = local.studentByUid.get(l.studentUid)?.familyId;
    if (fam == null) continue;
    const root = find(`s:${l.studentUid}`);
    const cur = componentFamily.get(root);
    if (cur === undefined || fam < cur) componentFamily.set(root, fam);
  }

  const families: NewFamily[] = [];
  const newFamilyByRoot = new Map<string, string>();
  for (const p of pendingCreates) {
    const root = find(`s:${p.uid}`);
    const existingId = componentFamily.get(root);
    if (existingId !== undefined) { studentCreates.push({ ...p.create, family: { existingId } }); continue; }
    let key = newFamilyByRoot.get(root);
    if (!key) {
      key = `f${families.length + 1}`;
      newFamilyByRoot.set(root, key);
      const principal = effectiveLinks.filter((l) => find(`s:${l.studentUid}`) === root).map((l) => l.guardianUid).sort()[0] ?? null;
      const tutor = principal ? acceptedTutors.get(principal) : undefined;
      families.push({
        key, nombre: `Familia ${clean(tutor?.primerApellido) || clean(p.create.apellido_paterno) || p.create.nombres}`,
        campus_id: p.create.campus_id, principalGuardianUid: principal,
      });
    }
    studentCreates.push({ ...p.create, family: { newKey: key } });
  }

  // 6. Tutores: altas, y cambio de correo como aviso (el correo identifica notificaciones; no se pisa en silencio).
  const guardianCreates: GuardianCreate[] = [];
  for (const [uid, t] of Array.from(acceptedTutors).sort(([a], [b]) => a.localeCompare(b))) {
    if (local.guardianByUid.has(uid)) continue;
    const firstLink = effectiveLinks.find((l) => l.guardianUid === uid);
    const campusId = firstLink ? acceptedStudents.get(firstLink.studentUid)!.campusId : null;
    if (campusId === null) continue;
    const nombre = fullName(t);
    guardianCreates.push({
      uid, nombres: clean(t.nombre) || nombre, apellido_paterno: orNull(t.primerApellido), apellido_materno: orNull(t.segundoApellido),
      nombre_completo: nombre || clean(t.email), email: clean(t.email).toLowerCase(), celular: orNull(t.telefono),
      telefono_casa_oficina: orNull(t.telefonoCasa), campus_id: campusId,
    });
  }

  // 7. Vínculos nuevos y avisos de lo que desapareció del puente (no se borra).
  const newLinks = effectiveLinks.filter((l) => {
    const st = local.studentByUid.get(l.studentUid);
    const g = local.guardianByUid.get(l.guardianUid);
    return !(st && g && local.existingLinks.has(`${st.studentId}:${g.guardianId}`));
  });
  const tutorsPerStudent = new Map<string, number>();
  for (const l of effectiveLinks) tutorsPerStudent.set(l.studentUid, (tutorsPerStudent.get(l.studentUid) ?? 0) + 1);

  const payloadStudentUids = new Set(payload.alumnos.map((a) => a.uid));
  for (const uid of Array.from(local.studentByUid.keys())) if (!payloadStudentUids.has(uid)) warnings.alumnosLocalesAusentesEnPuente++;
  const wanted = new Set(effectiveLinks.flatMap((l) => {
    const st = local.studentByUid.get(l.studentUid); const g = local.guardianByUid.get(l.guardianUid);
    return st && g ? [`${st.studentId}:${g.guardianId}`] : [];
  }));
  const linkedStudentIds = new Set(Array.from(local.studentByUid.values()).map((s) => s.studentId));
  const linkedGuardianIds = new Set(Array.from(local.guardianByUid.values()).map((g) => g.guardianId));
  for (const key of Array.from(local.existingLinks)) {
    const [sid, gid] = key.split(":").map(Number);
    if (linkedStudentIds.has(sid) && linkedGuardianIds.has(gid) && !wanted.has(key)) warnings.vinculosLocalesAusentesEnPuente++;
  }

  return {
    tenantId: local.tenantId, studentCreates, studentUpdates, guardianCreates, families, links: newLinks,
    report: {
      generadoEn: payload.generadoEn,
      studentsToCreate: studentCreates.length,
      studentsToUpdate: studentUpdates.length,
      studentsBaja: studentUpdates.filter((u) => u.fields.status === "baja").length + studentCreates.filter((c) => c.status === "baja").length,
      guardiansToCreate: guardianCreates.length,
      linksToCreate: newLinks.length,
      familiesToCreate: families.length,
      alumnosConVariosTutores: Array.from(tutorsPerStudent.values()).filter((n) => n > 1).length,
      skipped, warnings,
    },
  };
}
