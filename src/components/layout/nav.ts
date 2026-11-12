import { FolderGit2, type LucideIcon, Settings, SquarePen } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Tujuan navigasi utama. Hanya rute yang sudah ada; fitur berikutnya menambahkan barisnya sendiri.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/plan", label: "Plan baru", icon: SquarePen },
  { href: "/codebases", label: "Proyek eksisting", icon: FolderGit2 },
  { href: "/settings", label: "Pengaturan", icon: Settings },
];
