import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// Sólo columnas existentes de guardians. No se capturan credenciales ni datos
// fiscales de una entidad distinta al tutor en esta operación.
const fields = [
  ["nombres", "Nombres", true], ["apellido_paterno", "Primer apellido", true],
  ["apellido_materno", "Segundo apellido"], ["curp", "CURP"], ["rfc", "RFC persona física"],
  ["correo_institucional_familiar", "Correo", true], ["celular", "Celular", true],
  ["telefono_casa_oficina", "Teléfono de casa u oficina"],
  ["calle", "Calle"], ["numero_exterior", "Número exterior"], ["numero_interior", "Número interior"],
  ["colonia", "Colonia"], ["codigo_postal", "Código postal"], ["municipio", "Municipio"],
  ["estado", "Estado"], ["contacto_emergencia_nombre", "Contacto de emergencia"],
  ["contacto_emergencia_telefono", "Teléfono de emergencia"],
  ["contacto_emergencia_relacion", "Relación del contacto"],
] as const;
const blankTutor = () => Object.fromEntries([
  ...fields.map(([key]) => [key, ""]), ["tipo_guardian", "otro"],
]);

async function writeFamily(path: string, method: string, body: unknown) {
  const response = await fetch(path, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `No se pudo guardar (${response.status})`);
  return data;
}

export function FamilyEditor({ family, onSaved, onClose }: {
  family: any | null; onSaved: () => Promise<void>; onClose: () => void;
}) {
  const { toast } = useToast();
  const [nombre, setNombre] = useState(family?.nombre || "");
  const [studentIds, setStudentIds] = useState("");
  const [tutores, setTutores] = useState<any[]>(family?.tutores?.map((t: any) => ({
    ...blankTutor(), ...t, guardian_id: t.id,
    tipo_guardian: ["padre", "madre", "otro"].includes(t.tipo_guardian) ? t.tipo_guardian : "otro",
    correo_institucional_familiar: t.correo_institucional_familiar || t.email || "",
  })) || [blankTutor()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const payload: any = {
        nombre, tutores: tutores.map((t, index) => ({
          ...t,
          es_responsable_pago: family ? Boolean(t.es_responsable_pago) : index === 0,
          porcentaje_responsabilidad: family ? t.porcentaje_responsabilidad : index === 0 ? 100 : 0,
        })),
      };
      if (!family) payload.student_ids = studentIds.split(",").map(id => Number(id.trim()));
      await writeFamily(family ? `/api/admin/families/${family.id}` : "/api/admin/families", family ? "PATCH" : "POST", payload);
      await onSaved();
      toast({ title: family ? "Familia actualizada" : "Familia creada", description: "Guardado confirmado por el servidor." });
      onClose();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="family-editor-description">
      <DialogHeader><DialogTitle>{family ? `Editar ${family.numero_familia}` : "Agregar familia"}</DialogTitle></DialogHeader>
      <p id="family-editor-description" className="text-sm text-slate-600">
        El número de familia lo asigna el servidor. Puede haber un solo tutor, sin obligación de que sea el padre.
      </p>
      <form onSubmit={submit} className="space-y-5">
        <Label htmlFor="family-name">Nombre de la familia</Label>
        <Input id="family-name" required value={nombre} onChange={e => setNombre(e.target.value)} />
        {!family && <div><Label htmlFor="family-students">IDs de alumnos vinculados</Label>
          <Input id="family-students" required value={studentIds} onChange={e => setStudentIds(e.target.value)} placeholder="IDs separados por coma" />
          <p className="text-sm text-slate-500">Al menos un alumno de tu campus que todavía no pertenezca a otra familia.</p>
        </div>}
        {tutores.map((tutor, index) => <fieldset key={tutor.guardian_id || index} className="border rounded-lg p-4 space-y-3">
          <legend className="font-semibold">Tutor {index + 1}{!family && index === 0 ? " · responsable principal" : ""}</legend>
          <Label htmlFor={`family-tutor-${index}-tipo`}>Tipo de tutor</Label>
          <select id={`family-tutor-${index}-tipo`} value={tutor.tipo_guardian} className="block border rounded p-2 w-full"
            onChange={e => setTutores(list => list.map((t, i) => i === index ? { ...t, tipo_guardian: e.target.value } : t))}>
            <option value="padre">Padre</option><option value="madre">Madre</option><option value="otro">Otro</option>
          </select>
          <div className="grid md:grid-cols-2 gap-3">{fields.map(([key, label, required]) => <div key={key}>
            <Label htmlFor={`family-tutor-${index}-${key}`}>{label}{required ? " *" : ""}</Label>
            <Input id={`family-tutor-${index}-${key}`} required={Boolean(required)}
              type={key === "correo_institucional_familiar" ? "email" : "text"}
              value={tutor[key] || ""} onChange={e => setTutores(list => list.map((t, i) => i === index ? { ...t, [key]: e.target.value } : t))} />
          </div>)}</div>
          {!family && index > 0 && <Button type="button" variant="outline" onClick={() => setTutores(list => list.filter((_, i) => i !== index))}>Quitar tutor sin guardar</Button>}
        </fieldset>)}
        {!family && <Button type="button" variant="outline" onClick={() => setTutores(list => [...list, blankTutor()])}>Agregar otro tutor</Button>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : family ? "Guardar cambios" : "Guardar familia"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function FamilyArchiveDialog({ family, onSaved, onClose }: {
  family: any; onSaved: () => Promise<void>; onClose: () => void;
}) {
  const { toast } = useToast();
  const [motivo, setMotivo] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function archive() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await writeFamily(`/api/admin/families/${family.id}/status`, "PATCH", {
        status: "archivada", motivo, confirmacion: true, confirmacion_final: true,
      });
      await onSaved();
      toast({ title: "Familia archivada", description: "Los expedientes y su historial se conservaron." });
      onClose();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent aria-describedby="family-archive-description"><DialogHeader>
      <DialogTitle>{confirmed ? "Confirmación final de archivado" : `Archivar ${family.numero_familia}`}</DialogTitle>
    </DialogHeader>
      <p id="family-archive-description">No se elimina ningún expediente. Se revocará el acceso de tutores que no tengan otra familia activa. No se puede archivar con saldo pendiente.</p>
      <Label htmlFor="family-archive-reason">Motivo obligatorio</Label>
      <Input id="family-archive-reason" value={motivo} disabled={confirmed} onChange={e => setMotivo(e.target.value)} />
      {confirmed && <p>¿Confirmas archivar a {family.nombre} por el motivo indicado?</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
      <Button disabled={!motivo.trim() || saving} onClick={() => confirmed ? archive() : setConfirmed(true)}>
        {saving ? "Archivando…" : confirmed ? "Confirmar archivado" : "Continuar con archivado"}
      </Button>
    </DialogContent>
  </Dialog>;
}
