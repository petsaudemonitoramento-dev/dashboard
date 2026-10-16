/**
 * Health-check estritamente público: não consulta autenticação, banco ou dados de usuários.
 * O monitoramento do Supabase continua independente desta rota.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
