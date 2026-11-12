import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">
        Halaman tidak ditemukan
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Alamat yang Anda buka tidak ada atau sudah dipindahkan.
      </p>
      <Link
        href="/plan"
        className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-85"
      >
        Kembali ke Plan
      </Link>
    </main>
  );
}
