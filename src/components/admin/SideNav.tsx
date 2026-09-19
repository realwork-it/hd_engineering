"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", icon: "☀️", label: "오늘의 운영" },
  { href: "/admin/sessions", icon: "🗓", label: "차수 관리" },
  { href: "/admin/data", icon: "🗂", label: "수집 데이터" },
  { href: "/admin/pulse", icon: "📈", label: "Pulse 분석" },
  { href: "/admin/teams", icon: "🏢", label: "팀 명부" },
];

export function SideNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <nav className="ad-snav">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""}>
          <span className="ico">{n.icon}</span>{n.label}
        </Link>
      ))}
    </nav>
  );
}
