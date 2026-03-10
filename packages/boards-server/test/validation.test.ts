import { describe, expect, it } from 'bun:test';
import { BoardsError } from '@saliagadotcom/boards-core';
import {
  parseStatus,
  parseIssueType,
  parseDependencyType,
  parseDirection,
  parsePriority,
} from '../src/validation.js';

describe('parseStatus', () => {
  it.each(['open', 'in_progress', 'closed', 'deferred', 'blocked'])('accepts %s', (v) => {
    expect(parseStatus(v)).toBe(v);
  });

  it('rejects invalid value', () => {
    expect(() => parseStatus('banana')).toThrow(BoardsError);
    expect(() => parseStatus('banana')).toThrow(/Invalid status/);
  });
});

describe('parseIssueType', () => {
  it.each(['task', 'bug', 'feature', 'epic', 'chore'])('accepts %s', (v) => {
    expect(parseIssueType(v)).toBe(v);
  });

  it('rejects invalid value', () => {
    expect(() => parseIssueType('unknown')).toThrow(BoardsError);
    expect(() => parseIssueType('unknown')).toThrow(/Invalid issue_type/);
  });
});

describe('parseDependencyType', () => {
  it.each(['blocks', 'parent-child', 'related', 'discovered-from'])(
    'accepts %s',
    (v) => {
      expect(parseDependencyType(v)).toBe(v);
    },
  );

  it('rejects invalid value', () => {
    expect(() => parseDependencyType('invalid')).toThrow(BoardsError);
    expect(() => parseDependencyType('invalid')).toThrow(
      /Invalid dependency type/,
    );
  });
});

describe('parseDirection', () => {
  it.each(['up', 'down'])('accepts %s', (v) => {
    expect(parseDirection(v)).toBe(v);
  });

  it('rejects invalid value', () => {
    expect(() => parseDirection('sideways')).toThrow(BoardsError);
    expect(() => parseDirection('sideways')).toThrow(/Invalid direction/);
  });
});

describe('parsePriority', () => {
  it('parses valid integers', () => {
    expect(parsePriority('0')).toBe(0);
    expect(parsePriority('3')).toBe(3);
    expect(parsePriority('-1')).toBe(-1);
  });

  it('rejects non-numeric strings', () => {
    expect(() => parsePriority('abc')).toThrow(BoardsError);
    expect(() => parsePriority('abc')).toThrow(/Invalid priority/);
  });

  it('rejects empty string', () => {
    expect(() => parsePriority('')).toThrow(BoardsError);
  });
});
