import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Se încarcă documentele">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    </div>
  );
}
