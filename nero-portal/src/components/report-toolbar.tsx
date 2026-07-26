"use client";

import { useState } from "react";
import { Check, Copy, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Ações do report: exportar PDF (impressão do navegador — a página tem CSS
 * @media print dedicado) e copiar como markdown (ponte v1 com o Confluence:
 * colar direto numa página).
 */
export function ReportToolbar({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback para contextos sem clipboard API (http local antigo).
      const ta = document.createElement("textarea");
      ta.value = markdown;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copiado!" : "Copiar como markdown"}
      </Button>
      <Button size="sm" onClick={() => window.print()}>
        <FileDown className="h-4 w-4" />
        Exportar PDF
      </Button>
    </div>
  );
}
