/**
 * Memory tools for the agent
 *
 * - remember: Save facts to long-term memory
 * - forget: Remove facts from memory
 */

import { MemoryManager } from '../memory';

let memoryManager: MemoryManager | null = null;

export function setMemoryManager(memory: MemoryManager): void {
  memoryManager = memory;
}

/**
 * Remember tool definition
 */
export function getRememberToolDefinition() {
  return {
    name: 'remember',
    description: `Save important information to long-term memory.

Use this PROACTIVELY when the user shares:
- Personal info (name, location, work, birthday)
- Preferences (likes, dislikes, communication style)
- Projects they're working on
- People important to them
- Decisions or commitments made
- Any fact they'd want you to recall later

Categories: user_info, preferences, projects, people, work, notes, decisions

Examples:
- remember("user_info", "name", "John")
- remember("preferences", "coffee", "Prefers oat milk lattes")
- remember("projects", "website_redesign", "Redesigning company website, due March 15")
- remember("people", "Sarah", "Best friend, works at Google")`,
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Category: user_info, preferences, projects, people, work, notes, decisions',
        },
        subject: {
          type: 'string',
          description: 'Short identifier for this fact (e.g., "name", "coffee_preference", "project_x")',
        },
        content: {
          type: 'string',
          description: 'The fact to remember',
        },
      },
      required: ['category', 'subject', 'content'],
    },
  };
}

/**
 * Remember tool handler
 */
export async function handleRememberTool(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { category, subject, content } = input as {
    category: string;
    subject: string;
    content: string;
  };

  if (!category || !subject || !content) {
    return JSON.stringify({ error: 'Missing required fields: category, subject, content' });
  }

  const id = memoryManager.saveFact(category, subject, content);
  console.log(`[Remember] Saved: [${category}] ${subject}: ${content}`);

  return JSON.stringify({
    success: true,
    message: `Remembered: ${subject}`,
    id,
    category,
    subject,
  });
}

/**
 * Forget tool definition
 */
export function getForgetToolDefinition() {
  return {
    name: 'forget',
    description: `Remove a fact from long-term memory.

Use when:
- User asks you to forget something
- Information is outdated
- A correction needs to be made (forget old, remember new)

You can forget by:
- Category + subject (recommended)
- Fact ID (if known)`,
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Category of the fact to forget',
        },
        subject: {
          type: 'string',
          description: 'Subject of the fact to forget',
        },
        id: {
          type: 'number',
          description: 'Fact ID (alternative to category+subject)',
        },
      },
      required: [],
    },
  };
}

/**
 * Forget tool handler
 */
export async function handleForgetTool(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { category, subject, id } = input as {
    category?: string;
    subject?: string;
    id?: number;
  };

  let deleted = false;

  if (id !== undefined) {
    deleted = memoryManager.deleteFact(id);
  } else if (category && subject) {
    deleted = memoryManager.deleteFactBySubject(category, subject);
  } else {
    return JSON.stringify({ error: 'Provide either id OR category+subject' });
  }

  if (deleted) {
    console.log(`[Forget] Deleted: ${id ?? `${category}/${subject}`}`);
    return JSON.stringify({ success: true, message: 'Fact forgotten' });
  } else {
    return JSON.stringify({ success: false, message: 'Fact not found' });
  }
}

/**
 * List facts tool definition (for /facts command)
 */
export function getListFactsToolDefinition() {
  return {
    name: 'list_facts',
    description: 'List all known facts from memory. Use when user asks "what do you know about me" or similar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Optional: filter by category',
        },
      },
      required: [],
    },
  };
}

/**
 * List facts tool handler
 */
export async function handleListFactsTool(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { category } = input as { category?: string };

  let facts;
  if (category) {
    facts = memoryManager.getFactsByCategory(category);
  } else {
    facts = memoryManager.getAllFacts();
  }

  if (facts.length === 0) {
    return JSON.stringify({
      success: true,
      message: category ? `No facts in category: ${category}` : 'No facts stored yet',
      facts: [],
    });
  }

  return JSON.stringify({
    success: true,
    count: facts.length,
    facts: facts.map(f => ({
      id: f.id,
      category: f.category,
      subject: f.subject,
      content: f.content,
    })),
  });
}

