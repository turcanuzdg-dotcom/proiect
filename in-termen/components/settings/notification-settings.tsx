"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateNotificationSettings } from "@/lib/actions/settings";

interface NotificationSettingsProps {
  inApp: boolean;
  email: boolean;
  emailConfigured: boolean;
}

export function NotificationSettings({ inApp, email, emailConfigured }: NotificationSettingsProps) {
  const router = useRouter();
  const [state, setState] = useState({ inAppNotifications: inApp, emailNotifications: email });
  const [pending, startTransition] = useTransition();

  function update(patch: Partial<typeof state>) {
    const previous = state;
    const next = { ...state, ...patch };
    setState(next);
    startTransition(async () => {
      const result = await updateNotificationSettings(next);
      if (!result.ok) {
        setState(previous);
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Salvat.");
      router.refresh();
    });
  }

  return (
    <div className="divide-border border-border flex flex-col divide-y rounded-xl border">
      <div className="flex items-center gap-4 p-4">
        <Label htmlFor="n-inapp" className="min-w-0 flex-1 cursor-pointer font-normal">
          <span className="block text-sm font-medium">Notificări în aplicație</span>
          <span className="text-muted-foreground mt-0.5 block text-[13px]">
            Clopoțelul din colțul de sus îți arată reminderele când le vine momentul.
          </span>
        </Label>
        <Switch
          id="n-inapp"
          checked={state.inAppNotifications}
          disabled={pending}
          onCheckedChange={(checked) => update({ inAppNotifications: checked })}
        />
      </div>
      <div className="flex items-center gap-4 p-4">
        <Label htmlFor="n-email" className="min-w-0 flex-1 cursor-pointer font-normal">
          <span className="block text-sm font-medium">Remindere prin e-mail</span>
          <span id="n-email-desc" className="text-muted-foreground mt-0.5 block text-[13px]">
            {emailConfigured
              ? "Primești un e-mail în ziua fiecărui reminder."
              : "Notificările prin e-mail nu sunt configurate încă."}
          </span>
        </Label>
        <Switch
          id="n-email"
          checked={state.emailNotifications}
          disabled={pending || !emailConfigured}
          aria-describedby="n-email-desc"
          onCheckedChange={(checked) => update({ emailNotifications: checked })}
        />
      </div>
    </div>
  );
}
