import { BellRing, CalendarCheck, Lock } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/layout/logo";

const POINTS = [
  { icon: CalendarCheck, text: "Vezi dintr-o privire ce expiră și când." },
  { icon: BellRing, text: "Remindere cu 45, 30, 14, 7 zile și cu o zi înainte." },
  { icon: Lock, text: "Fișierele tale rămân private. Doar tu le vezi." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="bg-primary text-primary-foreground relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <Link href="/" className="w-fit rounded-lg" aria-label="În Termen — pagina principală">
          <span className="inline-flex items-center gap-2.5">
            <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
              <rect width="32" height="32" rx="9" fill="#ffffff" fillOpacity="0.12" />
              <rect x="8" y="9.5" width="16" height="14" rx="3" fill="none" stroke="#fff" strokeWidth="2" />
              <path d="M12 7.5v4M20 7.5v4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              <path
                d="m12.5 17 2.4 2.4 4.8-4.9"
                fill="none"
                stroke="#5eead4"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[17px] font-semibold tracking-tight">În Termen</span>
          </span>
        </Link>
        <div className="max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight">
            Fotografiază sau încarcă un act. Aplicația îți spune ce expiră și când trebuie să acționezi.
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-white/85">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/10" aria-hidden>
                  <Icon className="size-[18px] text-[#5eead4]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-white/60">
          Asistent personal pentru termene. Nu înlocuiește verificarea la instituția emitentă.
        </p>
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/[0.04]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-10 -bottom-32 size-96 rounded-full bg-white/[0.03]"
        />
      </aside>
      <main id="continut" className="flex flex-col items-center justify-center px-4 py-10 sm:px-6">
        <Link href="/" className="mb-8 rounded-lg lg:hidden" aria-label="În Termen — pagina principală">
          <Logo />
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
