import test from "node:test";import assert from "node:assert/strict";import {parseUbsChoice} from "../../src/lib/validation/ubs-choice.ts";
test("Outra UBS means null, never an invented unit or a clinical grant",()=>{
 assert.equal(parseUbsChoice("outra",true),null);
 assert.equal(parseUbsChoice("outra",false),undefined);
 assert.equal(parseUbsChoice("",true),undefined);
 assert.equal(parseUbsChoice("",true,true),null);
 assert.equal(parseUbsChoice("invalid",true),undefined);
 assert.equal(parseUbsChoice("00000000-0000-4000-8000-000000000101",false),"00000000-0000-4000-8000-000000000101");
});