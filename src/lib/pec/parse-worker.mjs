import { parentPort } from "node:worker_threads";
import { parsePecBuffer, ParserInputError } from "./parser-core.mjs";

if (!parentPort) throw new Error("WORKER_PORT_MISSING");

parentPort.once("message", (input) => {
  try {
    const parsed = parsePecBuffer(input);
    parentPort.postMessage({ ok: true, parsed });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      code: error instanceof ParserInputError ? error.code : "PARSER_FAILURE",
    });
  }
});
