import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="continut" className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">Pagina nu există</h1>
      <p className="text-muted-foreground mt-2 text-[15px]">Linkul poate fi greșit sau pagina a fost mutată.</p>
      <Button asChild className="mt-6">
        <Link href="/">Înapoi la început</Link>
      </Button>
    </main>
  );
}
