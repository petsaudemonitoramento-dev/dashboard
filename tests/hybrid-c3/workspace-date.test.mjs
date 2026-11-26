import test from "node:test";
import assert from "node:assert/strict";
import { workspaceToday } from "../../src/lib/workspace-date.ts";
test("agenda respeita o dia local de Fortaleza na virada UTC",()=>{
  assert.equal(workspaceToday(new Date("2026-11-26T01:30:00Z")),"2026-11-25");
  assert.equal(workspaceToday(new Date("2026-11-26T03:00:00Z")),"2026-11-26");
});
