import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const clientDirectory = resolve(root, "dist", "client");
const serverDirectory = resolve(root, "dist", "server");
const outputDirectory = resolve(root, ".pages-output");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(clientDirectory, outputDirectory, { recursive: true });

await cp(resolve(serverDirectory, "index.js"), resolve(outputDirectory, "_worker.js"));
await cp(resolve(serverDirectory, "index.js"), resolve(outputDirectory, "index.js"));
await cp(
  resolve(serverDirectory, "__vite_rsc_assets_manifest.js"),
  resolve(outputDirectory, "__vite_rsc_assets_manifest.js"),
);
await cp(resolve(serverDirectory, "ssr"), resolve(outputDirectory, "ssr"), {
  recursive: true,
});

await writeFile(
  resolve(outputDirectory, ".assetsignore"),
  [
    "_worker.js",
    "index.js",
    "__vite_rsc_assets_manifest.js",
    "ssr/**",
    "",
  ].join("\n"),
);

console.log(`Prepared Cloudflare Pages output at ${outputDirectory}`);
