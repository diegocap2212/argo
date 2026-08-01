/**
 * Primitivas de UI do app de administração.
 *
 * POR QUE NÃO COPIAR OS 49 COMPONENTES shadcn DO MATURITYMODEL: seria uma segunda cópia de uma
 * biblioteca inteira num monorepo que já paga o preço de cópias autocontidas do HMAC — só que
 * essas têm teste de contrato e esta não teria. O que este app precisa são sete peças; elas
 * usam os mesmos tokens de `@neo/design`, então a aparência é a mesma.
 *
 * Radix entra onde COMPORTAMENTO importa: checkbox (estado indeterminado, teclado) e diálogo
 * (foco preso, Esc, ARIA). O resto é markup.
 */
import * as React from 'react';
import * as RxCheckbox from '@radix-ui/react-checkbox';
import * as RxDialog from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-neo border border-line bg-surface p-5 shadow-sm', className)}
      {...props}
    />
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl text-ink">{title}</h1>
      {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-ink">{subtitle}</p> : null}
    </header>
  );
}

type ButtonVariant = 'primary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-ink text-white hover:opacity-90',
    ghost: 'border border-line bg-surface text-ink hover:bg-hover',
    danger: 'border border-error text-error hover:bg-error hover:text-white',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 rounded-neo px-3 py-2 text-sm font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-neo border border-line bg-surface px-3 py-2 text-sm text-ink',
        'placeholder:text-muted-ink',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('rounded-neo border border-line bg-surface px-3 py-2 text-sm text-ink', className)}
      {...props}
    />
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
}) {
  const tones = {
    neutral: 'border-line text-muted-ink',
    success: 'border-success text-success',
    warning: 'border-warning text-warning',
    error: 'border-error text-error',
  } as const;
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs', tones[tone])}>{children}</span>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  'aria-label': string;
}) {
  return (
    <RxCheckbox.Root
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className={cn(
        'grid h-5 w-5 place-items-center rounded border border-line bg-surface transition',
        'data-[state=checked]:border-brand-strong data-[state=checked]:bg-brand-strong',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <RxCheckbox.Indicator>
        <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
      </RxCheckbox.Indicator>
    </RxCheckbox.Root>
  );
}

/** Diálogo de confirmação. Usado onde a ação muda o poder de alguém. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  onConfirm,
  busy,
  danger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <RxDialog.Root open={open} onOpenChange={onOpenChange}>
      <RxDialog.Portal>
        <RxDialog.Overlay className="fixed inset-0 bg-black/30" />
        <RxDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2',
            'rounded-neo border border-line bg-surface p-6 shadow-xl',
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <RxDialog.Title className="font-display text-xl text-ink">{title}</RxDialog.Title>
            <RxDialog.Close aria-label="Fechar" className="text-muted-ink hover:text-ink">
              <X className="h-4 w-4" />
            </RxDialog.Close>
          </div>
          <div className="text-sm leading-relaxed text-muted-ink">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
              {busy ? 'Salvando…' : confirmLabel}
            </Button>
          </div>
        </RxDialog.Content>
      </RxDialog.Portal>
    </RxDialog.Root>
  );
}

/**
 * Estado de carregamento, erro e vazio numa peça só — porque os três aparecem juntos em toda
 * tela desta app, e tratar erro como "vazio" é o que faz um administrador achar que não há
 * ninguém com um papel quando na verdade a consulta falhou.
 */
export function QueryState({
  isLoading,
  error,
  empty,
  emptyLabel,
}: {
  isLoading: boolean;
  error: unknown;
  empty?: boolean;
  emptyLabel?: string;
}) {
  if (isLoading) return <p className="py-6 text-sm text-muted-ink">Carregando…</p>;
  if (error) {
    return (
      <p className="py-6 text-sm text-error">
        Não foi possível ler estes dados: {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }
  if (empty) return <p className="py-6 text-sm text-muted-ink">{emptyLabel ?? 'Nada por aqui.'}</p>;
  return null;
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-line px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-ink',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line px-3 py-2 align-top text-ink', className)} {...props} />;
}
