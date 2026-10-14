"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ClipboardList, RefreshCw, X } from "lucide-react";
import type { ProfessionalAlert } from "@/lib/alertas/professional-alerts";
import styles from "./alert-bell.module.css";

type Props = {
  initialAlerts: ProfessionalAlert[];
  initialError?: boolean;
};

export function AlertBell({ initialAlerts, initialError = false }: Props) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setOpen] = useState(false);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [hasError, setError] = useState(initialError);
  const [isLoading, setLoading] = useState(false);
  const [visible, setVisible] = useState(20);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/alertas", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Falha ao consultar avisos");
      const data = (await response.json()) as {
        alerts?: ProfessionalAlert[];
        count?: number;
      };
      if (!Array.isArray(data.alerts)) throw new Error("Resposta inválida");
      setAlerts(data.alerts);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (isOpen) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setVisible(20);
    void refresh();
  }

  const count = alerts.length;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label={hasError ? "Avisos indisponíveis, abrir para tentar novamente" :
          count === 1 ? "1 gestante com aviso ativo" :
          count + " gestantes com avisos ativos"}
        aria-expanded={isOpen}
        aria-controls={panelId}
        title="Avisos de acompanhamento"
        onClick={toggle}
      >
        <Bell size={21} aria-hidden="true" />
        {hasError ? (
          <span className={styles.errorDot} aria-hidden="true">!</span>
        ) : count > 0 ? (
          <span className={styles.counter} aria-hidden="true">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {isOpen && (
        <section
          id={panelId}
          className={styles.panel}
          aria-label="Avisos do meu acompanhamento"
          role="region"
        >
          <header className={styles.header}>
            <div>
              <strong>Avisos</strong>
              <p>
                {hasError ? "Não foi possível conferir a lista agora." :
                  count === 1 ? "1 gestante com aviso ativo" :
                  count + " gestantes com avisos ativos"}
              </p>
            </div>
            <div className={styles.controls}>
              <button type="button" onClick={() => void refresh()}
                className={styles.iconButton} title="Atualizar avisos"
                aria-label="Atualizar avisos" disabled={isLoading}>
                <RefreshCw size={16} className={isLoading ? styles.spinning : undefined}/>
              </button>
              <button type="button" onClick={() => {setOpen(false);triggerRef.current?.focus();}}
                className={styles.iconButton} title="Fechar avisos"
                aria-label="Fechar avisos">
                <X size={18}/>
              </button>
            </div>
          </header>
          <div className={styles.scroll} aria-live="polite" aria-busy={isLoading}>
            {hasError && <p role="alert" className={styles.error}>
              Não foi possível atualizar os avisos. Os itens anteriores podem estar desatualizados.
              Use o botão atualizar para tentar novamente.
            </p>}
            {!hasError && count === 0 && (
              <div className={styles.empty}>
                <Bell size={24}/>
                <strong>Nenhum aviso ativo</strong>
                <p>Seus registros estão sem pendências identificadas por esta verificação.</p>
              </div>
            )}
            {alerts.slice(0, visible).map(alert => (
              <Link
                key={alert.gestanteId}
                className={styles.item}
                href={"/dashboard/cadastro-clinico?gestante=" +
                  encodeURIComponent(alert.gestanteId) + "&aba=" + alert.aba}
                onClick={() => setOpen(false)}
              >
                <span className={alert.prioridade === "atencao" ?
                  styles.riskIcon : styles.documentIcon}>
                  <ClipboardList size={17} aria-hidden="true"/>
                </span>
                <span className={styles.itemDetails}>
                  <span className={styles.name}>{alert.nome}</span>
                  <small>{alert.codigo}</small>
                  {alert.motivos.map((motivo, i) => <span
                    key={i} className={styles.reason}>{motivo}</span>)}
                  <span className={styles.action}>Abrir acompanhamento →</span>
                </span>
              </Link>
            ))}
            {count > visible && <button className={styles.more} type="button"
              onClick={() => setVisible(value => value + 20)}>
              Mostrar mais avisos ({count - visible} restantes)
            </button>}
          </div>
          <footer className={styles.footer}>
            Avisos de conferência documental, não alertas de emergência.
            Visualizar não significa resolver. Os avisos desaparecem quando a
            condição deixa de constar nos registros.
          </footer>
        </section>
      )}
    </div>
  );
}
