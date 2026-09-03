import {
  copyFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = fileURLToPath(new URL("../build/", import.meta.url));
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
    new URL(`../build/${file}`, import.meta.url),
  );
}

const modelSource = readFileSync(new URL("../model.json", import.meta.url));
const compressedModel = gzipSync(modelSource, { level: 9 });
writeFileSync(new URL("../model.json.gz", import.meta.url), compressedModel);
writeFileSync(new URL("../build/model.json.gz", import.meta.url), compressedModel);

console.log(
  `Prepared ${staticFiles.length + 1} static files in ${outputDirectory} from ${projectRoot}; ` +
    `compressed model ${modelSource.length} -> ${compressedModel.length} bytes`,
);
