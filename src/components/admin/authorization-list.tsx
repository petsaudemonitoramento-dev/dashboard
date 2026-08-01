"use client";

import {
  CheckCheck,
  LoaderCircle,
  ShieldCheck,
  UserCheck,
  UserX,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { profileLabel } from "@/lib/auth/roles";
import styles from "./authorization-list.module.css";

export type AuthorizationRow = {
  id: string;
  nomeCompleto: string;
  email: string;
  perfilSolicitado: string;
  ubsSolicitadaId: string | null;
  ubsSolicitadaNome: string | null;
  solicitadoEm: string;
  origemCadastro: string;
};

export type AuthorizationUbs = {
  id: string;
  nome: string;
};

export type AuthorizationMicroarea = {
  id: string;
  ubsId: string;
  codigo: string;
  nome: string | null;
};

type Draft = {
  perfil: string;
  ubsId: string;
  microareaId: string;
};

export function AuthorizationList({
  rows,
  ubsOptions,
  microareas,
}: {
  rows: AuthorizationRow[];
  ubsOptions: AuthorizationUbs[];
  microareas: AuthorizationMicroarea[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function initialDraft(row: AuthorizationRow): Draft {
    const ubsId =
      row.ubsSolicitadaId ??
      ubsOptions[0]?.id ??
      "";

    const firstMicroarea =
      microareas.find((item) => item.ubsId === ubsId)?.id ?? "";

    return {
      perfil: row.perfilSolicitado || "aluno",
      ubsId,
      microareaId: firstMicroarea,
    };
  }

  function draftFor(row: AuthorizationRow): Draft {
    return drafts[row.id] ?? initialDraft(row);
  }

  function updateDraft(row: AuthorizationRow, patch: Partial<Draft>) {
    const current = draftFor(row);
    const next = { ...current, ...patch };

    if (patch.ubsId) {
      next.microareaId =
        microareas.find((item) => item.ubsId === patch.ubsId)?.id ?? "";
    }

    setDrafts((value) => ({
      ...value,
      [row.id]: next,
    }));
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === rows.length
        ? new Set()
        : new Set(rows.map((row) => row.id))
    );
  }

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.has(row.id)),
    [rows, selected]
  );

  async function send(
    action: "approve" | "reject",
    targetRows = selectedRows
  ) {
    if (targetRows.length === 0) {
      setMessage("Selecione pelo menos uma solicitação.");
      return;
    }

    if (
      action === "approve" &&
      targetRows.some((row) => row.perfilSolicitado === "equipe_ubs")
    ) {
      setMessage(
        "A equipe UBS só pode ser aprovada depois da validação de CRM ou COREN."
      );
      return;
    }

    if (
      action === "reject" &&
      !window.confirm(
        `Rejeitar ${targetRows.length} solicitação(ões) selecionada(s)?`
      )
    ) {
      return;
    }

    setWorking(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/autorizacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          items: targetRows.map((row) => ({
            targetId: row.id,
            ...draftFor(row),
          })),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ?? "Não foi possível processar as solicitações."
        );
      }

      setMessage(
        action === "approve"
          ? `${body.processed} cadastro(s) autorizado(s).`
          : `${body.processed} solicitação(ões) rejeitada(s).`
      );
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível processar as solicitações."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div>
          <span className={styles.headerIcon}>
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2>Cadastros aguardando autorização</h2>
            <p>
              Revise perfil, UBS e microárea antes de liberar o acesso.
            </p>
          </div>
        </div>

        <span className={styles.counter}>
          {rows.length} pendente{rows.length === 1 ? "" : "s"}
        </span>
      </header>

      {rows.length > 0 && (
        <div className={styles.bulkBar}>
          <label>
            <input
              checked={selected.size === rows.length}
              onChange={toggleAll}
              type="checkbox"
            />
            Selecionar todos
          </label>

          <span>{selected.size} selecionado(s)</span>

          <div>
            <button
              className={styles.approve}
              disabled={working || selected.size === 0}
              onClick={() => void send("approve")}
              type="button"
            >
              {working ? (
                <LoaderCircle className={styles.spin} size={17} />
              ) : (
                <CheckCheck size={17} />
              )}
              Autorizar selecionados
            </button>

            <button
              className={styles.reject}
              disabled={working || selected.size === 0}
              onClick={() => void send("reject")}
              type="button"
            >
              <UserX size={17} />
              Rejeitar
            </button>
          </div>
        </div>
      )}

      {message && <div className={styles.message}>{message}</div>}

      <div className={styles.list}>
        {rows.map((row) => {
          const draft = draftFor(row);
          const availableMicroareas = microareas.filter(
            (item) => item.ubsId === draft.ubsId
          );

          return (
            <article
              className={
                selected.has(row.id)
                  ? `${styles.item} ${styles.itemSelected}`
                  : styles.item
              }
              key={row.id}
            >
              <label className={styles.checkbox}>
                <input
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  type="checkbox"
                />
                <span />
              </label>

              <div className={styles.identity}>
                <span className={styles.avatar}>
                  <UsersRound size={20} />
                </span>
                <div>
                  <strong>{row.nomeCompleto}</strong>
                  <small>{row.email}</small>
                  <small>{row.origemCadastro}</small>
                </div>
              </div>

              <div className={styles.fields}>
                <label>
                  Perfil
                  <strong>{profileLabel(row.perfilSolicitado)}</strong>
                </label>

                <label>
                  UBS
                  <select
                    onChange={(event) =>
                      updateDraft(row, { ubsId: event.target.value })
                    }
                    value={draft.ubsId}
                  >
                    {ubsOptions.map((ubs) => (
                      <option key={ubs.id} value={ubs.id}>
                        {ubs.nome}
                      </option>
                    ))}
                  </select>
                </label>

                {draft.perfil === "acs" && (
                  <label>
                    Microárea da ACS
                    <select
                      onChange={(event) =>
                        updateDraft(row, {
                          microareaId: event.target.value,
                        })
                      }
                      required
                      value={draft.microareaId}
                    >
                      <option disabled value="">
                        Selecione
                      </option>
                      {availableMicroareas.map((microarea) => (
                        <option key={microarea.id} value={microarea.id}>
                          {microarea.codigo}
                          {microarea.nome
                            ? ` — ${microarea.nome}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className={styles.itemActions}>
                <button
                  className={styles.approve}
                  disabled={working}
                  onClick={() => void send("approve", [row])}
                  type="button"
                >
                  <UserCheck size={16} />
                  Autorizar
                </button>
                <button
                  className={styles.reject}
                  disabled={working}
                  onClick={() => void send("reject", [row])}
                  type="button"
                >
                  <UserX size={16} />
                </button>
              </div>
            </article>
          );
        })}

        {rows.length === 0 && (
          <div className={styles.empty}>
            <UserCheck size={34} />
            <strong>Nenhuma solicitação pendente</strong>
            <span>Novos cadastros aparecerão aqui para revisão.</span>
          </div>
        )}
      </div>
    </section>
  );
}
