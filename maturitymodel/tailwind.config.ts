import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
        mono: ["'JetBrains Mono'", "'Geist Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Marca Blite/Venice (legado — telas ainda não migradas)
        brand: {
          magenta: "hsl(var(--brand-magenta))",
          violet: "hsl(var(--brand-violet))",
          mint: "hsl(var(--brand-mint))",
        },
        navy: {
          DEFAULT: "hsl(var(--navy))",
          surface: "hsl(var(--navy-surface))",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        // Slot neutro de hover/highlight do shadcn (menus, tabs) — NÃO é o
        // verde do DS. O CTA verde é Button variant="accent" (venice.accent).
        accent: {
          DEFAULT: "var(--accent-shadcn)",
          foreground: "var(--accent-shadcn-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--success-foreground)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "var(--warning-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        // Tokens crus do DS Venice, para uso direto fora dos slots shadcn
        // (ex.: bg-venice-accent para CTAs de avanço de ciclo).
        venice: {
          accent: "var(--accent)",
          accentStrong: "var(--accent-strong)",
          accentSoft: "var(--accent-soft)",
          accentSoftFg: "var(--accent-soft-fg)",
          violet: "var(--apoio-violet)",
          surface: "var(--surface)",
          surface2: "var(--surface-2)",
          surface3: "var(--surface-3)",
          textPrimary: "var(--text-primary)",
          textSecondary: "var(--text-secondary)",
          textTertiary: "var(--text-tertiary)",
          ok: "var(--ok)",
          okBg: "var(--ok-bg)",
          okFg: "var(--ok-fg)",
          warn: "var(--warn)",
          warnBg: "var(--warn-bg)",
          warnFg: "var(--warn-fg)",
          err: "var(--err)",
          errBg: "var(--err-bg)",
          errFg: "var(--err-fg)",
          info: "var(--info)",
          infoBg: "var(--info-bg)",
        },
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        brand: "var(--shadow-brand)",
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(ellipse 70% 60% at 30% 50%, hsla(330,100%,58%,0.16) 0%, hsla(272,92%,51%,0.14) 55%, transparent 100%)",
        "brand-gradient": "linear-gradient(92deg, hsl(var(--brand-magenta)), hsl(var(--brand-violet)))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "fade-in-up": "fade-in-up 0.6s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
