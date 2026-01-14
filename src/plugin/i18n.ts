import { openRouterChat } from './openrouter';
import type { Settings, I18nKey, I18nResult } from '../shared/messages';

// Check if text should be filtered out (not needing translation)
function shouldFilterText(text: string): boolean {
  const trimmed = text.trim();
  
  // Empty or too short
  if (!trimmed || trimmed.length === 0) return true;
  
  // Pure numbers (including decimals)
  if (/^[\d.,\s]+$/.test(trimmed)) return true;
  
  // Percentages
  if (/^[+-]?\d+%$/.test(trimmed)) return true;
  
  // Currency amounts
  if (/^\$[\d.,]+$/.test(trimmed)) return true;
  
  // Crypto addresses (0x...)
  if (/^0x[a-fA-F0-9.]+$/.test(trimmed)) return true;
  
  // Short addresses like "21a2tg...y7hWUK"
  if (/^[a-zA-Z0-9]+\.\.\.[a-zA-Z0-9]+$/.test(trimmed)) return true;
  
  // Crypto amounts like "2.6985", "+100 USDC", "1 ETH"
  if (/^[+-]?[\d.,]+\s*(ETH|BTC|USDC|WETH|BNB|SOL|MATIC)?$/i.test(trimmed)) return true;
  
  // Single symbols
  if (/^[+\-→=]$/.test(trimmed)) return true;
  
  // Placeholder text that shouldn't be translated
  const placeholders = [
    'label', 'description', 'button', 'text', 'title',
    'placeholder', 'input', 'value', 'name', 'content',
    '(optional)', '(edited)'
  ];
  if (placeholders.includes(trimmed.toLowerCase())) return true;
  
  // Crypto token symbols (uppercase 2-5 letters)
  if (/^[A-Z]{2,5}$/.test(trimmed)) return true;
  
  // Common non-translatable patterns
  if (/^\d+\.\s*$/.test(trimmed)) return true; // "1.", "2."
  if (/^[A-Z]{2,5}\s*\/\s*[A-Z]{2,5}$/.test(trimmed)) return true; // "WETH / USDC"
  
  return false;
}

// Scan multiple Frames for all text nodes
export async function scanTextNodesMultiFrame(frameIds: string[]): Promise<{
  texts: Array<{
    nodeId: string;
    nodeName: string;
    frameName: string;
    textContent: string;
  }>;
  filteredCount: number;
}> {
  const texts: Array<{
    nodeId: string;
    nodeName: string;
    frameName: string;
    textContent: string;
  }> = [];
  
  let filteredCount = 0;
  
  for (const frameId of frameIds) {
    const container = await figma.getNodeByIdAsync(frameId) as SceneNode;
    if (!container) continue;
    
    // Support FRAME, COMPONENT, INSTANCE, GROUP
    if (container.type !== 'FRAME' && 
        container.type !== 'COMPONENT' && 
        container.type !== 'INSTANCE' && 
        container.type !== 'GROUP') {
      continue;
    }
    
    function traverse(node: SceneNode, frameName: string) {
      if (node.type === 'TEXT') {
        const content = node.characters.trim();
        
        // Filter out non-translatable text
        if (shouldFilterText(content)) {
          filteredCount++;
          return;
        }
        
        texts.push({
          nodeId: node.id,
          nodeName: node.name,
          frameName: frameName,
          textContent: content,
        });
      }
      if ('children' in node) {
        for (const child of (node as FrameNode | ComponentNode | InstanceNode | GroupNode).children) {
          traverse(child, frameName);
        }
      }
    }
    
    traverse(container, container.name);
  }
  
  return { texts, filteredCount };
}

// Export node as base64 screenshot (reusing from scan.ts)
export async function exportNodeAsBase64(nodeId: string, maxWidth: number = 1200): Promise<string | null> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('exportAsync' in node)) return null;

  try {
    const bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'WIDTH', value: maxWidth },
    });
    return figma.base64Encode(bytes);
  } catch (e) {
    console.error('[i18n] Export screenshot failed:', e);
    return null;
  }
}

