import type { ReactNode } from "react";
import { connection } from "next/server";

export default async function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Nonces precisam ser criados por resposta. O limite dinâmico fica restrito
  // às seis páginas públicas de autenticação deste route group.
  await connection();
  return children;
}