"use client";

import { useEffect } from "react";

// 서버 오류(예: DB 일시 장애) 시 기본 영어 오류 화면 대신 보여 주는 안내. 입력 중이던 내용은 기기에 저장돼 있다.
export default function ErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="ad-card ad-empty">
      <h1>화면을 불러오지 못했습니다</h1>
      <p>네트워크나 DB 연결이 일시적으로 불안정할 수 있습니다. 데이터에는 영향이 없습니다.</p>
      <button type="button" className="ad-btn pri" onClick={() => retry()}>다시 시도</button>
    </div>
  );
}
