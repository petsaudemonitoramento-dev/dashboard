"use client";

import {
  AlertTriangle,
  CalendarClock,
  RotateCcw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./trash-bin.module.css";

export type TrashItem = {
  id: string;
  codigo: string;
  nomeVisual: string;
  ubsNome: string;
  microarea: string | null;
  excluidaEm: string;
  excluirEm: string;
  motivo: string | null;
};

type Action = "restore" | "delete";

type DialogState = {
  action: Action;
  item: TrashItem;
} | null;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function remainingLabel(value: string): string {
  const milliseconds = new Date(value).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(milliseconds / 86_400_000));

  if (days === 0) return "Exclusão definitiva pendente";
  if (days === 1) return "1 dia restante";
  return `${days} dias restantes`;
}

export function TrashBin({ items }: { items: TrashItem[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          new Date(a.excluirEm).getTime() - new Date(b.excluirEm).getTime()
      ),
    [items]
  );

  function openDialog(action: Action, item: TrashItem) {
    setDialog({ action, item });
    setConfirmed(false);
    setError(null);
  }

  function closeDialog() {
    if (submitting) return;
    setDialog(null);
    setConfirmed(false);
    setError(null);
  }

  async function submit() {
    if (!dialog) return;
    if (dialog.action === "delete" && !confirmed) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/gestantes/lixeira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:
            dialog.action === "restore"
              ? "restore"
              : "delete_permanently",
          gestanteId: dialog.item.id,
          confirmed: dialog.action === "delete" ? confirmed : undefined,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível concluir a operação.");
      }

      closeDialog();
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível concluir a operação."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (orderedItems.length === 0) {
    return (
      <section className={styles.emptyState}>
        <Trash2 size={34} />
        <strong>A lixeira está vazia</strong>
        <span>Nenhuma gestante aguarda exclusão definitiva.</span>
      </section>
    );
  }

  return (
    <>
      <div className={styles.summary}>
        <Trash2 size={19} />
        <p>
          <strong>{orderedItems.length}</strong>{" "}
          {orderedItems.length === 1 ? "gestante" : "gestantes"} na lixeira.
          Esses registros não contam nos indicadores.
        </p>
      </div>

      <section className={styles.grid}>
        {orderedItems.map((item) => (
          <article className={styles.card} key={item.id}>
            <header>
              <span className={styles.avatar}>
                <UserRound size={21} />
              </span>
              <div>
                <h2>{item.nomeVisual}</h2>
                <small>{item.codigo}</small>
              </div>
            </header>

            <dl>
              <div>
                <dt>UBS</dt>
                <dd>{item.ubsNome}</dd>
              </div>
              <div>
                <dt>Microárea</dt>
                <dd>{item.microarea ?? "Não informada"}</dd>
              </div>
              <div>
                <dt>Enviada para lixeira</dt>
                <dd>{formatDateTime(item.excluidaEm)}</dd>
              </div>
              <div>
                <dt>Exclusão definitiva prevista</dt>
                <dd>{formatDateTime(item.excluirEm)}</dd>
              </div>
            </dl>

            <div className={styles.deadline}>
              <CalendarClock size={17} />
              <strong>{remainingLabel(item.excluirEm)}</strong>
            </div>

            <footer>
              <button
                className={styles.restoreButton}
                onClick={() => openDialog("restore", item)}
                type="button"
              >
                <RotateCcw size={16} /> Restaurar
              </button>
              <button
                className={styles.deleteButton}
                onClick={() => openDialog("delete", item)}
                type="button"
              >
                <Trash2 size={16} /> Excluir definitivamente
              </button>
            </footer>
          </article>
        ))}
      </section>

      {dialog && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="trash-action-title"
            aria-modal="true"
            className={styles.modalCard}
            role="dialog"
          >
            <button
              aria-label="Fechar"
              className={styles.modalClose}
              disabled={submitting}
              onClick={closeDialog}
              type="button"
            >
              <X size={18} />
            </button>

            <div
              className={
                dialog.action === "delete"
                  ? styles.dangerIcon
                  : styles.restoreIcon
              }
            >
              {dialog.action === "delete" ? (
                <AlertTriangle size={24} />
              ) : (
                <RotateCcw size={24} />
              )}
            </div>

            <h2 id="trash-action-title">
              {dialog.action === "delete"
                ? "Excluir definitivamente?"
                : "Restaurar gestante?"}
            </h2>

            {dialog.action === "delete" ? (
              <>
                <p>
                  Esta ação apagará o cadastro clínico, exames, vacinas,
                  consultas, classificações e identificação da gestante.
                  Não será possível recuperar esses dados.
                </p>
                <label className={styles.confirmCheck}>
                  <input
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    Compreendo que a exclusão é definitiva e que os dados
                    clínicos não poderão ser recuperados.
                  </span>
                </label>
              </>
            ) : (
              <p>
                <strong>{dialog.item.nomeVisual}</strong> voltará para a lista
                de gestantes ativas e voltará a contar nos indicadores.
              </p>
            )}

            {error && <div className={styles.errorBox}>{error}</div>}

            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                disabled={submitting}
                onClick={closeDialog}
                type="button"
              >
                Cancelar
              </button>
              <button
                className={
                  dialog.action === "delete"
                    ? styles.confirmDelete
                    : styles.confirmRestore
                }
                disabled={
                  submitting ||
                  (dialog.action === "delete" && !confirmed)
                }
                onClick={submit}
                type="button"
              >
                {dialog.action === "delete" ? (
                  <Trash2 size={17} />
                ) : (
                  <RotateCcw size={17} />
                )}
                {submitting
                  ? "Processando..."
                  : dialog.action === "delete"
                    ? "Excluir definitivamente"
                    : "Restaurar gestante"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
