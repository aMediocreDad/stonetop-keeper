/** @type {import('tailwindcss').Config} */
// Pas de `darkMode` : « Light-only, by design » (CLAUDE.md) — le rendu
// parchemin EST l'identité du produit. Laisser la variante `dark:` compilable
// invitait précisément la dérive que le principe interdit.
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // L'échelle `sidebar.*` (résidu shadcn) est supprimée : elle pointait
        // vers six variables --sidebar-* qui n'existent NULLE PART dans
        // index.css — tout bg-sidebar futur aurait peint un hsl() invalide en
        // silence. Idem pour boxShadow.xs (noir pur, zéro usage), les
        // keyframes accordion/caret (zéro usage) et le plugin
        // tailwindcss-animate (zéro classe animate-in/out dans src/).
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
    },
  },
  plugins: [],
}