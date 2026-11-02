import { useState, useEffect, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { GUARDIAN_SESSION_MESSAGE } from "@/lib/guardian-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function GuardianLogin() {
  const { guardianLogin, guardian } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(() => sessionStorage.getItem(GUARDIAN_SESSION_MESSAGE) ?? "");
  useEffect(() => { if (guardian) setLocation("/"); }, [guardian, setLocation]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await guardianLogin(email, password);
      sessionStorage.removeItem(GUARDIAN_SESSION_MESSAGE);
      setLocation("/");
    } catch {
      setMessage("No pudimos iniciar sesión. Revisa tu correo y contraseña o comunícate con la escuela.");
    } finally { setPending(false); }
  }
  return <main className="min-h-screen flex items-center justify-center p-4">
    <Card className="w-full max-w-md">
      <CardHeader><h1 className="text-2xl font-semibold leading-none tracking-tight">Acceso de padres</h1></CardHeader>
      <CardContent>
        <p className="mb-4">Ingresa para consultar tus pendientes y pagos.</p>
        {message && <p role="alert" className="mb-4">{message}</p>}
        <form onSubmit={submit} className="space-y-4">
          <div><Label htmlFor="guardian-email">Correo electrónico</Label>
            <Input id="guardian-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div><Label htmlFor="guardian-password">Contraseña</Label>
            <Input id="guardian-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <Button className="w-full" type="submit" disabled={pending}>{pending ? "Ingresando…" : "Ingresar al portal de padres"}</Button>
        </form>
      </CardContent>
    </Card>
  </main>;
}
