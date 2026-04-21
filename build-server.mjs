import { build } from "esbuild";

await build({
  entryPoints: ["src/server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/server.js",
  external: ["pg-native"],
  banner: {
    js: `import { createRequire } from "module";\nconst require = createRequire(import.meta.url);`,
  },
  logLevel: "info",
});
