"use client";

import { useState } from "react";

export function ResendConfirmation({ email, disabled = false }: { email: string; disabled?: boolean }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function resend() {
    const normalized = email.trim().toLowerCase();
    setMessage("");
    setFailed(false);
    if (!normalized || !normalized.includes("@")) {
      setFailed(true);
      setMessage("Informe seu e-mail no campo acima.");
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/auth/reenviar-confirmacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível reenviar. Tente mais tarde.");
      setMessage(body.message);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Não foi possível reenviar. Tente mais tarde.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="confirmation-resend">
      <button type="button" className="confirmation-resend-button" disabled={disabled || sending} onClick={resend}>
        {sending ? "Reenviando..." : "Reenviar e-mail de confirmação"}
      </button>
      {message && <p className={failed ? "confirmation-resend-error" : ""} role={failed ? "alert" : "status"}>{message}</p>}
    </div>
  );
}
