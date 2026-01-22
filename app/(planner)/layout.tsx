import PlannerTabs from "./PlannerTabs";

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Fixed height container that prevents body scroll - content scrolls internally */}
      {/* Account for fixed bottom nav: ~66px + safe-area-inset-bottom */}
      <div className="h-[calc(100dvh-66px-env(safe-area-inset-bottom))] overflow-hidden">{children}</div>
      <PlannerTabs />
    </>
  );
}