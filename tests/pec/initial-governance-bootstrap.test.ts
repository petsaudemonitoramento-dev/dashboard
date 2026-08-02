import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260802140000_bootstrap_initial_governance.sql"
);
const verifierPath = path.join(
  root,
  "supabase/verification/verify_initial_governance_bootstrap.sql"
);
const migration = readFileSync(migrationPath, "utf8");
const verifier = readFileSync(verifierPath, "utf8");

const appliedMigrationHashes: Record<string, string> = {
  "supabase/migrations/20260720114217_clean_cumulative_schema.sql":
    "430d61bde4aac0318d4c55cfad3c7c2ed12e88e17484b64afcf9a62ef23dbc17",
  "supabase/migrations/20260801195500_professional_credentials_and_approval.sql":
    "8e51257abb690e0130e25be008004dcbcb5859148125089a4fba6bb52a66146b",
  "supabase/migrations/20260801213000_clinical_separation_and_ubs_scope.sql":
    "834d5cb99ca419f5fe8995fa59e43522024e31e6de022e1b2cc5ceea32aef024",
  "supabase/migrations/20260802131541_fix_audit_identity_generation.sql":
    "97b7ca9b15d94254cfa26855d92e9fbb1ad709af3f221ff5452b4abd03f03c3a",
};

describe("V25 initial governance bootstrap", () => {
  it("is transactional and installs an irreversible singleton marker", () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain(
      'CREATE TABLE "private"."bootstrap_governanca_v25"'
    );
    expect(migration).toContain(
      'PRIMARY KEY ("singleton")'
    );
    expect(migration).toContain(
      "LOCK TABLE private.bootstrap_governanca_v25 IN EXCLUSIVE MODE"
    );
    expect(migration).toContain(
      "Bootstrap inicial de governanca ja foi concluido"
    );
    expect(migration).toContain(
      'CREATE TRIGGER "bootstrap_governanca_v25_append_only"'
    );
    expect(migration).toContain(
      'CREATE TRIGGER "bootstrap_governanca_v25_no_truncate"'
    );
  });

  it("requires two distinct confirmed Auth users and verifies their e-mails", () => {
    expect(migration).toContain("p_administrador_id = p_gestao_id");
    expect(migration).toContain("v_administrador.email_confirmed_at IS NULL");
    expect(migration).toContain("v_gestao.email_confirmed_at IS NULL");
    expect(migration).toContain(
      "lower(btrim(v_administrador.email)) <> v_administrador_email"
    );
    expect(migration).toContain(
      "lower(btrim(v_gestao.email)) <> v_gestao_email"
    );
    expect(migration).not.toContain("testeadm@ufcg.com");
    expect(migration).not.toContain("testegestao@ufcg.com");
  });

  it("creates only the first administrator and management profiles without territory", () => {
    expect(migration).toContain(
      "'administrador'::public.perfil_usuario"
    );
    expect(migration).toContain(
      "'gestao_municipal'::public.perfil_usuario"
    );
    expect(migration).toContain("'bootstrap_v25'");
    expect(migration).toContain("'aprovado'");
    expect(migration).toContain("'ativo'::public.status_usuario");
    expect(migration).not.toContain("INSERT INTO public.pec_gestantes");
    expect(migration).not.toContain("INSERT INTO private.identidades_gestantes");
    expect(migration).not.toContain("INSERT INTO private.credenciais_profissionais");
  });

  it("records immutable bootstrap audit events", () => {
    expect(migration).toContain(
      "INSERT INTO private.auditoria_perfis_v20"
    );
    expect(migration).toContain("'bootstrap_administrador_v25'");
    expect(migration).toContain("'bootstrap_gestao_v25'");
    expect(migration).not.toMatch(
      /INSERT INTO private\.auditoria_perfis_v20\s*\(\s*id\s*,/i
    );
  });

  it("keeps the function private and executable only by service_role", () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION\n  "private"."bootstrap_governanca_inicial_v25"(uuid, text, uuid, text)'
    );
    expect(migration).toContain(
      'FROM PUBLIC, "anon", "authenticated", "service_role"'
    );
    expect(migration).toContain(
      'TO "service_role";'
    );
    expect(migration).not.toMatch(
      /GRANT EXECUTE[\s\S]*TO\s+"?(?:anon|authenticated)"?/i
    );
  });

  it("provides a read-only verifier for ACL, one-time state and audit", () => {
    expect(verifier).toContain("v_state_count = 0");
    expect(verifier).toContain("v_state_count = 1");
    expect(verifier).toContain("Direct mutation privilege found");
    expect(verifier).toContain("service_role_can_execute");
    expect(verifier).toContain("authenticated_can_execute");
    expect(verifier).toContain("bootstrap_administrador_v25");
    expect(verifier).toContain("bootstrap_gestao_v25");
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
