# dsh-file-annotations 契约取证笔记

本文保留早期版本的取证现场与行号，非当前实现说明。0.4.0 的待发送列表、原生引用 codec 与提交确认行为见 `usage-zh.md`；原 overlay 桥不再承担批量发送。

只读取证。证据源两处，下文缩写：

- **CORE** = `<DSH 安装目录>/node_modules/@deepseek-ai/`
- **PROFILE** = `~/.dsh/profiles/desktop/node_modules/`

版本：`@deepseek-ai/dsh-*` 均为 `0.2.0-rc.2`；`dsh-context` v0.78.0。

> 标注约定：**[已核实]** = 在 `README.zh.md` 或 `lib/types/*.d.ts` / `lib/*.js` 产物里直接读到；
> **[未找到]** = 两处证据源里都没有的，不猜。

---

## 1. `ctx.sidebarRightTabs.register(...)` 的参数与语义

### 结论 **[已核实]**

`register(definition)` 是**两阶段注册的第一阶段**：纯静态声明，无运行时钩子，返回 disposer。两阶段都必须放进自己的 `ctx.effect`（随插件卸载一起销毁）。

定义对象字段（`SidebarRightTabDefinition`）：

| 字段 | 必填 | 语义 |
|---|---|---|
| `id` | ✅ | 这个**实现**在 tab 系统里的身份，全局唯一。第二次注册同一 `id` 会 **throw**。它同时是第二阶段 body/title 两个 keyed seat 的 `key`。 |
| `kind` | ✅ | 类型判别式；`openTab(kind)` 用它命名页。同一个 `kind` 最多一份 `builtin` + 一份 `extension`（extension 生效），其它撞名 throw。 |
| `multiple` | ❌ | 默认 false。true 时「每次打开都获得独立内容地址」，每个格内不再去重（终端类用）。 |
| `keepMounted` | ❌ | 默认 false。true 时已访问正文在切 tab / 切 Session / 收起 / 停靠切换期间保留；未访问的不提前挂载。 |
| `patterns` | ❌ | **资源类型**给 glob；**页类型必须省略**。含 `:` 的匹配整个地址（`dsh-resource://file/**`）；不含的匹配 URI path 任意深度（`*.md`），忽略大小写、不隐藏 dotfile；非 URI 地址不匹配。 |
| `priority` | ❌ | `'extension' \| 'builtin' \| 'fallback'`，**默认 `extension`**（产品外类型最高档）。排序：档位 → 命中 pattern 长度 → 注册顺序。 |
| `canOpen` | ❌ | `(address) => boolean`，同步否决一次 glob 命中；每次路由决策都会跑。 |
| `title` | ✅ | `(address) => string`，tab chip 的文字，**在打开时捕获进布局记录**（不是每帧调用）。页类型收到的是 `sidebar://<kind>`。 |
| `guide` | ❌ | 引导页入口框数组：`{ id, order, title(), description?(), icon?, commandId? }`。省略则不上引导页。 |

**body 与 title 挂载规则**：两者 key 都是 `definition.id`，不是 `kind`。

- body → `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: definition.id }, Body)`
- title → `ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: definition.id }, Title)`（可选；不注册就用打开时捕获的文本）

两个 seat 都是 `kind: 'keyed'; scope: 'session'`，并且都带 `hookContext: TabHookContext` + slot 级 `inject: { hooks: { tabInfo } }`，所以正文组件白拿一个 `useTabInfo` prop。

### 依据

- `CORE/dsh-client-ui-sidebar-right/README.zh.md:81-84`（两阶段、"`id` 是…在全部注册中唯一"、"`id` 同时也是该类型正文与标题注册时用的 key"）
- `CORE/dsh-client-ui-sidebar-right/lib/types/client/tab-registry.d.ts:75-120`（`SidebarRightTabDefinition` 全字段，`:83` id、`:85` kind、`:87` multiple、`:89` keepMounted、`:100` patterns、`:102` priority、`:111` canOpen、`:117` title、`:119` guide）
- 同上 `:44`（`SidebarRightTabPriority` 三档）、`:164`（`register` 返回 disposer、同 id/同 kind 撞名 throw）
- `CORE/dsh-client-ui-sidebar-right/lib/types/client/contract/slots.d.ts:53-58`（`sidebar.right.pane.tab`）、`:67-72`（`...tab.title`）
- 真实注册样例：`CORE/dsh-client-ui-sidebar-files/lib/client.js:996`（type）+ `:1003`（body）+ `:1014`（title）

### 最小样例

```ts
const ID = 'dsh-file-annotations'

// 阶段 1：类型（页类型，不给 patterns）
ctx.effect(
  () => ctx.sidebarRightTabs.register({
    id: ID,
    kind: 'file-annotations',
    priority: 'extension',            // 默认值，写出来只为可读
    keepMounted: true,
    title: () => t('tab.title'),      // 页类型收到 'sidebar://file-annotations'，忽略即可
    guide: [{ id: 'annotations', order: 50, title: () => t('guide.title') }],
  }),
  'file-annotations: type',
)

// 阶段 2：正文 + 标题，key 都是 ID
ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () =>
  ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID, locale: NS }, AnnotationsBody)),
  'file-annotations: body')
ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () =>
  ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: ID }, AnnotationsTitle)),
  'file-annotations: title')
```

---

## 2. 打开 tab 的精确 API：`ctx.sidebarRight` 上有哪些方法

### 结论 **[已核实]**

`ctx.sidebarRight` 是 **per-session 的导航控制器**，只暴露操作，**没有**布局快照 / 操作日志 / 按地址查找。公开面 `ISidebarRight`：

| 方法 | 签名 | 说明 |
|---|---|---|
| `openResource` | `(address: string, options?: SidebarRightOpenResourceOptions) => void` | 打开 `dsh-resource://<type>/…` 资源。无 `options.kind` 时由注册表按 glob+canOpen 排名认领；带 `kind` 时该 kind 生效的类型打开（`canOpen` 仍生效）。地址不在 `dsh-resource://` 下、或无人认领 → **throw**（接线错误）。同一步会展开该列。 |
| `openTab` | `<K extends string>(kind: K, options?: SidebarRightOpenTabOptions<K>) => void` | **按 kind 打开页类型**。未注册的 kind → **throw**。 |
| `close` | `(tabId: TabId) => void` | 关一个 tab；唯一停靠引导页保持打开。 |
| `active` | `() => TabRecord \| undefined` | 活动格的活动 tab。 |
| `isExpanded` / `toggleExpanded` | `() => boolean` / `() => void` | 读写该列展开态（toggle 会记一条历史）。 |
| `focus` | `(tabId: TabId) => void` | 聚焦 tab 及其格。 |
| `split` | `(paneId?: PaneId) => PaneId \| undefined` | 分栏，返回新格 id；做不到返回 undefined 且不记录。 |
| `float` / `dock` | `(tabId, rect?)` / `(paneId)` | 浮出 / 收回。 |
| `mounted` | `ObservableSnapshot<SessionId \| undefined>` | 屏幕上那个 Session；命令都作用于它。 |

**共同 placement options**（`SidebarRightPlacement`）：`paneId`、`preferNewPane`、`revealIfOpened`、`replaceTab: TabId`。

⚠️ 类型上有**两套容易混淆的同名 option**：
- 服务层 `ctx.sidebarRight.openResource / openTab` → `SidebarRightPlacement`，`replaceTab` 是 **`TabId`**（"打开到这个 tab 的位置并关掉它"）。
- tab 级 `tab.actions.openResource / openTab` → `SidebarRightTabPlacement`，`replaceTab` 是 **`boolean`**（"开在本 tab 的位置并关掉本 tab"）。

**页类型 tab 打开时传什么**：只传 `kind` + `options`，**不传 address**。页的内部地址由本包自己拼：`pageAddress(kind) === 'sidebar://<kind>'`，调用方永远看不到也不该拼。

