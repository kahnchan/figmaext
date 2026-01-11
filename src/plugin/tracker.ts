import type { Settings, TrackingEvent, TrackingProperty } from '@shared/messages';
import type { InteractiveNodeInfo } from './scan';
import { openRouterChat, isVisionModel, type ChatMessage, type TextContent, type ImageContent } from './openrouter';

const VISION_SYSTEM_PROMPT = `You are an expert at analyzing mobile app UI screenshots to generate tracking events.

I will show you:
1. A screenshot of the FULL PAGE/SCREEN for context
2. A screenshot of the SPECIFIC ELEMENT the user wants to track

Your task:
1. Look at the full page to understand the CONTEXT (what feature/page is this?)
2. Look at the element to understand WHAT ACTION it triggers
3. Generate a tracking event that accurately reflects the business logic

**CRITICAL:**
- Base your analysis on what you SEE in the screenshots
- The page screenshot tells you the context (Orders page? Swap page? Settings?)
- The element screenshot tells you the action (Cancel button? Confirm? Toggle?)

**Event Naming (camelCase):**
- cancelLimitOrder (not just "cancel")
- confirmSwap (not just "confirm")  
- toggleWatchlist (not just "toggle")

**Categories:**
- Orders: order lists, limit orders, order history
- Trade: swap, exchange, trading
- Market: prices, charts, token lists
- Wallet: balances, assets
- Send/Receive: transfers
- Settings: app settings
- Onboarding: ONLY initial wallet setup

Output JSON only:
{
  "eventName": "camelCase",
  "eventDisplayName": "中文描述",
  "category": "based on page context",
  "triggerCondition": "触发时机",
  "properties": [
    {"key": "snake_case", "displayName": "中文", "description": "说明", "possibleValues": "可选值"}
  ]
}`;

