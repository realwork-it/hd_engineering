"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function Success({
  title, children, recap, slug, onEdit,
}: { title: string; children: ReactNode; recap?: ReactNode; slug: string; onEdit?: () => void }) {
  return (
    <div className="pt-success" role="status">
      <div className="inner">
        <div className="ic">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3>{title}</h3>
        <p>{children}</p>
        {recap && <div className="recap">{recap}</div>}
        {onEdit && <button type="button" className="again" onClick={onEdit}>내용 수정하기</button>}
        <Link className="back" href={`/s/${slug}`}>처음 화면으로</Link>
      </div>
    </div>
  );
}
