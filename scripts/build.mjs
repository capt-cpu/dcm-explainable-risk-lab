import {
  copyFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const staticFiles = [
  "index.html",
  "app.js",
  "styles.css",
  "model.json",
  "og.png",
  "favicon.svg",
];

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

for (const file of staticFiles) {
  copyFileSync(
    new URL(`../${file}`, import.meta.url),
    new URL(`../dist/${file}`, import.meta.url),
  );
}

console.log(
  `Prepared ${staticFiles.length} static files in ${outputDirectory} from ${projectRoot}`,
);
