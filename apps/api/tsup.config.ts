import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/seed.ts"],
  format: "esm",
  target: "node22",
  clean: true,
  splitting: false,
  // Os pacotes do próprio repositório entram no arquivo final; as dependências de terceiros ficam em node_modules.
  noExternal: [/^@domma\//],
});
