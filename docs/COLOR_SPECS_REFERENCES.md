# 大厂颜色规范与主流配色趋势速查（Apple / Google / Meta + 2026 趋势）

> 整理日期：2026-07-30（官方页面当日核实）
> 姊妹篇：`MOTION_SPECS_REFERENCES.md`（动效规范）
> 用途：做 UI 动效 / 品牌视觉时的配色依据；文末有落到 AE 工作流的实用译法

---

## Apple（HIG Color，Liquid Glass 时代）

**核心哲学：语义色，不是十六进制。** 颜色按"角色"定义（label / separator / link /
systemBackground 三级 / grouped 三级…），系统在浅色、深色、高对比、鲜活度等环境下自动适配。
官方明确警告不要硬编码色值（每个版本可能微调）。

- **层级体系**：背景两套（system / grouped）各三级 primary→tertiary；前景 label 四级
  （label / secondary / tertiary / quaternary）+ placeholder / separator / link
- **Liquid Glass 配色规则**（2025-09 新增）：玻璃默认**无固有色**（吸取背后内容的颜色）；
  少量元素可做"染色玻璃"（如主要 CTA 按钮把强调色放**背景**而非文字上）；
  工具栏/标签栏默认**单色系**，随下方内容明暗自动反转；彩色要克制，只给真正需要强调的
- **系统色参考值**（iOS 浅色/深色，官方文档参考值，实际以 API 为准）：
  | 色 | Light | Dark |
  |---|---|---|
  | Blue | #007AFF | #0A84FF |
  | Green | #34C759 | #30D158 |
  | Red | #FF3B30 | #FF453A |
  | Orange | #FF9500 | #FF9F0A |
  | Yellow | #FFCC00 | #FFD60A |
  | Purple | #AF52DE | #BF5AF2 |
  | Pink | #FF2D55 | #FF375F |
  | Indigo | #5856D6 | #5E5CE6 |
  | Teal | #30B0C7 | #40C8E0 |
  | Mint | #00C7BE | #63E6E2 |
- **广色域**：推荐 Display P3、16bit/通道 PNG；注意 P3 渐变在 sRGB 屏上可能断层
- 无障碍：不能只靠颜色传达信息；所有色必须过浅色/深色/高对比三关

## Google（Material 3 / M3 Expressive，2025-05 大版本）

**核心哲学：算法生成的动态色。** 一个种子色（来自壁纸/内容图/手选）→ 算法生成
5 个关键色（Primary / Secondary / Tertiary / Neutral / Neutral Variant）→ 每个展开成
**13 档色调板**（tone 0-100，含 95/98/99）→ 按无障碍关系自动分配给 **26 个颜色角色**
（primary / on primary / primary container / surface 系…），浅深两套主题同一套角色。

- **HCT 色彩空间**（Google 自研）：Hue 0-360 / Chroma 0-约120 / Tone 0-100，
  特点是调 hue/chroma 不影响 tone，而 tone 直接决定对比度 → 无障碍可计算
- **对比三档**：Standard / Medium（≥3:1）/ High（7:1），tone 差就是对比度：
  tone 50 配 98 ≈ 3:1，tone 30 配 98 ≈ 7:1（做配色时可直接套这两对）
- **M3 Expressive（SPEC_2025）**：默认调色风格更鲜艳大胆，种子色的原始色相
  可能不直接出现在最终主题里（算法主动增彩）
- 工具：Material Theme Builder / Material Color Utilities（MCU）开源库

## Meta

**无统一公开规范**（同动效）。可确认的品牌色事实：
- Facebook 蓝 **#1877F2**（辅助 #4267B2 深蓝 + 黑白）；重塑后的体系是"蓝为锚点 +
  深浅蓝阶梯"，强调无障碍对比
- Meta 公司品牌是蓝色渐变徽标（蓝 → 青蓝的流动渐变）
- Instagram 渐变：**#833AB4 紫 → #C13584 洋红 → #E4405F 粉 → #FCAF45 橙**
- 产品实际手感：功能界面高度中性（白/灰/黑 + 品牌蓝点缀），色彩表达集中在
  内容与渐变品牌资产上

## 2026 主流配色趋势（多来源交叉）

1. **Pantone 年度色：Cloud Dancer（11-4201）**，柔和的云白色，主打"重置与平静"
   —— 和 Apple 的玻璃白、弥散浅底风潮同频
2. **弥散/网格渐变（mesh gradient）继续统治**：多色点有机融合、柔光、环境光感，
   拒绝生硬彩虹；我们已有 AE 等价做法（色块 + 大模糊，见 shape-morphing 配方）
3. **深色模式进化成"氛围模式"**：不是简单反色，而是专门设计的深色 token 体系；
   OLED 纯黑 + 高饱和点缀色
4. **带颜色的磨砂玻璃**：frosted glass 加彩色 tint（正好接我们 liquid-glass 配方）
5. **两极并存**：极简中性 + 宝石色调（jewel tones）/ 柔和科技感粉彩（soft-tech pastels）
6. **系统化 > 好看**：色彩必须成体系（跨浅深模式、无障碍、OLED、多端一致），
   "调色板"思维被"颜色角色"思维取代

## 落到 AE 工作流的译法

- **建"角色"而不是散色**：项目开头定 primary / on-primary / surface / accent 几个
  角色色，全片引用（AE 里可用一个色卡合成 + 表达式引用，或至少写进项目备注）
- **对比度速算**：借 M3 的 tone 法则：主体和背景的明度差拉到 tone≈50 差值即 7:1，
  HUD 文字类至少 tone≈40 差值
- **Apple 感配色**：大面积中性（白/浅灰/纯黑）+ 单一强调色只给 CTA；
  玻璃元素无固有色、靠背景透色（正是 CC Glass 的天然行为）
- **Google 感配色**：从一张主视觉图取种子色 → 同色相拉 13 档明度阶 → 深浅两套；
  想要 Expressive 感就把 chroma 整体提一档
- **渐变**：用 2026 的弥散做法（多色点 + 大模糊 + 轻噪点防条带），避免双色硬线性
- **P3 注意**：交付 TikTok/社媒的视频走 sRGB/Rec.709 就好；做 Apple 平台 UI 演示
  可开 P3 工作空间，但渐变要在 sRGB 屏上检查断层

## 原始链接

- Apple HIG Color: https://developer.apple.com/design/human-interface-guidelines/color
- M3 Color how-it-works: https://m3.material.io/styles/color/system/how-the-system-works
- M3 Color roles: https://m3.material.io/styles/color/roles
- Material Theme Builder: https://material-foundation.github.io/material-theme-builder/
- Meta Facebook 品牌重塑: https://www.meta.com/design-at-meta/blog/redefining-facebooks-brand-identity/
- Meta 品牌资源中心: https://about.meta.com/brand/resources/
- 趋势来源：Lounge Lizard / AND Academy / Envato / UPDIVISION / Recursion 2026 色彩趋势文章
