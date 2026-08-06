"use client";

import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  History,
  Home,
  LoaderCircle,
  MapPin,
  PencilLine,
  Search,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MaskedDateInput } from "@/components/ui/masked-date-input";
import type { VisitHistoryItem } from "@/components/visitas/types";
import styles from "./acs-dashboard.module.css";

export type AcsGestante = {
  id: string;
  codigo: string;
  nome: string;
  risco: string | null;
  igSemanas: number | null;
  dpp: string | null;
  inicioPreNatal: string | null;
  dataParto: string | null;
  visitaId: string | null;
  ultimaVisita: string | null;
  diasSemVisita: number;
  ultimaCompareceu: boolean | null;
  ultimoAlerta: boolean | null;
  puerperioSemVisita: boolean;
  semVisita30d: boolean;
  altoRisco: boolean;
  prioridade: number;
  alertas: Record<string, string>;
};

export type AcsDashboardData = {
  nome: string;
  ubsId: string;
  ubsNome: string;
  microareaId: string;
  microareaCodigo: string;
  atualizadoEm: string;
  metricas: {
    gestantesTerritorio: number;
    visitadas30Dias: number;
    pendentes30Dias: number;
    altoRisco: number;
    puerperioSemVisita: number;
    visitas: number;
    buscasAtivas: number;
    sinaisAlerta: number;
  };
  gestantes: AcsGestante[];
  historico: VisitHistoryItem[];
};

const ORIENTATIONS = [
  "Orientou sinais de alerta",
  "Reforçou a importância do pré-natal",
  "Lembrou vacinas e exames",
  "Orientou alimentação e hidratação",
  "Orientou maternidade e plano de parto",
  "Orientou cuidados no puerpério",
];

const ABSENCE_REASONS = [
  "Não encontrada no domicílio",
  "Recusou atendimento ou visita",
  "Mudou de endereço",
  "Sem disponibilidade no momento",
  "Dificuldade de transporte",
  "Outro",
];

type ViewMode = "prioridades" | "todas" | "historico";
type QuickAction = "visita" | "nao_encontrada";

