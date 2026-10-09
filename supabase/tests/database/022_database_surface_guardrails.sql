begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  'toda tabela public possui RLS habilitado'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (
      values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ) as privilegio(nome)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, privilegio.nome)
      and not (
        privilegio.nome = 'SELECT'
        and c.relname in ('ubs', 'microareas')
      )
  ),
  'anon só lê os catálogos públicos allowlisted'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (
      values
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ) as privilegio(nome)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('authenticated', c.oid, privilegio.nome)
      and not (
        privilegio.nome in ('INSERT', 'UPDATE', 'DELETE')
        and c.relname in (
          'pec_gestantes',
          'importacoes_pec_resumo',
          'gestante_consultas',
          'gestante_exames',
          'gestante_vacinas',
          'gestante_altas',
          'classificacoes_risco_gestacional',
          'classificacao_risco_itens'
        )
      )
  ),
  'authenticated só escreve nas tabelas clínicas explicitamente allowlisted'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('anon', 'private', 'CREATE')
  and not has_schema_privilege('anon', 'security', 'USAGE')
  and not has_schema_privilege('anon', 'security', 'CREATE'),
  'anon não acessa schemas private/security'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'USAGE')
  and not has_schema_privilege('authenticated', 'private', 'CREATE'),
  'authenticated não acessa o schema private'
);

select ok(
  has_schema_privilege('authenticated', 'security', 'USAGE')
  and not has_schema_privilege('authenticated', 'security', 'CREATE'),
  'authenticated só possui USAGE esperado no schema security'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (
      values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ) as privilegio(nome)
    where n.nspname in ('private', 'security')
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and (
        has_table_privilege('anon', c.oid, privilegio.nome)
        or has_table_privilege('authenticated', c.oid, privilegio.nome)
      )
  ),
  'clientes não possuem privilégios em relações private/security'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('private', 'security')
      and c.relkind = 'S'
      and (
        has_sequence_privilege('anon', c.oid, 'USAGE')
        or has_sequence_privilege('anon', c.oid, 'SELECT')
        or has_sequence_privilege('anon', c.oid, 'UPDATE')
        or has_sequence_privilege('authenticated', c.oid, 'USAGE')
        or has_sequence_privilege('authenticated', c.oid, 'SELECT')
        or has_sequence_privilege('authenticated', c.oid, 'UPDATE')
      )
  ),
  'clientes não possuem privilégios em sequences private/security'
);

