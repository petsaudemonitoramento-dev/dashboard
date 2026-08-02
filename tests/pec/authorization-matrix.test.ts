import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPublicRequestableProfile,
  PUBLIC_REQUESTABLE_PROFILES,
} from "@/lib/auth/roles";
import { parseProfessionalCredential } from "@/lib/auth/professional-credentials";

const root = process.cwd();
const credentialsMigration = readFileSync(
  path.join(
    root,
    "supabase/migrations/20260801195500_professional_credentials_and_approval.sql"
  ),
  "utf8"
);
const clinicalMigration = readFileSync(
  path.join(
    root,
    "supabase/migrations/20260801213000_clinical_separation_and_ubs_scope.sql"
  ),
  "utf8"
);
const clinicalGuard = readFileSync(
  path.join(root, "src/lib/auth/guards.ts"),
  "utf8"
);
const approvalRoute = readFileSync(
  path.join(root, "src/app/api/admin/autorizacoes/route.ts"),
  "utf8"
);

const clinicalEntryPoints = [
  "src/app/api/importacoes/pec/route.ts",
  "src/app/api/gestantes/clinico/route.ts",
  "src/app/api/gestantes/lixeira/route.ts",
  "src/app/api/classificacao-risco/route.ts",
  "src/app/api/classificacao-risco/[id]/pdf/route.ts",
  "src/app/(sistema)/dashboard/gestantes/page.tsx",
  "src/app/(sistema)/dashboard/lixeira/page.tsx",
  "src/app/(sistema)/dashboard/importacoes/page.tsx",
  "src/app/(sistema)/dashboard/cadastro-clinico/page.tsx",
  "src/app/(sistema)/dashboard/classificacao-risco/page.tsx",
].map((filename) => readFileSync(path.join(root, filename), "utf8"));

