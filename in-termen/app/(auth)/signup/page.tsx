import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Cont nou" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Creează-ți contul</h1>
      <p className="text-muted-foreground mt-1.5 text-[15px]">Un minut acum, liniște la fiecare termen.</p>
      <div className="mt-8">
        <SignupForm />
      </div>
      <p className="text-muted-foreground mt-8 text-center text-sm">
        Ai deja cont?{" "}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Autentifică-te
        </Link>
      </p>
    </>
  );
}
