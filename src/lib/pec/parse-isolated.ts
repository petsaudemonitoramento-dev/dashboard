import path from "node:path";
import { Worker } from "node:worker_threads";
import type { ParsedPecFile } from "./columns";
import { PEC_LIMITS, type PecContainer, type PecExtension } from "./limits";

type WorkerResult =
  | { ok: true; parsed: ParsedPecFile }
  | { ok: false; code: string };

export type ParseWorkerLike = {
  once(event: "message", listener: (message: WorkerResult) => void): ParseWorkerLike;
  once(event: "error", listener: (error: Error) => void): ParseWorkerLike;
  once(event: "exit", listener: (code: number) => void): ParseWorkerLike;
  postMessage(value: unknown, transferList?: readonly ArrayBuffer[]): void;
  terminate(): Promise<number>;
};

export type ParseWorkerFactory = () => ParseWorkerLike;

export class PecParseError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PecParseError";
  }
}

function createParserWorker(): ParseWorkerLike {
  const workerPath = path.join(process.cwd(), "src", "lib", "pec", "parse-worker.mjs");
  return new Worker(workerPath, {
    resourceLimits: {
      maxOldGenerationSizeMb: PEC_LIMITS.workerOldGenerationMb,
      maxYoungGenerationSizeMb: PEC_LIMITS.workerYoungGenerationMb,
      stackSizeMb: PEC_LIMITS.workerStackMb,
    },
  }) as ParseWorkerLike;
}

export async function parsePecFile(
  buffer: Buffer,
  _filename: string,
  extension: PecExtension,
  container: PecContainer,
  options: {
    timeoutMs?: number;
    workerFactory?: ParseWorkerFactory;
  } = {}
): Promise<ParsedPecFile> {
  const worker = (options.workerFactory ?? createParserWorker)();
  const transferable = Uint8Array.from(buffer).buffer;
  const timeoutMs = options.timeoutMs ?? PEC_LIMITS.parseTimeoutMs;

  return await new Promise<ParsedPecFile>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      void worker.terminate().finally(() => {
        finish(() => reject(new PecParseError("PARSE_TIMEOUT")));
      });
    }, timeoutMs);

    worker.once("message", (message) => {
      finish(() => {
        void worker.terminate();
        if (message.ok) resolve(message.parsed);
        else reject(new PecParseError(message.code));
      });
    });
    worker.once("error", () => {
      finish(() => reject(new PecParseError("WORKER_FAILURE")));
    });
    worker.once("exit", (code) => {
      if (timedOut) return;
      if (code !== 0) finish(() => reject(new PecParseError("WORKER_EXIT")));
    });
    worker.postMessage({ buffer: transferable, extension, container }, [transferable]);
  });
}
