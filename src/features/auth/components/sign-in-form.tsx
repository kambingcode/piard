"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authCopy } from "../copy";
import { signInSchema } from "../schemas";
import { AuthCard } from "./auth-card";
import { Field } from "./field";
import { PasswordField } from "./password-field";
import { useAuthForm } from "./use-auth-form";

export function SignInForm({ signUpOpen }: { signUpOpen: boolean }) {
  const { fieldErrors, formError, pending, ready, onSubmit } = useAuthForm(
    "/api/auth/sign-in",
    signInSchema,
  );
  const copy = authCopy.signIn;

  return (
    <AuthCard
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        signUpOpen ? (
          <>
            {copy.switchPrompt}{" "}
            <Link
              href="/sign-up"
              className="font-medium text-accent underline underline-offset-4"
            >
              {copy.switchAction}
            </Link>
          </>
        ) : undefined
      }
    >
      <form method="post" onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? (
          <p
            role="alert"
            className="rounded-control bg-negative-soft px-3.5 py-2.5 text-sm text-negative"
          >
            {formError}
          </p>
        ) : null}
        <Field
          id="email"
          label={authCopy.fields.email}
          type="email"
          autoComplete="username"
          inputMode="email"
          error={fieldErrors.email}
          required
        />
        <PasswordField
          label={authCopy.fields.password}
          autoComplete="current-password"
          error={fieldErrors.password}
        />
        <Button type="submit" size="lg" className="w-full" disabled={pending || !ready}>
          {pending ? copy.submitting : copy.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
