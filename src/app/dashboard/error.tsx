"use client";

import { useEffect } from "react";
import "./dashboard.css";

// 현황판은 TV에 떠 있는 화면이라 사람이 버튼을 누를 수 없다 → 10초마다 스스로 다시 시도한다
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    const timer = setInterval(() => retry(), 10_000);
    return () => clearInterval(timer);
  }, [error, retry]);
  return (
    <main className="db-root db-deny">
      <div><h1>가치체계 내재화 여정</h1><p>집계를 불러오는 중입니다. 잠시 후 자동으로 다시 연결합니다.</p></div>
    </main>
  );
}
