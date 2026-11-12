import { z } from "zod";
import { authCopy } from "./copy";

export const PASSWORD_MIN_LENGTH = 8;
/** Batas atas mencegah kata sandi raksasa dipakai untuk membebani hashing. */
export const PASSWORD_MAX_LENGTH = 200;
const NAME_MAX_LENGTH = 80;
/** Batas panjang alamat email menurut RFC 5321. */
const EMAIL_MAX_LENGTH = 254;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email(authCopy.errors.invalidEmail)
      .max(EMAIL_MAX_LENGTH, authCopy.errors.invalidEmail),
  );

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, authCopy.errors.passwordRequired).max(PASSWORD_MAX_LENGTH),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: z.string().trim().min(1, authCopy.errors.nameRequired).max(NAME_MAX_LENGTH),
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, authCopy.errors.passwordTooShort(PASSWORD_MIN_LENGTH))
    .max(PASSWORD_MAX_LENGTH),
});
export type SignUpInput = z.infer<typeof signUpSchema>;
