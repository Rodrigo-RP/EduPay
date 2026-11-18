import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { USER_ROLES, PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, getRoleDisplayName, getRoleDescription, type UserRole } from "@shared/user-roles";

interface Candidate {
  id: number;
  tenant_id: number;
  firebase_uid: string;
  nombre_completo: string;
  email: string | null;
  rol_dashboard: string | null;
  registro_sep: Array<{ clave: string; nivel: string | null }>;
  estado: string;
  campus_sugeridos: number[];
  usuario: { id: number; role: string; campus_id: number | null; is_active: boolean; custom_permissions: string[] } | null;
}
interface Campus { id: number; tenant_id: number; nombre: string }

const ROLES = Object.values(USER_ROLES) as UserRole[];

/**
 * Personal del Dashboard propuesto por la sincronización. Solo el superadministrador decide quién entra a EduPay,
 * con qué rol, en qué campus y con qué permisos adicionales. El rol del Dashboard es solo una referencia.
 */
export default function StaffCandidatesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<Candidate | null>(null);
  const [role, setRole] = useState<string>("");
  const [campusId, setCampusId] = useState<string>("");
  const [email, setEmail] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const [filter, setFilter] = useState("");

  const { data, isLoading, isError } = useQuery<{ candidates: Candidate[]; campuses: Campus[] }>({ queryKey: ["/api/super-admin/staff-candidates"] });
  const candidates = data?.candidates ?? [];
  const campuses = data?.campuses ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/super-admin/staff-candidates"] });
  const fail = (title: string) => async (err: any) => {
    toast({ title, description: err?.message || "No se pudo completar la operación.", variant: "destructive" });
  };

  const assign = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/super-admin/staff-candidates/${target!.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ role, campus_id: Number(campusId), email: email || undefined, custom_permissions: extra }),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Acceso asignado", description: `${target?.nombre_completo} ya puede entrar a EduPay desde el Dashboard.` });
      setTarget(null);
      refresh();
    },
    onError: fail("No se pudo asignar"),
  });

  const revoke = useMutation({
    mutationFn: async (c: Candidate) => (await apiRequest(`/api/super-admin/staff-candidates/${c.id}/revoke`, { method: "POST", body: "{}" })).json(),
    onSuccess: () => { toast({ title: "Acceso quitado", description: "El usuario quedó desactivado y sus sesiones se cerraron." }); refresh(); },
    onError: fail("No se pudo quitar el acceso"),
  });

  function open(c: Candidate) {
    const tenantCampuses = campuses.filter((x) => x.tenant_id === c.tenant_id);
    setTarget(c);
    setRole("");
    setEmail("");
    setExtra([]);
    const suggested = c.campus_sugeridos[0] ?? (tenantCampuses.length === 1 ? tenantCampuses[0].id : undefined);
    setCampusId(suggested ? String(suggested) : "");
  }

  const term = filter.trim().toLowerCase();
  const shown = candidates.filter((c) => !term || `${c.nombre_completo} ${c.email ?? ""} ${c.rol_dashboard ?? ""}`.toLowerCase().includes(term));
  const baseline = role ? new Set(DEFAULT_ROLE_PERMISSIONS[role as UserRole] ?? []) : new Set<string>();
  const needsEmail = !!target && !target.email;
  const canSubmit = !!role && !!campusId && (!needsEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) && !assign.isPending;

  return (
    <Card data-testid="staff-candidates-panel">
      <CardHeader>
        <CardTitle>Personal del Dashboard</CardTitle>
        <CardDescription>
          Personas que el Dashboard propone. Ninguna tiene acceso a EduPay hasta que tú le asignes un rol aquí.
          El rol del Dashboard es solo referencia: el permiso real es el que elijas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input placeholder="Buscar por nombre, correo o rol del Dashboard" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar personal" />
        {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
        {isError && <p className="text-sm text-red-600">No se pudo cargar la lista de personal.</p>}
        {!isLoading && !isError && candidates.length === 0 && (
          <p className="text-sm text-slate-500">Aún no hay personal sincronizado. Aparecerá cuando el Dashboard envíe al personal y se ejecute la sincronización.</p>
        )}
        <div className="divide-y rounded-md border">
          {shown.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3" data-testid={`staff-candidate-${c.id}`}>
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{c.nombre_completo}</p>
                <p className="text-sm text-slate-600">{c.email ?? "Sin correo en el Dashboard"}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.rol_dashboard && <Badge variant="outline">Dashboard: {c.rol_dashboard}</Badge>}
                  {c.estado !== "activo" && <Badge variant="destructive">De baja en el Dashboard</Badge>}
                  {c.usuario && <Badge>{getRoleDisplayName(c.usuario.role as UserRole)}{c.usuario.is_active ? "" : " (desactivado)"}</Badge>}
                  {c.usuario && c.usuario.custom_permissions.length > 0 && <Badge variant="secondary">+{c.usuario.custom_permissions.length} permisos</Badge>}
                </div>
              </div>
              {c.usuario ? (
                <Button variant="outline" size="sm" disabled={revoke.isPending}
                  onClick={() => { if (window.confirm(`¿Quitar el acceso de ${c.nombre_completo}? Se desactivará su usuario y se cerrarán sus sesiones.`)) revoke.mutate(c); }}>
                  Quitar acceso
                </Button>
              ) : (
                <Button size="sm" disabled={c.estado !== "activo"} onClick={() => open(c)}>Asignar acceso</Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={!!target} onOpenChange={(v) => { if (!assign.isPending && !v) setTarget(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asignar acceso a {target?.nombre_completo}</DialogTitle>
            <DialogDescription>
              Se creará su usuario de EduPay y entrará solo por el botón del Dashboard. Rol en el Dashboard: {target?.rol_dashboard ?? "—"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rol en EduPay</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger aria-label="Rol en EduPay"><SelectValue placeholder="Elige un rol" /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{getRoleDisplayName(r)}</SelectItem>)}</SelectContent>
              </Select>
              {role && <p className="mt-1 text-xs text-slate-500">{getRoleDescription(role as UserRole)}</p>}
            </div>
            <div>
              <Label>Campus</Label>
              <Select value={campusId} onValueChange={setCampusId}>
                <SelectTrigger aria-label="Campus"><SelectValue placeholder="Elige un campus" /></SelectTrigger>
                <SelectContent>
                  {campuses.filter((x) => x.tenant_id === target?.tenant_id).map((x) => <SelectItem key={x.id} value={String(x.id)}>{x.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {needsEmail && (
              <div>
                <Label>Correo (el Dashboard no lo trae)</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@institutojfr.edu.mx" />
              </div>
            )}
            <div>
              <Label>Permisos adicionales al rol (opcional)</Label>
              <p className="mb-2 text-xs text-slate-500">Los que ya incluye el rol aparecen marcados y no se pueden quitar aquí.</p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {Object.entries(PERMISSIONS).map(([key, label]) => {
                  const inRole = baseline.has(key);
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={inRole || extra.includes(key)} disabled={inRole || !role}
                        onCheckedChange={(v) => setExtra((prev) => (v ? [...prev, key] : prev.filter((k) => k !== key)))} />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={assign.isPending}>Cancelar</Button>
            <Button onClick={() => assign.mutate()} disabled={!canSubmit}>{assign.isPending ? "Asignando…" : "Asignar acceso"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
