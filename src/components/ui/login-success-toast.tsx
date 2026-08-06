"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

const LOGIN_SUCCESS_KEY = "dashboard-login-success-at";
const RECENT_LOGIN_WINDOW_MS = 2 * 60 * 1000;

export function LoginSuccessToast() {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const storedValue = window.sessionStorage.getItem(LOGIN_SUCCESS_KEY);
    window.sessionStorage.removeItem(LOGIN_SUCCESS_KEY);

    const loginAt = Number(storedValue);
    const isRecentLogin =
      Number.isFinite(loginAt) &&
      Date.now() - loginAt >= 0 &&
      Date.now() - loginAt <= RECENT_LOGIN_WINDOW_MS;

    const url = new URL(window.location.href);
    const isLoginRedirect = url.searchParams.get("login") === "success";

    if (isLoginRedirect) {
      url.searchParams.delete("login");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    if (!isRecentLogin && !isLoginRedirect) {
      return;
    }

    const showTimer = window.setTimeout(() => setVisible(true), 40);
    const closeTimer = window.setTimeout(() => setClosing(true), 2800);
    const removeTimer = window.setTimeout(() => setVisible(false), 3050);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(closeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className={`login-success-toast${closing ? " is-closing" : ""}`}
      role="status"
    >
      <CheckCircle2 aria-hidden="true" size={22} strokeWidth={2.1} />
      <span>Login realizado com sucesso</span>
    </div>
  );
}
