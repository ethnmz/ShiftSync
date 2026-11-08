import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        // `panel` kept as an alias so older class names still resolve.
        panel: token("surface"),
        subtle: token("subtle"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        muted: token("muted"),
        faint: token("faint"),
        accent: token("accent"),
        "accent-ink": token("accent-ink"),
        ok: token("ok"),
        info: token("info"),
        warn: token("warn"),
        unk: token("unk"),
        danger: token("danger"),
      },
      fontFamily: {
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
      },
      // Measured from the dashboard reference: 16/24 body, 14/20 secondary,
      // 20/28 card titles, 30/36 hero, 40/48 greeting. Larger sizes get
      // tighter tracking.
      fontSize: {
        xs: ["12px", { lineHeight: "16px", letterSpacing: "0" }],
        sm: ["14px", { lineHeight: "20px", letterSpacing: "0" }],
        base: ["16px", { lineHeight: "24px", letterSpacing: "0" }],
        lg: ["18px", { lineHeight: "26px", letterSpacing: "-0.005em" }],
        xl: ["20px", { lineHeight: "28px", letterSpacing: "-0.01em" }],
        "2xl": ["24px", { lineHeight: "32px", letterSpacing: "-0.015em" }],
        "3xl": ["30px", { lineHeight: "36px", letterSpacing: "-0.025em" }],
        "4xl": ["40px", { lineHeight: "48px", letterSpacing: "-0.03em" }],
      },
      // Only 400 and 600 are bundled.
      fontWeight: {
        normal: "400",
        semibold: "600",
      },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
    },
  },
  plugins: [],
};
