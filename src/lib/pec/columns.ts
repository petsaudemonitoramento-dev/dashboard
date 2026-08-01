import type { PecContainer, PecExtension } from "./limits";

export type ParsedPecRow = {
  linha: number;
  raw: Record<string, string>;
  canonical: Record<string, string>;
  extras: Record<string, string>;
};

export type ParsedPecFile = {
  sheetName: string;
  headerRow: number;
  headers: string[];
  mapping: Record<string, string>;
  rows: ParsedPecRow[];
  warnings: string[];
};

export { PecParseError, parsePecFile } from "./parse-isolated";
export type { ParseWorkerFactory, ParseWorkerLike } from "./parse-isolated";
export type { PecContainer, PecExtension };
