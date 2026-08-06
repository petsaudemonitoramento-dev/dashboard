"use client";

import {
  Activity,
  Baby,
  BellRing,
  Cake,
  CalendarPlus,
  CheckCircle2,
  ClipboardPlus,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { profileLabel } from "@/lib/auth/roles";
import styles from "./home-dashboard.module.css";

export type HomeNotice = {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: "informativo" | "alerta" | "sucesso";
  publico: "todos" | "profissionais" | "acs" | "gestao";
  publicadoEm: string;
  ubsId: string | null;
  ubsNome: string | null;
};

export type BirthdayItem = {
  nome: string;
  dia: number;
  ubsNome: string | null;
  hoje: boolean;
};

export type HomeData = {
  nome: string;
  perfil: string;
  ubsId: string | null;
  ubsNome: string | null;
  escopo: string;
  metricas: {
    ativas: number;
    altoRisco: number;
    novasMes: number;
    partosAltas: number;
  };
  avisos: HomeNotice[];
  aniversariantes: BirthdayItem[];
};

type Props = {
  data: HomeData;
  canManageNotices: boolean;
};

type Tab = "resumo" | "avisos";

const AUDIENCE_LABELS: Record<string, string> = {
  todos: "Todos os perfis",
  profissionais: "Profissionais UBS",
  acs: "ACS",
  gestao: "Gestão",
};

function greeting(): string {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || "profissional";
}

function formatNoticeDate(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
}

export function HomeDashboard({
  data,
  canManageNotices,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("resumo");
  const [showComposer, setShowComposer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const metrics = useMemo(
    () => [
      {
        label: "Gestantes ativas",
        value: Number(data.metricas.ativas ?? 0),
        helper: data.escopo,
        icon: Baby,
        tone: "purple",
      },
      {
        label: "Alto risco",
        value: Number(data.metricas.altoRisco ?? 0),
        helper: "Acompanhamento prioritário",
        icon: Activity,
        tone: "red",
      },
      {
        label: "Novas no mês",
        value: Number(data.metricas.novasMes ?? 0),
        helper: "Cadastros deste mês",
        icon: CalendarPlus,
        tone: "green",
      },
      {
        label: "Partos e altas",
        value: Number(data.metricas.partosAltas ?? 0),
        helper: "Histórico acompanhado",
        icon: CheckCircle2,
        tone: "blue",
      },
    ],
    [data]
  );

  async function publishNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/avisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: String(form.get("titulo") ?? ""),
          mensagem: String(form.get("mensagem") ?? ""),
          tipo: String(form.get("tipo") ?? "informativo"),
          publico: String(form.get("publico") ?? "todos"),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível publicar o aviso.");
      }

      setShowComposer(false);
      setMessage("Aviso publicado para a UBS.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível publicar o aviso."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteNotice(id: string) {
    setDeletingId(id);
    setMessage(null);

    try {
      const response = await fetch(`/api/avisos?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível remover o aviso.");
      }

      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível remover o aviso."
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={`${styles.page} ui-presentation-home`}>
      <section className={styles.welcome}>
        <div>
          <span>PET-Saúde UFCG</span>
          <h1>
            {greeting()}, {firstName(data.nome)}!
          </h1>
          <p>
            {profileLabel(data.perfil)}
            {data.ubsNome ? ` · ${data.ubsNome}` : ""}
          </p>
        </div>

        <button
          className={styles.refresh}
          onClick={() => router.refresh()}
          type="button"
        >
          <RefreshCw size={17} />
          Atualizar
        </button>
      </section>

      <div className={styles.tabs} role="tablist">
        <button
          aria-selected={tab === "resumo"}
          className={tab === "resumo" ? styles.activeTab : ""}
          onClick={() => setTab("resumo")}
          role="tab"
          type="button"
        >
          Resumo
        </button>
        <button
          aria-selected={tab === "avisos"}
          className={tab === "avisos" ? styles.activeTab : ""}
          onClick={() => setTab("avisos")}
          role="tab"
          type="button"
        >
          Avisos da UBS
          {data.avisos.length > 0 && (
            <span className={styles.tabCount}>{data.avisos.length}</span>
          )}
        </button>
      </div>

      {tab === "resumo" ? (
        <>
          <section className={styles.metrics}>
            {metrics.map(({ label, value, helper, icon: Icon, tone }) => (
              <article className={styles.metricCard} key={label}>
                <span className={`${styles.metricIcon} ${styles[tone]}`}>
                  <Icon size={24} />
                </span>
                <div>
                  <strong>{value}</strong>
                  <h2>{label}</h2>
                  <p>{helper}</p>
                </div>
              </article>
            ))}
          </section>

          <section className={styles.homeGrid}>
            <article className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <BellRing size={20} />
                  <span>
                    <h2>Avisos recentes</h2>
                    <p>Comunicados da unidade</p>
                  </span>
                </div>
                <button onClick={() => setTab("avisos")} type="button">
                  Ver todos
                </button>
              </header>

              <div className={styles.noticeList}>
                {data.avisos.slice(0, 4).map((notice) => (
                  <div
                    className={`${styles.notice} ${styles[`notice_${notice.tipo}`]}`}
                    key={notice.id}
                  >
                    <div>
                      <strong>{notice.titulo}</strong>
                      <span>{formatNoticeDate(notice.publicadoEm)}</span>
                    </div>
                    <p>{notice.mensagem}</p>
                  </div>
                ))}

                {data.avisos.length === 0 && (
                  <div className={styles.empty}>
                    <BellRing size={27} />
                    <span>Nenhum aviso publicado para esta UBS.</span>
                  </div>
                )}
              </div>
            </article>

            <article className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <Cake size={20} />
                  <span>
                    <h2>Aniversariantes do mês</h2>
                    <p>Sem exibição da idade</p>
                  </span>
                </div>
              </header>

              <div className={styles.birthdayList}>
                {data.aniversariantes.map((item) => (
                  <div
                    className={item.hoje ? styles.birthdayToday : styles.birthday}
                    key={`${item.nome}-${item.dia}`}
                  >
                    <span className={styles.birthdayDay}>
                      {String(item.dia).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{item.nome}</strong>
                      <small>
                        Dia {item.dia}
                        {item.hoje ? " · Hoje" : ""}
                      </small>
                    </div>
                  </div>
                ))}

                {data.aniversariantes.length === 0 && (
                  <div className={styles.empty}>
                    <Cake size={27} />
                    <span>Nenhum aniversariante neste mês.</span>
                  </div>
                )}
              </div>
            </article>
          </section>
        </>
      ) : (
        <section className={styles.noticesPanel}>
          <header className={styles.noticesHeader}>
            <div>
              <h2>Quadro de avisos da UBS</h2>
              <p>
                Informações publicadas pela gestão para os profissionais da
                unidade.
              </p>
            </div>

            {canManageNotices && (
              <button
                className={styles.addNotice}
                onClick={() => setShowComposer(true)}
                type="button"
              >
                <Plus size={18} />
                Publicar aviso
              </button>
            )}
          </header>

          {message && <div className={styles.inlineMessage}>{message}</div>}

          <div className={styles.allNotices}>
            {data.avisos.map((notice) => (
              <article
                className={`${styles.fullNotice} ${styles[`notice_${notice.tipo}`]}`}
                key={notice.id}
              >
                <div className={styles.fullNoticeHeader}>
                  <div>
                    <strong>{notice.titulo}</strong>
                    <small>
                      {notice.ubsNome ?? "Aviso geral"} ·{" "}
                      {AUDIENCE_LABELS[notice.publico] ?? notice.publico} ·{" "}
                      {formatNoticeDate(notice.publicadoEm)}
                    </small>
                  </div>

                  {canManageNotices && (
                    <button
                      aria-label="Remover aviso"
                      disabled={deletingId === notice.id}
                      onClick={() => void deleteNotice(notice.id)}
                      title="Remover aviso"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <p>{notice.mensagem}</p>
              </article>
            ))}

            {data.avisos.length === 0 && (
              <div className={styles.emptyLarge}>
                <BellRing size={35} />
                <strong>O quadro de avisos está vazio</strong>
                <span>A gestão ainda não publicou comunicados.</span>
              </div>
            )}
          </div>
        </section>
      )}

      {showComposer && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            aria-labelledby="notice-modal-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
          >
            <button
              aria-label="Fechar"
              className={styles.modalClose}
              onClick={() => setShowComposer(false)}
              type="button"
            >
              <X size={18} />
            </button>

            <div className={styles.modalIcon}>
              <ClipboardPlus size={23} />
            </div>

            <h2 id="notice-modal-title">Publicar aviso</h2>
            <p>O aviso municipal ficará visível para o público selecionado.</p>

            <form onSubmit={publishNotice}>
              <label>
                Título
                <input
                  maxLength={120}
                  name="titulo"
                  placeholder="Ex.: Reunião da equipe"
                  required
                />
              </label>

              <label>
                Tipo
                <select defaultValue="informativo" name="tipo">
                  <option value="informativo">Informativo</option>
                  <option value="alerta">Alerta</option>
                  <option value="sucesso">Confirmação</option>
                </select>
              </label>

              <label>
                Leitura permitida
                <select defaultValue="todos" name="publico">
                  <option value="todos">
                    TODOS — inclui alunos
                  </option>
                  <option value="profissionais">
                    Profissionais da UBS
                  </option>
                  <option value="acs">Somente ACS</option>
                  <option value="gestao">Somente gestão</option>
                </select>
              </label>

              <label>
                Mensagem
                <textarea
                  maxLength={1500}
                  name="mensagem"
                  placeholder="Escreva o comunicado..."
                  required
                  rows={5}
                />
              </label>

              <button disabled={submitting} type="submit">
                {submitting ? "Publicando..." : "Publicar aviso"}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
