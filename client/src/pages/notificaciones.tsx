import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowRight, Check, Clock3, Mail, RefreshCw, Send, ShieldAlert, Smartphone, Users, XCircle } from "lucide-react";
import { EmailEvidenceSummary, RecipientEventEvidence, hasVerifiedEmailState } from "@/components/notifications/email-evidence";
import type { EmailEvidenceCounts, EmailRecipientEvidence } from "@shared/email-evidence";

type Tipo = "RECORDATORIO_VENCIMIENTO" | "AVISO_MORA" | "CARGO_EMITIDO";
type Estado = "pendiente" | "enviando" | "aceptado" | "entregado" | "rebotado" | "queja" | "error" | "incierto" | "omitido";
type Config = { configured: boolean; canProcess: boolean; code?: string; workerEnabled: false };
type Candidate = { id: number; nombre: string; email: string | null };
type Preview = {
  intentId: string;
  existingBatchId: string | null;
  summary: { total: number; validos: number; omitidos: number };
  recipients: { email: string | null; estado: "pendiente" | "omitido"; motivo: string | null; studentIds: number[] }[];
  expiresAt: string;
};
type Recipient = EmailRecipientEvidence & {
  id: string; email: string | null; estado: Estado; motivo: string | null;
  error_code: string | null; error_message: string | null; provider_message_id: string | null;
  accepted_at: string | null; enviado_en: string | null;
};
type Counts = Record<Estado, number> & { total: number; evidence?:EmailEvidenceCounts };
type Batch = { id: string; counts: Counts; recipients?: Recipient[]; notice: string | null; workerEnabled: false };
type Stats = Counts;
type ApiError = Error & { code?: string; status?: number };

const TIPOS: { value: Tipo; label: string; detail: string }[] = [
  { value: "RECORDATORIO_VENCIMIENTO", label: "Recordatorio de vencimiento", detail: "Pagos próximos a vencer." },
  { value: "AVISO_MORA", label: "Aviso de mora", detail: "Pagos vencidos pendientes." },
  { value: "CARGO_EMITIDO", label: "Cargo emitido", detail: "Aviso de un nuevo cargo." },
];
const COUNT_LABELS: [Estado | "total", string][] = [
  ["total", "Registros"], ["pendiente", "Pendientes"], ["enviando", "En proceso"],
   ["aceptado", "Aceptados (estado actual)"], ["entregado", "Entregados (estado actual)"],
  ["rebotado", "Rebotados"], ["queja", "Quejas"], ["error", "Errores"],
  ["incierto", "Estado incierto"], ["omitido", "Omitidos"],
];

