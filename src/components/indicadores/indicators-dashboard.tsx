"use client";

import { type CSSProperties, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Baby,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileBarChart,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Syringe,
  UserRound,
} from "lucide-react";
import styles from "./indicators.module.css";

export type IndicatorItem = {
  rotulo: string;
  quantidade: number;
};

export type IndicatorNotice = {
  tipo: string;
  rotulo: string;
  quantidade: number;
};

export type IndicatorData = {
  escopo: "ubs" | "profissional";
  titulo: string;
  atualizadoEm: string;
  resumo: {
    total: number;
    ativas: number;
    altas: number;
    altoRisco: number;
    medioRisco: number;
    habitual: number;
    captacaoPrecoce: number;
    captacaoTardia: number;
    captacaoSemDados: number;
    acompanhamentoAtrasado: number;
    examesPendentes: number;
    dtpaPendente: number;
  };
  captacao: IndicatorItem[];
  consultas: IndicatorItem[];
  riscos: IndicatorItem[];
  trimestres: IndicatorItem[];
  microareas: IndicatorItem[];
  fatoresRisco: IndicatorItem[];
  avisos: IndicatorNotice[];
};

export type MetabaseConfig = {
  configured: boolean;
  embedUrl: string | null;
  externalUrl: string | null;
  dashboardId: string | null;
  missing: string[];
};

type Props = {
  profile: string;
  ubsData: IndicatorData;
  professionalData: IndicatorData;
  metabase: {
    ubs: MetabaseConfig;
    profissional: MetabaseConfig;
  };
};

type Scope = "ubs" | "profissional";


function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function total(items: IndicatorItem[]): number {
  return items.reduce(
    (sum, item) => sum + safeNumber(item.quantidade),
    0
  );
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "agora";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "neutral",
}: {
  icon: typeof Baby;
  label: string;
  value: number | string;
  helper: string;
  tone?: "neutral" | "danger" | "warning" | "success" | "info";
}) {
  return (
    <article className={`${styles.metricCard} ${styles[`metric_${tone}`]}`}>
      <div className={styles.metricIcon}>
        <Icon size={22} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </article>
  );
}

