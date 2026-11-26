import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmationRedirectUrl } from "../../src/lib/auth/confirmation-origin.ts";

const expected = "https://gestarioaps.vercel.app/login?email_confirmed=1";
test("confirmation links always use the public domain on Vercel previews and production", () => {
  for (const url of ["https://painelprenatal-bqt20mp8d-petsaudemonitoramento-devs-projects.vercel.app/api/auth/cadastro", "https://gestarioaps.vercel.app/api/auth/cadastro", "https://attacker.example/api/auth/cadastro", "http://localhost:3000/api/auth/cadastro"]) {
    assert.equal(confirmationRedirectUrl(url, { NODE_ENV: "production", VERCEL: "1" }), expected);
  }
});
test("only local development/test retains a loopback origin", () => {
  assert.equal(confirmationRedirectUrl("http://localhost:3000/api/auth/cadastro", { NODE_ENV: "test" }), "http://localhost:3000/login?email_confirmed=1");
  assert.equal(confirmationRedirectUrl("https://attacker.example/api/auth/cadastro", { NODE_ENV: "development" }), expected);
  assert.equal(confirmationRedirectUrl("http://localhost:3000/api/auth/cadastro", { NODE_ENV: "production" }), expected);
});
