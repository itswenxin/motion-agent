# 大厂动效规范速查（Apple / Google / Meta）

> 整理日期：2026-07-29（来源均为当日核实的官方页面）
> 用途：做 UI 动效时的参数依据；文末有翻译成我们 AE rig 滑杆参数的对照表。

---

## Apple

**官方规范**：[HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion)（2025-09-09 更新加入 Liquid Glass 指引）

原则层（HIG 原文要点）：
- 动效必须有目的，不为动而动；过度动画让人分心甚至不适
- 动效必须可选：不能是传达关键信息的唯一途径（配触觉、声音）
- 反馈动画追求简短精确，高频交互不加自定义动效
- 动效可被打断/取消，别让用户等动画播完
- Liquid Glass（2025 新设计语言）：材质像液态玻璃，触摸直接交互时动效强调更重，触控板交互时更收敛；视觉与运动一体设计

参数层（WWDC23 "Animate with springs" 的弹簧模型，SwiftUI 全系采用）：
- 弹簧用两个参数描述：**duration（响应时长）+ bounce（弹性 -1..1）**
- 换算：阻尼比 ζ = 1 - bounce
- 系统预设：
  | 预设 | duration | bounce | 感受 |
  |---|---|---|---|
  | smooth | 0.5s | 0 | 无弹跳柔滑（默认） |
  | snappy | 0.5s | 0.15 | 轻微活力 |
  | bouncy | 0.5s | 0.3 | 明显回弹 |
- Liquid Glass 时代趋势：默认交互 response 约 0.3s，形变/展开允许更弹

## Google (Material 3 Expressive)

**官方规范**：[M3 Motion physics system](https://m3.material.io/styles/motion/overview/how-it-works)（2025-05 发布，用物理弹簧系统**取代**旧的 easing+duration 体系）

体系结构：
- 两套 scheme：**expressive**（会超调回弹，谷歌推荐大多数场景、hero 时刻）和 **standard**（几乎无弹跳，工具型产品）
- 两类通道：**spatial**（位移/旋转/尺寸/圆角，允许超调）和 **effects**（颜色/透明度，禁止超调）
- 三档速度：fast（小组件）/ default（多数）/ slow（全屏）
- 弹簧三属性：stiffness、damping、initial velocity；damping=1 完全无弹跳

Web 换算表（cubic-bezier + 时长，可直接抄进 AE 关键帧缓动）：
| Token | bezier | 时长 |
|---|---|---|
| Expressive fast spatial | 0.42, 1.67, 0.21, 0.90 | 350ms |
| Expressive default spatial | 0.38, 1.21, 0.22, 1.00 | 500ms |
| Expressive slow spatial | 0.39, 1.29, 0.35, 0.98 | 650ms |
| Expressive fast effects | 0.31, 0.94, 0.34, 1.00 | 150ms |
| Expressive default effects | 0.34, 0.80, 0.34, 1.00 | 200ms |
| Expressive slow effects | 0.34, 0.88, 0.34, 1.00 | 300ms |
| Standard 全速 spatial | 0.27, 1.06, 0.18, 1.00 | 350/500/750ms |
| Standard effects | 同 expressive effects | 150/200/300ms |

（bezier 第二个值大于 1 = 有超调；effects 全部不超调）

## Meta

**没有统一公开的动效规范**（对外确认过的现状）。可挖的资产：
- [Origami Studio](https://origami.design/)：Meta 内部设计团队的原型工具，其弹簧 patch 用 bounciness(0-20) + speed(0-40) 模型，默认 bounciness 5 / speed 10
- 历史框架 Pop / Rebound（tension-friction 模型），Facebook 经典手感：tension 380 / friction 20 前后
- 产品观察：Meta 系（IG/FB/Threads）实际手感是快速响应、极少可见弹跳、大量手势跟随 + 投掷惯性（gesture-driven, interruptible）

## 2025-2026 行业趋势总结

1. **easing 时代结束，物理弹簧成为默认**：Apple（duration+bounce）、Google（stiffness+damping）都完成了切换；弹簧的核心优势是可打断、可重定向、手势衔接自然
2. **通道分离**：位移类允许超调，颜色/透明度类禁止超调（M3 显式规定，Apple 实践一致）
3. **卡顿优先修运动，不用透明度遮掩**：动画不丝滑时，先检查位置曲线、空间路径、速度连续性、条件分支和关键帧间距；透明度只用于明确的显隐/转场，不作为修复运动卡顿的手段
4. **表现力分层**：日常交互克制，hero 时刻放开（M3 expressive scheme、Liquid Glass 的触摸强调）
5. **流体/材质化**：Liquid Glass 把动效和材质绑定（折射、光响应、形变）
6. **可达性是硬要求**：Reduce Motion 必须响应，动效不能是唯一信息通道

---

## 翻译成我们 AE rig 的参数（AI_*_CTRL 滑杆）

我们的弹簧表达式用 Spring Freq (Hz) + Spring Damping (ζ)。换算：freq ≈ 1/duration(s)，ζ = 1 - bounce。

| 想要的手感 | Spring Freq | Spring Damping | 对应外部规范 |
|---|---|---|---|
| Apple smooth（默认推荐） | 2.0 | 1.0 → 用 0.97 | duration 0.5 / bounce 0 |
| Apple snappy | 2.0 | 0.85 | bounce 0.15 |
| Apple bouncy | 2.0 | 0.70 | bounce 0.3 |
| Liquid Glass 交互感 | 3.3 | 0.9 | response 0.3 |
| M3 expressive spatial | 2.0 | 0.80 | 有明显超调 |
| M3 standard spatial | 2.0 | 0.95 | 基本无弹跳 |
| M3 effects（透明度/颜色） | 5.0 | 1.0 → 0.99 | 150-300ms 无超调 |
| Meta 系手感 | 2.5-3 | 0.9 | 快响应少弹跳 |

注：我们表达式里 ζ 需要 <1（欠阻尼解析解），临界阻尼用 0.97-0.99 近似。

## 原始链接

- Apple HIG Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- WWDC25 Meet Liquid Glass: https://developer.apple.com/videos/play/wwdc2025/219/
- M3 Motion how-it-works: https://m3.material.io/styles/motion/overview/how-it-works
- M3 Motion specs（换算表）: https://m3.material.io/styles/motion/overview/specs
- M3 Expressive 动效博客: https://m3.material.io/blog/m3-expressive-motion-theming
- Origami Studio 文档: https://origami.design/documentation/
