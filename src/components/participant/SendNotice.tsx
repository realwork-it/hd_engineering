"use client";

import { useRouter } from "next/navigation";
import type { SendState } from "./useSubmit";

export function SendNotice({
  state, slug, existsText, onRetry, onOverwrite, onDismiss,
}: {
  state: SendState; slug: string; existsText?: string;
  onRetry: () => void; onOverwrite?: () => void; onDismiss: () => void;
}) {
  const router = useRouter();
  if (state.kind === "sending" && state.attempt > 0)
    return (
      <div className="pt-notice info" role="status">
        연결이 불안정해요. 다시 보내는 중입니다… ({state.attempt}/3)
      </div>
    );
  if (state.kind === "offline")
    return (
      <div className="pt-notice info" role="status">
        인터넷 연결이 끊겼어요. 작성한 내용은 이 기기에 안전하게 보관 중이며, <b>연결되면 자동 전송</b>됩니다.
      </div>
    );
  if (state.kind === "failed")
    return (
      <div className="pt-notice warn" role="alert">
        아직 저장되지 않았어요. 작성한 내용은 그대로 남아 있습니다.
        <div className="row">
          <button type="button" className="pri" onClick={onRetry}>다시 시도</button>
        </div>
      </div>
    );
  if (state.kind !== "rejected") return null;

  if (state.code === "exists")
    return (
      <div className="pt-notice info" role="alert">
        {existsText}
        <div className="row">
          <button type="button" onClick={onDismiss}>취소</button>
          <button type="button" className="pri" onClick={onOverwrite}>수정하기</button>
        </div>
      </div>
    );
  if (state.code === "locked")
    return (
      <div className="pt-notice warn" role="alert">
        지금은 이 활동이 열려 있지 않아요. 작성한 내용은 이 기기에 남아 있습니다.
        <div className="row">
          <button type="button" onClick={() => router.push(`/s/${slug}`)}>처음 화면으로</button>
          <button type="button" className="pri" onClick={onRetry}>다시 시도</button>
        </div>
      </div>
    );
  return (
    <div className="pt-notice warn" role="alert">
      {state.code === "not_found"
        ? "유효하지 않은 워크숍 링크입니다. QR 코드로 다시 접속해 주세요."
        : "입력 내용을 다시 확인해 주세요."}
    </div>
  );
}
