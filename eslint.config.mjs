import "@rushstack/eslint-patch/modern-module-resolution.js";
import { defineConfig } from "eslint/config";
import next from "eslint-config-next";

// Next.js 15 için önerilen flat config kullanımı
export default defineConfig([
  ...next,
]);
