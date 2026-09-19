// SPEC.md §6 — 시드 로더. 재실행 안전:
//  · teams: name 기준 upsert
//  · sessions: 테이블이 비어 있을 때만 (콘솔에서 수정한 값을 덮어쓰지 않도록)
//  · app_settings: 없는 키만 추가 (dashboard_token 보존)
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parse } from "csv-parse/sync";
import { customAlphabet } from "nanoid";
import { adminClient } from "./_client.mjs";

const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"; // 혼동 문자(0O1lI) 제외
const newSlug = customAlphabet(SLUG_ALPHABET, 6);

const POOL_ADJ = "객관적인, 주도적인, 개방적인, 존중하는, 원칙을 준수하는, 전략적인, 책임감 있는, 미래지향적인, 배려하는, 일관된, 합리적인, 성과지향적인, 창의적인, 포용적인, 투명한, 명확한, 추진력 있는, 성장을 추구하는, 고객지향적인, 진정성 있는, 세심한, 신속한, 유연한, 경계를 넘는, 공정한, 정교한, 결단력 있는, 학습 지향적인, 수평적인, 신중한, 균형 잡힌, 끈기 있는, 과감한, 겸손한, 실용적인, 선제적인, 집요한, 긍정적인, 협력적인, 효율적인, 깊이 있는, 준비된, 소신 있는, 통합적인, 신뢰를 만드는, 통찰력 있는, 완결성 있는, 설득력 있는, 장기적 관점의, 체계적인".split(", ");
const POOL_NOUN = "문제해결, 전문성, 실행, 협업, 혁신, 판단, 학습, 주인의식, 연결, 도전, 의사결정, 성장, 몰입, 소통, 변화대응, 분석, 자기개발, 책임감, 조정, 기회포착, 통찰, 지식공유, 주도성, 설득, 기업가정신, 기획, 기준정립, 추진력, 관계형성, 가치창출, 검증, 데이터활용, 목표달성, 파트너십, 지속가능성, 리스크관리, 시장이해, 우선순위, 영향력, 회복탄력성, 사업감각, 완성도, 효율성, 공감, 용기, 시스템사고, 통합사고, 신뢰, 상생, 적응력".split(", ");

function readCsv(name) {
  const text = readFileSync(new URL(`../supabase/seed/${name}`, import.meta.url), "utf8");
  return parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`시드 검증 실패: ${msg}`);
}

const db = adminClient();

// teams -----------------------------------------------------------------------
const teamRows = readCsv("seed_teams.csv");
assert(teamRows.length === 164, `teams 164행이어야 함 (실제 ${teamRows.length})`);
assert(new Set(teamRows.map((r) => r.team_name)).size === 164, "team_name 중복");
assert(teamRows.reduce((a, r) => a + Number(r.headcount), 0) === 2659, "인원 합 2,659 불일치");

const teams = teamRows.map((r) => ({
  name: r.team_name,
  org_name: r.org_name,
  sil_name: r.sil_name === "(본부 직속)" ? null : r.sil_name,
  headcount: Number(r.headcount),
  status: "active",
}));
{
  const { error } = await db.from("teams").upsert(teams, { onConflict: "name" });
  if (error) throw error;
  console.log(`teams: ${teams.length}건 upsert`);
}

// sessions --------------------------------------------------------------------
const sessionRows = readCsv("seed_sessions.csv");
assert(sessionRows.length === 42, `sessions 42행이어야 함 (실제 ${sessionRows.length})`);
assert(POOL_ADJ.length === 50 && POOL_NOUN.length === 50, "Pool은 각 50개");
{
  const { count, error } = await db.from("sessions").select("id", { count: "exact", head: true });
  if (error) throw error;
  if (count > 0) {
    console.log(`sessions: 이미 ${count}건 존재 — 건너뜀`);
  } else {
    const slugs = new Set();
    const sessions = sessionRows.map((r) => {
      let slug;
      do slug = newSlug(); while (slugs.has(slug));
      slugs.add(slug);
      // '대강의실 A' → location '대강의실', room 'A'
      const [location, ...rest] = r.location.split(" ");
      return {
        slug,
        display_no: r.display_no,
        date: r.date || null,
        location,
        room: rest.join(" ") || null,
        capacity: r.capacity ? Number(r.capacity) : null,
        status: r.status,
        note: r.note || null,
      };
    });
    const { error: insErr } = await db.from("sessions").insert(sessions);
    if (insErr) throw insErr;
    console.log(`sessions: ${sessions.length}건 insert`);
  }
}

// app_settings ----------------------------------------------------------------
const settings = [
  { key: "study_default_url", value: "https://claude.ai/artifact/QpQj6eAVpJ8TDTT1WQXK3G" },
  { key: "include_pilot", value: false },
  { key: "pool_adj", value: POOL_ADJ },
  { key: "pool_noun", value: POOL_NOUN },
  { key: "dashboard_token", value: randomBytes(24).toString("base64url") },
];
{
  const { error } = await db
    .from("app_settings")
    .upsert(settings, { onConflict: "key", ignoreDuplicates: true });
  if (error) throw error;
  console.log(`app_settings: ${settings.length}개 키 확인 (기존 값 보존)`);
}

console.log("시드 완료");
