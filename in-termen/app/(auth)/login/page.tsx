import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Autentificare" };

const ERRORS: Record<string, string> = {
  link: "Linkul a expirat sau a fost deja folosit. Încearcă din nou.",
  sesiune: "Sesiunea a expirat. Autentifică-te din nou.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const error = typeof params.eroare === "string" ? ERRORS[params.eroare] : undefined;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Bine ai revenit</h1>
      <p className="text-muted-foreground mt-1.5 text-[15px]">Intră în cont ca să vezi ce termene se apropie.</p>
      <div className="mt-8">
        <LoginForm next={next} initialError={error} />
      </div>
      <p className="text-muted-foreground mt-8 text-center text-sm">
        Nu ai cont?{" "}
        <Link href="/signup" className="text-primary font-medium hover:underline">
          Creează unul gratuit
        </Link>
      </p>
    </>
  );
}
