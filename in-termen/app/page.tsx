import { BellRing, CalendarCheck, Camera, CircleAlert, Clock, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Camera,
    title: "Fotografiază sau încarcă",
    text: "Buletinul, RCA-ul, revizia tehnică, garanțiile, abonamentele. Totul într-un singur loc.",
  },
  {
    icon: CalendarCheck,
    title: "Vezi ce expiră",
    text: "Un panou simplu: ce a expirat, ce urmează în 7 sau 30 de zile și ce este în regulă.",
  },
  {
    icon: BellRing,
    title: "Acționezi la timp",
    text: "Remindere cu 45, 30, 14, 7 zile și cu o zi înainte. Le amâni sau le bifezi.",
  },
];

/** Previzualizare statică a panoului, pentru pagina de prezentare (date ilustrative). */
function DashboardPreview() {
  const rows = [
    {
      title: "Revizie tehnică automobil",
      meta: "Expiră în 6 zile",
      tone: "text-urgent",
      chip: "Urgent",
      chipClass: "border-urgent-border bg-urgent-soft text-urgent",
      icon: Clock,
    },
    {
      title: "RCA automobil",
      meta: "Expiră în 12 zile",
      tone: "text-upcoming",
      chip: "Urmează",
      chipClass: "border-upcoming-border bg-upcoming-soft text-upcoming",
      icon: CalendarCheck,
    },
    {
      title: "Verificare detector fum",
      meta: "Expirat de 5 zile",
      tone: "text-expired",
      chip: "Expirat",
      chipClass: "border-expired-border bg-expired-soft text-expired",
      icon: CircleAlert,
    },
    {
      title: "Pașaport",
      meta: "Expiră în 95 de zile",
      tone: "text-foreground",
      chip: "În regulă",
      chipClass: "border-safe-border bg-safe-soft text-safe",
      icon: ShieldCheck,
    },
  ];
  return (
    <div className="border-border bg-surface shadow-raised rounded-3xl border p-4 sm:p-5" aria-hidden>
      <p className="text-muted-foreground text-[13px]">Exemplu</p>
      <p className="mt-0.5 font-semibold">Iată ce merită verificat astăzi.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {rows.map(({ title, meta, tone, chip, chipClass, icon: Icon }) => (
          <li key={title} className="border-border flex items-center gap-3 rounded-xl border px-3 py-2.5">
            <span className="bg-primary-soft text-primary flex size-8 items-center justify-center rounded-lg">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className={`block text-xs font-medium ${tone}`}>{meta}</span>
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${chipClass}`}>{chip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
        <Logo />
        <nav className="ml-auto flex items-center gap-2" aria-label="Cont">
          <Button asChild variant="ghost">
            <Link href="/login">Autentificare</Link>
          </Button>
          <Button asChild variant="outline" className="hidden sm:inline-flex">
            <Link href="/signup">Cont nou</Link>
          </Button>
        </nav>
      </header>

      <main id="continut">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div>
            <p className="border-border bg-surface text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-medium">
              <Lock className="text-accent size-3.5" aria-hidden />
              Privat. Doar tu îți vezi documentele.
            </p>
            <h1 className="mt-5 text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
              Nu mai pierde niciun termen important.
            </h1>
            <p className="text-muted-foreground mt-5 max-w-lg text-lg leading-relaxed">
              Fotografiază sau încarcă un act. Aplicația îți spune ce expiră și când trebuie să acționezi.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">Începe gratuit</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/login">Am deja cont</Link>
              </Button>
            </div>
          </div>
          <DashboardPreview />
        </section>

        <section className="border-border bg-surface border-t">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <span
                  className="bg-accent-soft text-accent flex size-11 items-center justify-center rounded-xl"
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-4 text-base font-semibold">{title}</h2>
                <p className="text-muted-foreground mt-1.5 text-[15px] leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="text-muted-foreground mx-auto max-w-6xl px-4 py-8 text-[13px] leading-relaxed sm:px-6">
        În Termen este un asistent personal pentru organizarea termenelor. Nu verifică statutul oficial al documentelor
        și nu înlocuiește informațiile de la instituția emitentă.
      </footer>
    </div>
  );
}
