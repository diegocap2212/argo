import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VeniceLogo } from "@/components/mma/VeniceLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Mode = "login" | "forgot";

export default function Login() {
  const { user, signInWithPassword } = useAuth();
  const location = useLocation() as { state?: { from?: { pathname: string } } };
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to={location.state?.from?.pathname ?? "/"} replace />;
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await signInWithPassword(email, password);
    setLoading(false);
    if (error) setError("Email ou senha inválidos.");
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex justify-center">
          <VeniceLogo height={26} />
        </div>
        <h1 className="mb-1 text-center font-serif text-xl">Portal MMA</h1>
        <p className="mb-6 text-center text-sm text-venice-textTertiary">
          {mode === "login" ? "Entre com sua conta LM Mobilidade" : "Recuperar acesso"}
        </p>

        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-venice-textSecondary">
              Se existir uma conta para <b>{email}</b>, enviamos um link para definir a senha. Confira seu email.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSent(false);
                setMode("login");
              }}
            >
              Voltar ao login
            </Button>
          </div>
        ) : mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-venice-err">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError(null);
              }}
              className="block w-full text-center text-xs text-venice-textTertiary hover:text-foreground"
            >
              Esqueci minha senha
            </button>
          </form>
        ) : (
          <form onSubmit={handleForgot} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email-forgot">Email</Label>
              <Input
                id="email-forgot"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-venice-err">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando…" : "Enviar link de senha"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className="block w-full text-center text-xs text-venice-textTertiary hover:text-foreground"
            >
              Voltar ao login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