`params` 通道：
- `openResource(address, { params })` → 类型是 `SidebarRightResourceParams`（由拥有该资源类型的包 merge 进 `SidebarRightResourceParamsMap`；`file` 是 `{ line?: number }`）。
- `openTab(kind, { params })` → 类型是 `SidebarRightTabParamsFor<K>`（由页类型自己 merge 进 `SidebarRightTabParamsMap`）。**不 merge 的话这个 kind 只接受 `undefined`。**
- 两者都以 `tab.navigation.params` 抵达正文，运行时不校验（约定 JSON 形状）。

### 依据

- `CORE/dsh-client-ui-sidebar-right/lib/types/client/service.d.ts:138-211`（`ISidebarRight` 全签名）；`:110-122`（`SidebarRightPlacement`）；`:124-129`（`SidebarRightOpenResourceOptions`）；`:131-134`（`SidebarRightOpenTabOptions`）
- `CORE/dsh-client-ui-sidebar-right/lib/types/client/contract/seed.d.ts` — `pageAddress(kind)` + `GUIDE_KIND`（"a caller names the kind and never sees or composes the address"）
- `CORE/dsh-client-ui-sidebar-right/README.zh.md:93`（openResource/openTab 语义、throw 条件、params 定型、`revealIfOpened`）
- `CORE/dsh-client-ui-sidebar-right/README.zh.md:97`（close/active/expand/focus/split/float/dock、命令作用于屏幕上的会话）
- `CORE/dsh-api-workspace-files/lib/types/client/types.d.ts:12-15`（`WorkspaceFileParams { line?: number }`）

### 最小样例

```ts
// A) 打开自己的页类型（推荐入口：右侧栏 tab 的「添加」按钮 → 引导页 → 你的 guide 入口）
ctx.sidebarRight.openTab('file-annotations', {
  params: { path: 'src/a.ts' },   // 需先 declare module 扩 SidebarRightTabParamsMap，否则只能传 undefined
  revealIfOpened: true,           // 页类型只在目标格内去重，这个选项对它无效
})

// B) 打开某个文件到预览（带行号）
ctx.sidebarRight.openResource(address, { params: { line: 96 } })

// C) 打开并替换当前 tab / 优先新格
ctx.sidebarRight.openTab('file-annotations', { replaceTab: someTabId })
ctx.sidebarRight.openTab('files', { preferNewPane: true })
```

---

## 3. tab body 组件拿到的 props / 钩子

### 结论 **[已核实]**

正文组件**不再收到平铺的 owner props**（`sidebar`/`panel`/`tab` 不是 props），而是：
**slot 级 `inject.hooks.tabInfo` 被物化成一个 `useTabInfo` prop**，在组件里调用它。

`useTabInfo()` 返回 `SidebarRightTabInfo`：

```
sidebar: { expanded: boolean, fullscreen: boolean }
panel:   { id: PaneId }
tab:     TabRecord & {
           visible: boolean          // 前台浮窗恒 true；停靠 tab 需展开且选中
           navigation: { address, params, revision }
           signal: AbortSignal       // 只在记录消失或插件卸载时 abort，收起/切会话不 abort
           actions: SidebarRightTabActions
           refreshShortcut?: ShortcutCatalogEntry
         }
```

`tab.actions` 四个方法（都作用于**自己所在的会话**，不是屏幕上的会话）：

- `bindCommands({ refresh? }) => () => void` — 绑页操作，返回的 disposer 不能摘掉更新一代正文的注册。
- `openResource(address, options?)`、`openTab(kind, options?)` — 从本 tab 出发的导航。
- `close()`。

**tab 级 store 要点**：注册时 `store: createXxxStore`（独占 factory，框架按 entry × scope 每格铸一个），组件从 props 拿 `useStore(selector)` + `actions`（烘焙好的写回调，**没有** `update`/`set`）。**不要**在组件里手写订阅；`useTabInfo` 已经组合了框架绑定的 store 与导航 hook。

`useTabInfo` 在 `layout.tabs[tabId]` 或 `navigation` 缺失时**直接 throw**（"not committed in session"），所以别在 effect 之外提前调用。

### 依据

- `CORE/dsh-client-ui-sidebar-right/lib/types/client/contract/slots.d.ts:169-191`（`SidebarRightTabInfo` 全字段）；`:142-167`（`SidebarRightTabActions`）；`:198-202`（`SidebarRightTabInjected.hooks.tabInfo`）
- `CORE/dsh-client-ui-sidebar-right/lib/types/client/tab-info.d.ts:8-18`（`TabHookContext`：`shortcuts/tabId/title/fullscreen/active/signal/actions/useStore/useTabNavigation`）、`:25`（`tabInfoFactory`）
- 实现：`CORE/dsh-client-ui-sidebar-right/lib/client.js:8964`（`tabInfoFactory` → 返回 `{sidebar,panel,tab}`、缺失即 throw）
- `CORE/dsh-client-ui-sidebar-right/README.zh.md:84`（"这些字段不再作为平铺 owner props 传入；类型自己的 store 仍使用 `useStore`/`actions`"）、`:104`（Tab 域 / `tab.actions` 始终作用于自己的会话）
- `CORE/dsh-client-store/lib/types/contract.d.ts:105,111-114`（`BoundActions` / `PropsStore`）
- `CORE/dsh-client-ui-slots/lib/types/index.d.ts:217-222`（`PropsRuntime` = owner + keyProps + SlotInjectFace + `ScopeStandardProps`）、`:474`（`ComposedProps` 五份 share 的并集）

### 最小样例

```tsx
// 注意：useTabInfo 是 prop（来自 slot 级 inject.hooks.tabInfo），不是 import
const AnnotationsBody = ({ useTabInfo, useStore, actions, sessionId, t, renderSlot }) => {
  const { sidebar, panel, tab } = useTabInfo()
  const { address, params, revision } = tab.navigation
  const notes = useStore((s) => s.byFile[address] ?? EMPTY)

  React.useEffect(() => {
    // revision 变 = 又被导航到一次（params 可能没变）
  }, [revision])

  return React.createElement('div', null,
    `${panel.id} ${sidebar.expanded ? 'open' : 'collapsed'} ${notes.length}`)
}
```

---

## 4. 侧栏作用域能否拿到当前会话的 `inputActions`

### 结论 **[已核实]** —— **能，而且 `conversation.input.overlay` 与侧栏 tab body 拿的是同一个东西**

关键点：`inputActions` **不是通过祖先组件 prop drilling 传下来的**，而是 **`scope: 'session'` 标准 props**，由 Session scope adapter 按 session binding 物化。所以**任何** `scope: 'session'`（或 `'session-maybe'`）的 slot 组件都能拿到，与它渲染在哪个 DOM 子树无关。

链路：

1. conversation 在 apply 里注册贡献：`ctx.uiSession.provide({ hooks: ['conversation','input'], props: ['inputActions'], resolve(binding) { ... return { props: { inputActions: shell.actions } } } })`。
2. `dsh-client-ui-session` 的 `UiSession.provide(descriptor)` 收下它，per binding 解析。
3. slots 的 `PropsRuntime` = `OwnerOf & KeyPropsOf & SlotInjectFace & ScopeStandardProps<ScopeOf<K>>`；`ScopeStandardProps<'session'>` = `SessionStandardProps & GlobalStandardProps`。
4. `SessionStandardProps` 由 conversation 与 ui-session 两边 `declare module` merge：`useSession / sessionId / useProjection / useConversation / useInput / inputActions`。

**可得 `inputActions` 的 slot（`scope: 'session'`，全部可得）**：`conversation.input.dock`、`conversation.input.overlay`、`conversation.composer.dock`、`conversation.input.left`、`conversation.input.right`、`conversation.input.activity`、`conversation.input.plan`、`conversation.input.permission`、`conversation.input.model`；以及 `scope: 'session-maybe'` 的 `conversation.composer.bar`、`conversation.input.attachments`（值为 `InputActions | undefined`）。

