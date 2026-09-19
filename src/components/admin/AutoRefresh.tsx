"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 서버 데이터를 주기적으로 다시 읽는다 — 여러 운영자가 동시에 콘솔을 볼 때 서로의 변경이 보이도록 */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      // 입력 중에는 건드리지 않는다 (실참석 인원 입력 등)
      const el = document.activeElement;
      if (document.visibilityState !== "visible" || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}
