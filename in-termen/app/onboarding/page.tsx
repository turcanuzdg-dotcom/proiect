import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { firstName, requireSession } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/server-config";

export const metadata: Metadata = { title: "Bun venit" };

export default async function OnboardingPage() {
  const { user, profile } = await requireSession();
  if (profile.onboarding_completed) redirect("/dashboard");

  return (
    <main id="continut" className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-14">
      <div className="mb-8 w-full max-w-xl">
        <Logo />
      </div>
      <OnboardingFlow name={firstName(profile.full_name, user.email)} emailConfigured={isEmailConfigured()} />
    </main>
  );
}
