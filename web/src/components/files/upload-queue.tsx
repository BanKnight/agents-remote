import { atom, getDefaultStore, useAtomValue } from "jotai";
import { queryClient } from "../../lib/query-client";
import { rootUploadFile, UploadConflictError, uploadFile } from "../../api/client";
import type { UploadConflictPolicy } from "@agents-remote/shared";
import { useT } from "../../i18n";
import { ShellIcon } from "../shell/icons";
import { formatBytes } from "@/lib/format";

// ── 上传队列（03z `.upcard`：串行队列 + 冲突行内三选 + 失败重试）──────────────
// 桌面 FilesPanel 与移动 MobileFilesTool 双端单源：atom 挂默认 store（全局单例），
// pump 为 module 级串行循环，不依赖组件生命周期；组件层只渲染 + 调 action。

export type UploadQueueStatus = "pending" | "uploading" | "conflict" | "error";

export type UploadQueueItem = {
  id: string;
  file: File;
  /** "" = PROJECTS_ROOT 根层（root upload，03o pin④）。 */
  projectName: string;
  directoryPath: string;
  /** 冲突三选后的重传处置；undefined = 首传（409 → 行内三选）。 */
  conflict?: UploadConflictPolicy;
  status: UploadQueueStatus;
  /** error 行的失败文案（fetch 抛出的本地化消息）。 */
  message?: string;
};

type UploadQueueState = {
  items: UploadQueueItem[];
  /** 本轮已完成数（prog 总体进度 = doneCount / (doneCount + items.length)）。 */
  doneCount: number;
};

export const uploadQueueAtom = atom<UploadQueueState>({ items: [], doneCount: 0 });

// fetch 上传无进度回调：abort 通道专用（pin② 逐个取消 / r1 ✕ 清空）。
const controllers = new Map<string, AbortController>();
let queueSeq = 0;

const setItems = (updater: (state: UploadQueueState) => UploadQueueState): void => {
  const store = getDefaultStore();
  const next = updater(store.get(uploadQueueAtom));
  // 队列清空时进度计数一并归零（卡片隐藏后下次入队从 0 起算）。
  store.set(uploadQueueAtom, next.items.length === 0 ? { items: [], doneCount: 0 } : next);
};

/** 入队一批文件并启动串行 pump。projectName = "" 上传到根层。 */
export const enqueueUploads = (projectName: string, directoryPath: string, files: File[]): void => {
  const fresh = files
    .filter((file) => file.size > 0 || file.name !== "")
    .map((file) => ({
      id: `upload-${Date.now()}-${queueSeq++}`,
      file,
      projectName,
      directoryPath,
      status: "pending" as const,
    }));
  if (fresh.length === 0) return;
  setItems((state) => ({ ...state, items: [...state.items, ...fresh] }));
  void pump();
};

/** 冲突三选：带处置重新入队。 */
export const resolveUploadConflict = (id: string, conflict: UploadConflictPolicy): void => {
  setItems((state) => ({
    ...state,
    items: state.items.map((item) =>
      item.id === id ? { ...item, conflict, status: "pending" } : item,
    ),
  }));
  void pump();
};

/** 失败行重试：清掉冲突意图按首传重走（409 再进三选）。 */
export const retryUpload = (id: string): void => {
  setItems((state) => ({
    ...state,
    items: state.items.map((item) =>
      item.id === id ? { ...item, conflict: undefined, status: "pending" } : item,
    ),
  }));
  void pump();
};

/** 逐个取消（pin②）：上传中的行先 abort（fetch 抛 AbortError → 移除）。 */
export const removeUploadItem = (id: string): void => {
  controllers.get(id)?.abort();
  setItems((state) => ({
    ...state,
    items: state.items.filter((item) => item.id !== id),
  }));
};

/** r1 ✕：清空整个队列（上传中的行 abort）。 */
export const clearUploadQueue = (): void => {
  const store = getDefaultStore();
  for (const item of store.get(uploadQueueAtom).items) {
    controllers.get(item.id)?.abort();
  }
  store.set(uploadQueueAtom, { items: [], doneCount: 0 });
};

const invalidateAfterUpload = (item: UploadQueueItem): void => {
  if (item.projectName === "") {
    void queryClient.invalidateQueries({ queryKey: ["root", "files"] });
    return;
  }
  // 3 元素前缀匹配项目内全部 files 查询（含子目录 path 变体）。
  void queryClient.invalidateQueries({
    queryKey: ["projects", item.projectName, "files"],
  });
};

