export function ModuleLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="module-loading-shell"
      role="status"
    >
      <div className="module-loading-content">
        <span aria-hidden="true" className="module-loading-spinner" />
        <p className="module-loading-label">Carregando dados</p>
      </div>
    </div>
  );
}
