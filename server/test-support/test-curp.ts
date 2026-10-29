/** CURP de prueba única dentro de la corrida y válida con el formato oficial. */
const CURP_SPACE = 36_500 * 36 * 10; // fechas válidas × homoclave × dígito
let curpSeq = Math.floor(Math.random() * (CURP_SPACE - 1_000_000));
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function uniqueTestCurp(prefix: string): string {
  if (!/^[A-Z][AEIOUX][A-Z]{2}$/.test(prefix)) {
    throw new Error(`Prefijo de CURP de prueba inválido: ${prefix}`);
  }
  const n = curpSeq++;
  const day = new Date(Date.UTC(2000, 0, 1) + (n % 36_500) * 86_400_000);
  const yymmdd = String(day.getUTCFullYear() % 100).padStart(2, "0")
    + String(day.getUTCMonth() + 1).padStart(2, "0")
    + String(day.getUTCDate()).padStart(2, "0");
  return `${prefix}${yymmdd}HNENNN${ALNUM[Math.floor(n / 36_500) % 36]}${Math.floor(n / (36_500 * 36)) % 10}`;
}
