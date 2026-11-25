 # Personal del Dashboard como candidato a usuario de EduPay

Estado (20-nov-2026): lado EduPay construido (migraciones 0010 y 0011, sincronización, API y pantalla). El Dashboard ya envía `personal` (función `puenteEduPayLectura`, revisión 00002).

## Reglas acordadas (Karla)
- Solo un **superadministrador** asigna acceso, rol, campus y permisos. Un administrador de escuela no puede.
- La sincronización **solo propone candidatos**. No crea usuarios, vínculos ni da acceso.
- El rol del Dashboard es **solo referencia**; el rol real lo elige el superadmin en EduPay.
- El Dashboard envía únicamente los roles **Director** y **Administrativo** (el filtro está del lado del Dashboard; EduPay no filtra por rol). **«Director General» no es un rol**: es el `departamento` de una persona con rol Director. El superadmin decide a quién habilitar.
- **Departamentos excluidos (25-nov-2026):** con rol Administrativo, Recepción, Limpieza, Responsable Limpieza, Vigilancia, Director de Área, Mantenimiento y Sistemas no se proponen (un **Director** con departamento Director de Área tampoco; Director General y los demás Directores sí) como candidatos (`server/lib/staff-exclusions.ts`, sin distinguir acentos ni mayúsculas). La sincronización no los crea ni actualiza (`skipped.personal_departamento_excluido`), el listado los oculta salvo que ya tengan usuario vinculado y la asignación los rechaza. Una baja de uno con usuario vinculado sí lo desactiva. Los candidatos ya guardados no se borran: solo se ocultan.
- Nada se vincula por correo: el vínculo es por `uid` de Firebase. Un `uid` es una sola persona (si ya es tutor, se omite).
- "Pantalla o funciones específicas" = `custom_permissions` sobre el rol base.

## Qué debe enviar `puenteEduPayLectura` (repo Dashboard-Refereence)
Un arreglo nuevo `personal` en la respuesta, junto a `alumnos`, `tutores` y `vinculos`. Es **opcional**: mientras el Dashboard no lo envíe, la sincronización funciona igual.

```json
{
  "personal": [
    {
      "uid": "uid de Firebase Auth",
      "estado": "activo",
      "rol": "Director",
      "departamento": "Director General",
      "idEscuela": "id de la escuela en Firebase",
      "nombre": "Ana",
      "primerApellido": "Gómez",
      "segundoApellido": null,
      "email": "ana@institutojfr.edu.mx",
      "registroSep": [{ "clave": "CCT 22PPR0186I", "nivel": "primaria" }]
    }
  ]
}
```

- `estado`: `"activo"` o `"baja"`. Quien esté de baja se muestra pero no se puede habilitar.
- `registroSep`: la clave se normaliza en EduPay (prefijo `CCT`, espacios, O/0). Solo sirve para sugerir campus por `nivel`.
- `departamento` (opcional, texto o `null`): se guarda en `firebase_staff_candidates.departamento` (migración 0011) y se muestra en la pantalla del superadmin. Es solo referencia, como el rol.
- El Director General recibe en `registroSep` todos los niveles de la escuela. El personal sin `nivelEscolar` y los Directores sin `departamento` no se envían (el Dashboard los cuenta en su reporte).
- No se envían contraseñas, teléfonos ni niveles aparte de `registroSep`.
- Mismo control de acceso que el resto del puente: solo la cuenta de servicio de EduPay.

## Flujo en EduPay
1. `sync:firebase-bridge` guarda a cada persona en `firebase_staff_candidates` (dry-run primero; `--apply` exige autorización).
2. Usuarios → "Personal del Dashboard" (solo superadmin): se elige rol, campus y permisos adicionales.
3. EduPay crea el usuario (contraseña aleatoria que nadie conoce) y el vínculo SSO en una transacción, con auditoría.
4. La persona entra por el botón del Dashboard. Su rol viaja en el token: un cambio de rol aplica al vencer la sesión.
5. "Quitar acceso" desvincula el `uid`, desactiva al usuario y cierra sus sesiones. No lo borra.

## Bajas del personal (24-nov-2026; lado EduPay construido, apagado hasta que el Dashboard envíe `estado: "baja"`)
- Si el Dashboard declara **explícitamente** a una persona del personal con `estado: "baja"` (movida a `bajas` o con la cuenta deshabilitada), la sincronización desactiva al usuario de EduPay vinculado a su `uid` (`is_active = false`): se cortan sus peticiones, su inicio de sesión (contraseña o SSO) y sus conexiones en vivo. El vínculo se conserva; reactivar lo decide un superadmin desde Usuarios.
- Nunca por ausencia en la lista (el Dashboard omite al personal activo con datos incompletos) y **nunca a un superadmin de la plataforma** (se reporta en `warnings.superadminEnBajaEnDashboard`).
- Límites por corrida: si pasarían a baja más de max(5, 10 %) de los alumnos o se desactivarían más de max(2, 20 %) de los usuarios vinculados, la corrida se **aborta sin escribir** (`[sync:abortado]`, código de salida 1) y solo una persona la aplica con `--allow-mass-changes`. Si hay otra corrida en curso, ésta se omite (`[sync:omitida]`).
- Cada desactivación queda en la auditoría (`user.deactivated_by_dashboard`).
- Una baja de alguien sin candidato local **no crea candidato** (la colección `bajas` del Dashboard es histórica): se cuenta en `skipped.personal_baja_sin_registro_local`. Una baja con candidato existente lo actualiza a `baja`.
- Decisión (25-nov-2026): la baja **desactiva sin borrar**; reactivar es **manual por un superadmin** (reactivar en el Dashboard no reactiva en EduPay). Un borrado definitivo en el Dashboard solo llega como baja si el Dashboard deja un registro mínimo (uid, escuela, `estado: "baja"`); la ausencia nunca desactiva.
- Programación prevista: Cloud Scheduler más el Job cada 3 minutos, primero solo en simulacro y después con `--apply` cuando la revisión salga limpia.

## Pendientes
- La migración 0010 ya está aplicada en Cloud SQL. La 0011 (`departamento`) se aplica con respaldo previo y autorización de Karla, **antes** de desplegar la imagen que la usa.
- `drizzle/schema-catalog.json` ya incluye la 0011 (verificado con `verify-schema-exact` en PG16 y PG18).
- Si se quita el acceso y luego se quiere restituir a la misma persona, el correo ya existe en `users` y la asignación se rechaza (no se vincula por correo): reactivar desde Usuarios.
- Un superadmin sin campus propio no puede crear usuarios por `POST /api/users`; esta ruta nueva no lo necesita.
