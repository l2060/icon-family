# IconFamily

一个单体部署的图标库管理器：左侧项目列表，右侧项目图标工作区，支持 SVG 导入、iconfont 图标商店、持久化购物车、SVG 编辑、批量去色/调整边距/移除前缀，以及生成 `iconfont.js`。

## 运行要求

- Node.js 22.15 或更高版本（使用内置 `node:sqlite` 和系统 CA，无需额外数据库）
- 浏览器建议使用最新版 Chrome、Edge 或 Firefox

## 开发调试（前后端同一项目）

前端使用 React + TypeScript + Ant Design + Vite，普通 CSS 负责图标矩阵与编辑画布布局，不使用 Tailwind。后端仍为 Node.js，依赖、开发、构建和发布均由根目录统一管理。

```text
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173`。此命令同时启动 Vite 热更新与 Node watch；`/api` 自动代理到后端默认端口 3000。退出命令会同时停止两个进程。可单独运行 `npm run dev:web`、`npm run dev:server`。

后端端口使用 `PORT` 环境变量配置；代理默认跟随该端口，也可在 `.env.local` 设置 `API_PROXY_TARGET=http://127.0.0.1:3001`。仅调试前端时可代理到已有后端。

## 生产启动

```text
npm run build
npm start
```

打开 `http://localhost:3000`。首次启动会自动创建管理员账号，默认值为：

- 用户名：`admin`
- 密码：`adminadmin`

可以通过 `ADMIN_USER`、`ADMIN_PASSWORD`、`DATA_DIR` 和 `STORAGE_DRIVER` 环境变量覆盖默认值。`STORAGE_DRIVER=sqlite` 使用 SQLite（推荐），`STORAGE_DRIVER=fs` 使用 `metadata.json` 文件目录存储，适合单进程小规模部署。生产部署务必修改管理员密码。

iconfont 代理默认使用系统 CA；如果部署环境使用企业自签 CA，可设置 `ICONFONT_CA_FILE` 指向 PEM 文件。`ICONFONT_INSECURE_TLS=1` 仅用于临时开发排查，生产环境不要开启。

## 一键打包

```text
npm run package
```

命令先执行 TypeScript 检查、Vite 生产构建和后端语法检查，再生成 `release/` 和 `iconfamily-0.1.0.zip`。打包器直接生成跨平台 ZIP。

发布包包含编译后的前端与 Node 后端，不包含开发依赖、源码映射或项目数据。目标机器只需 Node.js，无需安装 npm 依赖；解压后执行 `npm start`、`start.cmd` 或 `sh start.sh`。生产页面和 API 均由同一个端口提供。

`npm run typecheck` 可单独检查前端类型。`npm run test:e2e` 运行浏览器回归测试（首次需执行 `npx playwright install chromium`），使用独立的临时数据目录，不会修改工作项目数据。

打包后运行 `npm run test:runtime`，可检查发布包独立启动、统一开发命令和 API 代理（需空闲端口 3111、3112、5173）。VS Code 的运行与调试中提供后端断点调试和 React 浏览器调试入口。`npm run format` 统一格式化 TypeScript、TSX 与 CSS。

## 前端模块

```text
src/
  main.tsx                 # React 入口
  App.tsx                  # 会话与登录状态
  preferences.tsx          # Ant 主题、语言及本地偏好
  api.ts / types.ts        # 类型化 API 与领域类型
  layouts/                 # 左侧项目栏 + 右侧工作区布局
  hooks/                   # 项目数据加载
  components/              # SVG 安全预览等共享组件
  features/
    auth/                  # 登录与用户管理
    projects/              # 项目菜单、设置、删除和 Token
    icons/                 # 矩阵、导入、搜索、分页、批量操作
    cart/                  # 用户购物车、持久化状态、多项目添加抽屉
    editor/                # SVG 画布、属性面板与变换算法
  styles.css               # 原生 CSS 布局和主题变量
```

侧栏可随时切换中英文和明暗主题；偏好保存在浏览器本地。Ant 内置组件文案与界面一起切换。图标名称等用户数据保持原文。

点击侧栏账号进入“我的账号”，验证当前密码后可修改密码（6–128 位），当前登录保留，其他会话失效。管理员另有“用户管理”页签，支持搜索、分页、新增用户（普通用户或管理员）、删除及重置其他用户密码；重置后目标用户所有登录会话失效，需使用新密码重新登录。

项目页面使用 hash 路由（如 `/#/projects/12`），刷新或直接打开链接会恢复对应项目，支持浏览器前进、后退。项目已删除或不可访问时自动回到可访问的项目；没有项目时显示空状态。

