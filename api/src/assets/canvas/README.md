# canvas/ — 画布卡 excalidraw standalone 产物（vendored,生成物进 git）

`dist/excalidraw.bundle.js`（IIFE,全局名 `ARCanvasBundle`,导出 `mount`）与
`dist/excalidraw.bundle.css` 是 `@excalidraw/excalidraw@0.18.1` 的 standalone
单文件打包产物,供 `mcp-app-templates.ts` 构建期内联（`with { type: "text" }`）。
运行时零 npm 依赖（react/react-dom 一并打入,宿主 iframe 不提供任何全局）。

- 放在 `dist/` 是刻意的：oxfmt/oxlint 的 `**/dist/**` ignorePattern 覆盖到此,
  4.4MB minified 产物不进 format/lint 门禁;api tsconfig 只 include `src/**/*.ts`,
  typecheck 不触碰。
- M2.0 前置实验结论（体积/CSP/iframe 预聚焦坑/import.meta 警告无害）见
  `docs/research/mcp-apps-hosting.md` §12.6。

## 重建配方（scratch 工程,勿入仓）

```bash
# 任意空目录,package.json deps:
#   @excalidraw/excalidraw 0.18.1 / react 19 / react-dom 19
#   devDeps: vite ^8 @vitejs/plugin-react ^6
# bun install 后按下方三份源文件落盘,再 bunx vite build
cp dist/excalidraw.bundle.js <repo>/api/src/assets/canvas/dist/
cp dist/*.css             <repo>/api/src/assets/canvas/dist/excalidraw.bundle.css
```

### vite.config.ts

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // mermaid 解析器(~4MB)stub 掉:M2 画布不做 mermaid 导入。
  resolve: { alias: { "@excalidraw/mermaid-to-excalidraw": "./stubs/mermaid.ts" } },
  define: { "process.env.NODE_ENV": '"production"' },
  build: {
    lib: {
      entry: "src/main.tsx",
      name: "ARCanvasBundle",
      formats: ["iife"],
      fileName: () => "excalidraw.bundle.js",
    },
    cssCodeSplit: false,
    minify: "oxc",
    rollupOptions: { output: { inlineDynamicImports: true }, external: [] },
  },
});
```

### stubs/mermaid.ts

```ts
export const parseMermaidToExcalidraw = async () => {
  throw new Error("mermaid import is disabled in this build");
};
export default { parseMermaidToExcalidraw };
```

### src/main.tsx

```tsx
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

type MountOptions = {
  elements?: readonly unknown[];
  langCode?: string;
  theme?: "light" | "dark";
  onReady?: () => void;
  onChange?: (elements: readonly unknown[]) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyApi = any;

const mount = (container: HTMLElement, options: MountOptions) => {
  let api: AnyApi = null;
  let theme: "light" | "dark" = options.theme === "dark" ? "dark" : "light";
  let latestElements: readonly unknown[] = options.elements ?? [];
  const root = createRoot(container);
  // setTheme 走重渲染(theme 是 react prop):initialData 用 latestElements,
  // 场景内容在重渲染间保留(选择态等 UI 态重置,可接受)。
  const renderApp = () => {
    root.render(
      <div style={{ width: "100%", height: "100%" }}>
        <Excalidraw
          excalidrawAPI={(a: AnyApi) => {
            api = a;
            options.onReady?.();
          }}
          initialData={{
            elements: latestElements as AnyApi,
            appState: { langCode: options.langCode === "en" ? "en" : "zh-CN" },
          }}
          theme={theme}
          onChange={(elements: readonly unknown[]) => {
            latestElements = elements;
            options.onChange?.(elements);
          }}
          UIOptions={{
            canvasActions: {
              export: false,
              saveAsImage: false,
              load: false,
              saveToActiveFile: false,
              exportToSql: false,
            },
          }}
        />
      </div>,
    );
  };
  renderApp();
  return {
    setElements(elements: readonly unknown[]) {
      latestElements = elements;
      api?.updateScene({ elements });
    },
    setTheme(next: "light" | "dark") {
      if (next === theme) return;
      theme = next;
      renderApp();
    },
    getElements() {
      return api ? api.getScene().elements : latestElements;
    },
    destroy() {
      root.unmount();
      api = null;
    },
  };
};

export { mount };
```

## 已知无害告警

构建时 rolldown 报 `[EMPTY_IMPORT_META]`（subset-worker chunk 的 `import.meta.url`,
IIFE 下替换为 `{}`）——该 worker 本就被画布 CSP 阻断(M2.0 实验结论:无 page error,
影响面仅导出图片/字体子集化,M2 裁定不做导出图片)。

---

2026-10-22 M2.2 入仓(@excalidraw/excalidraw 0.18.1 / react 19.3.1 / vite 8.3.5 /
@vitejs/plugin-react 6.1.2;js 4.36MB raw / 1.43MB gzip,css 244KB)。
