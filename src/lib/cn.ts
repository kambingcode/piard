import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Menggabungkan nama kelas kondisional dan menyelesaikan bentrok kelas Tailwind (yang terakhir menang). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
