"use client";

import { useEffect } from "react";

// 서버 오류(예: DB 일시 장애) 시 기본 영어 오류 화면 대신 보여 주는 안내. 입력 중이던 내용은 기기에 저장돼 있다.
export default function ErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="pt-msg">
      <h1>잠시 연결이 원활하지 않아요</h1>
      <p>작성하던 내용은 이 기기에 안전하게 남아 있습니다.<br />잠시 후 아래 버튼을 눌러 주세요.</p>
      <button type="button" className="pt-cta pt-msg-btn" onClick={() => retry()}>다시 시도</button>
    </div>
  );
}
