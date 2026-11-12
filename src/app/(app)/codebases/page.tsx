import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/features/auth/server";
import { CodebaseList, codebaseCopy, EXISTING_FLOW_HREF } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";

const copy = codebaseCopy.ui.list;

export const metadata: Metadata = { title: copy.title };

/** `/codebases`: daftar proyek eksisting (M7-17). */
export default async function CodebasesPage() {
  const user = await requireUser();
  const codebases = getCodebaseService().listWithPages(user.id);
  return (
    <div className="mx-auto w-full max-w-[880px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.02em]">
            {copy.title}
          </h1>
          <p className="mt-2 text-base text-muted-foreground">{copy.subtitle}</p>
        </div>
        {codebases.length > 0 ? (
          <Button asChild>
            <Link href={EXISTING_FLOW_HREF}>
              <Plus aria-hidden />
              {copy.add}
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="mt-8">
        <CodebaseList codebases={codebases} />
      </div>
    </div>
  );
}
