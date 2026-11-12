import type { Metadata } from "next";
import { SignInForm } from "@/features/auth";
import { getAuthStatus } from "@/features/auth/server";

// Membaca database (apakah pendaftaran masih terbuka) pada setiap permintaan; jangan di-prerender saat build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Masuk" };

export default function SignInPage() {
  return <SignInForm signUpOpen={getAuthStatus().signUpOpen} />;
}
