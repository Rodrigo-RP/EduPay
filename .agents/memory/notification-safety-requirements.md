---
name: Requisitos de seguridad para notificaciones
description: Condiciones del usuario antes de habilitar o aplicar cambios de correo real.
---

El usuario exige que no haya éxito falso: un mensaje sólo puede marcarse enviado
tras aceptación del proveedor; aceptación no equivale a entrega. Persistir ID de
proveedor, error y fechas, y mostrar conteos reales de enviados, fallidos y
omitidos. Sin proveedor debe verse "no configurado", nunca éxito.

**Why:** El usuario necesita evitar afirmaciones de entrega sin correo real,
envíos duplicados y contacto accidental con familias de demostración.

**How to apply:** Claves sólo en Secrets; sin destinatario se omite sin inventar
direcciones. En desarrollo sólo destinatarios explícitamente autorizados.
Exigir idempotencia de servidor ante doble clic/reintento y permisos con
aislamiento tenant/campus. Conectar los interruptores a persistencia o retirarlos.
Antes de activar, probar con proveedor simulado y luego un envío controlado al
correo propio autorizado por el usuario. No asumir que las pruebas del seed
validaron el envío de notificaciones.

La app debe permanecer detenida durante esta revisión. Antes de recomendar
"Apply changes", revisar el post-merge y advertir cualquier migración/escritura
automática; una app detenida no bloquea por sí sola los hooks de aplicación.

Una revisión de la tarea en "Ready for review" debe basarse en su diff aislado,
no en la rama principal ni sólo en su descripción. Si no está disponible,
pedir el diff sin aplicar la tarea para obtenerlo.

**Why:** El usuario corrigió una revisión que respondió sobre el código principal
cuando había solicitado evaluar la implementación pendiente.

El historial de notificaciones previo no constituye evidencia de entrega:
no convertir estados antiguos “enviado” en aceptaciones o entregas verificadas.
Las fases de correo deben mantener separada esa evidencia hasta demostrarla.

**Why:** El flujo anterior declaraba éxito sin proveedor; importar su estado
como evidencia produciría métricas falsas aunque el envío nuevo fuera correcto.

**How to apply:** En futuras fases, exigir evidencia verificable del proveedor
para los nuevos estados; nunca utilizar el historial legado para inflar conteos.
Un timeout o una respuesta perdida necesita resolución explícita, no reenvío
ciego: la idempotencia de Resend sólo dura 24 horas.

Una tarea descartada no puede incorporarse indirectamente por la ascendencia
de una rama nueva. Usar la base autorizada por el usuario y transportar sólo
los cambios permitidos, sin fusionar la rama contaminada.

**Why:** Revisar únicamente los archivos del último commit no detectó que una
entrega heredaba una tarea descartada y sus scripts de configuración inseguros.

**How to apply:** Antes de publicar una rama de revisión, comprobar tanto los
commits como el diff completo respecto de la base autorizada; los archivos de
setup, activos y cambios ajenos también deben quedar fuera de ese diff.

Entrega, rebote y queja son hechos distintos que deben permanecer visibles,
aunque el estado efectivo priorice queja sobre rebote y entrega. Una queja no
demuestra que existió una entrega. La aceptación del proveedor debe conservarse.

**Why:** El usuario exige evidencia real del proveedor, no una transición que
borre incidencias o convierta retrospectivamente una aceptación en entrega.

**How to apply:** Contar destinatarios distintos por cada hecho autenticado,
no eventos ni estados legados. Correlacionar sólo con el ID de envío almacenado;
nunca atribuir tenant/campus por tags o direcciones del payload. Preparar una
fase no autoriza iniciar procesadores, registrar webhooks, migrar ni enviar.

Las supresiones, fallos y demoras son hechos separados: supresión se representa
como rebotado con motivo explícito, fallo como error, demora no cambia el estado.
La precedencia acordada es queja > rebotado > error > entregado > aceptado.
`email.sent` no es prueba de entrega ni un hecho procesable de esta fase.

**Why:** El usuario exige conservar incidencias y sus códigos, incluso cuando
una entrega tardía llega después de un fallo, rebote o queja.

**How to apply:** No crear estados de destinatario para supresión o demora.
Conservar tipos/subtipos/códigos normalizados y contar hechos distintos por
destinatario. Sin Secret de webhook no se persiste ni siquiera cuarentena.
El crudo no verificado tiene retención acordada de siete días, nunca logs.

Un workflow marcado como fallido no demuestra que la app o su worker estén
detenidos. Registrar la hora de observación y de señal antes de detenerlos;
si faltan datos, reportar un intervalo y no una hora reconstruida como exacta.

**Why:** Se encontraron procesos vivos pese al estado del workflow; los conteos
posteriores de filas no pueden probar por sí solos ausencia de conexiones,
modificaciones o DDL anteriores.

**How to apply:** En estas fases comprobar procesos del SO y puertos antes y
después de instalar. Mantener la app detenida sin cambiar workflows o `.replit`.
Separar iniciador técnico de persona responsable, y conteos de causalidad.
