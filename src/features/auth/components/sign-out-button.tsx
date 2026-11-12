"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api-client";
import { authCopy } from "../copy";

/** Keluar: hapus sesi di server lalu kembali ke halaman masuk. */
export function SignOutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await postJson("/api/auth/sign-out");
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon" : "sm"}
      onClick={signOut}
      disabled={pending}
      aria-label={iconOnly ? authCopy.signOut : undefined}
    >
      <LogOut aria-hidden />
      {iconOnly ? null : authCopy.signOut}
    </Button>
  );
}
