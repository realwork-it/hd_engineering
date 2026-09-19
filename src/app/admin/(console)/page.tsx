import { createClient } from "@/lib/supabase/server";

// M0: 스키마·RLS·시드 연결 확인용. M2에서 '오늘의 운영'으로 교체.
export default async function AdminHome() {
  const supabase = await createClient();
  const tables = ["sessions", "teams", "team_identities", "finder_submissions", "pledges", "pulses"] as const;
  const counts = await Promise.all(
    tables.map(async (t) => {
      const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
      return { t, count, error: error?.message };
    }),
  );

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold text-navy">M0 연결 상태</h1>
      <ul className="mt-4 divide-y divide-line rounded-card bg-card shadow-sm">
        {counts.map(({ t, count, error }) => (
          <li key={t} className="flex justify-between px-5 py-3 text-sm">
            <code>{t}</code>
            <span className={error ? "text-warn" : "font-semibold text-ok"}>{error ?? `${count}건`}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
