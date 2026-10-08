begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prosecdef = true
      and has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
  ),
  'anon não executa SECURITY DEFINER do schema private'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prosecdef = true
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
  ),
  'authenticated não executa SECURITY DEFINER internos do schema private'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('private', 'security', 'public')
      and p.prosecdef = true
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) config
        where config like 'search_path=%'
      )
  ),
  'toda SECURITY DEFINER relevante possui search_path explícito'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and has_function_privilege(
        'anon',
        p.oid,
        'EXECUTE'
      )
  ),
  'anon não executa SECURITY DEFINER exposta em public'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and has_function_privilege(
        'authenticated',
        p.oid,
        'EXECUTE'
      )
      and p.proname <> all (array[
        'profissionais_listar_gestantes_v30',
        'profissionais_obter_gestante_clinica_v30',
        'profissionais_salvar_gestante_clinica_v30',
        'profissionais_salvar_classificacao_risco_v30',
        'profissionais_obter_relatorio_classificacao_v30',
        'profissionais_importar_pec_v30',
        'profissionais_mover_gestante_lixeira_v30',
        'profissionais_restaurar_gestante_v30',
        'profissionais_excluir_gestante_definitivamente_v30',
        'profissionais_listar_lixeira_v30',
        'profissionais_completar_perfil_v30',
        'profissionais_admin_listar_pendentes_v30',
        'profissionais_admin_listar_perfis_v30',
        'profissionais_admin_listar_ubs_v30',
        'profissionais_admin_processar_perfil_v30',
        'profissionais_admin_processar_lote_v30',
        'profissionais_admin_gerenciar_ubs_v30',
        'profissionais_admin_publicar_aviso_v30',
        'profissionais_admin_remover_aviso_v30'
      ]::text[])
  ),
  'authenticated só executa SECURITY DEFINER públicas da allowlist V30'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'security'
      and p.prosecdef = true
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anon não executa SECURITY DEFINER do schema security'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'security'
      and p.prosecdef = true
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and p.proname <> all (array[
        'usuario_perfil',
        'usuario_ubs_id',
        'usuario_microarea_id',
        'usuario_eh_admin',
        'usuario_equipe_clinica_elegivel_v23',
        'usuario_pode_acessar_gestante_v18',
        'usuario_pode_acessar_gestante_v30',
        'usuario_profissional_ativo_v30'
      ]::text[])
  ),
  'authenticated só executa helpers SECURITY DEFINER explicitamente permitidos'
);

select * from finish();

rollback;
