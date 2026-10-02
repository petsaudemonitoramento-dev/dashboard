import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { getPostgresClient } from "@/lib/db/postgres";
import { isUuid, logServerFailure } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 42;

type ReportData = {
  id: string;
  codigo: string;
  gestanteNome: string;
  dataNascimento: string | null;
  trimestre: number;
  pesoKg: number | null;
  alturaCm: number | null;
  imc: number | null;
  faixaImc: string;
  score: number;
  classificacao: string;
  conduta: string;
  observacao: string | null;
  profissionalNome: string;
  perfilProfissional: string;
  ubsOrigemNome: string;
  ubsAtendimentoNome: string;
  realizadaEm: string;
  instrumentoVersao: string;
  itens: Array<{ grupoTitulo: string; fatorTitulo: string; pontos: number; origem: string }>;
};

function pdfSafe(value: unknown): string {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json(
        { error: "Classificação não encontrada." },
        { status: 404 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

    if (
      !(await consumeRateLimit({
        scope: "risk-pdf",
        actorKey: user.id,
        limit: 60,
        windowSeconds: 300,
      }))
    ) {
      return NextResponse.json(
        { error: "Muitas solicitações de PDF. Tente novamente em alguns minutos." },
        { status: 429 }
      );
    }

    const sql = getPostgresClient();
    const rows = await sql<{ relatorio: ReportData }[]>`
      select private.obter_relatorio_classificacao_v30(
        ${user.id}::uuid,
        ${id}::uuid
      ) as relatorio
    `;
    const report = rows[0]?.relatorio;
    if (!report) return NextResponse.json({ error: "Classificação não encontrada." }, { status: 404 });

    const mode = new URL(request.url).searchParams.get("modo") === "pb" ? "pb" : "color";
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const purple = mode === "pb" ? rgb(.16,.16,.16) : rgb(.36,.20,.71);
    const soft = mode === "pb" ? rgb(.94,.94,.94) : rgb(.95,.93,.98);
    const text = rgb(.16,.14,.21);
    const muted = rgb(.38,.36,.42);

    let page: PDFPage = doc.addPage([A4.width, A4.height]);
    let y: number = A4.height - MARGIN;
    const addPage = () => { page = doc.addPage([A4.width, A4.height]); y = A4.height - MARGIN; };

    const ensure = (height: number) => { if (y - height < 74) addPage(); };
    const lineBlock = (value: string, x: number, maxWidth: number, size = 8.5, font = regular, color = text, lineHeight = 11) => {
      const lines = wrap(value, font, size, maxWidth);
      ensure(lines.length * lineHeight + 4);
      lines.forEach((line) => { page.drawText(line, { x, y, size, font, color }); y -= lineHeight; });
    };

    try {
      const petBytes = await readFile(path.join(process.cwd(), "public", "brand", "pet-saude-color.png"));
      const ufcgBytes = await readFile(path.join(process.cwd(), "public", "brand", "ufcg-horizontal-v10.png"));
      const pet = await doc.embedPng(petBytes);
      const ufcg = await doc.embedPng(ufcgBytes);
      page.drawImage(pet, { x: MARGIN, y: y - 32, width: 56, height: 30 });
      page.drawImage(ufcg, { x: A4.width - MARGIN - 112, y: y - 28, width: 112, height: 24 });
    } catch { /* PDF continua válido sem imagens caso os arquivos locais não existam. */ }

    page.drawText("CLASSIFICAÇÃO DE RISCO GESTACIONAL - APS", { x: 126, y: y - 5, size: 11, font: bold, color: purple });
    page.drawText("PET-Saúde UFCG", { x: 126, y: y - 19, size: 8, font: regular, color: muted });
    y -= 45;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y }, thickness: 1.2, color: purple });
    y -= 17;

    const infoRows = [
      ["Gestante", report.gestanteNome], ["Código", report.codigo],
      ["Data de nascimento", report.dataNascimento ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${report.dataNascimento}T12:00:00`)) : "Não informada"],
      ["Período gestacional", `${report.trimestre}º trimestre`],
      ["UBS do atendimento", report.ubsAtendimentoNome], ["Profissional", report.profissionalNome],
      ["Profissional vinculada à", report.ubsOrigemNome],
      ["Data e horário", new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(report.realizadaEm))],
    ];
    page.drawRectangle({ x: MARGIN, y: y - 102, width: A4.width - 2*MARGIN, height: 108, color: soft, borderColor: rgb(.78,.76,.82), borderWidth: .6 });
    const iy = y - 13;
    infoRows.forEach(([label, value], index) => {
      const col = index % 2; const row = Math.floor(index / 2);
      const x = MARGIN + 10 + col * 255; const yy = iy - row * 24;
      page.drawText(label, { x, y: yy, size: 6.7, font: bold, color: muted });
      const safeValue = pdfSafe(value);
      const short = safeValue.length > 46 ? `${safeValue.slice(0, 43)}...` : safeValue;
      page.drawText(short, { x, y: yy - 10, size: 8.2, font: regular, color: text });
    });
    y -= 122;

    page.drawText("RESULTADO", { x: MARGIN, y, size: 8, font: bold, color: purple }); y -= 15;
    const riskColor = mode === "pb" ? rgb(.15,.15,.15) : report.classificacao.includes("Alto") ? rgb(.72,.16,.22) : report.classificacao.includes("Médio") ? rgb(.68,.43,.04) : rgb(.10,.43,.28);
    page.drawText(pdfSafe(report.classificacao.toUpperCase()), { x: MARGIN, y, size: 17, font: bold, color: riskColor });
    page.drawText(`ESCORE TOTAL: ${report.score}`, { x: A4.width - MARGIN - 130, y: y + 2, size: 11, font: bold, color: riskColor });
    y -= 20;
    page.drawText(pdfSafe(`Peso: ${report.pesoKg ?? "-"} kg    Altura: ${report.alturaCm ?? "-"} cm    IMC: ${report.imc?.toFixed(1) ?? "-"} (${report.faixaImc})`), { x: MARGIN, y, size: 8.3, font: regular, color: text });
    y -= 19;

    page.drawText("FATORES IDENTIFICADOS", { x: MARGIN, y, size: 8, font: bold, color: purple }); y -= 13;
    if (!report.itens.length) { lineBlock("Nenhum fator selecionado além da avaliação nutricional.", MARGIN, A4.width - 2*MARGIN); }
    else {
      for (const item of report.itens) {
        const label = `${item.grupoTitulo}: ${item.fatorTitulo} — ${item.pontos} ponto${item.pontos === 1 ? "" : "s"}`;
        lineBlock(`• ${label}`, MARGIN + 2, A4.width - 2*MARGIN - 4, 8.2, regular, text, 10.5);
      }
    }
    y -= 4;
    ensure(65);
    page.drawText("CONDUTA SUGERIDA PELO INSTRUMENTO", { x: MARGIN, y, size: 8, font: bold, color: purple }); y -= 13;
    lineBlock(report.conduta, MARGIN, A4.width - 2*MARGIN, 8.4, regular, text, 11);
    if (report.observacao) { y -= 5; page.drawText("OBSERVAÇÕES", { x: MARGIN, y, size: 8, font: bold, color: purple }); y -= 13; lineBlock(report.observacao, MARGIN, A4.width - 2*MARGIN, 8.2, regular, text, 10.5); }

    ensure(105); y -= 15;
    page.drawLine({ start:{x:MARGIN,y}, end:{x:MARGIN+210,y}, thickness:.7, color:text });
    page.drawLine({ start:{x:A4.width-MARGIN-210,y}, end:{x:A4.width-MARGIN,y}, thickness:.7, color:text });
    page.drawText("Assinatura da profissional", { x:MARGIN+55, y:y-13, size:7.2, font:regular, color:muted });
    page.drawText("Carimbo", { x:A4.width-MARGIN-125, y:y-13, size:7.2, font:regular, color:muted });
    y -= 34;
    page.drawText(pdfSafe(`Instrumento: ${report.instrumentoVersao}`), { x:MARGIN, y, size:6.5, font:regular, color:muted });
    page.drawText(`Registro auditável: ${report.id}`, { x:MARGIN, y:y-10, size:6.5, font:regular, color:muted });

    const bytes = await doc.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="classificacao-risco-${report.codigo}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logServerFailure("risk-pdf", error);
    return NextResponse.json(
      { error: "Não foi possível gerar o PDF." },
      { status: 500 }
    );
  }
}
