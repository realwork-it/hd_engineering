export type Activity = "study" | "identity" | "finder" | "pledge" | "pulse";
export type Locks = Record<Activity, boolean>;

export type Hub = {
  display_no: string;
  date: string | null;
  location: string | null;
  room: string | null;
  status: string;
  locks: Locks;
};

export type Team = { id: string; name: string; org_name: string; sil_name: string | null };
// id === null → 명부에 없는 팀 직접 입력 (R4)
export type TeamPick = { id: string | null; name: string; org_name?: string; sil_name?: string | null };
export type Word = { word: string; custom: boolean };

export type SubmitResult =
  | { ok: true; status: "created" | "updated" }
  | { ok: false; code: "locked" | "not_found" | "exists" | "invalid" | "error" };

// 부록 B — 허브 카드 순서·번호 (동결)
export const HUB_CARDS: { no: number; activity: Activity; title: string; desc: string }[] = [
  { no: 2, activity: "study", title: "시험공부 자료", desc: "가치체계 능력시험 전, 가볍게 읽어보세요" },
  { no: 3, activity: "identity", title: "팀 정체성 제출", desc: "팀에서 확정한 문장을 올려주세요" },
  { no: 4, activity: "finder", title: "조별 인재상 제출", desc: "조에서 작성한 키워드를 올려주세요" },
  { no: 5, activity: "pledge", title: "개인다짐 제출", desc: "나의 다짐 한 줄을 남겨주세요" },
  { no: 6, activity: "pulse", title: "Pulse Check", desc: "워크숍을 마치며, 다섯 문항" },
];

export function sessionLabel(displayNo: string): string {
  return /^\d/.test(displayNo) ? `${displayNo}차수` : `파일럿 ${displayNo}`;
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export function dateLabel(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return `${m}/${d}(${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}