**侧栏 tab body 拿得到**：`sidebar.right.pane.tab` 与 `sidebar.right.pane.tab.title` 都是 `scope: 'session'` → 组件 props 里有 `inputActions`。`sidebar.right.tab.document.actions` / `.files.actions` / `.document.unpreviewable` 也都是 `scope: 'session'` → 同样拿得到。

**两个必须注意的语义**：

- `inputActions` 是**属于该 slot 的 session binding**，不是「屏幕上的会话」。侧栏按会话分视图（每个 View 有自己的 Session reference），所以侧栏里写进输入框的是**那个 tab 所属会话**的输入框 —— 正是批注插件需要的。
- 依赖 `dsh-client-ui-conversation` 已加载（desktop profile 里是核心常驻插件）。它是 `props` roster 的提供者，卸载就没了。

`InputActions` 面（`CORE/dsh-client-ui-conversation/lib/types/client/contract/input.d.ts:206-226`）：
`captureInsertion() → TokenSpan`、`insertText(text, span) → boolean`、`setDraft(text)`、`addAttachments(ids)`、`removeAttachment(id)`、`pruneAttachments(ids)`、`submit()`。

> 批注汇总成 prompt 的推荐写法：`const span = inputActions.captureInsertion(); inputActions.insertText(prompt, span)`，`false` 表示草稿已变/编辑器被锁，需要重取 span。**不要**用 `setDraft` 覆盖用户已有草稿。

### 依据

- `CORE/dsh-client-ui-conversation/README.zh.md:14`（"通过 `ctx.uiSession` 提供 `useConversation`、`useInput` 和 `inputActions` 标准 props"）、`:63`（"`ctx.uiSession.provide()` … 并将 `inputActions` 作为稳定标准 prop 提供"）
- 真实调用：`CORE/dsh-client-ui-conversation/lib/client.js:18126-18142`（`ctx.uiSession.provide({ hooks:['conversation','input'], props:['inputActions'], resolve })`）
- `CORE/dsh-client-ui-session/lib/types/client/index.d.ts:162`（`provide(descriptor): () => void`）
- `CORE/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:332-350`（`SessionStandardProps` / `SessionMaybeStandardProps` 里 `inputActions`）
- `CORE/dsh-client-ui-slots/lib/types/index.d.ts:217`（`ScopeStandardProps`）、`:222`（`PropsRuntime`）、`:474`（`ComposedProps`）
- `CORE/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:214-284`（`conversation.input.*` 全部 `scope: 'session'`；`:220` 是 `conversation.input.overlay`）
- `CORE/dsh-client-ui-conversation/lib/types/client/contract/input.d.ts:206-226`（`InputActions`）
- 侧栏 seat 的 scope：`CORE/dsh-client-ui-sidebar-right/lib/types/client/contract/slots.d.ts:53-58`（`scope: 'session'`）

### 最小样例

```tsx
// 侧栏 tab body 里直接写进「这个 tab 所属会话」的输入框
const emitPrompt = (inputActions, promptText) => {
  const span = inputActions.captureInsertion()
  if (!inputActions.insertText(promptText, span)) {
    // 草稿在捕获后被改过 / 编辑器被提交锁住：重取再试一次
    return inputActions.insertText(promptText, inputActions.captureInsertion())
  }
  return true
}
```

---

## 5. 文件预览头部的插槽 `sidebar.right.tab.document.actions` / `.files.actions`

### 结论 **[已核实]**

两个都是 **`kind: 'list'` + `scope: 'session'`** 的子 slot，由**父组件在 renderSlot 里渲染**（不是全局固定位置），owner prop 只有一个 `absolutePath: string`。

| slot | 声明位置 | owner props | 渲染位置 |
|---|---|---|---|
| `sidebar.right.tab.document.actions` | documentpreview | `{ absolutePath: string }` — 文件在**执行环境**里的绝对路径（native 动作必须再验一次 Host 映射） | 每个「显示头部」的状态里，在头部自有控件**之后**；需要文件元数据已报出 Host 路径。 |
| `sidebar.right.tab.document.unpreviewable` | documentpreview | `{ absolutePath: string }` | 「不支持预览」空态、以及可读但本预览渲染不了（`not-text`/`too-large`）的空态里，占据 Retry 的位置。 |
| `sidebar.right.tab.files.actions` | sidebar-files | `{ absolutePath: string }` — 文件树当前显示的**根目录** | 文件树头部右侧、重新读取控件之后。 |

**session 作用域限制**：三者都是 `scope: 'session'`，所以：

- 只在**有 Session binding** 的侧栏 seat 子树内存在；hero 画面 / 无选中会话时不会渲染（侧栏本身也「没有会话就没有停靠面」）。
- 组件 props 里同时有 `sessionId`、`useSession`、`useProjection`，以及第 4 条的 `inputActions`。

**注册写法要点**：

- list slot 必须给 `id`（缺 `id` throw），`order` 决定同格内顺序。
- 必须用 `ctx.slots.inject(name, cb)` 包一层：父组件（`TextPreview` / `FilesBody`）自己声明 `children` 并 `renderSlot`，声明存在前注册会失败；`inject` 会在声明出现后（或立即）跑回调。
- 组件的 props 类型直接用 `PropsRuntime<'sidebar.right.tab.document.actions'> & ...`，owner share 会自动带上 `absolutePath`。

### 依据

- `CORE/dsh-client-ui-sidebar-documentpreview/lib/types/client/document/contract.d.ts:60-76`（`sidebar.right.tab.document.actions`：`kind:'list'; scope:'session'; owner:{absolutePath:string}`）、`:77-88`（`.unpreviewable`，同样 owner）
- `CORE/dsh-client-ui-sidebar-files/lib/types/client/index.d.ts:5-19`（`sidebar.right.tab.files.actions`，`:9` 起）
- 父声明确认：`CORE/dsh-client-ui-sidebar-documentpreview/lib/client.js:6822-6850`（`children: { 'sidebar.right.tab.document.actions': {kind:'list',scope:'session'}, ... }`）；`CORE/dsh-client-ui-sidebar-files/lib/client.js:1003-1013`
- `CORE/dsh-client-ui-sidebar-documentpreview/lib/types/client/TextPreview.d.ts:16`（`PropsRenderSlots<... 'sidebar.right.tab.document.actions' ...>`）
- 真实占用者：`CORE/dsh-client-ui-open-in-app/lib/types/client/OpenPathAction.d.ts:17`（`PropsRuntime<'sidebar.right.tab.document.actions'> & PropsLocale<...> & InjectFace<...>`）、`:19`（从 props 里取 `absolutePath`）
- `CORE/dsh-client-ui-sidebar-documentpreview/README.zh.md:32`（"两个 Session 作用域的 list 子 slot … owner prop 为 `absolutePath`"）
- `CORE/dsh-client-ui-sidebar-files/README.zh.md:30`（"Session 作用域的 `sidebar.right.tab.files.actions` 列表 … 通过 `absolutePath` 传入当前显示的根目录"）

### 最小样例

```ts
// 在预览头部加一个「加批注」按钮
ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document.actions', () =>
  ctx.slots.register(
    { name: 'sidebar.right.tab.document.actions', id: 'dsh-file-annotations:add', order: 100 },
    ({ absolutePath, sessionId }) => React.createElement(AddAnnotationButton, { absolutePath, sessionId }),
  )), 'file-annotations: document action')

// 文件树头部（拿到的是目录）
ctx.effect(() => ctx.slots.inject('sidebar.right.tab.files.actions', () =>
  ctx.slots.register(
    { name: 'sidebar.right.tab.files.actions', id: 'dsh-file-annotations:tree', order: 100 },
    ({ absolutePath }) => React.createElement(TreeAction, { absolutePath }),
  )), 'file-annotations: files action')
```

---

## 6. 打开文件到预览的 address 格式

### 结论 **[已核实]**

