export default function UnavailableFeature() {
  return (
    <section role="status" aria-label="Función no disponible" className="rounded-lg border bg-white p-6">
      <p className="font-medium">No disponible por ahora</p>
      <button type="button" disabled className="mt-3 rounded border px-3 py-2 opacity-60">
        No disponible por ahora
      </button>
    </section>
  );
}
