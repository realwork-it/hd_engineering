import { NextResponse } from "next/server";
import { getDashboardData, isViewerAuthorized } from "@/lib/dashboard";

// 현황판 30초 폴링용. 쿠키 검증 실패 시 401 → 화면은 안내 페이지로 전환.
export async function GET() {
  if (!(await isViewerAuthorized())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getDashboardData(), { headers: { "Cache-Control": "no-store" } });
}
