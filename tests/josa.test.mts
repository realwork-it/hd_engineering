import { test } from "node:test";
import assert from "node:assert/strict";
import { jEul, jRo, idSegs, identitySentence } from "../src/lib/josa.ts";

// SPEC R10 — 8케이스
test("을/를", () => {
  assert.equal("설계" + jEul("설계"), "설계를");
  assert.equal("검증" + jEul("검증"), "검증을");
  assert.equal("회사" + jEul("회사"), "회사를");
});
test("으로/로", () => {
  assert.equal("DNA" + jRo("DNA"), "DNA로");
  assert.equal("집요함" + jRo("집요함"), "집요함으로");
  assert.equal("원칙" + jRo("원칙"), "원칙으로");
  assert.equal("길" + jRo("길"), "길로");
  assert.equal("기술" + jRo("기술"), "기술로");
});
test("는/은으로 끝나는 고유업은 '을 하는' 생략", () => {
  assert.deepEqual(idSegs("채용과 육성을 잇는", "", "")[0], { slot: "채용과 육성을 잇는", tail: "우리는," });
  assert.equal(
    identitySentence("플랜트 설계", "끝까지 사람 편에서 생각하는 DNA", "그만두고 싶지 않은 회사"),
    "플랜트 설계를 하는 우리는, 끝까지 사람 편에서 생각하는 DNA로 일하며, 그만두고 싶지 않은 회사를 만든다.",
  );
});
