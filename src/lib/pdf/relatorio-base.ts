import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFPage,
  type PDFFont,
  type RGB,
} from "pdf-lib";

export const A4 = { width: 595.28, height: 841.89 };
export const REPORT_MARGIN = 38;
export const REPORT_FOOTER_LIMIT = 64;

export type ReportMode = "color" | "pb";

export type ReportTheme = {
  primary: RGB;
  primarySoft: RGB;
  surface: RGB;
  text: RGB;
  muted: RGB;
  border: RGB;
  white: RGB;
};

export type ReportContext = {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  mode: ReportMode;
  theme: ReportTheme;
  petAvatar?: PDFImage;
  ufcgLogo?: PDFImage;
};

export function pdfSafe(value: unknown): string {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "?");
}

export function wrapText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = pdfSafe(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }

    let fragment = "";
    for (const character of word) {
      const next = `${fragment}${character}`;

      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        fragment = next;
      } else {
        if (fragment) lines.push(fragment);
        fragment = character;
      }
    }

    current = fragment;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function truncateText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  const safe = pdfSafe(value);

  if (font.widthOfTextAtSize(safe, size) <= maxWidth) {
    return safe;
  }

  const suffix = "...";
  let result = safe;

  while (
    result.length > 1 &&
    font.widthOfTextAtSize(`${result}${suffix}`, size) > maxWidth
  ) {
    result = result.slice(0, -1);
  }

  return `${result.trimEnd()}${suffix}`;
}

export function clampLines(
  lines: string[],
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (lines.length <= maxLines) return lines;

  const visible = lines.slice(0, maxLines);

  visible[maxLines - 1] = truncateText(
    `${visible[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`,
    font,
    size,
    maxWidth,
  );

  return visible;
}

async function embedPngIfAvailable(
  doc: PDFDocument,
  absolutePath: string,
): Promise<PDFImage | undefined> {
  try {
    const bytes = await readFile(absolutePath);
    return await doc.embedPng(bytes);
  } catch {
    return undefined;
  }
}

export async function createReportContext(
  doc: PDFDocument,
  mode: ReportMode,
): Promise<ReportContext> {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const theme: ReportTheme =
    mode === "pb"
      ? {
          primary: rgb(0.10, 0.10, 0.10),
          primarySoft: rgb(0.93, 0.93, 0.93),
          surface: rgb(0.97, 0.97, 0.97),
          text: rgb(0.12, 0.12, 0.12),
          muted: rgb(0.39, 0.39, 0.39),
          border: rgb(0.76, 0.76, 0.76),
          white: rgb(1, 1, 1),
        }
      : {
          primary: rgb(0.08, 0.25, 0.43),
          primarySoft: rgb(0.91, 0.95, 0.98),
          surface: rgb(0.97, 0.98, 0.99),
          text: rgb(0.11, 0.15, 0.20),
          muted: rgb(0.38, 0.42, 0.47),
          border: rgb(0.77, 0.82, 0.87),
          white: rgb(1, 1, 1),
        };

  const petAvatarFilename =
    mode === "pb"
      ? "pet-avatar-preto-branco.png"
      : "pet-avatar-colorido.png";

  const petAvatar = await embedPngIfAvailable(
    doc,
    path.join(process.cwd(), "public", "brand", petAvatarFilename),
  );

  const ufcgLogo = await embedPngIfAvailable(
    doc,
    path.join(process.cwd(), "public", "brand", "ufcg-horizontal-v10.png"),
  );

  return {
    doc,
    regular,
    bold,
    mode,
    theme,
    petAvatar,
    ufcgLogo,
  };
}

export function drawReportHeader(
  page: PDFPage,
  context: ReportContext,
  options: {
    title: string;
    subtitle?: string;
    documentCode?: string;
  },
): number {
  const { theme, regular, bold } = context;
  const top = A4.height - REPORT_MARGIN;
  const avatarBox = {
    x: REPORT_MARGIN,
    y: top - 45,
    width: 42,
    height: 42,
  };

  if (context.petAvatar) {
    const size = context.petAvatar.scaleToFit(
      avatarBox.width,
      avatarBox.height,
    );

    page.drawImage(context.petAvatar, {
      x: avatarBox.x + (avatarBox.width - size.width) / 2,
      y: avatarBox.y + (avatarBox.height - size.height) / 2,
      width: size.width,
      height: size.height,
    });
  }

  if (context.ufcgLogo) {
    const size = context.ufcgLogo.scaleToFit(118, 30);

    page.drawImage(context.ufcgLogo, {
      x: A4.width - REPORT_MARGIN - size.width,
      y: top - 34 + (30 - size.height) / 2,
      width: size.width,
      height: size.height,
    });
  }

  const titleX = REPORT_MARGIN + 54;
  const titleMaxWidth =
    A4.width - titleX - REPORT_MARGIN - 126;

  const title = truncateText(
    options.title.toUpperCase(),
    bold,
    10.8,
    titleMaxWidth,
  );

  page.drawText(title, {
    x: titleX,
    y: top - 10,
    size: 10.8,
    font: bold,
    color: theme.primary,
  });

  page.drawText(
    pdfSafe(
      options.subtitle ??
        "PET-Saúde UFCG | Atenção Primária à Saúde",
    ),
    {
      x: titleX,
      y: top - 26,
      size: 7.3,
      font: regular,
      color: theme.muted,
    },
  );

  if (options.documentCode) {
    page.drawText(pdfSafe(options.documentCode), {
      x: titleX,
      y: top - 39,
      size: 6.4,
      font: regular,
      color: theme.muted,
    });
  }

  const dividerY = top - 55;

  page.drawLine({
    start: { x: REPORT_MARGIN, y: dividerY },
    end: { x: A4.width - REPORT_MARGIN, y: dividerY },
    thickness: 1.1,
    color: theme.primary,
  });

  page.drawLine({
    start: { x: REPORT_MARGIN, y: dividerY - 2.5 },
    end: { x: A4.width - REPORT_MARGIN, y: dividerY - 2.5 },
    thickness: 0.35,
    color: theme.border,
  });

  return dividerY - 18;
}

