---
name: Scholarship dashboard definition
description: Canonical scope for scholarship beneficiary and assignment counts.
---

“Alumnos beneficiados” significa alumnos distintos, activos, del campus actual y con una beca vigente en la fecha de consulta. “Asignaciones” es el número de registros de beca que cumplen la misma regla y puede ser mayor que los beneficiarios.

**Why:** El panel mostraba totales locales inventados mientras el asistente consultaba asignaciones reales de todo el tenant, lo que producía cifras contradictorias.

**How to apply:** Cualquier KPI, listado, reporte o respuesta del asistente sobre becas debe filtrar por campus, estado activo del alumno y vigencia de la beca. No presentar datos locales simulados como información administrativa.

Las becas suspendidas no forman parte de la definición de vigentes. El ahorro se presenta como acumulado en cargos emitidos, una sola vez por alumno; no se debe proyectar como mensual o anual sin un periodo explícito.

**Why:** No existe un vínculo que atribuya cada descuento emitido a un tipo de beca. Repartir ese dinero entre tipos inventaría una relación; sumarlo por asignación duplicaría el ahorro de alumnos con varias becas.

**How to apply:** Distinguir asignaciones de alumnos y advertir que los desgloses por tipo pueden compartir alumnos e importes, por lo que no son sumables entre sí. No cambiar el ledger para construir un indicador.

La lectura de beneficiarios no debe depender del permiso de administrar el catálogo de becas.

**Why:** Los lectores del campus pueden tener acceso a asignaciones sin autorización para asignar becas. Ampliar los permisos del catálogo para desbloquear el panel cambiaría el alcance de esos usuarios.

**How to apply:** Mantener el catálogo administrativo protegido y mostrar a los lectores sólo los tipos demostrables por sus asignaciones, con etiquetas que no pretendan contar todo el catálogo.

Los descuentos históricos de un período se obtienen de los cargos emitidos, sin exigir que la beca siga vigente hoy.

**Why:** La vigencia actual mide elegibilidad, no revoca descuentos ya emitidos. Usarla en importes históricos hace desaparecer dinero de los reportes cuando una beca vence o se suspende.

**How to apply:** Reservar el filtro de vigencia para beneficiarios actuales. Sumar los descuentos registrados en cargos del período solicitado, con campus y tenant, sin depender del estado presente de la asignación.