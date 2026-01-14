import type { Settings, TrackingEvent, TrackingProperty } from '@shared/messages';
import type { InteractiveNodeInfo } from './scan';
import { openRouterChat, isVisionModel, type ChatMessage, type TextContent, type ImageContent } from './openrouter';

const VISION_SYSTEM_PROMPT = `You are an expert Product Manager analyzing a **Web3 Wallet App** UI to generate precise tracking events.

I will show you:
1. A screenshot of the FULL PAGE/SCREEN for business context
2. A screenshot of the SPECIFIC ELEMENT the user wants to track

Your task:
1. **Deeply understand the BUSINESS SCENARIO** - What is the user trying to accomplish?
2. **Identify the USER'S INTENT** - Why would they interact with this element?
3. Generate a tracking event that captures business value

---

## EVENT NAMING CONVENTION (CRITICAL)

Format: \`{module}_{action}_{element}\` in **snake_case**

### Structure:
1. **module**: Business feature/function (identify from WHAT THE USER IS DOING)
2. **action**: User behavior (tap, view, submit, toggle, select, input, scroll)
3. **element**: UI element type (confirm, cancel, tab, token, card, button, input)

### Module Examples - Understand from business context:
| What user is doing | Module prefix | Example Events |
|-------------------|---------------|----------------|
| Swapping/exchanging tokens | \`swap_\` | \`swap_tap_confirm\`, \`swap_select_token\` |
| Managing open orders | \`order_\` | \`order_tap_cancel\`, \`order_view_detail\` |
| Browsing market prices | \`market_\` | \`market_tap_token\`, \`market_toggle_watchlist\` |
| Sending cryptocurrency | \`send_\` | \`send_input_address\`, \`send_submit_transfer\` |
| Viewing portfolio | \`wallet_\` | \`wallet_tap_asset\`, \`wallet_view_balance\` |
| Staking/earning yield | \`earn_\` | \`earn_tap_stake\`, \`earn_tap_claim\` |

**Key principle**: Module reflects the **business function**, not just page name.

### ⚠️ Avoid generic/meaningless modules:
❌ BAD: \`navigation_\`, \`page_\`, \`screen_\`, \`app_\` (too generic)
❌ BAD: \`tap_confirm\`, \`click_button\` (no business context)
✅ GOOD: \`swap_tap_confirm\`, \`order_tap_cancel\` (clear business intent)

---

## ⚠️ MERGE SIMILAR ELEMENTS (Use properties to distinguish)

**Same type of UI elements → ONE event + property, NOT separate events.**

### Example - Trading page tabs:
❌ BAD: \`trading_tap_swap\`, \`trading_tap_bridge\`, \`trading_tap_limit\` (3 events)
✅ GOOD: \`trading_tap_tab\` + \`tab_name\` = "swap" | "bridge" | "limit" (1 event)

### Merge patterns:

| Module | UI Element | Event Name | Key Property |
|--------|------------|------------|--------------|
| trading | Tab bar | \`trading_tap_tab\` | \`tab_name\`: swap, bridge, limit |
| main | Bottom nav | \`main_tap_tab\` | \`tab_name\`: home, market, swap, earn |
| market | Token row | \`market_tap_token\` | \`token_symbol\`: BTC, ETH |
| order | Order card | \`order_tap_card\` | \`order_id\`, \`order_status\` |
| home | Banner | \`home_tap_banner\` | \`banner_id\`, \`position\` |
| market | Filter chip | \`market_tap_filter\` | \`filter_type\`, \`filter_value\` |

---

## 🎯 WHAT TO TRACK (Product Expert Guidelines)

### ✅ MUST TRACK - High business value:
| Element Type | Why Track | Example |
|--------------|-----------|---------|
| **核心转化按钮** | 漏斗分析关键节点 | Swap确认、发送确认、下单 |
| **功能入口** | 用户路径分析 | 点击进入Swap、进入订单详情 |
| **关键选择** | 用户决策分析 | 选择代币、选择网络、选择订单类型 |
| **Tab切换** | 功能使用分布 | 交易类型Tab、底部导航 |
| **列表项点击** | 内容热度分析 | 点击代币行、点击订单卡片 |
| **收藏/关注** | 用户偏好 | 添加收藏、设置价格提醒 |
| **搜索** | 用户需求洞察 | 搜索代币、搜索DApp |
| **筛选/排序** | 使用习惯分析 | 按价格排序、按网络筛选 |

### ❌ DO NOT TRACK - Low/no value:
| Element Type | Why Skip |
|--------------|----------|
| **返回/关闭按钮** | 通用导航，无业务意义 (除非是放弃流程的关键节点) |
| **纯展示文本** | 静态内容，无交互 |
| **Loading状态** | 系统状态，非用户行为 |
| **错误弹窗关闭** | 被动操作，无分析价值 |
| **键盘收起** | 系统行为 |
| **下拉刷新** | 太频繁，无业务洞察 |
| **滚动浏览** | 除非是关键内容曝光 |
| **复制成功Toast** | 结果反馈，不是决策点 |
| **重复导航** | 已在其他地方埋点 |
| **装饰性图标** | 无交互功能 |

### 🤔 CONDITIONAL - Depends on context:
| Element | Track If... | Skip If... |
|---------|-------------|------------|
| 取消按钮 | 放弃核心流程(如取消交易) | 只是关闭弹窗 |
| 帮助/FAQ | 是业务相关帮助 | 是通用说明 |
| 分享按钮 | 分享业务内容(如分享收款码) | 分享App本身 |
| 设置项 | 影响核心功能(如滑点设置) | 是UI偏好(如暗色模式) |

---

## CATEGORY - Business function categorization

**Don't use pre-defined lists. Understand the BUSINESS FUNCTION.**

✅ GOOD categories (business-focused):
- Transaction (交易) - for swap/send/receive actions
- Portfolio (资产) - for wallet/balance views
- Order Management (订单) - for order operations
- Market Research (行情) - for price/chart viewing
- DeFi (DeFi) - for staking/lending
- Account (账户) - for settings/security

❌ BAD categories (generic/meaningless):
- Navigation (导航) - too generic
- Page (页面) - not business-focused
- Button (按钮) - describes UI, not function
- General (通用) - meaningless

**Key**: Category should answer "What business goal is this supporting?"

---

## TRIGGER CONDITION - Business scenario analysis

**Don't just say "用户点击时" - explain the BUSINESS SCENARIO!**

### Framework: When + Why + What happens
1. **When**: In what business situation does this happen?
2. **Why**: What is the user's goal/intent?
3. **What**: What business outcome does this trigger?

### Examples:

❌ BAD (shallow): "用户点击确认按钮时"
✅ GOOD (business): "用户确认Swap交易参数（代币、数量、滑点）后，点击确认按钮提交链上交易"

❌ BAD: "用户点击取消"
✅ GOOD: "用户在订单详情页查看未完成订单时，决定取消该订单并释放保证金"

❌ BAD: "用户切换Tab"
✅ GOOD: "用户在交易页面切换交易类型（Swap/Bridge/Limit）以使用不同的交易功能"

❌ BAD: "用户选择代币"
✅ GOOD: "用户在Swap页面选择要兑换的目标代币，用于确定兑换方向"

### Template:
"当用户[业务场景]时，[用户意图]，通过[操作]来[业务结果]"

---

## OUTPUT FORMAT

\`\`\`json
{
  "eventName": "snake_case_event_name",
  "eventDisplayName": "中文事件描述",
  "category": "业务功能分类（理解业务本质，不要用预设列表）",
  "triggerCondition": "详细的业务触发场景（包含：何时发生、用户意图、业务结果）",
  "properties": [
    {
      "key": "snake_case_key",
      "displayName": "中文属性名",
      "description": "属性的业务用途说明",
      "possibleValues": "可选值列表（如适用）"
    }
  ]
}
\`\`\`

REMEMBER: 
- Understand the BUSINESS CONTEXT deeply, not just UI elements
- Category = business function, not page name
- Trigger condition = business scenario with user intent
- **Focus on WHY users do this, not just WHAT they click**`;

