"use client";

import { useTransition } from "react";
import { undoAction } from "@/app/estado/actions";
import { Button } from "@/components/ui/button";

export type VersionRow = {
  id: string;
  entity: string;
  operation: string;
  resumo: string | null;
  actor: string;
  desfeito: boolean;
  createdAt: Date;
};

const OP_LABEL: Record<string, string> = {
  create: "criou",
  update: "atualizou",
  delete: "removeu",
};

export function VersionHistory({ versions }: { versions: VersionRow[] }) {
  const [pending, startTransition] = useTransition();

  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma alteração ainda. Quando o Nero escrever no estado pela conversa, cada mudança
        aparece aqui — com botão para desfazer.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div
          key={v.id}
          className="flex items-center justify-between gap-3 rounded-lg border p-2 text-sm"
        >
          <div className="min-w-0">
            <div className={v.desfeito ? "text-muted-foreground line-through" : ""}>
              <span className="text-xs text-muted-foreground">
                {v.actor} {OP_LABEL[v.operation] ?? v.operation} {v.entity}
              </span>{" "}
              · {v.resumo ?? "(sem resumo)"}
            </div>
            {/* Data localizada difere entre fuso do servidor e do navegador —
                suppress evita o mismatch de hidratação (React #418). */}
            <div className="text-xs text-muted-foreground" suppressHydrationWarning>
              {new Date(v.createdAt).toLocaleString("pt-BR")}
            </div>
          </div>
          {v.desfeito ? (
            <span className="shrink-0 text-xs text-muted-foreground">desfeito</span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => startTransition(() => undoAction(v.id))}
            >
              Desfazer
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
