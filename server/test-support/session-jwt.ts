/**
 * Sólo fixtures: sus cuentas nacen con password_changed_at NULL (versión 0).
 * No modifica jsonwebtoken globalmente ni se importa desde producción.
 * Una versión explícita prevalece, incluso undefined para probar rechazo.
 * Para cuentas cuya contraseña cambió, pasar su versión real en milisegundos.
 * Las pruebas de negocio sin actor explícito usan el administrador real del
 * seed de heliumdb, no una identidad inexistente. Su fila activa se verifica
 * mediante la misma guarda de producción. Para probar ausencia de id,
 * importar jsonwebtoken directamente o pasar id: undefined explícitamente.
 */
import jwt from "jsonwebtoken";
export const SESSION_FIXTURE_USER_ID = 80;
const fixtureJwt = {
  ...jwt,
  sign: ((payload: object | string | Buffer, ...args: any[]) => {
    const claims = payload && typeof payload === "object" && !Buffer.isBuffer(payload)
      ? { id: SESSION_FIXTURE_USER_ID, password_version: 0, ...payload } : payload;
    return (jwt.sign as (...parameters: any[]) => any)(claims, ...args);
  }) as typeof jwt.sign,
};
export default fixtureJwt;