function formatDate(value: string | null): string {
  if (!value) return "Nunca";

  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

function priorityLabels(item: AcsGestante): string[] {
  return Object.values(item.alertas ?? {}).filter(Boolean);
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || "ACS";
}

export function AcsDashboard({ data }: { data: AcsDashboardData }) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("prioridades");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"30" | "90" | "all">("30");
  const [historyStatus, setHistoryStatus] =
    useState<"all" | "visit" | "not_found" | "alert">("all");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AcsGestante | null>(null);
  const [confirmation, setConfirmation] = useState<{
    item: AcsGestante;
    action: QuickAction;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const visible = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

    return data.gestantes.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.nome.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        item.codigo.toLocaleLowerCase("pt-BR").includes(normalizedSearch);

      if (!matchesSearch) return false;
      if (mode === "todas") return true;
      return priorityLabels(item).length > 0;
    });
  }, [data.gestantes, mode, search]);

  const visibleHistory = useMemo(() => {
    const now = new Date();

    return data.historico.filter((item) => {
      const itemDate = new Date(`${item.dataAcao.slice(0, 10)}T12:00:00`);
      const ageDays = Math.floor(
        (now.getTime() - itemDate.getTime()) / 86400000
      );

      if (period !== "all" && ageDays > Number(period)) return false;
      if (historyStatus === "visit" && !item.compareceu) return false;
      if (historyStatus === "not_found" && item.compareceu) return false;
      if (historyStatus === "alert" && !item.sinaisAlerta) return false;

      const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
      return (
        !normalizedSearch ||
        item.gestanteNome.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        item.gestanteCodigo.toLocaleLowerCase("pt-BR").includes(normalizedSearch)
      );
    });
  }, [data.historico, historyStatus, period, search]);

  async function quickAction(
    gestanteId: string,
    action: QuickAction
  ) {
    setWorkingId(gestanteId);
    setMessage(null);

    try {
      const response = await fetch("/api/acs/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, gestanteId }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível registrar a ação.");
      }

      setConfirmation(null);
      setMessage(
        action === "visita"
          ? "Visita registrada para hoje."
          : "Busca ativa registrada: gestante não encontrada."
      );
      startRefresh(() => router.refresh());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a ação."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function complement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editing?.visitaId) {
      setMessage(
        "Registre primeiro uma visita ou uma busca ativa para complementar."
      );
      return;
    }

    setWorkingId(editing.id);
    setMessage(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/acs/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complementar",
          visitaId: editing.visitaId,
          data: String(form.get("data") ?? ""),
          motivo: String(form.get("motivo") ?? ""),
          orientacoes: form.getAll("orientacoes").map(String),
          sinaisAlerta: form.get("sinaisAlerta") === "on",
          observacao: String(form.get("observacao") ?? ""),
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ?? "Não foi possível complementar o registro."
        );
      }

      setEditing(null);
      setMessage("Informações adicionais salvas.");
      startRefresh(() => router.refresh());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível complementar o registro."
      );
    } finally {
      setWorkingId(null);
    }
  }

  function refresh() {
    startRefresh(() => router.refresh());
  }

  const metrics = [
    {
      label: "Gestantes no território",
      value: data.metricas.gestantesTerritorio,
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
      label: "Puerpério sem visita",
      value: data.metricas.puerperioSemVisita,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className={styles.page}>
      <section className={styles.welcome}>
        <div>
          <span>Visitas territoriais</span>
          <h1>Olá, {firstName(data.nome)}</h1>
          <p>
            {data.ubsNome} · Microárea {data.microareaCodigo}
          </p>
        </div>

        <button onClick={refresh} type="button">
          {refreshing ? (
            <LoaderCircle className={styles.spin} size={17} />
          ) : (
            <CalendarCheck2 size={17} />
          )}
          Atualizar
        </button>
      </section>

      <section className={styles.notice}>
        <Home size={19} />
        <p>
          Use esta área para organizar prioridades e registrar ações rápidas.
          O registro obrigatório no e-SUS Território continua sendo mantido
          conforme a rotina institucional da unidade.
        </p>
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

      <section className={styles.actionsSummary}>
        <div>
          <ClipboardCheck size={18} />
          <span>
            <strong>{data.metricas.visitas}</strong> visitas nos últimos 30 dias
          </span>
        </div>
        <div>
          <UserRoundX size={18} />
          <span>
            <strong>{data.metricas.buscasAtivas}</strong> buscas ativas
          </span>
        </div>
        <div>
          <AlertTriangle size={18} />
          <span>
            <strong>{data.metricas.sinaisAlerta}</strong> registros com alerta
          </span>
        </div>
      </section>

      <section className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            className={mode === "prioridades" ? styles.activeTab : ""}
            onClick={() => setMode("prioridades")}
            type="button"
          >
            Prioridades
          </button>
          <button
            className={mode === "todas" ? styles.activeTab : ""}
            onClick={() => setMode("todas")}
            type="button"
          >
            Todas da microárea
          </button>
          <button
            className={mode === "historico" ? styles.activeTab : ""}
            onClick={() => setMode("historico")}
            type="button"
          >
            <History size={15} />
            Histórico
          </button>
        </div>

        <label className={styles.search}>
          <Search size={17} />
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou código"
            value={search}
          />
        </label>
      </section>

      {message && <div className={styles.message}>{message}</div>}

      {mode === "historico" ? (
        <>
          <section className={styles.historyFilters}>
            <label>
              Período
              <select
                onChange={(event) =>
                  setPeriod(event.target.value as typeof period)
                }
                value={period}
              >
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="all">Todo o histórico disponível</option>
              </select>
            </label>

            <label>
              Situação
              <select
                onChange={(event) =>
                  setHistoryStatus(
                    event.target.value as typeof historyStatus
                  )
                }
                value={historyStatus}
              >
                <option value="all">Todas</option>
                <option value="visit">Visitas realizadas</option>
                <option value="not_found">Não encontradas</option>
                <option value="alert">Com sinal de alerta</option>
              </select>
            </label>
          </section>

          <section className={styles.historyList}>
            {visibleHistory.map((item) => (
              <article key={item.id}>
                <span
                  className={
                    item.compareceu ? styles.historyVisit : styles.historyAbsent
                  }
                >
                  {item.compareceu ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <MapPin size={17} />
                  )}
                </span>
                <div>
                  <strong>{item.gestanteNome}</strong>
                  <small>
                    {item.gestanteCodigo} · {formatDate(item.dataAcao)}
                  </small>
                  <p>
                    {item.compareceu
                      ? "Visita realizada"
                      : item.motivoFalta ?? "Não encontrada"}
                    {item.sinaisAlerta ? " · Sinal de alerta registrado" : ""}
                  </p>
                  {item.observacao && <em>{item.observacao}</em>}
                </div>
              </article>
            ))}

            {visibleHistory.length === 0 && (
              <div className={styles.empty}>
                <History size={35} />
                <strong>Nenhuma ação encontrada</strong>
                <span>Altere os filtros para consultar outro período.</span>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className={styles.list}>
          {visible.map((item) => {
            const labels = priorityLabels(item);
            const busy = workingId === item.id;

            return (
              <article className={styles.card} key={item.id}>
                <header>
                  <div>
                    <strong>{item.nome}</strong>
                    <small>
                      {item.codigo} · Última visita:{" "}
                      {formatDate(item.ultimaVisita)}
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

                <div className={styles.cardBody}>
                  <div className={styles.clinicalSummary}>
                    <span>
                      <b>IG</b>
                      {item.igSemanas !== null
                        ? `${item.igSemanas} semanas`
                        : "Não informada"}
                    </span>
                    <span>
                      <b>DPP</b>
                      {formatDate(item.dpp)}
                    </span>
                    <span>
                      <b>Sem visita</b>
                      {item.diasSemVisita >= 9999
                        ? "Nunca visitada"
                        : `${item.diasSemVisita} dias`}
                    </span>
                  </div>

                  <div className={styles.tags}>
                    {labels.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                    {labels.length === 0 && (
                      <span className={styles.regular}>
                        Acompanhamento regular
                      </span>
                    )}
                  </div>
                </div>

                <footer>
                  <button
                    className={styles.visit}
                    disabled={busy}
                    onClick={() =>
                      setConfirmation({ item, action: "visita" })
                    }
                    type="button"
                  >
                    <CheckCircle2 size={17} />
                    Registrar visita
                  </button>

                  <button
                    className={styles.notFound}
                    disabled={busy}
                    onClick={() =>
                      setConfirmation({ item, action: "nao_encontrada" })
                    }
                    type="button"
                  >
                    <MapPin size={17} />
                    Não encontrada
                  </button>

                  <button
                    className={styles.complement}
                    onClick={() => setEditing(item)}
                    type="button"
                  >
                    <PencilLine size={17} />
                    Complementar
                  </button>
                </footer>
              </article>
            );
          })}

          {visible.length === 0 && (
            <div className={styles.empty}>
              <CheckCircle2 size={35} />
              <strong>
                {mode === "prioridades"
                  ? "Nenhuma prioridade neste filtro"
                  : "Nenhuma gestante encontrada"}
              </strong>
              <span>Altere o filtro ou a busca para continuar.</span>
            </div>
          )}
        </section>
      )}

      {confirmation && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="confirm-action-title"
            aria-modal="true"
            className={styles.confirmModal}
            role="dialog"
          >
            <button
              aria-label="Fechar"
              className={styles.close}
              onClick={() => setConfirmation(null)}
              type="button"
            >
              <X size={18} />
            </button>

            <span className={styles.confirmIcon}>
              {confirmation.action === "visita" ? (
                <CheckCircle2 size={23} />
              ) : (
                <MapPin size={23} />
              )}
            </span>

            <h2 id="confirm-action-title">Confirmar registro</h2>
            <p>
              {confirmation.action === "visita"
                ? `Registrar visita realizada hoje para ${confirmation.item.nome}?`
                : `Registrar que ${confirmation.item.nome} não foi encontrada hoje?`}
            </p>

            <div className={styles.confirmActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setConfirmation(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className={styles.confirmButton}
                disabled={workingId === confirmation.item.id}
                onClick={() =>
                  void quickAction(
                    confirmation.item.id,
                    confirmation.action
                  )
                }
                type="button"
              >
                {workingId === confirmation.item.id
                  ? "Registrando..."
                  : "Confirmar"}
              </button>
            </div>
          </section>
        </div>
      )}

      {editing && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="acs-complement-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
          >
            <button
              aria-label="Fechar"
              className={styles.close}
              onClick={() => setEditing(null)}
              type="button"
            >
              <X size={18} />
            </button>

            <h2 id="acs-complement-title">Complementar ação</h2>
            <p>{editing.nome} · preenchimento opcional e curto.</p>

            {!editing.visitaId && (
              <div className={styles.modalWarning}>
                Registre primeiro “Visita” ou “Não encontrada”. Depois abra
                este complemento novamente.
              </div>
            )}

            <form onSubmit={complement}>
              <label>
                Data da ação
                <MaskedDateInput
                  defaultValue={
                    editing.ultimaVisita?.slice(0, 10) ??
                    new Date().toISOString().slice(0, 10)
                  }
                  max={new Date().toISOString().slice(0, 10)}
                  name="data"
                />
              </label>

              {editing.ultimaCompareceu === false && (
                <label>
                  Motivo da busca ativa
                  <select
                    defaultValue="Não encontrada no domicílio"
                    name="motivo"
                  >
                    {ABSENCE_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <fieldset>
                <legend>Orientações realizadas</legend>
                <div className={styles.orientationGrid}>
                  {ORIENTATIONS.map((orientation) => (
                    <label key={orientation}>
                      <input
                        name="orientacoes"
                        type="checkbox"
                        value={orientation}
                      />
                      {orientation}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className={styles.alertToggle}>
                <input name="sinaisAlerta" type="checkbox" />
                <span>
                  <AlertTriangle size={17} />
                  Foram identificados sinais de alerta
                </span>
              </label>

              <label>
                Observação curta
                <input
                  maxLength={240}
                  name="observacao"
                  placeholder="Ex.: retornará amanhã"
                />
              </label>

              <button
                disabled={!editing.visitaId || workingId === editing.id}
                type="submit"
              >
                {workingId === editing.id
                  ? "Salvando..."
                  : "Salvar complemento"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
