import QRCode from "qrcode";
import { adminDb, siteOrigin } from "@/lib/admin";

// 운영자 전용 QR (SVG — 인쇄 시 확대해도 선명). /admin/qr?slug=xxxx 또는 /admin/qr?dashboard=1
// 현황판 QR은 토큰이 들어가므로 URL을 파라미터로 받지 않고 서버에서 조립한다.
export async function GET(request: Request) {
  let db;
  try {
    db = await adminDb();
  } catch {
    return new Response("forbidden", { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const origin = await siteOrigin();

  let target: string;
  if (params.get("dashboard")) {
    const { data } = await db.from("app_settings").select("value").eq("key", "dashboard_token").single();
    target = `${origin}/dashboard?k=${data?.value}`;
  } else {
    const slug = params.get("slug") ?? "";
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(slug)) return new Response("bad slug", { status: 400 });
    target = `${origin}/s/${slug}`;
  }

  const svg = await QRCode.toString(target, {
    type: "svg", errorCorrectionLevel: "M", margin: 1,
    color: { dark: "#0F2B5E", light: "#FFFFFF" },
  });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store" } });
}
