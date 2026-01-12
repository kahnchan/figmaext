/// <reference types="@figma/plugin-typings" />

import type { Mode, PluginToUIMessage, Settings, TrackingEvent, UIToPluginMessage, ScanContext } from '@shared/messages';
import { scanSelectedFrame, scanSelectedInteractiveNodes, exportNodeAsBase64, getRootFrame, scanFrameForInteractiveElements } from './scan';
import { syncPRD } from './prd';
import { attachTrackingToLayer, generateTrackingForNode, readTrackingFromLayer, analyzePageWithVision, type ElementHint } from './tracker';
import { fetchConfluencePage, compareAndMergePRD, syncToConfluence } from './confluence';

const STORAGE_SETTINGS = 'onekey_settings';
const STORAGE_AUTOSYNC = 'onekey_autosync';
const STORAGE_MODE = 'onekey_mode';
const STORAGE_TRACKING = 'onekey_tracking_events';

const DEFAULT_SETTINGS: Settings = {
  openRouterApiKey: '',
  model: 'anthropic/claude-3.5-sonnet',
};

let settings: Settings = DEFAULT_SETTINGS;
let autoSync = true;
let mode: Mode = 'prd';
let lastContextKey = '';
let trackingEvents: TrackingEvent[] = [];

figma.showUI(__html__, { width: 420, height: 720, themeColors: true });

function post(msg: PluginToUIMessage) {
  figma.ui.postMessage(msg);
}

async function loadState() {
  settings = (await figma.clientStorage.getAsync(STORAGE_SETTINGS)) || DEFAULT_SETTINGS;
  autoSync = (await figma.clientStorage.getAsync(STORAGE_AUTOSYNC)) ?? true;
  mode = (await figma.clientStorage.getAsync(STORAGE_MODE)) || 'prd';
  trackingEvents = (await figma.clientStorage.getAsync(STORAGE_TRACKING)) || [];
}

async function saveTrackingEvents() {
  await figma.clientStorage.setAsync(STORAGE_TRACKING, trackingEvents);
  post({ type: 'TRACKING_EVENTS', events: trackingEvents });
}

function makeContextKey(ctx: ScanContext): string {
  if (ctx.frames && ctx.frames.length > 0) {
    // Multi-frame: use all frame IDs
    const frameIds = ctx.frames.map((f) => f.frameId).join(',');
    const allTexts: string[] = [];
    for (const frame of ctx.frames) {
      allTexts.push(...frame.texts);
    }
    return `${frameIds}:${allTexts.join('|').slice(0, 500)}`;
  }
  // Legacy single frame
  return `${ctx.frameId}:${ctx.texts?.join('|').slice(0, 500)}:${ctx.componentNames?.join('|').slice(0, 500)}`;
}

async function pushScanContext() {
  const ctx = await scanSelectedFrame();
  post({ type: 'SCAN_CONTEXT', context: ctx });

  if (!ctx) return;

  const key = makeContextKey(ctx);
  if (key === lastContextKey) return;
  lastContextKey = key;

  if (autoSync && mode === 'prd') {
    await doSyncPRD(undefined, ctx);
  }
}

async function doSyncToConfluence(confluenceUrl: string, markdown: string) {
  try {
    post({
      type: 'LOADING_STATUS',
      status: {
        isLoading: true,
        message: '正在准备同步...'
      }
    });

    // 1. 自动复制 PRD 内容到剪贴板
    post({ 
      type: 'COPY_TO_CLIPBOARD_ACK', 
      text: markdown 
    });

    // 2. 在浏览器中打开 Confluence URL
    // 注意：Figma Plugin 无法直接打开浏览器，需要通过 figma.showUI 传递消息
    
    // 3. 提示用户
    figma.notify('✅ PRD 已复制到剪贴板！\n\n正在打开 Confluence 页面，请在编辑器中粘贴（Cmd/Ctrl+V）', {
      timeout: 8000
    });

    // 4. 发送打开 URL 的消息到 UI
    post({
      type: 'OPEN_URL',
      url: confluenceUrl
    });

    // 未来可以集成 Confluence API 实现真正的自动同步
    // const result = await syncToConfluence(confluenceUrl, markdown);
    // figma.notify('✅ 已成功同步到 Confluence!');

  } catch (error) {
    figma.notify('❌ 同步失败: ' + (error as Error).message);
  } finally {
    post({
      type: 'LOADING_STATUS',
      status: {
        isLoading: false
      }
    });
  }
}

