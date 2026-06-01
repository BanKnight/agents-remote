import agentNav from "./agent-nav.svg?raw";
import anthropic from "./anthropic.svg?raw";
import filesNav from "./files-nav.svg?raw";
import gitNav from "./git-nav.svg?raw";
import openai from "./openai.svg?raw";
import terminal from "./terminal.svg?raw";

const svgMap: Record<string, string> = {
  "agent-nav": agentNav,
  anthropic,
  "files-nav": filesNav,
  "git-nav": gitNav,
  openai,
  terminal,
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
      className={"inline-flex " + className}
      dangerouslySetInnerHTML={{ __html: raw }}
      aria-hidden="true"
    />
  );
}
