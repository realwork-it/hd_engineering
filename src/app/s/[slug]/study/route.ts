import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getDeviceKey } from "@/lib/participant/data";

// R15: 조회 로그 기록 후 study_url(없으면 기본값)로 302. 잠겨 있거나 없는 차수면 허브로.
export async function GET(request: Request, ctx: RouteContext<"/s/[slug]/study">) {
  const { slug } = await ctx.params;
  const { data: url, error } = await createServiceClient().rpc("log_study_view", {
    p_slug: slug,
    p_device_key: await getDeviceKey(),
  });
  if (error) console.error("[log_study_view]", error.message);
  if (typeof url === "string" && /^https?:\/\//.test(url)) return NextResponse.redirect(url, 302);
  return NextResponse.redirect(new URL(`/s/${slug}`, request.url), 302);
}
