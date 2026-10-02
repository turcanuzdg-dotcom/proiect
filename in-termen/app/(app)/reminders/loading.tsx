import { Skeleton } from "@/components/ui/skeleton";

export default function RemindersLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Se încarcă reminderele">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-80" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
