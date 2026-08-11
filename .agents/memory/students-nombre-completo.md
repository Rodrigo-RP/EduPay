---
name: Students nombre_completo NOT NULL
description: nombre_completo is NOT NULL in the real DB but nullable in Drizzle schema; storage.createStudent must compute it before insert.
---

## Rule
`storage.createStudent` must always compute and inject `nombre_completo` before calling Drizzle insert. The real DB column is `NOT NULL` even though the TypeScript schema marks it as nullable with the comment "campo calculado para compatibilidad".

## Fix applied
```ts
async createStudent(student: InsertStudent): Promise<Student> {
  const nombre_completo = [student.nombres, student.apellido_paterno, student.apellido_materno]
    .filter(Boolean).join(" ") || student.nombres;
  const [newStudent] = await db.insert(students).values({ ...student, nombre_completo }).returning();
  return newStudent;
}
```

**Why:** The column was added via ALTER TABLE at some point (or the DB was initialized with a NOT NULL constraint not reflected in the Drizzle schema). Any raw SQL INSERT or Drizzle insert without this field will fail with `23502 NOT NULL violation`.

**How to apply:** Never INSERT into students without setting nombre_completo. All callers should go through `storage.createStudent`, which now handles this automatically. Test beforeAll that creates students should use the API (`POST /api/admin/students`) not raw SQL, so Drizzle's named-column handling applies.