const TEXT_SYSTEM_PROMPT = `You are a Product Manager analyzing a **Web3 Wallet App** to generate precise tracking events.

Deeply understand the business context from element texts and page context.

---

## EVENT NAMING: \`{module}_{action}_{element}\` in **snake_case**

### Structure: module (business function) + action + element

Module = **business function**, not page name. Ask: "What is the user trying to accomplish?"

Examples:
- User swapping tokens → \`swap_tap_confirm\`, \`swap_select_token\`
- User managing orders → \`order_tap_cancel\`, \`order_view_detail\`
- User browsing market → \`market_tap_token\`, \`market_toggle_watchlist\`
- User sending crypto → \`send_input_address\`, \`send_submit_transfer\`
- User viewing portfolio → \`wallet_tap_asset\`, \`wallet_view_balance\`

---

## ⚠️ MERGE SIMILAR ELEMENTS

Same-type elements → ONE event + property:
- ❌ \`tap_tab\` → ✅ \`trading_tap_tab\` + \`tab_name\`
- ❌ \`tap_token_btc\` → ✅ \`market_tap_token\` + \`token_symbol\`

---

## CATEGORY - Business function

**Understand business essence, don't use generic labels.**

✅ GOOD: Transaction, Portfolio, Order Management, Market Research, DeFi, Account
❌ BAD: Navigation, Page, Button, General (too generic)

Category should answer: "What business goal does this support?"

---

## TRIGGER CONDITION - Business scenario

**Explain the business scenario, not just "用户点击"!**

Framework: When + Why + What
- When: In what business situation?
- Why: User's goal/intent?
- What: Business outcome?

Examples:
- ❌ BAD: "用户点击确认"
- ✅ GOOD: "用户确认Swap交易参数后，点击确认提交链上交易"

- ❌ BAD: "用户选择Tab"
- ✅ GOOD: "用户在交易页面切换交易类型（Swap/Bridge/Limit）以使用不同功能"

---

## OUTPUT:

\`\`\`json
{
  "eventName": "snake_case_event",
  "eventDisplayName": "中文描述",
  "category": "业务功能分类（深入理解业务本质）",
  "triggerCondition": "详细业务场景（包含何时、为何、结果）",
  "properties": [{"key": "snake_case", "displayName": "中文", "description": "业务用途", "possibleValues": "可选值"}]
}
\`\`\`

**Focus on business understanding over UI description.**`;