登录页为 `/#/login`，项目首页为 `/#/projects`。未登录或会话过期时跳转登录页，并在地址中保留目标项目，登录成功后返回；退出登录回到登录页。已登录访问登录页会进入项目页，登录返回地址仅接受内部项目路由。

“导入”打开拖放/文件选择弹窗，支持 SVG、静态 symbol 格式的 iconfont.js 和 ZIP。加载仅用于校验与预览，勾选后点击“确认导入”才写入项目。弹窗仅图标区域滚动，预览不使用虚拟滚动。JS 只解析静态字符串，不执行脚本；动态生成的 symbol 不支持导入。

所有 SVG 写入经过服务端静态元素/属性校验，拒绝脚本、事件、外部引用、动态元素及不完整结构，预览另经浏览器端清洗。复杂 SVG 的不支持元素会被拒绝，请先转换为静态路径。单文件上传上限 20 MB、单图标 SVG 上限 2 MB、每批最多 2000 个图标；ZIP 限制实际解压大小（单文件 20 MB、总计 40 MB），拒绝路径穿越和加密 ZIP。

项目和购物车图标矩阵均使用普通滚动，完整渲染全部图标，不使用虚拟列表。SVG 安全清洗使用有界缓存，卡片采用独立 memo 更新。工作区通过 `?view=workspace` 请求精简字段，原有 API 默认响应不变。

项目卡片点击即可选中，支持 Shift 连选、拖动框选，以及 Ctrl/Cmd/Shift 加选框选。图标代码合并到复制按钮中。右键卡片或点击更多菜单可以编辑、克隆、重命名代码和删除；克隆保留 SVG 与颜色，生成独立的 slug 和 codepoint，删除需要确认。编辑和重命名保存后仅更新对应图标，不重新加载整个矩阵。

## Docker 一键部署

```text
docker compose up -d --build
```

数据持久化在 `iconfamily-data` 卷中，访问 `http://localhost:3000`。

## 功能说明

- 图标商店仅搜索和加入购物车，颜色使用“全部 / 单色 / 多色”按钮组，结果显示“已在购物车”。
- 购物车按用户隔离，加入时保存完整且经过清洗的 SVG；重新打开、刷新页面或重启服务后直接读取数据库，不重新查询 iconfont。SQLite 自动创建 `cart_items` 表，文件存储模式同样兼容。
- 购物车抽屉支持选择图标、移除选中和选择多个目标项目。所有目标项目权限先统一校验；图标成功添加或已存在于全部目标项目后才移出购物车。部分失败会保留该图标，允许重试，已成功的项目会自动跳过重复项。
- `npm run test:server` 验证两种存储方式的购物车持久化、用户隔离、权限和失败重试；`npm test` 同时运行后端与浏览器回归。

- 项目管理入口在左侧项目列表，不设置独立的项目管理页。
- iconfont 搜索通过后端代理 `POST https://www.iconfont.cn/api/icon/search.json`，避免浏览器跨域并统一清洗导入内容。
- 生成的 `iconfont.js` 是 SVG Symbol Sprite 格式，图标 ID 默认是 `项目此前缀-图标 slug`。
- 公开 JS 地址为 `GET /api/projects/{projectId}/javascript`，无需登录或 Token；它会复用与当前项目 revision 一致的构建产物，缺失或过期时自动构建后返回最新文件。下载和复制链接均原样使用项目设置的 JS 文件名，例如 `abc.js`，不拼接前缀；留空使用 `iconfont.js`。旧 `/iconfont.js` 公开地址已停用，请更新引用。
- 管理员可在项目设置中指定协作者，或开启“所有人可修改”策略，自动涵盖现有及未来新增的登录用户，不修改逐人授权名单。协作者可查看项目、导入与编辑图标及生成产物，但不可修改项目设置。只有管理员可更改授权策略，只有管理员或创建者可修改项目设置、删除项目。Codepoint 起始值和 em 尺寸已从界面隐藏，内部配置保留。API Token 创建入口及接口已停用。
- SVG 只允许安全的矢量内容；脚本、外链资源和 `foreignObject` 会被清除。
- 项目设置中保存一个 viewport 边距（默认 `100`）；新导入或从 iconfont 添加的图标会自动按该边距等比缩放并居中。管理员或创建者批量调整边距时同时更新项目默认值，协作者操作仅修改图标。
- 升级后首次打开项目会自动修复旧版 iconfont 弧线路径造成的异常缩放/偏移，并清理导入名称中的项目名前缀。

iconfont 搜索界面会把关键词、排序、页码、每页数量、类型、集合和颜色筛选转为上游的 `application/x-www-form-urlencoded` 请求；`t` 由服务端实时生成，`ctoken` 默认按匿名搜索处理。
