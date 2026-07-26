/* Teste mínimo da API key (Haiku, ~10 tokens). Uso: npx tsx scripts/verify-key.ts */
import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";

// Carrega ANTHROPIC_API_KEY do .env.local (tsx não lê automaticamente).
try {
  const env = readFileSync(".env.local", "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (m) process.env.ANTHROPIC_API_KEY = m[1].trim();
} catch {
  /* ignore */
}

async function main() {
  const client = new Anthropic();
  const r = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 10,
    messages: [{ role: "user", content: "Responda apenas: ok" }],
  });
  const text = r.content.find((b) => b.type === "text");
  console.log("Resposta:", text && "text" in text ? text.text : r.content);
  console.log("Usage:", r.usage);
  console.log("CHAVE OK ✅");
}

main().catch((e) => {
  console.error("FALHOU:", e?.message ?? e);
  process.exit(1);
});
