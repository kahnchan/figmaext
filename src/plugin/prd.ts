import type { PRDResult, PRDSection, ScanContext, Settings } from '@shared/messages';
import kb from '@shared/prd_kb.json';
import { openRouterChat } from './openrouter';

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function scoreSection(section: PRDSection, q: string): number {
  const hay = normalize(
    [section.feature, section.background, section.logic, section.ac, ...(section.keywords || [])].join(' ')
  );
  let score = 0;
  for (const token of q.split(' ').filter(Boolean)) {
    if (hay.includes(token)) score += 2;
  }
  if (hay.includes(q)) score += 5;
  return score;
}

function pickCandidates(sections: PRDSection[], context: ScanContext): PRDSection[] {
  // Collect all text from all frames for better matching
  const allTexts: string[] = [];
  const allComponents: string[] = [];
  const allFrameNames: string[] = [];
  
  if (context.frames && context.frames.length > 0) {
    for (const frame of context.frames) {
      allFrameNames.push(frame.frameName);
      allComponents.push(...frame.componentNames);
      allTexts.push(...frame.texts);
    }
  } else {
    // Fallback to legacy single frame
    if (context.frameName) allFrameNames.push(context.frameName);
    if (context.componentNames) allComponents.push(...context.componentNames);
    if (context.texts) allTexts.push(...context.texts);
  }
  
  const q = normalize([...allFrameNames, ...allComponents, ...allTexts].join(' ')).slice(0, 8000);
  const scored = sections
    .map((s) => ({ s, score: scoreSection(s, q) }))
    .sort((a, b) => b.score - a.score);

  const top = scored.filter((x) => x.score > 0).slice(0, 8).map((x) => x.s);
  return top.length > 0 ? top : sections.slice(0, Math.min(8, sections.length));
}

async function loadKB(settings: Settings): Promise<PRDSection[]> {
  return kb as unknown as PRDSection[];
}

