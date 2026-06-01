import openaiSvg from "./openai.svg?raw";

export const OpenAIIcon = () => (
  <span
    className="inline-flex h-5 w-5 [&>svg]:h-full [&>svg]:w-full"
    dangerouslySetInnerHTML={{ __html: openaiSvg }}
  />
);
