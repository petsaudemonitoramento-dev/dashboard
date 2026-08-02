import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260802131541_fix_audit_identity_generation.sql"
);
const verifierPath = path.join(
  root,
  "supabase/verification/verify_audit_identity_generation.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");

const affectedTables = [
  "acessos_identidade_gestantes",
  "auditoria_avisos_v20",
  "auditoria_exclusoes_gestantes",
  "auditoria_perfis_v20",
  "auditoria_visitas_acs_v21",
  "historico_classificacoes_risco",
  "historico_clinico_gestantes",
  "importacao_pec_erros",
  "importacao_pec_linhas_raw",
] as const;

const appliedMigrationHashes = {
  "supabase/migrations/20260720114217_clean_cumulative_schema.sql":
    "430d61bde4aac0318d4c55cfad3c7c2ed12e88e17484b64afcf9a62ef23dbc17",
  "supabase/migrations/20260801195500_professional_credentials_and_approval.sql":
    "8e51257abb690e0130e25be008004dcbcb5859148125089a4fba6bb52a66146b",
  "supabase/migrations/20260801213000_clinical_separation_and_ubs_scope.sql":
    "834d5cb99ca419f5fe8995fa59e43522024e31e6de022e1b2cc5ceea32aef024",
} as const;

describe("V24 audit identity generation", () => {
  it("repairs every proven bigint audit/history key", () => {
    for (const table of affectedTables) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain("ADD GENERATED ALWAYS AS IDENTITY");
    expect(migration).toContain("pg_get_serial_sequence");
    expect(migration).toContain("pg_catalog.setval");
    expect(migration).toContain("SELECT max(%I)");
  });

  it("preserves primary keys, NOT NULL, sequence ownership and safe next values", () => {
    expect(migration).toContain("v_not_null IS NOT TRUE");
    expect(migration).toContain("con.contype = 'p'");
    expect(migration).toContain("dep.deptype = 'i'");
    expect(migration).toContain("v_sequence_owner <> v_table_owner");
    expect(migration).toContain("pg_catalog.setval(v_sequence::regclass, 1, false)");
    expect(migration).toContain("pg_catalog.setval(v_sequence::regclass, v_max_id, true)");
  });

  it("does not recreate tables or change privileges", () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).not.toMatch(/\b(?:DROP|CREATE)\s+TABLE\b/i);
    expect(migration).not.toMatch(/\b(?:GRANT|REVOKE)\b/i);
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM)?\s*(?:public|private)\./i);
  });

  it("keeps the official approval INSERT free of a manually supplied id", () => {
    const v22 = readFileSync(
      path.join(
        root,
        "supabase/migrations/20260801195500_professional_credentials_and_approval.sql"
      ),
      "utf8"
    );
    const match = v22.match(
      /INSERT INTO private\.auditoria_perfis_v20\s*\(([^)]*)\)/i
    );
    expect(match).not.toBeNull();
    const columns = match?.[1]
      .split(",")
      .map((column) => column.replaceAll('"', "").trim().toLowerCase());
    expect(columns).not.toContain("id");
  });

  it("verifies RLS and denies direct client mutations", () => {
    expect(verifier).toContain("c.relrowsecurity");
    expect(verifier).toContain("('anon'), ('authenticated')");
    expect(verifier).toContain("('INSERT'), ('UPDATE'), ('DELETE')");
    expect(verifier).toContain("Append-only protection weakened");
    expect(verifier).toContain("v_next_value <= coalesce(v_max_id, 0)");
  });

  it("keeps every already-applied migration byte-for-byte unchanged", () => {
    for (const [relativePath, expectedHash] of Object.entries(
      appliedMigrationHashes
    )) {
      const contents = readFileSync(path.join(root, relativePath));
      expect(createHash("sha256").update(contents).digest("hex")).toBe(
        expectedHash
      );
    }
  });
});
