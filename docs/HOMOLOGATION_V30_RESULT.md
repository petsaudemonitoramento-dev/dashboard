# Resultado da Homologação V30 — Software dos Profissionais

Data: 09/10/2026

## Escopo

Homologação realizada diretamente no ambiente hospedado oficial, após autorização para uso direto de Production.

Projeto Supabase:

- nome: `dashboard-v2`
- ref: `bhkyfcnuxcvjgvusgpgm`
- plano: Free

Projeto Vercel:

- projeto: `painelprenatal`
- domínio oficial: `https://painelprenatal.vercel.app`
- branch validada: `hardening/post-audit-v1`

## Banco

As 17 migrations V30 foram aplicadas com sucesso sobre o banco hospedado e o histórico foi alinhado aos timestamps originais dos arquivos Git.

Após a homologação:

- 23 migrations registradas;
- 0 usuários Auth;
- 0 perfis operacionais;
- 0 gestantes;
- 0 consultas;
- 0 exames clínicos;
- 0 vacinas clínicas;
- 0 classificações de risco;
- 0 importações PEC.

Catálogos estruturais preservados:

- 3 UBS;
- 8 microáreas;
- 27 configurações de exames;
- 73 fatores de risco;
- 6 configurações de vacinas.

O schema `backup_pre_v30_20261008` preserva o snapshot lógico anterior à V30.

## A × B no PostgreSQL hospedado

Foram criados temporariamente dois profissionais sintéticos A e B:

- mesma UBS;
- perfis ativos, completos e aprovados;
- credenciais profissionais sintéticas válidas;
- uma gestante exclusiva para cada profissional.

Os atores foram removidos após os testes.

Resultados:

- A acessou a própria gestante;
- A não acessou B;
- B acessou a própria gestante;
- B não acessou A;
- RLS retornou apenas uma gestante por ator;
- RPC de listagem retornou apenas a gestante do ator;
- consultas de B ficaram invisíveis para A;
- exames de B ficaram invisíveis para A;
- vacinas de B ficaram invisíveis para A;
- altas de B ficaram invisíveis para A;
- classificações de B ficaram invisíveis para A;
- itens de classificação de B ficaram invisíveis para A;
- UPDATE de A contra filhos de B afetou zero registros;
- DELETE de A contra filhos de B afetou zero registros;
- INSERT de A em gestante B foi rejeitado por RLS;
- falsificação de `profissional_id = B` em gestante A foi rejeitada por RLS;
- relatório/PDF de classificação de B foi rejeitado;
- operação de lixeira em B foi rejeitada;
- operação de lixeira na própria gestante funcionou;
- revogação de A com o mesmo `auth.uid()` fez todas as superfícies clínicas retornarem zero imediatamente;
- lote PEC permaneceu protegido após revogação.

## SECURITY DEFINER

A verificação hospedada confirmou:

- `anon` não executa SECURITY DEFINER de `private`;
- `authenticated` não executa SECURITY DEFINER internos de `private`;
- todas as SECURITY DEFINER relevantes possuem `search_path` explícito;
- `anon` não executa SECURITY DEFINER públicas;
- funções públicas executáveis por `authenticated` coincidem com a allowlist V30;
- `anon` não executa helpers privilegiados de `security`;
- helpers de `security` executáveis por `authenticated` coincidem com a allowlist esperada.

## Vercel Production

Foi criado um deployment Production a partir do SHA auditado da branch de hardening.

Validações no domínio oficial:

- `/api/health`: HTTP 200;
- conexão com Supabase: OK;
- `x-request-id`: presente;
- CSP: presente;
- CSP de Production: sem `unsafe-eval`;
- `upgrade-insecure-requests`: presente;
- HSTS: presente;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `frame-ancestors 'none'`;
- Referrer-Policy: presente;
- Permissions-Policy: presente.

## Carga pública

Smoke de carga no endpoint `/api/health`:

- 100 requests;
- concorrência: 5;
- respostas 200: 100;
- falhas: 0;
- error rate: 0%;
- média: ~396 ms;
- p95: ~552 ms;
- p99: ~2,14 s.

Após a carga, a Vercel não registrou runtime errors.

## Security Advisor

Os findings antigos de `search_path` mutável e tabela privada com RLS desativado desapareceram após V30.

Os avisos de SECURITY DEFINER públicas são intencionais: as RPCs ficam disponíveis para `authenticated`, mas executam autorização interna e estão cobertas por allowlist e testes A × B.

Tabelas privadas com RLS e sem policy funcionam como deny-all e não possuem grants de cliente.

## Leaked Password Protection

O projeto está no plano Free.

Segundo a documentação atual do Supabase, Leaked Password Protection é um recurso disponível no plano Pro e acima. Portanto esse warning não pode ser eliminado enquanto o projeto permanecer no Free.

Mitigações atuais:

- senha mínima definida pela aplicação;
- rate limiting persistente;
- confirmação de e-mail;
- aprovação administrativa;
- revogação dinâmica no banco.

Ao migrar para Pro, habilitar Leaked Password Protection deve ser um gate obrigatório.

## Pendências não bloqueantes

1. remover da Vercel a variável legada `TEMP_PROFESSIONAL_PASSWORD`, que não é mais usada pelo código;
2. executar um restore completo em ambiente separado para medir RTO/RPO real;
3. executar auditoria manual de acessibilidade com teclado + VoiceOver/NVDA;
4. avaliar métricas/alertas de observabilidade antes de escala municipal;
5. acompanhar warnings de performance sem remover índices úteis antes de haver carga representativa.

## Parecer

A arquitetura clínica V30 passou pelos testes estruturais de isolamento, revogação, ownership, filhos, autoria, RPCs, lixeira, PEC, SECURITY DEFINER e deploy hospedado.

**APROVADO PARA HOMOLOGAÇÃO/USO PILOTO CONTROLADO**, condicionado ao uso de dados reais apenas após definição operacional de responsáveis, política de backup e fluxo formal de incidentes.
