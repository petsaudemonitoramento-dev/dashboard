import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isUuid, mutationRequestError, readJsonObject, logServerFailure,
} from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["consulta", "exame", "contato", "visita", "revisao"]);
const STATUSES = new Set(["pendente", "adiada", "concluida"]);
const MAX_BODY = 4096;
const noCache = { "Cache-Control": "no-store" };

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day && year >= 2020 && year <= 2100;
}

async function getActor(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await supabase.from("perfis")
    .select("perfil,status,ativo,cadastro_completo,aprovacao_status,perfil_excluido_em")
    .eq("id", user.id).maybeSingle();
  if (error || !profile || profile.perfil !== "equipe_ubs" ||
      profile.status !== "ativo" || !profile.ativo ||
      !profile.cadastro_completo || profile.aprovacao_status !== "aprovado" ||
      profile.perfil_excluido_em) return null;
  return user.id;
}

async function parseMutation(request: Request) {
  const rejected = mutationRequestError(request, {
    maxBytes: MAX_BODY,
    contentTypes: ["application/json"],
  });
  if (rejected) return { error: rejected };
  const body = await readJsonObject(request, MAX_BODY);
  if (!body) return {
    error: NextResponse.json({error:"Dados da tarefa inválidos."},
      {status:400,headers:noCache}),
  };
  return { body };
}

export async function POST(request: Request) {
  const {error,body} = await parseMutation(request);
  if (error) return error;
  if (!body || !isUuid(body.gestanteId) ||
      typeof body.tipo !== "string" || !TYPES.has(body.tipo) ||
      !validDate(body.dataPrevista)) {
    return NextResponse.json({error:"Informe gestante, atividade e data válidas."},
      {status:400,headers:noCache});
  }
  try {
    const supabase = await createClient();
    const actor = await getActor(supabase);
    if (!actor) return NextResponse.json({error:"Perfil profissional não autorizado."},
      {status:403,headers:noCache});
    if (!await consumeRateLimit({scope:"rotina-criar",actorKey:actor,limit:30,windowSeconds:300}))
      return NextResponse.json({error:"Limite de registros temporariamente atingido."},
        {status:429,headers:noCache});
    const {data, error: insertError} = await supabase
      .from("rotina_profissional_tarefas_v1")
      .insert({
        profissional_id:actor,gestante_id:body.gestanteId,
        tipo:body.tipo,data_prevista:body.dataPrevista,
        status:"pendente",
      }).select("id").single();
    if (insertError || !data) return NextResponse.json(
      {error:"Não foi possível registrar a atividade para esta gestante."},
      {status:403,headers:noCache});
    return NextResponse.json({id:data.id},{status:201,headers:noCache});
  } catch (err) {
    logServerFailure("rotina-create",err);
    return NextResponse.json({error:"Não foi possível salvar a atividade."},
      {status:500,headers:noCache});
  }
}

export async function PATCH(request: Request) {
  const {error,body} = await parseMutation(request);
  if (error) return error;
  if (!body || !isUuid(body.id) ||
      typeof body.status !== "string" || !STATUSES.has(body.status) ||
      (body.status === "adiada" && !validDate(body.dataPrevista)) ||
      (body.dataPrevista !== undefined && !validDate(body.dataPrevista))) {
    return NextResponse.json({error:"Revisão de atividade inválida."},
      {status:400,headers:noCache});
  }
  try {
    const supabase = await createClient();
    const actor = await getActor(supabase);
    if (!actor) return NextResponse.json({error:"Perfil profissional não autorizado."},
      {status:403,headers:noCache});
    if (!await consumeRateLimit({scope:"rotina-editar",actorKey:actor,limit:80,windowSeconds:300}))
      return NextResponse.json({error:"Muitas alterações. Tente novamente."},
        {status:429,headers:noCache});
    const payload = {
      status:body.status,
      concluida_em:body.status==="concluida"?new Date().toISOString():null,
      atualizada_em:new Date().toISOString(),
      ...(body.dataPrevista ? {data_prevista:body.dataPrevista} : {}),
    };
    const {data, error: updateError} = await supabase
      .from("rotina_profissional_tarefas_v1")
      .update(payload).eq("id",body.id).eq("profissional_id",actor)
      .select("id").maybeSingle();
    if (updateError || !data) return NextResponse.json(
      {error:"Atividade não encontrada ou não autorizada."},
      {status:404,headers:noCache});
    return NextResponse.json({ok:true},{headers:noCache});
  } catch(err) {
    logServerFailure("rotina-edit",err);
    return NextResponse.json({error:"Não foi possível atualizar a atividade."},
      {status:500,headers:noCache});
  }
}

export async function DELETE(request: Request) {
  const {error,body} = await parseMutation(request);
  if (error) return error;
  if (!body || !isUuid(body.id)) return NextResponse.json(
    {error:"Identificador inválido."},{status:400,headers:noCache});
  try {
    const supabase = await createClient();
    const actor = await getActor(supabase);
    if (!actor) return NextResponse.json({error:"Perfil profissional não autorizado."},
      {status:403,headers:noCache});
    const {data,error:deleteError} = await supabase
      .from("rotina_profissional_tarefas_v1")
      .delete().eq("id",body.id).eq("profissional_id",actor)
      .select("id").maybeSingle();
    if (deleteError || !data) return NextResponse.json(
      {error:"Atividade não encontrada ou não autorizada."},
      {status:404,headers:noCache});
    return NextResponse.json({ok:true},{headers:noCache});
  } catch(err) {
    logServerFailure("rotina-delete",err);
    return NextResponse.json({error:"Não foi possível excluir a atividade."},
      {status:500,headers:noCache});
  }
}
