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
    if (!confirm("현황판 공유 링크를 새로 만듭니다.\n\n지금까지 전달한 링크·QR은 즉시 열리지 않게 되고, 고객사에는 새 링크를 다시 보내야 합니다.\n링크가 외부로 새어 나갔을 때만 사용하세요. 계속할까요?")) return;
    start(async () => {
      const res = await rotateDashboardToken();
      if (res.ok) setQrKey((k) => k + 1);
      toast(res.ok ? "공유 링크를 새로 만들었습니다 — 기존 링크는 만료되었습니다. 새 링크를 전달해 주세요" : `링크 교체 실패: ${res.message}`);
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
            <button className="ad-btn sm danger" disabled={pending} onClick={rotate}>공유 링크 교체</button>
          </div>
          <div className="ad-helper">
            위 링크(또는 QR)를 가진 사람은 로그인 없이 현황판을 볼 수 있습니다. 링크가 의도치 않게 퍼졌을 때 <b>공유 링크 교체</b>를 누르면
            기존 링크는 즉시 막히고 새 링크가 만들어집니다. 평소에는 누를 일이 없습니다.
          </div>
        </div>
      </div>
      {node}
    </div>
  );
}
