 # Personal del Dashboard como candidato a usuario de EduPay

Estado (20-nov-2026): lado EduPay construido (migraciones 0010 y 0011, sincronización, API y pantalla). El Dashboard ya envía `personal` (función `puenteEduPayLectura`, revisión 00002).

## Reglas acordadas (Karla)
- Solo un **superadministrador** asigna acceso, rol, campus y permisos. Un administrador de escuela no puede.
- La sincronización **solo propone candidatos**. No crea usuarios, vínculos ni da acceso.
- El rol del Dashboard es **solo referencia**; el rol real lo elige el superadmin en EduPay.
- El Dashboard envía únicamente los roles **Director** y **Administrativo** (el filtro está del lado del Dashboard; EduPay no filtra por rol). **«Director General» no es un rol**: es el `departamento` de una persona con rol Director. El superadmin decide a quién habilitar.
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

## Pendientes
- La migración 0010 ya está aplicada en Cloud SQL. La 0011 (`departamento`) se aplica con respaldo previo y autorización de Karla, **antes** de desplegar la imagen que la usa.
- `drizzle/schema-catalog.json` ya incluye la 0011 (verificado con `verify-schema-exact` en PG16 y PG18).
- Si se quita el acceso y luego se quiere restituir a la misma persona, el correo ya existe en `users` y la asignación se rechaza (no se vincula por correo): reactivar desde Usuarios.
- Un superadmin sin campus propio no puede crear usuarios por `POST /api/users`; esta ruta nueva no lo necesita.