生成函数是 `fileAddressFor(sessionId, cwd, path)`，在 **`@deepseek-ai/dsh-util-workspace-path`**（browser-safe，`main: lib/index.js`，无客户端子路径，直接 `import` 根出口）。同一包还有更底层的 `sessionFileAddress(sessionId, path)` 和 `absoluteFileAddress(path)`。

地址文法（两种 scope）：

- `dsh-resource://file/session/<sessionId>/<path>` — path **相对该 Session 的 workspace 根或绝对**；Host 用自己持有的 root 解析。`fileAddressFor` 的行为就是：相对路径直接用；绝对路径若在 `cwd` 之内 → 剥掉 root 前缀变成相对；不在 `cwd` 内或 `cwd` 未知 → 保持绝对（仍在 session scope 里）。
- `dsh-resource://file/absolute/<path>` — 绝对路径，去掉前导 `/`；不带 Session。

**编码**：每个 id / path segment 都 `encodeURIComponent`，但 `%3A` 被还原成字面 `:`（为了 Windows 盘符）。所以 `#`、`?`、空格都能往返，`: `保持原样。

`openResource` 精确签名：

```ts
openResource(address: string, options?: {
  kind?: string                      // 跳过 glob 排名，指定生效类型；canOpen 仍生效
  params?: SidebarRightResourceParams // file → { line?: number }（1-based）
  paneId?: PaneId
  preferNewPane?: boolean
  revealIfOpened?: boolean           // 默认 true：已有同 (kind, contentId) 资源 tab 就聚焦
  replaceTab?: TabId                 // 注意与原 tab 同格同位，并在同一步关掉它
}): void
```

类型来源：`file` 的 params 由 `dsh-client-ui-sidebar-documentpreview` merge 进 `SidebarRightResourceParamsMap`（值就是 `WorkspaceFileParams`）。

### 依据

- `CORE/dsh-util-workspace-path/lib/types/file-address.d.ts` — `FileAddress` 联合、`sessionFileAddress`、`absoluteFileAddress`、`parseFileAddress`（文首 module doc 逐条描述两种 scope 与编码规则）
- `CORE/dsh-util-workspace-path/lib/types/index.d.ts` — `fileAddressFor(sessionId, cwd, path): string` doc（"a relative path, or an absolute path inside the Session's workspace, becomes a `session`-scoped address"）
- 实现：`CORE/dsh-util-workspace-path/lib/index.js:12`（`encodeSegment`，`%3A` → `:`）、`:22-25`（`sessionFileAddress`）、`:34`（`absoluteFileAddress`）、`:169-176`（`fileAddressFor`）
- `CORE/dsh-api-workspace-files/lib/types/client/types.d.ts:12-15`（`WorkspaceFileParams`）
- `CORE/dsh-client-ui-sidebar-documentpreview/lib/types/client/index.d.ts:30-33`（`declare module .../client { interface SidebarRightResourceParamsMap { file: WorkspaceFileParams } }`）
- `CORE/dsh-client-ui-sidebar-right/lib/types/client/service.d.ts:124-129`（options）、`:161`（`openResource` 签名）
- 真实调用：`CORE/dsh-client-ui-sidebar-right/README.zh.md:93`（`openResource(fileAddress, { params: { line } })`）

### 最小样例

```ts
import { fileAddressFor, parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'

const cwd = ctx.sessions.get(sessionId)?.header.cwd       // 或走 sessionQuery，见第 9 条
const address = fileAddressFor(sessionId, cwd, 'src/a.ts')
// → 'dsh-resource://file/session/<sessionId>/src/a.ts'
//   cwd=/repo 且传 /repo/src/a.ts 时同样收敛成相对形式

parseFileAddress(address)   // → { scope:'session', sessionId, path:'src/a.ts' } | undefined

ctx.sidebarRight.openResource(address, { params: { line: 96 } })
```

---

## 7. 客户端插槽注册 API 的形状

### 结论 **[已核实]**

`ctx.slots` 是 `SlotRegistry extends Service`（ui-renderer 提供）。两个 API 不是替代关系，**职责不同**：

| API | 签名 | 语义 |
|---|---|---|
| `ctx.slots.register` | `register(options, Component) => () => void` | **贡献一个 entry**。options：`{ name, children?, store?, locale?, registrant?, inject? } & KindOptions`。按 slot 的 kind 决定必填字段：**keyed → `key`**；**list → `id`（+ `order`/`label`/`priority`）**；**chain → `select`**；**single → 只有 `priority`**。缺必填字段在注册时 throw。返回幂等 disposer；disposer 同时递归收掉它声明的 `children`。 |
| `ctx.slots.inject` | `inject(key, callback) => () => void` | **等某个 slot 被声明出来再跑回调**。声明已存在 → 回调立即同步执行；否则在声明者的 `register()` 提交后执行。回调返回一个 disposer 或 disposer 可迭代对象；声明折叠时先 dispose，再声明时重跑。回调属于调用者 fiber，插件卸载会取消等待并移除贡献。 |

**为什么两个都要**：`register` 到一个尚未被声明的 slot 会 **throw**（"registering into an undeclared slot throws"）。子 slot 的声明权在父组件（`children` 里的那一家），而父组件属于另一个包、加载顺序不确定 —— 所以**跨包注册子 slot 一律用 `ctx.slots.inject` 包一层**。核心包自己也是这么写的（见下例）。

**差异补充**：
- `register({name, key})` 是 keyed slot 的写法；**同一个 key + 同一个 priority（默认 0）再注册一次会 throw**，用 `priority` 做 shadowing（升序，低者渲染）。
- `inject` 的 `key` 必须是 `keyof SlotMap`，所以 slot 必须已被某个包 `declare module` 过（否则 TS 报错）—— 这也意味着你几乎总要 `import` 拥有该 slot 的包的类型。
- `register` 会经过 `ctx.effect` 由 Cordis proxy 绑定到**调用者**的 fiber（它刻意保持 prototype 方法，不用箭头函数），所以直接调用即可，不必自己再包 `ctx.effect`；但核心包普遍写成 `ctx.effect(() => ctx.slots.register(...), 'label')` 以便带诊断 label。

### 依据

- `CORE/dsh-client-ui-renderer/lib/types/client/registry.d.ts:46`（`class SlotRegistry extends Service`）、`:93-96`（`register` 刻意是 prototype 方法、经 caller ctx.effect 释放）、`:111-124`（`register` 的完整 doc：payload 校验、kind 约束、shadowing、disposer 递归收 children）
- 同上 `:125-135`（`inject(key, callback): () => void` 的完整 doc：已声明则同步跑、折叠重跑、fiber 归属）
- `CORE/dsh-client-ui-slots/lib/types/index.d.ts:560-577`（`KindOptions`：keyed `key` / list `id,order,label` / chain `select` / 其它 `priority`）、`:789` 与 `:802`（两个 `register` 重载：无 inject / 有 inject）、`:590-606`（`BaseOptions`）
- `CORE/dsh-client-ui-slots/lib/types/index.d.ts:774-785`（doc："keyed — missing `key` throws; list — missing `id` throws; chain — missing `select` throws"；"a second registration at an occupied cell's exact priority … throws"）
- 核心包的真实写法：`CORE/dsh-client-ui-sidebar-documentpreview/lib/client.js:6822`、`CORE/dsh-client-ui-sidebar-files/lib/client.js:1003`（都是 `ctx.effect(() => ctx.slots.inject(key, () => ctx.slots.register({...}, C)))`）
- 官方示例（copy session id 菜单项）：`CORE/dsh-client-ui-workspace/lib/types/client/contract/slots.d.ts:148-168`

### 最小样例

```ts
// 注册到自己的 slot（父组件就是自己）—— 直接 register
ctx.slots.register({ name: 'main.conversation', children: { 'conversation.header': { kind:'single', scope:'session-maybe' } } }, Root)

// 注册到别人声明的子 slot —— 必须 inject 包一层
ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document.actions', () =>
  ctx.slots.register(
    { name: 'sidebar.right.tab.document.actions', id: 'dsh-file-annotations:add', order: 100 },
    AddButton)), 'label')

// keyed slot：key 是 dispatch key（这里 = 你的 tab type id）
ctx.slots.register({ name: 'sidebar.right.pane.tab', key: ID, locale: NS, store }, Body)
```

