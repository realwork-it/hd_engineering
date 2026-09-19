import "../participant.css";

export default function ParticipantLayout({ children }: LayoutProps<"/s/[slug]">) {
  return (
    <div className="pt-root">
      <div className="pt-screen">{children}</div>
    </div>
  );
}
