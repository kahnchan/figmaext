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
  const q = normalize([context.frameName, ...context.componentNames, ...context.texts].join(' ')).slice(0, 5000);
  const scored = sections
    .map((s) => ({ s, score: scoreSection(s, q) }))
    .sort((a, b) => b.score - a.score);

  const top = scored.filter((x) => x.score > 0).slice(0, 6).map((x) => x.s);
  return top.length > 0 ? top : sections.slice(0, Math.min(6, sections.length));
}

async function loadKB(settings: Settings): Promise<PRDSection[]> {
  if (!settings.prdEndpointUrl) return kb as unknown as PRDSection[];

  const res = await fetch(settings.prdEndpointUrl, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`KB endpoint error ${res.status}`);
  }
  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error('KB endpoint must return a JSON array');
  }
  return json as PRDSection[];
}

export async function syncPRD(settings: Settings, context: ScanContext): Promise<PRDResult> {
  const sections = await loadKB(settings);
  const candidates = pickCandidates(sections, context);

  const systemPrompt =
    "You are a PM Assistant. I will provide you with text elements from a Figma design. " +
    "Your task is to identify the feature name and retrieve the corresponding Background, Business Logic and Acceptance Criteria from the provided documentation context. " +
    "If no exact match is found, summarize the likely logic based on the UI elements.";

  const userPrompt = JSON.stringify(
    {
      figma: {
        frameName: context.frameName,
        componentNames: context.componentNames,
        texts: context.texts,
      },
      documentationContext: candidates,
      requiredSections: ['Background', 'Logic', 'AC'],
      output: {
        format: 'json',
        schema: {
          featureName: 'string',
          markdown: 'string (markdown)',
          matchedSections: 'string[] (candidate feature names used)',
        },
      },
    },
    null,
    2
  );

  const raw = await openRouterChat(settings, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  // Extract JSON object from raw (models sometimes wrap)
  const match = raw.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : raw;

  try {
    const parsed = JSON.parse(jsonText);
    return {
      featureName: String(parsed.featureName || context.frameName || 'Unknown Feature'),
      markdown: String(parsed.markdown || raw),
      matchedSections: Array.isArray(parsed.matchedSections) ? parsed.matchedSections.map(String) : [],
    };
  } catch {
    return {
      featureName: context.frameName || 'Unknown Feature',
      markdown: raw,
      matchedSections: candidates.map((c) => c.feature),
    };
  }
}
