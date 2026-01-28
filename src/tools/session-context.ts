/**
 * Session context for MCP tools
 *
 * Provides a shared session context that tools can access to determine
 * which session they should operate on. This is set by the AgentManager
 * before each query and read by tools that need session-scoped data.
 */

let currentSessionId: string = 'default';

/**
 * Set the current session ID for tools to use
 */
export function setCurrentSessionId(sessionId: string): void {
  currentSessionId = sessionId;
}

/**
 * Get the current session ID
 */
export function getCurrentSessionId(): string {
  return currentSessionId;
}