async function doSyncPRD(additionalPrompt?: string, ctx?: Awaited<ReturnType<typeof scanSelectedFrame>>) {
  const context = ctx || await scanSelectedFrame();
  if (!context) {
    post({ type: 'PRD_RESULT', result: null });
    return;
  }

  try {
    // Show loading
    post({ 
      type: 'LOADING_STATUS', 
      status: { 
        isLoading: true, 
        message: '正在生成 PRD...'
      } 
    });
    
    // Generate new PRD
    let result = await syncPRD(settings, context, additionalPrompt);
    
    // If Confluence URL is configured, try to merge with existing content
    if (settings.confluenceWikiUrl) {
      post({ 
        type: 'LOADING_STATUS', 
        status: { 
          isLoading: true, 
          message: '正在从 Confluence 获取现有文档...'
        } 
      });
      
      const existingPage = await fetchConfluencePage(settings.confluenceWikiUrl);
      
      if (existingPage) {
        post({ 
          type: 'LOADING_STATUS', 
          status: { 
            isLoading: true, 
            message: '正在合并文档内容...'
          } 
        });
        
        const merged = await compareAndMergePRD(settings, result, existingPage);
        
        // Update result with merged content
        result = {
          ...result,
          markdown: merged.mergedMarkdown,
        };
        
        figma.notify(`✓ 已与现有文档合并 (${merged.changes.length} 处变更)`);
      }
      
      // Optionally sync to Confluence (currently placeholder)
      // const syncResult = await syncToConfluence(settings.confluenceWikiUrl, result.markdown, result.featureName);
      // if (syncResult.success) {
      //   figma.notify('✓ 已同步到 Confluence');
      // }
    }
    
    // Hide loading
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    post({ type: 'PRD_RESULT', result });
  } catch (e) {
    // Hide loading on error
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    post({ type: 'ERROR', message: String((e as Error).message || e) });
  }
}

function simpleId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function doGenerateTracking() {
  const nodes = scanSelectedInteractiveNodes();
  if (nodes.length === 0) {
    post({ type: 'ERROR', message: '请选择至少一个元素（按钮/Tab/Input 等）' });
    return;
  }

  // Show loading in UI
  post({ 
    type: 'LOADING_STATUS', 
    status: { 
      isLoading: true, 
      message: `正在为 ${nodes.length} 个元素生成埋点...`,
      progress: { current: 0, total: nodes.length }
    } 
  });

  figma.notify(`正在为 ${nodes.length} 个元素生成埋点...`);

  const next: TrackingEvent[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const existing = readTrackingFromLayer(n.nodeId);

    try {
      // Update progress
      post({ 
        type: 'LOADING_STATUS', 
        status: { 
          isLoading: true, 
          message: `AI 正在分析元素 ${i + 1}/${nodes.length}`,
          progress: { current: i + 1, total: nodes.length }
        } 
      });
      
      if (nodes.length > 1) {
        figma.notify(`AI 正在分析第 ${i + 1}/${nodes.length} 个元素...`);
      }
      
      // Get screenshot of the element
      const screenshotBase64 = await exportNodeAsBase64(n.nodeId, 256);
      
      // Get screenshot of the parent page/frame for context
      const rootFrame = getRootFrame(n.nodeId);
      const pageScreenshotBase64 = rootFrame ? await exportNodeAsBase64(rootFrame.id, 800) : undefined;

      const ai = await generateTrackingForNode(settings, {
        ...n,
        screenshotBase64: screenshotBase64 || undefined,
        pageScreenshotBase64: pageScreenshotBase64 || undefined,
        platform: 'App',
      });

      next.push({
        id: simpleId(),
        nodeId: n.nodeId,
        nodeName: n.nodeName,
        parentFrameName: n.parentFrameName,
        elementType: ai.elementType,
        eventName: existing?.eventName || ai.eventName,
        eventDisplayName: existing?.eventDisplayName || ai.eventDisplayName,
        category: existing?.category || ai.category,
        triggerCondition: existing?.triggerCondition || ai.triggerCondition,
        properties: existing?.properties || ai.properties,
        verified: existing?.verified || false,
      });
    } catch (e) {
      next.push({
        id: simpleId(),
        nodeId: n.nodeId,
        nodeName: n.nodeName,
        parentFrameName: n.parentFrameName,
        elementType: n.elementType,
        eventName: `tap${n.nodeName.replace(/[^a-zA-Z]/g, '')}`,
        eventDisplayName: `${n.nodeName} 点击`,
        category: 'Wallet',
        triggerCondition: '用户点击时触发',
        properties: [],
        verified: false,
      });
    }
  }

  trackingEvents = next;
  await saveTrackingEvents();
  
  // Hide loading
  post({ type: 'LOADING_STATUS', status: { isLoading: false } });
  
  figma.notify(`✓ 已为 ${next.length} 个元素生成埋点`);
}

