import anthropicSvg from "./anthropic.svg?raw";

export const AnthropicIcon = () => (
  <span
    className="inline-flex h-5 w-5 [&>svg]:h-full [&>svg]:w-full"
    dangerouslySetInnerHTML={{ __html: anthropicSvg }}
  />
);
