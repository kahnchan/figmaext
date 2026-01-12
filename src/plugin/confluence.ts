import type { Settings, PRDResult } from '@shared/messages';
import { openRouterChat } from './openrouter';

/**
 * Confluence integration for PRD synchronization
 * 
 * This module handles:
 * 1. Fetching existing PRD from Confluence wiki
 * 2. Comparing new PRD with existing content
 * 3. Generating update/merge strategies
 * 4. Syncing PRD to Confluence via REST API
 */

export interface ConfluencePageContent {
  title: string;
  content: string; // HTML or markdown
  version: number;
  url: string;
  id: string;
}

export interface ConfluenceAuth {
  url: string; // e.g., https://your-domain.atlassian.net
  email: string;
  apiToken: string;
}

/**
 * Base64 encode a string (Figma plugin compatible)
 */
function base64Encode(str: string): string {
  // Convert string to Uint8Array manually (no TextEncoder in Figma plugin)
  const utf8Bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i);
    if (charCode < 0x80) {
      utf8Bytes.push(charCode);
    } else if (charCode < 0x800) {
      utf8Bytes.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8Bytes.push(0xe0 | (charCode >> 12), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
    } else {
      // Surrogate pair
      i++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charCode >> 18),
        0x80 | ((charCode >> 12) & 0x3f),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f)
      );
    }
  }
  const data = new Uint8Array(utf8Bytes);
  return figma.base64Encode(data);
}

/**
 * Extract page ID from Confluence URL
 * Example: https://company.atlassian.net/wiki/spaces/SPACE/pages/123456/Page+Title
 */
