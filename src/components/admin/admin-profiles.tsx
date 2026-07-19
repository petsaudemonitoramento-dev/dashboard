"use client";

import {
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type AdminProfileRow = {
  id: string;
  nomeCompleto: string;
  email: string;
  dataNascimento: string | null;
  perfilAtual: string;
  perfilSolicitado: string | null;
  aprovacaoStatus: string;
  ativo: boolean;
  ubsId: string | null;
  ubsNome: string | null;
  ubsSolicitadaId: string | null;
  ubsSolicitadaNome: string | null;
  origemCadastro: string;
  solicitadoEm: string;
  perfilExcluidoEm: string | null;
};

type UbsOption = {
  id: string;
  nome: string;
};

const PROFILE_LABELS: Record<string, string> = {
  administrador: "Gestão",
  profissional_ubs: "Profissional UBS",
  equipe_ubs: "Equipe UBS",
  acs: "ACS",
  aluno: "Aluno",
};

function formatDate(value: string | null): string {
  if (!value) return "Não informada";

  return new Intl.DateTimeFormat("pt-BR").format(
    new Date(`${value.slice(0, 10)}T12:00:00`)
  );
}

function statusClass(status: string): string {
  if (status === "aprovado") return "v20-badge v20-badge-approved";
  if (status === "pendente") return "v20-badge v20-badge-pending";
  return "v20-badge v20-badge-disabled";
}

export function AdminProfiles({
  currentUserId,
  profiles,
  ubsOptions,
}: {
  currentUserId: string;
  profiles: AdminProfileRow[];
  ubsOptions: UbsOption[];
}) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<"todos" | "desativados">("todos");
  const [drafts, setDrafts] = useState<
    Record<string, { perfil: string; ubsId: string }>
  >({});

  const visibleProfiles = useMemo(() => {
    if (filters === "desativados") {
      return profiles.filter(
        (profile) => profile.aprovacaoStatus !== "aprovado"
      );
    }

    return profiles;
  }, [filters, profiles]);

  function draftFor(profile: AdminProfileRow) {
    return (
      drafts[profile.id] ?? {
        perfil:
          profile.perfilSolicitado ??
          profile.perfilAtual ??
          "profissional_ubs",
        ubsId:
          profile.ubsSolicitadaId ??
          profile.ubsId ??
          ubsOptions[0]?.id ??
          "",
      }
    );
  }

  function updateDraft(
    profileId: string,
    patch: Partial<{ perfil: string; ubsId: string }>
  ) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;

    setDrafts((current) => ({
      ...current,
      [profileId]: {
        ...draftFor(profile),
        ...patch,
      },
    }));
  }

  async function act(
    profile: AdminProfileRow,
    action: "approve" | "reject" | "deactivate" | "reactivate"
  ) {
    if (
      action === "deactivate" &&
      profile.id === currentUserId
    ) {
      setMessage("A gestão não pode excluir o próprio acesso.");
      return;
    }

    const draft = draftFor(profile);
    const confirmation =
      action === "deactivate"
        ? window.confirm(
            `Excluir o acesso de ${profile.nomeCompleto}? Os registros de auditoria serão preservados.`
          )
        : action === "reject"
          ? window.confirm(`Rejeitar a solicitação de ${profile.nomeCompleto}?`)
          : true;

    if (!confirmation) return;

    setWorkingId(profile.id);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/perfis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          targetId: profile.id,
          perfil: draft.perfil,
          ubsId: draft.ubsId,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível atualizar o perfil.");
      }

      setMessage("Perfil atualizado com sucesso.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o perfil."
      );
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="v20-admin-page">
      <section className="v20-admin-card">
        <div className="v20-page-heading">
          <div>
            <h2>Perfis e permissões</h2>
            <p>
              Gerencie acessos já aprovados, rejeitados ou desativados.
            </p>
          </div>

          <div className="v20-admin-actions">
            <button
              className={
                filters === "desativados"
                  ? "v20-primary-button"
                  : "v20-secondary-button"
              }
              onClick={() => setFilters("desativados")}
              type="button"
            >
              Desativados
            </button>
            <button
              className={
                filters === "todos"
                  ? "v20-primary-button"
                  : "v20-secondary-button"
              }
              onClick={() => setFilters("todos")}
              type="button"
            >
              Todos
            </button>
          </div>
        </div>

        {message && <div className="v20-message v20-message-success">{message}</div>}

        <div className="v20-admin-table-wrap">
          <table className="v20-admin-table">
            <thead>
              <tr>
                <th>Profissional</th>
                <th>Nascimento</th>
                <th>Solicitação</th>
                <th>UBS</th>
                <th>Situação</th>
                <th>Permissões</th>
              </tr>
            </thead>
            <tbody>
              {visibleProfiles.map((profile) => {
                const draft = draftFor(profile);
                const disabled = workingId === profile.id;

                return (
                  <tr key={profile.id}>
                    <td>
                      <strong>{profile.nomeCompleto}</strong>
                      <br />
                      <small>{profile.email}</small>
                    </td>
                    <td>{formatDate(profile.dataNascimento)}</td>
                    <td>
                      {PROFILE_LABELS[profile.perfilSolicitado ?? ""] ??
                        profile.perfilSolicitado ??
                        PROFILE_LABELS[profile.perfilAtual] ??
                        profile.perfilAtual}
                      <br />
                      <small>{profile.origemCadastro}</small>
                    </td>
                    <td>
                      {profile.ubsSolicitadaNome ??
                        profile.ubsNome ??
                        "Não informada"}
                    </td>
                    <td>
                      <span className={statusClass(profile.aprovacaoStatus)}>
                        {profile.aprovacaoStatus}
                      </span>
                    </td>
                    <td>
                      {profile.aprovacaoStatus === "pendente" ? (
                        <div className="v20-admin-actions">
                          <select
                            className="v20-admin-select"
                            onChange={(event) =>
                              updateDraft(profile.id, {
                                perfil: event.target.value,
                              })
                            }
                            value={draft.perfil}
                          >
                            <option value="administrador">Gestão</option>
                            <option value="profissional_ubs">
                              Profissional UBS
                            </option>
                            <option value="acs">ACS</option>
                            <option value="aluno">Aluno</option>
                          </select>

                          <select
                            className="v20-admin-select"
                            onChange={(event) =>
                              updateDraft(profile.id, {
                                ubsId: event.target.value,
                              })
                            }
                            value={draft.ubsId}
                          >
                            {ubsOptions.map((ubs) => (
                              <option key={ubs.id} value={ubs.id}>
                                {ubs.nome}
                              </option>
                            ))}
                          </select>

                          <button
                            className="v20-success-button"
                            disabled={disabled}
                            onClick={() => void act(profile, "approve")}
                            type="button"
                          >
                            <UserCheck size={15} />
                            Aprovar
                          </button>

                          <button
                            className="v20-danger-button"
                            disabled={disabled}
                            onClick={() => void act(profile, "reject")}
                            type="button"
                          >
                            <UserX size={15} />
                            Rejeitar
                          </button>
                        </div>
                      ) : profile.aprovacaoStatus === "aprovado" ? (
                        <div className="v20-admin-actions">
                          <span className="v20-badge v20-badge-approved">
                            <ShieldCheck size={13} />
                            {PROFILE_LABELS[profile.perfilAtual] ??
                              profile.perfilAtual}
                          </span>
                          <button
                            className="v20-danger-button"
                            disabled={disabled || profile.id === currentUserId}
                            onClick={() => void act(profile, "deactivate")}
                            type="button"
                          >
                            <Trash2 size={15} />
                            Excluir acesso
                          </button>
                        </div>
                      ) : (
                        <button
                          className="v20-secondary-button"
                          disabled={disabled}
                          onClick={() => void act(profile, "reactivate")}
                          type="button"
                        >
                          <RotateCcw size={15} />
                          Reativar para análise
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {visibleProfiles.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: "center" }}>
                    <CheckCircle2 size={22} />
                    <br />
                    Nenhum perfil nesta situação.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
