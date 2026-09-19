"use client";

import { useEffect, useRef, useState } from "react";
import type { Word } from "@/lib/participant/types";

// R9: 포커스 시 Pool 전체(가나다순) 칩, 타이핑 시 필터, Pool 밖 단어는 그대로 확정(점선 칩)
export function Combo({
  pool, placeholder, value, onChange, align = "left",
}: {
  pool: string[]; placeholder: string; value: Word | null;
  onChange: (w: Word | null) => void; align?: "left" | "right";
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function confirm(word: string) {
    const w = word.trim();
    if (!w) return;
    onChange({ word: w, custom: !pool.includes(w) });
    setQ("");
    setOpen(false);
  }

  if (value)
    return (
      <div className={`pt-combo ${align}`}>
        <span className={`pt-picked-chip${value.custom ? " custom" : ""}`}>
          {value.word}
          {value.custom && <span style={{ fontSize: 10, fontWeight: 500 }}>(직접 입력)</span>}
          <button type="button" className="x" aria-label={`${value.word} 지우기`} onClick={() => onChange(null)}>
            ✕
          </button>
        </span>
      </div>
    );

  const query = q.trim();
  const list = query ? pool.filter((w) => w.includes(query)) : pool;
  return (
    <div className={`pt-combo ${align}`} ref={box}>
      <input
        value={q} placeholder={placeholder} autoComplete="off" enterKeyHint="done" maxLength={30}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          // 한글 IME 조합 중 Enter는 무시 (마지막 글자 중복 확정 방지)
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            confirm(q);
          }
        }}
      />
      {open && (
        <div className="pt-sugg">
          <div className="pt-chips">
            {list.map((w) => (
              <button type="button" key={w} className="pt-chip" onClick={() => confirm(w)}>{w}</button>
            ))}
            {query && !pool.includes(query) && (
              <button type="button" className="pt-chip custom-hint" onClick={() => confirm(query)}>
                “{query}” 직접 입력
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