with allowlist(schema_name, function_name) as (
  values
    ('private', 'auditar_estado_profissional_v30'),
    ('private', 'auditar_mutacao_clinica_v30'),
    ('private', 'bloquear_mutacao_auditoria_v22'),
    ('private', 'bootstrap_governanca_inicial_v25'),
    ('private', 'complementar_acao_acs_v21'),
    ('private', 'consumir_rate_limit_v30'),
    ('private', 'criar_cadastro_minimo_risco_v17'),
    ('private', 'decidir_credencial_profissional_v22'),
    ('private', 'definir_profissional_responsavel_v18'),
    ('private', 'descriptografar_jsonb'),
    ('private', 'descriptografar_texto'),
    ('private', 'esvaziar_lixeira_v19'),
    ('private', 'excluir_gestante_definitivamente_v19'),
    ('private', 'exigir_admin_autenticado_v30'),
    ('private', 'exigir_gestante_responsavel_incluindo_lixeira_v30'),
    ('private', 'exigir_gestante_responsavel_v30'),
    ('private', 'exigir_rate_limit_usuario_v30'),
    ('private', 'exigir_usuario_v1'),
    ('private', 'hash_gestante_auditoria_v19'),
    ('private', 'identidade_hash'),
    ('private', 'importar_pec'),
    ('private', 'importar_pec_v30'),
    ('private', 'listar_gestantes_autorizadas_v16'),
    ('private', 'listar_gestantes_profissional_v30'),
    ('private', 'listar_lixeira_gestantes_v19'),
    ('private', 'listar_solicitacoes_perfil_v22'),
    ('private', 'mover_gestante_lixeira_v19'),
    ('private', 'obter_gestante_clinica'),
    ('private', 'obter_gestante_clinica_v30'),
    ('private', 'obter_indicadores_aluno_v1'),
    ('private', 'obter_indicadores_v18'),
    ('private', 'obter_indicadores_v21'),
    ('private', 'obter_inicio_v21'),
    ('private', 'obter_painel_acs_v21'),
    ('private', 'obter_relatorio_classificacao_v17'),
    ('private', 'obter_relatorio_classificacao_v30'),
    ('private', 'pii_key'),
    ('private', 'processar_solicitacao_perfil_v22'),
    ('private', 'proteger_campos_manuais_pec'),
    ('private', 'proteger_identidade_manual'),
    ('private', 'registrar_acao_acs_v21'),
    ('private', 'restaurar_gestante_v19'),
    ('private', 'salvar_classificacao_risco_v17'),
    ('private', 'salvar_classificacao_risco_v30'),
    ('private', 'salvar_gestante_clinica'),
    ('private', 'salvar_gestante_clinica_v30'),
    ('private', 'sincronizar_resumo_pec_v16'),
    ('private', 'submeter_credencial_profissional_v22'),
    ('private', 'usuario_admin_v20'),
    ('private', 'usuario_equipe_clinica_elegivel_v23'),
    ('private', 'usuario_gestao_municipal_v22'),
    ('private', 'usuario_pode_gerenciar_gestante_v19'),
    ('private', 'usuario_pode_operar_lixeira_v20'),
    ('private', 'validar_importacao_pec_v23'),
    ('public', 'profissionais_admin_gerenciar_ubs_v30'),
    ('public', 'profissionais_admin_listar_pendentes_v30'),
    ('public', 'profissionais_admin_listar_perfis_v30'),
    ('public', 'profissionais_admin_listar_ubs_v30'),
    ('public', 'profissionais_admin_processar_lote_v30'),
    ('public', 'profissionais_admin_processar_perfil_v30'),
    ('public', 'profissionais_admin_publicar_aviso_v30'),
    ('public', 'profissionais_admin_remover_aviso_v30'),
    ('public', 'profissionais_completar_perfil_v30'),
    ('public', 'profissionais_excluir_gestante_definitivamente_v30'),
    ('public', 'profissionais_importar_pec_v30'),
    ('public', 'profissionais_listar_gestantes_v30'),
    ('public', 'profissionais_listar_lixeira_v30'),
    ('public', 'profissionais_mover_gestante_lixeira_v30'),
    ('public', 'profissionais_obter_gestante_clinica_v30'),
    ('public', 'profissionais_obter_relatorio_classificacao_v30'),
    ('public', 'profissionais_restaurar_gestante_v30'),
    ('public', 'profissionais_salvar_classificacao_risco_v30'),
    ('public', 'profissionais_salvar_gestante_clinica_v30'),
    ('security', 'usuario_eh_admin'),
    ('security', 'usuario_equipe_clinica_elegivel_v23'),
    ('security', 'usuario_microarea_id'),
    ('security', 'usuario_perfil'),
    ('security', 'usuario_pode_acessar_gestante_v18'),
    ('security', 'usuario_pode_acessar_gestante_v30'),
    ('security', 'usuario_profissional_ativo_v30'),
    ('security', 'usuario_ubs_id')
)
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join allowlist a
      on a.schema_name = n.nspname
      and a.function_name = p.proname
    where n.nspname in ('public', 'private', 'security')
      and p.prosecdef
      and a.function_name is null
  ),
  'toda SECURITY DEFINER pertence à allowlist explícita'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'security')
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) config
        where config like 'search_path=%'
      )
  ),
  'toda SECURITY DEFINER possui search_path fixo'
);

with policy_surface as (
  select
    p.schemaname,
    p.tablename,
    p.policyname,
    coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') as expression
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (
      'pec_gestantes',
      'importacoes_pec_resumo',
      'gestante_consultas',
      'gestante_exames',
      'gestante_vacinas',
      'gestante_altas',
      'classificacoes_risco_gestacional',
      'classificacao_risco_itens'
    )
    and p.permissive = 'PERMISSIVE'
    and p.roles && array['authenticated'::name, 'public'::name]
)
select ok(
  not exists (
    select 1
    from policy_surface p
    where position('usuario_pode_acessar_gestante_v30' in p.expression) = 0
      and not (
        position('profissional_responsavel_id' in p.expression) > 0
        and position('auth.uid' in p.expression) > 0
      )
      and not (
        position('usuario_id' in p.expression) > 0
        and position('auth.uid' in p.expression) > 0
      )
  ),
  'nenhuma policy clínica permissiva autoriza apenas por mesma UBS'
);

select ok(
  not exists (
    select 1
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) acl
    where n.nspname in ('public', 'private', 'security')
      and (
        acl.grantee = 0
        or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated')
      )
      and (
        (d.defaclobjtype = 'r' and acl.privilege_type in (
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
          'REFERENCES', 'TRIGGER'
        ))
        or (d.defaclobjtype = 'f' and acl.privilege_type = 'EXECUTE')
      )
  ),
  'default privileges não expõem novas tabelas/funções a clientes'
);

select * from finish();

rollback;