import PlannerTabs from "./PlannerTabs";

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* prevents content from sitting under fixed tabs (and respects iOS safe area) */}
      <div className="min-h-dvh pb-[calc(112px+env(safe-area-inset-bottom))]">{children}</div>
      <PlannerTabs />
    </>
  );
}