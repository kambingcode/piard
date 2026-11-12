"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import type { z } from "zod";
import { postJson } from "@/lib/api-client";

const HOME_PATH = "/plan";

type FormState = {
  fieldErrors: Record<string, string>;
  formError: string | null;
  pending: boolean;
};

const INITIAL: FormState = { fieldErrors: {}, formError: null, pending: false };

/**
 * Logika bersama form masuk/daftar: validasi di klien dengan skema yang sama dengan server,
 * kirim, lalu pindah ke beranda. Galat server per kolom ditaruh di kolomnya.
 */
export function useAuthForm<S extends z.ZodType>(endpoint: string, schema: S) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(INITIAL);
  // Sebelum hidrasi, submit asli browser akan menimpa halaman (dan bisa membawa kata sandi ke URL).
  // Tombol baru aktif setelah handler terpasang.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".")] ??= issue.message;
      }
      setState({ fieldErrors, formError: null, pending: false });
      return;
    }

    setState({ ...INITIAL, pending: true });
    const result = await postJson(endpoint, parsed.data);
    if (result.ok) {
      router.replace(HOME_PATH);
      router.refresh();
      return;
    }
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues ?? [])
      fieldErrors[issue.path] ??= issue.message;
    setState({
      fieldErrors,
      formError: Object.keys(fieldErrors).length > 0 ? null : result.error.error,
      pending: false,
    });
  }

  return { ...state, ready, onSubmit };
}
