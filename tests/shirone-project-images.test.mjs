import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { shironeProjectImages } from "../tools/shirone-project-images.mjs";

const source = fs.readFileSync(
  new URL("../node_modules/shirones/src/utils/project-images.ts", import.meta.url),
  "utf8",
);
const plugin = shironeProjectImages();
const moduleId = "/project/node_modules/shirones/src/utils/project-images.ts";

test("project assets and colocated post covers resolve through the theme loader", async () => {
  const transformed = plugin.transform(source, moduleId);
  assert.ok(transformed, "the installed theme needs the project-assets fix");
  let scanned;
  const metadata = { src: "/_astro/avatar.hash.png", width: 256, height: 256 };
  const images = {
    "/src/assets/images/logo/1.png": async () => metadata,
    "/src/assets/images/banner/desktop/1.jpg": async () => metadata,
    "/src/assets/images/banner/mobile/1.jpg": async () => metadata,
    "/shirones/content/posts/guide/cover.png": async () => metadata,
  };
  const runnable = transformed.code
    .replace('import path from "node:path";', "")
    .replaceAll("import.meta.glob", "glob")
    .replace("export function", "function");
  const js = ts.transpileModule(runnable, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({
    path,
    glob(patterns) {
      scanned = Array.from(patterns);
      return images;
    },
  });
  vm.runInContext(js, context);
  assert.deepEqual(scanned, [
    "/shirones/**/*.{png,jpg,jpeg,webp,avif,svg,gif}",
    "/src/assets/**/*.{png,jpg,jpeg,webp,avif,svg,gif}",
  ]);
  const loader = context.getProjectImageLoader;
  for (const filename of [
    "assets/images/logo/1.png",
    "assets/images/banner/desktop/1.jpg",
    "assets/images/banner/mobile/1.jpg",
  ]) {
    assert.ok(fs.existsSync(new URL(`../src/${filename}`, import.meta.url)));
    assert.equal(await loader(filename)(), metadata);
    assert.equal(await loader(filename, "/")(), metadata);
  }
  assert.equal(await loader("cover.png", "../shirones/content/posts/guide")(), metadata);
  assert.equal(loader("assets/missing.png"), undefined);
});

test("transform supports Windows paths and leaves unrelated or already fixed modules alone", () => {
  assert.ok(plugin.transform(source, "D:\\Blog\\node_modules\\shirones\\src\\utils\\project-images.ts?x"));
  assert.equal(plugin.transform(source, "/project/src/utils/project-images.ts"), null);
  const transformed = plugin.transform(source, moduleId);
  assert.equal(plugin.transform(transformed.code, moduleId), null);
});
