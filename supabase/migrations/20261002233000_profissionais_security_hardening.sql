-- Profissionais V30.1 - hardening complementar
begin;

-- Evita que cadastro público pendente solicite papel privilegiado por
-- manipulação manual do JSON. A aprovação administrativa continua podendo
-- definir papéis legados quando for uma ação administrativa explícita.
create or replace function private.normalizar_solicitacao_profissional_v30()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.origem_cadastro in ('email', 'google')
     and new.aprovacao_status = 'pendente'
  then
    new.perfil_solicitado := 'equipe_ubs';
    new.perfil := 'aluno'::public.perfil_usuario;
    new.ubs_id := null;
    new.microarea_id := null;
  end if;

  return new;
end
$$;

revoke all
on function private.normalizar_solicitacao_profissional_v30()
from public, anon, authenticated;

drop trigger if exists trg_normalizar_solicitacao_profissional_v30
on public.perfis;

create trigger trg_normalizar_solicitacao_profissional_v30
before insert or update of
  perfil_solicitado,
  origem_cadastro,
  aprovacao_status
on public.perfis
for each row
execute function private.normalizar_solicitacao_profissional_v30();

-- Findings do Security Advisor: fixa search_path das funções utilitárias.
alter function private.clean_text(text)
set search_path = pg_catalog, private;

alter function private.parse_date(text)
set search_path = pg_catalog, private;

alter function private.parse_int(text)
set search_path = pg_catalog, private;

alter function private.parse_numeric(text)
set search_path = pg_catalog, private;

commit;