function functionDefinition(sql: string, schema: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION "${schema}"."${name}"`;
  const start = sql.indexOf(marker);
  expect(start, `${schema}.${name} deve existir`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start + marker.length);
  expect(end, `${schema}.${name} deve terminar corretamente`).toBeGreaterThan(start);
  return sql.slice(start, end + 4);
}

describe("matriz final de cadastro público", () => {
  it("permite somente equipe_ubs, acs e aluno", () => {
    expect(PUBLIC_REQUESTABLE_PROFILES).toEqual(["equipe_ubs", "acs", "aluno"]);
    for (const profile of PUBLIC_REQUESTABLE_PROFILES) {
      expect(isPublicRequestableProfile(profile)).toBe(true);
    }
  });

  it.each(["administrador", "gestao_municipal", "profissional_ubs", "desconhecido"])(
    "rejeita solicitação pública de %s",
    (profile) => expect(isPublicRequestableProfile(profile)).toBe(false)
  );
});

describe("credenciais profissionais", () => {
  it("normaliza médico exclusivamente para CRM/MEDICO", () => {
    expect(
      parseProfessionalCredential(
        {
          cargoFuncao: "medico",
          conselho: "CRM",
          conselhoUf: "pb",
          numeroRegistro: "12.345",
          categoriaConselho: "MEDICO",
        },
        "equipe_ubs"
      )
    ).toEqual({
      cargoFuncao: "medico",
      conselho: "CRM",
      uf: "PB",
      numeroRegistro: "12345",
      categoria: "MEDICO",
    });
  });

  it("normaliza enfermeiro exclusivamente para COREN/ENFERMEIRO", () => {
    expect(
      parseProfessionalCredential(
        {
          cargoFuncao: "enfermeiro",
          conselho: "COREN",
          conselhoUf: "PB",
          numeroRegistro: "54321",
          categoriaConselho: "ENFERMEIRO",
        },
        "equipe_ubs"
      )
    ).toMatchObject({ conselho: "COREN", categoria: "ENFERMEIRO" });
  });

  it.each(["tecnico_enfermagem", "auxiliar_enfermagem"])(
    "rejeita cargo %s para equipe_ubs",
    (cargoFuncao) => {
      expect(() =>
        parseProfessionalCredential(
          {
            cargoFuncao,
            conselho: "COREN",
            conselhoUf: "PB",
            numeroRegistro: "54321",
            categoriaConselho: "ENFERMEIRO",
          },
          "equipe_ubs"
        )
      ).toThrow("somente médico ou enfermeiro");
    }
  );

  it("bloqueia registro duplicado no schema e na submissão transacional", () => {
    expect(credentialsMigration).toContain(
      'UNIQUE ("conselho", "uf", "numero_registro")'
    );
    expect(credentialsMigration).toContain(
      "Registro profissional ja associado a outra conta"
    );
  });

  it("exige credencial validada e rejeita estados pendente, rejeitado ou expirado", () => {
    const approval = functionDefinition(
      credentialsMigration,
      "private",
      "processar_solicitacao_perfil_v22"
    );
    expect(approval).toContain("v_credencial.situacao <> 'validado'");
    expect(credentialsMigration).toContain(
      "CHECK (\"situacao\" IN ('pendente', 'validado', 'rejeitado', 'expirado'))"
    );
  });
});

describe("aprovação municipal auditada", () => {
  const approval = functionDefinition(
    credentialsMigration,
    "private",
    "processar_solicitacao_perfil_v22"
  );

  it("usa gestão municipal validada no servidor e não confia no perfil do navegador", () => {
    expect(approvalRoute).toContain("getManagementContext()");
    expect(approvalRoute).toContain("private.processar_solicitacao_perfil_v22");
    expect(approval).toContain("private.usuario_gestao_municipal_v22(p_gestor_id)");
    expect(approval).toContain("v_perfil_solicitado := v_perfil.perfil_solicitado");
    expect(approval).toContain("p_perfil_esperado <> v_perfil_solicitado");
  });

  it("bloqueia autoaprovação e serializa decisões concorrentes", () => {
    expect(approval).toContain("p_gestor_id = p_usuario_id");
    expect(approval).toContain("FOR UPDATE");
    expect(approval).toContain("v_perfil.aprovacao_status <> 'pendente'");
  });

  it("mantém perfil e auditoria na mesma transação", () => {
    expect(credentialsMigration.trimStart()).toMatch(/^--[\s\S]*?BEGIN;/);
    expect(credentialsMigration.trimEnd()).toMatch(/COMMIT;$/);
    expect(approval).toContain("UPDATE public.perfis");
    expect(approval).toContain("INSERT INTO private.auditoria_perfis_v20");
    expect(approval).not.toContain("COMMIT");
  });

  it("recusa contas pendentes, inativas, incompletas, rejeitadas ou removidas", () => {
    expect(approval).toContain("v_perfil.aprovacao_status <> 'pendente'");
    expect(approval).toContain("v_perfil.status <> 'ativo'");
    expect(approval).toContain("v_perfil.ativo IS NOT TRUE");
    expect(approval).toContain("v_perfil.cadastro_completo IS NOT TRUE");
    expect(approval).toContain("v_perfil.perfil_excluido_em IS NOT NULL");
  });
});

describe("separação clínica e território", () => {
  const eligibility = functionDefinition(
    clinicalMigration,
    "private",
    "usuario_equipe_clinica_elegivel_v23"
  );
  const territorialAccess = functionDefinition(
    clinicalMigration,
    "security",
    "usuario_pode_acessar_gestante_v18"
  );
  const importPec = functionDefinition(
    clinicalMigration,
    "private",
    "importar_pec"
  );
  const trash = functionDefinition(
    clinicalMigration,
    "private",
    "esvaziar_lixeira_v19"
  );

  it("expõe o guard clínico somente para equipe_ubs elegível", () => {
    expect(clinicalGuard).toContain(
      'context?.profile.perfil !== "equipe_ubs"'
    );
    expect(clinicalGuard).toContain(
      "private.usuario_equipe_clinica_elegivel_v23"
    );
    for (const entryPoint of clinicalEntryPoints) {
      expect(entryPoint).toContain("getClinicalTeamContext");
      expect(entryPoint).not.toContain("profissional_responsavel_id");
      expect(entryPoint).not.toMatch(/perfil\s*=\s*['\"]administrador/);
      expect(entryPoint).not.toMatch(/perfil\s*=\s*['\"]gestao_municipal/);
    }
  });

  it("nega clínica a administrador, gestão e aluno", () => {
    expect(territorialAccess).not.toContain("administrador");
    expect(territorialAccess).not.toContain("gestao_municipal");
    expect(territorialAccess).not.toContain("aluno");
    expect(clinicalMigration).toContain(
      "IF v_perfil.perfil = 'administrador'::public.perfil_usuario THEN"
    );
  });

  it("limita equipe à própria UBS sem filtro geral por autoria", () => {
    expect(eligibility).toContain("p.ubs_id = p_ubs_id");
    expect(territorialAccess).toContain("g.ubs_id = p.ubs_id");
    expect(clinicalMigration).not.toContain("profissional_responsavel_id");
  });

  it("mantém ACS na própria UBS e microárea ativa", () => {
    expect(territorialAccess).toContain(
      "p.perfil = 'acs'::public.perfil_usuario"
    );
    expect(territorialAccess).toContain("g.ubs_id = p.ubs_id");
    expect(territorialAccess).toContain("g.microarea_id = p.microarea_id");
    expect(territorialAccess).toContain("m.ativa = true");
  });

  it("faz private.importar_pec rejeitar administrador e exigir equipe da UBS", () => {
    expect(importPec).toContain("private.usuario_equipe_clinica_elegivel_v23");
    expect(importPec).not.toContain("administrador");
    expect(importPec).not.toContain("gestao_municipal");
    expect(clinicalMigration).toContain(
      'REVOKE EXECUTE ON FUNCTION "private"."importar_pec_impl_v22"'
    );
  });

  it("remove administrador da lixeira e preserva a assinatura com p_usuario_id", () => {
    expect(trash).toContain('"p_usuario_id" uuid');
    expect(trash).toContain("ARRAY['equipe_ubs']::text[]");
    expect(trash).toContain("g.ubs_id = v_perfil.ubs_id");
    expect(trash).not.toContain("administrador");
  });

  it("nega equipe sem conta ativa, aprovada, completa ou credencial validada", () => {
    for (const condition of [
      "p.status = 'ativo'",
      "p.ativo = true",
      "p.cadastro_completo = true",
      "p.aprovacao_status = 'aprovado'",
      "p.perfil_excluido_em IS NULL",
      "c.situacao = 'validado'",
      "c.validado_em IS NOT NULL",
    ]) {
      expect(eligibility).toContain(condition);
    }
  });

  it("mantém grants privados apenas no service_role e helpers RLS no authenticated", () => {
    expect(clinicalMigration).toContain(
      'GRANT EXECUTE ON FUNCTION "private"."importar_pec"(uuid, uuid, text, text, integer, jsonb, jsonb, jsonb)\n  TO service_role;'
    );
    expect(clinicalMigration).toContain(
      'GRANT EXECUTE ON FUNCTION "security"."usuario_pode_acessar_gestante_v18"(uuid)\n  TO authenticated;'
    );
    expect(clinicalMigration).not.toMatch(/GRANT\s+ALL/i);
  });
});
