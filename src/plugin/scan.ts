import type { ScanContext, FrameData } from '@shared/messages';

function isFrame(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME';
}

function isContainerNode(node: SceneNode): node is FrameNode | ComponentNode | InstanceNode | GroupNode {
  return node.type === 'FRAME' || 
         node.type === 'COMPONENT' || 
         node.type === 'INSTANCE' || 
         node.type === 'GROUP';
}

function getContainerNode(node: SceneNode): FrameNode | ComponentNode | InstanceNode | GroupNode | null {
  // If the node itself is a container, use it
  if (isContainerNode(node)) {
    return node;
  }
  
  // Otherwise, find the nearest parent container
  let p: BaseNode | null = node.parent;
  while (p) {
    if (p.type === 'FRAME' || p.type === 'COMPONENT' || p.type === 'INSTANCE' || p.type === 'GROUP') {
      return p as FrameNode | ComponentNode | InstanceNode | GroupNode;
    }
    p = p.parent;
  }
  
  return null;
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr)).filter(Boolean);
}

export async function scanSelectedFrame(includeScreenshots: boolean = true): Promise<ScanContext | null> {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return null;

  // Support selection of any container type: Frame, Component, Instance, Group
  const containers: Array<FrameNode | ComponentNode | InstanceNode | GroupNode> = [];
  
  for (const node of selection) {
    const container = getContainerNode(node);
    if (container) {
      // Avoid duplicates
      if (!containers.find(c => c.id === container.id)) {
        containers.push(container);
      }
    }
  }
  
  if (containers.length === 0) return null;
  
  // Scan all selected containers (frames, components, instances, groups)
  const frameDataList: FrameData[] = await Promise.all(
    containers.map(async (container, index) => {
      const texts: string[] = [];
      const componentNames: string[] = [];

      // Get container name
      let containerName = container.name;
      if (container.type === 'INSTANCE') {
        const inst = container as InstanceNode;
        try {
          const mainComponent = await inst.getMainComponentAsync();
          containerName = mainComponent?.name || inst.name;
          if (mainComponent) componentNames.push(mainComponent.name);
        } catch {
          containerName = inst.name;
        }
      } else if (container.type === 'COMPONENT') {
        componentNames.push(container.name);
      }

      // Find all descendants (if the container supports findAll)
      if ('findAll' in container) {
        const descendants = container.findAll(() => true);
        for (const d of descendants) {
          if (d.type === 'TEXT') {
            const t = (d as TextNode).characters?.trim();
            if (t) texts.push(t);
          }

          if (d.type === 'INSTANCE') {
            const inst = d as InstanceNode;
            try {
              const mainComponent = await inst.getMainComponentAsync();
              componentNames.push(mainComponent?.name || inst.name);
            } catch {
              componentNames.push(inst.name);
            }
          }

          if (d.type === 'COMPONENT') {
            componentNames.push(d.name);
          }
        }
      }

      // Capture screenshot for PRD documentation (optional for performance)
      const screenshotBase64 = includeScreenshots ? await exportNodeAsBase64(container.id, 800) : undefined;

      return {
        frameId: container.id,
        frameName: containerName,
        texts: uniq(texts).slice(0, 120),
        componentNames: uniq(componentNames).slice(0, 120),
        order: index,
        screenshotBase64: screenshotBase64 || undefined,
      };
    })
  );
  
  // For backward compatibility, also populate legacy fields with first frame
  const firstFrame = frameDataList[0];
  
  return {
    frames: frameDataList,
    frameId: firstFrame.frameId,
    frameName: firstFrame.frameName,
    texts: firstFrame.texts,
    componentNames: firstFrame.componentNames,
  };
}

/** Get all text content from a node and its descendants */
function collectTextsFromNode(node: SceneNode): string[] {
  const texts: string[] = [];
  
  if (node.type === 'TEXT') {
    const t = (node as TextNode).characters?.trim();
    if (t) texts.push(t);
  }
  
  if ('findAll' in node) {
    const descendants = (node as FrameNode | GroupNode).findAll(() => true);
    for (const d of descendants) {
      if (d.type === 'TEXT') {
        const t = (d as TextNode).characters?.trim();
        if (t) texts.push(t);
      }
    }
  }
  
  return uniq(texts);
}

/** Get sibling texts near a node (for context) */
function getSiblingTexts(node: SceneNode): string[] {
  const parent = node.parent;
  if (!parent || !('children' in parent)) return [];
  
  const texts: string[] = [];
  for (const sibling of (parent as FrameNode).children) {
    if (sibling.type === 'TEXT') {
      const t = (sibling as TextNode).characters?.trim();
      if (t) texts.push(t);
    }
  }
  return texts.slice(0, 10);
}

