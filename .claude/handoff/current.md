# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-27(部署形态批:实现+commit 落地+compose 冒烟全绿,双 reviewer 审查中)

## 一句话状态

**「Docker/compose/systemd 部署」批实现完成:commit `66bc12e` 落地(api 内置静态 serve + /p/ rewrite + Dockerfile/entrypoint/compose/CI/unit/文档),docker build 成功,compose 冒烟 15 项断言全绿(崩溃自愈/落点树/CLI 链/mem limit),全门禁 951 pass 0 fail——双 reviewer(code+security)后台审查中,消化后待用户确认推 tag 触发 CI(外发动作)。**

## 本 session 焦点

### 关键决策(不可丢)

- **生产形态(用户拍板)**:web 静态由 **api 内置静态 serve**(`WEB_DIST_DIR` env 启用,未设=关闭 dev 零影响)——单进程单端口承载 web 静态 + `/api`(HTTP+WS) + `/p/`,tunnel 语义不变。**本批核心交付 = GitHub CI 打容器镜像给别人用**;本机 ar-dev 不迁移(用户「暂时不着急」);systemd 提供系统级模板。
- **会话记录指定目录(用户要求,容器场景)**:零应用改动,compose 三卷收口 `./data/`——`data/home`→`/home/agent`(.claude 登录态+JSONL/.codex/.agents-remote)、`data/run`→`/data/run`(AGENTS_REMOTE_RUN_DIR:token-secret+sessions/*.json)、`data/projects`→`/data/projects`(PROJECTS_ROOT)。备份=备份 `data/`。
- **CONFIG_REQUIRED 硬阻塞不改 api 代码**:entrypoint 首启引导——config.yaml 不存在且 APP_PASSWORD 有值 → umask 077 写最小 yaml(app_password/projects_root/api_port 4311/web_port 4311/web_api_base_url /api)。
- **镜像策略**:多阶段 builder(oven/bun:1 全量装+build+`--production` 裁剪)→ runtime(node:22-slim 自带 node 供 skills CLI;apt tmux/git/gosu;claude CLI 随 node_modules/.bin;codex npm -g 内置;omp 非 npm 不内置)。agent uid/gid 1000 对齐宿主(bind mount 属主一致)。单架构 amd64,workflow 注释留多架构扩展位。
- **ENTRYPOINT/CMD 分离**:entrypoint 做初始化(root chown→gosu 降权→config 引导)后 `exec "$@"`,CMD 缺省 `bun /app/api/dist/index.js`——`docker run image sh` 可透传调试。
- **restart policy 语义**:「崩溃自愈」验证用容器内杀 bun(kill -9)→ restarts=1 ✓;`docker kill`/`stop` 不触发重启是 Docker 语义(手动停止),非配置问题。

### 进度

- ✅ Step 1:api 内置静态 serve(`static-web.ts` ~125 行:decode 拒绝/null byte/`..`段 404/realpath 前缀校验拦 symlink 逃逸/SPA fallback 三态/assets immutable+入口 no-cache)+ index.ts `/p/` rewrite(handler 顶部正则规范化,复用 pages serve 管道:公开根豁免/per-root token 鉴权/ETag)+ 13 用例 + /p/ 集成用例。
- ✅ Step 2:裸跑冒烟 8 项(临时端口 43199+临时 HOME,不碰 ar-dev)。
- ✅ Step 3:全部部署文件落盘+docker build 成功+compose 冒烟 15 项全绿:
  - build 三坑修复:①国内网络 Docker Hub 直连重置→宿主惯例 `docker.1ms.run` mirror 前缀 pull 后 tag 回标准名(Dockerfile 保持标准名);②oven/bun 无 git→builder apt 装 git+`git init -q .`(根 package.json prepare 需要);③`.dockerignore` 的 `**/dist` 误伤 git 入库的 `api/src/assets/canvas/dist/`(excalidraw bundle,api 源码 import 依赖)→加 `!` 例外链;④node:22-slim 自带 node 用户占 uid 1000→先 userdel 再建 agent。
  - 冒烟断言:/ 200 SPA 壳(与容器 dist 一致)/api/health ok/assets JS+CSS immutable/sw no-cache/未知无扩展名 fallback 200/未知有扩展名 404//api 未鉴权 401 JSON//p/ 未知项目 PROJECT_NOT_FOUND JSON 404/data 落点树+0600+宿主属主/CLI 全链(claude 2.1.299/codex 0.164.0/tmux 3.3a/git 2.39.5/node 22.23.4/bun 1.4.4)/进程链 docker-init→gosu→bun uid1000/崩溃自愈 restarts=1→healthy/mem limit 4G。
- ✅ Step 4 部分:全门禁绿;commit `66bc12e`(pre-commit 全门禁过)+ 前置 `fefdc10`(IDB 批 handoff 补交);双 reviewer 后台审查中。
- ⏳ Step 5:推 tag `v*` 触发 CI → GHCR(外发动作,**执行前单独向用户确认**)。

### 待办

- 双 reviewer 报告回来 → 消化(必要时修复补 commit)。
- 推 tag 前向用户确认 → GH Actions 绿 + `docker pull` 冒烟。
- 交用户真机/使用清单。
- **既有待办不变**:IDB 批剩余真机清单 5 项;React #310 跨 lg 断点崩溃立批;批 16/17/18 真机复验;取证件待拆;e2e 基线;M2.0 多卡焦点互抢。

### 易丢的关键上下文

- **冒烟环境残留清理坑**:compose bind mount 首启由 docker daemon 以 root 建目录——宿主 deploy 删不掉,清理用 `docker run --rm --entrypoint sh -v $PWD/data:/data agents-remote:local -c 'rm -rf /data/...'`(镜像内 root);`docker run` 传参已被 ENTRYPOINT 透传修复,但覆盖入口仍需 `--entrypoint`。
- **index.html 里有字面 `assets/index-XXXX.js`**(vite 内嵌注释文本),grep 提取 asset 名会误抓——用 `docker exec ls /app/web/dist/assets/` 取真实 chunk 名;宿主与镜像构建批次 hash 不同,验证以容器内为准。
- **数据落点权威表**在 docker-compose.yml 顶部注释 + docs/runbooks/deployment.md。
- web 包零改动(静态产物已可移植);dev 链路零改动(ar-dev + vite preview + HMR 照旧);`/api/*` 语义零变化。
- commit 尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`,标准 `git add && git commit`。

---
最后更新:2026-10-27(触发原因:部署批 Step 1-4 主体完成,双 reviewer 审查中,handoff save 防丢失)

## 提醒
- 开干前读 .claude/gtd/next-actions.md;守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时,主动 /handoff save。
