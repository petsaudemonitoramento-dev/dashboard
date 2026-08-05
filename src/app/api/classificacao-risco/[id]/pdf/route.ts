import { NextResponse } from "next/server";
import {
  PDFDocument,
  rgb,
  type PDFPage,
  type PDFFont,
  type RGB,
} from "pdf-lib";
import { getClinicalTeamContext } from "@/lib/auth/guards";
import {
  A4,
  REPORT_FOOTER_LIMIT,
  REPORT_MARGIN,
  createReportContext,
  drawInfoGrid,
  drawReportFooter,
  drawReportHeader,
  drawSectionTitle,
  pdfSafe,
  truncateText,
  wrapText,
  type ReportMode,
} from "@/lib/pdf/relatorio-base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  itens: Array<{
    grupoTitulo: string;
    fatorTitulo: string;
    pontos: number;
    origem: string;
  }>;
};

type RiskPalette = {
  accent: RGB;
  fill: RGB;
};

function parseBirthDate(
  value: string | null,
): Date | null {
  if (!value) return null;

  const iso =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const parsed =
      new Date(year, month - 1, day, 12, 0, 0);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return null;
    }

    return parsed;
  }

  const br =
    /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);

  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const parsed =
      new Date(year, month - 1, day, 12, 0, 0);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      return null;
    }

    return parsed;
  }

  return null;
}

