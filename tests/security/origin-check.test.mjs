import { test } from "node:test";
import assert from "node:assert/strict";
import { originMatchesRequest } from "../../src/lib/security/origin-check.ts";

function matches({
  target = "http://127.0.0.1:3000/api/auth/cadastro",
  origin,
  host,
  forwardedProto,
  forwardedHost,
}) {
  const headers = new Headers();
  if (host !== undefined) headers.set("host", host);
  if (forwardedProto !== undefined) headers.set("x-forwarded-proto", forwardedProto);
  if (forwardedHost !== undefined) headers.set("x-forwarded-host", forwardedHost);
  const request = new Request(target, { headers });
  return originMatchesRequest(request, new URL(request.url), origin);
}

test("aceita Origin que coincide diretamente com a URL da requisicao", () => {
  assert.equal(
    matches({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }),
    true
  );
});

test("aceita Origin publico real atras do proxy interno, sem X-Forwarded-Host", () => {
  assert.equal(
    matches({
      origin: "https://app.exemplo.test",
      host: "app.exemplo.test",
      forwardedProto: "https",
    }),
    true
  );
});

test("rejeita origem externa diferente do Host recebido", () => {
  assert.equal(
    matches({
      origin: "https://atacante.test",
      host: "app.exemplo.test",
      forwardedProto: "https",
    }),
    false
  );
});

test("nao confia em X-Forwarded-Host fornecido pelo cliente", () => {
  assert.equal(
    matches({
      origin: "https://atacante.test",
      host: "app.exemplo.test",
      forwardedProto: "https",
      forwardedHost: "atacante.test",
    }),
    false
  );
});

test("nao aceita Host injetado com virgula ou delimitadores", () => {
  for (const host of [
    "app.exemplo.test,atacante.test",
    "app.exemplo.test/path",
    "usuario@app.exemplo.test",
    "app.exemplo.test banco",
  ]) {
    assert.equal(
      matches({ origin: "https://app.exemplo.test", host, forwardedProto: "https" }),
      false,
      host
    );
  }
});

test("rejeita protocolo diferente e origem arbitraria sem Host", () => {
  assert.equal(
    matches({
      origin: "https://app.exemplo.test",
      host: "app.exemplo.test",
      forwardedProto: "http",
    }),
    false
  );
  assert.equal(
    matches({ origin: "https://app.exemplo.test" }),
    false
  );
});

test("rejeita origem que nao corresponde a URL nem ao Host", () => {
  assert.equal(
    matches({
      target: "https://app.exemplo.test/api/auth/cadastro",
      origin: "https://atacante.test",
      host: "app.exemplo.test",
      forwardedProto: "https",
    }),
    false
  );
});
