// 운영자 계정 생성 + 화이트리스트 등록 (M0: 1계정)
// .env.local의 ADMIN_EMAIL / ADMIN_PASSWORD를 읽는다. 실행 후 두 값은 지워도 된다.
import { adminClient } from "./_client.mjs";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error(".env.local에 ADMIN_EMAIL / ADMIN_PASSWORD를 넣고 다시 실행하세요.");
  process.exit(1);
}

const db = adminClient();

const { error: createErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (createErr && createErr.code !== "email_exists") throw createErr;
console.log(createErr ? `계정 이미 존재: ${email}` : `계정 생성: ${email}`);

const { error } = await db.from("admin_emails").upsert({ email }, { onConflict: "email" });
if (error) throw error;
console.log("화이트리스트 등록 완료");
