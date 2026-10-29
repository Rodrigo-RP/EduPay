/**
 * Sólo fixtures: sus cuentas nacen con password_changed_at NULL (versión 0).
 * No modifica jsonwebtoken globalmente ni se importa desde producción.
 * Una versión explícita prevalece, incluso undefined para probar rechazo.
 * Para cuentas cuya contraseña cambió, pasar su versión real en milisegundos.
 */
import jwt from "jsonwebtoken";
const fixtureJwt = {
  ...jwt,
  sign: ((payload: object | string | Buffer, ...args: any[]) => {
    const claims = payload && typeof payload === "object" && !Buffer.isBuffer(payload)
      ? { password_version: 0, ...payload } : payload;
    return (jwt.sign as (...parameters: any[]) => any)(claims, ...args);
  }) as typeof jwt.sign,
};
export default fixtureJwt;