function tokenFingerprint() {
  const token = typeof window === "undefined" ? "" : localStorage.getItem("auth_token") ?? "";
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) hash = Math.imul(hash ^ token.charCodeAt(i), 16777619);
  return `${token ? "session" : "none"}-${(hash >>> 0).toString(36)}`;
}
function parseApiError(error: unknown): ApiError {
  if (error instanceof Error) {
    const match = error.message.match(/^\d+:\s*([\s\S]*)$/);
    if (match) {
      try {
        const body = JSON.parse(match[1]) as { code?: string; message?: string };
        const status = Number(error.message.match(/^(\d+):/)?.[1]);
        return Object.assign(new Error(body.message || error.message), { code: body.code, status });
      } catch { /* use original error */ }
    }
    return error;
  }
  return new Error("No se pudo completar la operación.");
}
async function requestJson<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await apiRequest(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return response.json() as Promise<T>;
}
function dateLabel(value: string | null | undefined) {
  if (!value) return "Sin evidencia de fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}
function statusBadge(status: Estado) {
  const styles: Record<Estado, string> = {
    pendiente: "border-amber-300 bg-amber-50 text-amber-800",
    enviando: "border-sky-300 bg-sky-50 text-sky-800",
    aceptado: "border-teal-300 bg-teal-50 text-teal-800",
    entregado: "border-emerald-300 bg-emerald-50 text-emerald-800",
    rebotado: "border-rose-300 bg-rose-50 text-rose-800",
    queja: "border-rose-300 bg-rose-50 text-rose-800",
    error: "border-red-300 bg-red-50 text-red-800",
    incierto: "border-orange-300 bg-orange-50 text-orange-800",
    omitido: "border-stone-300 bg-stone-100 text-stone-700",
  };
  return <Badge variant="outline" className={styles[status]}>{status.replace("_", " ")}</Badge>;
}

function BatchDetail({ batch, onCloseBatch, resolving, canProcess }: { batch: Batch; onCloseBatch: (id: string) => void; resolving: string | null; canProcess: boolean }) {
  const uncertain = (batch.recipients ?? []).filter(r => r.estado === "incierto");
  return (
    <Card className="border-teal-200 bg-[#fbfdfb]">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">Lote auditado</p>
          <CardTitle className="mt-1 break-all text-lg">#{batch.id}</CardTitle>
        </div>
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">Worker detenido</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <EmailEvidenceSummary evidence={batch.counts.evidence} />
        {batch.notice && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{batch.notice}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {COUNT_LABELS.map(([key, label]) => <div key={key} className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="font-mono text-xl text-slate-900">{batch.counts[key] ?? 0}</div>
            <div className="mt-1 text-xs text-slate-600">{label}</div>
          </div>)}
        </div>
        {uncertain.length > 0 && <div className="rounded-lg border border-orange-300 bg-orange-50 p-4">
          <div className="flex gap-2 text-sm font-semibold text-orange-950"><ShieldAlert className="h-4 w-4 shrink-0" />Estado incierto: no reenvíe automáticamente</div>
          <p className="mt-1 text-sm text-orange-900">Verifique evidencia externa antes de resolver. Cerrar sin reenvío solo registra el cierre; no vuelve a enviar el correo.</p>
        </div>}
        {!batch.recipients ? <p className="text-sm text-slate-600">El historial resume el lote. Abra su detalle para revisar destinatarios y evidencia.</p> :
          batch.recipients.length === 0 ? <p className="text-sm text-slate-600">Este lote no contiene destinatarios.</p> :
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800">Registro de destinatarios</h3>
            {batch.recipients.map(r => <div key={r.id} className="rounded-lg border border-stone-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all text-sm font-medium text-slate-900">{r.email || "Correo no disponible"}</span>
                {hasVerifiedEmailState(r.estado,r) ? statusBadge(r.estado) : <Badge variant="outline">Sin evidencia verificada</Badge>}
              </div>
              <RecipientEventEvidence evidence={r} />
              {r.motivo && <p className="mt-1 text-sm text-slate-600">Motivo: {r.motivo}</p>}
              {(r.error_code || r.error_message) && <p className="mt-1 text-sm text-rose-800">Error {r.error_code ? `(${r.error_code}) ` : ""}{r.error_message}</p>}
              {r.provider_message_id && <p className="mt-1 break-all font-mono text-xs text-slate-600">ID proveedor: {r.provider_message_id}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {r.accepted_at && <span>Aceptado por proveedor: {dateLabel(r.accepted_at)}</span>}
                {r.enviado_en && <span>Marca de envío: {dateLabel(r.enviado_en)}</span>}
              </div>
              {r.estado === "incierto" && <Button size="sm" variant="outline" className="mt-3 border-orange-300 text-orange-900" disabled={resolving !== null || !canProcess} onClick={() => onCloseBatch(r.id)}>
                {resolving === r.id ? "Registrando…" : "Cerrar sin reenvío"}
              </Button>}
            </div>)}
          </div>}
      </CardContent>
    </Card>
  );
}

function NotificacionesContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fingerprint = tokenFingerprint();
  const [tipo, setTipo] = useState<Tipo>("RECORDATORIO_VENCIMIENTO");
  const [modo, setModo] = useState<"masivo" | "individual">("masivo");
  const [selected, setSelected] = useState<number[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewPurpose, setPreviewPurpose] = useState<"normal" | "resend">("normal");
  const [resendSource, setResendSource] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [checkingResend, setCheckingResend] = useState<string | null>(null);

  const configQuery = useQuery<Config>({ queryKey: ["/api/notifications/email/config", fingerprint], queryFn: () => requestJson("/api/notifications/email/config") });
  const statsQuery = useQuery<Stats>({ queryKey: ["/api/notifications/email/stats", fingerprint], queryFn: () => requestJson("/api/notifications/email/stats") });
  const historyQuery = useQuery<Batch[]>({ queryKey: ["/api/notifications/email/history", fingerprint], queryFn: () => requestJson("/api/notifications/email/history") });
  const candidatesQuery = useQuery<Candidate[]>({
    queryKey: ["/api/notifications/email/candidates", fingerprint, tipo],
    queryFn: () => requestJson(`/api/notifications/email/candidates?tipo=${encodeURIComponent(tipo)}`),
    enabled: dialogOpen && previewPurpose === "normal",
  });
  const batchQuery = useQuery<Batch>({
    queryKey: ["/api/notifications/email/batches", fingerprint, selectedBatch],
    queryFn: () => requestJson(`/api/notifications/email/batches/${encodeURIComponent(selectedBatch!)}`),
    enabled: !!selectedBatch,
    refetchInterval: query => {
      const batch = query.state.data as Batch | undefined;
      return batch && [batch.counts.pendiente, batch.counts.enviando].some(n => n > 0) ? 2000 : false;
    },
  });

  useEffect(() => {
    if (!activeBatchId || selectedBatch !== activeBatchId || !batchQuery.data) return;
    void queryClient.invalidateQueries({ queryKey: ["/api/notifications/email/stats", fingerprint] });
    void queryClient.invalidateQueries({ queryKey: ["/api/notifications/email/history", fingerprint] });
    if (![batchQuery.data.counts.pendiente, batchQuery.data.counts.enviando].some(n => n > 0)) setActiveBatchId(null);
  }, [activeBatchId, batchQuery.data, fingerprint, queryClient, selectedBatch]);

  const previewMutation = useMutation({
    mutationFn: (args: { tipo: Tipo; modo: "masivo" | "individual"; estudiantesIds?: number[]; resendOf?: string }) =>
      requestJson<Preview>("/api/notifications/email/preview", "POST", { ...args, canal: "EMAIL" }),
    onSuccess: data => { setPreview(data); setConfirmOpen(false); },
    onError: error => {
      const e = parseApiError(error);
      toast({ title: e.code === "EMAIL_NO_CONFIGURADO" ? "Correo no configurado" : "No se pudo preparar la vista previa", description: e.message, variant: "destructive" });
    },
  });
  const confirmMutation = useMutation({
    mutationFn: (intentId: string) => requestJson<{ batchId: string; reused: boolean }>("/api/notifications/email/confirm", "POST", { intentId, canal: "EMAIL" }),
    onSuccess: result => {
      setPreview(null); setConfirmOpen(false); setDialogOpen(false);
      setSelectedBatch(result.batchId); setActiveBatchId(result.batchId);
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications/email/history", fingerprint] });
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications/email/stats", fingerprint] });
      toast({ title: result.reused ? "Lote existente recuperado" : "Lote registrado", description: "El registro del lote no confirma envío ni entrega. El worker de correo está detenido." });
    },
    onError: error => {
      const e = parseApiError(error);
      setPreview(null); setConfirmOpen(false);
      const changed = e.code === "EMAIL_PREVIEW_CHANGED" || e.code === "EMAIL_PREVIEW_EXPIRED";
      toast({ title: changed ? "La vista previa venció o cambió" : "No se pudo confirmar el lote", description: changed ? "Revise nuevamente los destinatarios y confirme solo después de una nueva vista previa." : e.message, variant: "destructive" });
    },
  });
  const retryBatch = useMutation({
    mutationFn: (id: string) => requestJson<Batch>(`/api/notifications/email/batches/${encodeURIComponent(id)}`),
    onSuccess: batch => { setSelectedBatch(batch.id); setActiveBatchId(batch.id); },
    onError: error => toast({ title: "No se pudo cargar el lote", description: parseApiError(error).message, variant: "destructive" }),
  });
  const closeUncertain = async (recipientId: string) => {
    if (resolving !== null || !canProcess) return;
    if (!window.confirm("¿Confirmas cerrar este estado incierto sin reenviar? Verifica antes cualquier evidencia externa.")) return;
    setResolving(recipientId);
    try {
      await requestJson(`/api/notifications/email/recipients/${encodeURIComponent(recipientId)}/resolve`, "POST", { decision: "cerrar_sin_reenvio" });
      toast({ title: "Cierre registrado", description: "No se realizó ningún reenvío." });
      if (selectedBatch) await queryClient.invalidateQueries({ queryKey: ["/api/notifications/email/batches", fingerprint, selectedBatch] });
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/email/history", fingerprint] });
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications/email/stats", fingerprint] });
    } catch (error) {
      const e = parseApiError(error);
      toast({ title: e.status === 403 ? "Permiso insuficiente" : "No se pudo registrar el cierre", description: e.message, variant: "destructive" });
    } finally { setResolving(null); }
  };

  const isConfigured = configQuery.data?.configured === true;
  const canProcess = configQuery.data?.canProcess === true;
  const configFailure = configQuery.isError || (!!configQuery.data && !configQuery.data.configured);
  const currentType = useMemo(() => TIPOS.find(item => item.value === tipo)!, [tipo]);
  const preparePreview = () => {
    if (!canProcess || !isConfigured || previewMutation.isPending || confirmMutation.isPending) return;
    if (previewPurpose === "resend" && resendSource && window.confirm(`Preparar un reenvío deliberado vinculado al lote ${resendSource}. Esto solo mostrará una vista previa; no enviará correo. ¿Continuar?`)) {
      previewMutation.mutate({ tipo, modo, resendOf: resendSource });
    } else if (previewPurpose === "normal") {
      previewMutation.mutate({ tipo, modo, ...(modo === "individual" ? { estudiantesIds: selected } : {}) });
    }
  };
  const begin = () => {
    setDialogOpen(true); setPreviewPurpose("normal"); setResendSource(null); setPreview(null); setSelected([]);
  };
  const startResend = async (id: string) => {
    if (!canProcess || !isConfigured || checkingResend !== null || resolving !== null) return;
    setCheckingResend(id);
    try {
      const batch = await requestJson<Batch>(`/api/notifications/email/batches/${encodeURIComponent(id)}`);
      if ((batch.recipients ?? []).some(r => r.estado === "incierto")) {
        toast({ title: "Reenvío bloqueado", description: "Este lote contiene destinatarios en estado incierto. Revise evidencia y ciérrelos manualmente antes de preparar otro envío.", variant: "destructive" });
        setSelectedBatch(id);
        return;
      }
      setTipo("RECORDATORIO_VENCIMIENTO"); setModo("masivo"); setSelected([]);
      setResendSource(id); setPreviewPurpose("resend"); setPreview(null); setDialogOpen(true);
    } catch (error) {
      toast({ title: "No se pudo revisar el lote", description: parseApiError(error).message, variant: "destructive" });
    } finally { setCheckingResend(null); }
  };
  const toggleCandidate = (id: number, checked: boolean) => setSelected(old => checked ? [...old, id] : old.filter(item => item !== id));

  return <main className="min-h-[100dvh] bg-[#f4f6f2] px-4 py-7 text-slate-900 sm:px-7 lg:px-10">
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col justify-between gap-5 border-b border-[#d9e1d8] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-teal-800"><Mail className="h-4 w-4" /> EduPay · comunicación institucional</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#172d2b] sm:text-4xl">Notificaciones por correo</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Cada lote conserva su vista previa y evidencia. Crear un lote no significa que un correo se haya enviado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { void configQuery.refetch(); void statsQuery.refetch(); void historyQuery.refetch(); if (selectedBatch) void batchQuery.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
          <Button onClick={begin} disabled={!isConfigured || !canProcess} className="bg-[#1d5550] text-white hover:bg-[#164540]"><Send className="mr-2 h-4 w-4" />Preparar correo</Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className={`rounded-xl border p-4 sm:col-span-2 xl:col-span-1 ${configFailure ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50"}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-950"><AlertTriangle className="h-4 w-4" />{configFailure ? "Correo no configurado" : "Worker detenido"}</div>
          <p className="mt-2 text-xs leading-5 text-amber-900">{configQuery.isLoading ? "Consultando configuración…" : configQuery.isError ? "No se pudo verificar la configuración. No se permite preparar correos." : "Los lotes pueden registrarse, pero todavía no se envían."}</p>
        </div>
        {[
          ["Pendientes", "pendiente"], ["En proceso", "enviando"], ["Inciertos", "incierto"], ["Errores", "error"],
        ].map(([label, key]) => <Card key={key} className="border-[#dfe6df] bg-[#fbfcfa] shadow-none">
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            {statsQuery.isLoading ? <div className="mt-2 h-8 w-16 animate-pulse rounded bg-[#e6ece5]" /> :
              statsQuery.isError ? <p className="mt-2 text-sm text-rose-800">Error de lectura</p> :
              <p className="mt-1 font-mono text-3xl text-[#173d39]">{statsQuery.data?.[key as Estado] ?? "—"}</p>}
            {key === "aceptado" && <p className="mt-1 text-xs text-slate-500">Aceptación del proveedor, no entrega</p>}
            {key === "entregado" && <p className="mt-1 text-xs text-slate-500">Solo si existe evidencia</p>}
          </CardContent>
        </Card>)}
      </section>
      <EmailEvidenceSummary evidence={statsQuery.isError ? undefined : statsQuery.data?.evidence} />
      <p className="text-xs text-slate-600">Los procesadores de envío y eventos siguen detenidos. Sin URL pública y evento firmado, el correo conserva la aceptación del proveedor, no una entrega.</p>
      {configQuery.data && !canProcess && <p className="w-fit rounded-full border border-[#cbd7ce] bg-[#eaf0e9] px-3 py-1 text-xs font-semibold text-slate-700">Sólo consulta</p>}
      {statsQuery.isError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><span>No se pudieron consultar las estadísticas. No se muestran valores sustitutos.</span><Button size="sm" variant="outline" onClick={() => void statsQuery.refetch()}>Reintentar</Button></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,.7fr)]">
        <Card className="border-[#dfe6df] bg-[#fbfcfa] shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">Trazabilidad</p><CardTitle className="mt-1 text-xl">Lotes recientes</CardTitle></div>
            <Badge variant="outline" className="border-stone-300 bg-stone-100 text-slate-700">Solo EMAIL</Badge>
          </CardHeader>
          <CardContent>
            {historyQuery.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-lg bg-[#e9eee8]" />)}</div> :
              historyQuery.isError ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">No se pudo cargar el historial. <Button variant="link" onClick={() => void historyQuery.refetch()} className="h-auto p-0 text-rose-900">Reintentar</Button></div> :
              historyQuery.data?.length ? <div className="space-y-2">{historyQuery.data.map(batch => <div key={batch.id} className={`flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center ${selectedBatch === batch.id ? "border-teal-500 bg-teal-50/60" : "border-[#e1e7e0] bg-white"}`}>
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm font-semibold">Lote #{batch.id}</p>
                  <p className="mt-1 text-xs text-slate-600">{batch.counts.total} destinatarios · {batch.counts.error} errores de envío · {batch.counts.incierto} inciertos</p>
                  <EmailEvidenceSummary compact evidence={batch.counts.evidence} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" disabled={resolving !== null} onClick={() => setSelectedBatch(batch.id)}>Revisar lote</Button>
                  <Button size="sm" variant="outline" disabled={!isConfigured || !canProcess || resolving !== null || checkingResend === batch.id} onClick={() => void startResend(batch.id)}>{checkingResend === batch.id ? "Revisando…" : "Preparar reenvío"}</Button>
                </div>
              </div>)}</div> :
              <div className="rounded-xl border border-dashed border-[#cbd7ce] bg-[#f6f8f4] px-5 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e5ede5] text-teal-900"><Mail className="h-5 w-5" /></div>
                <h3 className="mt-4 font-semibold">Aún no hay lotes registrados</h3><p className="mt-1 text-sm text-slate-600">Cuando se confirme una vista previa, el lote quedará disponible para revisión.</p>
              </div>}
          </CardContent>
        </Card>
        <Card className="border-[#dfe6df] bg-[#fbfcfa] shadow-sm">
          <CardHeader><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">Canales</p><CardTitle className="text-xl">Disponibilidad operativa</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-3"><div className="rounded-md bg-white p-2 text-amber-900"><Mail className="h-4 w-4" /></div><div><p className="text-sm font-semibold">Correo electrónico</p><p className="text-xs text-amber-900">Worker desactivado</p></div></div><Badge variant="outline" className="border-amber-300 text-amber-900">No envía</Badge>
            </div>
            {(["SMS", "WhatsApp"] as const).map(label => <div key={label} className="flex items-center justify-between rounded-lg border border-[#e4e8e3] bg-white p-4 opacity-70">
              <div className="flex items-center gap-3"><div className="rounded-md bg-[#f1f3ef] p-2 text-slate-500"><Smartphone className="h-4 w-4" /></div><div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-slate-500">No disponible por ahora</p></div></div><Badge variant="secondary">Deshabilitado</Badge>
            </div>)}
            <p className="border-t border-[#e2e8e0] pt-3 text-xs leading-5 text-slate-500">Las estadísticas de arriba son conteos actuales del endpoint de correo; no son una tabla histórica ni una tasa de entrega.</p>
          </CardContent>
        </Card>
      </div>
      {selectedBatch && <div className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-display text-xl font-semibold text-[#173d39]">Revisión de lote</h2><Button variant="ghost" size="sm" disabled={resolving !== null} onClick={() => { setSelectedBatch(null); setActiveBatchId(null); }}>Cerrar</Button></div>
        {batchQuery.isLoading ? <div className="h-44 animate-pulse rounded-xl bg-[#e5ebe4]" /> :
          batchQuery.isError ? <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><span>No se pudo cargar el detalle del lote.</span><Button size="sm" variant="outline" onClick={() => void retryBatch.mutate(selectedBatch)}>Reintentar</Button></div> :
          batchQuery.data ? <BatchDetail batch={batchQuery.data} onCloseBatch={id => void closeUncertain(id)} resolving={resolving} canProcess={canProcess} /> : null}
        {activeBatchId === selectedBatch && <p className="flex items-center gap-2 text-xs text-slate-600"><RefreshCw className="h-3 w-3 animate-spin" />Actualizando estados cada 2 segundos mientras hay actividad.</p>}
      </div>}

      <Dialog open={dialogOpen} onOpenChange={open => {
        if (!open && (previewMutation.isPending || confirmMutation.isPending)) return;
        setDialogOpen(open);
        if (!open) { setPreview(null); setPreviewPurpose("normal"); }
      }}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto border-[#d4ded5] bg-[#fbfcfa]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-[#173d39]">{previewPurpose === "resend" ? "Preparar reenvío deliberado" : "Vista previa de correo"}</DialogTitle>
            <DialogDescription>{previewPurpose === "resend" ? `El nuevo intento se vincula al lote ${resendSource}. Debe revisar destinatarios y omisiones antes de crear el lote.` : "Seleccione el alcance. El servidor calcula destinatarios únicos, valida correos y presenta las omisiones antes de cualquier confirmación."}</DialogDescription>
          </DialogHeader>
          {!preview ? <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">Tipo de aviso
                <Select disabled={previewMutation.isPending || confirmMutation.isPending} value={tipo} onValueChange={value => { setTipo(value as Tipo); setSelected([]); }}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <label className="space-y-2 text-sm font-medium">Alcance
                <Select disabled={previewMutation.isPending || confirmMutation.isPending} value={modo} onValueChange={value => setModo(value as "masivo" | "individual")}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="masivo">Masivo · todos los candidatos</SelectItem><SelectItem value="individual">Individual · selección manual</SelectItem></SelectContent>
                </Select>
              </label>
            </div>
            <p className="rounded-lg border border-[#dce5dc] bg-[#f2f6f1] p-3 text-sm text-slate-700">{currentType.detail} El recuento definitivo y la deduplicación vienen del servidor en la vista previa.</p>
            {previewPurpose === "normal" && <div>
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Candidatos</h3><span className="text-xs text-slate-500">{candidatesQuery.isLoading ? "Cargando…" : candidatesQuery.data ? `${candidatesQuery.data.length} registros` : ""}</span></div>
              {candidatesQuery.isLoading ? <div className="h-32 animate-pulse rounded-lg bg-[#e5ebe4]" /> :
                candidatesQuery.isError ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">No se pudieron cargar candidatos. <Button variant="link" className="p-0 text-rose-900" onClick={() => void candidatesQuery.refetch()}>Reintentar</Button></div> :
                candidatesQuery.data?.length ? <div className="max-h-52 space-y-1 overflow-auto rounded-lg border border-[#dfe6df] bg-white p-2">
                  {candidatesQuery.data.map(student => <label key={student.id} className={`flex items-center gap-3 rounded-md px-2 py-2 ${modo === "individual" ? "cursor-pointer hover:bg-[#f3f6f2]" : ""}`}>
                    {modo === "individual" && <Checkbox disabled={previewMutation.isPending || confirmMutation.isPending} checked={selected.includes(student.id)} onCheckedChange={checked => toggleCandidate(student.id, checked === true)} />}
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{student.nombre}</span><span className="block truncate text-xs text-slate-500">{student.email || "Sin correo registrado"}</span></span>
                    {!student.email && <Badge variant="outline" className="border-stone-300 text-stone-600">Sin correo</Badge>}
                  </label>)}
                </div> : <p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-600">No hay candidatos para este tipo.</p>}
            </div>}
            {previewPurpose === "resend" && <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950"><ShieldAlert className="mr-2 inline h-4 w-4" />El servidor debe reevaluar selección y deduplicación. Los destinatarios en estado incierto no deben reintentarse.</div>}
            <div className="rounded-lg border border-[#dce4dc] bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="h-4 w-4" />SMS y WhatsApp</p><p className="mt-1 text-xs text-slate-600">No disponible por ahora. Esta operación solo trabaja con correo electrónico.</p>
            </div>
          </div> : <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {[["Destinatarios únicos", preview.summary.total], ["Válidos", preview.summary.validos], ["Omitidos", preview.summary.omitidos]].map(([label, value]) => <div key={label} className="rounded-lg border border-[#dce4dc] bg-white p-3"><p className="font-mono text-2xl font-semibold text-[#173d39]">{value}</p><p className="text-xs text-slate-600">{label}</p></div>)}
            </div>
            {preview.existingBatchId && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Existe un lote relacionado: <strong className="font-mono">{preview.existingBatchId}</strong>. Revise antes de continuar.</div>}
            <div className="max-h-60 space-y-2 overflow-auto">
              {preview.recipients.map((recipient, index) => <div key={`${recipient.email}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e2e7e1] bg-white p-3">
                <div className="min-w-0"><p className="break-all text-sm font-medium">{recipient.email || "Correo no disponible"}</p>{recipient.motivo && <p className="mt-1 text-xs text-slate-600">Motivo: {recipient.motivo}</p>}</div>
                {recipient.estado === "pendiente" ? <Badge variant="outline" className="border-teal-300 bg-teal-50 text-teal-900"><Check className="mr-1 h-3 w-3" />Válido</Badge> : <Badge variant="outline" className="border-stone-300 bg-stone-100 text-stone-700"><XCircle className="mr-1 h-3 w-3" />Omitido</Badge>}
              </div>)}
              {preview.recipients.length === 0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-600">Vista previa sin destinatarios.</p>}
            </div>
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Confirmación explícita requerida</p>
              <p className="mt-1">La vista previa vence {dateLabel(preview.expiresAt)}. Confirmar registra un lote; el worker está detenido y no se enviará correo. No equivale a aceptación del proveedor ni a entrega.</p>
            </div>
          </div>}
          <DialogFooter className="gap-2 sm:gap-2">
            {preview ? <>
              <Button variant="outline" disabled={confirmMutation.isPending} onClick={() => setPreview(null)}>Volver a revisar</Button>
              <Button className="bg-[#1d5550] hover:bg-[#164540]" disabled={!canProcess || confirmMutation.isPending} onClick={() => canProcess && setConfirmOpen(true)}>
                <ArrowRight className="mr-2 h-4 w-4" />Confirmar creación de lote
              </Button>
            </> : <>
              <Button variant="outline" disabled={previewMutation.isPending || confirmMutation.isPending} onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={preparePreview} disabled={!canProcess || previewMutation.isPending || configQuery.isLoading || !isConfigured || (previewPurpose === "normal" && (candidatesQuery.isLoading || candidatesQuery.isError || !candidatesQuery.data?.length)) || (previewPurpose === "normal" && modo === "individual" && selected.length === 0)}>
                {previewMutation.isPending ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Preparando…</> : <><Users className="mr-2 h-4 w-4" />Preparar vista previa</>}
              </Button>
            </>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmOpen} onOpenChange={open => {
        if (!open && confirmMutation.isPending) return;
        setConfirmOpen(open);
      }}>
        <DialogContent className="max-w-lg border-amber-300 bg-[#fbfcfa]">
          <DialogHeader><DialogTitle className="font-display text-xl">¿Registrar este lote?</DialogTitle><DialogDescription>Confirmación final para {preview?.summary.validos ?? 0} direcciones válidas. El sistema registrará la operación, pero el correo no se enviará mientras el worker permanezca detenido.</DialogDescription></DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><Clock3 className="mr-2 inline h-4 w-4" />Aún no existe evidencia de aceptación ni entrega.</div>
          <DialogFooter><Button variant="outline" disabled={confirmMutation.isPending} onClick={() => setConfirmOpen(false)}>Seguir revisando</Button><Button disabled={!canProcess || confirmMutation.isPending || !preview} className="bg-[#1d5550] hover:bg-[#164540]" onClick={() => preview && canProcess && confirmMutation.mutate(preview.intentId)}>{confirmMutation.isPending ? "Registrando…" : "Sí, registrar lote"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </main>;
}

export default function Notificaciones() {
  const [fingerprint, setFingerprint] = useState(tokenFingerprint);
  useEffect(() => {
    const update = () => setFingerprint(tokenFingerprint());
    window.addEventListener("storage", update);
    window.addEventListener("auth:invalid-session", update);
    const sync = window.setInterval(update, 1000);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("auth:invalid-session", update);
      window.clearInterval(sync);
    };
  }, []);
  return <div key={fingerprint}><NotificacionesContent /></div>;
}
