// @vitest-environment jsdom

// 设置页通知 detail（NotificationsSection，PWA 通知批）行为单测。
//
// NotificationsSection 未导出——不改产品代码，经导出的 SettingsContent 以
// activeSection="notifications" 渲染同一段（settings-dialog.tsx 的 switch 分支即渲染
// <NotificationsSection />）；root 入口行测试同经 SettingsContent 默认 activeSection="root"。
//
// ⚠️ JSDOM 全局必须在「任何 DOM 依赖模块 import 之前」建好（radix/react-dom 模块加载时
// 判定，见 git-write-errors.test.tsx 头注），除 bun:test / jsdom 外一律动态 import。
// mock.module 全量替换 module namespace，必须 spread 原导出。
// bun:test RTL cleanup 非自动：afterEach 手动 cleanup（防组件跨测试泄漏）。
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";

import type { GetSettingsResponse } from "@agents-remote/shared";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.example/" });
// 本 jsdom 版本不实现 matchMedia（RTL act-compat / display-mode standalone 判定都要用），
// stub 恒 false（测试环境语义 = 非 standalone / 浅色）。
dom.window.matchMedia = (() => ({ matches: false })) as unknown as typeof dom.window.matchMedia;

// Radix 生态直接引用 globalThis 上的 DOM 构造器且 dispatchEvent 只认自家 Event 实例——
// jsdom 只挂在 window 上，必须整组搬到 globalThis（同 git-write-errors.test.tsx）。
const DOM_GLOBAL_KEYS = [
  "Event",
  "CustomEvent",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "InputEvent",
  "Node",
  "NodeFilter",
  "Element",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLTextAreaElement",
  "HTMLAnchorElement",
  "HTMLButtonElement",
  "DocumentFragment",
  "ShadowRoot",
  "Selection",
  "Range",
  "getComputedStyle",
  "MutationObserver",
] as const;

function installDomGlobals() {
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document as unknown as Document;
  globalThis.navigator = dom.window.navigator as unknown as Navigator;
  globalThis.localStorage = dom.window.localStorage;
  for (const key of DOM_GLOBAL_KEYS) {
    globalThis[key] = dom.window[key as keyof typeof dom.window] as never;
  }
}

// 模块加载期装一次（react-dom / Radix 求值时要看到 window）；每个 test 再装一次——
// bun test 全量跑同进程共享 globalThis，前序文件（mobile-sheet.test.ts afterEach）会
// delete 掉 window/document，只在模块顶层装会被清掉。
installDomGlobals();

// getSettings fixture：notifications 三类键齐全（blocked/done=true、error=false），
// 断言 kind 行 aria-checked 直接来自服务端偏好值。
const SETTINGS_FIXTURE = {
  settings: {
    runtimes: {
      claude: { presets: [], activePresetId: "", enable1mContext: false, effort: "high" },
      pi: { presets: [], activePresetId: "", firecrawlApiKeyMasked: "" },
      acp: {},
    },
    skills: { sources: [] },
    notifications: { blocked: true, done: true, error: false },
  },
} as unknown as GetSettingsResponse;

const getSettingsMock = mock(async () => SETTINGS_FIXTURE);
const updateNotificationSettingsMock = mock(async () => ({
  settings: { blocked: true, done: true, error: false },
}));

const actualApi = await import("../../api/client");
mock.module("../../api/client", () => ({
  ...actualApi,
  getSettings: getSettingsMock,
  updateNotificationSettings: updateNotificationSettingsMock,
}));

// push 能力 mock：canUsePush / getPushSubscription 按用例切换（jsdom 无 serviceWorker，
// 真实实现恒降级；订阅态用假订阅对象表达「已订阅」）。enable/disablePush 本组用例不触达。
const canUsePushMock = mock(() => false);
const getPushSubscriptionMock = mock(async (): Promise<unknown> => null);
const actualPush = await import("../../lib/push");
mock.module("../../lib/push", () => ({
  ...actualPush,
  canUsePush: canUsePushMock,
  getPushSubscription: getPushSubscriptionMock,
}));

// 不用 @testing-library/react 的 `screen`：它在 import 期绑定 globalThis.document 快照，
// 全量跑同进程时若被别的文件在「无 document 窗口」（如 mobile-sheet.test.ts 的 afterEach
// delete）首次求值，会永久退化成抛错版。一律用 render() 返回的 view 内查询。
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { createElement } = await import("react");
const { I18nProvider } = await import("../../i18n/context");
const { SettingsContent } = await import("./settings-dialog");
type SettingsSection = import("./settings-dialog").SettingsSection;

afterEach(() => cleanup());

beforeEach(() => {
  installDomGlobals();
  // i18n 断言锚定中文文案（默认 system 跟随宿主语言会漂到 en）。
  localStorage.setItem("lang", "zh");
  getSettingsMock.mockClear();
  updateNotificationSettingsMock.mockClear();
  canUsePushMock.mockImplementation(() => false);
  getPushSubscriptionMock.mockImplementation(async () => null);
});