export async function generateTrackingForNode(
  settings: Settings,
  input: InteractiveNodeInfo & { platform?: 'App' | 'Web' }
): Promise<Omit<TrackingEvent, 'id' | 'nodeId' | 'nodeName' | 'parentFrameName'>> {
  
  const useVision = isVisionModel(settings.model) && input.pageScreenshotBase64;
  
  let messages: ChatMessage[];
  
  if (useVision && input.pageScreenshotBase64) {
    // Build multimodal message with screenshots
    const contentParts: (TextContent | ImageContent)[] = [];
    
    // Add page screenshot for context
    contentParts.push({
      type: 'text',
      text: '## Full Page Screenshot (for context):',
    });
    contentParts.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${input.pageScreenshotBase64}` },
    });
    
    // Add element screenshot if available
    if (input.screenshotBase64) {
      contentParts.push({
        type: 'text',
        text: '## Element to Track:',
      });
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${input.screenshotBase64}` },
      });
    }
    
    // Add text context as backup
    contentParts.push({
      type: 'text',
      text: `
## Element Info:
- Name: ${input.nodeName}
- Type: ${input.elementType}
- Text: ${input.text || '(no text)'}
- Component: ${input.componentName || 'N/A'}
- Page: ${input.parentFrameName}

## Page Texts (for reference):
${input.pageContextTexts.slice(0, 30).join(', ')}

Generate a tracking event based on what you SEE in the screenshots.`,
    });
    
    messages = [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      { role: 'user', content: contentParts },
    ];
  } else {
    // Text-only fallback
    const userPrompt = JSON.stringify({
      element: {
        name: input.nodeName,
        type: input.elementType,
        text: input.text || '(no text)',
        componentName: input.componentName,
      },
      siblingTexts: input.siblingTexts,
      pageContextTexts: input.pageContextTexts,
      pageName: input.parentFrameName,
    }, null, 2);
    
    messages = [
      { role: 'system', content: TEXT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];
  }

  const raw = await openRouterChat(settings, messages);
  
  // Extract JSON
  const jsonText = extractJsonArray(raw) || extractJsonObject(raw);

  try {
    const parsed = JSON.parse(jsonText);

    const eventName = String(parsed.eventName || 'unknown_event');
    const eventDisplayName = String(parsed.eventDisplayName || parsed.eventName || '未知事件');
    
    // Let AI decide category, only use inference as last resort
    let category = String(parsed.category || '');
    if (!category || category === 'General' || category === 'Navigation') {
      category = inferCategoryFromContext(input.pageContextTexts);
    }
    
    // Trigger condition should have business context
    let triggerCondition = String(parsed.triggerCondition || '');
    if (!triggerCondition || triggerCondition.length < 10) {
      // Generate a better default with element context
      triggerCondition = `用户在${input.parentFrameName}页面与"${input.text || input.nodeName}"交互时触发`;
    }

    const propsRaw = Array.isArray(parsed.properties) ? parsed.properties : [];
    const properties: TrackingProperty[] = propsRaw
      .filter((p: any) => p && typeof p === 'object' && p.key)
      .slice(0, 6)
      .map((p: any) => ({
        key: toSnakeCase(String(p.key)),
        displayName: String(p.displayName || p.key),
        description: String(p.description || ''),
        possibleValues: p.possibleValues ? String(p.possibleValues) : undefined,
      }));

    if (properties.length === 0) {
      properties.push(...inferPropertiesFromContext(input.pageContextTexts));
    }

    return {
      elementType: input.elementType,
      eventName,
      eventDisplayName,
      category,
      triggerCondition,
      properties,
      verified: false,
    };
  } catch {
    const category = inferCategoryFromContext(input.pageContextTexts);
    const eventName = inferEventNameFromContext(input.nodeName, input.text, input.pageContextTexts);
    
    return {
      elementType: input.elementType,
      eventName,
      eventDisplayName: `${input.text || input.nodeName}点击`,
      category,
      triggerCondition: `用户在${input.parentFrameName}页面点击"${input.text || input.nodeName}"时触发`,
      properties: [
        { key: 'source_page', displayName: '来源页面', description: '用户从哪个页面触发该操作' },
        { key: 'element_name', displayName: '元素名称', description: '被点击元素的名称' },
      ],
      verified: false,
    };
  }
}

function toSnakeCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

/**
 * Extract JSON array from AI response with balanced bracket matching.
 */
function extractJsonArray(raw: string): string {
  const codeBlockMatch = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (codeBlockMatch) return codeBlockMatch[1];
  
  const startIdx = raw.indexOf('[');
  if (startIdx === -1) return '';
  
  // Simple extraction for now, balanced matching is better but complex to inline perfectly without helper
  // Fallback to last closing bracket
  const lastIdx = raw.lastIndexOf(']');
  if (lastIdx > startIdx) return raw.slice(startIdx, lastIdx + 1);
  return '';
}

function extractJsonObject(raw: string): string {
  const codeBlockMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) return codeBlockMatch[1];
  
  const startIdx = raw.indexOf('{');
  if (startIdx === -1) return '{}';
  const lastIdx = raw.lastIndexOf('}');
  if (lastIdx > startIdx) return raw.slice(startIdx, lastIdx + 1);
  return '{}';
}

function inferCategoryFromContext(texts: string[]): string {
  const joined = texts.join(' ').toLowerCase();
  
  // Only infer for very clear business contexts
  // Order management
  if (joined.includes('order') && (joined.includes('cancel') || joined.includes('limit') || joined.includes('open'))) 
    return 'Order Management';
  
  // Transaction-related (swap/send)
  if (joined.includes('swap') || joined.includes('exchange') || joined.includes('slippage')) 
    return 'Transaction';
  if (joined.includes('send') && (joined.includes('address') || joined.includes('recipient'))) 
    return 'Transaction';
  if (joined.includes('receive') || joined.includes('deposit')) 
    return 'Transaction';
  
  // Market/Research
  if (joined.includes('market') || joined.includes('price') || joined.includes('chart') || joined.includes('watchlist')) 
    return 'Market Research';
  
  // DeFi
  if (joined.includes('stake') || joined.includes('apy') || joined.includes('earn') || joined.includes('yield')) 
    return 'DeFi';
  
  // Account/Settings
  if (joined.includes('setting') || joined.includes('security') || joined.includes('backup') || joined.includes('biometric')) 
    return 'Account';
  
  // Portfolio/Assets
  if (joined.includes('balance') || joined.includes('asset') || joined.includes('portfolio') || joined.includes('wallet')) 
    return 'Portfolio';
  
  // Default: let AI decide, don't force a generic category
  return 'General';
}

