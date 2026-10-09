import { describe, expect, test } from "bun:test";
import { rootDisplayName } from "./file-browser";

// v1.6 真机反馈②根名真实化：crumb 根段 = rootPath basename（部署目录名因机器而异），
// 硬编码 i18n 根名（"agents-remote"）退役。
describe("rootDisplayName", () => {
  test("取 rootPath 末段 basename", () => {
    expect(rootDisplayName("/srv/agents-remote", "服务器根")).toBe("agents-remote");
    expect(rootDisplayName("/home/u/proj-root", "服务器根")).toBe("proj-root");
  });

  test("末段空 segment 不影响（split filter 后取末位）", () => {
    expect(rootDisplayName("/srv/root/", "服务器根")).toBe("root");
  });

  test("rootPath 缺省（加载中/项目 listing/旧 mock）退 i18n fallback", () => {
    expect(rootDisplayName(undefined, "服务器根")).toBe("服务器根");
    expect(rootDisplayName("", "服务器根")).toBe("服务器根");
  });
});
