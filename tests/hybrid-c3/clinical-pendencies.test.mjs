import test from "node:test";
import assert from "node:assert/strict";
import {pendingItems,weeksFromDum} from "../../src/lib/clinical-pendencies.ts";
const exam=(codigo,trimestre,semanaInicio=null,condicaoAplicacao=null)=>({codigo,nome:codigo,trimestre,semanaInicio,condicaoAplicacao});
const vaccine=(codigo,semanaInicio,condicaoAplicacao=null)=>({codigo,nome:codigo,semanaInicio,condicaoAplicacao});
const exams=[exam("hiv_t1",1),exam("hiv_rapido_t1",1),exam("coombs_t1",1,null,"Rh negativo"),exam("ttog_t2",2,24,"Conforme glicemia"),exam("hiv_t3",3,28)];
const vaccines=[vaccine("dtpa",20,"Uma dose"),vaccine("vvsr",28,"Uma dose"),vaccine("dt",null,"Conforme histórico")];
const codes=(items)=>items.map(x=>x.codigo);
test("9, 19, 20, 24, 27 e 28 semanas respeitam fase e indicação",()=>{
 assert.deepEqual(codes(pendingItems(exams,[],9,"exam",true)),["hiv_t1"]);
 assert.deepEqual(codes(pendingItems(vaccines,[],19,"vaccine",true)),[]);
 assert.deepEqual(codes(pendingItems(vaccines,[],20,"vaccine",true)),["dtpa"]);
 assert.deepEqual(codes(pendingItems(vaccines,[],27,"vaccine",true)),["dtpa"]);
 assert.deepEqual(codes(pendingItems(vaccines,[],28,"vaccine",true)),["dtpa","vvsr"]);
 assert.deepEqual(codes(pendingItems(exams,[{codigo:"ttog_t2",trimestre:2,status:"pendente"}],23,"exam",true)),["hiv_t1"]);
 assert.deepEqual(codes(pendingItems(exams,[{codigo:"ttog_t2",trimestre:2,status:"pendente"}],24,"exam",true)),["hiv_t1","ttog_t2"]);
 assert.deepEqual(codes(pendingItems(exams,[],28,"exam",true)),["hiv_t1","hiv_t3"]);
});
test("realizado, resultado alterado e não se aplica não são procedimentos pendentes",()=>{
 assert.deepEqual(codes(pendingItems(exams,[{codigo:"hiv_rapido_t1",trimestre:1,status:"resultado_alterado"}],9,"exam",true)),[]);
 assert.deepEqual(codes(pendingItems(vaccines,[{codigo:"dtpa",status:"realizada"},{codigo:"vvsr",status:"nao_se_aplica"}],30,"vaccine",true)),[]);
});
test("IG ausente, puerpério, alta: não gerar pendências de pré-natal",()=>{
 assert.deepEqual(pendingItems(exams,[],null,"exam",true),[]);
 assert.deepEqual(pendingItems(vaccines,[],32,"vaccine",false),[]);
 assert.equal(weeksFromDum("2026-05-15","2026-11-27",null),28);
 assert.equal(weeksFromDum(null,"2026-11-27",19),19);
});
