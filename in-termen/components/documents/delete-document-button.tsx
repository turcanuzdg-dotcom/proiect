"use client";

import { LoaderCircle, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { deleteDocument } from "@/lib/actions/documents";

export function DeleteDocumentButton({ documentId, title }: { documentId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive-outline">
          <Trash aria-hidden />
          Șterge
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ștergi „{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Se vor șterge definitiv documentul, fișierele atașate (inclusiv cele din reînnoirile anterioare),
            reminderele și istoricul lui. Acțiunea nu poate fi anulată.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Renunță</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteDocument(documentId);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(result.message ?? "Documentul a fost șters.");
                setOpen(false);
                router.push("/documents");
                router.refresh();
              })
            }
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Trash aria-hidden />}
            {pending ? "Se șterge…" : "Da, șterge definitiv"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