function inferEventNameFromContext(nodeName: string, text: string | undefined, pageTexts: string[]): string {
  const name = (text || nodeName).toLowerCase();
  const context = pageTexts.join(' ').toLowerCase();
  
  let module = 'app';
  if (context.includes('order')) module = 'order';
  else if (context.includes('swap')) module = 'swap';
  else if (context.includes('market')) module = 'market';
  else if (context.includes('send')) module = 'send';
  
  // Fallback construction
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return `${module}_tap_${cleaned || 'element'}`;
}

function inferPropertiesFromContext(texts: string[]): TrackingProperty[] {
  const joined = texts.join(' ').toLowerCase();
  const props: TrackingProperty[] = [];
  
  // Always add source_page as base property
  props.push({ key: 'source_page', displayName: '来源页面', description: '用户从哪个页面触发' });
  
  // Order-related properties
  if (joined.includes('order') || joined.includes('limit')) {
    props.push(
      { key: 'order_id', displayName: '订单ID', description: '订单唯一标识' },
      { key: 'order_type', displayName: '订单类型', description: '订单类型', possibleValues: 'limit, market' },
      { key: 'order_side', displayName: '订单方向', description: '买入或卖出', possibleValues: 'buy, sell' },
      { key: 'order_status', displayName: '订单状态', description: '当前状态', possibleValues: 'open, filled, cancelled, expired' }
    );
  }
  
  // Swap-related properties
  if (joined.includes('swap') || joined.includes('exchange')) {
    props.push(
      { key: 'token_from', displayName: '源代币', description: '兑换的源代币符号' },
      { key: 'token_to', displayName: '目标代币', description: '兑换的目标代币符号' },
      { key: 'amount_from', displayName: '源数量', description: '兑换的源代币数量' },
      { key: 'slippage', displayName: '滑点', description: '设置的滑点百分比' }
    );
  }
  
  return props.slice(0, 5);
}

export async function attachTrackingToLayer(nodeId: string, event: TrackingEvent): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error('Node not found');
  if (!('setPluginData' in node)) throw new Error('Node does not support pluginData');

  node.setPluginData(
    'onekey_tracking_event',
    JSON.stringify({
      eventName: event.eventName,
      eventDisplayName: event.eventDisplayName,
      category: event.category,
      triggerCondition: event.triggerCondition,
      properties: event.properties,
      verified: event.verified,
    })
  );
}

export async function readTrackingFromLayer(
  nodeId: string
): Promise<Omit<TrackingEvent, 'id' | 'nodeId' | 'nodeName' | 'parentFrameName' | 'elementType'> | null> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) return null;
  if (!('getPluginData' in node)) return null;

  const raw = node.getPluginData('onekey_tracking_event');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return {
      eventName: String(parsed.eventName || ''),
      eventDisplayName: String(parsed.eventDisplayName || ''),
      category: String(parsed.category || ''),
      triggerCondition: String(parsed.triggerCondition || ''),
      properties: Array.isArray(parsed.properties) ? parsed.properties : [],
      verified: !!parsed.verified,
    };
  } catch {
    return null;
  }
}

// ============ VISION-BASED PAGE ANALYSIS ============

