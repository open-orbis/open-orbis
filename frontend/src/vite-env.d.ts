/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MCP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
