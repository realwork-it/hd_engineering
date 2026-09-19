import { adminDb } from "@/lib/admin";
import { fetchAll } from "@/lib/admin-data";
import { TeamsView, type PendingTeam, type TeamRow } from "@/components/admin/TeamsView";

export const dynamic = "force-dynamic";

type Ref = { team_id: string | null; hidden: boolean; sessions: { display_no: string } | null };

export default async function TeamsPage() {
  const db = await adminDb();
  const [{ data: teams }, identities, finders, pledges] = await Promise.all([
    db.from("teams").select("id, name, org_name, sil_name, headcount, status").neq("status", "merged").order("headcount", { ascending: false, nullsFirst: false }),
    fetchAll<Ref>(db, "team_identities", "team_id, hidden, sessions(display_no)"),
    fetchAll<Ref>(db, "finder_submissions", "team_id, hidden, sessions(display_no)"),
    fetchAll<Ref>(db, "pledges", "team_id, hidden, sessions(display_no)"),
  ]);

  const tally = (rows: Ref[]) => {
    const m = new Map<string, { n: number; sessions: Set<string> }>();
    for (const r of rows) {
      if (!r.team_id || r.hidden) continue;
      const e = m.get(r.team_id) ?? m.set(r.team_id, { n: 0, sessions: new Set() }).get(r.team_id)!;
      e.n++;
      e.sessions.add(r.sessions?.display_no ?? "?");
    }
    return m;
  };
  const [ti, tf, tp] = [tally(identities), tally(finders), tally(pledges)];

  const all = teams ?? [];
  const roster: TeamRow[] = all.filter((t) => t.status === "active").map((t) => ({
    id: t.id, name: t.name, org: t.org_name, sil: t.sil_name ?? "", headcount: t.headcount,
    identities: ti.get(t.id)?.n ?? 0, identitySessions: [...(ti.get(t.id)?.sessions ?? [])], pledges: tp.get(t.id)?.n ?? 0,
  }));
  const pending: PendingTeam[] = all.filter((t) => t.status === "pending").map((t) => ({
    id: t.id, name: t.name,
    identities: ti.get(t.id)?.n ?? 0, finders: tf.get(t.id)?.n ?? 0, pledges: tp.get(t.id)?.n ?? 0,
    sessions: [...new Set([ti, tf, tp].flatMap((m) => [...(m.get(t.id)?.sessions ?? [])]))],
  }));

  const orgs = new Set(roster.map((t) => t.org)), sils = new Set(roster.filter((t) => t.sil).map((t) => `${t.org}/${t.sil}`));
  return <TeamsView roster={roster} pending={pending} summary={`${orgs.size}개 조직 · ${sils.size}개 실 · ${roster.length}개 팀 — 참여자 자동완성의 원천`} />;
}
