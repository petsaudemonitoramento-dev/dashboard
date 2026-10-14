-- Restoration of strict clinician credential policy after V2 synthetic-only smoke tests.
-- Reinstates unchanged official COREN/CRM verification on every Supabase environment.
-- No test account exception may be present in production.
begin;
CREATE OR REPLACE FUNCTION "private"."usuario_equipe_clinica_elegivel_v23"(
  "p_usuario_id" uuid,
  "p_ubs_id" uuid DEFAULT NULL
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    JOIN public.ubs u
      ON u.id = p.ubs_id
     AND u.ativa = true
    JOIN private.credenciais_profissionais c
      ON c.usuario_id = p.id
    WHERE p.id = p_usuario_id
      AND p.perfil = 'equipe_ubs'::public.perfil_usuario
      AND p.status = 'ativo'::public.status_usuario
      AND p.ativo = true
      AND p.cadastro_completo = true
      AND p.aprovacao_status = 'aprovado'
      AND p.perfil_excluido_em IS NULL
      AND p.ubs_id IS NOT NULL
      AND (p_ubs_id IS NULL OR p.ubs_id = p_ubs_id)
      AND c.situacao = 'validado'
      AND c.decidido_em IS NOT NULL
      AND c.cargo_funcao = p.cargo_funcao
      AND (
        (
          p.cargo_funcao = 'medico'
          AND c.conselho = 'CRM'
          AND c.categoria = 'MEDICO'
        )
        OR (
          p.cargo_funcao = 'enfermeiro'
          AND c.conselho = 'COREN'
          AND c.categoria = 'ENFERMEIRO'
        )
      )
  )
$$;
commit;
