import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Se încarcă">
      <div>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-72" />
      </div>
      <div className="border-border bg-surface grid grid-cols-2 gap-3 rounded-2xl border p-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-80 lg:col-span-3" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
    </div>
  );
}
