import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, User, Users, CreditCard, FileText, X, Loader2 } from "lucide-react";

interface SearchResult {
  alumnos: Alumno[];
  tutores: Tutor[];
  pagos:   Pago[];
  cargos:  Cargo[];
}
interface Alumno { id: number; label: string; sublabel: string | null; matricula: string | null; status: string; }
interface Tutor  { id: number; label: string; sublabel: string | null; }
interface Pago   { id: number; label: string; sublabel: string | null; estado: string; student_id: number; }
interface Cargo  { id: number; label: string; sublabel: string | null; estado: string; student_id: number; }

type AnyResult = { id: number; label: string; sublabel?: string | null; tipo: string; href: string; };

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function GlobalSearch() {
  const [, navigate]     = useLocation();
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const [focused, setFocused] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const token    = () => localStorage.getItem("auth_token");

  const debouncedQ = useDebounce(query, 300);
  const enabled    = debouncedQ.trim().length >= 3;

  const { data, isFetching } = useQuery<SearchResult>({
    queryKey: ["/api/search", debouncedQ],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQ)}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Error al buscar");
      return res.json();
    },
    enabled,
    staleTime: 5000,
  });

  // Flatten all results into a single ordered list for keyboard nav
  const allResults: AnyResult[] = [
    ...(data?.alumnos ?? []).map(a => ({
      id: a.id, label: a.label, sublabel: a.sublabel, tipo: "alumno",
      href: `/estudiantes?id=${a.id}`,
    })),
    ...(data?.tutores ?? []).map(g => ({
      id: g.id, label: g.label, sublabel: g.sublabel, tipo: "tutor",
      href: `/familias?guardian=${g.id}`,
    })),
    ...(data?.pagos ?? []).map(p => ({
      id: p.id, label: p.label, sublabel: p.sublabel, tipo: "pago",
      href: `/pagos?id=${p.id}`,
    })),
    ...(data?.cargos ?? []).map(c => ({
      id: c.id, label: c.label, sublabel: c.sublabel, tipo: "cargo",
      href: `/cargos?id=${c.id}`,
    })),
  ];

  const total = allResults.length;
  const hasResults = total > 0;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setFocused(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused(f => Math.min(f + 1, total - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
    if (e.key === "Escape")    { setOpen(false); setFocused(-1); inputRef.current?.blur(); }
    if (e.key === "Enter" && focused >= 0 && allResults[focused]) {
      navigateTo(allResults[focused].href);
    }
  };

  const navigateTo = useCallback((href: string) => {
    setOpen(false);
    setQuery("");
    setFocused(-1);
    navigate(href);
  }, [navigate]);

  const typeIcon = (tipo: string) => {
    switch (tipo) {
      case "alumno": return <User className="w-3.5 h-3.5 text-blue-500" />;
      case "tutor":  return <Users className="w-3.5 h-3.5 text-purple-500" />;
      case "pago":   return <CreditCard className="w-3.5 h-3.5 text-green-500" />;
      case "cargo":  return <FileText className="w-3.5 h-3.5 text-orange-500" />;
    }
  };
  const typeLabel = (tipo: string) => {
    switch (tipo) {
      case "alumno": return "Alumno";
      case "tutor":  return "Tutor";
      case "pago":   return "Pago";
      case "cargo":  return "Cargo";
    }
  };
  const typeBadgeColor = (tipo: string) => {
    switch (tipo) {
      case "alumno": return "bg-blue-50 text-blue-700 border-blue-200";
      case "tutor":  return "bg-purple-50 text-purple-700 border-purple-200";
      case "pago":   return "bg-green-50 text-green-700 border-green-200";
      case "cargo":  return "bg-orange-50 text-orange-700 border-orange-200";
    }
  };

  // Group for display
  const groups = [
    { key: "alumno", label: "Alumnos",         icon: <User className="w-3.5 h-3.5 text-blue-500" />,    items: data?.alumnos ?? [] },
    { key: "tutor",  label: "Tutores / Familias", icon: <Users className="w-3.5 h-3.5 text-purple-500" />, items: data?.tutores ?? [] },
    { key: "pago",   label: "Pagos",            icon: <CreditCard className="w-3.5 h-3.5 text-green-500" />, items: data?.pagos ?? [] },
    { key: "cargo",  label: "Cargos",           icon: <FileText className="w-3.5 h-3.5 text-orange-500" />, items: data?.cargos ?? [] },
  ].filter(g => g.items.length > 0);

  // Build global index per rendered item
  let globalIdx = 0;

  return (
    <div ref={panelRef} className="relative">
      {/* Input */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setFocused(-1); }}
          onFocus={() => { if (query.trim().length >= 3) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar alumno, tutor, pago…"
          className="pl-9 pr-8 h-8 w-64 text-sm border-slate-200 bg-slate-50 focus:bg-white focus:w-80 transition-all duration-200"
        />
        {isFetching && (
          <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
        )}
        {!isFetching && query && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={() => { setQuery(""); setOpen(false); }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && enabled && (
        <div className="absolute top-full mt-1 right-0 w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {isFetching && !data && (
            <div className="flex items-center justify-center py-8 gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando…
            </div>
          )}

          {!isFetching && !hasResults && data && (
            <div className="py-8 text-center text-slate-500 text-sm">
              <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              Sin resultados para <span className="font-medium">"{query}"</span>
            </div>
          )}

          {hasResults && (
            <div className="max-h-[420px] overflow-y-auto">
              {groups.map(group => {
                const groupItems = group.items;
                return (
                  <div key={group.key}>
                    {/* Section header */}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                      {group.icon}
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        {group.label}
                      </span>
                      <span className="ml-auto text-xs text-slate-400">{groupItems.length}</span>
                    </div>

                    {(groupItems as any[]).map(item => {
                      const currentIdx = globalIdx++;
                      const isFocusedItem = focused === currentIdx;
                      const href =
                        group.key === "alumno" ? `/estudiantes?id=${item.id}` :
                        group.key === "tutor"  ? `/familias?guardian=${item.id}` :
                        group.key === "pago"   ? `/pagos?id=${item.id}` :
                                                 `/cargos?id=${item.id}`;
                      return (
                        <button
                          key={item.id}
                          className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors ${
                            isFocusedItem ? "bg-blue-50" : ""
                          }`}
                          onClick={() => navigateTo(href)}
                          onMouseEnter={() => setFocused(currentIdx)}
                        >
                          <div className={`p-1.5 rounded-lg ${
                            group.key === "alumno" ? "bg-blue-100" :
                            group.key === "tutor"  ? "bg-purple-100" :
                            group.key === "pago"   ? "bg-green-100" : "bg-orange-100"
                          }`}>
                            {group.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
                            {item.sublabel && (
                              <p className="text-xs text-slate-500 truncate">{item.sublabel}</p>
                            )}
                          </div>
                          {item.estado && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              item.estado === "pagado"   ? "bg-green-100 text-green-700" :
                              item.estado === "pendiente" ? "bg-yellow-100 text-yellow-700" :
                              item.estado === "activo"   ? "bg-green-100 text-green-700" :
                                                           "bg-slate-100 text-slate-600"
                            }`}>
                              {item.estado}
                            </span>
                          )}
                          {item.matricula && (
                            <span className="text-xs text-slate-400">{item.matricula}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {/* Footer hint */}
              <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-3 text-xs text-slate-400">
                <span>↑↓ navegar</span>
                <span>↵ abrir</span>
                <span>Esc cerrar</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
