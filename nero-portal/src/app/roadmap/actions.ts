"use server";

import { revalidatePath } from "next/cache";
import { setFeatureStatus, toggleChecklistItem } from "@/lib/state/mutations";

export async function toggleChecklistAction(id: string, done: boolean, slug: string) {
  await toggleChecklistItem({ id, done }, "analista");
  revalidatePath(`/roadmap/${slug}`);
  revalidatePath("/roadmap");
}

export async function setFeatureStatusAction(
  codigo: string,
  status: string,
  slug: string,
) {
  await setFeatureStatus({ codigo, status }, "analista");
  revalidatePath(`/roadmap/${slug}`);
  revalidatePath("/roadmap");
}