const VISION_PAGE_ANALYSIS_PROMPT = `You are an expert at analyzing **Web3 Wallet App** UI screenshots to identify ALL interactive elements that need tracking.

---

## 🎯 WHAT TO TRACK (Product Expert Guidelines)

### ✅ MUST TRACK - Business value:
| Element | Why | Example Event |
|---------|-----|---------------|
| 核心转化按钮 | 漏斗关键节点 | \`swap_tap_confirm\`, \`send_submit_transfer\` |
| 功能Tab切换 | 功能使用分布 | \`trading_tap_tab\` + tab_name |
| 代币/订单列表项 | 内容热度 | \`market_tap_token\`, \`order_tap_card\` |
| 关键选择器 | 用户决策 | \`swap_select_token\`, \`send_select_network\` |
| 收藏/关注 | 用户偏好 | \`market_toggle_watchlist\` |
| 搜索操作 | 需求洞察 | \`market_tap_search\` |
| 筛选/排序 | 习惯分析 | \`order_tap_filter\` |
| 功能入口 | 路径分析 | \`wallet_tap_swap_entry\` |

### ❌ SKIP - No business value:
| Element | Why Skip |
|---------|----------|
| 返回按钮 / 关闭X | 通用导航，无业务意义 |
| Loading / 加载中 | 系统状态 |
| 错误弹窗关闭 | 被动操作 |
| 下拉刷新 | 太频繁 |
| Toast提示 | 结果反馈 |
| 纯展示文本 | 无交互 |
| 装饰图标 | 无功能 |

---

## EVENT NAMING CONVENTION

Format: \`{module}_{action}_{element}\` in **snake_case**

### Structure:
1. **module**: Business context - identify from screenshot (swap, trading, order, market, wallet, send)
2. **action**: User action (tap, view, submit, toggle, select, input)
3. **element**: UI element (confirm, cancel, tab, token, card, button)

### Examples:
| Module | Action | Element | Full Event Name |
|--------|--------|---------|-----------------|
| swap | tap | confirm | \`swap_tap_confirm\` |
| trading | tap | tab | \`trading_tap_tab\` |
| order | tap | cancel | \`order_tap_cancel\` |
| market | tap | token | \`market_tap_token\` |
| swap | select | token | \`swap_select_token\` |
| send | input | address | \`send_input_address\` |
| market | toggle | watchlist | \`market_toggle_watchlist\` |
| send | submit | transfer | \`send_submit_transfer\` |

---

## ⚠️ MERGE SIMILAR ELEMENTS

**Same-type elements → ONE event + property to distinguish**

❌ BAD: \`trading_tap_swap\`, \`trading_tap_bridge\` (separate events)
✅ GOOD: \`trading_tap_tab\` + \`tab_name\` = "swap" | "bridge" | "limit"

| Module | UI Element | Event Name | Key Property |
|--------|------------|------------|--------------|
| trading | Tab bar | \`trading_tap_tab\` | \`tab_name\` |
| main | Bottom nav | \`main_tap_tab\` | \`tab_name\` |
| market | Token row | \`market_tap_token\` | \`token_symbol\` |
| order | Order card | \`order_tap_card\` | \`order_id\` |
| home | Banner | \`home_tap_banner\` | \`banner_id\` |

---

## CATEGORY & TRIGGER CONDITION (CRITICAL)

### Category - Business function, not page name
**Understand business essence:**
✅ GOOD: Transaction, Portfolio, Order Management, Market Research, DeFi, Account
❌ BAD: Navigation, Page, Button, General, Screen

Ask: "What business goal does this support?"

### Trigger Condition - Business scenario with intent
**Framework: When + Why + What**

Examples:
- ❌ BAD: "用户点击取消"
- ✅ GOOD: "用户在订单详情页决定取消未完成订单以释放保证金"

- ❌ BAD: "用户切换Tab"
- ✅ GOOD: "用户在交易页面切换交易类型（Swap/Bridge/Limit）以使用不同功能"

---

## OUTPUT FORMAT

\`\`\`json
[
  {
    "elementDescription": "元素位置和外观描述 (e.g., '右上角红色Cancel按钮')",
    "eventName": "snake_case_event_name",
    "eventDisplayName": "中文事件描述",
    "category": "业务功能分类（理解业务本质，避免Navigation等通用词）",
    "triggerCondition": "业务场景描述（包含何时发生、用户意图、业务结果）",
    "properties": [
      {"key": "snake_case", "displayName": "中文", "description": "业务用途说明", "possibleValues": "可选值"}
    ]
  }
]
\`\`\`

**Remember: Deep business understanding > Surface UI description**
`;

export interface ElementHint {
  nodeName: string;
  nodeType: string;
  text?: string;
}

export interface VisionAnalysisInput {
  pageScreenshotBase64: string;
  frameName: string;
  pageTexts: string[];
  elementHints: ElementHint[];  // 图层名称作为参考（低权重）
}

export interface VisionAnalysisOutput {
  elementDescription: string;  // AI 描述的元素位置/外观
  eventName: string;
  eventDisplayName: string;
  category: string;
  triggerCondition: string;
  properties: TrackingProperty[];
}

/**
 * Analyze a page screenshot with AI Vision to identify all interactive elements
 * and generate tracking events. Element names are provided as hints (low weight).
 */
