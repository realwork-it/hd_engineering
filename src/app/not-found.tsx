export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm rounded-card bg-card p-8 text-center shadow-sm">
        <h1 className="text-lg font-bold text-navy">페이지를 찾을 수 없습니다</h1>
        <p className="mt-3 text-sm text-deep/70">
          주소를 다시 확인해 주세요.<br />워크숍 참여자는 현장에서 안내받은 QR 코드로 접속하시면 됩니다.
        </p>
      </div>
    </main>
  );
}