---

## 8. 插件 host 半注册 HTTP 路由的真实写法

### 结论 **[已核实 + 一处重要澄清]**

`dsh-context` 里的 `G(ctx, connection, '/api/xxx', handler, label)` **不是任何包导出的公共辅助函数** **[未找到]**。它是 `dsh-context` 自己 bundle 里的**本地私有 helper**（单字母名，esbuild 产物），定义在同一文件里：

```js
// PROFILE/dsh-context/lib/index.js:14（本地私有，未导出）
function jn(e){ return typeof e?.fetch?.register === 'function' ? e.fetch.register.bind(e.fetch) : void 0 }
function G(e,t,n,r,i){
  let a = jn(t);
  if (a === void 0) return false;
  try { e.effect(() => a({ path: n, methods: ['POST'], requestBody: 'buffered', fetch: r }), i) } catch { return false }
  return true;
}
```

展开后它做的就是三件事：`connection.fetch.register(route)` + `ctx.effect(...)` + 一个 label。**真正可用的公共 API 是 `ctx.connection.fetch.register`**，来自 `@deepseek-ai/dsh-client-connection` 的 host 面 `HostConnectionHandle`。

**host 半最小可用样例**（等价于 `G`，但不依赖任何私有 helper）：

```ts
const inject = { required: ['connection'] }

function apply(ctx) {
  ctx.inject(['connection'], (c) => {
    const conn = c.get('connection')
    if (typeof conn?.fetch?.register !== 'function') return

    c.effect(() => conn.fetch.register({
      path: '/api/dsh-file-annotations/notes',  // 绝对路径，位于 /api 之下
      methods: ['POST'],
      requestBody: 'buffered',                  // 'buffered' | 'streaming'
      fetch: async (request) => Response.json(
        { ok: true, value: null },
        { headers: { 'cache-control': 'no-store' } }),
    }), 'dsh-file-annotations: notes route')
  })
}
```

**client 半怎么调**：核心包和 dsh-context 都是**用全局 `fetch` + 相对 URL**，不是 `ctx.connection` 的 rpc 方法（`ClientConnectionRpc.call(channel, endpoint, payload)` 是走逻辑 RPC 通道的另一条路，`/api` 的 exact fetch route 不走它）。

```js
// PROFILE/dsh-context/lib/client.js:28 的真实写法
const res = await fetch('api/dsh-context/balance', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  // body: JSON.stringify({...})
})
```

注意两边拼写不对称：host 注册 `path: '/api/…'`（绝对），client 用 `'api/…'`（相对，随应用部署前缀解析）。

### 依据

- `PROFILE/dsh-context/lib/index.js:14` — `G` = `function G(e,t,n,r,i)`，`jn` = `e.fetch.register.bind(e.fetch)`（全文件共 15 行，这是压缩产物的单行；此处只引这一句）
- `CORE/dsh-client-connection/lib/types/rpc.d.ts:110-120`（`ConnectionFetchRoute`：`path` / `methods` / `requestBody` / `fetch`）、`:121-129`（`HostConnectionFetch.register(route): Promise<() => Promise<void>>`）、`:148-155`（`HostConnectionHandle { rpc, fetch, operator }`）
- 核心包同样写法：`CORE/dsh-api-session-controller/lib/index.js:2396`、`CORE/dsh-client-file-upload/lib/index.js:171`、`CORE/dsh-client-ui-deliverables/lib/index.js:49`（均为 `ctx.effect(() => ctx.connection.fetch.register({...}))`）
- client 侧：`PROFILE/dsh-context/lib/client.js:28`（相对 URL `fetch('api/dsh-context/balance', { method:'POST' })`）
- 逻辑 RPC 是另一条路：`CORE/dsh-client-connection/lib/types/rpc.d.ts:209-232`（`ClientConnectionRpc.call/open`，channel 如 `/api` + endpoint 如 `goals/create`）

---

## 9. host 半取会话工作目录（cwd）

### 结论 **[已核实]** —— dsh-context 的 `Ai(e, t)` 就是这个模式的教科书实现

两条路，按代价从低到高：

**A) 便宜路径（会话活着）**：`ctx.sessions.get(sessionId)?.header.cwd`

- `Sessions.get(id)` 只查 live session，非 live 返回 `undefined`。
- `Session.header.cwd` 是**创建时**的绝对工作目录（`readonly cwd?: string`，可能缺）。

**B) 通用路径（活的或落盘的都行）**：`sessionQuery.observeSession(sessionId, { projectionMode:'none' })`，取 `observation.header.cwd`，**必须 dispose**。

`observeSession` 返回的是 **caller-owned observation lease**（`SessionObservation extends Disposable`），不 dispose 会一直 pin 住这次 cut。dsh-context 的写法是包一个 `Ai()`：

```js
// PROFILE/dsh-context/lib/index.js:15（本地私有函数，非导出）
async function Ai(ctx, sessionId) {
  if (sessionId === undefined) return {}
  const sq = ctx.get('sessionQuery')
  if (typeof sq?.observeSession !== 'function') return {}
  let obs
  try { obs = await sq.observeSession.call(sq, sessionId) } catch { return {} }
  try {
    const o = obs
    const cwd = nonEmpty(o?.header?.cwd)
    const agentPreset = nonEmpty(o?.projections?.values?.agentPreset)
    return { ...(cwd === undefined ? {} : { cwd }), ...(agentPreset === undefined ? {} : { agentPreset }) }
  } finally { await disposeQuietly(obs) }   // 先 asyncDispose，退到 dispose
}
```

`sessionQuery` 服务类型是 `SessionQueryEngine`（抽象类，`ctx.sessionQuery`）：`observeSession(sessionId, options?)` / `listSessions(signal?)` / `searchSessions` / `searchEvents` / `read` 等。这一整套都是 **host 半**（server 侧）服务，浏览器侧没有 `sessionQuery`。

### 依据

- `PROFILE/dsh-context/lib/index.js:15` — `async function Ai(e,t)`，`n.observeSession.call(n, t)` → `header.cwd`，`finally { await Oi(r) }`（`Oi` = 先 `Symbol.asyncDispose` 再 `Symbol.dispose`）
- 同文件 `:14` — `Fr()` 里 `ctx.get('sessions')` 的 `get` 用法 + `sessionProjections.stateOf`
- `CORE/dsh-session-query/lib/types/index.d.ts:31-47`（`SessionQueryEngine` + `observeSession(sessionId, options?): Promise<SessionObservation>`，doc 明写 "caller-owned observation lease"）、`:48-72`（`listSessions` 等）
- `CORE/dsh-session-query/lib/types/observation.d.ts:7-31`（`SessionObservation extends Disposable`，含 `header` / `events` / `cursor` / `projections`，`:26-30` `retain()`）、`:33-38`（`SessionObservationOptions { signal?, projectionMode?: 'all'|'none' }`）
- `CORE/dsh-session/lib/types/index.d.ts:443-447`（`get(id: SessionId): Session | undefined`，doc "Look up a live session"）、`:119`（`readonly header: SessionHeader`）
- `CORE/dsh-session/lib/types/types.d.ts:59-70`（`SessionHeader.cwd?: string`，doc "Absolute working directory the session was created in (if any)"）

### 最小样例

```ts
// host 半
async function cwdOf(ctx, sessionId) {
  // A) 便宜路径
  const live = ctx.sessions.get(sessionId)
  if (live?.header.cwd) return live.header.cwd

  // B) 通用路径
  const sq = ctx.get('sessionQuery')
  if (typeof sq?.observeSession !== 'function') return undefined
  let obs
  try { obs = await sq.observeSession(sessionId, { projectionMode: 'none' }) } catch { return undefined }
  try { return obs.header.cwd || undefined }
  finally {
    if (typeof obs?.[Symbol.asyncDispose] === 'function') await obs[Symbol.asyncDispose]()
    else obs?.[Symbol.dispose]?.()
  }
}
```