async function doScanPageForTracking() {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    post({ type: 'ERROR', message: '请选择一个 Frame（整个页面/屏幕）' });
    return;
  }
  
  // Find the frame to analyze
  let frameToAnalyze: FrameNode | null = null;
  const selectedNode = selection[0];
  
  if (selectedNode.type === 'FRAME') {
    frameToAnalyze = selectedNode as FrameNode;
  } else {
    // Find parent frame
    let p: BaseNode | null = selectedNode.parent;
    while (p) {
      if (p.type === 'FRAME') {
        frameToAnalyze = p as FrameNode;
        break;
      }
      p = p.parent;
    }
  }
  
  if (!frameToAnalyze) {
    post({ type: 'ERROR', message: '请选择一个 Frame（整个页面/屏幕）' });
    return;
  }
  
  // Show loading in UI
  post({ 
    type: 'LOADING_STATUS', 
    status: { 
      isLoading: true, 
      message: '正在截图并分析页面...'
    } 
  });
  
  figma.notify('正在截图并分析页面...');
  
  // Get page screenshot
  const pageScreenshotBase64 = await exportNodeAsBase64(frameToAnalyze.id, 1200);
  
  if (!pageScreenshotBase64) {
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    post({ type: 'ERROR', message: '截图失败，请重试' });
    return;
  }
  
  // Update loading status
  post({ 
    type: 'LOADING_STATUS', 
    status: { 
      isLoading: true, 
      message: '正在收集页面元素信息...'
    } 
  });
  
  // Collect all element names as hints (low weight reference)
  const elementHints: ElementHint[] = [];
  const pageTexts: string[] = [];
  
  const descendants = frameToAnalyze.findAll(() => true);
  for (const d of descendants) {
    // Collect element names as hints
    if (d.type === 'INSTANCE' || d.type === 'FRAME' || d.type === 'GROUP') {
      let text: string | undefined;
      // Try to get text from inside
      if ('findOne' in d) {
        const textNode = (d as FrameNode).findOne(n => n.type === 'TEXT') as TextNode | null;
        if (textNode) {
          text = textNode.characters?.trim().slice(0, 50);
        }
      }
      elementHints.push({
        nodeName: d.name,
        nodeType: d.type,
        text,
      });
    }
    
    // Collect visible text
    if (d.type === 'TEXT') {
      const t = (d as TextNode).characters?.trim();
      if (t && t.length < 100) {
        pageTexts.push(t);
      }
    }
  }
  
  // Update loading status
  post({ 
    type: 'LOADING_STATUS', 
    status: { 
      isLoading: true, 
      message: 'AI 正在分析页面中的交互元素...'
    } 
  });
  
  figma.notify('AI 正在分析页面中的交互元素...');
  
  try {
    // Call vision-based analysis
    const visionResults = await analyzePageWithVision(settings, {
      pageScreenshotBase64,
      frameName: frameToAnalyze.name,
      pageTexts: [...new Set(pageTexts)].slice(0, 50),
      elementHints: elementHints.slice(0, 60),
    });
    
    // Convert to TrackingEvent format
    const next: TrackingEvent[] = visionResults.map((result, idx) => ({
      id: simpleId(),
      nodeId: `vision_${idx}`, // No actual node mapping
      nodeName: result.elementDescription, // Use AI's description
      parentFrameName: frameToAnalyze!.name,
      elementType: 'Vision-Detected',
      eventName: result.eventName,
      eventDisplayName: result.eventDisplayName,
      category: result.category,
      triggerCondition: result.triggerCondition,
      properties: result.properties,
      verified: false,
      selected: true,
    }));
    
    trackingEvents = next;
    await saveTrackingEvents();
    
    // Hide loading
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    
    figma.notify(`✓ AI 识别了 ${next.length} 个交互元素并生成埋点`);
  } catch (e) {
    // Hide loading on error
    post({ type: 'LOADING_STATUS', status: { isLoading: false } });
    post({ type: 'ERROR', message: `分析失败: ${(e as Error).message}` });
  }
}

