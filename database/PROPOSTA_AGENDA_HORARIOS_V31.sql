-- Proposta de migração: aplicar primeiro a um ambiente isolado, após revisar grants e RLS.
-- Coluna opcional; nenhum horário inventado para registros preexistentes.
begin;
alter table public.rotina_profissional_tarefas_v1 add column if not exists hora_prevista time without time zone;
comment on column public.rotina_profissional_tarefas_v1.hora_prevista is 'Horário local opcional da agenda pessoal (America/Fortaleza).';
-- Mantém as políticas existentes de acesso por profissional e gestante; não altera grants.
commit;
