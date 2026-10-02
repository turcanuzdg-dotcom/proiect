import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Parolă nouă" };

export default async function ResetPasswordPage() {
  const session = await getSession();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Alege o parolă nouă</h1>
      <p className="text-muted-foreground mt-1.5 text-[15px]">
        Folosește o parolă pe care nu o mai ai la alte conturi.
      </p>
      <div className="mt-8">
        {session ? (
          <ResetPasswordForm />
        ) : (
          <Notice tone="warning" title="Linkul nu mai este valid">
            Linkul de resetare a expirat sau a fost deja folosit.{" "}
            <Link href="/forgot-password" className="font-medium underline">
              Cere un link nou
            </Link>
            .
          </Notice>
        )}
      </div>
    </>
  );
}
