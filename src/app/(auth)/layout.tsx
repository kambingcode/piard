import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/features/auth/server";

/** Halaman masuk/daftar: yang sudah punya sesi langsung diarahkan ke aplikasi. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) redirect("/plan");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      {children}
    </main>
  );
}
