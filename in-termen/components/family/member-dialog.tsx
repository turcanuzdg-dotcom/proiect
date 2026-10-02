"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveFamilyMember } from "@/lib/actions/family";
import { FAMILY_RELATIONSHIPS } from "@/lib/constants";
import { familyMemberSchema, type FamilyMemberValues } from "@/lib/validations/misc";

interface MemberDialogProps {
  member?: { id: string; full_name: string; relationship: string | null; birth_date: string | null };
  today: string;
}

export function MemberDialog({ member, today }: MemberDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaults: FamilyMemberValues = {
    fullName: member?.full_name ?? "",
    relationship: member?.relationship ?? "",
    birthDate: member?.birth_date ?? "",
  };
  const { register, handleSubmit, formState, reset, setError } = useForm<FamilyMemberValues>({
    resolver: zodResolver(familyMemberSchema),
    defaultValues: defaults,
  });
  const { errors } = formState;
  const prefix = member ? `m-${member.id}` : "m-new";

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await saveFamilyMember(member?.id ?? null, values);
      if (!result.ok) {
        for (const [key, messages] of Object.entries(result.fieldErrors ?? {})) {
          setError(key.replace(/^values\./, "") as keyof FamilyMemberValues, { message: messages[0] });
        }
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Salvat.");
      if (!member) reset({ fullName: "", relationship: "", birthDate: "" });
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {member ? (
          <Button variant="ghost" size="sm" aria-label={`Editează ${member.full_name}`}>
            <Pencil aria-hidden />
            Editează
          </Button>
        ) : (
          <Button>
            <UserPlus aria-hidden />
            Adaugă o persoană
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member ? "Editează persoana" : "Adaugă o persoană"}</DialogTitle>
          <DialogDescription>
            Persoana nu primește acces la cont. O folosești doar ca să grupezi documentele familiei.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field id={`${prefix}-name`} label="Nume și prenume" error={errors.fullName?.message}>
            <Input
              id={`${prefix}-name`}
              autoComplete="off"
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={describedBy(`${prefix}-name`, errors.fullName?.message)}
              {...register("fullName")}
            />
          </Field>
          <Field id={`${prefix}-rel`} label="Relația" optional error={errors.relationship?.message}>
            <Input
              id={`${prefix}-rel`}
              list={`${prefix}-rel-list`}
              placeholder="de ex. Copil"
              {...register("relationship")}
            />
            <datalist id={`${prefix}-rel-list`}>
              {FAMILY_RELATIONSHIPS.map((relationship) => (
                <option key={relationship} value={relationship} />
              ))}
            </datalist>
          </Field>
          <Field id={`${prefix}-birth`} label="Data nașterii" optional error={errors.birthDate?.message}>
            <Input
              id={`${prefix}-birth`}
              type="date"
              max={today}
              aria-invalid={Boolean(errors.birthDate)}
              {...register("birthDate")}
            />
          </Field>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Renunță
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {member ? "Salvează" : "Adaugă"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
