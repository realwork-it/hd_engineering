"use client";

import { useState, useTransition } from "react";
import { rotateDashboardToken } from "@/app/admin/(console)/actions";
import { copyText, useToast } from "./ui";

// SPEC §5.3 현황판 바로가기: 새 탭 열기 · 뷰어 링크 복사 · 공유 QR · 토큰 재발급
export function DashboardShare({ url }: { url: string }) {
  const { toast, node } = useToast();
  const [pending, start] = useTransition();
  const [qrKey, setQrKey] = useState(0);

  function rotate() {
    if (!confirm("토큰을 재발급하면 기존 공유 링크·QR은 즉시 만료됩니다.\n이미 공유한 곳에는 새 링크를 다시 전달해야 합니다. 계속할까요?")) return;
    start(async () => {
      const res = await rotateDashboardToken();
      if (res.ok) setQrKey((k) => k + 1);
      toast(res.ok ? "토큰을 재발급했습니다 — 새 링크를 공유해 주세요" : `재발급 실패: ${res.message}`);
    });
  }

  return (
    <div className="ad-card">
      <div className="hd">
        <div><h2>현황판</h2><div className="cap">고객사 뷰어용 — 통계만 노출되며 제출 원문은 보이지 않습니다</div></div>
      </div>
      <div className="ad-share">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="ad-qr"><img key={qrKey} src={`/admin/qr?dashboard=1&v=${qrKey}`} alt="현황판 공유 QR" /></div>
        <div className="info">
          <div className="u">{url}</div>
          <div className="btns">
            <a className="ad-btn sm pri" href={url} target="_blank" rel="noopener">현황판 열기 ↗</a>
            <button className="ad-btn sm sec" onClick={async () => toast((await copyText(url)) ? "뷰어 공유 링크가 복사되었습니다" : "복사에 실패했습니다")}>뷰어 공유 링크 복사</button>
            <button className="ad-btn sm danger" disabled={pending} onClick={rotate}>토큰 재발급</button>
          </div>
        </div>
      </div>
      {node}
    </div>
  );
}
