import PlannerTabs from "./PlannerTabs";

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Fixed height container that prevents body scroll - content scrolls internally */}
      <div className="h-dvh overflow-hidden">{children}</div>
      <PlannerTabs />
    </>
  );
}