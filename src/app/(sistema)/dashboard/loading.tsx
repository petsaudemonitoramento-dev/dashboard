export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="module-placeholder"
      role="status"
    >
      <strong>Carregando…</strong>
    </div>
  );
}
