import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue, Status, UpdateIssueInput } from '@saliagadotcom/boards-core';

export interface EditScreenProps {
  issue: Issue;
  terminalWidth: number;
  terminalHeight: number;
  onSave: (updates: UpdateIssueInput) => void;
  onCancel: () => void;
}

type EditField = 'status' | 'priority';

const STATUSES: { value: Status; label: string; color?: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress', color: 'blue' },
  { value: 'blocked', label: 'Blocked', color: 'red' },
  { value: 'deferred', label: 'Deferred', color: 'yellow' },
  { value: 'closed', label: 'Closed', color: 'green' },
];

const PRIORITIES: { value: number; label: string }[] = [
  { value: 0, label: 'P0 — Critical' },
  { value: 1, label: 'P1 — High' },
  { value: 2, label: 'P2 — Medium' },
  { value: 3, label: 'P3 — Low' },
  { value: 4, label: 'P4 — Backlog' },
];

const FIELDS: EditField[] = ['status', 'priority'];

export function EditScreen({
  issue,
  terminalWidth,
  terminalHeight,
  onSave,
  onCancel,
}: EditScreenProps): React.ReactElement {
  const [focusedField, setFocusedField] = useState<EditField>('status');
  const [selectedStatus, setSelectedStatus] = useState<Status>(issue.status);
  const [selectedPriority, setSelectedPriority] = useState<number>(issue.priority);
  const [statusCursor, setStatusCursor] = useState(
    () => STATUSES.findIndex((s) => s.value === issue.status),
  );
  const [priorityCursor, setPriorityCursor] = useState(
    () => PRIORITIES.findIndex((p) => p.value === issue.priority),
  );

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      const updates: UpdateIssueInput = {};
      if (selectedStatus !== issue.status) updates.status = selectedStatus;
      if (selectedPriority !== issue.priority) updates.priority = selectedPriority;
      if (Object.keys(updates).length > 0) {
        onSave(updates);
      } else {
        onCancel();
      }
      return;
    }

    if (key.tab) {
      const idx = FIELDS.indexOf(focusedField);
      const next = (idx + 1) % FIELDS.length;
      setFocusedField(FIELDS[next]!);
      return;
    }

    if (input === 'j' || key.downArrow) {
      if (focusedField === 'status') {
        setStatusCursor((prev) => Math.min(prev + 1, STATUSES.length - 1));
      } else {
        setPriorityCursor((prev) => Math.min(prev + 1, PRIORITIES.length - 1));
      }
      return;
    }

    if (input === 'k' || key.upArrow) {
      if (focusedField === 'status') {
        setStatusCursor((prev) => Math.max(prev - 1, 0));
      } else {
        setPriorityCursor((prev) => Math.max(prev - 1, 0));
      }
      return;
    }

    if (input === ' ') {
      if (focusedField === 'status') {
        setSelectedStatus(STATUSES[statusCursor]!.value);
      } else {
        setSelectedPriority(PRIORITIES[priorityCursor]!.value);
      }
    }
  });

  const typeShort: Record<string, string> = {
    task: 'TSK', bug: 'BUG', feature: 'FTR', epic: 'EPC', chore: 'CHR',
  };
  const headerType = typeShort[issue.issue_type] ?? issue.issue_type.toUpperCase();
  const header = `Edit: [${headerType}][P${issue.priority}][${issue.id}] ${issue.title}`;
  const truncatedHeader = header.length > terminalWidth - 2
    ? header.slice(0, terminalWidth - 3) + '…'
    : header;

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      <Box>
        <Text bold inverse>{` ${truncatedHeader} `}</Text>
      </Box>
      <Box flexDirection="row" flexGrow={1} marginTop={1}>
        <Box flexDirection="column" width={Math.floor(terminalWidth / 2)}>
          <FieldSection
            label="Status"
            focused={focusedField === 'status'}
            items={STATUSES.map((s, idx) => {
              const item: FieldItem = {
                label: s.label,
                selected: s.value === selectedStatus,
                cursor: idx === statusCursor && focusedField === 'status',
              };
              if (s.color != null) item.color = s.color;
              return item;
            })}
          />
        </Box>
        <Box flexDirection="column" width={Math.floor(terminalWidth / 2)}>
          <FieldSection
            label="Priority"
            focused={focusedField === 'priority'}
            items={PRIORITIES.map((p, idx) => ({
              label: p.label,
              selected: p.value === selectedPriority,
              cursor: idx === priorityCursor && focusedField === 'priority',
            }))}
          />
        </Box>
      </Box>
    </Box>
  );
}

// ── Sub-components ─────────────────────────────────────────

interface FieldItem {
  label: string;
  color?: string;
  selected: boolean;
  cursor: boolean;
}

interface FieldSectionProps {
  label: string;
  focused: boolean;
  items: FieldItem[];
}

function FieldSection({ label, focused, items }: FieldSectionProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text bold {...(focused ? { color: 'cyan' } : { dimColor: true })}>{`── ${label} ──`}</Text>
      {items.map((item) => (
        <Box key={item.label}>
          <Text>
            {item.cursor ? '>' : ' '} {item.selected ? '●' : '○'}{' '}
          </Text>
          <Text {...(item.color != null ? { color: item.color } : {})}>{item.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
