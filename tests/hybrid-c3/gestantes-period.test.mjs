import test from "node:test";
import assert from "node:assert/strict";
import {consultationPeriod,periodLabel} from "../../src/lib/gestantes-period.ts";
test("separa mês e ano sem inventar datas de consulta",()=>{
 assert.equal(consultationPeriod("2026-10-08"),"2026-10");
 assert.equal(consultationPeriod("2025-10-08"),"2025-10");
 assert.equal(consultationPeriod(null),null);
 assert.equal(consultationPeriod("2026-02-30"),null);
 assert.equal(periodLabel("sem-data"),"Sem consulta registrada");
});
