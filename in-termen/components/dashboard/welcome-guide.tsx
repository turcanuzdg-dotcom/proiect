import { BellRing, Camera, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    icon: Camera,
    title: "Adaugă primul act",
    text: "Încarcă o poză sau un PDF și scrie data expirării. Durează un minut.",
  },
  {
    icon: BellRing,
    title: "Primești remindere",
    text: "Îți amintim cu 45, 30, 14, 7 și o zi înainte. Le poți ajusta pentru fiecare act.",
  },
  {
    icon: ShieldCheck,
    title: "Datele rămân ale tale",
    text: "Fișierele sunt private. Le poți exporta sau șterge oricând din Setări.",
  },
];

export function WelcomeGuide() {
  return (
    <section
      aria-labelledby="ghid-titlu"
      className="border-border bg-surface shadow-card rounded-2xl border p-5 sm:p-6"
    >
      <h2 id="ghid-titlu" className="text-base font-semibold tracking-tight">
        Contul tău este gata. Iată cum funcționează:
      </h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, index) => (
          <li key={title} className="flex gap-3">
            <span
              className="bg-accent-soft text-accent flex size-9 shrink-0 items-center justify-center rounded-xl"
              aria-hidden
            >
              <Icon className="size-[18px]" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {index + 1}. {title}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[13px] leading-relaxed">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
