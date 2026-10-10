import {LoginBrandPanel} from "@/components/auth/login-brand-panel";import {LoginForm} from "@/components/auth/login-form";export default function Page(){return <main className="login-page"><LoginBrandPanel/><section className="access"><LoginForm/></section></main>}

// Apenas branch experimental: assegura SSR para o Next.js anexar nonces.
// Esta configuração NÃO será levada à main sem benchmark e aprovação.
export const dynamic = "force-dynamic";
