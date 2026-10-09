#!/usr/bin/env bash
set -euo pipefail

if [ "$CI" != "true" ]; then
  echo "Este exercício só pode ser executado em CI descartável." >&2
  exit 1
fi

for command_name in supabase docker sha256sum cmp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Comando obrigatório ausente: $command_name" >&2
    exit 1
  fi
done

work_dir="$RUNNER_TEMP/profissionais-dr-$GITHUB_RUN_ID"
report_dir="$GITHUB_WORKSPACE/dr-report"
schemas="public,private,security,analytics,analytics_publicado"
marker_id="00000000-0000-4000-8000-000000000999"
mkdir -p "$work_dir" "$report_dir"

cleanup() {
  supabase stop --no-backup >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

database_container() {
  docker ps \
    --filter "name=supabase_db_" \
    --format "{{.Names}}" |
    head -n 1
}

require_database_container() {
  local container
  container="$(database_container)"
  if [ -z "$container" ]; then
    echo "Contêiner PostgreSQL efêmero não encontrado." >&2
    exit 1
  fi
  printf '%s\n' "$container"
}

write_manifest() {
  local container="$1"
  local output="$2"
  local table_name
  local row_count

  while IFS= read -r table_name; do
    row_count="$(
      docker exec "$container" \
        psql -X -U postgres -d postgres -At \
        -c "select count(*) from $table_name"
    )"
    printf '%s=%s\n' "$table_name" "$row_count"
  done < <(
    docker exec "$container" \
      psql -X -U postgres -d postgres -At -c "
        select format('%I.%I', n.nspname, c.relname)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in (
          'public',
          'private',
          'security',
          'analytics',
          'analytics_publicado'
        )
          and c.relkind in ('r', 'p')
        order by n.nspname, c.relname
      "
  )

  docker exec "$container" \
    psql -X -U postgres -d postgres -At -c "
      select id::text || '|' || nome || '|' || codigo_interno
      from public.ubs
      where id = '$marker_id'::uuid
    "
}

total_started_at="$(date +%s)"

supabase start
source_container="$(require_database_container)"

docker exec "$source_container" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c "
    insert into public.ubs (
      id,
      nome,
      nome_abreviado,
      codigo_interno,
      municipio,
      uf,
      ativa
    )
    values (
      '$marker_id'::uuid,
      'UBS Sintética Exercício DR',
      'UBS DR CI',
      'CI-DR-001',
      'Município Sintético',
      'PB',
      true
    )
    on conflict (id) do update
    set nome = excluded.nome,
        nome_abreviado = excluded.nome_abreviado,
        codigo_interno = excluded.codigo_interno,
        municipio = excluded.municipio,
        uf = excluded.uf,
        ativa = excluded.ativa
  "

supabase db dump \
  --local \
  --schema "$schemas" \
  --file "$work_dir/schema-before.sql"

supabase db dump \
  --local \
  --data-only \
  --use-copy \
  --schema "$schemas" \
  --file "$work_dir/data.sql"

write_manifest "$source_container" "$work_dir/manifest-before.txt"
backup_bytes="$(wc -c < "$work_dir/data.sql" | tr -d ' ')"
recovery_started_at="$(date +%s)"

supabase stop --no-backup
supabase start
target_container="$(require_database_container)"

docker exec -i "$target_container" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
set session_replication_role = replica;
do $dr$
declare
  target_list text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ')
  into target_list
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in (
    'public',
    'private',
    'security',
    'analytics',
    'analytics_publicado'
  )
    and c.relkind in ('r', 'p');

  if target_list is not null then
    execute 'truncate table ' || target_list || ' restart identity cascade';
  end if;
end
$dr$;
set session_replication_role = origin;
SQL

{
  printf '%s\n' "set session_replication_role = replica;"
  cat "$work_dir/data.sql"
  printf '%s\n' "set session_replication_role = origin;"
} | docker exec -i "$target_container" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres

supabase db dump \
  --local \
  --schema "$schemas" \
  --file "$work_dir/schema-after.sql"

write_manifest "$target_container" "$work_dir/manifest-after.txt"

if ! cmp -s "$work_dir/schema-before.sql" "$work_dir/schema-after.sql"; then
  echo "Schema restaurado diverge do schema anterior." >&2
  exit 1
fi

if ! cmp -s "$work_dir/manifest-before.txt" "$work_dir/manifest-after.txt"; then
  echo "Manifesto de dados restaurado diverge do backup." >&2
  diff -u "$work_dir/manifest-before.txt" "$work_dir/manifest-after.txt" || true
  exit 1
fi

marker_value="$(
  docker exec "$target_container" \
    psql -X -U postgres -d postgres -At -c "
      select nome
      from public.ubs
      where id = '$marker_id'::uuid
    "
)"

if [ "$marker_value" != "UBS Sintética Exercício DR" ]; then
  echo "Marcador sintético não foi restaurado corretamente." >&2
  exit 1
fi

supabase db lint --local --level error
supabase test db

validation_finished_at="$(date +%s)"
rto_seconds="$((validation_finished_at - recovery_started_at))"
total_seconds="$((validation_finished_at - total_started_at))"
schema_hash="$(sha256sum "$work_dir/schema-after.sql" | awk '{print $1}')"
manifest_hash="$(sha256sum "$work_dir/manifest-after.txt" | awk '{print $1}')"

{
  printf '%s\n' "# Exercício de Disaster Recovery V30"
  printf '\n'
  printf '%s\n' "- Ambiente: Supabase efêmero do GitHub Actions"
  printf '%s\n' "- Dados: exclusivamente sintéticos"
  printf '%s\n' "- Run ID: $GITHUB_RUN_ID"
  printf '%s\n' "- RTO técnico observado: $rto_seconds segundos"
  printf '%s\n' "- Duração total do exercício: $total_seconds segundos"
  printf '%s\n' "- Tamanho do dump lógico de dados: $backup_bytes bytes"
  printf '%s\n' "- Hash do schema restaurado: $schema_hash"
  printf '%s\n' "- Hash do manifesto restaurado: $manifest_hash"
  printf '%s\n' "- Validações: schema idêntico, dados idênticos, marcador restaurado, db lint verde e pgTAP verde"
  printf '%s\n' "- Dump bruto: removido no encerramento e não publicado como artefato"
} > "$report_dir/summary.md"

if [ -n "$GITHUB_STEP_SUMMARY" ]; then
  cat "$report_dir/summary.md" >> "$GITHUB_STEP_SUMMARY"
fi