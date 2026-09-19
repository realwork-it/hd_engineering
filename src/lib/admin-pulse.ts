import "server-only";
import { adminDb } from "@/lib/admin";
import { fetchAll } from "@/lib/admin-data";

export const PULSE_LABELS = ["가치체계 이해", "가치체계 공감", "팀 연결", "실천 의지"];
export const ALERT_GAP = 1.0; // 전체 평균 대비 이만큼 낮으면 경보 (SPEC §5.3)

type Row = {
  session_id: string; open_text: string; created_at: string;
  q1_pre: number; q1_post: number; q2_pre: number; q2_post: number;
  q3_pre: number; q3_post: number; q4_pre: number; q4_post: number;
};
export type PulseSession = {
  id: string; no: string; date: string | null; place: string; ft: string | null;
  people: number | null; n: number; delta: number; alert: boolean;
};
export type OpenText = { session_no: string; text: string; created_at: string; session_id: string };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const delta = (r: Row) => (r.q1_post - r.q1_pre + r.q2_post - r.q2_pre + r.q3_post - r.q3_pre + r.q4_post - r.q4_pre) / 4;

export async function loadPulse() {
  const db = await adminDb();
  const [rows, { data: sess }] = await Promise.all([
    fetchAll<Row>(db, "pulses", "session_id, open_text, created_at, q1_pre, q1_post, q2_pre, q2_post, q3_pre, q3_post, q4_pre, q4_post"),
    db.from("sessions").select("id, display_no, date, location, room, ft_name, actual, expected, status").neq("status", "canceled"),
  ]);
  const meta = new Map((sess ?? []).map((s) => [s.id, s]));
  const live = rows.filter((r) => meta.has(r.session_id));

  const overall = mean(live.map(delta));
  const bySession = new Map<string, Row[]>();
  for (const r of live) (bySession.get(r.session_id) ?? bySession.set(r.session_id, []).get(r.session_id)!).push(r);

  const sessions: PulseSession[] = [...bySession].map(([id, rs]) => {
    const s = meta.get(id)!;
    const d = mean(rs.map(delta));
    return {
      id, no: s.display_no, date: s.date, place: [s.location, s.room].filter(Boolean).join(" "), ft: s.ft_name,
      people: s.actual ?? s.expected, n: rs.length, delta: d, alert: d < overall - ALERT_GAP,
    };
  }).sort((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9") || Number(a.no) - Number(b.no));

  const questions = PULSE_LABELS.map((label, i) => {
    const k = i + 1;
    const pre = mean(live.map((r) => r[`q${k}_pre` as keyof Row] as number));
    const post = mean(live.map((r) => r[`q${k}_post` as keyof Row] as number));
    return { label, pre, post };
  });

  const people = sessions.reduce((a, s) => a + (s.people ?? 0), 0);
  const texts: OpenText[] = live.map((r) => ({
    session_id: r.session_id, session_no: meta.get(r.session_id)!.display_no, text: r.open_text, created_at: r.created_at,
  }));
  return { n: live.length, overall, sessions, questions, texts, responseRate: people ? Math.min(100, Math.round((live.length / people) * 100)) : null };
}