function toCSV(events: TrackingEvent[]): string {
  const header = [
    '事件名称',
    '事件显示名称', 
    '分类',
    '触发时机',
    '属性名称',
    '属性显示名称',
    '属性说明',
    '可选值',
    '验证状态',
    '来源元素',
    '来源页面'
  ];
  
  const rows: string[] = [];
  const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
  
  for (const e of events) {
    // If event has properties, create one row per property
    if (e.properties.length > 0) {
      for (let i = 0; i < e.properties.length; i++) {
        const prop = e.properties[i];
        rows.push([
          i === 0 ? esc(e.eventName) : '', // Only show event name on first row
          i === 0 ? esc(e.eventDisplayName) : '',
          i === 0 ? esc(e.category) : '',
          i === 0 ? esc(e.triggerCondition) : '',
          esc(prop.key),
          esc(prop.displayName),
          esc(prop.description),
          esc(prop.possibleValues || ''),
          i === 0 ? esc(e.verified ? '已验证' : '待验证') : '',
          i === 0 ? esc(e.nodeName) : '',
          i === 0 ? esc(e.parentFrameName) : '',
        ].join(','));
      }
    } else {
      // No properties
      rows.push([
        esc(e.eventName),
        esc(e.eventDisplayName),
        esc(e.category),
        esc(e.triggerCondition),
        '', '', '', '',
        esc(e.verified ? '已验证' : '待验证'),
        esc(e.nodeName),
        esc(e.parentFrameName),
      ].join(','));
    }
  }
  
  return [header.join(','), ...rows].join('\n');
}

figma.ui.onmessage = async (msg: UIToPluginMessage) => {
  try {
    if (msg.type === 'INIT') {
      await loadState();
      post({ type: 'INIT_DATA', settings, autoSync, mode });
      post({ type: 'TRACKING_EVENTS', events: trackingEvents });
      await pushScanContext();
      return;
    }

    if (msg.type === 'SET_SETTINGS') {
      settings = msg.settings;
      await figma.clientStorage.setAsync(STORAGE_SETTINGS, settings);
      post({ type: 'INIT_DATA', settings, autoSync, mode });
      figma.notify('Settings saved');
      return;
    }

    if (msg.type === 'SET_AUTOSYNC') {
      autoSync = msg.enabled;
      await figma.clientStorage.setAsync(STORAGE_AUTOSYNC, autoSync);
      return;
    }

    if (msg.type === 'SET_MODE') {
      mode = msg.mode;
      await figma.clientStorage.setAsync(STORAGE_MODE, mode);
      return;
    }

    if (msg.type === 'SYNC_PRD_NOW') {
      await doSyncPRD(msg.additionalPrompt);
      return;
    }

    if (msg.type === 'SYNC_TO_CONFLUENCE') {
      await doSyncToConfluence(msg.confluenceUrl, msg.markdown);
      return;
    }

    if (msg.type === 'GENERATE_TRACKING_NOW') {
      await doGenerateTracking();
      return;
    }

    if (msg.type === 'SCAN_PAGE_FOR_TRACKING') {
      await doScanPageForTracking();
      return;
    }

    if (msg.type === 'UPDATE_TRACKING_EVENT') {
      trackingEvents = trackingEvents.map((e) => (e.id === msg.event.id ? msg.event : e));
      await saveTrackingEvents();
      return;
    }

    if (msg.type === 'TOGGLE_EVENT_SELECTION') {
      trackingEvents = trackingEvents.map((e) => 
        e.id === msg.id ? { ...e, selected: !e.selected } : e
      );
      await saveTrackingEvents();
      return;
    }

    if (msg.type === 'SELECT_ALL_EVENTS') {
      trackingEvents = trackingEvents.map((e) => ({ ...e, selected: msg.selected }));
      await saveTrackingEvents();
      return;
    }

    if (msg.type === 'DELETE_TRACKING_EVENT') {
      trackingEvents = trackingEvents.filter((e) => e.id !== msg.id);
      await saveTrackingEvents();
      return;
    }

    if (msg.type === 'DELETE_ALL_EVENTS') {
      trackingEvents = [];
      await saveTrackingEvents();
      figma.notify('已清空所有埋点');
      return;
    }

    if (msg.type === 'ATTACH_TRACKING_TO_LAYER') {
      const ev = trackingEvents.find((e) => e.id === msg.id);
      if (!ev) throw new Error('Event not found');
      attachTrackingToLayer(ev.nodeId, ev);
      figma.notify('Attached to layer');
      return;
    }

    if (msg.type === 'EXPORT_TRACKING') {
      // Only export selected events (or all if none selected)
      const eventsToExport = trackingEvents.filter(e => e.selected !== false);
      const data = msg.format === 'csv' ? toCSV(eventsToExport) : JSON.stringify(eventsToExport, null, 2);
      post({ type: 'EXPORT_DATA', format: msg.format, data });
      figma.notify(`Exported ${eventsToExport.length} events`);
      return;
    }

    if (msg.type === 'CREATE_TRACKING_TABLE') {
      const eventsToExport = trackingEvents.filter(e => e.selected !== false);
      if (eventsToExport.length === 0) {
        post({ type: 'ERROR', message: '请先选择要导出的埋点事件' });
        return;
      }
      createTrackingTableInFigma(eventsToExport);
      figma.notify(`✓ 已创建埋点表格 (${eventsToExport.length} 个事件)`);
      return;
    }
  } catch (e) {
    post({ type: 'ERROR', message: String((e as Error).message || e) });
  }
};

