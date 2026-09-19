import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export default async function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/admin/login");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between bg-deep px-6 py-3 text-white">
        <span className="font-bold">HEC 워크숍 운영 콘솔</span>
        <form action={signOut} className="flex items-center gap-3 text-sm">
          <span className="text-white/70">{user.email}</span>
          <button type="submit" className="rounded-lg border border-white/30 px-3 py-1">로그아웃</button>
        </form>
      </header>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
