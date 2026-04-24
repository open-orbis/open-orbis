import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { resolve } from "node:path";

// Each widget is a separate entry. Vite emits one bundle per entry
// to ../public/chatgpt-widgets/<name>.js. The file name must match
// WIDGET_REGISTRY[name].bundle_filename in backend/mcp_server/widgets.py.
const WIDGETS = [
  "summary",
  "nodes",
  "full-orb",
  "connections",
  "skills-for-experience",
];

export default defineConfig({
  plugins: [react(), tailwind()],
  build: {
    outDir: resolve(__dirname, "../public/chatgpt-widgets"),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        WIDGETS.map((w) => [w, resolve(__dirname, `src/widgets/${w}.tsx`)]),
      ),
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        // Rollup rejects IIFE with multiple inputs (codeSplitting: false is
        // forced by IIFE and it refuses >1 entry). Using ES modules instead;
        // the HTML shell must load these with <script type="module" src>.
        // See backend/mcp_server/widgets.py build_html_shell.
        format: "es",
      },
    },
    target: "es2020",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
