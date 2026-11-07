# AE 基础规范：界面、快捷键、与脚本的对应关系

> 整理日期：2026-07-30，依据 Adobe 官方文档核实（helpx.adobe.com 快捷键参考，2026-05-05 更新）
> 用途：AI 给用户下 UI 操作指令时查这里，确保说的键是对的；同时记录 UI 概念到脚本 API 的映射。
> 注意：只收录本项目用得上的部分，不是完整手册。完整版见 Adobe 官方文档。

---

## 一、AI 最需要的几条（给用户下指令时用）

| 场景 | macOS | Windows |
|---|---|---|
| **中止正在运行的脚本** | `Esc` | `Esc` |
| 撤销 / 重做 | `Cmd+Z` / `Cmd+Shift+Z` | `Ctrl+Z` / `Ctrl+Shift+Z` |
| 打开快捷键编辑器 | `Opt+Cmd+'` | `Ctrl+Alt+'` |
| 打开偏好设置 | `Cmd+Opt+;` | `Ctrl+Alt+;` |
| 清除内存缓存 | `Cmd+Opt+/`（小键盘） | `Ctrl+Alt+/`（小键盘） |
| 重置全部偏好（启动时按住） | `Cmd+Opt+Shift` | `Ctrl+Alt+Shift` |

> 脚本卡住时的标准处理：先关掉可能存在的模态框，再按 `Esc` 中止脚本。
> 这是官方支持的中断方式，比强退 AE 安全。

## 二、面板与工作区

| 面板 | macOS | 说明 |
|---|---|---|
| Project | `Cmd+0` | |
| Tools | `Cmd+1` | |
| Info | `Cmd+2` | |
| Preview | `Cmd+3` | |
| Audio | `Cmd+4` | 双击 `L` 展开波形（做卡点用） |
| **Effects & Presets** | `Cmd+5` | |
| Character | `Cmd+6` | 文字字体字号 |
| Paragraph | `Cmd+7` | 对齐方式（negative tracking 展开必须设 Center） |
| Effect Controls | `F3` | 选中图层后 |
| Render Queue | `Cmd+Opt+0` | |
| 关闭当前面板 | `Cmd+W` | |

**工作区**：顶栏那排（Default / Small Screen / ...）就是工作区切换器，是顶级 UI，
比菜单快。把常用面板停靠好后 `Window > Workspace > Save Changes to this Workspace`，
面板会随 AE 启动常驻。`Shift+F10/F11/F12` 可切换前三个工作区。

**ScriptUI 面板（如 Motion Agent 的桥接面板）只能出现在 Window 菜单**，
脚本 API 无法创建 Help 旁边的顶级菜单（那需要 C++ 的 AEGP 插件，且它也只能往
现有菜单插命令）。所以入口方案是「停靠进工作区」而不是「加菜单项」。

## 三、图层属性单键（最高频，且官方禁止改键）

按一次显示该属性，按两次显示带关键帧的：

| 键 | 属性 | 脚本对应 |
|---|---|---|
| `A` | Anchor Point | `"ADBE Anchor Point"` |
| `P` | Position | `"ADBE Position"` |
| `S` | Scale | `"ADBE Scale"` |
| `R` | Rotation | `"ADBE Rotate Z"` |
| `T` | Opacity | `"ADBE Opacity"` |
| `U` | **所有已打关键帧的属性**（查工程必用） | |
| `UU` | 所有被改过的属性（含无关键帧的） | |
| `E` | Effects | `"ADBE Effect Parade"` |
| `EE` | 表达式 | `.expression` |
| `M` / `MM` | Mask / Mask 全属性 | |
| `L` / `LL` | Audio Levels / 波形 | |
| `F` | Mask Feather | |

官方明确这些单键**不可重新分配**，所以在任何机器上都能这么指导用户。

## 四、常用编辑操作

