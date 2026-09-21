/** 字节数人性化（B / KiB / MiB）。原在 file-browser.tsx，抽到 lib 解 upload-queue ↔ file-browser 循环 import。 */
export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};