export async function analyzePageWithVision(
  settings: Settings,
  input: VisionAnalysisInput
): Promise<VisionAnalysisOutput[]> {
  if (!isVisionModel(settings.model)) {
    throw new Error('请使用支持 Vision 的模型（如 Claude 3.5 Sonnet, GPT-4o, Gemini）');
  }
  
  if (!input.pageScreenshotBase64) {
    throw new Error('需要页面截图');
  }
  
  // Build element hints list (as low-weight reference)
  const hintsText = input.elementHints.length > 0
    ? `\n\n## Element Names from Design File (HINTS ONLY - may be inaccurate):
${input.elementHints.slice(0, 50).map((h, i) => `${i + 1}. ${h.nodeName} (${h.nodeType})${h.text ? ` - "${h.text}"` : ''}`).join('\n')}

Note: These names are just hints. Many may be generic like "Frame 123". Trust what you SEE in the screenshot.`
    : '';
  
  const contentParts: (TextContent | ImageContent)[] = [
    {
      type: 'text',
      text: '## Page Screenshot (ANALYZE THIS):',
    },
    {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${input.pageScreenshotBase64}` },
    },
    {
      type: 'text',
      text: `## Page Context:
- Frame Name: ${input.frameName} (may not be meaningful)
- Visible Text on Page: ${input.pageTexts.slice(0, 40).join(', ')}
${hintsText}

**YOUR TASK:**
1. LOOK at the screenshot and identify the PAGE TYPE (Orders? Trading? Settings?)
2. Find ALL interactive elements (buttons, tabs, cards, inputs, toggles, etc.)
3. Generate a tracking event for EACH interactive element

Output JSON array. Be comprehensive - identify ALL clickable/interactive elements.`,
    },
  ];
  
  const messages: ChatMessage[] = [
    { role: 'system', content: VISION_PAGE_ANALYSIS_PROMPT },
    { role: 'user', content: contentParts },
  ];
  
  const raw = await openRouterChat(settings, messages);
  
  console.log('[Vision Analysis] Raw AI response length:', raw.length);
  
  const jsonText = extractJsonArray(raw);
  
  if (!jsonText) {
    console.error('[Vision Analysis] Could not find JSON array in response:', raw);
    throw new Error('AI 未返回有效的 JSON 数组，请重试或更换模型');
  }
  
  try {
    const parsed = JSON.parse(jsonText);
    
    if (!Array.isArray(parsed)) {
      console.error('[Vision Analysis] Parsed result is not array:', typeof parsed);
      throw new Error('AI 返回的不是数组格式');
    }
    
    if (parsed.length === 0) {
      throw new Error('AI 未识别到任何交互元素，请确认选择的是完整页面');
    }
    
    const results: VisionAnalysisOutput[] = [];
    
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      if (!item.eventName) continue;
      
      const propsRaw = Array.isArray(item.properties) ? item.properties : [];
      const properties: TrackingProperty[] = propsRaw
        .filter((p: any) => p && typeof p === 'object' && p.key)
        .slice(0, 5)
        .map((p: any) => ({
          key: toSnakeCase(String(p.key)),
          displayName: String(p.displayName || p.key),
          description: String(p.description || ''),
          possibleValues: p.possibleValues ? String(p.possibleValues) : undefined,
        }));
      
      // Let AI decide category, avoid generic defaults
      let category = String(item.category || 'General');
      if (category === 'Navigation' || category === 'Page' || category === 'Button') {
        category = 'General'; // Flag for review
      }
      
      // Ensure trigger condition has business context
      let triggerCondition = String(item.triggerCondition || '');
      if (!triggerCondition || triggerCondition.length < 10) {
        triggerCondition = `用户在${input.frameName}页面与该元素交互时触发`;
      }
      
      results.push({
        elementDescription: String(item.elementDescription || item.element || '未知元素'),
        eventName: String(item.eventName),
        eventDisplayName: String(item.eventDisplayName || item.eventName),
        category,
        triggerCondition,
        properties: properties.length > 0 ? properties : [
          { key: 'source_page', displayName: '来源页面', description: '用户从哪个页面触发该操作' }
        ],
      });
    }
    
    return results;
  } catch (e) {
    const error = e as Error;
    console.error('[Vision Analysis] Parse error:', error.message);
    
    if (error.message.includes('AI ')) {
      throw error;
    }
    
    throw new Error(`JSON 解析失败: ${error.message}。请重试或更换模型。`);
  }
}
