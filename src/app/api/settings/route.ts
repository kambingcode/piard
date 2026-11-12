import { authedRoute } from "@/features/auth/server";
import { updateSettingsSchema } from "@/features/settings";
import { getSettingsService } from "@/features/settings/server";

/** Pengaturan AI yang berlaku → `SettingsView`. */
export const GET = authedRoute({}, async () => getSettingsService().getSettings());

/** Menyimpan model per tugas dan batas biaya → `SettingsView`. */
export const PUT = authedRoute({ body: updateSettingsSchema }, async ({ body }) =>
  getSettingsService().updateSettings(body),
);

/** Menghapus pengaturan tersimpan sehingga `.env` berlaku lagi → `SettingsView`. */
export const DELETE = authedRoute({}, async () => getSettingsService().resetSettings());
