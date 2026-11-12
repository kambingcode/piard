import type { Metadata } from "next";
import Link from "next/link";
import { authCopy, SignUpForm } from "@/features/auth";
import { getAuthStatus } from "@/features/auth/server";

// Membaca database (apakah pendaftaran masih terbuka) pada setiap permintaan; jangan di-prerender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Buat akun" };

export default function SignUpPage() {
  if (getAuthStatus().signUpOpen) return <SignUpForm />;

  const { closedTitle, closedBody } = authCopy.signUp;
  return (
    <div className="w-full max-w-sm">
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
        {closedTitle}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{closedBody}</p>
      <Link
        href="/sign-in"
        className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-85"
      >
        {authCopy.signIn.submit}
      </Link>
    </div>
  );
}
