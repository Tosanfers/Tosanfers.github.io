/**
 * shirones 0.1.5 only scans /shirones for project images in package mode.
 * Extend its existing loader to cover the documented src/assets paths without
 * editing node_modules. Vite still imports images as Astro ImageMetadata, so
 * responsive image generation works in both dev and production.
 */
/**
 * ⚠️ 此补丁针对 Shirone 0.1.5 内部实现编写。
 * 升级 Shirone 后，请验证 project-images.ts 的路径与 glob 字符串是否变化，
 * 必要时更新本文件。
 */
export function shironeProjectImages() {
  return {
    name: "shirone-project-assets",
    enforce: "pre",
    transform(code, id) {
      const filename = id.split("?", 1)[0].replaceAll("\\", "/");
      if (!filename.endsWith("/shirones/src/utils/project-images.ts")) {
        return null;
      }

      const pattern = '"/shirones/**/*.{png,jpg,jpeg,webp,avif,svg,gif}"';
      if (!code.includes(pattern) || code.includes("/src/assets/**")) {
        return null;
      }

      return {
        code: code.replace(
          pattern,
          `[${pattern}, "/src/assets/**/*.{png,jpg,jpeg,webp,avif,svg,gif}"]`,
        ),
        map: null,
      };
    },
  };
}
