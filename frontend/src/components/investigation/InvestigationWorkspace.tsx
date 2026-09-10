/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Issue, User, DatabaseConnection, EnvironmentSystem, HashtagPreset, QueryApprovalRequest } from '../../types';
import ValidationOrchestratorWorkspace from './ValidationOrchestratorWorkspace';

interface InvestigationWorkspaceProps {
  issues: Issue[];
  selectedIssueId: string;
  onSelectIssueId: (id: string) => void;
  currentUser: User;
  users: User[];
  databases: DatabaseConnection[];
  systems: EnvironmentSystem[];
  hashtags: HashtagPreset[];
  onUpdateIssue: (issueId: string, updates: Partial<Issue>) => void;
  onDeleteIssue?: (issueId: string) => void;
  onSendChatMessage: (issueId: string, text: string) => void;
  onSubmitQueryApproval?: (request: Omit<QueryApprovalRequest, 'id' | 'status' | 'requestDate'>) => void;
  onOpenNewCase?: () => void;
}

export default function InvestigationWorkspace(props: InvestigationWorkspaceProps) {
  return <ValidationOrchestratorWorkspace {...props} />;
}
