import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-navy overflow-hidden">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="relative text-center">
        <img
          src={`${import.meta.env.BASE_URL}venice-by-blite.svg`}
          alt="Venice by blite"
          className="h-5 w-auto mx-auto mb-6 opacity-90"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <h1 className="mb-2 font-mono text-6xl font-extrabold text-white">404</h1>
        <p className="mb-6 text-lg text-white/55">Página não encontrada</p>
        <Link
          to="/"
          className="inline-flex items-center rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-brand hover:opacity-90 transition-opacity"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
