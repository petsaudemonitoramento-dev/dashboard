"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Filter,
  History,
  LoaderCircle,
  MapPin,
  MessageSquarePlus,
  Search,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  TeamPendingItem,
  TeamVisitsData,
  VisitHistoryItem,
} from "./types";
import styles from "./team-visits-dashboard.module.css";

type Tab = "pendencias" | "historico" | "acompanhamentos";

function formatDate(value: string | null): string {
  if (!value) return "Nunca";

  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

function matchesSearch(
  item: Pick<TeamPendingItem, "nome" | "codigo">,
  query: string
): boolean {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  return (
    !normalized ||
    item.nome.toLocaleLowerCase("pt-BR").includes(normalized) ||
    item.codigo.toLocaleLowerCase("pt-BR").includes(normalized)
  );
}

export function TeamVisitsDashboard({ data }: { data: TeamVisitsData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pendencias");
  const [search, setSearch] = useState("");
  const [microarea, setMicroarea] = useState("all");
  const [acs, setAcs] = useState("all");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("30");
  const [selected, setSelected] = useState<{
    gestanteId: string;
    gestanteNome: string;
    visitaId: string | null;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  const pending = useMemo(
    () =>
      data.pendencias.filter(
        (item) =>
          matchesSearch(item, search) &&
          (microarea === "all" || item.microareaId === microarea) &&
          (status === "all" ||
            (status === "pending" && item.semVisita30d) ||
            (status === "risk" && item.altoRisco) ||
            (status === "alert" && item.ultimoAlerta))
      ),
    [data.pendencias, microarea, search, status]
  );

  const history = useMemo(() => {
    const now = new Date();

    return data.historico.filter((item) => {
      const date = new Date(`${item.dataAcao.slice(0, 10)}T12:00:00`);
      const age = Math.floor((now.getTime() - date.getTime()) / 86400000);

      if (period !== "all" && age > Number(period)) return false;
      if (microarea !== "all" && item.microareaId !== microarea) return false;
      if (acs !== "all" && item.acsId !== acs) return false;
      if (
        !matchesSearch(
          { nome: item.gestanteNome, codigo: item.gestanteCodigo },
          search
        )
      ) {
        return false;
      }

      if (status === "visit" && !item.compareceu) return false;
      if (status === "not_found" && item.compareceu) return false;
      if (status === "alert" && !item.sinaisAlerta) return false;

      return true;
    });
  }, [acs, data.historico, microarea, period, search, status]);

  async function registerFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    setSubmitting(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/equipe/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gestanteId: selected.gestanteId,
          visitaId: selected.visitaId,
          tipo: String(form.get("tipo") ?? "acompanhamento"),
          observacao: String(form.get("observacao") ?? ""),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ?? "Não foi possível registrar o acompanhamento."
        );
      }

      setSelected(null);
      setMessage("Acompanhamento da equipe registrado sem alterar a visita do ACS.");
      startRefresh(() => router.refresh());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o acompanhamento."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openFromHistory(item: VisitHistoryItem) {
    setSelected({
      gestanteId: item.gestanteId,
      gestanteNome: item.gestanteNome,
      visitaId: item.id,
    });
  }

  const metrics = [
    {
      label: "Gestantes ativas",
      value: data.metricas.gestantesAtivas,
      icon: UsersRound,
    },
    {
      label: "Visitadas em 30 dias",
      value: data.metricas.visitadas30Dias,
      icon: CheckCircle2,
    },
    {
      label: "Pendentes há 30 dias",
      value: data.metricas.pendentes30Dias,
      icon: Clock3,
    },
    {
      label: "Não encontradas",
      value: data.metricas.naoEncontradas30Dias,
      icon: UserRoundX,
    },
    {
      label: "Com sinal de alerta",
      value: data.metricas.sinaisAlerta30Dias,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.heading}>
        <div>
          <span>Acompanhamento da unidade</span>
          <h1>Visitas</h1>
          <p>{data.ubsNome} · visão restrita à própria UBS</p>
        </div>

        <button
          onClick={() => startRefresh(() => router.refresh())}
          type="button"
        >
          {refreshing ? (
            <LoaderCircle className={styles.spin} size={17} />
          ) : (
            <ClipboardCheck size={17} />
          )}
          Atualizar
        </button>
      </section>

      <section className={styles.metrics}>
        {metrics.map(({ label, value, icon: Icon }) => (
          <article key={label}>
            <span>
              <Icon size={20} />
            </span>
            <strong>{value}</strong>
            <small>{label}</small>
          </article>
        ))}
      </section>

      <section className={styles.tabs}>
        <button
          className={tab === "pendencias" ? styles.activeTab : ""}
          onClick={() => setTab("pendencias")}
          type="button"
        >
          <Clock3 size={16} />
          Pendências
        </button>
        <button
          className={tab === "historico" ? styles.activeTab : ""}
          onClick={() => setTab("historico")}
          type="button"
        >
          <History size={16} />
          Histórico
        </button>
        <button
          className={tab === "acompanhamentos" ? styles.activeTab : ""}
          onClick={() => setTab("acompanhamentos")}
          type="button"
        >
          <FileCheck2 size={16} />
          Acompanhamentos da equipe
        </button>
      </section>

      <section className={styles.filters}>
        <label className={styles.search}>
          <Search size={16} />
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar gestante por nome ou código"
            value={search}
          />
        </label>

        <label>
          <Filter size={15} />
          <select
            aria-label="Filtrar por microárea"
            onChange={(event) => setMicroarea(event.target.value)}
            value={microarea}
          >
            <option value="all">Todas as microáreas</option>
            {data.microareas.map((item) => (
              <option key={item.id} value={item.id}>
                Microárea {item.codigo}
              </option>
            ))}
          </select>
        </label>

        {tab === "historico" && (
          <>
            <label>
              <select
                aria-label="Filtrar por ACS"
                onChange={(event) => setAcs(event.target.value)}
                value={acs}
              >
                <option value="all">Todos os ACS</option>
                {data.agentes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <select
                aria-label="Filtrar por período"
                onChange={(event) => setPeriod(event.target.value)}
                value={period}
              >
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="all">Todo o histórico</option>
              </select>
            </label>
          </>
        )}

        <label>
          <select
            aria-label="Filtrar por situação"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="all">Todas as situações</option>
            {tab === "pendencias" ? (
              <>
                <option value="pending">Sem visita há 30 dias</option>
                <option value="risk">Alto risco</option>
                <option value="alert">Última visita com alerta</option>
              </>
            ) : (
              <>
                <option value="visit">Visitas realizadas</option>
                <option value="not_found">Não encontradas</option>
                <option value="alert">Com sinal de alerta</option>
              </>
            )}
          </select>
        </label>
      </section>

      {message && <div className={styles.message}>{message}</div>}

      {tab === "pendencias" && (
        <section className={styles.pendingGrid}>
          {pending.map((item) => (
            <article key={item.id}>
              <header>
                <div>
                  <strong>{item.nome}</strong>
                  <small>
                    {item.codigo} · Microárea {item.microareaCodigo}
                  </small>
                </div>
                <span
                  className={
                    item.altoRisco ? styles.highRisk : styles.followUp
                  }
                >
                  {item.risco ?? "Acompanhar"}
                </span>
              </header>

              <div className={styles.pendingBody}>
                <div>
                  <small>Última visita</small>
                  <strong>{formatDate(item.ultimaVisita)}</strong>
                </div>
                <div>
                  <small>Tempo sem visita</small>
                  <strong>
                    {item.diasSemVisita >= 9999
                      ? "Nunca visitada"
                      : `${item.diasSemVisita} dias`}
                  </strong>
                </div>
              </div>

              <footer>
                <button
                  onClick={() =>
                    setSelected({
                      gestanteId: item.id,
                      gestanteNome: item.nome,
                      visitaId: null,
                    })
                  }
                  type="button"
                >
                  <MessageSquarePlus size={16} />
                  Registrar acompanhamento
                </button>
              </footer>
            </article>
          ))}

          {pending.length === 0 && (
            <div className={styles.empty}>
              <CheckCircle2 size={34} />
              <strong>Nenhuma pendência neste filtro</strong>
              <span>Altere a busca ou os filtros para continuar.</span>
            </div>
          )}
        </section>
      )}

      {tab === "historico" && (
        <section className={styles.historyList}>
          {history.map((item) => (
            <article key={item.id}>
              <span
                className={
                  item.compareceu ? styles.visitIcon : styles.absentIcon
                }
              >
                {item.compareceu ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <MapPin size={18} />
                )}
              </span>

              <div>
                <strong>{item.gestanteNome}</strong>
                <small>
                  {item.gestanteCodigo} · Microárea {item.microareaCodigo} ·{" "}
                  {formatDate(item.dataAcao)}
                </small>
                <p>
                  {item.compareceu
                    ? "Visita realizada"
                    : item.motivoFalta ?? "Não encontrada"}
                  {" · "}
                  ACS: {item.acsNome}
                  {item.sinaisAlerta ? " · Sinal de alerta" : ""}
                </p>
              </div>

              <button onClick={() => openFromHistory(item)} type="button">
                Acompanhar
              </button>
            </article>
          ))}

          {history.length === 0 && (
            <div className={styles.empty}>
              <History size={34} />
              <strong>Nenhuma visita encontrada</strong>
              <span>Altere os filtros para consultar outro período.</span>
            </div>
          )}
        </section>
      )}

      {tab === "acompanhamentos" && (
        <section className={styles.followUpList}>
          {data.acompanhamentos.map((item) => (
            <article key={item.id}>
              <span>
                <FileCheck2 size={18} />
              </span>
              <div>
                <strong>{item.gestanteNome}</strong>
                <small>
                  {item.gestanteCodigo} · {formatDate(item.criadoEm)}
                </small>
                <p>
                  {item.tipo.replaceAll("_", " ")} · {item.profissionalNome}
                </p>
                <em>{item.observacao}</em>
              </div>
            </article>
          ))}

          {data.acompanhamentos.length === 0 && (
            <div className={styles.empty}>
              <FileCheck2 size={34} />
              <strong>Nenhum acompanhamento registrado</strong>
              <span>
                Os registros da equipe aparecerão aqui, sem modificar a visita
                original do ACS.
              </span>
            </div>
          )}
        </section>
      )}

      {selected && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="team-follow-up-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
          >
            <button
              aria-label="Fechar"
              className={styles.close}
              onClick={() => setSelected(null)}
              type="button"
            >
              <X size={18} />
            </button>

            <span className={styles.modalIcon}>
              <MessageSquarePlus size={22} />
            </span>
            <h2 id="team-follow-up-title">Registrar acompanhamento</h2>
            <p>
              {selected.gestanteNome} · este registro não altera a ação do ACS.
            </p>

            <form onSubmit={registerFollowUp}>
              <label>
                Tipo de acompanhamento
                <select defaultValue="acompanhamento" name="tipo">
                  <option value="acompanhamento">
                    Acompanhamento da equipe
                  </option>
                  <option value="encaminhamento">Encaminhamento</option>
                  <option value="contato_acs">Contato com ACS</option>
                  <option value="resolvido">Situação acompanhada</option>
                </select>
              </label>

              <label>
                Registro objetivo
                <textarea
                  maxLength={500}
                  name="observacao"
                  placeholder="Registre somente a conduta ou providência tomada."
                  required
                  rows={5}
                />
              </label>

              <button disabled={submitting} type="submit">
                {submitting ? "Registrando..." : "Salvar acompanhamento"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
