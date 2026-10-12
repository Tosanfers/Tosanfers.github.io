# Shirone Blog

This site runs on [Shirone](https://github.com/LyraVoid/Shirone) — an
anime-inspired, Material 3 Expressive blog theme for Astro, installed as the
`shirones` npm package.

## Commands

```bash
pnpm install   # install dependencies (run once after init)
pnpm dev       # start the dev server at http://localhost:4321
pnpm build     # static build → dist/
pnpm preview   # preview the production build locally
```

## Project layout

| Path | What it is |
| --- | --- |
| `shirones/config/` | site configuration — URL, title, theme colour, sidebar, fonts (TypeScript, fully typed) |
| `shirones/config/data/` | friends, projects, skills, timeline, … |
| `shirones/content/` | your posts, moments and other collections |
| `src/components/` | drop a file here to override a theme component (mirrors the theme's `src/components/` tree) |
| `src/layouts/` | …same for layouts |
| `public/` | static assets (favicons, banners, images) |

## Project images

Profile and banner images may live in `src/assets/`; configure their paths
relative to `src`, for example `assets/images/logo/1.png`. The Vite plugin in
`tools/shirone-project-images.mjs` extends Shirone 0.1.5's package-mode image
loader to include these assets, preserving Astro image optimisation. It also
keeps the existing `shirones/` image lookup for covers stored beside posts.
Favicons use public URLs instead: `public/logo/1.png` is `/logo/1.png`.

After changing the plugin, restart the dev server. Run its regression checks
with `node --test --test-isolation=none tests/shirone-project-images.test.mjs`
(Node 22.8+).

## GitHub Pages deployment

In the GitHub repository, open **Settings → Pages → Build and deployment** and
set **Source** to **GitHub Actions**. The workflow in
`.github/workflows/deploy.yml` builds Astro rather than Jekyll, using Node 24
and the pnpm version declared in `package.json`. It runs Astro checks followed
by the full build script (including Pagefind), then publishes `dist/`.

Push to `main` to trigger deployment, or run **Deploy Astro to GitHub Pages**
manually from the Actions tab. For this repository, the site URL is
`https://tosanfers.github.io/` and `base` is `/` in
`shirones/config/siteConfig.ts`.

## Updating the theme

```bash
npx shirones init            # report drift only
npx shirones init --update   # add missing files without replacement
npx shirones init --force    # replace the template after backing up the old copy
```

`--force` moves the previous `shirones/`, `public/` and project scaffold files
to `.shirones-backup/` before copying the installed template. See the package
documentation for the full configuration reference and component-override rules.