/** Get ALL texts from the nearest parent Frame (page context) */
function getPageContextTexts(node: SceneNode): string[] {
  let p: BaseNode | null = node.parent;
  
  // Find the root-level frame (the "page" or "screen")
  let rootFrame: FrameNode | null = null;
  while (p) {
    if (p.type === 'FRAME') {
      rootFrame = p as FrameNode;
    }
    p = p.parent;
  }
  
  if (!rootFrame) return [];
  
  const texts: string[] = [];
  const descendants = rootFrame.findAll(() => true);
  for (const d of descendants) {
    if (d.type === 'TEXT') {
      const t = (d as TextNode).characters?.trim();
      if (t && t.length < 100) texts.push(t); // Skip very long texts
    }
  }
  
  return uniq(texts).slice(0, 50); // Limit to 50 texts for context
}

export interface InteractiveNodeInfo {
  nodeId: string;
  nodeName: string;
  parentFrameName: string;
  elementType: string;
  text?: string;
  siblingTexts: string[];
  pageContextTexts: string[];
  componentName?: string;
  // Screenshot of the element (base64 PNG)
  screenshotBase64?: string;
  // Screenshot of the parent frame/page (base64 PNG)
  pageScreenshotBase64?: string;
}

export async function scanSelectedInteractiveNodes(): Promise<InteractiveNodeInfo[]> {
  const selection = figma.currentPage.selection;
  const nodes = selection.length > 0 ? selection : [];

  function nearestFrameName(n: SceneNode): string {
    let p: BaseNode | null = n;
    while (p) {
      if (p.type === 'FRAME') return (p as FrameNode).name;
      p = p.parent;
    }
    return 'UnknownPage';
  }

  async function inferType(n: SceneNode): Promise<string> {
    const name = (n.name || '').toLowerCase();
    if (n.type === 'TEXT') return 'Text';
    if (name.includes('button') || name.includes('btn')) return 'Button';
    if (name.includes('tab')) return 'Tab';
    if (name.includes('input') || name.includes('textfield') || name.includes('text field')) return 'Input';
    if (name.includes('toggle') || name.includes('switch')) return 'Toggle';
    if (name.includes('checkbox')) return 'Checkbox';
    if (name.includes('radio')) return 'Radio';
    if (name.includes('card') || name.includes('item') || name.includes('row')) return 'ListItem';
    if (n.type === 'INSTANCE') {
      const inst = n as InstanceNode;
      try {
        const mainComponent = await inst.getMainComponentAsync();
        const compName = (mainComponent?.name || inst.name || '').toLowerCase();
        if (compName.includes('button') || compName.includes('btn')) return 'Button';
        if (compName.includes('tab')) return 'Tab';
        if (compName.includes('input')) return 'Input';
        if (compName.includes('card') || compName.includes('item')) return 'ListItem';
      } catch {
        // Fallback to instance name
        const compName = (inst.name || '').toLowerCase();
        if (compName.includes('button') || compName.includes('btn')) return 'Button';
        if (compName.includes('tab')) return 'Tab';
        if (compName.includes('input')) return 'Input';
        if (compName.includes('card') || compName.includes('item')) return 'ListItem';
      }
    }
    return n.type;
  }

  async function getComponentName(n: SceneNode): Promise<string | undefined> {
    if (n.type === 'INSTANCE') {
      const inst = n as InstanceNode;
      try {
        const mainComponent = await inst.getMainComponentAsync();
        return mainComponent?.name || inst.name;
      } catch {
        return inst.name;
      }
    }
    if (n.type === 'COMPONENT') {
      return n.name;
    }
    return undefined;
  }

  const results: InteractiveNodeInfo[] = [];

  for (const n of nodes) {
    const frameName = nearestFrameName(n);
    const elementType = await inferType(n);

    // Get text content from this element
    let text: string | undefined;
    if (n.type === 'TEXT') {
      text = (n as TextNode).characters;
    } else {
      // Try to get text from inside the element
      const innerTexts = collectTextsFromNode(n);
      if (innerTexts.length > 0) {
        text = innerTexts.slice(0, 3).join(' | ');
      }
    }

    // Get surrounding context
    const siblingTexts = getSiblingTexts(n);
    const pageContextTexts = getPageContextTexts(n);
    const componentName = await getComponentName(n);

    results.push({
      nodeId: n.id,
      nodeName: n.name,
      parentFrameName: frameName,
      elementType,
      text,
      siblingTexts,
      pageContextTexts,
      componentName,
    });
  }

  return results;
}

