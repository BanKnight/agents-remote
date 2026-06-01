import gitNavSvg from "./git-nav.svg?raw";

export const GitNavIcon = () => (
  <span
    className="inline-flex h-5 w-5 [&>svg]:h-full [&>svg]:w-full"
    dangerouslySetInnerHTML={{ __html: gitNavSvg }}
  />
);