// Use AI to generate all-English i18n keys
export async function generateI18nKeys(
  settings: Settings,
  frameNames: string[],
  texts: Array<{ nodeId: string; nodeName: string; frameName: string; textContent: string }>,
  screenshots?: string[],
  additionalPrompt?: string
): Promise<I18nResult> {
  const systemPrompt = `You are a professional i18n engineer for a crypto wallet app (OneKey). Generate Lokalise translation keys.

**CRITICAL: Filter out non-translatable content**

Do NOT generate keys for:
- Pure numbers: "1", "2.6985", "100"
- Crypto amounts: "$3,915.42", "+100 USDC", "1 ETH"  
- Token symbols: "ETH", "BTC", "USDC", "WETH", "BNB"
- Token pairs: "WETH / USDC", "BTC/ETH"
- Wallet addresses: "0x123...", "21a2tg...y7hWUK"
- Percentages: "25%", "+50%", "0.5%"
- Placeholder text: "Label", "Description", "Button", "Text", "(Optional)", "(Edited)"
- Mathematical symbols: "+", "-", "=", "→"
- Sample/mock data

DO generate keys for:
- UI text, buttons, navigation, messages, status text

**Key Naming Format:** \`{module}::{type}_{name}\`

**Modules** (use the most specific one):
- \`limit_order\` - Limit order feature
- \`swap\` - Token swap
- \`bridge\` - Cross-chain bridge
- \`send\` / \`receive\` - Transfer
- \`market\` - Market data
- \`wallet\` - Portfolio
- \`earn\` - Staking/yield
- \`settings\` - Settings
- \`verify\` - Verification flows

**Types:** \`btn\`, \`title\`, \`label\`, \`msg\`, \`status\`, \`tab\`, \`hint\`

**Examples:**
- "Cancel" on order page → \`limit_order::btn_cancel\`
- "Cancel multiple orders" → \`limit_order::btn_cancel_multiple\`
- "Open" status → \`limit_order::status_open\`
- "Limit price" → \`limit_order::label_limit_price\`
- "Expire in" → \`limit_order::label_expire_in\`
- "Verify ASC" → \`verify::btn_verify_asc\`
- "Confirm signature" → \`verify::msg_confirm_signature\`
- "Swap" tab → \`swap::tab_swap\`

**Output JSON:**
\`\`\`json
{
  "keys": [
    {"key": "limit_order::btn_cancel", "value": "Cancel", "originalText": "取消", "detectedLanguage": "zh", "category": "limit_order", "context": "Cancel order button"}
  ],
  "filtered": ["1", "$100"]
}
\`\`\``;

  // Build user message with optional additional prompt
  let userMessage = `Frames: ${frameNames.join(', ')}\n\nText List:\n${texts.map((t, i) => `${i + 1}. [${t.frameName}/${t.nodeName}] ${t.textContent}`).join('\n')}\n\nPlease generate English i18n keys for all texts above.`;
  
  if (additionalPrompt) {
    userMessage += `\n\n**Additional Instructions from User:**\n${additionalPrompt}`;
  }
  
  const userContent: any[] = [
    {
      type: 'text',
      text: userMessage,
    },
  ];

  // Add screenshots
  if (screenshots && screenshots.length > 0) {
    screenshots.forEach((screenshot, idx) => {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${screenshot}`,
        },
      });
      if (idx < frameNames.length) {
        userContent.push({
          type: 'text',
          text: `Screenshot ${idx + 1}: ${frameNames[idx]}`,
        });
      }
    });
  }

  const response = await openRouterChat(settings, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]);

  // Parse AI response - improved error handling
  let parsed: { keys: any[], filtered?: string[] };
  try {
    // Try to find JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[i18n] No JSON found in response:', response.substring(0, 500));
      throw new Error('AI 没有返回有效的 JSON 格式');
    }
    
    // Clean up the JSON string (remove any trailing issues)
    let jsonStr = jsonMatch[0];
    // Fix common JSON issues from AI
    jsonStr = jsonStr.replace(/,\s*\]/g, ']'); // Remove trailing commas in arrays
    jsonStr = jsonStr.replace(/,\s*\}/g, '}'); // Remove trailing commas in objects
    
    parsed = JSON.parse(jsonStr);
    
    if (!parsed.keys || !Array.isArray(parsed.keys)) {
      console.error('[i18n] Invalid JSON structure:', parsed);
      throw new Error('AI 返回的 JSON 结构不正确');
    }
    
    console.log(`[i18n] AI returned ${parsed.keys.length} keys, filtered: ${parsed.filtered?.length || 0}`);
  } catch (e) {
    console.error('[i18n] JSON parse error:', e);
    console.error('[i18n] Raw response:', response.substring(0, 1000));
    
    // Fallback: generate basic keys without AI
    parsed = {
      keys: texts.map((t, i) => ({
        key: `text_${i + 1}`,
        value: t.textContent,
        originalText: t.textContent,
        detectedLanguage: /[\u4e00-\u9fa5]/.test(t.textContent) ? 'zh' : 'en',
        category: 'text',
        context: `From ${t.nodeName}`,
      }))
    };
    console.log('[i18n] Using fallback keys');
  }
  
  // Create a map of AI-generated keys by originalText for matching
  const aiKeyMap = new Map<string, any>();
  for (const aiKey of parsed.keys) {
    if (aiKey.originalText) {
      aiKeyMap.set(aiKey.originalText, aiKey);
    }
  }
  
  // Merge AI-generated data with original node info
  // Only include texts that AI didn't filter out
  const keys: I18nKey[] = [];
  let aiFilteredCount = 0;
  
  for (let index = 0; index < texts.length; index++) {
    const text = texts[index];
    
    // Try to find matching AI key by originalText
    let aiKey = aiKeyMap.get(text.textContent);
    
    // If not found by originalText, try by index (fallback for simpler responses)
    if (!aiKey && parsed.keys[index]) {
      aiKey = parsed.keys[index];
    }
    
    // If AI filtered this text, skip it
    if (!aiKey || (parsed.filtered && parsed.filtered.includes(text.textContent))) {
      aiFilteredCount++;
      continue;
    }
    
    keys.push({
      id: `i18n_${Date.now()}_${index}`,
      nodeId: text.nodeId,
      nodeName: text.nodeName,
      frameName: text.frameName,
      key: aiKey.key || `text_${index + 1}`,
      value: aiKey.value || text.textContent,
      originalText: text.textContent,
      detectedLanguage: aiKey.detectedLanguage || (/[\u4e00-\u9fa5]/.test(text.textContent) ? 'zh' : 'en'),
      category: aiKey.category,
      context: aiKey.context,
      selected: true,
      edited: false,
    });
  }
  
  console.log(`[i18n] Final: ${keys.length} keys (AI filtered ${aiFilteredCount} more)`);

  return {
    frames: frameNames,
    keys,
    totalKeys: keys.length,
    screenshots,
  };
}

// 1. Single key add command
export function exportSingleAddCommand(
  key: I18nKey,
  projectName: string
): string {
  return `@Loka-AI add ${projectName} ${key.key} ${key.value}`;
}

// 2. bulkadd popup data format (Key | Value)
export function exportBulkaddData(keys: I18nKey[]): string {
  return keys
    .filter(k => k.selected)
    .map(k => `${k.key} | ${k.value}`)
    .join('\n');
}

// 3. Multi-check command (keys only)
export function exportMultiCheckCommand(
  keys: I18nKey[],
  projectName: string
): string {
  const selectedKeys = keys
    .filter(k => k.selected)
    .map(k => k.key)
    .join(' ');
  return `@Loka-AI ${projectName} ${selectedKeys}`;
}

// Export as JSON format
export function exportAsJSON(keys: I18nKey[]): string {
  const filtered = keys.filter(k => k.selected).map(k => ({
    key: k.key,
    value: k.value,
    originalText: k.originalText,
    category: k.category,
    context: k.context,
  }));
  return JSON.stringify(filtered, null, 2);
}

// Export as CSV format
export function exportAsCSV(keys: I18nKey[]): string {
  const filtered = keys.filter(k => k.selected);
  const header = 'Key,Value,Original Text,Category,Context\n';
  const rows = filtered.map(k => {
    const key = (k.key || '').replace(/"/g, '""');
    const value = (k.value || '').replace(/"/g, '""');
    const original = (k.originalText || '').replace(/"/g, '""');
    const category = (k.category || '').replace(/"/g, '""');
    const context = (k.context || '').replace(/"/g, '""');
    return `"${key}","${value}","${original}","${category}","${context}"`;
  });
  return header + rows.join('\n');
}

// Create editable i18n table on Figma canvas
export async function createI18nTable(keys: I18nKey[]): Promise<void> {
  const filtered = keys.filter(k => k.selected);
  if (filtered.length === 0) {
    throw new Error('No keys selected');
  }

  // Load fonts FIRST before creating any text nodes
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  const currentPage = figma.currentPage;
  const selection = currentPage.selection;
  
  // Determine table position (to the right of selected Frame)
  let x = 0;
  let y = 0;
  if (selection.length > 0 && 'x' in selection[0] && 'y' in selection[0]) {
    x = selection[0].x + (selection[0].width || 0) + 100;
    y = selection[0].y;
  }

  // Create table Frame
  const tableFrame = figma.createFrame();
  tableFrame.name = 'i18n Keys Table';
  tableFrame.x = x;
  tableFrame.y = y;
  
  // Table style
  const rowHeight = 40;
  const col1Width = 300; // Key column
  const col2Width = 400; // Value column
  const headerHeight = 50;
  
  tableFrame.resize(col1Width + col2Width, headerHeight + (filtered.length * rowHeight));
  tableFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  tableFrame.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
  tableFrame.strokeWeight = 1;

  // Create header row
  const headerRow = figma.createFrame();
  headerRow.name = 'Header';
  headerRow.x = 0;
  headerRow.y = 0;
  headerRow.resize(col1Width + col2Width, headerHeight);
  headerRow.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
  
  // Header text 1 - MUST set fontName before characters
  const headerText1 = figma.createText();
  headerText1.fontName = { family: 'Inter', style: 'Bold' };
  headerText1.characters = 'Key';
  headerText1.fontSize = 14;
  headerText1.x = 10;
  headerText1.y = (headerHeight - headerText1.height) / 2;
  
  // Header text 2
  const headerText2 = figma.createText();
  headerText2.fontName = { family: 'Inter', style: 'Bold' };
  headerText2.characters = 'Value (English)';
  headerText2.fontSize = 14;
  headerText2.x = col1Width + 10;
  headerText2.y = (headerHeight - headerText2.height) / 2;
  
  headerRow.appendChild(headerText1);
  headerRow.appendChild(headerText2);
  tableFrame.appendChild(headerRow);

  // Create data rows
  for (let i = 0; i < filtered.length; i++) {
    const key = filtered[i];
    const rowY = headerHeight + (i * rowHeight);
    
    // Row background
    const row = figma.createFrame();
    row.name = `Row ${i + 1}`;
    row.x = 0;
    row.y = rowY;
    row.resize(col1Width + col2Width, rowHeight);
    row.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    row.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
    row.strokeWeight = 1;
    
    // Key text - MUST set fontName before characters
    const keyText = figma.createText();
    keyText.fontName = { family: 'Inter', style: 'Regular' };
    keyText.characters = key.key;
    keyText.fontSize = 12;
    keyText.x = 10;
    keyText.y = (rowHeight - keyText.height) / 2;
    keyText.name = `key_${key.key}`;
    
    // Value text - MUST set fontName before characters
    const valueText = figma.createText();
    valueText.fontName = { family: 'Inter', style: 'Regular' };
    valueText.characters = key.value;
    valueText.fontSize = 12;
    valueText.x = col1Width + 10;
    valueText.y = (rowHeight - valueText.height) / 2;
    valueText.name = `value_${key.key}`;
    
    // Associate with original node (via plugin data)
    row.setPluginData('i18n_node_id', key.nodeId);
    row.setPluginData('i18n_key', key.key);
    
    row.appendChild(keyText);
    row.appendChild(valueText);
    tableFrame.appendChild(row);
  }

  currentPage.appendChild(tableFrame);
  
  // Select table
  currentPage.selection = [tableFrame];
  figma.viewport.scrollAndZoomIntoView([tableFrame]);
}