---

## 附：把握程度汇总

| # | 主题 | 把握 |
|---|---|---|
| 1 | `sidebarRightTabs.register` 参数与两阶段 seat key | **有把握**（README + d.ts + 两个包的真实注册代码互相印证） |
| 2 | `ctx.sidebarRight` 方法面、`openTab` 传 kind 不传 address | **有把握**（`ISidebarRight` 全签名 + `pageAddress` + README） |
| 3 | `useTabInfo()` 字段、`tab.actions`、tab 级 store | **有把握**（d.ts + `tabInfoFactory` 实现对照） |
| 4 | 侧栏会话作用域能拿 `inputActions` | **有把握**（`uiSession.provide` 真实调用 + `ScopeStandardProps` 组合链 + README 明写） |
| 5 | 预览/文件树头部 actions 子 slot + owner props | **有把握**（slot 声明 + 父组件 `children` 声明 + open-in-app 真实占用者） |
| 6 | `fileAddressFor` 与 `openResource(...,{params:{line}})` | **有把握**（文法 doc + 实现逐行 + params map merge） |
| 7 | `slots.inject` vs `slots.register` | **有把握**（两份 doc 都在 d.ts 里，且有触发 throw 的失败条件说明） |
| 8 | host 半 HTTP 路由 | **有把握**（`ctx.connection.fetch.register` 是公共面）；**`G` 本身「未找到」公共导出** —— 它是 dsh-context 的本地私有 helper，照抄等价实现即可 |
| 9 | host 半取 cwd | **有把握**（`Ai()` 原文 + `observeSession`/`Sessions.get` 类型定义） |

**唯一需要留心的一处**：第 8 条里 `G` 不是公共 API。任何"直接 import 一个 registerRoute helper"的想法都会失败——公共面只有 `ctx.connection.fetch.register`，务必自己包 `ctx.effect`。

---

# §10 实现复核

复核对象（只读，未改动任何代码）：
`lib/client.js`（1140 行）、`index.mjs`（279 行）、`package.json`、`cordis.patch.yml`、`test/*.mjs`。
自测实跑：`node --test test/verify.mjs` → **26 pass / 0 fail**；`node --test test/host.test.mjs` → **12 pass / 0 fail**。

**结论：没有任何会 throw 的契约错误。注册形状、props 来源、HTTP 双半拼写与鉴权全部与核心契约一致。有 4 处需要改，全部是行为正确性 / 健壮性问题，不是契约违反。**

---

## 10.1 §5 + §7：插槽注册形状 —— **一致**

### ✅ 三个注册点全部正确（list 用 `id`，没有误用 keyed）

`lib/client.js:1083-1091` 三个注册的目标 slot 全是 `kind: 'list'`：

| 注册点 | slot | 核心声明 | 必填字段 | 判定 |
|---|---|---|---|---|
| `client.js:1083-1085` | `conversation.input.overlay` | `kind:'list'; scope:'session'` — `CORE/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:220-223` | `id`（+`order`/`label`） | ✅ 用 `id` 正确 |
| `client.js:1086-1088` | `sidebar.right.tab.files.actions` | `kind:'list'; scope:'session'` — `CORE/dsh-client-ui-sidebar-files/lib/types/client/index.d.ts:9-18` | `id` | ✅ 正确 |
| `client.js:1089-1091` | `sidebar.right.tab.document.actions` | `kind:'list'; scope:'session'` — `CORE/dsh-client-ui-sidebar-documentpreview/lib/types/client/document/contract.d.ts:67-76` | `id` | ✅ 正确 |

**keyed seat 没有误用** —— 本插件一个 keyed / chain 注册都没有。三处若写成 `{name, key}` 反而会 throw（list 槽的必需字段是 `id`，`key` 不属于 list 的 `KindOptions`）；若写 `select` 同样 throw。当前写法与 `SlotCore` 的 kind 约束完全吻合（约束原文：`CORE/dsh-client-ui-slots/lib/types/index.d.ts:774-785`，"keyed — missing `key` throws; list — missing `id` throws; chain — missing `select` throws"）。

### ✅ `ctx.slots.inject(name, cb)` 包一层是**必需**的，写法正确

三个 slot 的**声明权都在别的包**（files / documentpreview / conversation 的父组件 `children` 里）。按 `SlotRegistry.register` 的语义，"registering into an undeclared slot throws"（`CORE/dsh-client-ui-renderer/lib/types/client/registry.d.ts:111-124`），所以直接 `register` 在加载顺序不利时会抛。用 `inject` 等声明（`registry.d.ts:125-135`：声明已存在则同步跑、否则在声明提交后跑、折叠重跑）是唯一正确写法，和核心包自己的写法一致（`CORE/dsh-client-ui-sidebar-files/lib/client.js:1003`、`.../documentpreview/lib/client.js:6822`）。

`inject` 的 disposer 属于调用者 fiber，插件卸载会取消等待并移除贡献 —— 所以 `client.js:1083/1086/1089` 丢弃返回值**合法**，不会泄漏。

### ✅ 顺带核实：`conversation.input.overlay` 确实会被渲染

`CORE/dsh-client-ui-conversation/lib/client.js:17452` → `children: renderSlot("conversation.input.overlay", {})`（声明在 `:18301`）。owner props 是 `{}`，所以我们的隐藏 `<span>`（`client.js:946-951`）只吃标准 props，挂载点没问题。无 Session 时该槽不渲染 → `pickBridge()` 返回 null → `sendFailed` 文案降级，行为正确。

### 🔸 可选（不是问题）

- `inject` / `register` 都没再包 `ctx.effect(..., label)`。二者本身已 fiber 绑定，**不包也正确**；核心包习惯包一层只为 `getEffects()` 里有可读 label。想要诊断友好可以补，不影响行为。

---

## 10.2 §3 + §4：组件从 props 取的东西 —— **一致**

### ✅ 三个 prop 都是货真价实的标准 / owner props

| 用法 | 位置 | 来源 | 判定 |
|---|---|---|---|
| `props.absolutePath` | `client.js:891`、`:916` | 两个 action slot 的 **owner** prop（documentpreview `contract.d.ts:67-76` / files `index.d.ts:9-18` 都声明 `owner: { absolutePath: string }`） | ✅ |
| `props.sessionId` | `client.js:879/897/922/942/1067` | `SessionStandardProps.sessionId`（`CORE/dsh-client-ui-session/lib/types/client/index.d.ts:111-116`）；两个 action slot 与 overlay 都是**严格 `scope:'session'`** → 一定是 definite string，不会是 undefined | ✅ |
| `props.inputActions` | `client.js:941` | `SessionStandardProps.inputActions`（`CORE/dsh-client-ui-conversation/.../contract/slots.d.ts:332-340`） | ✅ |

### ✅ `useSessions` 在这些 list slot 里**保证存在**，且 shape 用法正确

这不是 `SessionStandardProps`，而是 `GlobalStandardProps`：

- 声明：`CORE/dsh-client-ui-session/lib/types/client/index.d.ts:98-104` → `interface GlobalStandardProps { useSessions; useSessionStatus; useSessionRetainInfo }`
- 组合：`ScopeStandardProps<S> = (S extends 'session' ? SessionStandardProps : …) & GlobalStandardProps`（`CORE/dsh-client-ui-slots/lib/types/index.d.ts:217`）——**`GlobalStandardProps` 对 root / session / session-maybe 三个 scope 都无条件叠加**，`PropsRuntime` 再把它并进 `ComposedProps`（同文件 `:222`、`:474`）。
- 运行时来源：`CORE/dsh-client-ui-session/lib/client.js:469-476` → `ctx.slots.provideRoot({ hooks: { sessions: ctx.sessions.list, sessionStatus }, keyedHooks: { sessionRetainInfo } })`，hook 名 `sessions` 经 `standardHookPropName` 变成 prop `useSessions`。

