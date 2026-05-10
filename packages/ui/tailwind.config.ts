import type { Config } from "tailwindcss";
import preset from "@precision/tailwind-config/tailwind.config";

export default {
  presets: [preset as Config],
  content: ["./src/**/*.{ts,tsx}"],
} satisfies Config;
