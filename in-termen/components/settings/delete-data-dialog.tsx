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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteAllMyData } from "@/lib/actions/settings";
import { DELETE_CONFIRMATION_WORD } from "@/lib/constants";

export function DeleteDataDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  const matches = confirmation.trim().toLocaleUpperCase("ro-RO") === DELETE_CONFIRMATION_WORD;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setConfirmation("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive-outline">
          <Trash aria-hidden />
          Șterge toate datele mele
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ștergi toate datele?</AlertDialogTitle>
          <AlertDialogDescription>
            Se șterg definitiv toate documentele, fișierele, reminderele, persoanele din familie și istoricul. Contul
            tău rămâne activ, dar gol. Acțiunea nu poate fi anulată — îți recomandăm să exporți datele înainte.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field id="confirm-delete" label={`Scrie „${DELETE_CONFIRMATION_WORD}” pentru a confirma`} className="mt-4">
          <Input
            id="confirm-delete"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Renunță</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!matches || pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteAllMyData(confirmation);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(result.message ?? "Datele au fost șterse.");
                setOpen(false);
                setConfirmation("");
                router.push("/dashboard");
                router.refresh();
              })
            }
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Trash aria-hidden />}
            {pending ? "Se șterge…" : "Șterge definitiv"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
