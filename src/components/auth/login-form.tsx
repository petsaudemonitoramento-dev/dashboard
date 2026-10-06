"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { APP_CONFIG } from "@/config/app";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  User,
  UserPlus,
} from "@/config/icons";

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] =
    useState<"error" | "success">("error");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const normalized = identifier.trim().toLowerCase();

      if (!normalized.includes("@")) {
        throw new Error(
          "Nesta primeira versão, informe o e-mail completo."
        );
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalized,
          password,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ?? "Não foi possível realizar o login."
        );
      }

      setMessageType("success");
      setMessage("Login realizado com sucesso.");
      window.location.href = "/dashboard";
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível realizar o login."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o login com Google."
      );
      setLoading(false);
    }
  }

  return (
    <div className="login-card">
      <header className="login-header">
        <div className="login-icon">
          <LockKeyhole size={31} strokeWidth={1.9} />
        </div>

        <div>
          <h2>Entrar</h2>
          <p>Acesse sua conta para continuar</p>
        </div>
      </header>

      <button
        type="button"
        className="google-button"
        onClick={handleGoogleLogin}
        disabled={loading}
      >
        <Image
          src="/brand/google-g.svg"
          alt=""
          width={26}
          height={26}
        />
        <span>Continuar com Google</span>
      </button>

      <div className="login-divider">
        <span />
        <p>ou entre com usuário e senha</p>
        <span />
      </div>

      <form onSubmit={handleLogin}>
        <label htmlFor="identifier">E-mail ou usuário</label>

        <div className="input-container">
          <User size={22} strokeWidth={1.7} />
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            placeholder="Digite seu e-mail ou usuário"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </div>

        <label htmlFor="password">Senha</label>

        <div className="input-container">
          <LockKeyhole size={21} strokeWidth={1.7} />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button
            type="button"
            className="password-toggle"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
          </button>
        </div>

        <div className="login-options">
          <label className="remember-option">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span className="checkbox-visual" />
            Lembrar de mim
          </label>

          <Link href="/recuperar-senha" className="forgot-button">
            Esqueci minha senha
          </Link>
        </div>

        {message && (
          <div className={`login-message login-message-${messageType}`}>
            {message}
          </div>
        )}

        <button
          type="submit"
          className="login-button"
          disabled={loading}
        >
          <LogIn size={23} strokeWidth={1.7} />
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div className="login-divider account-divider">
        <span />
        <p>Não tem uma conta?</p>
        <span />
      </div>

      <Link href="/cadastro" className="create-account-button">
        <UserPlus size={23} strokeWidth={1.7} />
        Criar conta
      </Link>

      <footer className="login-footer">
        <ShieldCheck size={21} strokeWidth={1.7} />
        <span>
          Acesso destinado a profissionais autorizados.
        </span>
      </footer>

      <div className="mobile-version">
        <span>Versão {APP_CONFIG.version}</span>
        <span>Desenvolvido por {APP_CONFIG.developer}</span>
      </div>
    </div>
  );
}