所以 `client.js:881` 的 `props.useSessions()` 是**合法且有值**的。

shape 也对：`useSessions()` → `SessionListState { ids, byId, phase, projectionsBySession }`，`byId: Record<SessionId, SessionSummary>`（`CORE/dsh-api-session-controller/lib/types/client/sessions/service.d.ts:43-52`），`SessionSummary.cwd?: string`（同文件 `:16-22`）。`client.js:882-883` 的 `state.byId[sessionId].cwd` 完全正确。

### ⚠️ 问题 1（中）：`cwdFromProps` 是**条件调用的 Hook**，且被 `||` 短路

`lib/client.js:877-887` 在普通函数里调 `props.useSessions()`（它是个 hook）。调用点：

- `client.js:892` `var cwd = root || cwdFromProps(props);` ← `absolutePath` 恒有值时**短路，hook 不执行**
- `client.js:917` `var cwd = cwdFromProps(props) || (file ? dirname(file) : null);` ← hook 执行

今天两个守卫（`typeof sessionId === 'string'`、`typeof useSessions === 'function'`）取决于 slot 的静态声明，永远为真，所以**每个组件内 hook 次数稳定、React 不会报错**。但这是"一次 props 变化就会变成 `Rendered more/fewer hooks than expected`"的悬空违约，且 lint 不友好。

**修法**（`lib/client.js:889-917`）：把取值提成一个无条件 hook，放到组件最顶端，再让纯计算走普通函数：

```js
// 组件内，第一行（无条件执行）
function useSessionCwd(props) {
  var sessionId = props && typeof props.sessionId === 'string' ? props.sessionId : null;
  var state = props && typeof props.useSessions === 'function' ? props.useSessions() : null; // ← 恒执行
  var session = state && state.byId && sessionId ? state.byId[sessionId] : null;
  return session && typeof session.cwd === 'string' && session.cwd ? session.cwd : null;
}
// FilesAnnotationsButton / DocumentAnnotationsButton 顶部：
var sessionCwd = useSessionCwd(props);          // 无条件
var cwd = sessionCwd || root || (file ? dirname(file) : null);
```

### ⚠️ 问题 2（中）：cwd 的 fallback 会让两个按钮读写**两个不同的 `.dsh/annotations.json`**

`client.js:892` 用 `absolutePath`（文件树根目录）当 cwd；`client.js:917` 在 `useSessions` 拿不到 cwd 时退回 `dirname(file)`（**文件所在目录**）。`dirname(file)` 对工作区里的文件通常等于工作区根，但对子目录里的文件就是子目录 → 宿主 `index.mjs:65-76` 的 `validateCwd` 只要求"绝对路径 + 存在 + 是目录"，会照写 `<子目录>/.dsh/annotations.json`。于是**文件树按钮和预览头部按钮看到的是两份互不相干的批注**，且批注被写到工作区根之外的位置（甚至是工作区外的目录，如果预览的是外部文件）。

**修法**（`client.js:916-923`）：cwd 只从 **Session 摘要**取，去掉 `dirname(file)` 兜底；拿不到就不显示计数、点按钮只提示"等会话就绪"，不要猜目录。

```js
var file = props && typeof props.absolutePath === 'string' ? props.absolutePath : null;
var cwd = useSessionCwd(props);            // 唯一来源，不再 dirname(file)
var ready = cwd !== null;
```

（若确实想支持"工作区外文件"，应显式把 address 的 `absolute` scope 作为独立模式处理，而不是靠 `dirname` 猜。）

### ⚠️ 问题 3（中）：`view` 是单例全局，`pickBridge()` 会跨会话兜底

- `view.cwd` / `view.sessionId` / `view.file` 是模块级单例（`client.js:183`），由 `client.js:894-898` 和 `919-923` 两个 effect 写，**最后跑的那个生效**。侧栏 `keepMounted` 的正文（`sidebar-right` README:106）意味着后台会话的 tab 可能仍然挂着，但 effect 只在 `[cwd, sessionId]` 变化时跑，切回旧会话时**不会重跑** → `view.sessionId` 可能是上一个会话的。
- `pickBridge()`（`client.js:500-513`）在"有 `view.sessionId` 但没有任何 bridge 匹配"时，**直接返回 `usable[usable.length - 1]`** —— 也就是"随便挑一个会话的输入框"。当前 `conversation.input.overlay` 一般只挂可见会话那一个，所以多半撞对了；但只要同时存在两个 bridge（多窗口 / 未来并发 composer），就可能把批注写进**别的会话**。

**修法**（`client.js:500-513`）：session 明确时不做兜底；同时让 `view.sessionId` 由"当前可见会话"单向派生，而不是由某个组件的 effect 顺手写。

```js
function pickBridge() {
  var usable = bridges.filter(/* … 原过滤 … */);
  if (usable.length === 0) return null;
  if (view.sessionId) {
    for (var i = 0; i < usable.length; i += 1) if (usable[i].sessionId === view.sessionId) return usable[i];
    return null;               // ← 有会话但对不上：宁可失败，不跨会话写
  }
  return usable.length === 1 ? usable[0] : null;   // ← 会话未知也不猜
}
```

对应地在 `insertIntoComposer()`（`client.js:520-530`）失败时保持现有 `sendFailed` 提示即可（已经这么做了，行为不会更差）。

---

## 10.3 §8：宿主半路由 + client 半调用 —— **一致，无需改动**

### ✅ route 形状与 `ConnectionFetchRoute` 逐字段吻合

`index.mjs:242-247` / `:252-257` 的
`scope.connection.fetch.register({ path, methods: ['POST'], requestBody: 'buffered', fetch })`
与 `CORE/dsh-client-connection/lib/types/rpc.d.ts:110-120` 的 `ConnectionFetchRoute` 完全对应（`path` 是"`/api` 之下的绝对路径"，`requestBody: 'buffered' | 'streaming'`，`fetch: (request: Request) => Promise<Response>`）。

`register` 返回 `() => Promise<void>`（`rpc.d.ts:121-129`），作为 `ctx.effect` 的 effect body 返回值是合法的 `Disposable<Promise<void>>` —— cordis 的 `effect` 接受"单个 disposer / 其 Promise / 其可迭代"（`CORE/cordis/lib/types/fiber.d.ts:43-51`、`:157`）。dsh-context 的 `G` 也是原样返回，同一写法。

### ✅ `ctx.inject(['connection'], cb)` + `scope.connection.*` 是核心在用的一等写法

`index.mjs:238-261` 的
```js
ctx.inject(['connection'], (scope) => { scope.effect(() => scope.connection.fetch.register({...}), 'label') })
```
与核心包一致：
- `CORE/dsh-client-ui-sidebar-documentpreview/lib/client.js:5700-5705` → `ctx.inject(["remote","remote.officeToPdf","remote.workspaceFiles"], (scope) => scope.remote.officeToPdf.render(...))`
- `CORE/dsh-api-session-controller/lib/index.js:1851` → `ctx.inject(["attachments"], (attachmentCtx) => attachmentCtx.attachments.imageLimits)`

`ctx.inject` 的语义（`CORE/cordis/lib/types/registry.d.ts:100-113`）正是"服务可用后跑回调、服务变化会重跑"，所以 `index.mjs:232-237` 那段注释的理由成立。

### ✅ 两边拼写不对称是**正确**的，不是笔误

| 侧 | 值 | 依据 |
|---|---|---|
| host 注册 | `/api/dsh-file-annotations/read`（绝对） | `index.mjs:35-36`、`rpc.d.ts:112`（"Absolute path below `/api`"） |
| client 请求 | `api/dsh-file-annotations/read`（相对，无前导 `/`） | `client.js:44-45`、`client.js:331` |

