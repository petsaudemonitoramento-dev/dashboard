import test from "node:test";import assert from "node:assert/strict";import {isValidNewPassword} from "../../src/lib/validation/password-policy.ts";
test("minimum 8 characters, letters and numbers, bounded maximum",()=>{
 assert.equal(isValidNewPassword("Abc1234"),false);
 assert.equal(isValidNewPassword("Abcd1234"),true);
 assert.equal(isValidNewPassword("abcdefgh"),false);
 assert.equal(isValidNewPassword("12345678"),false);
 assert.equal(isValidNewPassword("A1".repeat(64)),true);
 assert.equal(isValidNewPassword("A1".repeat(65)),false);
});