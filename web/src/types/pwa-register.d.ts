declare module "virtual:pwa-register" {
  export function registerSW(options?: {
    onNeedRefresh?: () => void;
    /** autoUpdate 模式：新 SW activated(isUpdate) 时默认整页 reload——传回调拦截（本仓
     *  传空回调，「发版静默生效」见 main.tsx registerSW 注释）。 */
    onNeedReload?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }): (reloadPage?: boolean) => Promise<void>;
}
