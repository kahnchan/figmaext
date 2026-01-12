import type { Settings, TrackingEvent, TrackingProperty } from '@shared/messages';
import type { InteractiveNodeInfo } from './scan';
import { openRouterChat, isVisionModel, type ChatMessage, type TextContent, type ImageContent } from './openrouter';

const VISION_SYSTEM_PROMPT = `You are an expert at analyzing mobile app UI screenshots to generate tracking events for a **Web3 Wallet App**.

I will show you:
1. A screenshot of the FULL PAGE/SCREEN for context
2. A screenshot of the SPECIFIC ELEMENT the user wants to track

Your task:
1. Understand the PAGE CONTEXT (what feature/module is this?)
2. Identify WHAT ACTION the element triggers
3. Generate a precise tracking event following the naming conventions below

---

## EVENT NAMING CONVENTION (CRITICAL)

Format: \`{module}_{action}_{element}\` in **snake_case**

### Structure:
1. **module**: Business context / page (swap, order, market, wallet, send, trading, earn)
2. **action**: What user does (tap, view, submit, toggle, select, input)
3. **element**: UI element (confirm, cancel, tab, token, card, button)

### Module First - Identify from screenshot context:
| Module | When to use | Example Events |
|--------|-------------|----------------|
| \`swap_\` | Swap/exchange page | \`swap_tap_confirm\`, \`swap_select_token\` |
| \`trading_\` | Trading page with tabs | \`trading_tap_tab\`, \`trading_view_chart\` |
| \`order_\` | Order list/detail | \`order_tap_cancel\`, \`order_view_detail\` |
| \`market_\` | Market/prices page | \`market_tap_token\`, \`market_toggle_watchlist\` |
| \`send_\` | Send crypto | \`send_input_address\`, \`send_submit_transfer\` |
| \`receive_\` | Receive/deposit | \`receive_tap_copy\`, \`receive_tap_share\` |
| \`wallet_\` | Portfolio/assets | \`wallet_tap_asset\`, \`wallet_view_balance\` |
| \`earn_\` | Staking/DeFi | \`earn_tap_stake\`, \`earn_tap_claim\` |
| \`settings_\` | App settings | \`settings_toggle_biometric\`, \`settings_tap_backup\` |
| \`home_\` | Home/dashboard | \`home_tap_banner\`, \`home_view_card\` |

### ⚠️ Module First, Always:
❌ BAD: \`tap_confirm\`, \`tap_tab\` (no business context)
✅ GOOD: \`swap_tap_confirm\`, \`trading_tap_tab\` (clear which feature)

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

## OUTPUT FORMAT

\`\`\`json
{
  "eventName": "snake_case_event_name",
  "eventDisplayName": "中文事件描述",
  "category": "category_name",
  "triggerCondition": "具体触发时机描述",
  "properties": [
    {
      "key": "snake_case_key",
      "displayName": "中文属性名",
      "description": "属性用途说明",
      "possibleValues": "可选值列表（如适用）"
    }
  ]
}
\`\`\`

REMEMBER: 
- Look at the ACTUAL UI elements in screenshots
- Be specific to the business context
- Don't guess features not visible in the UI
- **Focus on business value, skip low-value interactions**`;

