import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { SignOutButton } from "@/features/auth";
import { requireUser } from "@/features/auth/server";
import { CodebaseHistory } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";
import { CommandPalette, HistoryList } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";

/** Area setelah masuk: tanpa sesi, `requireUser` mengalihkan ke /sign-in. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const plans = getPlansService().listPlans(user.id);
  const codebases = getCodebaseService().list(user.id);

  return (
    <AppShell
      history={
        <>
          <HistoryList plans={plans} />
          <CodebaseHistory codebases={codebases} />
        </>
      }
      account={
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <SignOutButton iconOnly />
        </div>
      }
      accountCompact={<SignOutButton iconOnly />}
      palette={<CommandPalette />}
    >
      {children}
    </AppShell>
  );
}
