import { getMonthUsage } from "@/lib/nero/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const usage = await getMonthUsage();
    return Response.json(usage, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "falha ao ler consumo" }, { status: 500 });
  }
}