这正是核心包的写法：`CORE/dsh-client-file-upload/lib/client.js:62`
```js
const FILE_UPLOAD_ROUTE = "/api/session/uploadFileBinary".slice(1);   // ← 故意把前导 / 去掉
```
去掉前导 `/` 是为了让 URL **相对 document 解析**，跟随部署 mount 前缀；写成绝对 `/api/...` 在挂载到子路径时会 404。（顺带：`dsh-client-ui-deliverables` 用的是绝对 `/api/changes.summary`，那种写法只在根部署成立——不建议学。）

### ✅ 鉴权：**不需要 token，也不需要 `credentials`** —— 当前实现正确

`CORE/dsh-client-connection/lib/types/browser-auth.d.ts:28-44`：鉴权是 **index 请求的 `?token=` 一次性换取签名 httpOnly cookie**（`authorizeIndex` 铸 cookie → 重定向到干净的 `./`），此后每个请求由 `isAuthenticated(request)` 验 `Host` + `Cookie`。同源 `fetch` 默认 `credentials: 'same-origin'`，cookie 自动带上。所以：

- `client.js:331-334` 只有 `method` / `content-type` / `body`，**没有 token、没有 credentials** —— 与 dsh-context（`PROFILE/dsh-context/lib/client.js:28`，裸 `fetch('api/dsh-context/balance', {method:'POST'})`）完全同构，是正确写法。
- 推论：**不要**去 `ctx.connection` 上找什么"带鉴权头的 fetch 助手"，也没有这种东西；`ClientConnectionRpc.call/open`（`rpc.d.ts:209-232`）走的是逻辑 RPC 通道（`/api` 的 exact fetch route 不走它）。

### 🔸 一处健壮性提醒（无需改）

`requestBody: 'buffered'` 时**bridge 会先按自己的 JSON 上限拦一次 body**，超限返回的是 bridge 的错误形状，而不是我们 `index.mjs:56-58` 的 `{ok:false,error:{code}}`。`client.js:337-342` 的兜底
`var code = data && data.error ? data.error.code : 'http-' + response.status`
已经能吃住非约定 payload，所以不会崩。只是别指望 `code` 一定是自己那套枚举。

---

## 10.4 其余"会不会 throw"的检查表

| 检查项 | 结果 |
|---|---|
| 有没有 register 到未声明的 slot | ✅ 无。三处都经 `inject`，未声明时只是等待 |
| list / keyed / chain / single 的 kind 与必填字段是否匹配 | ✅ 三处 list 全给 `id`（+`order`）；没用 keyed/chain |
| 同一 cell 同 priority 二次注册（会 throw） | ✅ 三个 id 各不相同且分属三个不同 slot，不可能撞 |
| scope 是否匹配（组件里用 `sessionId` 的地方是否都在 session 槽） | ✅ 三个 slot 都是 `scope:'session'`，`sessionId` 必为 string |
| owner props 是否用对（`absolutePath`） | ✅ 两个 action 槽的 owner 都只有 `absolutePath`，没有多取 |
| `ModuleLoader.load({id})` == package name | ✅ `client.js:24` `'dsh-file-annotations'` == `package.json.name` |
| 平铺导出、无 `export default` | ✅ `client.js:1094-1095` 只有 `exports.apply` / `exports.inject`；`index.mjs:30/33/238` 具名导出 `name`/`inject`/`apply`，无 default |
| `exports.inject` 覆盖了所有逐次访问的 `ctx.*` | ✅ 客户端只用 `ctx.slots` + `ctx.effect`（core），`inject: ['slots']` 够 |
| 宿主 `inject = []` 但用了 `ctx.inject(['connection'])` | ✅ 合法，等价于 dsh-context 的懒注册；`connection` 缺席时路由不注册而不是抛 |
| `dsh` manifest 形状（`manifestVersion`/`bundle.patch`/`client.platform`） | ✅ 与两个真实在跑的第三方插件（`dsh-quote-to-chat`、`dsh-sidebar-marks`）的 `dsh` 块逐字段同形 |
| 少了 `dsh.client.inject` 会不会不加载 | ✅ 不会。该字段文档明确是 **"Informational package-name dependencies, not Cordis service injection"** 且可选（`CORE/dsh-package-manifest/lib/types/types.d.ts:76-88`）；两个在跑的插件也都没写 |
| `require('react')` 需要 `dsh.client.external` 吗 | ✅ 不需要。`dsh-quote-to-chat` / `dsh-session-tabs` / `dsh-sidebar-marks` 都直接 `require('react')`（marks 还 require `@deepseek-ai/dsh-client-ui-primitives`）而不声明 `external` |
| 事件监听的 add/remove capture 标志是否成对 | ✅ `client.js:986-1001`：`selectionchange` 无 capture 两处一致；`mouseup`/`keydown`/`resize`/`scroll` 都是 `true`/`true` |
| dispose 是否清干净 | ✅ `client.js:994-1022` 摘监听、取消 rAF、清 saveTimers、摘 pop/panel 节点、removeFlash、removeStyle、清 bridges/listeners、删调试全局 |
| `ctx.effect(() => dispose)` 用法 | ✅ 返回 disposer，正确 |

### ⚠️ 问题 4（低）：`loadStore` 可能永久卡在 `'loading'`

`client.js:351`：`if (loadState[cwd] === 'ready' || loadState[cwd] === 'loading') return Promise.resolve(itemsOf(cwd));`
`client.js:331` 的 `post()` **没有超时 / AbortSignal**。如果请求既不 resolve 也不 reject（连接半开、代理挂住），`loadState[cwd]` 永远停在 `'loading'` → 该 cwd 之后整个页面生命周期都不会再重试，计数一直是 0，`saveStore` 也可能卡住。

**修法**（`client.js:329-331`）：给 `fetch` 挂 `AbortSignal.timeout(8000)`，并把 `AbortError` 也归到 `'offline'`：

```js
return fetch(route, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
  signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
})
```
（`loadStore` 的 `.catch` 已经会把 `loadState` 翻成 `'offline'`，所以补上超时就自动获得重试能力；再可选地在 `'offline'` 时允许手动重试。）

---

## 10.5 复核结论汇总

| # | 项 | 判定 |
|---|---|---|
| §5 / §7 | 三个 `inject` + `list` 注册（`id`/`order`） | **一致**，无 keyed 误用；`inject` 包裹是必需且正确 |
| §3 | `absolutePath` / `sessionId` / `useSessions` 来源 | **一致**；`useSessions` 属 `GlobalStandardProps`，list slot 里保证存在；`byId[sid].cwd` shape 正确 |
| §4 | overlay 桥取 `inputActions` | **一致**，且只有 `scope:'session'` 的槽才有，overlay 正合适 |
| §8 | host `connection.fetch.register` + `ctx.inject` + client 相对 `fetch` + cookie 鉴权 | **一致**，两侧拼写不对称是核心约定 |
| 其他 | 会 throw 的坑 | **未发现** |

**需要改的 4 处（0 处阻塞交付）：**

1. **`cwdFromProps` 条件 Hook**（`lib/client.js:877-887`，调用点 `:892` `:`917`）—— 提成无条件 hook。中。
2. **cwd 的 `dirname(file)` 兜底**（`lib/client.js:917`）—— 会让两个按钮读写不同 `.dsh/annotations.json`，甚至写到工作区外。改为只认 Session cwd。中。
3. **`pickBridge()` 跨会话兜底**（`lib/client.js:500-513`）+ `view.sessionId` 单例被多个 effect 写（`:894-898`、`:919-923`）—— 对不上会话时应失败而不是挑最后一个。中。
4. **`post()` 无超时**（`lib/client.js:329-331`）—— 可能永久卡 `loadState='loading'`。低。

> 备注：1–3 都不影响"能不能跑起来"，只影响"批注会不会写错地方/写错文件"；4 只在网络半死时出现。全部改完后再跑 `node --test test/verify.mjs` 与 `node tools/real-ui-check.mjs --global __dshFileAnnotations`。
