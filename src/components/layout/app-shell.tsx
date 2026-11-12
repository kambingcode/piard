"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { BrandMark } from "./brand-mark";
import { shellCopy } from "./copy";
import { NAV_ITEMS } from "./nav";
import { openCommandPalette } from "./palette-event";

type AppShellProps = {
  children: ReactNode;
  /** Isi daftar riwayat di sidebar (diisi fitur plans). */
  history: ReactNode;
  /** Baris akun di dasar sidebar dan rail (nama + keluar), disediakan halaman agar shell tetap umum. */
  account: ReactNode;
  accountCompact: ReactNode;
  /** Command palette milik fitur; dirender sekali dan dibuka lewat Ctrl/⌘K atau tombol Cari. */
  palette?: ReactNode;
};

/** Tombol pembuka command palette: berlabel di sidebar, ikon saja di rail dan bilah atas ponsel. */
function PaletteTrigger({
  labelled,
  className,
}: {
  labelled: boolean;
  className?: string;
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size={labelled ? "md" : "icon"}
      aria-label={labelled ? undefined : shellCopy.openPalette}
      aria-keyshortcuts="Control+K Meta+K"
      onClick={openCommandPalette}
      className={cn(
        labelled && "w-full justify-start gap-3 px-3 font-medium text-muted-foreground",
        className,
      )}
    >
      <Search className="size-[18px]" aria-hidden />
      {labelled ? (
        <>
          <span className="flex-1 text-left">{shellCopy.openPalette}</span>
          <span className="text-xs text-muted-foreground">
            {shellCopy.paletteShortcut}
          </span>
        </>
      ) : null}
    </Button>
  );
  if (labelled) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{shellCopy.openPalette}</TooltipContent>
    </Tooltip>
  );
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, labelled }: { pathname: string; labelled: boolean }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        const link = (
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={labelled ? undefined : label}
            className={cn(
              "flex items-center gap-3 rounded-control text-sm font-medium transition-colors",
              labelled ? "min-h-11 px-3" : "size-11 justify-center md:size-10",
              active
                ? "bg-active text-foreground"
                : "text-muted-foreground hover:bg-active hover:text-foreground",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            {labelled ? label : null}
          </Link>
        );
        return (
          <li key={href}>
            {labelled ? (
              link
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody({
  pathname,
  history,
  account,
}: {
  pathname: string;
  history: ReactNode;
  account: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <BrandMark />
        <span className="text-base font-semibold tracking-tight">
          {shellCopy.product}
        </span>
      </div>
      <nav aria-label={shellCopy.mainNav} className="space-y-1">
        <PaletteTrigger labelled />
        <NavLinks pathname={pathname} labelled />
      </nav>
      <section className="min-h-0 flex-1 overflow-y-auto" aria-labelledby="history-title">
        <h2
          id="history-title"
          className="px-3 pb-2 text-sm font-medium text-muted-foreground"
        >
          {shellCopy.historyTitle}
        </h2>
        {history}
      </section>
      <div className="border-t border-border pt-3">{account}</div>
    </div>
  );
}

/**
 * Kerangka aplikasi (doc 08 bagian 4): rail ikon 56px + sidebar riwayat 260px yang bisa
 * dilipat di layar lebar; di ponsel menjadi bilah atas 48px dengan menu lembar penuh.
 */
export function AppShell({
  children,
  history,
  account,
  accountCompact,
  palette,
}: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <TooltipProvider>
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {shellCopy.skipToContent}
      </a>

      <div className="flex min-h-dvh">
        {/* Rail: hanya md ke atas. */}
        <aside className="sticky top-0 hidden h-dvh w-14 shrink-0 flex-col items-center gap-4 border-r border-border bg-background py-4 md:flex">
          <Link
            href="/plan"
            aria-label={shellCopy.product}
            className="flex size-10 items-center justify-center"
          >
            <BrandMark />
          </Link>
          {/* Saat sidebar terbuka (lg+), tautan yang sama sudah ada di sana: sembunyikan agar tidak ganda. */}
          <nav
            aria-label={shellCopy.mainNav}
            className={cn("flex flex-col gap-1", sidebarOpen && "lg:hidden")}
          >
            <PaletteTrigger labelled={false} />
            <NavLinks pathname={pathname} labelled={false} />
          </nav>
          <div className="mt-auto flex flex-col items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden lg:inline-flex"
                  aria-label={
                    sidebarOpen ? shellCopy.collapseSidebar : shellCopy.expandSidebar
                  }
                  aria-expanded={sidebarOpen}
                  onClick={() => setSidebarOpen((open) => !open)}
                >
                  {sidebarOpen ? (
                    <PanelLeftClose aria-hidden />
                  ) : (
                    <PanelLeftOpen aria-hidden />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {sidebarOpen ? shellCopy.collapseSidebar : shellCopy.expandSidebar}
              </TooltipContent>
            </Tooltip>
            {/* Sidebar terbuka sudah memuat baris akun; hindari tombol keluar ganda. */}
            <div className={sidebarOpen ? "lg:hidden" : undefined}>{accountCompact}</div>
          </div>
        </aside>

        {/* Sidebar riwayat: lg ke atas, bisa dilipat. */}
        {sidebarOpen ? (
          <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 border-r border-border bg-background lg:block">
            <SidebarBody pathname={pathname} history={history} account={account} />
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Bilah atas ponsel. */}
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background px-3 md:hidden">
            <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Dialog.Trigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={shellCopy.openMenu}
                >
                  <Menu aria-hidden />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
                <Dialog.Content
                  aria-describedby={undefined}
                  className="fixed inset-y-0 left-0 z-50 w-[min(320px,88vw)] bg-background shadow-xl"
                  // Tautan (navigasi, riwayat) berpindah halaman tanpa me-mount ulang shell; tanpa ini
                  // lembar tetap terbuka dan menutupi halaman tujuan.
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest("a[href]")
                    )
                      setMenuOpen(false);
                  }}
                >
                  <Dialog.Title className="sr-only">{shellCopy.product}</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-3 right-3"
                      aria-label={shellCopy.closeMenu}
                    >
                      <X aria-hidden />
                    </Button>
                  </Dialog.Close>
                  <SidebarBody pathname={pathname} history={history} account={account} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <BrandMark />
            <span className="text-base font-semibold tracking-tight">
              {shellCopy.product}
            </span>
            <PaletteTrigger labelled={false} className="ml-auto" />
          </header>

          <main id="konten" className="flex-1 px-4 py-8 md:px-8 md:py-12">
            {children}
          </main>
        </div>
      </div>
      {palette}
    </TooltipProvider>
  );
}
