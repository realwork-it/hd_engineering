"use client";

import { useCallback, useRef, useState } from "react";
import type { SessionStatus } from "@/lib/admin";

export const STATUS_LABEL: Record<SessionStatus, string> = {
  pilot: "파일럿", tbd: "미정", confirmed: "확정", running: "진행 중", done: "완료", canceled: "취소",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return <span className={`ad-badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  const node = msg ? <div className="ad-toast" role="status">{msg}</div> : null;
  return { toast, node };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 구형 브라우저·비보안 컨텍스트 대비
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
