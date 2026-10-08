"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function RedefinirSenhaPage() {
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSuccess(false);

    if (password !== confirmacao) {
      setMessage("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/redefinir-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const body = await response.json();

      if (!response.ok) {
        setMessage(
          body.error ?? "Não foi possível atualizar a senha."
        );
        return;
      }

      setSuccess(true);
      setMessage(
        "Senha atualizada. Entre novamente com a nova senha."
      );
      setPassword("");
      setConfirmacao("");
    } catch {
      setMessage("Não foi possível atualizar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="simple">
      <section>
        <h1>Definir nova senha</h1>

        <form onSubmit={submit}>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nova senha"
            minLength={10}
            maxLength={128}
            required
          />

          <input
            type="password"
            autoComplete="new-password"
            value={confirmacao}
            onChange={(event) =>
              setConfirmacao(event.target.value)
            }
            placeholder="Confirme a nova senha"
            minLength={10}
            maxLength={128}
            required
          />

          <button disabled={loading} type="submit">
            {loading ? "Atualizando..." : "Atualizar senha"}
          </button>
        </form>

        {message && <p>{message}</p>}

        {success && <Link href="/login">Ir para o login</Link>}
      </section>
    </main>
  );
}
