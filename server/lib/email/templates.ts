import type { EmailContent, EmailTipo } from "./types";
export const TEMPLATE_VERSION = "correo-a-1";
export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
const templates: Record<EmailTipo, { subject: string; body: string }> = {
  RECORDATORIO_VENCIMIENTO: {
    subject: "Recordatorio de próximo vencimiento",
    body: "Le recordamos que existen cargos próximos a vencer. Consulte su estado de cuenta por los canales habituales de su institución.",
  },
  AVISO_MORA: {
    subject: "Aviso de cargos vencidos",
    body: "Hay cargos vencidos asociados a su responsabilidad de pago. Contacte al área administrativa para revisar su estado de cuenta.",
  },
  CARGO_EMITIDO: {
    subject: "Aviso de cargos pendientes",
    body: "Tiene cargos pendientes de revisión. Puede consultar el detalle con el área administrativa de su institución.",
  },
};
// Deliberately no names, financial identifiers, tokens, free-form data or payment URLs.
export function renderEmail(tipo: EmailTipo): EmailContent {
  const { subject, body } = templates[tipo];
  return { subject, text: `${body}\n\nGracias por su atención.`, html: `<p>${escapeEmailHtml(body)}</p><p>Gracias por su atención.</p>` };
}
