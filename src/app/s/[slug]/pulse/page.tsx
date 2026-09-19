import { notFound, redirect } from "next/navigation";
import { getHub } from "@/lib/participant/data";
import { PulseForm } from "@/components/participant/PulseForm";

export const dynamic = "force-dynamic";

export default async function Page({ params }: PageProps<"/s/[slug]/pulse">) {
  const { slug } = await params;
  const hub = await getHub(slug);
  if (!hub) notFound();
  if (!hub.locks.pulse) redirect(`/s/${slug}`); // R3: 잠긴 활동은 직접 URL로도 열리지 않는다

  return (
    <>
      <PulseForm slug={slug} />
    </>
  );
}
