/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  HashtagPreset, 
  Transaction, 
  EnvironmentSystem, 
  User, 
  Team, 
  DatabaseConnection,
  TaskPreFillFromMessage 
} from '../types';
import WorkspaceTaskCreator from './issue/WorkspaceTaskCreator';

export interface IssueCreatorProps {
  hashtags: HashtagPreset[];
  transactions?: Transaction[];
  currentUser: { id: string; username: string; role: string; permanentTeamId?: string; shareWorkspaceWithTeam?: boolean; [key: string]: any };
  systems?: EnvironmentSystem[];
  users: User[];
  teams?: Team[];
  databases?: DatabaseConnection[];
  onCreateIssue: (newIssue: any) => void;
  activeTransactionForLinking?: Transaction | null;
  onClearLinkedTransaction?: () => void;
  onNavigateToWorkspace?: () => void;
  initialPreFill?: TaskPreFillFromMessage | null;
}

/**
 * IssueCreator wraps the unified WorkspaceTaskCreator to ensure a single, consistent,
 * feature-rich task creation interface across Workspace, Email Mailbox, and Direct routing.
 */
export default function IssueCreator({
  hashtags,
  currentUser,
  systems = [],
  users,
  teams = [],
  databases = [],
  onCreateIssue,
  onNavigateToWorkspace = () => {},
  initialPreFill
}: IssueCreatorProps) {
  return (
    <WorkspaceTaskCreator
      currentUser={currentUser}
      users={users}
      hashtags={hashtags}
      teams={teams}
      databases={databases}
      systems={systems}
      onCreateIssue={onCreateIssue}
      onBackToWorkspace={onNavigateToWorkspace}
      initialPreFill={initialPreFill}
    />
  );
}