/**
 * Memory search tool definition
 */
export function getMemorySearchToolDefinition() {
  return {
    name: 'memory_search',
    description: `Search long-term memory using semantic + keyword hybrid search.

Use this PROACTIVELY to:
- Recall relevant facts before answering questions about the user
- Find context before the conversation gets compacted
- Look up previous decisions, preferences, or project details

Returns top 6 results with relevance scores. Uses 70% semantic (embedding) similarity + 30% keyword (BM25) matching.

Examples:
- memory_search("user's job") -> finds work-related facts
- memory_search("coffee preferences") -> finds preference facts
- memory_search("project deadline") -> finds project facts`,
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query - can be natural language',
        },
      },
      required: ['query'],
    },
  };
}

/**
 * Memory search tool handler
 */
export async function handleMemorySearchTool(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { query } = input as { query: string };

  if (!query || query.trim().length === 0) {
    return JSON.stringify({ error: 'Query is required' });
  }

  try {
    const results = await memoryManager.searchFactsHybrid(query);

    if (results.length === 0) {
      return JSON.stringify({
        success: true,
        message: 'No relevant facts found',
        results: [],
      });
    }

    console.log(`[MemorySearch] Found ${results.length} results for: "${query}"`);

    return JSON.stringify({
      success: true,
      count: results.length,
      results: results.map(r => ({
        id: r.fact.id,
        category: r.fact.category,
        subject: r.fact.subject,
        content: r.fact.content,
        score: Math.round(r.score * 100) / 100,
        vectorScore: Math.round(r.vectorScore * 100) / 100,
        keywordScore: Math.round(r.keywordScore * 100) / 100,
      })),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MemorySearch] Failed:', errorMsg);
    return JSON.stringify({ error: errorMsg });
  }
}

/**
 * Daily log tool definition
 */
export function getDailyLogToolDefinition() {
  return {
    name: 'daily_log',
    description: `Add an entry to today's daily log. The daily log is a journal of activities and events throughout the day.

Use this to record:
- Significant conversations or topics discussed
- Tasks completed or started
- User's mood or state if mentioned
- Key decisions or events
- Reminders triggered

This helps maintain continuity across sessions and provides context about what happened during the day.

Examples:
- daily_log("Discussed project deadline - moved to next Friday")
- daily_log("User completed the website redesign task")
- daily_log("Morning check-in - user mentioned feeling tired")`,
    input_schema: {
      type: 'object' as const,
      properties: {
        entry: {
          type: 'string',
          description: 'The log entry to add (will be timestamped automatically)',
        },
      },
      required: ['entry'],
    },
  };
}

/**
 * Daily log tool handler
 */
export async function handleDailyLogTool(input: unknown): Promise<string> {
  if (!memoryManager) {
    return JSON.stringify({ error: 'Memory not initialized' });
  }

  const { entry } = input as { entry: string };

  if (!entry || entry.trim().length === 0) {
    return JSON.stringify({ error: 'Entry is required' });
  }

  const log = memoryManager.appendToDailyLog(entry.trim());
  console.log(`[DailyLog] Added: ${entry.trim()}`);

  return JSON.stringify({
    success: true,
    message: 'Entry added to daily log',
    date: log.date,
  });
}

/**
 * Get all memory tools
 */
export function getMemoryTools() {
  return [
    {
      ...getRememberToolDefinition(),
      handler: handleRememberTool,
    },
    {
      ...getForgetToolDefinition(),
      handler: handleForgetTool,
    },
    {
      ...getListFactsToolDefinition(),
      handler: handleListFactsTool,
    },
    {
      ...getMemorySearchToolDefinition(),
      handler: handleMemorySearchTool,
    },
    {
      ...getDailyLogToolDefinition(),
      handler: handleDailyLogTool,
    },
  ];
}
