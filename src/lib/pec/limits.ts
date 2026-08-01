export const PEC_LIMITS = Object.freeze({
  maxFileBytes: 20 * 1024 * 1024,
  maxRequestBytes: 21 * 1024 * 1024,
  maxSheets: 10,
  maxRows: 50_000,
  maxColumns: 256,
  maxCellCharacters: 32_767,
  maxAggregateTextBytes: 64 * 1024 * 1024,
  maxZipEntries: 1_000,
  maxZipEntryBytes: 64 * 1024 * 1024,
  maxZipUncompressedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxRelationshipBytes: 2 * 1024 * 1024,
  maxHeaderScanRows: 100,
  parseTimeoutMs: 30_000,
  workerOldGenerationMb: 160,
  workerYoungGenerationMb: 32,
  workerStackMb: 4,
});

export type PecExtension = "csv" | "xls" | "xlsx";
export type PecContainer = "text" | "cfb" | "zip";
