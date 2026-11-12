import "server-only";

export const SESSION_COOKIE = "piard_session";

const SECONDS_PER_MS = 1 / 1000;

/** Cookie berasal dari klien dan bisa rusak; escape yang tidak valid berarti "tidak ada", bukan galat 500. */
function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/** Nilai cookie `name` dari header `Cookie`, atau undefined. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return safeDecode(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function readSessionToken(request: Request): string | undefined {
  return readCookie(request.headers.get("cookie"), SESSION_COOKIE);
}

/** HTTPS langsung, atau di belakang proxy/tunnel yang meneruskan skema aslinya. */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (forwarded ?? new URL(request.url).protocol.replace(":", "")) === "https";
}

type CookieOptions = { secure: boolean };

function attributes({ secure }: CookieOptions): string[] {
  // HttpOnly: tidak terbaca JS. SameSite=Lax: tidak ikut dikirim pada POST lintas situs (anti-CSRF).
  return ["Path=/", "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])];
}

/** Header `Set-Cookie` untuk sesi baru yang berakhir pada `expiresAt`. */
export function sessionCookie(
  token: string,
  expiresAt: Date,
  options: CookieOptions,
): string {
  const maxAge = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) * SECONDS_PER_MS),
  );
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    ...attributes(options),
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ");
}

/** Header `Set-Cookie` yang menghapus cookie sesi di browser. */
export function clearedSessionCookie(options: CookieOptions): string {
  return [`${SESSION_COOKIE}=`, ...attributes(options), "Max-Age=0"].join("; ");
}