function renderSettings(activeSection: SettingsSection = "root"): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      I18nProvider,
      null,
      createElement(
        QueryClientProvider,
        { client },
        createElement(SettingsContent, { activeSection, onNavigate: () => {} }),
      ),
    ),
  );
}

/** 取 section 内全部 role=switch 行（DOM 序 = [推送, blocked, done, error]）。 */
async function findSwitchRows(view: ReturnType<typeof render>) {
  const rows = await view.findAllByRole("switch");
  expect(rows).toHaveLength(4);
  return rows as HTMLButtonElement[];
}

describe("NotificationsSection 非支持环境（canUsePush=false、无订阅）", () => {
  test("推送开关行 disabled 且三类 kind 行 disabled、显 kindDisabledHint", async () => {
    const view = renderSettings("notifications");

    const rows = await findSwitchRows(view);
    // 推送行：disabled + 未勾选（订阅探测 null → false；settings 加载前后 aria 值不变）。
    expect(rows[0]!.disabled).toBe(true);
    await waitFor(() => expect(rows[0]!.getAttribute("aria-checked")).toBe("false"));
    expect(view.getByText("推送通知")).toBeTruthy();
    // kind 行 disabled（subscribed !== true → kindToggleDisabled），但 aria-checked 跟随
    // 服务端偏好值（fixture = blocked/done true、error false），与订阅态无关。
    await waitFor(() => expect(rows[1]!.getAttribute("aria-checked")).toBe("true"));
    expect(rows[2]!.getAttribute("aria-checked")).toBe("true");
    expect(rows[3]!.getAttribute("aria-checked")).toBe("false");
    for (const row of rows.slice(1)) expect(row.disabled).toBe(true);
    // 每个禁用 kind 行都带「请先开启推送通知」降级提示（settings.notifications.kindDisabledHint）。
    expect(view.getAllByText("请先开启推送通知")).toHaveLength(3);
  });

  test("root 入口行：非 standalone 显「需先添加到主屏幕」且为静态行（非 button）", () => {
    const view = renderSettings("root");

    const hint = view.getByText("需先添加到主屏幕");
    const row = hint.closest(".setrow");
    expect(row).toBeTruthy();
    // 静态行 = div（row() 无 onClick 时渲染 div 而非 button.setrow）——不可点入 detail。
    expect(row!.tagName).toBe("DIV");
  });
});

describe("NotificationsSection 支持环境（canUsePush=true、已订阅）", () => {
  test("三类 kind 行渲染且 aria-checked 跟随服务端偏好值", async () => {
    canUsePushMock.mockImplementation(() => true);
    getPushSubscriptionMock.mockImplementation(async () => ({
      endpoint: "https://push.example/1",
    }));
    const view = renderSettings("notifications");

    const rows = await findSwitchRows(view);
    // 订阅探测完成 → 全部可用；推送行 aria-checked=true。
    await waitFor(() => expect(rows[1]!.disabled).toBe(false));
    expect(rows[0]!.disabled).toBe(false);
    expect(rows[0]!.getAttribute("aria-checked")).toBe("true");
    // 行序 blocked/done/error；fixture = blocked:true done:true error:false。
    expect(view.getByText("等待审批")).toBeTruthy();
    expect(view.getByText("任务完成")).toBeTruthy();
    expect(view.getByText("任务出错")).toBeTruthy();
    expect(rows[1]!.getAttribute("aria-checked")).toBe("true");
    expect(rows[2]!.getAttribute("aria-checked")).toBe("true");
    expect(rows[3]!.getAttribute("aria-checked")).toBe("false");
  });

  test("点击 kind 行调用 updateNotificationSettings（翻转对应键）", async () => {
    canUsePushMock.mockImplementation(() => true);
    getPushSubscriptionMock.mockImplementation(async () => ({
      endpoint: "https://push.example/1",
    }));
    const view = renderSettings("notifications");

    const rows = await findSwitchRows(view);
    await waitFor(() => expect(rows[1]!.disabled).toBe(false));

    // react-query 的 mutationFn 收第二个 context 参数（{client, meta}）——只断言首个实参。
    const mutateArgs = () => updateNotificationSettingsMock.mock.calls.map((c) => c[0]);

    // done（on）→ 关。
    fireEvent.click(rows[2]!);
    await waitFor(() => expect(mutateArgs()).toEqual([{ done: false }]));
    // error（off）→ 开（等上一次 pending 结束再点，避免 isPending 期间 disabled 吞点击）。
    await waitFor(() => expect(rows[3]!.disabled).toBe(false));
    fireEvent.click(rows[3]!);
    await waitFor(() => expect(mutateArgs()).toEqual([{ done: false }, { error: true }]));
  });
});
