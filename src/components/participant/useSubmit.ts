"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SubmitResult } from "@/lib/participant/types";

export type SendState =
  | { kind: "idle" }
  | { kind: "sending"; attempt: number }
  | { kind: "offline" } // 연결되면 자동 전송
  | { kind: "failed" } // 자동 3회 실패 → 수동 재시도
  | { kind: "rejected"; code: "locked" | "not_found" | "exists" | "invalid" };

const BACKOFF_MS = [1000, 2000, 4000]; // 지수 백오프 자동 3회

/**
 * 제출 실행기. 같은 payload(같은 uuid)를 몇 번 보내도 서버가 멱등 처리하므로
 * 응답을 못 받은 경우에도 안전하게 재전송한다. 입력값은 호출측 state·draft에 그대로 남는다.
 */
export function useSubmit(onSuccess: () => void) {
  const [state, setState] = useState<SendState>({ kind: "idle" });
  const job = useRef<(() => Promise<SubmitResult>) | null>(null);
  const running = useRef(false);
  const success = useRef(onSuccess);
  useEffect(() => {
    success.current = onSuccess;
  });

  const run = useCallback(async () => {
    const fn = job.current;
    if (!fn || running.current) return; // 연타 방지
    running.current = true;
    try {
      for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
        if (!navigator.onLine) return setState({ kind: "offline" });
        setState({ kind: "sending", attempt });
        try {
          const res = await fn();
          if (res.ok) {
            job.current = null;
            setState({ kind: "idle" });
            return success.current();
          }
          if (res.code !== "error") return setState({ kind: "rejected", code: res.code });
        } catch {
          // 네트워크 단절·타임아웃 — 아래에서 재시도
        }
        if (attempt < BACKOFF_MS.length) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      }
      setState({ kind: navigator.onLine ? "failed" : "offline" });
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    const onOnline = () => {
      if (job.current) void run();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [run]);

  const submit = useCallback(
    (fn: () => Promise<SubmitResult>) => {
      job.current = fn;
      void run();
    },
    [run],
  );
  const dismiss = useCallback(() => {
    job.current = null;
    setState({ kind: "idle" });
  }, []);

  return { state, submit, retry: run, dismiss, busy: state.kind === "sending" };
}
