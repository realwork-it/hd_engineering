import { NextResponse } from "next/server";
import { getHub } from "@/lib/participant/data";

// 허브 잠금 상태 폴링 (R3, 15초)
export async function GET(_req: Request, ctx: RouteContext<"/s/[slug]/state">) {
  const { slug } = await ctx.params;
  const hub = await getHub(slug);
  if (!hub) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ locks: hub.locks }, { headers: { "Cache-Control": "no-store" } });
}
