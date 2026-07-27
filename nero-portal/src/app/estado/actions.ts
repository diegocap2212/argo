"use server";

import { revalidatePath } from "next/cache";
import { undoVersion } from "@/lib/state/mutations";

export async function undoAction(versionId: string) {
  await undoVersion(versionId);
  revalidatePath("/estado");
}
