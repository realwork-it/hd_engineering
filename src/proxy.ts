import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const DEVICE_COOKIE = "hec_dk";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/s/")) return participant(request);
  if (request.nextUrl.pathname === "/dashboard") return dashboard(request);
  return admin(request);
}

// 현황판: ?k=토큰 → 서명한 값을 쿠키에 넣고 토큰 없는 주소로 보낸다(TV·빔 화면의 주소창에 토큰이 남지 않게).
// 토큰이 맞는지는 페이지가 현재 토큰의 서명과 비교해 판정한다 → 재발급 즉시 기존 쿠키도 무효.
async function dashboard(request: NextRequest) {
  const k = request.nextUrl.searchParams.get("k");
  if (!k) return NextResponse.next();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(process.env.DASHBOARD_TOKEN_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(k));
  const value = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set("hec_dash", value, {
    httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
    path: "/dashboard", maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}

// 참여자: 기기 키 쿠키 발급 (R7 같은 기기 재제출 판정, R15 조회 로그).
// 서버 발급 쿠키라 iOS Safari의 스크립트 저장소 7일 제한을 받지 않는다.
function participant(request: NextRequest) {
  if (request.cookies.has(DEVICE_COOKIE)) return NextResponse.next();
  const key = crypto.randomUUID();
  request.cookies.set(DEVICE_COOKIE, key); // 이번 요청부터 바로 보이도록
  const response = NextResponse.next({ request });
  response.cookies.set(DEVICE_COOKIE, key, {
    httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
    path: "/s", maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}

// /admin 보호 + 운영자 세션 쿠키 갱신. 화이트리스트 검증은 (console)/layout.tsx에서 한다.
async function admin(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname === "/admin/login";

  if (!data.user && !isLogin) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return response;
}

export const config = { matcher: ["/admin/:path*", "/s/:path*", "/dashboard"] };
