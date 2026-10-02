import QRCode from "qrcode";
import { adminDb, siteOrigin } from "@/lib/admin";

// 운영자 전용 QR.  /admin/qr?slug=xxxx | /admin/qr?dashboard=1
//   기본: SVG(화면·인쇄용).  &png=1 이면 PNG 다운로드(PPT·카톡용, 1024px, 흰 여백 포함).  &name=파일명
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
  const color = { dark: "#0F2B5E", light: "#FFFFFF" };

  if (params.get("png")) {
    const png = await QRCode.toBuffer(target, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 1024, color });
    const name = (params.get("name") ?? "QR").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) + ".png";
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="qr.png"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const svg = await QRCode.toString(target, { type: "svg", errorCorrectionLevel: "M", margin: 1, color });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store" } });
}