// 串行 pump：同一时刻最多一个 in-flight（服务端顺序写盘；进度卡「当前文件」语义单一）。
let pumping = false;

const pump = async (): Promise<void> => {
  if (pumping) return;
  pumping = true;
  const store = getDefaultStore();
  try {
    for (;;) {
      const item = store
        .get(uploadQueueAtom)
        .items.find((candidate) => candidate.status === "pending");
      if (!item) break;

      const controller = new AbortController();
      controllers.set(item.id, controller);
      setItems((state) => ({
        ...state,
        items: state.items.map((candidate) =>
          candidate.id === item.id ? { ...candidate, status: "uploading" } : candidate,
        ),
      }));

      try {
        if (item.projectName === "") {
          await rootUploadFile(item.file, item.conflict);
        } else {
          await uploadFile(item.projectName, item.directoryPath, item.file, item.conflict);
        }
        // abort = 单行 ✕（removeUploadItem 已移除该行）：跳过本行继续泵后续 pending；
        // 清空队列（clearUploadQueue）靠 items 清空自然退出，不停整条泵。
        if (controller.signal.aborted) continue;
        // 成功：行移除 + 进度计数 + 列表刷新（03z pin③「完成后列表自动刷新」）。
        setItems((state) => ({
          doneCount: state.doneCount + 1,
          items: state.items.filter((candidate) => candidate.id !== item.id),
        }));
        invalidateAfterUpload(item);
      } catch (error) {
        // 同上：单行取消（AbortError）只跳过本行，泵继续。
        if (controller.signal.aborted) continue;
        if (error instanceof UploadConflictError) {
          setItems((state) => ({
            ...state,
            items: state.items.map((candidate) =>
              candidate.id === item.id ? { ...candidate, status: "conflict" } : candidate,
            ),
          }));
        } else {
          const message = error instanceof Error ? error.message : String(error);
          setItems((state) => ({
            ...state,
            items: state.items.map((candidate) =>
              candidate.id === item.id ? { ...candidate, status: "error", message } : candidate,
            ),
          }));
        }
      } finally {
        controllers.delete(item.id);
      }
    }
  } finally {
    pumping = false;
  }
};

// ── UploadQueueCard（03z `.upcard`）─────────────────────────────────────────

export function UploadQueueCard() {
  const { t } = useT();
  const queue = useAtomValue(uploadQueueAtom);

  if (queue.items.length === 0) return null;

  const total = queue.doneCount + queue.items.length;
  const percent = total > 0 ? Math.round((queue.doneCount / total) * 100) : 0;
  const uploading = queue.items.find((item) => item.status === "uploading");
  const current = uploading ?? queue.items[0]!;

  return (
    <div
      className="upcard"
      role="status"
      aria-label={t("files.uploadQueue.uploading", { count: queue.items.length })}
    >
      <div className="r1">
        <span>
          {uploading
            ? t("files.uploadQueue.uploading", { count: queue.items.length })
            : t("files.uploadQueue.queued", { count: queue.items.length })}
        </span>
        <button className="x" type="button" onClick={clearUploadQueue} aria-label={t("cancel")}>
          <ShellIcon className="h-3 w-3" name="close" />
          {t("cancel")}
        </button>
      </div>
      <div className="prog" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="d">
        {current.file.name} · {formatBytes(current.file.size)}
      </div>
      <ul className="qlist">
        {queue.items.map((item) => (
          <li className="urow" key={item.id}>
            <span className="p">{item.file.name}</span>
            {item.status === "conflict" ? (
              <span className="urow-actions">
                <span className="hint">{t("files.uploadQueue.conflict")}</span>
                <button type="button" onClick={() => resolveUploadConflict(item.id, "overwrite")}>
                  {t("files.uploadQueue.overwrite")}
                </button>
                <button type="button" onClick={() => resolveUploadConflict(item.id, "keepBoth")}>
                  {t("files.uploadQueue.keepBoth")}
                </button>
                <button type="button" onClick={() => removeUploadItem(item.id)}>
                  {t("cancel")}
                </button>
              </span>
            ) : item.status === "error" ? (
              <span className="urow-actions">
                <span className="hint danger">{item.message}</span>
                <button type="button" onClick={() => retryUpload(item.id)}>
                  {t("files.uploadQueue.retry")}
                </button>
              </span>
            ) : null}
            <button
              className="x"
              type="button"
              onClick={() => removeUploadItem(item.id)}
              aria-label={`${item.file.name} ${t("cancel")}`}
            >
              <ShellIcon className="h-3 w-3" name="close" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
