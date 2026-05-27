import { describe, it, expect } from 'vitest';
import { renderRefineSystemPrompt } from '../../src/refine/refineTemplate';

describe('renderRefineSystemPrompt', () => {
  it('returns a non-empty string', () => {
    const result = renderRefineSystemPrompt();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  // Kept: IMMEDIATE EXECUTION is stable across current and ported body
  it('contains IMMEDIATE EXECUTION callout', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('IMMEDIATE EXECUTION');
  });

  // Kept: MCP Tools section is stable — new body uses "Available MCP Tools", but "MCP Tools" is a substring
  it('contains MCP Tools section', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('MCP Tools');
  });

  // Kept: VAULT_MOUNT_PATH is stable fallback across both versions
  it('contains VAULT_MOUNT_PATH for filesystem fallback', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('VAULT_MOUNT_PATH');
  });

  // Kept: @cast is the stable directive name; new body renames @ai → @cast completely
  it('contains @cast reference for refine workflow', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('@cast');
  });

  // NEW: Mode headings — new body has 3 execution modes
  it('contains mode headings for three execution paths', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('Mode 1: Generate');
    expect(result).toContain('Mode 2: Expand');
    expect(result).toContain('Mode 3: Follow');
  });

  // NEW: Mode detection rules
  it('contains mode detection criteria', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('fewer than 50 words');
    expect(result).toContain('first match wins');
  });

  // INVERTED: Vault search MCP tools — now assert ABSENCE of server-specific names
  it('does not contain server-specific vault search tool names', () => {
    const result = renderRefineSystemPrompt();
    expect(result).not.toContain('search_vault_simple');
    expect(result).not.toContain('search_vault_smart');
  });

  // NEW: Web research agents and structure
  it('contains web research agent labels', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('Agent 1');
    expect(result).toContain('Agent 2');
    expect(result).toContain('Agent 3');
    expect(result).toContain('Official Sources');
    expect(result).toContain('Practical Knowledge');
    expect(result).toContain('Recent Developments');
  });

  // NEW: Web research quality checks
  it('contains web research freshness and verification structure', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('Freshness Check');
    expect(result).toContain('Unverified');
  });

  // NEW: Writing style adaptation section
  it('contains writing style section with Feynman and wikilink variants', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('Writing Style');
    expect(result).toContain('Feynman');
    expect(result).toContain('wikilink');
  });

  // INVERTED: Output Rules — now assert ABSENCE of line-level patches, PRESENCE of full-file-write
  it('does not contain line-level patch strategy; uses full-file-write instead', () => {
    const result = renderRefineSystemPrompt();
    expect(result).not.toContain('line-level patch');
    expect(result).not.toContain('full-body replacement');
    expect(result).toContain('write the whole');
  });

  // NEW: Frontmatter and YAML preservation rules
  it('contains frontmatter preservation guidance', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('frontmatter');
    expect(result).toContain('YAML');
  });

  // NEW: Shape assertion — backtick escaping in template literal
  it('contains backtick escaping for code blocks', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('```');
  });

  // REMOVED: Absence assertion — @ai (renamed to @cast in ported body)
  it('does not contain deprecated @ai directive', () => {
    const result = renderRefineSystemPrompt();
    expect(result).not.toContain('@ai');
  });

  // REMOVED: Absence assertion — NotebookLM is dropped from ported body
  it('does not contain NotebookLM references', () => {
    const result = renderRefineSystemPrompt();
    expect(result).not.toContain('NotebookLM');
  });

  // REMOVED: Absence assertion — agent-progress-protocol is dropped
  it('does not contain agent-progress-protocol', () => {
    const result = renderRefineSystemPrompt();
    expect(result).not.toContain('agent-progress-protocol');
  });

  // REMOVED: Absence assertion — ntfy.sh is dropped
  it('does not contain ntfy.sh references', () => {
    const result = renderRefineSystemPrompt();
    expect(result).not.toContain('ntfy.sh');
  });

  // REMOVED: Absence assertion — Tag conventions section is dropped
  it('does not contain Tag conventions for new notes', () => {
    const result = renderRefineSystemPrompt();
    expect(result).not.toContain('Tag conventions for new notes');
  });

  // NEW: Absence of server-specific MCP tool names
  it('does not contain mcp__obsidian-mcp-tools__ tool names', () => {
    const result = renderRefineSystemPrompt();
    expect(result).not.toContain('mcp__obsidian-mcp-tools__');
    expect(result).not.toContain('get_vault_file');
    expect(result).not.toContain('create_vault_file');
  });

  // NEW: Search ladder presence — three rungs with guidance to use best available
  it('contains search ladder with three rungs and guidance to state which was used', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('semantic');
    expect(result).toContain('full-text');
    expect(result).toContain('grep');
    expect(result).toContain('best available');
    expect(result).toMatch(/state.*which|say.*which/i);
  });

  // NEW: Full-file-write presence
  it('contains full-file-write guidance in output rules', () => {
    const result = renderRefineSystemPrompt();
    expect(result).toContain('write the whole');
  });
});
