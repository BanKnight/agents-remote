import terminalSvg from "./terminal.svg?raw";

export const TerminalIcon = () => (
  <span
    className="inline-flex h-5 w-5 [&>svg]:h-full [&>svg]:w-full"
    dangerouslySetInnerHTML={{ __html: terminalSvg }}
  />
);
