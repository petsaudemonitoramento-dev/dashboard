-- Otimização de plano de execução sem alterar a autorização.
-- A subconsulta escalar pode ser avaliada uma vez (initPlan), em vez de por linha.
-- Outras policies (admin) e regras de ownership permanecem inalteradas.
begin;

alter policy perfis_proprio_select
  on public.perfis
  using (id = (select auth.uid()));

commit;
