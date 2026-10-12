import { defineConfig } from "astro/config";
import shirones from "shirones";
import { shironeProjectImages } from "./tools/shirone-project-images.mjs";

// Site-level settings (site URL, base, title, theme colour, fonts, …) live in
// `shirones/config/` so they stay typed and version-controlled with your
// content. This file only wires the theme in.
export default defineConfig({
    // 你的 GitHub Pages 主域名
  site: "https://tosanfers.github.io",

  // 仓库名。如果仓库名是 tosanfers.github.io，这里留空或删掉
  // 如果仓库名是 my-blog，这里写 "/my-blog"
  // base: "/你的仓库名",


  vite: {
    plugins: [shironeProjectImages()],
  },
  integrations: [
    
    shirones({
      // Override individual components by mirroring the theme's structure in
      // `src/components/`, or point at them explicitly:
      // components: { "atoms/blog/PostCard": "./src/components/PostCard.astro" },
    }),
  ],
});
