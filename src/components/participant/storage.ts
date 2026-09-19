"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// localStorage는 사파리 개인정보 보호 모드 등에서 throw할 수 있다 → 전부 try/catch
export function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * 폼 상태 + 데이터 무손실 (SPEC §5.1)
 *  draft:{slug}:{form}  입력할 때마다 저장, 제출 성공 시 삭제
 *  last:{slug}:{form}   마지막 제출본 — 재방문 시 완료 화면과 "내용 수정하기"에 사용
 *  sub:{slug}:{form}    제출 uuid(멱등키) — 재시도·수정에 같은 값을 쓴다
 */
export function useFormState<T>(slug: string, form: string, empty: T) {
  const keys = useRef({
    draft: `draft:${slug}:${form}`,
    last: `last:${slug}:${form}`,
    sub: `sub:${slug}:${form}`,
  }).current;
  const [value, setValue] = useState<T>(empty);
  const [done, setDone] = useState<T | null>(null); // 완료 화면에 보여줄 제출본
  const [ready, setReady] = useState(false);
  const id = useRef("");

  useEffect(() => {
    id.current = lsGet<string>(keys.sub) ?? uuid();
    lsSet(keys.sub, id.current);
    const draft = lsGet<T>(keys.draft);
    const last = lsGet<T>(keys.last);
    // 저장소에서 복원 — 마운트 시 1회
    if (draft) setValue({ ...empty, ...draft });
    else if (last) setDone(last);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    // 함수형 patch: 빠른 연속 입력에서도 직전 값을 기준으로 갱신
    (patch: Partial<T> | ((v: T) => Partial<T>)) =>
      setValue((v) => {
        const next = { ...v, ...(typeof patch === "function" ? patch(v) : patch) };
        lsSet(keys.draft, next);
        return next;
      }),
    [keys],
  );

  const markDone = useCallback(
    (submitted: T) => {
      lsSet(keys.last, submitted);
      lsDel(keys.draft);
      setDone(submitted);
    },
    [keys],
  );

  const edit = useCallback(() => {
    if (done) {
      setValue(done);
      lsSet(keys.draft, done);
    }
    setDone(null);
  }, [done, keys]);

  return { value, update, done, markDone, edit, ready, submissionId: () => id.current };
}