function extractPageIdFromUrl(url: string): string | null {
  const match = url.match(/\/pages\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract space key from Confluence URL
 * Example: https://company.atlassian.net/wiki/spaces/MYSPACE/pages/123456/Page+Title
 */
function extractSpaceKeyFromUrl(url: string): string | null {
  const match = url.match(/\/spaces\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Convert Markdown to Confluence Storage Format (Atlassian Document Format)
 */
function markdownToConfluenceStorage(markdown: string): string {
  // Simple conversion - for production, consider using a proper library
  let html = markdown
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]+?)```/g, '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">$1</ac:parameter><ac:plain-text-body><![CDATA[$2]]></ac:plain-text-body></ac:structured-macro>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Images (including base64)
    .replace(/!\[(.+?)\]\((data:image\/png;base64,.+?)\)/g, '<ac:image><ri:attachment ri:filename="$1.png" /></ac:image>')
    .replace(/!\[(.+?)\]\((.+?)\)/g, '<ac:image><ri:url ri:value="$2" /></ac:image>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    // Line breaks
    .replace(/\n/g, '<br/>');
  
  return `<p>${html}</p>`;
}

/**
 * Fetch existing PRD content from Confluence using REST API v2
 */
export async function fetchConfluencePage(
  wikiUrl: string,
  auth: ConfluenceAuth
): Promise<ConfluencePageContent | null> {
  try {
    const pageId = extractPageIdFromUrl(wikiUrl);
    if (!pageId) {
      throw new Error('Invalid Confluence URL format');
    }
    
    // Confluence REST API v2 endpoint
    const apiUrl = `${auth.url}/wiki/api/v2/pages/${pageId}?body-format=storage`;
    
    console.log('[Confluence Debug] Fetching page:', {
      url: apiUrl,
      pageId,
      authUrl: auth.url,
      authEmail: auth.email,
    });
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${base64Encode(`${auth.email}:${auth.apiToken}`)}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    console.log('[Confluence Debug] Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      console.error('[Confluence Debug] Error response:', errorText);
      throw new Error(`Confluence API error: ${response.status} ${response.statusText}. ${errorText}`);
    }
    
    const data = await response.json();
    
    console.log('[Confluence Debug] Page fetched successfully:', {
      id: data.id,
      title: data.title,
    });
    
    return {
      id: data.id,
      title: data.title,
      content: data.body?.storage?.value || '',
      version: data.version?.number || 1,
      url: wikiUrl,
    };
  } catch (e) {
    console.error('[Confluence] Failed to fetch page:', e);
    throw e;
  }
}

/**
 * Compare new PRD with existing Confluence content and generate a merge strategy
 */
export async function compareAndMergePRD(
  settings: Settings,
  newPRD: PRDResult,
  existingContent: ConfluencePageContent | null
): Promise<{ mergedMarkdown: string; changes: string[] }> {
  
  if (!existingContent) {
    // No existing content, just use new PRD
    return {
      mergedMarkdown: newPRD.markdown,
      changes: ['Created new PRD document'],
    };
  }
  
  // Use AI to intelligently merge the documents
  const systemPrompt = `You are a technical writer helping to update a PRD (Product Requirements Document) in Confluence.

Your task:
1. Compare the NEW PRD content with the EXISTING PRD content
2. Identify what has changed (new features, updated logic, modified acceptance criteria)
3. Generate a MERGED document that:
   - Preserves important existing content that's still relevant
   - Incorporates all new information from the new PRD
   - Maintains document structure and readability
   - Adds version notes or change highlights if significant updates exist

Output format:
\`\`\`json
{
  "mergedMarkdown": "Complete merged PRD in markdown format",
  "changes": ["List of key changes made", "Another change", ...]
}
\`\`\``;

  const userPrompt = JSON.stringify({
    existingPRD: {
      title: existingContent.title,
      content: existingContent.content,
      version: existingContent.version,
    },
    newPRD: {
      featureName: newPRD.featureName,
      content: newPRD.markdown,
      matchedSections: newPRD.matchedSections,
    },
    instructions: [
      'Preserve existing content that is still relevant',
      'Add new information from the new PRD',
      'Highlight significant changes',
      'Maintain professional PRD structure',
      'Keep the document coherent and readable',
    ],
  }, null, 2);

  try {
    const raw = await openRouterChat(settings, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        mergedMarkdown: String(parsed.mergedMarkdown || newPRD.markdown),
        changes: Array.isArray(parsed.changes) ? parsed.changes : ['Updated PRD content'],
      };
    }
  } catch (e) {
    console.error('[Confluence] Merge failed:', e);
  }

  // Fallback: simple append strategy
  const mergedMarkdown = `${existingContent.content}\n\n---\n\n## Update (${new Date().toISOString().split('T')[0]})\n\n${newPRD.markdown}`;
  
  return {
    mergedMarkdown,
    changes: ['Appended new PRD content to existing document'],
  };
}

/**
 * Sync PRD to Confluence using REST API v2
 */
export async function syncToConfluence(
  wikiUrl: string,
  prdContent: string,
  title: string,
  auth: ConfluenceAuth
): Promise<{ success: boolean; message: string; url?: string }> {
  try {
    console.log('[Confluence Debug] Starting sync:', {
      wikiUrl,
      title,
      contentLength: prdContent.length,
      authUrl: auth.url,
      authEmail: auth.email,
    });
    
    const pageId = extractPageIdFromUrl(wikiUrl);
    const spaceKey = extractSpaceKeyFromUrl(wikiUrl);
    
    console.log('[Confluence Debug] Parsed URL:', { pageId, spaceKey });
    
    if (!pageId && !spaceKey) {
      return {
        success: false,
        message: 'Invalid Confluence URL format. Expected: https://company.atlassian.net/wiki/spaces/SPACE/pages/123456/Page+Title',
      };
    }
    
    // Convert markdown to Confluence storage format
    const storageContent = markdownToConfluenceStorage(prdContent);
    console.log('[Confluence Debug] Converted to storage format, length:', storageContent.length);
    
    let result: { success: boolean; message: string; url?: string };
    
    if (pageId) {
      console.log('[Confluence Debug] Updating existing page:', pageId);
      // Update existing page
      result = await updateConfluencePage(pageId, title, storageContent, auth);
    } else if (spaceKey) {
      console.log('[Confluence Debug] Creating new page in space:', spaceKey);
      // Create new page
      result = await createConfluencePage(spaceKey, title, storageContent, auth);
    } else {
      return {
        success: false,
        message: 'Could not determine page ID or space key from URL',
      };
    }
    
    console.log('[Confluence Debug] Sync result:', result);
    return result;
  } catch (e) {
    console.error('[Confluence Debug] Sync error:', e);
    return {
      success: false,
      message: `Failed to sync to Confluence: ${(e as Error).message}. Stack: ${(e as Error).stack}`,
    };
  }
}

/**
 * Create a new Confluence page
 */
async function createConfluencePage(
  spaceKey: string,
  title: string,
  content: string,
  auth: ConfluenceAuth
): Promise<{ success: boolean; message: string; url?: string }> {
  try {
    const apiUrl = `${auth.url}/wiki/api/v2/pages`;
    
    const requestBody = {
      spaceId: spaceKey,
      status: 'current',
      title: title,
      body: {
        representation: 'storage',
        value: content,
      },
    };
    
    console.log('[Confluence Debug] Creating page:', {
      apiUrl,
      spaceKey,
      title,
      contentLength: content.length,
    });
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Encode(`${auth.email}:${auth.apiToken}`)}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log('[Confluence Debug] Create response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      console.error('[Confluence Debug] Create error response:', errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { rawError: errorText };
      }
      throw new Error(`Confluence API error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    const pageUrl = `${auth.url}/wiki${data._links.webui}`;
    
    console.log('[Confluence Debug] Page created successfully:', {
      pageId: data.id,
      pageUrl,
    });
    
    return {
      success: true,
      message: `PRD successfully created in Confluence!`,
      url: pageUrl,
    };
  } catch (e) {
    console.error('[Confluence Debug] Create page error:', e);
    return {
      success: false,
      message: `Failed to create page: ${(e as Error).message}`,
    };
  }
}

/**
 * Update an existing Confluence page
 */
async function updateConfluencePage(
  pageId: string,
  title: string,
  content: string,
  auth: ConfluenceAuth
): Promise<{ success: boolean; message: string; url?: string }> {
  try {
    console.log('[Confluence Debug] Fetching current page version...');
    
    // First, fetch the current version
    const currentPage = await fetchConfluencePage(
      `${auth.url}/wiki/spaces/TEMP/pages/${pageId}`,
      auth
    );
    
    if (!currentPage) {
      throw new Error('Failed to fetch current page version');
    }
    
    console.log('[Confluence Debug] Current version:', currentPage.version);
    
    const apiUrl = `${auth.url}/wiki/api/v2/pages/${pageId}`;
    
    const requestBody = {
      id: pageId,
      status: 'current',
      title: title,
      body: {
        representation: 'storage',
        value: content,
      },
      version: {
        number: currentPage.version + 1,
        message: 'Updated by Figma PRD Plugin',
      },
    };
    
    console.log('[Confluence Debug] Updating page:', {
      apiUrl,
      pageId,
      title,
      newVersion: currentPage.version + 1,
      contentLength: content.length,
    });
    
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${base64Encode(`${auth.email}:${auth.apiToken}`)}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log('[Confluence Debug] Update response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      console.error('[Confluence Debug] Update error response:', errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { rawError: errorText };
      }
      throw new Error(`Confluence API error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    const pageUrl = `${auth.url}/wiki${data._links.webui}`;
    
    console.log('[Confluence Debug] Page updated successfully:', {
      pageId: data.id,
      pageUrl,
      newVersion: data.version?.number,
    });
    
    return {
      success: true,
      message: `PRD successfully updated in Confluence!`,
      url: pageUrl,
    };
  } catch (e) {
    console.error('[Confluence Debug] Update page error:', e);
    return {
      success: false,
      message: `Failed to update page: ${(e as Error).message}`,
    };
  }
}

/**
 * Test Confluence connection and authentication
 */
export async function testConfluenceConnection(
  auth: ConfluenceAuth
): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    console.log('[Confluence Debug] Testing connection:', {
      url: auth.url,
      email: auth.email,
    });
    
    // Try to fetch user info to test authentication
    const apiUrl = `${auth.url}/wiki/api/v2/spaces?limit=1`;
    
    console.log('[Confluence Debug] Test API URL:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${base64Encode(`${auth.email}:${auth.apiToken}`)}`,
        'Accept': 'application/json',
      },
    });
    
    console.log('[Confluence Debug] Test response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      console.error('[Confluence Debug] Test error response:', errorText);
      
      if (response.status === 401) {
        return {
          success: false,
          message: '❌ 认证失败：请检查 Email 和 API Token 是否正确',
          details: { status: response.status, error: errorText },
        };
      } else if (response.status === 404) {
        return {
          success: false,
          message: '❌ Confluence URL 不正确：无法访问该地址',
          details: { status: response.status, error: errorText },
        };
      } else {
        return {
          success: false,
          message: `❌ 连接失败 (${response.status}): ${response.statusText}`,
          details: { status: response.status, error: errorText },
        };
      }
    }
    
    const data = await response.json();
    console.log('[Confluence Debug] Test successful, spaces found:', data.results?.length || 0);
    
    return {
      success: true,
      message: `✅ 连接成功！找到 ${data.results?.length || 0} 个 Space`,
      details: { spaces: data.results?.map((s: any) => s.name) },
    };
  } catch (e) {
    console.error('[Confluence Debug] Test connection error:', e);
    
    const errorMessage = (e as Error).message;
    
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return {
        success: false,
        message: '❌ 网络错误：无法连接到 Confluence（可能是 CORS 或网络问题）',
        details: { error: errorMessage },
      };
    }
    
    return {
      success: false,
      message: `❌ 测试失败: ${errorMessage}`,
      details: { error: errorMessage },
    };
  }
}

/**
 * Generate a summary of changes between old and new PRD
 */
export function generateChangeSummary(oldContent: string, newContent: string): string[] {
  const changes: string[] = [];
  
  // Simple heuristic-based change detection
  const oldLines = oldContent.split('\n').filter(l => l.trim());
  const newLines = newContent.split('\n').filter(l => l.trim());
  
  if (newLines.length > oldLines.length) {
    changes.push(`Added ${newLines.length - oldLines.length} new lines`);
  } else if (newLines.length < oldLines.length) {
    changes.push(`Removed ${oldLines.length - newLines.length} lines`);
  }
  
  // Check for new sections
  const oldSections: string[] = oldContent.match(/^#+\s+.+$/gm) || [];
  const newSections: string[] = newContent.match(/^#+\s+.+$/gm) || [];
  
  const addedSections = newSections.filter((s: string) => !oldSections.includes(s));
  if (addedSections.length > 0) {
    changes.push(`Added ${addedSections.length} new section(s)`);
  }
  
  if (changes.length === 0) {
    changes.push('Minor content updates');
  }
  
  return changes;
}
