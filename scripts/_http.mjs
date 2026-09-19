// loadtest · rehearsal 공용 — 브라우저와 같은 경로(페이지 GET → Server Action POST)로 앱을 호출한다.

const CHUNK = /\/_next\/static\/chunks\/[^"' ]+?\.js/g;
const REF = /createServerReference\)?\("([0-9a-f]{30,})"[^)]{0,160}?"(\w+)"/g;

/** 페이지들이 내려주는 JS에서 Server Action id를 찾는다 (빌드마다 달라질 수 있어 매번 탐색) */
export async function discoverActions(base, paths) {
  const ids = {}, seen = new Set();
  for (const path of paths) {
    const html = await (await fetch(base + path)).text();
    for (const [src] of html.matchAll(CHUNK)) {
      if (seen.has(src)) continue;
      seen.add(src);
      const js = await (await fetch(base + src)).text();
      for (const m of js.matchAll(REF)) ids[m[2]] = m[1];
    }
  }
  return ids;
}

/** Server Action 호출 → { ok, status | code } */
export async function callAction(base, id, path, cookie, args) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Cookie: cookie },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const m = text.match(/\{"ok":(true|false)[^}]*\}/);
  if (!m) throw new Error("응답 해석 실패: " + text.slice(0, 120));
  return JSON.parse(m[0]);
}

export const cookiesOf = (res) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

export const visibleText = (html) =>
  html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
