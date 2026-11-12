"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authCopy } from "../copy";
import { signUpSchema } from "../schemas";
import { AuthCard } from "./auth-card";
import { Field } from "./field";
import { PasswordField } from "./password-field";
import { useAuthForm } from "./use-auth-form";

export function SignUpForm() {
  const { fieldErrors, formError, pending, ready, onSubmit } = useAuthForm(
    "/api/auth/sign-up",
    signUpSchema,
  );
  const copy = authCopy.signUp;

  return (
    <AuthCard
      title={copy.title}
      subtitle={copy.subtitle}
      footer={
        <>
          {copy.switchPrompt}{" "}
          <Link
            href="/sign-in"
            className="font-medium text-accent underline underline-offset-4"
          >
            {copy.switchAction}
          </Link>
        </>
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
          id="name"
          label={authCopy.fields.name}
          autoComplete="name"
          error={fieldErrors.name}
          required
        />
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
          autoComplete="new-password"
          error={fieldErrors.password}
        />
        <Button type="submit" size="lg" className="w-full" disabled={pending || !ready}>
          {pending ? copy.submitting : copy.submit}
        </Button>
      </form>
    </AuthCard>
  );
}
