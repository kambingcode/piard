import type { Metadata } from "next";
import { requireUser } from "@/features/auth/server";
import { SettingsForm, settingsCopy } from "@/features/settings";
import { getSettingsService } from "@/features/settings/server";

export const metadata: Metadata = { title: settingsCopy.title };

/** `/settings`: model AI per tugas, batas biaya, dan status kunci API. */
export default async function SettingsPage() {
  await requireUser();
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
        {settingsCopy.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{settingsCopy.intro}</p>
      <div className="mt-8">
        <SettingsForm initial={getSettingsService().getSettings()} />
      </div>
    </div>
  );
}
