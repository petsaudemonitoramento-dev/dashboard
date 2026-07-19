"use client";

import Link from "next/link";
import {
  Activity,
  CalendarDays,
  Eye,
  EyeOff,
  FilePenLine,
  HeartPulse,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Trash2,
  X,
  UserRound,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import styles from "./gestantes.module.css";

export type GestanteCardData = {
  id: string;
  codigo: string;
  nomeVisual: string;
  ubsNome: string;
  microarea: string | null;
  idadeAnos: number | null;
  risco: string | null;
  igSemanas: number | null;
  igDias: number | null;
  dpp: string | null;
  consultas: number | null;
  consultasAte12Semanas: number | null;
  ultimaConsulta: string | null;
  atendimentosOdontologicos: number | null;
  dtpa: string | null;
  pressaoArterial: string | null;
  pesoKg: number | null;
  alturaCm: number | null;
  visitasPreNatal: number | null;
  diasUltimaVisita: number | null;
  exames: {
    hivPrimeiro: string | null;
    sifilisPrimeiro: string | null;
    hepatiteBPrimeiro: string | null;
    hepatiteCPrimeiro: string | null;
    hivTerceiro: string | null;
    sifilisTerceiro: string | null;
  };
  observacao: string | null;
  altaAtiva: boolean;
  altaData: string | null;
  altaMotivo: string | null;
  pendencias: number;
  atualizadoEm: string;
};

type Props = {
  gestantes: GestanteCardData[];
  presentationMode: boolean;
  canShowIdentity: boolean;
};

type RiskTone = "high" | "intermediate" | "habitual" | "neutral";
type StatusFilter = "ativas" | "altas" | "todas";

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function riskTone(value: string | null): RiskTone {
  const normalized = normalize(value);

  if (normalized.includes("alto")) {
    return "high";
  }

  if (
    normalized.includes("inter") ||
    normalized.includes("medio") ||
    normalized.includes("moder")
  ) {
    return "intermediate";
  }

  if (
    normalized.includes("habit") ||
    normalized.includes("baixo")
  ) {
    return "habitual";
  }

  return "neutral";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR").format(
    new Date(`${value}T12:00:00`)
  );
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Data não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function displayValue(
  value: string | number | null | undefined,
  suffix = ""
): string {
  if (value === null || value === undefined || value === "") {
    return "Não informado";
  }

  return `${value}${suffix}`;
}

function examStatus(value: string | null): {
  label: string;
  tone: "done" | "pending" | "neutral";
} {
  const normalized = normalize(value);

  if (
    normalized.includes("realizado") ||
    normalized.includes("tratado") ||
    normalized === "realizado"
  ) {
    return { label: value ?? "Realizado", tone: "done" };
  }

  if (
    normalized.includes("pendente") ||
    normalized.includes("reagente") ||
    normalized.includes("alterado")
  ) {
    return { label: value ?? "Acompanhar", tone: "pending" };
  }

  if (
    normalized.includes("nao se aplica") ||
    normalized.includes("nao_se_aplica")
  ) {
    return { label: "Não se aplica", tone: "neutral" };
  }

  return {
    label: value && value !== "-" ? value : "Não informado",
    tone: "neutral",
  };
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ExamRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const status = examStatus(value);

  return (
    <div className={styles.examRow}>
      <span>{label}</span>
      <strong className={styles[`exam_${status.tone}`]}>
        {status.label}
      </strong>
    </div>
  );
}

function ActiveCard({
  gestante,
  presentationMode,
  onMoveToTrash,
}: {
  gestante: GestanteCardData;
  presentationMode: boolean;
  onMoveToTrash: (gestante: GestanteCardData) => void;
}) {
  const tone = riskTone(gestante.risco);
  const ig =
    gestante.igSemanas === null
      ? "Não informada"
      : `${gestante.igSemanas}s ${gestante.igDias ?? 0}d`;

  return (
    <article className={`${styles.card} ${styles[`risk_${tone}`]}`}>
      <div className={styles.riskLine} aria-hidden="true" />

      <header className={styles.cardHeader}>
        <div className={styles.avatar}>
          <UserRound size={22} />
        </div>

        <div className={styles.identity}>
          <h2 title={gestante.nomeVisual}>{gestante.nomeVisual}</h2>
          <span>{gestante.codigo}</span>
        </div>

        <div className={styles.headerActions}>
          <span className={`${styles.riskBadge} ${styles[`badge_${tone}`]}`}>
            {gestante.risco ?? "Risco não informado"}
          </span>

          {!presentationMode && (
            <button
              aria-label={`Mover ${gestante.nomeVisual} para a lixeira`}
              className={styles.trashIconButton}
              onClick={() => onMoveToTrash(gestante)}
              title="Mover para a lixeira"
              type="button"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>

      <div className={styles.cardScroll} tabIndex={0}>
        <div className={styles.quickInfo}>
          <div>
            <MapPin size={17} />
            <span>
              <small>Microárea</small>
              <strong>{gestante.microarea ?? "Não vinculada"}</strong>
            </span>
          </div>

          <div>
            <CalendarDays size={17} />
            <span>
              <small>Idade gestacional</small>
              <strong>{ig}</strong>
            </span>
          </div>
        </div>

        {gestante.pendencias > 0 && (
          <div className={styles.pendingBadge}>
            <HeartPulse size={15} />
            <span>
              {gestante.pendencias} pendência
              {gestante.pendencias === 1 ? "" : "s"} sugerida
              {gestante.pendencias === 1 ? "" : "s"}
            </span>
          </div>
        )}

        <section className={styles.section}>
          <h3>
            <Activity size={16} />
            Acompanhamento
          </h3>
          <dl>
            <DetailRow
              label="Idade"
              value={displayValue(gestante.idadeAnos, " anos")}
            />
            <DetailRow label="DPP" value={formatDate(gestante.dpp)} />
            <DetailRow
              label="Consultas de pré-natal"
              value={displayValue(gestante.consultas)}
            />
            <DetailRow
              label="Consultas até 12 semanas"
              value={displayValue(gestante.consultasAte12Semanas)}
            />
            <DetailRow
              label="Última consulta"
              value={formatDate(gestante.ultimaConsulta)}
            />
            <DetailRow
              label="Visitas domiciliares"
              value={displayValue(gestante.visitasPreNatal)}
            />
          </dl>
        </section>

        <section className={styles.section}>
          <h3>
            <Stethoscope size={16} />
            Dados clínicos
          </h3>
          <dl>
            <DetailRow
              label="Pressão arterial"
              value={displayValue(gestante.pressaoArterial)}
            />
            <DetailRow
              label="Peso"
              value={displayValue(gestante.pesoKg, " kg")}
            />
            <DetailRow
              label="Altura"
              value={displayValue(gestante.alturaCm, " cm")}
            />
            <DetailRow
              label="Atendimentos odontológicos"
              value={displayValue(gestante.atendimentosOdontologicos)}
            />
            <DetailRow
              label="dTpa"
              value={displayValue(gestante.dtpa)}
            />
          </dl>
        </section>

        <section className={styles.section}>
          <h3>
            <Syringe size={16} />
            Exames
          </h3>
          <div className={styles.examList}>
            <ExamRow
              label="HIV — 1º trimestre"
              value={gestante.exames.hivPrimeiro}
            />
            <ExamRow
              label="Sífilis — 1º trimestre"
              value={gestante.exames.sifilisPrimeiro}
            />
            <ExamRow
              label="Hepatite B"
              value={gestante.exames.hepatiteBPrimeiro}
            />
            <ExamRow
              label="Hepatite C"
              value={gestante.exames.hepatiteCPrimeiro}
            />
            <ExamRow
              label="HIV — 3º trimestre"
              value={gestante.exames.hivTerceiro}
            />
            <ExamRow
              label="Sífilis — 3º trimestre"
              value={gestante.exames.sifilisTerceiro}
            />
          </div>
        </section>

        {gestante.observacao && (
          <section className={styles.observation}>
            <strong>Observação clínica</strong>
            <p>{gestante.observacao}</p>
          </section>
        )}
      </div>

      <footer className={styles.cardFooter}>
        <div>
          <span>{gestante.ubsNome}</span>
          <small>Atualizado {formatDateTime(gestante.atualizadoEm)}</small>
        </div>

        {!presentationMode && (
          <div className={styles.cardActions}>
            <Link
              href={`/dashboard/cadastro-clinico?gestante=${gestante.id}`}
              className={styles.primaryAction}
            >
              <FilePenLine size={15} />
              Atualizar
            </Link>
            <Link
              href={`/dashboard/classificacao-risco?gestante=${gestante.id}`}
              className={styles.secondaryAction}
            >
              <HeartPulse size={15} />
              Risco
            </Link>
          </div>
        )}
      </footer>
    </article>
  );
}

function DischargedCard({
  gestante,
  presentationMode,
}: {
  gestante: GestanteCardData;
  presentationMode: boolean;
}) {
  return (
    <article className={styles.dischargedCard}>
      <span className={styles.dischargedIcon}>
        <ShieldCheck size={20} />
      </span>

      <div className={styles.dischargedIdentity}>
        <strong>{gestante.nomeVisual}</strong>
        <small>
          {gestante.codigo} · Microárea{" "}
          {gestante.microarea ?? "não vinculada"}
        </small>
      </div>

      <div className={styles.dischargedMeta}>
        <span>Alta em {formatDate(gestante.altaData)}</span>
        <small>
          {gestante.altaMotivo
            ? gestante.altaMotivo.replaceAll("_", " ")
            : "Motivo não informado"}
        </small>
      </div>

      {!presentationMode && (
        <Link
          href={`/dashboard/cadastro-clinico?gestante=${gestante.id}`}
        >
          Ver histórico
        </Link>
      )}
    </article>
  );
}

export function GestantesGrid({
  gestantes,
  presentationMode,
  canShowIdentity,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [currentSearch, setCurrentSearch] = useState("");
  const [currentRisk, setCurrentRisk] = useState("todos");
  const [currentMicroarea, setCurrentMicroarea] = useState("todas");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ativas");
  const [trashTarget, setTrashTarget] =
    useState<GestanteCardData | null>(null);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [trashSubmitting, setTrashSubmitting] = useState(false);

  const microareas = useMemo(
    () =>
      [...new Set(gestantes.map((item) => item.microarea).filter(Boolean))]
        .map(String)
        .sort((a, b) =>
          a.localeCompare(b, "pt-BR", { numeric: true })
        ),
    [gestantes]
  );

  const filtered = useMemo(() => {
    const query = normalize(currentSearch.trim());

    return gestantes.filter((gestante) => {
      const matchesSearch =
        !query ||
        normalize(gestante.nomeVisual).includes(query) ||
        normalize(gestante.codigo).includes(query);

      const matchesRisk =
        currentRisk === "todos" ||
        riskTone(gestante.risco) === currentRisk;

      const matchesMicroarea =
        currentMicroarea === "todas" ||
        gestante.microarea === currentMicroarea;

      const matchesStatus =
        statusFilter === "todas" ||
        (statusFilter === "altas"
          ? gestante.altaAtiva
          : !gestante.altaAtiva);

      return (
        matchesSearch &&
        matchesRisk &&
        matchesMicroarea &&
        matchesStatus
      );
    });
  }, [
    gestantes,
    currentMicroarea,
    currentRisk,
    currentSearch,
    statusFilter,
  ]);

  const activeGestantes = filtered.filter(
    (gestante) => !gestante.altaAtiva
  );
  const dischargedGestantes = filtered.filter(
    (gestante) => gestante.altaAtiva
  );

  async function confirmMoveToTrash() {
    if (!trashTarget) return;

    setTrashSubmitting(true);
    setTrashError(null);

    try {
      const response = await fetch("/api/gestantes/lixeira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "trash",
          gestanteId: trashTarget.id,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível mover para a lixeira.");
      }

      setTrashTarget(null);
      router.refresh();
    } catch (error) {
      setTrashError(
        error instanceof Error
          ? error.message
          : "Não foi possível mover para a lixeira."
      );
    } finally {
      setTrashSubmitting(false);
    }
  }

  function togglePresentationMode() {
    const params = new URLSearchParams(searchParams.toString());

    if (presentationMode) {
      params.delete("modo");
    } else {
      params.set("modo", "apresentacao");
    }

    const query = params.toString();

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label className={styles.searchBox}>
            <Search size={18} />
            <input
              type="search"
              value={currentSearch}
              placeholder={
                presentationMode
                  ? "Buscar pelo código..."
                  : "Buscar por nome ou código..."
              }
              onChange={(event) => setCurrentSearch(event.target.value)}
            />
          </label>

          <select
            aria-label="Filtrar por situação"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
          >
            <option value="ativas">Gestantes ativas</option>
            <option value="altas">Com alta</option>
            <option value="todas">Ativas e altas</option>
          </select>

          <select
            aria-label="Filtrar por risco"
            value={currentRisk}
            onChange={(event) => setCurrentRisk(event.target.value)}
          >
            <option value="todos">Todos os riscos</option>
            <option value="high">Alto risco</option>
            <option value="intermediate">Intermediário</option>
            <option value="habitual">Habitual</option>
            <option value="neutral">Não informado</option>
          </select>

          <select
            aria-label="Filtrar por microárea"
            value={currentMicroarea}
            onChange={(event) =>
              setCurrentMicroarea(event.target.value)
            }
          >
            <option value="todas">Todas as microáreas</option>
            {microareas.map((microarea) => (
              <option value={microarea} key={microarea}>
                Microárea {microarea}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.toolbarActions}>
          {!presentationMode && (
            <Link
              href="/dashboard/cadastro-clinico"
              className={styles.newButton}
            >
              <Plus size={17} />
              Nova gestante
            </Link>
          )}

          <button
            type="button"
            className={`${styles.presentationToggle} ${
              presentationMode ? styles.presentationActive : ""
            }`}
            onClick={togglePresentationMode}
            disabled={!canShowIdentity || isPending}
            aria-pressed={presentationMode}
          >
            <span className={styles.toggleIcon}>
              {presentationMode ? <EyeOff size={18} /> : <Eye size={18} />}
            </span>
            <span>
              <strong>Modo apresentação</strong>
              <small>
                {presentationMode
                  ? "Nomes ocultos"
                  : "Nomes visíveis para atendimento"}
              </small>
            </span>
            <span className={styles.switch} aria-hidden="true">
              <i />
            </span>
          </button>
        </div>
      </div>

      <div
        className={`${styles.privacyNotice} ${
          presentationMode ? styles.privacyPresentation : ""
        }`}
      >
        <ShieldCheck size={19} />
        <p>
          {presentationMode
            ? "Modo apresentação ativo: os nomes não foram descriptografados nesta página e as ações assistenciais ficaram ocultas."
            : "Modo assistencial: nomes visíveis somente para o perfil autorizado e para a UBS vinculada."}
        </p>
      </div>

      <div className={styles.resultLine}>
        <strong>{filtered.length}</strong>
        <span>
          {filtered.length === 1
            ? "gestante encontrada"
            : "gestantes encontradas"}
        </span>
      </div>

      {activeGestantes.length > 0 && (
        <div className={styles.grid}>
          {activeGestantes.map((gestante) => (
            <ActiveCard
              gestante={gestante}
              onMoveToTrash={setTrashTarget}
              presentationMode={presentationMode}
              key={gestante.id}
            />
          ))}
        </div>
      )}

      {dischargedGestantes.length > 0 && (
        <section className={styles.dischargedSection}>
          <div className={styles.dischargedHeading}>
            <ShieldCheck size={18} />
            <span>
              <strong>Gestantes com alta</strong>
              <small>Cards compactos e histórico preservado</small>
            </span>
          </div>

          <div className={styles.dischargedGrid}>
            {dischargedGestantes.map((gestante) => (
              <DischargedCard
                gestante={gestante}
                presentationMode={presentationMode}
                key={gestante.id}
              />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className={styles.emptyState}>
          <UserRound size={30} />
          <strong>Nenhuma gestante encontrada</strong>
          <span>Revise os filtros ou faça um cadastro manual.</span>
        </div>
      )}


      {trashTarget && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="trash-dialog-title"
            aria-modal="true"
            className={styles.modalCard}
            role="dialog"
          >
            <button
              aria-label="Fechar"
              className={styles.modalClose}
              disabled={trashSubmitting}
              onClick={() => setTrashTarget(null)}
              type="button"
            >
              <X size={18} />
            </button>

            <div className={styles.modalIcon}>
              <Trash2 size={23} />
            </div>
            <h2 id="trash-dialog-title">Mover gestante para a lixeira?</h2>
            <p>
              <strong>{trashTarget.nomeVisual}</strong> deixará imediatamente
              de aparecer entre as gestantes ativas e de contar nos gráficos.
            </p>
            <div className={styles.modalNotice}>
              O cadastro ficará na aba <strong>Lixeira</strong> e poderá ser
              restaurado durante 10 dias. Depois desse prazo, os dados serão
              excluídos definitivamente do banco.
            </div>

            {trashError && <div className={styles.modalError}>{trashError}</div>}

            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                disabled={trashSubmitting}
                onClick={() => setTrashTarget(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className={styles.modalDanger}
                disabled={trashSubmitting}
                onClick={confirmMoveToTrash}
                type="button"
              >
                <Trash2 size={17} />
                {trashSubmitting ? "Movendo..." : "Mover para lixeira"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
