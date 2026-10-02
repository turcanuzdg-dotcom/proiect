import { Download, FileJson, FileSpreadsheet, FlaskConical, KeyRound, Lock, ShieldCheck, Trash } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { DeleteDataDialog } from "@/components/settings/delete-data-dialog";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { ProfileForm } from "@/components/settings/profile-form";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { removeDemoData, seedDemoData } from "@/lib/actions/settings";
import { requireSession } from "@/lib/auth";
import { TIMEZONE_OPTIONS } from "@/lib/constants";
import { isReminderOffset } from "@/lib/reminders/schedule";
import { isEmailConfigured } from "@/lib/server-config";
import { isCurrency } from "@/lib/utils/money";
import type { ProfileSettingsValues } from "@/lib/validations/misc";

export const metadata: Metadata = { title: "Setări" };

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function SettingsPage() {
  const { supabase, user, profile } = await requireSession();
  const { count: demoCount } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true);

  const knownTimezone = TIMEZONE_OPTIONS.some((option) => option.value === profile.timezone);
  const defaults: ProfileSettingsValues = {
    fullName: profile.full_name,
    timezone: knownTimezone ? profile.timezone : "Europe/Chisinau",
    defaultCurrency: isCurrency(profile.default_currency) ? profile.default_currency : "MDL",
    defaultReminderDays: profile.default_reminder_days.filter(isReminderOffset),
  };

  return (
    <>
      <PageHeader title="Setări" description="Profilul, preferințele și controlul asupra datelor tale." />

      <div className="flex flex-col gap-6">
        <SettingsSection id="profil" title="Profil și preferințe">
          <ProfileForm defaults={defaults} email={user.email ?? ""} />
        </SettingsSection>

        <SettingsSection
          id="notificari"
          title="Notificări"
          description="Alege cum vrei să afli despre termenele care se apropie."
        >
          <NotificationSettings
            inApp={profile.in_app_notifications}
            email={profile.email_notifications}
            emailConfigured={isEmailConfigured()}
          />
        </SettingsSection>

        <SettingsSection id="securitate" title="Securitate și confidențialitate">
          <ul className="flex flex-col gap-4 text-sm leading-relaxed">
            <li className="flex gap-3">
              <Lock className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Fișierele sunt păstrate privat.</span>{" "}
                <span className="text-muted-foreground">
                  Stau într-un spațiu de stocare privat, în dosarul contului tău, și se deschid doar prin linkuri
                  temporare, valabile câteva minute.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Doar tu îți vezi datele.</span>{" "}
                <span className="text-muted-foreground">
                  Fiecare înregistrare este legată de contul tău, iar baza de date refuză accesul oricui altcuiva.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <Trash className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Tu controlezi ștergerea.</span>{" "}
                <span className="text-muted-foreground">
                  Poți șterge orice document sau toate datele odată. Ștergerea este definitivă.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <KeyRound className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="font-medium">Parola</span>{" "}
                <span className="text-muted-foreground">
                  se poate schimba oricând:{" "}
                  <Link href="/reset-password" className="text-primary font-medium hover:underline">
                    alege o parolă nouă
                  </Link>
                  .
                </span>
              </span>
            </li>
          </ul>
          <div className="border-border mt-6 border-t pt-5">
            <DeleteDataDialog />
          </div>
        </SettingsSection>

        <SettingsSection
          id="export"
          title="Exportă datele"
          description="Descarcă o copie a documentelor și reminderelor. Fișierele atașate se descarcă din pagina fiecărui document."
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild variant="outline">
              <a href="/api/export?format=json" download>
                <FileJson aria-hidden />
                Tot, ca JSON
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/export?format=csv&type=documents" download>
                <FileSpreadsheet aria-hidden />
                Documente, CSV
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/export?format=csv&type=reminders" download>
                <Download aria-hidden />
                Remindere, CSV
              </a>
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection
          id="demo"
          title="Date demonstrative"
          description="Câteva documente fictive, ca să vezi cum arată aplicația cu date. Nu ating datele tale reale."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-muted-foreground flex items-center gap-2 text-sm sm:flex-1">
              <FlaskConical className="size-4" aria-hidden />
              {demoCount && demoCount > 0
                ? `Ai ${demoCount} documente demonstrative în cont.`
                : "Nu ai date demonstrative în cont."}
            </p>
            <div className="flex gap-2">
              <ActionButton action={seedDemoData} variant="outline" pendingLabel="Se adaugă…">
                {demoCount && demoCount > 0 ? "Reîncarcă datele demo" : "Adaugă date demonstrative"}
              </ActionButton>
              {demoCount && demoCount > 0 ? (
                <ActionButton action={removeDemoData} variant="ghost" pendingLabel="Se șterg…">
                  Șterge datele demo
                </ActionButton>
              ) : null}
            </div>
          </div>
        </SettingsSection>
      </div>
    </>
  );
}
