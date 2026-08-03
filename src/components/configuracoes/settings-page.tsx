"use client";

import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LogOut,
  MonitorCog,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings-page.module.css";

type AccountData = {
  displayName: string;
  email: string;
  profile: string;
  profileLabel: string;
  scopeDescription: string;
  status: string;
  ubsName: string | null;
};

type SystemData = { developer: string; version: string };
type Feedback = { tone: "success" | "error"; text: string } | null;

function applyPreferences(compact: boolean, reduceMotion: boolean) {
  document.documentElement.dataset.density = compact ? "compact" : "comfortable";
  document.documentElement.dataset.reduceMotion = reduceMotion ? "true" : "false";
}

export function SettingsPage({
  account,
  system,
}: {
  account: AccountData;
  system: SystemData;
}) {
  const router = useRouter();
  const [compact, setCompact] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [preferenceFeedback, setPreferenceFeedback] = useState<Feedback>(null);

  useEffect(() => {
    const storedCompact =
      window.localStorage.getItem("dashboard-density") === "compact";
    const storedReduced =
      window.localStorage.getItem("dashboard-reduced-motion") === "true";

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCompact(storedCompact);
     
    setReduceMotion(storedReduced);
    applyPreferences(storedCompact, storedReduced);
  }, []);

  function savePreferences() {
    window.localStorage.setItem(
      "dashboard-density",
      compact ? "compact" : "comfortable"
    );
    window.localStorage.setItem(
      "dashboard-reduced-motion",
      String(reduceMotion)
    );
    applyPreferences(compact, reduceMotion);
    setPreferenceFeedback({
      tone: "success",
      text: "Preferências aplicadas neste navegador.",
    });
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFeedback(null);
    setSavingPassword(true);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");

    if (password.length < 8) {
      setPasswordFeedback({
        tone: "error",
        text: "A nova senha precisa ter pelo menos 8 caracteres.",
      });
      setSavingPassword(false);
      return;
    }

    if (password !== confirmation) {
      setPasswordFeedback({
        tone: "error",
        text: "A confirmação não corresponde à nova senha.",
      });
      setSavingPassword(false);
      return;
    }

    try {
      const response = await fetch("/api/configuracoes/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Não foi possível alterar a senha.");
      }

      event.currentTarget.reset();
      setPasswordFeedback({ tone: "success", text: "Senha alterada com sucesso." });
    } catch (error) {
      setPasswordFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível alterar a senha.",
      });
    } finally {
      setSavingPassword(false);
    }
  }

  async function signOut() {
    setSigningOut(true);

    try {
      const response = await fetch("/api/configuracoes/sair", { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível encerrar a sessão.");
      router.push("/login");
      router.refresh();
    } catch (error) {
      setPasswordFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível encerrar a sessão.",
      });
      setSigningOut(false);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.heading}>
        <div>
          <span>Conta e preferências</span>
          <h1>Configurações</h1>
          <p>
            Consulte seu vínculo, ajuste a interface e gerencie a segurança
            da conta.
          </p>
        </div>
        <div className={styles.accountBadge}>
          <BadgeCheck size={18} />
          Conta {account.status.toLocaleLowerCase("pt-BR")}
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.mainColumn}>
          <article className={styles.card}>
            <header className={styles.cardHeader}>
              <span className={styles.icon}><UserRound size={21} /></span>
              <div>
                <h2>Dados da conta</h2>
                <p>Informações vinculadas ao acesso institucional.</p>
              </div>
            </header>

            <div className={styles.accountGrid}>
              <div><small>Nome</small><strong>{account.displayName}</strong></div>
              <div><small>E-mail</small><strong>{account.email}</strong></div>
              <div><small>Perfil</small><strong>{account.profileLabel}</strong></div>
              <div>
                <small>Situação</small>
                <strong className={styles.activeStatus}>
                  <CheckCircle2 size={15} />{account.status}
                </strong>
              </div>
              <div className={styles.wideField}>
                <small>Escopo autorizado</small>
                <strong>{account.scopeDescription}</strong>
              </div>
              <div className={styles.wideField}>
                <small>Unidade vinculada</small>
                <strong>
                  <Building2 size={16} />
                  {account.ubsName ?? "Sem UBS aplicável a este perfil"}
                </strong>
              </div>
            </div>

            <div className={styles.readOnlyNote}>
              <Info size={17} />
              Nome, perfil, UBS e microáreas são dados institucionais. Alterações
              de vínculo devem ser solicitadas à gestão municipal.
            </div>
          </article>

          <article className={styles.card}>
            <header className={styles.cardHeader}>
              <span className={styles.icon}><MonitorCog size={21} /></span>
              <div>
                <h2>Preferências da interface</h2>
                <p>As escolhas ficam armazenadas apenas neste navegador.</p>
              </div>
            </header>

            <div className={styles.preferenceList}>
              <label className={styles.preference}>
                <span>
                  <strong>Modo compacto</strong>
                  <small>Reduz espaços da navegação e da área de conteúdo.</small>
                </span>
                <input
                  checked={compact}
                  onChange={(event) => setCompact(event.target.checked)}
                  type="checkbox"
                />
              </label>

              <label className={styles.preference}>
                <span>
                  <strong>Reduzir animações</strong>
                  <small>Minimiza movimentos e transições da interface.</small>
                </span>
                <input
                  checked={reduceMotion}
                  onChange={(event) => setReduceMotion(event.target.checked)}
                  type="checkbox"
                />
              </label>
            </div>

            {preferenceFeedback && (
              <div className={`${styles.feedback} ${styles[preferenceFeedback.tone]}`}>
                {preferenceFeedback.text}
              </div>
            )}

            <button className={styles.secondaryAction} onClick={savePreferences} type="button">
              <Save size={17} />Salvar preferências
            </button>
          </article>

          <article className={styles.card}>
            <header className={styles.cardHeader}>
              <span className={styles.icon}><KeyRound size={21} /></span>
              <div>
                <h2>Segurança</h2>
                <p>Use uma senha exclusiva para este sistema.</p>
              </div>
            </header>

            <form className={styles.passwordForm} onSubmit={updatePassword}>
              <label>
                Nova senha
                <span className={styles.passwordField}>
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    name="password"
                    placeholder="Mínimo de 8 caracteres"
                    required
                    type={showPassword ? "text" : "password"}
                  />
                  <button
                    aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                    onClick={() => setShowPassword((value) => !value)}
                    type="button"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>

              <label>
                Confirmar nova senha
                <input
                  autoComplete="new-password"
                  minLength={8}
                  name="confirmation"
                  placeholder="Repita a nova senha"
                  required
                  type={showPassword ? "text" : "password"}
                />
              </label>

              {passwordFeedback && (
                <div className={`${styles.feedback} ${styles[passwordFeedback.tone]}`}>
                  {passwordFeedback.text}
                </div>
              )}

              <div className={styles.securityActions}>
                <button className={styles.primaryAction} disabled={savingPassword} type="submit">
                  <ShieldCheck size={17} />
                  {savingPassword ? "Alterando..." : "Alterar senha"}
                </button>
                <button
                  className={styles.logoutAction}
                  disabled={signingOut}
                  onClick={() => void signOut()}
                  type="button"
                >
                  <LogOut size={17} />
                  {signingOut ? "Saindo..." : "Encerrar sessão"}
                </button>
              </div>
            </form>
          </article>
        </section>

        <aside className={styles.sideColumn}>
          <article className={styles.systemCard}>
            <span className={styles.systemIcon}><ShieldCheck size={23} /></span>
            <h2>Informações do sistema</h2>
            <dl>
              <div><dt>Versão</dt><dd>{system.version}</dd></div>
              <div><dt>Desenvolvimento</dt><dd>{system.developer}</dd></div>
              <div><dt>Perfil técnico</dt><dd>{account.profile}</dd></div>
            </dl>
            <p>
              O acesso e as funcionalidades são limitados conforme o perfil,
              a unidade e o território autorizados.
            </p>
          </article>

          <article className={styles.privacyCard}>
            <ShieldCheck size={20} />
            <div>
              <strong>Privacidade por padrão</strong>
              <p>
                Preferências visuais não armazenam dados clínicos. Informações
                de conta permanecem vinculadas ao ambiente institucional.
              </p>
            </div>
          </article>
        </aside>
      </div>
    </div>
  );
}
