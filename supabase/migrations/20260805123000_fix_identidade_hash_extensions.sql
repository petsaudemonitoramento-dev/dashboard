create or replace function private.identidade_hash(
  p_canonical jsonb,
  p_ubs_id uuid
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
declare
  v_base text;
begin
  v_base := concat_ws(
    '|',
    p_ubs_id::text,
    regexp_replace(
      coalesce(p_canonical->>'cpf', ''),
      '\D',
      '',
      'g'
    ),
    regexp_replace(
      coalesce(p_canonical->>'cns', ''),
      '\D',
      '',
      'g'
    ),
    lower(
      extensions.unaccent(
        coalesce(p_canonical->>'nome', '')
      )
    ),
    coalesce(p_canonical->>'data_nascimento', '')
  );

  if regexp_replace(v_base, '[|\s]', '', 'g') = p_ubs_id::text then
    raise exception 'Linha sem identificador suficiente';
  end if;

  return encode(
    extensions.hmac(
      v_base,
      private.pii_key(),
      'sha256'
    ),
    'hex'
  );
end
$function$;