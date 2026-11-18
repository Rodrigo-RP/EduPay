 # Personal del Dashboard como candidato a usuario de EduPay

Estado: lado EduPay construido (migración 0010, sincronización, API y pantalla). Falta el lado del Dashboard.

## Reglas acordadas (Karla)
- Solo un **superadministrador** asigna acceso, rol, campus y permisos. Un administrador de escuela no puede.
- La sincronización **solo propone candidatos**. No crea usuarios, vínculos ni da acceso.
- El rol del Dashboard (Director, Coordinador, Administrativo…) es **solo referencia**; el rol real lo elige el superadmin en EduPay.
- Se traen **todos los roles del personal**. El superadmin decide a quién habilitar.
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
      "rol": "Administrativo",
      "idEscuela": "id de la escuela en Firebase",
      "nombre": "Ana",
      "primerApellido": "Gómez",
      "segundoApellido": null,
      "email": "ana@institutojfr.edu.mx",
      "registroSep": [{ "clave": "CCT 22PPR0186I", "nivel": "Primaria" }]
    }
  ]
}
```

- `estado`: `"activo"` o `"baja"`. Quien esté de baja se muestra pero no se puede habilitar.
- `registroSep`: la clave se normaliza en EduPay (prefijo `CCT`, espacios, O/0). Solo sirve para sugerir campus por `nivel`.
- No enviar contraseñas, teléfonos ni datos que EduPay no use.
- Mismo control de acceso que el resto del puente: solo la cuenta de servicio de EduPay.

## Flujo en EduPay
1. `sync:firebase-bridge` guarda a cada persona en `firebase_staff_candidates` (dry-run primero; `--apply` exige autorización).
2. Usuarios → "Personal del Dashboard" (solo superadmin): se elige rol, campus y permisos adicionales.
3. EduPay crea el usuario (contraseña aleatoria que nadie conoce) y el vínculo SSO en una transacción, con auditoría.
4. La persona entra por el botón del Dashboard. Su rol viaja en el token: un cambio de rol aplica al vencer la sesión.
5. "Quitar acceso" desvincula el `uid`, desactiva al usuario y cierra sus sesiones. No lo borra.

## Pendientes
- Aplicar la migración 0010 en Cloud SQL (respaldo previo y autorización de Karla).
- Regenerar `drizzle/schema-catalog.json` (`verify-schema-exact --record` contra una base de pruebas PG16 con la 0010 aplicada); el CI lo compara.
- Ampliar la función del Dashboard con `personal` y desplegarla.
- Si se quita el acceso y luego se quiere restituir a la misma persona, el correo ya existe en `users` y la asignación se rechaza (no se vincula por correo): reactivar desde Usuarios.
- Un superadmin sin campus propio no puede crear usuarios por `POST /api/users`; esta ruta nueva no lo necesita.
