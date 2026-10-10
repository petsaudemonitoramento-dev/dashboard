"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/recuperar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();

      setMessage(
        response.status === 429
          ? body.error
          : "Se o e-mail estiver cadastrado, enviaremos as instruções."
      );
    } catch {
      setMessage(
        "Não foi possível processar a solicitação agora."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="simple">
      <section aria-labelledby="recuperar-senha-titulo">
        <h1 id="recuperar-senha-titulo">Recuperar senha</h1>
        <form onSubmit={send}>
          <label htmlFor="recuperar-email">E-mail</label>
          <input
            id="recuperar-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Seu e-mail"
            maxLength={254}
            required
          />
          <button disabled={loading} type="submit">
            {loading ? "Enviando..." : "Enviar instruções"}
          </button>
        </form>
        {message && (
          <p aria-live="polite" role="status">
            {message}
          </p>
        )}
        <Link href="/login">Voltar</Link>
      </section>
    </main>
  );
}