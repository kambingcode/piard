"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { OPEN_PALETTE_EVENT } from "@/components/layout/palette-event";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { plansCopy } from "../copy";
import type { Plan } from "../schemas";
import { planTitle } from "../title";
import { type PaletteCommand, paletteCommands, searchCommands } from "./palette-commands";

const copy = plansCopy.palette;

/** `/plans/:id/...` → id plan yang sedang dibuka. */
function currentPlanId(pathname: string): string | null {
  return pathname.match(/^\/plans\/([^/?]+)/)?.[1] ?? null;
}

/**
 * Command palette (Cmd/Ctrl+K, doc 08 bagian 6): plan baru, lompat ke plan, ke bagian plan yang sedang
 * dibuka, ekspor, dan pengaturan. Daftar plan diambil saat dibuka agar tidak basi.
 */
export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQuery("");
    setActive(0);
    setLoadFailed(false);
    void apiRequest<{ plans: Plan[] }>("/api/plan/list").then((result) => {
      if (cancelled) return;
      if (result.ok) setPlans(result.data.plans);
      else setLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const commands = useMemo(() => {
    const planId = currentPlanId(pathname);
    const current = plans?.find((plan) => plan.id === planId) ?? null;
    return paletteCommands({
      current: current
        ? { id: current.id, title: planTitle(current), step: current.step }
        : null,
      plans: (plans ?? []).map((plan) => ({ id: plan.id, title: planTitle(plan) })),
    });
  }, [pathname, plans]);

  const results = useMemo(() => searchCommands(commands, query), [commands, query]);
  const selected = results[Math.min(active, results.length - 1)];

  const run = useCallback(
    (command: PaletteCommand) => {
      setOpen(false);
      if (command.action.kind === "download") window.location.assign(command.action.url);
      else router.push(command.action.href);
    },
    [router],
  );

  function onInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + results.length) % results.length);
    } else if (event.key === "Enter" && selected) {
      event.preventDefault();
      run(selected);
    }
  }

  const optionId = (command: PaletteCommand) => `${listId}-${command.id}`;
  let lastGroup: string | null = null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[76vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-card bg-card shadow-xl"
        >
          <Dialog.Title className="sr-only">{copy.title}</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={selected ? optionId(selected) : undefined}
              aria-label={copy.title}
              placeholder={copy.placeholder}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              className="h-13 w-full bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none md:text-sm"
            />
          </div>
          <div
            role="listbox"
            id={listId}
            aria-label={copy.title}
            className="overflow-y-auto p-2"
          >
            {results.map((command, index) => {
              const heading =
                command.group !== lastGroup ? copy.groups[command.group] : null;
              lastGroup = command.group;
              const isActive = command === selected;
              return (
                <div key={command.id}>
                  {heading ? (
                    <p
                      aria-hidden
                      className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground"
                    >
                      {heading}
                    </p>
                  ) : null}
                  <div
                    id={optionId(command)}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={-1}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(command)}
                    // Keyboard ada di input (aria-activedescendant); ini untuk opsi yang difokus langsung.
                    onKeyDown={(event) => {
                      if (event.key === "Enter") run(command);
                    }}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-control px-3 text-sm md:min-h-10",
                      isActive ? "bg-active text-foreground" : "text-foreground",
                    )}
                  >
                    <span className="min-w-0 truncate">{command.label}</span>
                    {isActive ? (
                      <CornerDownLeft
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {copy.empty}
              </p>
            ) : null}
            {loadFailed ? (
              <p className="px-3 pb-2 text-sm text-negative">{copy.loadFailed}</p>
            ) : null}
          </div>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {copy.hint}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
