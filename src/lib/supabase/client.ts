import { createBrowserClient } from "@supabase/ssr";
export function createClient(){const u=process.env.NEXT_PUBLIC_SUPABASE_URL;const k=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!u||!k)throw new Error("Supabase não configurado");return createBrowserClient(u,k)}