const TEXT_SYSTEM_PROMPT = `You are a tracking event generator for a **Web3 Wallet App**.

Analyze the UI element texts and page context to generate a precise tracking event.

---

## EVENT NAMING: \`{module}_{action}_{element}\` in **snake_case**

### Structure: module (business) + action + element
- \`swap_\` → \`swap_tap_confirm\`, \`swap_select_token\`, \`swap_input_amount\`
- \`trading_\` → \`trading_tap_tab\`, \`trading_view_chart\`
- \`order_\` → \`order_tap_cancel\`, \`order_view_detail\`
- \`market_\` → \`market_tap_token\`, \`market_toggle_watchlist\`
- \`send_\` → \`send_input_address\`, \`send_submit_transfer\`
- \`wallet_\` → \`wallet_tap_asset\`, \`wallet_view_balance\`
- \`settings_\` → \`settings_toggle_biometric\`, \`settings_tap_backup\`

### Modules:
onboarding | wallet | market | swap | send | receive | order | earn | dapp | nft | settings | trading | home | main

---

## ⚠️ MODULE FIRST + MERGE

Module prefix required, merge same-type elements:
- ❌ \`tap_tab\` → ✅ \`trading_tap_tab\` + \`tab_name\`
- ❌ \`tap_token_btc\` → ✅ \`market_tap_token\` + \`token_symbol\`

---

## CONTEXT RECOGNITION:

| Page Keywords | Category | Typical Events |
|---------------|----------|----------------|
| Open orders, Limit, Cancel order | order | order_tap_cancel, order_view_detail |
| Swap, Exchange, Slippage | swap | swap_tap_confirm, swap_select_token |
| Send, Recipient, Amount | send | send_submit_transfer, send_input_address |
| Receive, Deposit, QR | receive | receive_tap_copy, receive_tap_share |
| Market, Price, Watchlist | market | market_tap_token, market_toggle_watchlist |
| Wallet, Balance, Assets | wallet | wallet_view_asset, wallet_tap_asset |
| Stake, APY, Rewards | earn | earn_tap_stake, earn_tap_claim |

---

## OUTPUT:

\`\`\`json
{
  "eventName": "snake_case_event",
  "eventDisplayName": "中文描述",
  "category": "category",
  "triggerCondition": "触发时机",
  "properties": [{"key": "snake_case", "displayName": "中文", "description": "说明", "possibleValues": "可选值"}]
}
\`\`\`

**CRITICAL:** Only use context visible in the provided texts. Do NOT guess features.`;

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
    const category = String(parsed.category || inferCategoryFromContext(input.pageContextTexts));
    const triggerCondition = String(parsed.triggerCondition || '用户触发时');

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
      eventDisplayName: `${input.text || input.nodeName}`,
      category,
      triggerCondition: '用户点击时触发',
      properties: [
        { key: 'source_page', displayName: '来源页面', description: '当前页面名称' },
        { key: 'element_name', displayName: '元素名称', description: '交互元素的名称' },
        { key: 'action_type', displayName: '交互类型', description: '用户操作类型 (tap, slide 等)' },
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
  
  // Order-related
  if (joined.includes('order') || joined.includes('limit price') || joined.includes('open orders')) return 'order';
  // Swap/Trade
  if (joined.includes('swap') || joined.includes('exchange') || joined.includes('slippage')) return 'swap';
  // Send
  if (joined.includes('send') && (joined.includes('address') || joined.includes('amount') || joined.includes('recipient'))) return 'send';
  // Receive
  if (joined.includes('receive') || joined.includes('deposit') || joined.includes('qr code')) return 'receive';
  // Market
  if (joined.includes('market') || joined.includes('price') || joined.includes('chart') || joined.includes('watchlist')) return 'market';
  // NFT
  if (joined.includes('nft') || joined.includes('collectible')) return 'nft';
  // DApp
  if (joined.includes('dapp') || joined.includes('connect') || joined.includes('walletconnect')) return 'dapp';
  // Earn/Staking
  if (joined.includes('stake') || joined.includes('apy') || joined.includes('earn') || joined.includes('rewards')) return 'earn';
  // Settings
  if (joined.includes('setting') || joined.includes('security') || joined.includes('backup')) return 'settings';
  // Onboarding
  if (joined.includes('onboarding') || joined.includes('welcome') || joined.includes('create wallet') || joined.includes('import wallet')) return 'onboarding';
  // Notification
  if (joined.includes('notification') || joined.includes('alert') || joined.includes('price alert')) return 'notification';
  
  return 'wallet';
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

export function attachTrackingToLayer(nodeId: string, event: TrackingEvent): void {
  const node = figma.getNodeById(nodeId);
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

export function readTrackingFromLayer(
  nodeId: string
): Omit<TrackingEvent, 'id' | 'nodeId' | 'nodeName' | 'parentFrameName' | 'elementType'> | null {
  const node = figma.getNodeById(nodeId);
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

## OUTPUT FORMAT

\`\`\`json
[
  {
    "elementDescription": "元素位置和外观描述 (e.g., '右上角红色Cancel按钮')",
    "eventName": "snake_case_event_name",
    "eventDisplayName": "中文事件描述",
    "category": "category_name",
    "triggerCondition": "触发时机描述",
    "properties": [
      {"key": "snake_case", "displayName": "中文", "description": "说明", "possibleValues": "可选值"}
    ]
  }
]
\`\`\`
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
      
      results.push({
        elementDescription: String(item.elementDescription || item.element || '未知元素'),
        eventName: String(item.eventName),
        eventDisplayName: String(item.eventDisplayName || item.eventName),
        category: String(item.category || 'Wallet'),
        triggerCondition: String(item.triggerCondition || '用户点击时'),
        properties: properties.length > 0 ? properties : [
          { key: 'source_page', displayName: '来源页面', description: '当前页面' }
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
