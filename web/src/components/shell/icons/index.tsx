import agentNav from "./agent-nav.svg?raw";
import anthropic from "./anthropic.svg?raw";
import closeIcon from "./close.svg?raw";
import edit from "./edit.svg?raw";
import ellipsis from "./ellipsis.svg?raw";
import file from "./file.svg?raw";
import filesNav from "./files-nav.svg?raw";
import folderPlus from "./folder-plus.svg?raw";
import gitNav from "./git-nav.svg?raw";
import info from "./info.svg?raw";
import maximize from "./maximize.svg?raw";
import openai from "./openai.svg?raw";
import plus from "./plus.svg?raw";
import project from "./project.svg?raw";
import refresh from "./refresh.svg?raw";
import restore from "./restore.svg?raw";
import settings from "./settings.svg?raw";
import skillsNav from "./skills-nav.svg?raw";
import terminal from "./terminal.svg?raw";
import trash from "./trash.svg?raw";
import upload from "./upload.svg?raw";

const svgMap: Record<string, string> = {
  "agent-nav": agentNav,
  anthropic,
  close: closeIcon,
  edit,
  ellipsis,
  file,
  "files-nav": filesNav,
  "folder-plus": folderPlus,
  "git-nav": gitNav,
  info,
  maximize,
  openai,
  plus,
  project,
  refresh,
  restore,
  settings,
  "skills-nav": skillsNav,
  terminal,
  trash,
  upload,
};

export type ShellIconName = keyof typeof svgMap;

export function ShellIcon({
  className = "size-4",
  name,
}: {
  className?: string;
  name: ShellIconName;
}) {
  const raw = svgMap[name];
  if (!raw) return null;
  // 给注入的 svg 标 size-full：class 含 "size-" 才能绕过 shadcn Button base 的
  // `[&_svg:not([class*='size-'])]:size-4`——否则 Button 内的 ShellIcon svg 被强制 16px，
  // 调用方传的尺寸失效（IconMarker sm 的 h-3.5=14px 被覆盖成 16）。svg size-full 跟随
  // 外层 span（span 由 className 定尺寸），全栈 Button>ShellIcon 的 icon 尺寸由此可靠。
  const html = raw.replace(/^<svg\b/, `<svg class="size-full"`);
  return (
    <span
      className={"inline-flex items-center justify-center " + className}
      dangerouslySetInnerHTML={{ __html: html }}
      aria-hidden="true"
    />
  );
}