function BarList({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: IndicatorItem[];
  emptyMessage: string;
}) {
  const max = Math.max(...items.map((item) => safeNumber(item.quantidade)), 1);

  return (
    <article className={styles.chartCard}>
      <header className={styles.chartHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <BarChart3 size={20} />
      </header>

      <div className={styles.barList}>
        {items.length === 0 ? (
          <div className={styles.emptyChart}>{emptyMessage}</div>
        ) : (
          items.map((item) => {
            const value = safeNumber(item.quantidade);
            const width = value === 0 ? 0 : Math.max((value / max) * 100, 5);

            return (
              <div className={styles.barRow} key={item.rotulo}>
                <div className={styles.barLabel}>
                  <span title={item.rotulo}>{item.rotulo}</span>
                  <strong>{value}</strong>
                </div>
                <div className={styles.barTrack}>
                  <i style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}

function SegmentChart({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: IndicatorItem[];
}) {
  const sum = total(items);

  return (
    <article className={styles.chartCard}>
      <header className={styles.chartHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Activity size={20} />
      </header>

      <div className={styles.segmentBar} aria-label={title}>
        {items.map((item, index) => {
          const quantity = safeNumber(item.quantidade);
          const percentage = sum > 0 ? (quantity / sum) * 100 : 0;

          return (
            <i
              className={styles[`segment_${(index % 4) + 1}`]}
              key={item.rotulo}
              style={{ width: `${percentage}%` }}
              title={`${item.rotulo}: ${quantity}`}
            />
          );
        })}
      </div>

      <div className={styles.segmentLegend}>
        {items.map((item, index) => (
          <div key={item.rotulo}>
            <i className={styles[`legend_${(index % 4) + 1}`]} />
            <span>{item.rotulo}</span>
            <strong>{safeNumber(item.quantidade)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function CaptureChart({ data }: { data: IndicatorData }) {
  const early = safeNumber(data.resumo.captacaoPrecoce);
  const late = safeNumber(data.resumo.captacaoTardia);
  const noData = safeNumber(data.resumo.captacaoSemDados);
  const sum = early + late + noData;
  const earlyPercent = sum > 0 ? Math.round((early / sum) * 100) : 0;
  const latePercent = sum > 0 ? Math.round((late / sum) * 100) : 0;

  return (
    <article className={styles.chartCard}>
      <header className={styles.chartHeader}>
        <div>
          <h2>Captação pré-natal</h2>
          <p>Início do acompanhamento até a 12ª semana.</p>
        </div>
        <Clock3 size={20} />
      </header>

      <div className={styles.captureContent}>
        <div
          className={styles.donut}
          style={
            {
              "--early": `${earlyPercent * 3.6}deg`,
              "--late": `${(earlyPercent + latePercent) * 3.6}deg`,
            } as CSSProperties
          }
        >
          <div>
            <strong>{earlyPercent}%</strong>
            <span>precoce</span>
          </div>
        </div>

        <div className={styles.captureLegend}>
          <div>
            <i className={styles.captureEarly} />
            <span>Precoce</span>
            <strong>{early}</strong>
          </div>
          <div>
            <i className={styles.captureLate} />
            <span>Tardia</span>
            <strong>{late}</strong>
          </div>
          <div>
            <i className={styles.captureUnknown} />
            <span>Sem dados</span>
            <strong>{noData}</strong>
          </div>
        </div>
      </div>
    </article>
  );
}

function NoticeGrid({ notices }: { notices: IndicatorNotice[] }) {
  const iconByType: Record<string, typeof AlertTriangle> = {
    alto_risco: AlertTriangle,
    atraso: Clock3,
    exames: Stethoscope,
    vacina: Syringe,
  };

  return (
    <section className={styles.noticeGrid}>
      {notices.map((notice) => {
        const Icon = iconByType[notice.tipo] ?? AlertTriangle;
        return (
          <article key={notice.tipo}>
            <Icon size={20} />
            <div>
              <strong>{safeNumber(notice.quantidade)}</strong>
              <span>{notice.rotulo}</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function MetabasePanel({
  config,
  scope,
  refreshVersion,
}: {
  config: MetabaseConfig;
  scope: Scope;
  refreshVersion: number;
}) {
  const [showEmbed, setShowEmbed] = useState(false);

  return (
    <section className={styles.metabasePanel}>
      <div className={styles.metabaseHeading}>
        <div className={styles.metabaseIcon}>
          <FileBarChart size={24} />
        </div>
        <div>
          <h2>Análise avançada no Metabase</h2>
          <p>
            {scope === "ubs"
              ? "Dashboard agregado da UBS, sem identificação direta das gestantes."
              : "Dashboard filtrado pelo profissional responsável pelas gestantes."}
          </p>
        </div>
        <span className={styles.liveBadge}>
          <RefreshCw size={14} /> Atualização manual
        </span>
      </div>

      <div className={styles.metabaseActions}>
        {config.configured && config.embedUrl ? (
          <button
            className={styles.primaryAction}
            onClick={() => setShowEmbed((current) => !current)}
            type="button"
          >
            <BarChart3 size={18} />
            {showEmbed ? "Ocultar painel" : "Mostrar dentro do sistema"}
          </button>
        ) : (
          <button className={styles.disabledAction} disabled type="button">
            <ShieldCheck size={18} /> Integração ainda não configurada
          </button>
        )}

        {config.externalUrl && (
          <a
            className={styles.secondaryAction}
            href={config.externalUrl}
            rel="noreferrer"
            target="_blank"
          >
            Abrir no Metabase <ExternalLink size={17} />
          </a>
        )}
      </div>

      {!config.configured && (
        <div className={styles.metabaseSetup}>
          <strong>Configuração pendente</strong>
          <span>
            Variáveis necessárias: {config.missing.join(", ")}.
          </span>
        </div>
      )}

      {showEmbed && config.embedUrl && (
        <div className={styles.embedFrame}>
          <iframe
            key={`${scope}-${refreshVersion}`}
            allow="fullscreen"
            loading="lazy"
            src={config.embedUrl}
            title={
              scope === "ubs"
                ? "Dashboard Metabase da UBS"
                : "Dashboard Metabase do profissional"
            }
          />
        </div>
      )}
    </section>
  );
}

export function IndicatorsDashboard({
  profile,
  ubsData,
  professionalData,
  metabase,
}: Props) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("ubs");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshing, startRefresh] = useTransition();

  const studentLimited = profile === "aluno";
  const hasProfessionalScope =
    profile === "profissional_ubs" || profile === "equipe_ubs";
  const resolvedScope =
    !hasProfessionalScope && scope === "profissional" ? "ubs" : scope;
  const data =
    resolvedScope === "ubs" ? ubsData : professionalData;
  const metabaseConfig =
    resolvedScope === "ubs" ? metabase.ubs : metabase.profissional;

  const lastUpdated = useMemo(
    () => formatDateTime(data.atualizadoEm),
    [data.atualizadoEm]
  );


  function refreshNow() {
    setRefreshVersion((current) => current + 1);
    startRefresh(() => {
      router.refresh();
    });
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.scopeHeader}>
        <div className={styles.tabs} role="tablist" aria-label="Escopo dos indicadores">
          <button
            aria-selected={scope === "ubs"}
            className={scope === "ubs" ? styles.activeTab : ""}
            onClick={() => setScope("ubs")}
            role="tab"
            type="button"
          >
            <Building2 size={18} /> UBS em geral
          </button>
          {hasProfessionalScope && (
            <button
              aria-selected={scope === "profissional"}
              className={scope === "profissional" ? styles.activeTab : ""}
              onClick={() => setScope("profissional")}
              role="tab"
              type="button"
            >
              <UserRound size={18} /> Minhas gestantes
            </button>
          )}
        </div>

        <div className={styles.refreshInfo}>
          <span>Atualizado em {lastUpdated}</span>
          <button onClick={refreshNow} type="button">
            <RefreshCw
              className={refreshing ? styles.spinning : ""}
              size={17}
            />
            Atualizar
          </button>
        </div>
      </section>

      <section className={styles.scopeDescription}>
        {studentLimited ? (
          <>
            <ShieldCheck size={19} />
            <p>
              Perfil aluno: apenas métricas gerais não sensíveis. Fatores
              clínicos, distribuição territorial detalhada e registros
              individuais não são exibidos.
            </p>
          </>
        ) : resolvedScope === "ubs" ? (
          <>
            <ShieldCheck size={19} />
            <p>
              Visão agregada de <strong>{data.titulo}</strong>. Esta aba não
              exibe nomes, códigos, CPF, CNS ou registros individuais.
            </p>
          </>
        ) : (
          <>
            <UserRound size={19} />
            <p>
              Indicadores calculados somente com as gestantes vinculadas à
              sua responsabilidade profissional.
            </p>
          </>
        )}
      </section>

      <section className={styles.metricsGrid}>
        <MetricCard
          helper={resolvedScope === "ubs" ? "Total agregado da unidade" : "Sob sua responsabilidade"}
          icon={Baby}
          label="Gestantes ativas"
          tone="info"
          value={safeNumber(data.resumo.ativas)}
        />
        <MetricCard
          helper="Necessitam acompanhamento prioritário"
          icon={AlertTriangle}
          label="Alto risco"
          tone="danger"
          value={safeNumber(data.resumo.altoRisco)}
        />
        <MetricCard
          helper="Pré-natal iniciado até 12 semanas"
          icon={CheckCircle2}
          label="Captação precoce"
          tone="success"
          value={safeNumber(data.resumo.captacaoPrecoce)}
        />
        <MetricCard
          helper="Exames previstos ainda não registrados"
          icon={Stethoscope}
          label="Pendências de exames"
          tone="warning"
          value={safeNumber(data.resumo.examesPendentes)}
        />
        <MetricCard
          helper="Sem consulta recente ou sem data informada"
          icon={Clock3}
          label="Acompanhamento atrasado"
          tone="warning"
          value={safeNumber(data.resumo.acompanhamentoAtrasado)}
        />
        <MetricCard
          helper="Gestantes elegíveis sem registro de dTpa"
          icon={Syringe}
          label="dTpa pendente"
          tone="neutral"
          value={safeNumber(data.resumo.dtpaPendente)}
        />
      </section>

      <NoticeGrid notices={data.avisos} />

      <section className={styles.chartGrid}>
        <CaptureChart data={data} />
        <BarList
          description="Distribuição conforme o total de consultas registradas."
          emptyMessage="Nenhuma consulta disponível para análise."
          items={data.consultas}
          title="Meta de consultas"
        />
        <SegmentChart
          description="Classificação atual das gestantes ativas."
          items={data.riscos}
          title="Classificação de risco"
        />
        <SegmentChart
          description="Distribuição pela idade gestacional registrada."
          items={data.trimestres}
          title="Período gestacional"
        />
        {!studentLimited && (
          <>
            <BarList
              description={
                profile === "administrador"
                  ? "Distribuição completa para a gestão da UBS."
                  : resolvedScope === "ubs"
                    ? "Contagens pequenas são agrupadas para reduzir risco de identificação."
                    : "Distribuição das suas gestantes por território."
              }
              emptyMessage="Nenhuma microárea disponível."
              items={data.microareas}
              title="Distribuição por microárea"
            />
            <BarList
              description="Fatores presentes na classificação mais recente de cada gestante."
              emptyMessage="Nenhum fator de risco classificado até o momento."
              items={data.fatoresRisco}
              title="Principais fatores de risco"
            />
          </>
        )}
      </section>

      {!studentLimited && (
        <MetabasePanel
          config={metabaseConfig}
          refreshVersion={refreshVersion}
          scope={resolvedScope}
        />
      )}

      <section className={styles.footerNote}>
        <ShieldCheck size={18} />
        <p>
          Os indicadores usam os dados já salvos no banco. Clique em
          Atualizar para buscar uma nova fotografia da UBS ou das suas
          gestantes, inclusive alterações feitas por outros profissionais.
        </p>
        <ArrowUpRight size={18} />
      </section>
    </div>
  );
}