export async function syncPRD(
  settings: Settings, 
  context: ScanContext, 
  additionalPrompt?: string
): Promise<PRDResult> {
  const sections = await loadKB(settings);
  const candidates = pickCandidates(sections, context);
  
  const isMultiFrame = context.frames && context.frames.length > 1;

  const systemPrompt = isMultiFrame
    ? `你是一位资深产品经理，正在撰写实用、面向开发的产品需求文档（PRD）。

我会提供一个产品流程的多个屏幕/界面，按顺序排列。

**核心原则：**
- ✅ 理解产品流程：分析页面之间的跳转关系和数据传递
- ✅ 面向开发：详细描述产品交互和技术实现细节
- ✅ 页面拆解：按页面/组件组织，说明页面间的关联和流转
- ✅ 边缘情况：列出 5 个以上开发中会遇到的异常场景和处理方式
- ✅ 可读性：中英文混排时加空格，使用表格组织信息
- ✅ 必须使用中文

**你的任务：**
撰写一份面向开发的 PRD 文档，能够：
1. 理解完整的产品流程，说明页面之间如何跳转和关联
2. 详细描述每个页面的元素、交互逻辑、触发条件
3. 说明页面间的数据传递和状态管理
4. 列出至少 5 个边缘情况及处理方式
5. 使用丰富的 Markdown 格式提升可读性

**PRD文档结构（按此顺序）：**

# [功能名称]

## 背景
简要说明：为什么要做这个功能，当前存在什么问题或机会

## 核心问题
列出要解决的1-3个核心问题

## 解决思路
概述如何解决上述问题，整体的产品策略

## 产品方案

> 💡 **整体流程**
>
> 简要说明用户从进入到完成的完整流程，页面之间如何跳转。

---

### 页面一：[页面/组件名称]

[如果 figmaData 提供了 screenshotPlaceholder，在这里插入图片]

**页面元素：**

使用表格展示 UI 元素：

| 元素 | 类型 | 说明 |
|------|------|------|
| [元素名称] | Button/Input/Tab 等 | 用途和默认状态 |
| ... | ... | ... |

**交互逻辑：**

1. 用户在 [位置] 做 [操作]
2. 系统根据 [条件] 进行 [计算/验证]
3. 显示/更新 [结果]
4. 点击 [按钮] → 触发 [页面二] / 跳转到 [下一个页面]

> ⚠️ **注意事项**
>
> 关键的技术点或业务逻辑说明

---

### 页面二：[下一个页面/弹窗]

[如果 figmaData 提供了 screenshotPlaceholder，在这里插入图片]

**触发条件：**
从 [页面一] 点击 [按钮] 后触发，携带数据：direction、amount、leverage 等

**页面元素：**

| 元素 | 类型 | 说明 |
|------|------|------|
| ... | ... | ... |

**交互逻辑：**

1. 展示从 [页面一] 传递的数据
2. 用户操作...
3. **成功** → 关闭并返回 [页面] / 跳转到 [页面]
4. **失败/取消** → 返回 [页面一]

---

### 边缘情况

| 场景 | 触发条件 | 处理方式 |
|------|---------|---------|
| 网络请求失败 | API 调用超时或返回错误 | Toast 提示"网络异常，请稍后重试"，恢复按钮可点击状态 |
| 输入格式非法 | 用户输入非数字、负数或超出精度 | 输入框标红，显示错误提示 |
| 余额不足 | 可用余额 < 所需保证金 | 按钮置灰，提示"余额不足"，提供充值入口 |
| 并发操作冲突 | 同一用户同时提交多个订单 | 后续请求排队或提示"订单处理中" |
| 风控限制 | 触发风控规则（如超出持仓限制） | 显示具体失败原因，引导用户调整 |

> ℹ️ **开发提示**
>
> 所有错误处理都应该在前端先做基础校验，避免不必要的 API 调用。

## 人员分工
- 产品：[姓名]
- 开发：[姓名]
- 设计：[姓名]

---

**输出要求：**
- 直接输出 markdown 格式的 PRD 文档
- 不要添加任何介绍性文字（如"以下是..."、"根据设计..."等）
- 第一行直接是 # [功能名称]
- **理解产品流程**：产品方案开头先说明整体流程，页面之间如何跳转和关联
- **中英文混排规则**：英文单词/术语与中文之间必须加空格
- **丰富的富文本格式**：
  - 使用表格展示结构化信息（页面元素、边缘情况等）
  - 使用引用块 > 💡/⚠️/ℹ️ 标注重点提示、警告、说明
  - 使用代码块标注 API、状态、数据结构
  - 使用分隔线 --- 分隔不同章节
  - 使用任务列表 - [ ] 标注待确认事项
- **插入 Figma 截图**：在每个页面标题后，如果该页面有截图（hasScreenshot 为 true），插入格式为 ![页面名称](SCREENSHOT_PLACEHOLDER_X) 的占位符，其中 X 为页面索引（从 0 开始）
- **按页面拆解**：每个页面说明触发条件、页面元素、交互逻辑、跳转目标
- **边缘情况用表格**：使用表格展示边缘情况（场景 | 触发条件 | 处理方式）
- **不包含埋点内容**：不要生成埋点、数据指标等内容

**示例：**
\`\`\`markdown
# 创建交易订单

## 背景
用户在进行杠杆合约交易时，需要一个高效、信息清晰的下单工具，以便快速捕捉市场机会。

## 核心问题
1. **信息不直观**：用户需要自行计算订单价值、预估强平价格等关键风险指标。
2. **操作易出错**：缺少下单前的最终确认环节，用户可能因误触造成损失。
3. **决策信息分散**：用户下单时无法便捷地查看可用资金等账户信息。

## 解决思路
提供一个集成的交易组件，将下单所需的所有元素集中展示。在提交订单前，增加二次确认弹窗，清晰罗列订单核心信息，防止误操作。

## 产品方案

> 💡 **整体流程**
>
> 用户在交易页面操作交易组件，填写订单信息后点击下单按钮 → 弹出确认弹窗展示订单详情 → 用户确认后提交订单 → 根据结果跳转或提示。

---

### 页面一：交易组件 (Trading Widget)

![交易组件界面](data:image/png;base64,...)

**页面元素：**

| 元素 | 类型 | 说明 |
|------|------|------|
| 方向选择 Tab | Tab | 做多 (Long) / 做空 (Short)，切换交易方向 |
| 订单类型 Tab | Tab | 市价 (Market) / 限价 (Limit) |
| 杠杆调节器 | Slider + Input | 显示当前杠杆（如 5x），支持滑动或输入 |
| 数量输入框 | Input | Amount，输入资产数量，单位 USDC |
| Order Value | Display | 订单价值，根据数量和杠杆实时计算 |
| Liq. Price | Display | 预估强平价，根据仓位信息实时计算 |
| 操作按钮 | Button | 做多 (Long) / 做空 (Short) 主按钮 |

**交互逻辑：**

1. 用户选择交易方向、调整杠杆、输入数量
2. 系统根据用户输入实时计算并更新 Order Value 和 Liq. Price
3. 用户点击做多或做空按钮 → 触发确认弹窗
4. 若可用资金不足 → 按钮置灰，提示余额不足

> ⚠️ **技术要点**
>
> - 杠杆和保证金的计算公式：订单价值 = 保证金 × 杠杆
> - 强平价需要根据当前市场价格、杠杆倍数和维持保证金率计算
> - 所有计算结果保留 2-4 位小数

---

### 页面二：确认订单弹窗 (Confirm Order Modal)

![确认订单弹窗](data:image/png;base64,...)

**触发条件：**
从交易组件点击做多或做空按钮后触发，携带数据：direction (long)、amount (100)、leverage (5)、orderValue (500)、liquidationPrice (493.15)

**页面元素：**

| 元素 | 类型 | 说明 |
|------|------|------|
| 弹窗标题 | Text | 确认订单 (Confirm Order) |
| 关闭按钮 | IconButton | 右上角 X，关闭弹窗 |
| Action | Display | Long / Short |
| Position Size | Display | 1 BTC |
| Price | Display | Market Price 或具体价格 |
| Liquidation Price | Display | $493.15 |
| 取消按钮 | Button (Secondary) | 关闭弹窗 |
| 确认按钮 | Button (Primary) | 提交订单 |

**交互逻辑：**

1. 弹窗浮现，展示从交易组件传递的订单信息
2. 用户核对信息，点击确认按钮
3. 按钮显示 Loading 状态 → 系统提交订单请求
4. **成功流程**：
   - 弹窗关闭
   - Toast 提示"订单创建成功"
   - 刷新持仓信息
   - 可选跳转到持仓页面
5. **失败流程**：
   - 弹窗关闭
   - Toast 提示具体失败原因
   - 返回交易组件
6. **取消流程**：
   - 关闭弹窗
   - 返回交易组件，保留已输入数据

> ℹ️ **状态管理**
>
> 订单提交时需要锁定界面，防止重复提交。可以在 Loading 期间禁用所有操作按钮。

---

### 边缘情况

| 场景 | 触发条件 | 处理方式 |
|------|---------|---------|
| 网络请求失败 | API 调用超时 (>5s) 或返回 5xx 错误 | Toast 提示"网络异常，请稍后重试"，恢复按钮可点击状态 |
| 可用余额不足 | 打开确认弹窗时余额已变化（其他订单成交） | 确认按钮置灰，提示"可用余额不足"，提供充值入口 |
| 输入格式非法 | 用户输入非数字、负数、超出精度（如 0.0000001） | 输入框标红，下方显示"请输入有效的数量" |
| 市场价格剧烈波动 | 从点击下单到确认期间，市价变动 >1% | 确认弹窗中高亮价格，显示警告"市场价格已更新，请注意风险" |
| 风控限制 | 触发后端风控（超持仓限制、IP 限制、频率限制） | 根据 API errorCode 显示具体原因，如"已超出该合约最大持仓限制" |

> ⚠️ **开发注意**
>
> - 所有错误提示文案需要从 API 返回的 errorMessage 中获取，保持前后端一致
> - 输入框验证应该在前端先做，避免不必要的 API 调用
> - 并发下单的防抖处理建议设置为 500ms

## 人员分工
- 产品：[姓名]
- 开发：[姓名]
- 设计：[姓名]
\`\`\``
    : `你是一位资深产品经理，正在撰写实用、面向开发的产品需求文档（PRD）。

**核心原则：**
- ✅ 理解产品流程：分析页面之间的跳转关系和数据传递
- ✅ 面向开发：详细描述产品交互和技术实现细节
- ✅ 按页面拆解：详细列出所有 UI 元素和交互逻辑
- ✅ 边缘情况：列出至少 5 个异常场景和处理方式
- ✅ 可读性：中英文混排时加空格，使用表格组织信息
- ✅ 必须使用中文

你的任务：分析 UI 设计，生成一份面向开发的 PRD 文档，包含：

## 文档结构（按此顺序）：
1. **背景** - 为什么做这个功能
2. **核心问题** - 要解决的 1-3 个核心问题（加粗标题）
3. **解决思路** - 整体策略
4. **产品方案** - 先说明整体流程，然后按页面拆解，说明页面间的跳转和数据传递，最后用表格列出"边缘情况"
5. **人员分工**

**要求：**
- 产品方案开头用引用块 > 💡 说明整体流程
- 中英文混排加空格，如"用户点击 Confirm 按钮"
- 每个页面用表格展示元素，说明触发条件、交互逻辑、跳转目标
- 使用引用块 > ⚠️/ℹ️ 标注重点提示
- 使用代码块展示数据结构
- 使用分隔线 --- 分隔章节
- 边缘情况用表格（场景 | 触发条件 | 处理方式）
- 不包含埋点内容`;

  const figmaData = isMultiFrame
    ? {
        workflow: `${context.frames!.length}-screen product flow`,
        screens: context.frames!.map((frame, idx) => ({
          step: idx + 1,
          screenName: frame.frameName,
          uiElements: {
            components: frame.componentNames.slice(0, 30),
            texts: frame.texts.slice(0, 40),
          },
          hasScreenshot: !!frame.screenshotBase64,
          // 只告诉 AI 有截图，不发送实际数据
          screenshotPlaceholder: frame.screenshotBase64 ? `SCREENSHOT_PLACEHOLDER_${idx}` : null,
        })),
      }
    : {
        frameName: context.frameName,
        componentNames: context.componentNames,
        texts: context.texts,
        hasScreenshot: !!(context.frames && context.frames[0]?.screenshotBase64),
        screenshotPlaceholder: (context.frames && context.frames[0]?.screenshotBase64) 
          ? 'SCREENSHOT_PLACEHOLDER_0' 
          : null,
      };

  const promptData: any = {
    figma: figmaData,
    documentationContext: candidates,
      requiredSections: ['背景', '核心问题', '解决思路', '产品方案', '人员分工'],
    output: {
      format: 'json',
      schema: {
        featureName: 'string (清晰简洁的功能名称，用中文)',
        markdown: 'string (PRD文档，markdown格式，必须用中文撰写)',
        matchedSections: 'string[] (参考的文档章节)',
      },
    },
  };

  // 添加额外的提示词（如果有）
  if (additionalPrompt && additionalPrompt.trim()) {
    promptData.additionalRequirements = `用户的补充要求：${additionalPrompt.trim()}`;
  }

  const userPrompt = JSON.stringify(promptData, null, 2);

  const raw = await openRouterChat(settings, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  // Extract JSON object from raw (models sometimes wrap)
  const match = raw.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : raw;

  try {
    const parsed = JSON.parse(jsonText);
    const featureName = String(
      parsed.featureName || 
      (isMultiFrame ? `${context.frames![0].frameName} Flow` : context.frameName) || 
      'Unknown Feature'
    );
    
    let markdown = String(parsed.markdown || raw);
    
    // 替换截图占位符为真实的 base64 图片
    if (context.frames) {
      context.frames.forEach((frame, idx) => {
        if (frame.screenshotBase64) {
          const placeholder = `SCREENSHOT_PLACEHOLDER_${idx}`;
          const actualImage = `data:image/png;base64,${frame.screenshotBase64}`;
          markdown = markdown.replace(new RegExp(placeholder, 'g'), actualImage);
        }
      });
    }
    
    return {
      featureName,
      markdown,
      matchedSections: Array.isArray(parsed.matchedSections) ? parsed.matchedSections.map(String) : [],
    };
  } catch {
    const featureName = isMultiFrame 
      ? `${context.frames![0].frameName} - ${context.frames![context.frames!.length - 1].frameName} Flow`
      : context.frameName || 'Unknown Feature';
    
    let markdown = raw;
    
    // 替换截图占位符为真实的 base64 图片
    if (context.frames) {
      context.frames.forEach((frame, idx) => {
        if (frame.screenshotBase64) {
          const placeholder = `SCREENSHOT_PLACEHOLDER_${idx}`;
          const actualImage = `data:image/png;base64,${frame.screenshotBase64}`;
          markdown = markdown.replace(new RegExp(placeholder, 'g'), actualImage);
        }
      });
    }
    
    return {
      featureName,
      markdown,
      matchedSections: candidates.map((c) => c.feature),
    };
  }
}