/** Export a node as base64 PNG screenshot */
export async function exportNodeAsBase64(nodeId: string, maxSize: number = 512): Promise<string | null> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || !('exportAsync' in node)) return null;
    
    const exportNode = node as SceneNode & { exportAsync: (settings: ExportSettings) => Promise<Uint8Array> };
    
    // Calculate scale to fit within maxSize while preserving aspect ratio
    let scale = 1;
    if ('width' in exportNode && 'height' in exportNode) {
      const maxDim = Math.max(exportNode.width, exportNode.height);
      if (maxDim > maxSize) {
        scale = maxSize / maxDim;
      }
    }
    
    const bytes = await exportNode.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: scale },
    });
    
    // Convert Uint8Array to base64
    const base64 = figma.base64Encode(bytes);
    return base64;
  } catch (e) {
    console.error('Failed to export node:', e);
    return null;
  }
}

/** Get the root frame (page/screen) containing a node */
export async function getRootFrame(nodeId: string): Promise<FrameNode | null> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) return null;
  
  let p: BaseNode | null = node;
  let rootFrame: FrameNode | null = null;
  
  while (p) {
    if (p.type === 'FRAME') {
      rootFrame = p as FrameNode;
    }
    p = p.parent;
  }
  
  return rootFrame;
}

/** Check if a node is likely interactive (button, tab, input, etc.) */
function isInteractiveNode(node: SceneNode): boolean {
  const name = (node.name || '').toLowerCase();
  
  // Check by name patterns (English and Chinese common patterns)
  const interactivePatterns = [
    'button', 'btn', 'tab', 'input', 'toggle', 'switch', 
    'checkbox', 'radio', 'link', 'action', 'cta', 'submit',
    'cancel', 'confirm', 'close', 'menu', 'dropdown', 'select',
    'icon-button', 'fab', 'chip', 'click', 'tap', 'press',
    // Chinese patterns
    '按钮', '取消', '确认', '确定', '提交', '返回', '关闭', '删除', '添加', '编辑',
    '保存', '发送', '接收', '搜索', '筛选', '排序', '刷新', '更多', '详情', '查看'
  ];
  
  if (interactivePatterns.some(p => name.includes(p))) {
    return true;
  }
  
  // ALL component instances are potentially interactive
  if (node.type === 'INSTANCE') {
    return true;
  }
  
  // Check for click reactions (if available)
  if ('reactions' in node && Array.isArray((node as any).reactions)) {
    const reactions = (node as any).reactions;
    if (reactions.length > 0) {
      return true;
    }
  }
  
  return false;
}

/** Check if node is a meaningful container (card, list item, etc.) */
function isInteractiveContainer(node: SceneNode): boolean {
  const name = (node.name || '').toLowerCase();
  const containerPatterns = ['card', 'item', 'row', 'cell', 'tile', 'list-item', 'order'];
  
  if (containerPatterns.some(p => name.includes(p))) {
    // Must be a frame/group with children
    if ((node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'INSTANCE') && 
        'children' in node && (node as FrameNode).children.length > 0) {
      return true;
    }
  }
  
  return false;
}

export interface PageScanResult {
  frameId: string;
  frameName: string;
  pageContextTexts: string[];
  interactiveElements: Array<{
    nodeId: string;
    nodeName: string;
    elementType: string;
    text?: string;
    componentName?: string;
    depth: number; // How deep in the tree
  }>;
}