| 操作 | macOS |
|---|---|
| 复制图层/蒙版/效果/动画器 | `Cmd+D` |
| 切分图层（换词序列常用） | `Cmd+Shift+D` |
| 图层裁到当前时间（入点/出点） | `[` / `]` |
| 裁剪图层（保留播放头之后/之前） | `Opt+[` / `Opt+]` |
| 图层前后移一帧 / 十帧 | `Opt+PgUp/PgDn` / 加 `Shift` |
| 移动 1 像素 / 10 像素 | 方向键 / `Shift+方向键` |
| 缩放适配合成 | `Cmd+Opt+F` |
| **图层居中到画面** | `Cmd+Home` |
| **锚点居中到内容**（比拖 Pan Behind 准） | `Cmd+Opt+Home` |
| 显示参考网格 | `Opt+'` |
| Easy Ease | `F9` |
| 图表编辑器 | `Shift+F3` |
| 最大化当前面板 | `~`（波浪键） |

## 五、3D 与相机（做隧道/画布漫游时用）

| 操作 | 键 |
|---|---|
| 3D 视图 1 / 2 / 3（默认 Front / Custom View 1 / Active Camera） | `F10` / `F11` / `F12` |
| 返回上一视图 | `Esc` |
| 相机工具：环绕 / 平移 / 推拉 | `1` / `2` / `3` |
| 变换 gizmo：通用 / 位置 / 缩放 / 旋转 | `V` / `4` / `5` / `6` |
| 相机看向选中的 3D 图层 | 选相机工具后按 `F` |
| 新建相机 / 灯光 | `Cmd+Opt+Shift+C` / `Cmd+Opt+Shift+L` |

## 六、UI 概念到脚本 API 的映射（本项目专用）

这一节是别处查不到的，是把界面上看到的东西翻译成 JSX 里怎么写。

| 界面上的东西 | 脚本里的写法 |
|---|---|
| 时间轴里的一个合成 | `app.project.item(i)`（`instanceof CompItem`） |
| 合成里的一个图层 | `comp.layer(i)` 或 `comp.layer("名字")` |
| 图层的 Transform 展开项 | `layer.property("ADBE Transform Group").property("ADBE Position")` |
| Effect Controls 面板 | `layer.property("ADBE Effect Parade")` |
| 面板里效果的显示名 | **不能直接用**，要用 matchName（`tools/fx.py` 查） |
| 效果里的一个参数 | `fx.property("参数名")` 或 `fx.property(索引)`（`fx.py --params` 查真名） |
| 打一个关键帧 | `prop.setValueAtTime(t, v)` |
| Easy Ease（F9） | `prop.setTemporalEaseAtKey(i, inEase, outEase)` |
| 图表编辑器里手柄的角度 | `KeyframeEase(speed, influence)`，influence 就是手柄长度百分比 |
| Hold 关键帧 | `prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.HOLD, ...)` |
| 运动路径的直线/曲线 | `setSpatialTangentsAtKey` / `setSpatialAutoBezierAtKey` |
| 表达式（Opt+点秒表） | `prop.expression = "..."` |
| 父子链接（Parent & Link） | `layer.parent = otherLayer` |
| 预合成 | `comp.layers.precompose([indices], "名字", true)` |
| 图层混合模式 | `layer.blendingMode = BlendingMode.MULTIPLY` |
| 3D 图层开关 | `layer.threeDLayer = true` |
| 运动模糊开关 | `layer.motionBlur = true`（合成总开关 `comp.motionBlur`） |
| 折叠变换（嵌套 3D 必开） | `layer.collapseTransformation = true` |
| 时间重映射 | `layer.timeRemapEnabled = true` 后 `"ADBE Time Remapping"` |
| 撤销组（Cmd+Z 一次退全部） | `app.beginUndoGroup("名字")` ... `app.endUndoGroup()` |

## 七、脚本相关的偏好设置

要让脚本能写文件和联网，用户需开启：
**Preferences > Scripting & Expressions > Allow Scripts to Write Files and Access Network**

这是所有 AE 自动化项目的前置条件（我们的通道已在用，说明你机器上已开）。