figma.on('selectionchange', () => {
  pushScanContext().catch((e) => post({ type: 'ERROR', message: String((e as Error).message || e) }));
});

// ============ CREATE TABLE IN FIGMA ============

function createTrackingTableInFigma(events: TrackingEvent[]) {
  // Table styling - Clean white theme
  const COLORS = {
    headerBg: { r: 0.95, g: 0.95, b: 0.95 },    // Light gray header
    rowBg: { r: 1, g: 1, b: 1 },                 // White
    rowAltBg: { r: 0.98, g: 0.98, b: 0.98 },     // Very light gray
    border: { r: 0.85, g: 0.85, b: 0.85 },       // Light border
    text: { r: 0.1, g: 0.1, b: 0.1 },            // Dark text
    subtext: { r: 0.4, g: 0.4, b: 0.4 },         // Gray text
    primary: { r: 0.2, g: 0.4, b: 0.9 },         // Blue
    success: { r: 0.13, g: 0.55, b: 0.13 },      // Green
  };

  const COL_WIDTHS = {
    category: 100,
    eventName: 180,
    displayName: 150,
    trigger: 200,
    properties: 300,
    verified: 80,
  };

  const ROW_HEIGHT = 48;
  const HEADER_HEIGHT = 40;
  const PADDING = 12;
  const TOTAL_WIDTH = Object.values(COL_WIDTHS).reduce((a, b) => a + b, 0);

  // Create main frame
  const tableFrame = figma.createFrame();
  tableFrame.name = `Tracking Events Table (${events.length})`;
  tableFrame.resize(TOTAL_WIDTH, HEADER_HEIGHT + events.length * ROW_HEIGHT);
  tableFrame.layoutMode = 'VERTICAL';
  tableFrame.primaryAxisSizingMode = 'AUTO';
  tableFrame.counterAxisSizingMode = 'FIXED';
  tableFrame.fills = [{ type: 'SOLID', color: COLORS.rowBg }];
  tableFrame.strokes = [{ type: 'SOLID', color: COLORS.border }];
  tableFrame.strokeWeight = 1;
  tableFrame.cornerRadius = 8;
  tableFrame.clipsContent = true;

  // Helper: create text node
  async function createText(text: string, fontSize: number, color: RGB, bold = false): Promise<TextNode> {
    const node = figma.createText();
    await figma.loadFontAsync({ family: 'Inter', style: bold ? 'Bold' : 'Regular' });
    node.fontName = { family: 'Inter', style: bold ? 'Bold' : 'Regular' };
    node.characters = text || '-';
    node.fontSize = fontSize;
    node.fills = [{ type: 'SOLID', color }];
    return node;
  }

  // Helper: create cell frame
  function createCell(width: number): FrameNode {
    const cell = figma.createFrame();
    cell.resize(width, ROW_HEIGHT);
    cell.layoutMode = 'VERTICAL';
    cell.primaryAxisAlignItems = 'CENTER';
    cell.counterAxisAlignItems = 'MIN';
    cell.paddingLeft = PADDING;
    cell.paddingRight = PADDING;
    cell.paddingTop = 8;
    cell.paddingBottom = 8;
    cell.fills = [];
    return cell;
  }

  // Create header row
  async function createHeaderRow(): Promise<FrameNode> {
    const row = figma.createFrame();
    row.name = 'Header';
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'FIXED';
    row.counterAxisSizingMode = 'FIXED';
    row.resize(TOTAL_WIDTH, HEADER_HEIGHT);
    row.fills = [{ type: 'SOLID', color: COLORS.headerBg }];

    const headers = [
      { text: '分类', width: COL_WIDTHS.category },
      { text: '事件名称', width: COL_WIDTHS.eventName },
      { text: '显示名称', width: COL_WIDTHS.displayName },
      { text: '触发时机', width: COL_WIDTHS.trigger },
      { text: '属性', width: COL_WIDTHS.properties },
      { text: '状态', width: COL_WIDTHS.verified },
    ];

    for (const h of headers) {
      const cell = createCell(h.width);
      cell.resize(h.width, HEADER_HEIGHT);
      const text = await createText(h.text, 12, COLORS.subtext, true);
      cell.appendChild(text);
      row.appendChild(cell);
    }

    return row;
  }

  // Create data row
  async function createDataRow(event: TrackingEvent, index: number): Promise<FrameNode> {
    const row = figma.createFrame();
    row.name = `Row: ${event.eventName}`;
    row.layoutMode = 'HORIZONTAL';
    row.primaryAxisSizingMode = 'FIXED';
    row.counterAxisSizingMode = 'AUTO';
    row.resize(TOTAL_WIDTH, ROW_HEIGHT);
    row.fills = [{ type: 'SOLID', color: index % 2 === 0 ? COLORS.rowBg : COLORS.rowAltBg }];

    // Category
    const catCell = createCell(COL_WIDTHS.category);
    const catText = await createText(event.category, 11, COLORS.primary, true);
    catCell.appendChild(catText);
    row.appendChild(catCell);

    // Event Name
    const nameCell = createCell(COL_WIDTHS.eventName);
    const nameText = await createText(event.eventName, 12, COLORS.text, true);
    nameCell.appendChild(nameText);
    row.appendChild(nameCell);

    // Display Name
    const dispCell = createCell(COL_WIDTHS.displayName);
    const dispText = await createText(event.eventDisplayName, 11, COLORS.subtext);
    dispCell.appendChild(dispText);
    row.appendChild(dispCell);

    // Trigger
    const triggerCell = createCell(COL_WIDTHS.trigger);
    const triggerText = await createText(event.triggerCondition, 11, COLORS.subtext);
    triggerCell.appendChild(triggerText);
    row.appendChild(triggerCell);

    // Properties
    const propsCell = createCell(COL_WIDTHS.properties);
    const propsStr = event.properties.map(p => `${p.key}`).join(', ') || '-';
    const propsText = await createText(propsStr, 10, COLORS.subtext);
    propsCell.appendChild(propsText);
    row.appendChild(propsCell);

    // Verified
    const verCell = createCell(COL_WIDTHS.verified);
    const verText = await createText(event.verified ? '✓ 已验证' : '待验证', 11, event.verified ? COLORS.success : COLORS.subtext);
    verCell.appendChild(verText);
    row.appendChild(verCell);

    return row;
  }

  // Build table
  (async () => {
    const header = await createHeaderRow();
    tableFrame.appendChild(header);

    for (let i = 0; i < events.length; i++) {
      const row = await createDataRow(events[i], i);
      tableFrame.appendChild(row);
    }

    // Position near current viewport
    const viewport = figma.viewport.center;
    tableFrame.x = viewport.x - TOTAL_WIDTH / 2;
    tableFrame.y = viewport.y - tableFrame.height / 2;

    // Select and zoom to it
    figma.currentPage.selection = [tableFrame];
    figma.viewport.scrollAndZoomIntoView([tableFrame]);
  })();
}
