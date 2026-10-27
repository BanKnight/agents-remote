# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-27(镜像瘦身批完成:体积 2.19GB→1.19GB + 基镜像升 node:24 安全版 + 冒烟全绿)

## 一句话状态

**「部署形态」批之后紧接「镜像瘦身」批全部完成:builder 只组装 runtime 真实需要的四样(替代 1.27GB node_modules),基镜像升 node:24-slim(v24.22.1,含 2026-10-20 全线安全发布),镜像 2.19GB→1.19GB(-46%);compose 冒烟 15 项全绿(CLI 链/解析链/站点面/登录/自愈/约束);commit 15c84d8。推 tag 仍待用户发布时单独确认。**

## 本 session 焦点

### 关键决策(不可丢)

- **生产形态(用户拍板,上一批)**:web 静态由 **api 内置静态 serve**(`WEB_DIST_DIR` env 启用);单进程单端口承载 web 静态 + `/api`(HTTP+WS) + `/p/`。核心交付 = GitHub CI 打容器镜像给别人用;本机 ar-dev 不迁移。
- **镜像瘦身方案(本批,plan approved)**:砍「整棵 node_modules」→ builder 组装最小 runtime 树(`cp -rL` 解 bun symlink 布局),runtime 精确 COPY 三处:
  - `/runtime/claude-code-linux-x64`(claude 254MB ELF 自包含,裸名 PATH spawn)
  - `/app/api/node_modules`(skills+tar+yaml,api bundle 唯一运行时解析点:`createRequire` 从 `/app/api/dist` 向上解析,skill-process.ts 以 `["node", <绝对路径>]` spawn)
  - `/app/{api,web}/dist`(api 是 @bun 全 bundle 零第三方依赖)
  - 证据:web 的构建工具在 **dependencies** 分组,`bun install --production` 裁不掉(vite/tailwind/mermaid/lucide/typescript ~1.27GB);api/dist 无 `--external`、pi SDK 全内联(211 处模块引用、0 external require)——**pi 是进程内 SDK 导入,不是 spawn 的 CLI**。
- **基镜像升 node:24-slim(用户安全提醒拍板)**:近期 node 安全问题 = **2026-10-20 全线安全发布**(v24.22.1 / v22.23.4,`security:true`);node:24 = Active LTS(bookworm 基,与旧 22 线同 glibc 环境);skills engines ≥22.20.0 兼容。**floating tag 不钉 digest**——CI 重建持续吃安全补丁。
- **npm/corepack/yarn 裁剪:不做**——实测仅 19MB(npm+corepack;yarn 7MB 在独立层),且**后层 `rm` 不省镜像体积(层不可变,只 mask)**;为此加 stage 重建 + debian 版本耦合不值。计划里「~45MB」估算已按实测修正。
- **NPM_REGISTRY build-arg**:codex `npm install -g` 国内直连 npmjs 会长时间卡死(实测 25min 0.6% CPU);加 ARG 默认官方源(CI 零改动),本地传 `--build-arg NPM_REGISTRY=https://registry.npmmirror.com`。deployment.md 构建侧已补。
- **供应链钉版不变**:CODEX_VERSION=0.163.0;workflow 五 action 钉 commit SHA;密码不落盘(APP_PASSWORD env-only);restart policy 语义(`docker kill/stop` 不触发重启,崩溃自愈验证 = 宿主侧杀容器内 bun)。

### 进度

- ✅ 镜像瘦身实现(Dockerfile 重构):builder `/runtime` 组装(确定性路径,glob 仅命中锁文件版本);runtime node:24-slim + 三处 COPY;`PATH=/runtime:${PATH}`;体积 **1.19GB**(层账:debian 75+node 155+apt 96+bun 107+codex 431+claude 265+dist 59+skills 3.5)。
- ✅ 两坑修复:①BuildKit **COPY 单文件 symlink 会解引用**——`COPY /runtime/claude` 重复拷 265MB,改 final 层内 `ln -s`;②磁盘 40G 满(ENOSPC)——`docker builder prune -af` 回收 6.98GB + 删旧镜像,构建命令勿用 `| tail`(吞退出码)。
- ✅ 冒烟(原 compose 文件 + 本地 tag 指向新镜像):healthy 9s;node **v24.22.1**/bun 1.4.4/claude 2.1.299/codex 0.163.0/tmux 3.3a/git 2.39.5;skills 1.5.22 解析链(`bun`+`node` 双路 createRequire → `/app/api/node_modules/skills/package.json`)与 CLI 实跑;`/app/node_modules` 缺席、全盘无 vite/mermaid/typescript/lucide;站点面(壳 no-cache/assets immutable/text-javascript/health 200/未鉴权 401);登录 200→projects 200;密码不落盘(config.yaml 无 app_password);崩溃自愈 restarts=1;mem 4G/pids 512/no-new-privileges。
- ✅ 文档:deployment.md 补「镜像体积构成表」「迁移到新机器(三步)」+ mirror 示例 node:24 + NPM_REGISTRY 说明。
- ✅ 门禁:format/lint/typecheck 全绿;commit `15c84d8`(hook 判 docs-only 快通道)。
- ⏸ 推 tag:用户拍板先不推;发布时 `git tag v<semver> && git push origin v<semver>`(需单独确认,版本号待定)。

### 待办

- **发布时**(用户发起):定版本号 → 推 tag → GH Actions 绿(CI 用官方 npm 源,零改动)→ `docker pull ghcr.io/banknight/agents-remote:<tag>` 冒烟 → GHCR 包公开化。
- **真机/人工清单(本批遗留)**:①UI 发起一次 pi chat(需 API key,验证内联 SDK 运行面——静态证据:pi 全内联+启动无 import 错误,仅深度路径未实测);②`/p/` 公开 pages 根管线本批未跑(代码零改动,47 单测+上一批冒烟已覆盖)。
- **既有待办不变**:IDB 批剩余真机清单 5 项;React #310 跨 lg 断点崩溃立批;批 16/17/18 真机复验;取证件待拆;e2e 基线;M2.0 多卡焦点互抢。

### 易丢的关键上下文

- **本地构建必须**:基础镜像经 mirror 拉取 tag 回标准名(node:24-slim/oven/bun:1 本机已就位)+ `--build-arg NPM_REGISTRY=https://registry.npmmirror.com`;全量构建 ~10min(bun install 1.27GB 网络 + web 构建 + codex 411MB)。
- **Docker 层语义**:后层 `rm -rf` 不减小镜像(基座层不可变);COPY 单文件 symlink 解引用成实体;多源 glob 双命中 cp 显式报错(fail loud 是有意设计)。
- **磁盘 40G 紧张**:构建前后用 `docker system df` 看;只清 builder cache/dangling image,不碰同机他项目运行容器(9router/axonhub)。
- **冒烟残留清理**:compose bind mount 首启由 docker daemon root 建目录 → `docker run --rm --entrypoint sh -v $PWD/data:/data agents-remote:local -c 'rm -rf /data/...'`。
- **本机镜像 agents-remote:local = 1.19GB 已验证可用**;旧 2.19GB 镜像与中间产物已删(可从 git b805244 重建);ghcr.io 本地 alias 已移除(防 compose 用到陈旧本地 tag)。
- commit 尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`,标准 `git add && git commit`。

---
最后更新:2026-10-27(触发原因:镜像瘦身批收尾:实现+冒烟+门禁+commit 完成,handoff save)
