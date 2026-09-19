import { notFound, redirect } from "next/navigation";
import { getHub, getFormData } from "@/lib/participant/data";
import { sessionLabel } from "@/lib/participant/types";
import { PledgeForm } from "@/components/participant/PledgeForm";

export const dynamic = "force-dynamic";

export default async function Page({ params }: PageProps<"/s/[slug]/pledge">) {
  const { slug } = await params;
  const hub = await getHub(slug);
  if (!hub) notFound();
  if (!hub.locks.pledge) redirect(`/s/${slug}`); // R3: 잠긴 활동은 직접 URL로도 열리지 않는다
  const data = await getFormData();
  const label = sessionLabel(hub.display_no);

  return (
    <>
      <div className="pt-topbar">
        <a className="t" href={`/s/${slug}`}>‹ 개인다짐 제출</a>
        <span className="pt-badge">{label}</span>
      </div>
      <PledgeForm slug={slug} teams={data.teams} adj={data.adj} noun={data.noun} />
    </>
  );
}
