import filesNavSvg from "./files-nav.svg?raw";

export const FilesNavIcon = () => (
  <span
    className="inline-flex h-5 w-5 [&>svg]:h-full [&>svg]:w-full"
    dangerouslySetInnerHTML={{ __html: filesNavSvg }}
  />
);
