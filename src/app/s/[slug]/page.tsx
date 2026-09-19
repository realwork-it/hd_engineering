import { notFound } from "next/navigation";
import { getHub } from "@/lib/participant/data";
import { dateLabel, sessionLabel } from "@/lib/participant/types";
import { HubList } from "@/components/participant/HubList";

export const dynamic = "force-dynamic";

export default async function HubPage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const hub = await getHub(slug);
  if (!hub) notFound();

  const badges = [sessionLabel(hub.display_no), dateLabel(hub.date), [hub.location, hub.room].filter(Boolean).join(" ")]
    .filter(Boolean);

  return (
    <>
      <div className="pt-hub-hero">
        <div className="road" />
        <div className="w">현대엔지니어링 가치체계 내재화 워크숍</div>
        <div className="t">공간과 에너지를 잇는 길 위에서,<br />오늘의 여정을 시작합니다</div>
        <div className="meta">
          {badges.map((b) => <span key={b} className="pt-badge">{b}</span>)}
        </div>
      </div>
      <HubList slug={slug} initialLocks={hub.locks} />
      <div className="pt-hub-note">
        진행 순서에 맞춰 FT가 활동을 하나씩 엽니다. 잠금이 풀리면 번호 옆에 이름이 나타나요.
      </div>
    </>
  );
}
