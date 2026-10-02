"use client";

import { Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteFamilyMember } from "@/lib/actions/family";

export function DeleteMemberButton({
  memberId,
  name,
  documentCount,
}: {
  memberId: string;
  name: string;
  documentCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive-soft"
          aria-label={`Șterge ${name}`}
        >
          <Trash aria-hidden />
          Șterge
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ștergi persoana „{name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {documentCount > 0
              ? `Cele ${documentCount} documente asociate rămân în cont, dar nu vor mai fi legate de nicio persoană.`
              : "Nu există documente asociate acestei persoane."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Renunță</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteFamilyMember(memberId);
                if (result.ok) {
                  toast.success(result.message ?? "Persoana a fost ștearsă.");
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            Da, șterge
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
