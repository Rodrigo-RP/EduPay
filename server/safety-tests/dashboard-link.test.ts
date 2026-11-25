import { describe, expect, it } from "vitest";
import { safeDashboardUrl } from "../../client/src/lib/dashboard-link";

describe("Enlace de regreso al Dashboard", () => {
  it("acepta la URL del servidor solo con SSO activo", () => {
    expect(safeDashboardUrl({ enabled: true, dashboard_url: "https://dashboard-refereence.web.app" })).toBe("https://dashboard-refereence.web.app/");
    expect(safeDashboardUrl({ enabled: false, dashboard_url: "https://dashboard-refereence.web.app" })).toBeNull();
  });

  it("descarta esquemas peligrosos, URL inválidas y datos ausentes", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.mx", "no es url", "", null, 5]) {
      expect(safeDashboardUrl({ enabled: true, dashboard_url: bad })).toBeNull();
    }
    expect(safeDashboardUrl(null)).toBeNull();
    expect(safeDashboardUrl({ enabled: true })).toBeNull();
  });
});
