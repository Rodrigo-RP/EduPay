import { describe, expect, it } from "vitest";
import { safeDashboardUrl, rememberDashboardUrl, storedDashboardUrl, DASHBOARD_URL_KEY } from "../../client/src/lib/dashboard-link";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

describe("URL guardada para el portal de tutores", () => {
  it("se guarda solo si es válida y con SSO activo, y se lee validada", () => {
    store.clear();
    rememberDashboardUrl({ enabled: false, dashboard_url: "https://d.example" });
    expect(storedDashboardUrl()).toBeNull();
    rememberDashboardUrl({ enabled: true, dashboard_url: "javascript:alert(1)" });
    expect(storedDashboardUrl()).toBeNull();
    rememberDashboardUrl({ enabled: true, dashboard_url: "https://d.example" });
    expect(storedDashboardUrl()).toBe("https://d.example/");
  });

  it("descarta un valor manipulado en el almacenamiento", () => {
    store.set(DASHBOARD_URL_KEY, "javascript:alert(1)");
    expect(storedDashboardUrl()).toBeNull();
  });
});

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
