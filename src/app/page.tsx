import { redirect } from "next/navigation";

/** Beranda hanya meneruskan ke /plan; /plan sendiri menolak yang belum masuk. */
export default function HomePage() {
  redirect("/plan");
}
