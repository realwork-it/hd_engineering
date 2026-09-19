"use client";

import { useRouter } from "next/navigation";

export function DayPicker({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const go = (d: string) => router.push(d === today ? "/admin" : `/admin?date=${d}`);
  return (
    <div className="ad-daynav">
      <input type="date" value={date} aria-label="운영일 선택" onChange={(e) => e.target.value && go(e.target.value)} />
      {date !== today && <button className="ad-btn sm sec" onClick={() => go(today)}>오늘</button>}
    </div>
  );
}