const TEXT_SYSTEM_PROMPT = `You are a tracking event generator for a Web3 Wallet app.

Analyze the UI element and page context texts to generate an appropriate tracking event.

**CRITICAL:** Base your response on the ACTUAL texts shown on the page.
- If texts include "Open orders", "Limit price", "Cancel" → this is an ORDERS page
- If texts include "Swap", "Exchange" → this is a TRADE page
- DO NOT guess features that aren't shown

Output JSON only:
{
  "eventName": "camelCase",
  "eventDisplayName": "中文描述",
  "category": "based on context",
  "triggerCondition": "触发时机",
  "properties": [{"key": "snake_case", "displayName": "中文", "description": "说明", "possibleValues": "可选值"}]
}`;

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
  const match = raw.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : raw;

  try {
    const parsed = JSON.parse(jsonText);

    const eventName = String(parsed.eventName || 'unknownEvent');
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
      properties: inferPropertiesFromContext(input.pageContextTexts),
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

function inferCategoryFromContext(texts: string[]): string {
  const joined = texts.join(' ').toLowerCase();
  
  if (joined.includes('order') || joined.includes('limit price') || joined.includes('open orders')) return 'Orders';
  if (joined.includes('swap') || joined.includes('exchange')) return 'Trade';
  if (joined.includes('send') && (joined.includes('address') || joined.includes('amount'))) return 'Send';
  if (joined.includes('receive') || joined.includes('deposit')) return 'Receive';
  if (joined.includes('market') || joined.includes('price') || joined.includes('chart')) return 'Market';
  if (joined.includes('nft')) return 'NFT';
  if (joined.includes('dapp') || joined.includes('connect')) return 'DApp';
  if (joined.includes('setting')) return 'Settings';
  if (joined.includes('onboarding') || joined.includes('welcome') || joined.includes('create wallet')) return 'Onboarding';
  
  return 'Wallet';
}

function inferEventNameFromContext(nodeName: string, text: string | undefined, pageTexts: string[]): string {
  const name = (text || nodeName).toLowerCase();
  const context = pageTexts.join(' ').toLowerCase();
  
  if (context.includes('order')) {
    if (name.includes('cancel')) return 'cancelOrder';
    if (name.includes('detail') || name.includes('view')) return 'viewOrderDetail';
    if (name.includes('history')) return 'viewOrderHistory';
  }
  
  if (name.includes('swap')) return 'confirmSwap';
  if (name.includes('send')) return 'confirmSend';
  if (name.includes('cancel')) return 'cancelAction';
  if (name.includes('confirm')) return 'confirmAction';
  
  const cleaned = name.replace(/[^a-zA-Z]/g, '');
  return cleaned ? `tap${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}` : 'tapElement';
}

function inferPropertiesFromContext(texts: string[]): TrackingProperty[] {
  const joined = texts.join(' ').toLowerCase();
  const props: TrackingProperty[] = [];
  
  if (joined.includes('order') || joined.includes('limit')) {
    props.push(
      { key: 'order_id', displayName: '订单ID', description: '订单唯一标识' },
      { key: 'order_type', displayName: '订单类型', description: '订单类型', possibleValues: 'limit, market' },
      { key: 'order_status', displayName: '订单状态', description: '当前状态', possibleValues: 'open, filled, cancelled' }
    );
  }
  
  if (joined.includes('symbol') || joined.includes('token') || joined.includes('matic') || joined.includes('usdc')) {
    props.push(
      { key: 'token_symbol', displayName: '代币符号', description: '代币名称' },
      { key: 'token_amount', displayName: '代币数量', description: '数量' }
    );
  }
  
  if (joined.includes('network') || joined.includes('ethereum') || joined.includes('polygon')) {
    props.push(
      { key: 'network', displayName: '网络', description: '区块链网络', possibleValues: 'ethereum, polygon, bsc' }
    );
  }
  
  if (props.length === 0) {
    props.push({ key: 'source_screen', displayName: '来源页面', description: '用户从哪个页面触发' });
  }
  
  return props.slice(0, 4);
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

const VISION_PAGE_ANALYSIS_PROMPT = `You are an expert at analyzing mobile app UI screenshots to identify ALL interactive elements that need tracking.

**YOUR TASK:**
1. LOOK at the screenshot carefully - this is a Web3 Wallet app
2. IDENTIFY all interactive elements (buttons, tabs, cards, inputs, toggles, links, etc.)
3. For EACH interactive element, generate a tracking event

**CRITICAL - Use your VISUAL understanding:**
- Don't just rely on element names - they may be inaccurate (e.g., "Frame 123")
- LOOK at what the element actually IS and DOES
- Understand the PAGE CONTEXT: Is this an Orders page? Trading page? Settings?

**I will also provide a list of element names from the design file as HINTS:**
- These names are OPTIONAL references - some may be useful, many may not
- Prioritize what you SEE in the screenshot over the element names
- If a name like "CancelButton" matches what you see, use that info
- If a name like "Frame 34494" is meaningless, ignore it

**Event Naming (camelCase):**
- Be specific and contextual: "cancelLimitOrder" not just "cancel"
- Include page context: "viewOrderDetail" not just "view"
- Match the actual business action shown in the UI

**Categories:**
- Orders: order lists, limit orders, order history, order details
- Trade: swap, exchange, trading pairs
- Market: prices, charts, token lists, watchlist
- Wallet: balances, assets, portfolio overview
- Send: sending crypto transactions
- Receive: receiving crypto, deposit
- Settings: app settings, preferences
- Onboarding: initial wallet setup, welcome screens

**Output JSON array - one object per interactive element you identify:**
[
  {
    "elementDescription": "描述这个元素的位置和外观 (e.g., '右上角的Cancel按钮')",
    "eventName": "camelCase event name",
    "eventDisplayName": "中文描述",
    "category": "category",
    "triggerCondition": "触发时机 (when does this event fire)",
    "properties": [
      {"key": "snake_case", "displayName": "中文名", "description": "说明", "possibleValues": "可选值 if applicable"}
    ]
  },
  ...
]

**IMPORTANT:** Identify ALL meaningful interactive elements. Common ones include:
- Buttons (primary actions, cancel, confirm, submit)
- Tab switches
- List items / Cards that can be tapped
- Input fields
- Toggles / Switches
- Navigation elements
- Icons that are clickable`;

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

// (Legacy generateTrackingBatch removed - now using analyzePageWithVision)

// ============ NEW: VISION-FIRST PAGE ANALYSIS ============

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
  console.log('[Vision Analysis] Raw AI response preview:', raw.slice(0, 500));
  
  // Try multiple patterns to extract JSON array
  let jsonText = '';
  
  // Pattern 1: Standard JSON array
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    jsonText = arrayMatch[0];
  }
  
  // Pattern 2: JSON in markdown code block
  if (!jsonText) {
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      const inner = codeBlockMatch[1].trim();
      if (inner.startsWith('[')) {
        jsonText = inner;
      }
    }
  }
  
  // Pattern 3: Use raw if it looks like JSON
  if (!jsonText && raw.trim().startsWith('[')) {
    jsonText = raw.trim();
  }
  
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
          { key: 'source_screen', displayName: '来源页面', description: '当前页面' }
        ],
      });
    }
    
    if (results.length === 0) {
      console.error('[Vision Analysis] No valid events parsed from:', parsed);
      throw new Error('AI 返回的数据无法解析为有效埋点，请重试');
    }
    
    console.log('[Vision Analysis] Successfully parsed', results.length, 'events');
    return results;
  } catch (e) {
    const error = e as Error;
    console.error('[Vision Analysis] Parse error:', error.message);
    console.error('[Vision Analysis] jsonText was:', jsonText.slice(0, 300));
    
    // If it's our own error, rethrow
    if (error.message.includes('AI ')) {
      throw error;
    }
    
    throw new Error(`JSON 解析失败: ${error.message}。请重试或更换模型。`);
  }
}