export function drawReportFooter(
  page: PDFPage,
  context: ReportContext,
  options: {
    pageNumber: number;
    totalPages: number;
    systemVersion?: string;
  },
): void {
  const { regular, theme } = context;
  const y = 31;

  page.drawLine({
    start: { x: REPORT_MARGIN, y: y + 16 },
    end: { x: A4.width - REPORT_MARGIN, y: y + 16 },
    thickness: 0.45,
    color: theme.border,
  });

  const confidentiality =
    "Documento assistencial confidencial. Uso restrito à paciente e à equipe autorizada.";

  page.drawText(pdfSafe(confidentiality), {
    x: REPORT_MARGIN,
    y,
    size: 6,
    font: regular,
    color: theme.muted,
  });

  const rightText =
    `${options.systemVersion ?? "Dashboard PET-Saúde"} | ` +
    `Página ${options.pageNumber} de ${options.totalPages}`;

  const rightWidth =
    regular.widthOfTextAtSize(pdfSafe(rightText), 6);

  page.drawText(pdfSafe(rightText), {
    x: A4.width - REPORT_MARGIN - rightWidth,
    y,
    size: 6,
    font: regular,
    color: theme.muted,
  });
}

export function drawSectionTitle(
  page: PDFPage,
  context: ReportContext,
  title: string,
  y: number,
): number {
  page.drawRectangle({
    x: REPORT_MARGIN,
    y: y - 1,
    width: 3.5,
    height: 11,
    color: context.theme.primary,
  });

  page.drawText(pdfSafe(title.toUpperCase()), {
    x: REPORT_MARGIN + 10,
    y,
    size: 7.7,
    font: context.bold,
    color: context.theme.primary,
  });

  return y - 15;
}

export function drawInfoGrid(
  page: PDFPage,
  context: ReportContext,
  rows: Array<[string, string]>,
  y: number,
): number {
  const rowCount = Math.ceil(rows.length / 2);
  const rowHeight = 32;
  const height = rowCount * rowHeight + 10;
  const width = A4.width - 2 * REPORT_MARGIN;
  const columnWidth = width / 2;

  page.drawRectangle({
    x: REPORT_MARGIN,
    y: y - height,
    width,
    height,
    color: context.theme.surface,
    borderColor: context.theme.border,
    borderWidth: 0.65,
  });

  page.drawLine({
    start: {
      x: REPORT_MARGIN + columnWidth,
      y: y - 5,
    },
    end: {
      x: REPORT_MARGIN + columnWidth,
      y: y - height + 5,
    },
    thickness: 0.35,
    color: context.theme.border,
  });

  for (let row = 1; row < rowCount; row += 1) {
    const lineY = y - 5 - row * rowHeight;

    page.drawLine({
      start: {
        x: REPORT_MARGIN + 6,
        y: lineY,
      },
      end: {
        x: A4.width - REPORT_MARGIN - 6,
        y: lineY,
      },
      thickness: 0.3,
      color: context.theme.border,
    });
  }

  rows.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x =
      REPORT_MARGIN + 10 + column * columnWidth;
    const fieldY =
      y - 15 - row * rowHeight;
    const maxWidth =
      columnWidth - 20;

    page.drawText(pdfSafe(label), {
      x,
      y: fieldY,
      size: 6.2,
      font: context.bold,
      color: context.theme.muted,
    });

    const lines = clampLines(
      wrapText(
        value,
        context.regular,
        8.1,
        maxWidth,
      ),
      context.regular,
      8.1,
      maxWidth,
      2,
    );

    lines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x,
        y: fieldY - 10 - lineIndex * 9,
        size: 8.1,
        font: context.regular,
        color: context.theme.text,
      });
    });
  });

  return y - height - 13;
}
