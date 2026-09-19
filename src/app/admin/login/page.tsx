"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm rounded-card bg-card p-8 shadow-sm">
        <p className="text-sm font-semibold text-gold">운영 콘솔</p>
        <h1 className="mt-1 text-xl font-bold text-navy">로그인</h1>

        <label className="mt-6 block text-sm font-medium" htmlFor="email">이메일</label>
        <input
          id="email" name="email" type="email" autoComplete="username" required
          className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-navy"
        />
        <label className="mt-4 block text-sm font-medium" htmlFor="password">비밀번호</label>
        <input
          id="password" name="password" type="password" autoComplete="current-password" required
          className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-navy"
        />

        {error && <p role="alert" className="mt-4 text-sm text-warn">{error}</p>}

        <button
          type="submit" disabled={pending}
          className="mt-6 w-full rounded-xl bg-navy py-3 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "확인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