function formatBirthDate(
  value: string | null,
  referenceDate: Date,
): string {
  const birthDate = parseBirthDate(value);

  if (!birthDate) {
    return value
      ? `${value} (revisar cadastro)`
      : "Não informada";
  }

  const year = birthDate.getFullYear();

  if (
    year < 1900 ||
    birthDate > referenceDate
  ) {
    return "Data inconsistente - revisar cadastro";
  }

  let age =
    referenceDate.getFullYear() - year;

  const birthdayNotReached =
    referenceDate.getMonth() <
      birthDate.getMonth() ||
    (
      referenceDate.getMonth() ===
        birthDate.getMonth() &&
      referenceDate.getDate() <
        birthDate.getDate()
    );

  if (birthdayNotReached) age -= 1;

  const formatted =
    new Intl.DateTimeFormat("pt-BR")
      .format(birthDate);

  return `${formatted} (${age} anos)`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatOrigin(value: string): string {
  const normalized =
    value.trim().toLocaleLowerCase("pt-BR");

  if (normalized === "manual") {
    return "Informado pela equipe";
  }

  if (normalized === "calculado") {
    return "Calculado pelo sistema";
  }

  if (normalized === "importado") {
    return "Importado";
  }

  return value || "Não informada";
}

function getRiskPalette(
  classification: string,
  mode: ReportMode,
): RiskPalette {
  if (mode === "pb") {
    return {
      accent: rgb(0.11, 0.11, 0.11),
      fill: rgb(0.94, 0.94, 0.94),
    };
  }

  const normalized =
    classification.toLocaleLowerCase("pt-BR");

  if (normalized.includes("alto")) {
    return {
      accent: rgb(0.70, 0.13, 0.19),
      fill: rgb(0.99, 0.93, 0.94),
    };
  }

  if (
    normalized.includes("médio") ||
    normalized.includes("medio")
  ) {
    return {
      accent: rgb(0.66, 0.42, 0.03),
      fill: rgb(0.99, 0.97, 0.89),
    };
  }

  return {
    accent: rgb(0.08, 0.42, 0.27),
    fill: rgb(0.92, 0.98, 0.95),
  };
}

function fitFontSize(
  value: string,
  font: PDFFont,
  preferredSize: number,
  minimumSize: number,
  maxWidth: number,
): number {
  let size = preferredSize;
  const safe = pdfSafe(value);

  while (
    size > minimumSize &&
    font.widthOfTextAtSize(safe, size) >
      maxWidth
  ) {
    size -= 0.5;
  }

  return size;
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const { id } = await context.params;
    const authContext =
      await getClinicalTeamContext();

    if (!authContext) {
      return NextResponse.json(
        {
          error:
            "Acesso clínico permitido somente à equipe elegível da UBS.",
        },
        { status: 403 },
      );
    }

    const { sql, user } = authContext;

    const rows =
      await sql<{ relatorio: ReportData }[]>`
        select private.obter_relatorio_classificacao_v17(
          ${user.id}::uuid,
          ${id}::uuid
        ) as relatorio
      `;

    const report = rows[0]?.relatorio;

    if (!report) {
      return NextResponse.json(
        {
          error:
            "Classificação não encontrada.",
        },
        { status: 404 },
      );
    }

    const mode: ReportMode =
      new URL(request.url)
        .searchParams
        .get("modo") === "pb"
        ? "pb"
        : "color";

    const doc = await PDFDocument.create();

    const reportContext =
      await createReportContext(doc, mode);

    const { regular, bold, theme } =
      reportContext;

    const risk = getRiskPalette(
      report.classificacao,
      mode,
    );

    const headerOptions = {
      title:
        "Classificação de Risco Gestacional",
      subtitle:
        "PET-Saúde UFCG | Atenção Primária à Saúde",
      documentCode:
        `Registro ${report.codigo}`,
    };

    let page: PDFPage =
      doc.addPage([A4.width, A4.height]);

    let y = drawReportHeader(
      page,
      reportContext,
      headerOptions,
    );

    const newPage = (): void => {
      page =
        doc.addPage([A4.width, A4.height]);

      y = drawReportHeader(
        page,
        reportContext,
        headerOptions,
      );
    };

    const ensureSpace = (
      requiredHeight: number,
    ): void => {
      if (
        y - requiredHeight <
        REPORT_FOOTER_LIMIT
      ) {
        newPage();
      }
    };

    y = drawSectionTitle(
      page,
      reportContext,
      "Identificação assistencial",
      y,
    );

    const referenceDate =
      new Date(report.realizadaEm);

    const professionalValue =
      report.perfilProfissional
        ? `${report.profissionalNome} - ${report.perfilProfissional}`
        : report.profissionalNome;

    y = drawInfoGrid(
      page,
      reportContext,
      [
        [
          "Nome da paciente",
          report.gestanteNome,
        ],
        [
          "Código do registro",
          report.codigo,
        ],
        [
          "Nascimento / idade",
          formatBirthDate(
            report.dataNascimento,
            referenceDate,
          ),
        ],
        [
          "Período gestacional",
          `${report.trimestre}º trimestre`,
        ],
        [
          "UBS do atendimento",
          report.ubsAtendimentoNome,
        ],
        [
          "Profissional responsável",
          professionalValue,
        ],
        [
          "UBS de vínculo",
          report.ubsOrigemNome,
        ],
        [
          "Data e horário do registro",
          formatDateTime(
            report.realizadaEm,
          ),
        ],
      ],
      y,
    );

    const resultHeight = 78;

    ensureSpace(resultHeight + 30);

    y = drawSectionTitle(
      page,
      reportContext,
      "Resultado da classificação",
      y,
    );

    page.drawRectangle({
      x: REPORT_MARGIN,
      y: y - resultHeight,
      width:
        A4.width - 2 * REPORT_MARGIN,
      height: resultHeight,
      color: risk.fill,
      borderColor: risk.accent,
      borderWidth: 0.9,
    });

    page.drawRectangle({
      x: REPORT_MARGIN,
      y: y - resultHeight,
      width: 5,
      height: resultHeight,
      color: risk.accent,
    });

    page.drawText("CLASSIFICAÇÃO", {
      x: REPORT_MARGIN + 16,
      y: y - 16,
      size: 6.4,
      font: bold,
      color: theme.muted,
    });

    const classificationSize =
      fitFontSize(
        report.classificacao.toUpperCase(),
        bold,
        17.5,
        12,
        310,
      );

    page.drawText(
      pdfSafe(
        report.classificacao.toUpperCase(),
      ),
      {
        x: REPORT_MARGIN + 16,
        y: y - 37,
        size: classificationSize,
        font: bold,
        color: risk.accent,
      },
    );

    const scoreBoxWidth = 102;
    const scoreBoxX =
      A4.width -
      REPORT_MARGIN -
      scoreBoxWidth -
      10;

    page.drawRectangle({
      x: scoreBoxX,
      y: y - 52,
      width: scoreBoxWidth,
      height: 39,
      color: theme.white,
      borderColor: risk.accent,
      borderWidth: 0.6,
    });

    page.drawText("ESCORE TOTAL", {
      x: scoreBoxX + 10,
      y: y - 26,
      size: 6.1,
      font: bold,
      color: theme.muted,
    });

    const scoreText =
      String(report.score);

    const scoreWidth =
      bold.widthOfTextAtSize(
        scoreText,
        18,
      );

    page.drawText(scoreText, {
      x:
        scoreBoxX +
        scoreBoxWidth -
        10 -
        scoreWidth,
      y: y - 43,
      size: 18,
      font: bold,
      color: risk.accent,
    });

    const metricY = y - 66;
    const metricStartX =
      REPORT_MARGIN + 16;
    const metricWidth = 104;

    const metrics = [
      [
        "PESO",
        report.pesoKg === null
          ? "-"
          : `${report.pesoKg} kg`,
      ],
      [
        "ALTURA",
        report.alturaCm === null
          ? "-"
          : `${report.alturaCm} cm`,
      ],
      [
        "IMC",
        report.imc === null
          ? "-"
          : `${report.imc.toFixed(1)} - ${report.faixaImc}`,
      ],
    ];

    metrics.forEach(
      ([label, value], index) => {
        const x =
          metricStartX +
          index * metricWidth;

        if (index > 0) {
          page.drawLine({
            start: {
              x: x - 9,
              y: metricY - 2,
            },
            end: {
              x: x - 9,
              y: metricY + 16,
            },
            thickness: 0.35,
            color: theme.border,
          });
        }

        page.drawText(label, {
          x,
          y: metricY + 9,
          size: 5.8,
          font: bold,
          color: theme.muted,
        });

        page.drawText(
          truncateText(
            value,
            regular,
            7.5,
            metricWidth - 18,
          ),
          {
            x,
            y: metricY - 1,
            size: 7.5,
            font: regular,
            color: theme.text,
          },
        );
      },
    );

    y -= resultHeight + 14;

    ensureSpace(60);

    y = drawSectionTitle(
      page,
      reportContext,
      "Fatores identificados",
      y,
    );

    if (!report.itens.length) {
      const emptyHeight = 38;

      ensureSpace(emptyHeight + 8);

      page.drawRectangle({
        x: REPORT_MARGIN,
        y: y - emptyHeight,
        width:
          A4.width - 2 * REPORT_MARGIN,
        height: emptyHeight,
        color: theme.surface,
        borderColor: theme.border,
        borderWidth: 0.6,
      });

      page.drawText(
        "Nenhum fator selecionado além da avaliação nutricional.",
        {
          x: REPORT_MARGIN + 12,
          y: y - 23,
          size: 8.2,
          font: regular,
          color: theme.text,
        },
      );

      y -= emptyHeight + 8;
    } else {
      report.itens.forEach(
        (
          item: ReportData["itens"][number],
          index: number,
        ) => {
          const pointsAreaWidth = 72;

          const contentWidth =
            A4.width -
            2 * REPORT_MARGIN -
            pointsAreaWidth -
            30;

          const groupLines = wrapText(
            item.grupoTitulo.toUpperCase(),
            bold,
            6.1,
            contentWidth,
          );

          const factorLines = wrapText(
            item.fatorTitulo,
            regular,
            8.1,
            contentWidth,
          );

          const cardHeight = Math.max(
            42,
            13 +
              groupLines.length * 7.2 +
              factorLines.length * 9.4 +
              15,
          );

          ensureSpace(cardHeight + 7);

          const cardY = y - cardHeight;

          page.drawRectangle({
            x: REPORT_MARGIN,
            y: cardY,
            width:
              A4.width -
              2 * REPORT_MARGIN,
            height: cardHeight,
            color:
              index % 2 === 0
                ? theme.surface
                : theme.white,
            borderColor: theme.border,
            borderWidth: 0.55,
          });

          page.drawRectangle({
            x: REPORT_MARGIN,
            y: cardY,
            width: 3.5,
            height: cardHeight,
            color: theme.primary,
          });

          let textY = y - 12;

          groupLines.forEach((line) => {
            page.drawText(line, {
              x: REPORT_MARGIN + 12,
              y: textY,
              size: 6.1,
              font: bold,
              color: theme.muted,
            });

            textY -= 7.2;
          });

          textY -= 2;

          factorLines.forEach((line) => {
            page.drawText(line, {
              x: REPORT_MARGIN + 12,
              y: textY,
              size: 8.1,
              font: regular,
              color: theme.text,
            });

            textY -= 9.4;
          });

          page.drawText(
            pdfSafe(
              `Origem: ${formatOrigin(item.origem)}`,
            ),
            {
              x: REPORT_MARGIN + 12,
              y: cardY + 8,
              size: 6.2,
              font: regular,
              color: theme.muted,
            },
          );

          const badgeWidth = 56;
          const badgeHeight = 27;

          const badgeX =
            A4.width -
            REPORT_MARGIN -
            badgeWidth -
            10;

          const badgeY =
            cardY +
            (cardHeight - badgeHeight) / 2;

          page.drawRectangle({
            x: badgeX,
            y: badgeY,
            width: badgeWidth,
            height: badgeHeight,
            color: theme.primary,
          });

          const pointsValue =
            String(item.pontos);

          const pointsSize = 12;

          const pointsWidth =
            bold.widthOfTextAtSize(
              pointsValue,
              pointsSize,
            );

          page.drawText(pointsValue, {
            x:
              badgeX +
              (badgeWidth - pointsWidth) / 2,
            y: badgeY + 11,
            size: pointsSize,
            font: bold,
            color: theme.white,
          });

          const pointsLabel =
            item.pontos === 1
              ? "PONTO"
              : "PONTOS";

          const pointsLabelWidth =
            bold.widthOfTextAtSize(
              pointsLabel,
              5.1,
            );

          page.drawText(pointsLabel, {
            x:
              badgeX +
              (
                badgeWidth -
                pointsLabelWidth
              ) /
                2,
            y: badgeY + 4,
            size: 5.1,
            font: bold,
            color: theme.white,
          });

          y = cardY - 7;
        },
      );
    }

    const drawTextPanel = (
      title: string,
      value: string,
      accent: RGB,
    ): void => {
      const textWidth =
        A4.width -
        2 * REPORT_MARGIN -
        30;

      const lines = wrapText(
        value,
        regular,
        8.3,
        textWidth,
      );

      const panelHeight = Math.max(
        42,
        20 + lines.length * 10.2,
      );

      ensureSpace(panelHeight + 30);

      y = drawSectionTitle(
        page,
        reportContext,
        title,
        y,
      );

      page.drawRectangle({
        x: REPORT_MARGIN,
        y: y - panelHeight,
        width:
          A4.width - 2 * REPORT_MARGIN,
        height: panelHeight,
        color: theme.surface,
        borderColor: theme.border,
        borderWidth: 0.6,
      });

      page.drawRectangle({
        x: REPORT_MARGIN,
        y: y - panelHeight,
        width: 4,
        height: panelHeight,
        color: accent,
      });

      lines.forEach(
        (line, lineIndex) => {
          page.drawText(line, {
            x: REPORT_MARGIN + 13,
            y:
              y -
              18 -
              lineIndex * 10.2,
            size: 8.3,
            font: regular,
            color: theme.text,
          });
        },
      );

      y -= panelHeight + 11;
    };

    drawTextPanel(
      "Conduta sugerida pelo instrumento",
      report.conduta,
      risk.accent,
    );

    if (report.observacao) {
      drawTextPanel(
        "Observações registradas",
        report.observacao,
        theme.primary,
      );
    }

    ensureSpace(130);

    y = drawSectionTitle(
      page,
      reportContext,
      "Validação profissional",
      y,
    );

    y -= 15;

    const signatureWidth = 235;

    const rightSignatureX =
      A4.width -
      REPORT_MARGIN -
      signatureWidth;

    page.drawLine({
      start: {
        x: REPORT_MARGIN,
        y,
      },
      end: {
        x:
          REPORT_MARGIN +
          signatureWidth,
        y,
      },
      thickness: 0.65,
      color: theme.text,
    });

    page.drawLine({
      start: {
        x: rightSignatureX,
        y,
      },
      end: {
        x: A4.width - REPORT_MARGIN,
        y,
      },
      thickness: 0.65,
      color: theme.text,
    });

    page.drawText(
      "Assinatura do(a) profissional",
      {
        x: REPORT_MARGIN,
        y: y - 12,
        size: 6.4,
        font: regular,
        color: theme.muted,
      },
    );

    page.drawText(
      "Carimbo / conselho profissional",
      {
        x: rightSignatureX,
        y: y - 12,
        size: 6.4,
        font: regular,
        color: theme.muted,
      },
    );

    page.drawText(
      truncateText(
        report.profissionalNome,
        bold,
        7.2,
        signatureWidth,
      ),
      {
        x: REPORT_MARGIN,
        y: y - 24,
        size: 7.2,
        font: bold,
        color: theme.text,
      },
    );

    if (report.perfilProfissional) {
      page.drawText(
        truncateText(
          report.perfilProfissional,
          regular,
          6.3,
          signatureWidth,
        ),
        {
          x: REPORT_MARGIN,
          y: y - 34,
          size: 6.3,
          font: regular,
          color: theme.muted,
        },
      );
    }

    y -= 55;

    const metadataHeight = 31;

    page.drawRectangle({
      x: REPORT_MARGIN,
      y: y - metadataHeight,
      width:
        A4.width - 2 * REPORT_MARGIN,
      height: metadataHeight,
      color: theme.primarySoft,
      borderColor: theme.border,
      borderWidth: 0.45,
    });

    page.drawText(
      truncateText(
        `Instrumento: ${report.instrumentoVersao}`,
        regular,
        6.1,
        A4.width -
          2 * REPORT_MARGIN -
          18,
      ),
      {
        x: REPORT_MARGIN + 9,
        y: y - 12,
        size: 6.1,
        font: regular,
        color: theme.muted,
      },
    );

    page.drawText(
      truncateText(
        `Registro auditável: ${report.id}`,
        regular,
        6.1,
        A4.width -
          2 * REPORT_MARGIN -
          18,
      ),
      {
        x: REPORT_MARGIN + 9,
        y: y - 23,
        size: 6.1,
        font: regular,
        color: theme.muted,
      },
    );

    const pages = doc.getPages();

    pages.forEach(
      (currentPage, index) => {
        drawReportFooter(
          currentPage,
          reportContext,
          {
            pageNumber: index + 1,
            totalPages: pages.length,
            systemVersion:
              "Dashboard PET-Saúde | Modelo V2",
          },
        );
      },
    );

    const bytes = await doc.save();

    return new NextResponse(
      Buffer.from(bytes),
      {
        headers: {
          "Content-Type":
            "application/pdf",
          "Content-Disposition":
            `attachment; filename="classificacao-risco-${report.codigo}.pdf"`,
          "Cache-Control":
            "private, no-store, max-age=0",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    console.error(
      "Erro ao gerar PDF:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar o PDF.",
      },
      { status: 500 },
    );
  }
}
