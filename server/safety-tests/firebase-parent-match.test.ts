import { describe, expect, it } from "vitest";
import {
  matchFirebaseParent,
  declaredStudentUids,
  PARENT_ROLE,
  STUDENT_ROLE,
  type FirebaseStudentRecord,
} from "../lib/firebase-parent-match";

// Datos sintéticos con la forma de `usuarios` en Firebase. Ningún dato real de menores.
const JFR = "escuela-jfr";
const OTRA = "escuela-otra";

const alumno = (idEscuela: string | undefined, idPadre: string[] = []): FirebaseStudentRecord =>
  ({ rol: STUDENT_ROLE, idEscuela, idPadre });

const alumnos = (entries: Record<string, FirebaseStudentRecord>) => new Map(Object.entries(entries));

describe("matchFirebaseParent", () => {
  it("padre de familia con hijos de su escuela: elegible, con sus alumnos", () => {
    const m = matchFirebaseParent(
      { uid: "p1", rol: PARENT_ROLE, idEscuela: JFR, idEstudiantes: ["a1", "a2"] },
      alumnos({ a1: alumno(JFR, ["p1"]), a2: alumno(JFR) }),
    );
    expect(m).toMatchObject({ eligible: true, idEscuela: JFR, studentUids: ["a1", "a2"], corroboratedUids: ["a1"] });
  });

  it.each(["Padre/Madre", "Abuelo(a)", "Tío(a)", "Hermano(a)", "Amigo(a)", "Primo(a)", "Maestro", "Director", "Administrativo", "", undefined])(
    "el rol %s no es elegible aunque tenga hijos vinculados",
    (rol) => {
      const m = matchFirebaseParent(
        { uid: "x", rol: rol as string | undefined, idEscuela: JFR, idEstudiantes: ["a1"] },
        alumnos({ a1: alumno(JFR, ["x"]) }),
      );
      expect(m).toMatchObject({ eligible: false, reason: "rol_no_permitido" });
    },
  );

  it("padre sin hijos vinculados: no es elegible", () => {
    const m = matchFirebaseParent({ uid: "p1", rol: PARENT_ROLE, idEscuela: JFR }, alumnos({}));
    expect(m).toMatchObject({ eligible: false, reason: "sin_hijos_vinculados" });
  });

  it("el vínculo solo del lado del alumno (idPadre) no basta", () => {
    const m = matchFirebaseParent(
      { uid: "p1", rol: PARENT_ROLE, idEscuela: JFR },
      alumnos({ a1: alumno(JFR, ["p1"]) }),
    );
    expect(m).toMatchObject({ eligible: false, reason: "sin_hijos_vinculados" });
  });

  it("vínculo solo del lado del tutor: elegible pero sin corroborar", () => {
    const m = matchFirebaseParent(
      { uid: "p1", rol: PARENT_ROLE, idEscuela: JFR, idEstudiantes: ["a1"] },
      alumnos({ a1: alumno(JFR, []) }),
    );
    expect(m).toMatchObject({ eligible: true, studentUids: ["a1"], corroboratedUids: [] });
  });

  it("descarta hijos inexistentes, que no son alumnos y de otra escuela, y los cuenta", () => {
    const m = matchFirebaseParent(
      { uid: "p1", rol: PARENT_ROLE, idEscuela: JFR, idEstudiantes: ["a1", "fantasma", "adulto", "foraneo"] },
      alumnos({
        a1: alumno(JFR),
        adulto: { rol: PARENT_ROLE, idEscuela: JFR },
        foraneo: alumno(OTRA),
      }),
    );
    expect(m).toMatchObject({ eligible: true, studentUids: ["a1"], dropped: { missing: 1, notStudent: 1, otherSchool: 1 } });
  });

  it("si todos los hijos son de otra escuela, no es elegible", () => {
    const m = matchFirebaseParent(
      { uid: "p1", rol: PARENT_ROLE, idEscuela: JFR, idEstudiantes: ["a1"] },
      alumnos({ a1: alumno(OTRA) }),
    );
    expect(m).toMatchObject({ eligible: false, reason: "sin_hijos_vinculados", dropped: { otherSchool: 1 } });
  });

  it("sin idEscuela toma la de sus hijos", () => {
    const m = matchFirebaseParent(
      { uid: "p1", rol: PARENT_ROLE, idEscuela: undefined, idEstudiantes: ["a1"] },
      alumnos({ a1: alumno(JFR) }),
    );
    expect(m).toMatchObject({ eligible: true, idEscuela: JFR });
  });

  it("sin idEscuela y con hijos de varias escuelas: ambiguo, no se elige una", () => {
    const m = matchFirebaseParent(
      { uid: "p1", rol: PARENT_ROLE, idEscuela: "  ", idEstudiantes: ["a1", "a2"] },
      alumnos({ a1: alumno(JFR), a2: alumno(OTRA) }),
    );
    expect(m).toMatchObject({ eligible: false, reason: "escuela_ambigua" });
  });

  it("sin idEscuela y sin hijos: nunca hereda una escuela por defecto", () => {
    const m = matchFirebaseParent({ uid: "p1", rol: PARENT_ROLE }, alumnos({}));
    expect(m.eligible).toBe(false);
    expect(m).not.toHaveProperty("idEscuela");
  });

  it("acepta el vínculo en `estudiantes[]` y no repite alumnos", () => {
    const t = {
      uid: "p1", rol: PARENT_ROLE, idEscuela: JFR,
      idEstudiantes: ["a1"],
      estudiantes: [{ idEstudiante: "a1", perfil: true }, { idEstudiante: "a2" }, null, { idEstudiante: 7 }],
    };
    expect(declaredStudentUids(t)).toEqual(["a1", "a2"]);
    const m = matchFirebaseParent(t, alumnos({ a1: alumno(JFR), a2: alumno(JFR) }));
    expect(m).toMatchObject({ eligible: true, studentUids: ["a1", "a2"] });
  });

  it("tolera campos con tipos inesperados sin lanzar", () => {
    const m = matchFirebaseParent(
      { uid: "p1", rol: PARENT_ROLE, idEscuela: JFR, idEstudiantes: "a1" as unknown, estudiantes: { x: 1 } as unknown },
      alumnos({ a1: alumno(JFR) }),
    );
    expect(m).toMatchObject({ eligible: false, reason: "sin_hijos_vinculados" });
  });

  it("un empleado con hijos vinculados no entra como padre", () => {
    const m = matchFirebaseParent(
      { uid: "e1", rol: "Maestro", idEscuela: JFR, idEstudiantes: ["a1"] },
      alumnos({ a1: alumno(JFR, ["e1"]) }),
    );
    expect(m).toMatchObject({ eligible: false, reason: "rol_no_permitido" });
  });
});
