import agentNav from "./agent-nav.svg?raw";
import anthropic from "./anthropic.svg?raw";
import closeIcon from "./close.svg?raw";
import edit from "./edit.svg?raw";
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
import terminal from "./terminal.svg?raw";
import trash from "./trash.svg?raw";
import upload from "./upload.svg?raw";

const svgMap: Record<string, string> = {
  "agent-nav": agentNav,
  anthropic,
  close: closeIcon,
  edit,
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
  terminal,
  trash,
  upload,
};

export type ShellIconName = keyof typeof svgMap;

export function ShellIcon({
  className = "h-5 w-5",
  name,
}: {
  className?: string;
  name: ShellIconName;
}) {
  const raw = svgMap[name];
  if (!raw) return null;
  return (
    <span
      className={"inline-flex items-center justify-center " + className}
      dangerouslySetInnerHTML={{ __html: raw }}
      aria-hidden="true"
    />
  );
}
