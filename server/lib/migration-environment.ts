/** El esquema de producción lo administra Publishing, nunca el proceso Node. */
export function assertMigrationEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env.APP_ENV === "production" || env.NODE_ENV === "production") {
    throw new Error(
      "Migraciones bloqueadas en producción: la estructura la aplica Replit al publicar. No se ejecutó SQL.",
    );
  }
}
