"use client";

import { useEffect, useRef, useState } from "react";
import { HUB_CARDS, type Locks } from "@/lib/participant/types";

const POLL_MS = 15_000; // R3

export function HubList({ slug, initialLocks }: { slug: string; initialLocks: Locks }) {
  const [locks, setLocks] = useState(initialLocks);
  const [revealed, setRevealed] = useState<string[]>([]);
  const prev = useRef(initialLocks);

  useEffect(() => {
    let alive = true;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/s/${slug}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const next: Locks = (await res.json()).locks;
        if (!alive) return;
        setRevealed(HUB_CARDS.filter((c) => next[c.activity] && !prev.current[c.activity]).map((c) => c.activity));
        prev.current = next;
        setLocks(next);
      } catch {
        // 일시적 네트워크 오류 — 다음 주기에 재시도
      }
    }
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll); // 화면 복귀 시 즉시 반영
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [slug]);

  return (
    <div className="pt-hub-list">
      {HUB_CARDS.map((c) =>
        locks[c.activity] ? (
          // study는 외부 자료로 302 → 새 창 (R15), 나머지는 같은 창
          <a
            key={c.no} className="pt-hub-card" href={`/s/${slug}/${c.activity}`}
            {...(c.activity === "study" ? { target: "_blank", rel: "noopener" } : {})}
          >
            <span className="num">{c.no}</span>
            <span className={`meta${revealed.includes(c.activity) ? " reveal" : ""}`}>
              <span className="tt">{c.title}</span>
              <span className="dd">{c.desc}</span>
            </span>
            <span className="go">›</span>
          </a>
        ) : (
          // R3: 잠긴 활동은 번호+자물쇠만 (활동명 비노출)
          <div key={c.no} className="pt-hub-card locked" aria-label={`${c.no}번 활동 — 아직 열리지 않았습니다`}>
            <span className="num">{c.no}</span>
            <span className="lock" aria-hidden>🔒</span>
          </div>
        ),
      )}
    </div>
  );
}
