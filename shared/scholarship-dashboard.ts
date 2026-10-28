/** Pure read model: a student may have several assignments, never several savings totals. */
export function scholarshipDashboard(assignments: any[]) {
  const vigente = assignments.filter(
    (a) => a.vigente === true && a.student_status === "activo" && a.estado === "activa",
  );
  const students = new Map<number, any>();
  for (const assignment of vigente) students.set(Number(assignment.student_id), assignment);
  return {
    vigente,
    beneficiaries: students.size,
    assignments: vigente.length,
    savingsCentavos: Array.from(students.values()).reduce(
      (sum, a) => sum + Number(a.monto_descuento_centavos || 0), 0,
    ),
    averagePercentage: vigente.length
      ? vigente.reduce((sum, a) => sum + Number(a.porcentaje_aplicado || 0), 0) / vigente.length
      : 0,
  };
}
