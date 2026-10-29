import { expect, it } from "vitest";
import { isSessionInvalidated, passwordVersion } from "../lib/session-version";
it("rechaza token anterior incluso con el mismo iat; acepta la nueva versión exacta", () => {
  const before = new Date("2026-10-28T21:00:00.100Z");
  const after = new Date("2026-10-28T21:00:00.900Z");
  expect(Math.floor(before.getTime() / 1000)).toBe(Math.floor(after.getTime() / 1000));
  expect(isSessionInvalidated(passwordVersion(before), after)).toBe(true);
  expect(isSessionInvalidated(passwordVersion(after), after)).toBe(false);
  expect(isSessionInvalidated(passwordVersion(after) + 1, after)).toBe(true);
});
it("NULL requiere versión 0 explícita; ausente, string y NaN se rechazan", () => {
  expect(passwordVersion(null)).toBe(0);
  expect(isSessionInvalidated(0, null)).toBe(false);
  for (const version of [undefined, null, "0", NaN, Infinity]) {
    expect(isSessionInvalidated(version, null)).toBe(true);
  }
});
