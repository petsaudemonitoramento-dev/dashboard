import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260803213000_visits_team_scope_v29_1.sql",
  "utf8"
);

const route = readFileSync(
  "src/app/(sistema)/dashboard/visitas/page.tsx",
  "utf8"
);

const teamApi = readFileSync(
  "src/app/api/equipe/visitas/route.ts",
  "utf8"
);

const navigation = readFileSync(
  "src/config/navigation.ts",
  "utf8"
);

describe("V29.1 — visitas territoriais", () => {
  it("mantém ACS restrito a UBS e microárea", () => {
    expect(migration).toContain("ARRAY['acs']::text[]");
    expect(migration).toContain("true,\n    true");
    expect(migration).toContain("microarea_id = v_contexto.microarea_id");
  });

  it("revalida equipe UBS e credencial clínica", () => {
    expect(migration).toContain("ARRAY['equipe_ubs']::text[]");
    expect(migration).toContain("usuario_equipe_clinica_elegivel_v23");
    expect(migration).toContain("g.ubs_id = v_contexto.ubs_id");
  });

  it("separa acompanhamento da equipe do registro original do ACS", () => {
    expect(migration).toContain(
      "acompanhamentos_visitas_equipe_v29_1"
    );
    expect(migration).toContain(
      "auditoria_acompanhamentos_visitas_v29_1"
    );
    expect(migration).not.toMatch(
      /update\s+public\.visitas_acs_v21[\s\S]*registrar_acompanhamento_visita_v29_1/i
    );
  });

  it("não concede execução individual a anon ou authenticated", () => {
    expect(migration).toContain(
      "FROM PUBLIC, anon, authenticated"
    );
    expect(migration).toContain("TO service_role");
  });

  it("renderiza visitas apenas para ACS ou equipe UBS", () => {
    expect(route).toContain('profile.perfil === "acs"');
    expect(route).toContain('profile.perfil === "equipe_ubs"');
    expect(route).toContain('redirect("/dashboard")');
  });

  it("API da equipe usa guard clínico e não aceita UBS do navegador", () => {
    expect(teamApi).toContain("getClinicalTeamContext");
    expect(teamApi).not.toContain("ubsId");
    expect(teamApi).toContain(
      "registrar_acompanhamento_visita_v29_1"
    );
  });

  it("remove Atendimentos do catálogo de navegação", () => {
    expect(navigation).not.toContain("/dashboard/atendimentos");
    expect(navigation).not.toContain('label: "Atendimentos"');
  });
});
