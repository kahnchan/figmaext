import type { Settings, PRDResult } from '@shared/messages';
import { openRouterChat } from './openrouter';

/**
 * Confluence integration for PRD synchronization
 * 
 * This module handles:
 * 1. Fetching existing PRD from Confluence wiki
 * 2. Comparing new PRD with existing content
 * 3. Generating update/merge strategies
 * 4. Syncing PRD to Confluence (via MCP if available)
 */

export interface ConfluencePageContent {
  title: string;
  content: string; // HTML or markdown
  version: number;
  url: string;
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
 * Fetch existing PRD content from Confluence
 * Note: This is a placeholder. In production, this would use Atlassian MCP or REST API
 */
export async function fetchConfluencePage(wikiUrl: string): Promise<ConfluencePageContent | null> {
  try {
    const pageId = extractPageIdFromUrl(wikiUrl);
    if (!pageId) {
      throw new Error('Invalid Confluence URL format');
    }
    
    // TODO: Implement actual Confluence API call or MCP integration
    // For now, return null to indicate no existing content
    console.log('[Confluence] Would fetch page:', pageId);
    return null;
  } catch (e) {
    console.error('[Confluence] Failed to fetch page:', e);
    return null;
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
 * Sync PRD to Confluence
 * Note: This is a placeholder for MCP integration
 */
export async function syncToConfluence(
  wikiUrl: string,
  prdContent: string,
  title: string
): Promise<{ success: boolean; message: string; url?: string }> {
  try {
    const pageId = extractPageIdFromUrl(wikiUrl);
    
    if (!pageId) {
      return {
        success: false,
        message: 'Invalid Confluence URL format. Expected: https://company.atlassian.net/wiki/spaces/SPACE/pages/123456/Page+Title',
      };
    }
    
    // TODO: Implement actual Confluence API call or MCP integration
    // This would use Atlassian MCP server to update the page
    
    console.log('[Confluence] Would sync to page:', pageId);
    console.log('[Confluence] Title:', title);
    console.log('[Confluence] Content length:', prdContent.length);
    
    // For now, return a placeholder response
    return {
      success: false,
      message: 'Confluence MCP integration not yet configured. Please set up Atlassian MCP server to enable auto-sync.',
      url: wikiUrl,
    };
  } catch (e) {
    return {
      success: false,
      message: `Failed to sync to Confluence: ${(e as Error).message}`,
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