/** Scan a Frame and find all interactive elements (legacy - no longer primary method) */
export async function scanFrameForInteractiveElements(): Promise<PageScanResult | null> {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    return null;
  }
  
  const selectedNode = selection[0];
  
  // Find the frame to scan
  let frameToScan: FrameNode | null = null;
  
  if (selectedNode.type === 'FRAME') {
    frameToScan = selectedNode as FrameNode;
  } else {
    // Find parent frame
    let p: BaseNode | null = selectedNode.parent;
    while (p) {
      if (p.type === 'FRAME') {
        frameToScan = p as FrameNode;
        break;
      }
      p = p.parent;
    }
  }
  
  if (!frameToScan) {
    return null;
  }
  
  // Collect all texts for context
  const pageContextTexts: string[] = [];
  const descendants = frameToScan.findAll(() => true);
  
  for (const d of descendants) {
    if (d.type === 'TEXT') {
      const t = (d as TextNode).characters?.trim();
      if (t && t.length < 100) {
        pageContextTexts.push(t);
      }
    }
  }
  
  // Find interactive elements
  const interactiveElements: PageScanResult['interactiveElements'] = [];
  const processedIds = new Set<string>();
  
  function getDepth(node: SceneNode): number {
    let depth = 0;
    let p: BaseNode | null = node.parent;
    while (p && p.id !== frameToScan!.id) {
      depth++;
      p = p.parent;
    }
    return depth;
  }
  
  function getTextFromNode(node: SceneNode): string | undefined {
    if (node.type === 'TEXT') {
      return (node as TextNode).characters?.trim();
    }
    
    if ('findAll' in node) {
      const textNodes = (node as FrameNode).findAll(n => n.type === 'TEXT');
      const texts = textNodes
        .map(t => (t as TextNode).characters?.trim())
        .filter(Boolean)
        .slice(0, 3);
      return texts.length > 0 ? texts.join(' | ') : undefined;
    }
    
    return undefined;
  }
  
  async function getElementType(node: SceneNode): Promise<string> {
    const name = (node.name || '').toLowerCase();
    
    if (name.includes('button') || name.includes('btn')) return 'Button';
    if (name.includes('tab')) return 'Tab';
    if (name.includes('input') || name.includes('textfield')) return 'Input';
    if (name.includes('toggle') || name.includes('switch')) return 'Toggle';
    if (name.includes('checkbox')) return 'Checkbox';
    if (name.includes('radio')) return 'Radio';
    if (name.includes('card') || name.includes('item') || name.includes('row')) return 'ListItem';
    if (name.includes('link')) return 'Link';
    if (name.includes('icon') && (name.includes('button') || name.includes('btn'))) return 'IconButton';
    
    if (node.type === 'INSTANCE') {
      const inst = node as InstanceNode;
      try {
        const mainComponent = await inst.getMainComponentAsync();
        const compName = (mainComponent?.name || '').toLowerCase();
        if (compName.includes('button') || compName.includes('btn')) return 'Button';
        if (compName.includes('tab')) return 'Tab';
        if (compName.includes('input')) return 'Input';
        if (compName.includes('toggle')) return 'Toggle';
      } catch {
        // Fallback to instance name
        const compName = (inst.name || '').toLowerCase();
        if (compName.includes('button') || compName.includes('btn')) return 'Button';
        if (compName.includes('tab')) return 'Tab';
        if (compName.includes('input')) return 'Input';
        if (compName.includes('toggle')) return 'Toggle';
      }
    }
    
    return node.type;
  }
  
  async function getComponentName(node: SceneNode): Promise<string | undefined> {
    if (node.type === 'INSTANCE') {
      const inst = node as InstanceNode;
      try {
        const mainComponent = await inst.getMainComponentAsync();
        return mainComponent?.name || inst.name;
      } catch {
        return inst.name;
      }
    }
    if (node.type === 'COMPONENT') {
      return node.name;
    }
    return undefined;
  }
  
  // Process all descendants
  for (const node of descendants) {
    // Skip if already processed (avoid duplicates from nested structures)
    if (processedIds.has(node.id)) continue;
    
    // Check if interactive
    if (isInteractiveNode(node) || isInteractiveContainer(node)) {
      processedIds.add(node.id);
      
      // Skip if parent is already in the list (avoid double-counting)
      let skipDueToParent = false;
      let p: BaseNode | null = node.parent;
      while (p && p.id !== frameToScan.id) {
        if (processedIds.has(p.id)) {
          // Parent is already interactive, but we might still want to track this
          // Only skip if it's a deeply nested button inside a card that's already tracked
          const parentDepth = getDepth(p as SceneNode);
          const nodeDepth = getDepth(node);
          if (nodeDepth - parentDepth > 2) {
            skipDueToParent = true;
            break;
          }
        }
        p = p.parent;
      }
      
      if (skipDueToParent) continue;
      
      interactiveElements.push({
        nodeId: node.id,
        nodeName: node.name,
        elementType: await getElementType(node),
        text: getTextFromNode(node),
        componentName: await getComponentName(node),
        depth: getDepth(node),
      });
    }
  }
  
  // Sort by depth (shallower first) and then by position
  interactiveElements.sort((a, b) => a.depth - b.depth);
  
  return {
    frameId: frameToScan.id,
    frameName: frameToScan.name,
    pageContextTexts: uniq(pageContextTexts).slice(0, 60),
    interactiveElements,
  };
}
