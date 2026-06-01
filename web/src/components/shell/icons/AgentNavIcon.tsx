import agentNavSvg from "./agent-nav.svg?raw";

export const AgentNavIcon = () => (
  <span
    className="inline-flex h-5 w-5 [&>svg]:h-full [&>svg]:w-full"
    dangerouslySetInnerHTML={{ __html: agentNavSvg }}
  />
);
