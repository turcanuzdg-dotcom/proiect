import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Parolă uitată" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Ai uitat parola?</h1>
      <p className="text-muted-foreground mt-1.5 text-[15px]">
        Scrie adresa de e-mail a contului și îți trimitem un link pentru o parolă nouă.
      </p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
      <p className="text-muted-foreground mt-8 text-center text-sm">
        <Link href="/login" className="text-primary font-medium hover:underline">
          Înapoi la autentificare
        </Link>
      </p>
    </>
  );
}
