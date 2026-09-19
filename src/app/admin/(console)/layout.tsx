import "../admin.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SideNav } from "@/components/admin/SideNav";
import { signOut } from "../login/actions";

export default async function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/admin/login");

  return (
    <div className="ad-app">
      <aside className="ad-side">
        <div className="ad-brand">
          <div className="t">워크숍 운영 콘솔</div>
          <div className="s">현대엔지니어링 가치체계 내재화</div>
        </div>
        <SideNav />
        <form action={signOut} className="ad-me">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ci" src="/realwork-ci.png" alt="REALWORK" width={1780} height={460} />
          <div>
            <div className="nm">리얼워크 운영자</div>
            <div className="rl">{user.email}</div>
          </div>
          <button type="submit" className="out">로그아웃</button>
        </form>
      </aside>
      <main className="ad-main">{children}</main>
    </div>
  );
}
