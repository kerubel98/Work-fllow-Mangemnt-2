/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  User, Team, TeamTask, TeamInsight, TeamDiscussionMessage, 
  TeamRelationship, TeamRelationshipType,
  WorkspaceSettingProposal, SettingProposalType, SettingProposalStatus, TeamEscalationTarget,
  DatabaseConnection, AllowedQueryType, MemberPrivilege
} from '../types';
import { api } from '../api/client';
import { 
  Users, MessageSquare, CheckSquare, Lightbulb, Plus, Send, 
  ShieldCheck, UserCheck, Briefcase, Tag, Trash2, Clock, 
  CheckCircle2, AlertCircle, Sparkles, Filter, ChevronRight, UserPlus, X, Check,
  ArrowLeft, Crown, Calendar, TrendingUp, BarChart2, Target, Flag,
  Network, GitFork, ArrowUpRight, ArrowDownLeft, Share2, Layers,
  Globe, Lock, FileCode, RefreshCw, GitPullRequest, ExternalLink, Sliders,
  PanelLeftClose, PanelLeftOpen, Settings, Database, Key, Server,
  BookOpen, Copy, CheckCheck, Search, HardDrive, HelpCircle, FolderPlus
} from 'lucide-react';

export type TeamSettingsSubTab = 'approvals' | 'grants' | 'ai-strategy' | 'relationships' | 'db-access';
export type ResourceSubTab = 'system-resources' | 'library' | 'insights';

interface TeamWorkspaceProps {
  currentUser: User;
  users: User[];
  teams: Team[];
  databases?: DatabaseConnection[];
  tasks: TeamTask[];
  insights: TeamInsight[];
  messages: TeamDiscussionMessage[];
  onCreateTeam?: (team: Omit<Team, 'id' | 'createdAt'>) => void;
  onUpdateTeam?: (id: string, updates: Partial<Team>) => void;
  onAddTask: (task: Omit<TeamTask, 'id' | 'createdAt'>) => void;
  onUpdateTaskStatus: (taskId: string, status: 'To Do' | 'In Progress' | 'Done') => void;
  onUpdateTask?: (taskId: string, updates: Partial<TeamTask>) => void;
  onDeleteTask: (taskId: string) => void;
  onAddInsight: (insight: Omit<TeamInsight, 'id' | 'createdAt'>) => void;
  onDeleteInsight: (insightId: string) => void;
  onSendMessage: (msg: Omit<TeamDiscussionMessage, 'id' | 'timestamp'>) => void;
  openCreateModalSignal?: number;
  initialSelectedTeamId?: string | null;
  initialActiveTab?: 'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights' | 'resources' | 'team_settings' | 'approvals' | 'grants' | 'ai-strategy' | 'relationships' | 'db-access' | null;
  initialSelectedTaskId?: string | null;
  onOpenPersonalChat?: (userId: string) => void;
  onActiveTeamChange?: (teamName: string | null) => void;
}

export default function TeamWorkspace({
  currentUser,
  users = [],
  teams = [],
  databases = [],
  tasks = [],
  insights = [],
  messages = [],
  onCreateTeam,
  onUpdateTeam,
  onAddTask,
  onUpdateTaskStatus,
  onUpdateTask,
  onDeleteTask,
  onAddInsight,
  onDeleteInsight,
  onSendMessage,
  openCreateModalSignal,
  initialSelectedTeamId,
  initialActiveTab,
  initialSelectedTaskId,
  onOpenPersonalChat,
  onActiveTeamChange
}: TeamWorkspaceProps) {

  // Helper for computing 2-3 character initials for circle avatar
  const getTeamAbbreviation = (name: string): string => {
    if (!name) return 'TM';
    const clean = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    } else if (parts.length === 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    } else {
      return (parts[0][0] + parts[1][0] + (parts[2] ? parts[2][0] : '')).toUpperCase();
    }
  };

  // Filter teams so user ONLY sees their own created groups and groups they are added to:
  const visibleTeams = React.useMemo(() => {
    return teams.filter(t => 
      t.managerId === currentUser.id || 
      (t.memberIds && t.memberIds.includes(currentUser.id)) ||
      (currentUser.teamId && currentUser.teamId === t.id)
    );
  }, [teams, currentUser]);

  // Map of userId -> Permanent Team (for single permanent team invariant)
  const userPermTeamMap = React.useMemo(() => {
    const map: Record<string, Team> = {};
    teams.filter(t => (t.teamType || 'working') === 'permanent').forEach(t => {
      if (t.managerId) map[t.managerId] = t;
      (t.memberIds || []).forEach(mId => {
        map[mId] = t;
      });
    });
    return map;
  }, [teams]);

  const isInitialSettingsSubTab = ['approvals', 'grants', 'ai-strategy', 'relationships', 'db-access'].includes(initialActiveTab as any);

  // Active sub-tab state inside Team Workspace
  const [activeTab, setActiveTab] = useState<
    'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights' | 'resources' | 'team_settings' | 'approvals' | 'grants' | 'ai-strategy' | 'relationships' | 'db-access'
  >(
    isInitialSettingsSubTab ? 'team_settings' : (initialActiveTab === 'insights' ? 'resources' : (initialActiveTab || 'discussion'))
  );

  const [resourceSubTab, setResourceSubTab] = useState<ResourceSubTab>(
    initialActiveTab === 'insights' ? 'insights' : 'system-resources'
  );

  const [teamSettingsSubTab, setTeamSettingsSubTab] = useState<TeamSettingsSubTab>(
    isInitialSettingsSubTab ? (initialActiveTab as TeamSettingsSubTab) : 'approvals'
  );

  // Database Access & Query Governance state for Current Team (Tier 1 Envelope)
  const [selectedDbIds, setSelectedDbIds] = useState<string[]>([]);
  const [selectedQueryTypes, setSelectedQueryTypes] = useState<AllowedQueryType[]>(['SELECT']);
  const [isSavingDbAccess, setIsSavingDbAccess] = useState(false);
  const [dbAccessSuccessMsg, setDbAccessSuccessMsg] = useState<string | null>(null);
  const [dbAccessErrMsg, setDbAccessErrMsg] = useState<string | null>(null);

  // Team-Specific Database Connections state (Isolated Scope)
  const [teamSpecificDbs, setTeamSpecificDbs] = useState<DatabaseConnection[]>([]);
  const [isLoadingTeamDbs, setIsLoadingTeamDbs] = useState(false);

  // Add Team Database Modal state
  const [showAddTeamDbModal, setShowAddTeamDbModal] = useState(false);
  const [newTeamDbName, setNewTeamDbName] = useState('');
  const [newTeamDbType, setNewTeamDbType] = useState('PostgreSQL');
  const [newTeamDbHost, setNewTeamDbHost] = useState('localhost');
  const [newTeamDbPort, setNewTeamDbPort] = useState<number>(5432);
  const [newTeamDbDatabaseName, setNewTeamDbDatabaseName] = useState('');
  const [newTeamDbUsername, setNewTeamDbUsername] = useState('');
  const [newTeamDbPassword, setNewTeamDbPassword] = useState('');
  const [newTeamDbDescription, setNewTeamDbDescription] = useState('');
  const [isTestingTeamDb, setIsTestingTeamDb] = useState(false);
  const [teamDbTestResult, setTeamDbTestResult] = useState<{ success: boolean; pingMs?: number; message: string } | null>(null);
  const [isSubmittingTeamDb, setIsSubmittingTeamDb] = useState(false);
  const [teamDbError, setTeamDbError] = useState<string | null>(null);

  // Promotion Request Modal state
  const [promotingDb, setPromotingDb] = useState<DatabaseConnection | null>(null);
  const [promotionNotes, setPromotionNotes] = useState('');
  const [isSubmittingPromotion, setIsSubmittingPromotion] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);

  // Library Query Templates state
  interface LibraryQueryTemplate {
    id: string;
    title: string;
    category: string;
    description: string;
    sql: string;
    targetDb: string;
    authorName: string;
    createdAt: string;
  }

  const [libraryTemplates, setLibraryTemplates] = useState<LibraryQueryTemplate[]>([
    {
      id: 'tmpl-1',
      title: 'Daily Settlement Discrepancy Audit',
      category: 'Reconciliation',
      description: 'Finds unsettled debit/credit transactions with amount mismatch across mirror records.',
      sql: `SELECT transaction_reference, account_number, amount, currency, settlement_status, created_at\nFROM mirror_core_banking_transactions\nWHERE settlement_status IN ('UNSETTLED', 'DISCREPANCY')\nORDER BY created_at DESC\nLIMIT 50;`,
      targetDb: 'Core Banking CBS',
      authorName: 'Admin',
      createdAt: '2026-09-15'
    },
    {
      id: 'tmpl-2',
      title: 'ISO 8583 Staging File Record Inspection',
      category: 'Staging & Feed',
      description: 'Queries raw staged records from FTP mirror to verify terminal and merchant IDs.',
      sql: `SELECT record_id, terminal_id, merchant_id, transaction_amount, staged_at\nFROM mirror_ftp_staging_records\nWHERE processing_status = 'PENDING'\nLIMIT 100;`,
      targetDb: 'AIB Switch Mirror',
      authorName: 'OpsSupervisor',
      createdAt: '2026-09-17'
    },
    {
      id: 'tmpl-3',
      title: 'High-Value Anomaly Detection (> 50,000 ETB)',
      category: 'Risk & Audit',
      description: 'Inspects all transactions exceeding single transaction threshold without maker-checker approval.',
      sql: `SELECT id, card_pan_masked, amount, currency, auth_code, timestamp\nFROM card_transactions\nWHERE amount >= 50000.00\nORDER BY timestamp DESC\nLIMIT 25;`,
      targetDb: 'Payment Switch',
      authorName: 'RiskTeam',
      createdAt: '2026-09-18'
    }
  ]);
  const [searchLibraryQuery, setSearchLibraryQuery] = useState('');
  const [selectedLibraryCategory, setSelectedLibraryCategory] = useState<string>('ALL');
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [newTemplateSql, setNewTemplateSql] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('Reconciliation');
  const [newTemplateDb, setNewTemplateDb] = useState('Core Banking CBS');
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);

  // Member Privileges Delegation state (Tier 2 Manager Delegation)
  const [memberPrivilegesState, setMemberPrivilegesState] = useState<Record<string, MemberPrivilege>>({});
  const [isSavingMemberPrivileges, setIsSavingMemberPrivileges] = useState(false);
  const [memberPrivSuccessMsg, setMemberPrivSuccessMsg] = useState<string | null>(null);
  const [memberPrivErrMsg, setMemberPrivErrMsg] = useState<string | null>(null);

  // Selected active team ID
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    initialSelectedTeamId !== undefined 
      ? initialSelectedTeamId 
      : (visibleTeams[0]?.id || null)
  );

  // Left circle navigation rail toggle state
  const [isTeamRailOpen, setIsTeamRailOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('it_team_rail_open');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleToggleTeamRail = () => {
    setIsTeamRailOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem('it_team_rail_open', String(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  };

  const loadTeamSpecificDbs = React.useCallback(async (teamId: string) => {
    if (!teamId) return;
    setIsLoadingTeamDbs(true);
    try {
      const dbs = await api.getTeamDatabases(teamId);
      setTeamSpecificDbs(Array.isArray(dbs) ? dbs : []);
    } catch (err) {
      console.warn('Failed to load team-specific databases:', err);
      setTeamSpecificDbs([]);
    } finally {
      setIsLoadingTeamDbs(false);
    }
  }, []);

  React.useEffect(() => {
    if (initialSelectedTeamId !== undefined && visibleTeams.some(t => t.id === initialSelectedTeamId)) {
      setSelectedTeamId(initialSelectedTeamId);
    } else if (visibleTeams.length > 0) {
      if (!selectedTeamId || !visibleTeams.some(t => t.id === selectedTeamId)) {
        setSelectedTeamId(visibleTeams[0].id);
      }
    } else {
      setSelectedTeamId(null);
    }
  }, [visibleTeams, initialSelectedTeamId]);

  React.useEffect(() => {
    if (initialActiveTab) {
      if (['approvals', 'grants', 'ai-strategy', 'relationships', 'db-access'].includes(initialActiveTab)) {
        setActiveTab('team_settings');
        setTeamSettingsSubTab(initialActiveTab as TeamSettingsSubTab);
      } else if (initialActiveTab === 'insights') {
        setActiveTab('resources');
        setResourceSubTab('insights');
      } else {
        setActiveTab(initialActiveTab as any);
      }
    }
  }, [initialActiveTab]);

  const currentTeam = selectedTeamId ? visibleTeams.find(t => t.id === selectedTeamId) || null : (visibleTeams[0] || null);

  React.useEffect(() => {
    if (currentTeam) {
      setSelectedDbIds(currentTeam.allowedDbIds || []);
      setSelectedQueryTypes(currentTeam.allowedQueryTypes && currentTeam.allowedQueryTypes.length > 0 ? currentTeam.allowedQueryTypes : ['SELECT']);
      setDbAccessSuccessMsg(null);
      setDbAccessErrMsg(null);
      setMemberPrivilegesState(currentTeam.memberPrivileges || {});
      loadTeamSpecificDbs(currentTeam.id);
    }
  }, [currentTeam?.id, currentTeam?.allowedDbIds, currentTeam?.allowedQueryTypes, currentTeam?.memberPrivileges, loadTeamSpecificDbs]);

  const handleToggleDbId = (dbId: string) => {
    setSelectedDbIds(prev => 
      prev.includes(dbId) ? prev.filter(id => id !== dbId) : [...prev, dbId]
    );
  };

  const handleToggleQueryType = (qType: AllowedQueryType) => {
    setSelectedQueryTypes(prev => {
      if (prev.includes(qType)) {
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== qType);
      } else {
        return [...prev, qType];
      }
    });
  };

  const handleSaveDbAccess = async () => {
    if (!currentTeam || !onUpdateTeam) return;
    setIsSavingDbAccess(true);
    setDbAccessSuccessMsg(null);
    setDbAccessErrMsg(null);

    const safeQueryTypes = selectedQueryTypes.length > 0 ? selectedQueryTypes : ['SELECT' as AllowedQueryType];

    try {
      await api.updateTeam(currentTeam.id, {
        allowedDbIds: selectedDbIds,
        allowedQueryTypes: safeQueryTypes
      });
      onUpdateTeam(currentTeam.id, {
        allowedDbIds: selectedDbIds,
        allowedQueryTypes: safeQueryTypes
      });
      setDbAccessSuccessMsg('Team database access & query permissions saved successfully.');
      setTimeout(() => setDbAccessSuccessMsg(null), 4000);
    } catch (err: any) {
      setDbAccessErrMsg(err.message || 'Failed to save database access policy.');
    } finally {
      setIsSavingDbAccess(false);
    }
  };

  // Test team database connection
  const handleTestTeamDbConnection = async () => {
    if (!newTeamDbHost.trim()) return;
    setIsTestingTeamDb(true);
    setTeamDbTestResult(null);
    try {
      const res = await api.testConnection({
        type: newTeamDbType,
        host: newTeamDbHost.trim(),
        port: Number(newTeamDbPort) || (newTeamDbType === 'MySQL' ? 3306 : newTeamDbType === 'Oracle' ? 1521 : 5432),
        databaseName: newTeamDbDatabaseName.trim(),
        username: newTeamDbUsername.trim()
      });
      setTeamDbTestResult({
        success: res.success,
        pingMs: res.pingMs,
        message: res.message || (res.success ? 'Connection reachable' : 'Connection failed')
      });
    } catch (err: any) {
      setTeamDbTestResult({
        success: false,
        message: err.message || 'Connection test failed'
      });
    } finally {
      setIsTestingTeamDb(false);
    }
  };

  // Create team database connection submit
  const handleCreateTeamDbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam || !newTeamDbName.trim() || !newTeamDbHost.trim()) return;
    setIsSubmittingTeamDb(true);
    setTeamDbError(null);
    try {
      await api.createTeamDatabase(currentTeam.id, {
        userId: currentUser.id,
        name: newTeamDbName.trim(),
        type: newTeamDbType,
        host: newTeamDbHost.trim(),
        port: Number(newTeamDbPort) || (newTeamDbType === 'MySQL' ? 3306 : newTeamDbType === 'Oracle' ? 1521 : 5432),
        databaseName: newTeamDbDatabaseName.trim(),
        username: newTeamDbUsername.trim(),
        password: newTeamDbPassword,
        description: newTeamDbDescription.trim() || `Team-specific connection for ${currentTeam.name}`
      });
      await loadTeamSpecificDbs(currentTeam.id);
      setShowAddTeamDbModal(false);
      setNewTeamDbName('');
      setNewTeamDbHost('localhost');
      setNewTeamDbDatabaseName('');
      setNewTeamDbUsername('');
      setNewTeamDbPassword('');
      setNewTeamDbDescription('');
      setTeamDbTestResult(null);
      alert('Team-specific database connection created! It is private to this team until requested and approved for system-wide promotion.');
    } catch (err: any) {
      setTeamDbError(err.message || 'Failed to create team database');
    } finally {
      setIsSubmittingTeamDb(false);
    }
  };

  // Request system-wide promotion
  const handleRequestPromotionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promotingDb || !currentTeam) return;
    setIsSubmittingPromotion(true);
    setPromotionError(null);
    try {
      await api.requestTeamDatabasePromotion(promotingDb.id, currentUser.id, promotionNotes.trim() || undefined);
      await loadTeamSpecificDbs(currentTeam.id);
      setPromotingDb(null);
      setPromotionNotes('');
      alert(`Promotion request for "${promotingDb.name}" submitted to Workspace Admins. It will appear on the Admin Team Resources Monitor.`);
    } catch (err: any) {
      setPromotionError(err.message || 'Failed to request promotion');
    } finally {
      setIsSubmittingPromotion(false);
    }
  };

  // Copy SQL to clipboard in Library
  const handleCopySql = (templateId: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedTemplateId(templateId);
    setTimeout(() => {
      setCopiedTemplateId(prev => prev === templateId ? null : prev);
    }, 2000);
  };

  // Add query template to Library
  const handleAddTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateTitle.trim() || !newTemplateSql.trim()) return;
    const newTmpl: LibraryQueryTemplate = {
      id: `tmpl-${Date.now()}`,
      title: newTemplateTitle.trim(),
      category: newTemplateCategory,
      description: newTemplateDesc.trim(),
      sql: newTemplateSql.trim(),
      targetDb: newTemplateDb.trim() || 'Core Banking CBS',
      authorName: currentUser.username,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setLibraryTemplates(prev => [newTmpl, ...prev]);
    setNewTemplateTitle('');
    setNewTemplateDesc('');
    setNewTemplateSql('');
    setShowAddTemplateModal(false);
  };

  // Toggle member DB allocation (constrained by team envelope)
  const handleToggleMemberDb = (userId: string, dbId: string) => {
    setMemberPrivilegesState(prev => {
      const currentPriv = prev[userId] || { allowedDbIds: [], allowedQueryTypes: ['SELECT'] };
      const currentDbs = currentPriv.allowedDbIds || [];
      const updatedDbs = currentDbs.includes(dbId)
        ? currentDbs.filter(id => id !== dbId)
        : [...currentDbs, dbId];
      return {
        ...prev,
        [userId]: {
          ...currentPriv,
          allowedDbIds: updatedDbs
        }
      };
    });
  };

  // Toggle member query type allocation (constrained by team envelope)
  const handleToggleMemberQueryType = (userId: string, qType: AllowedQueryType) => {
    setMemberPrivilegesState(prev => {
      const currentPriv = prev[userId] || { allowedDbIds: [], allowedQueryTypes: ['SELECT'] };
      const currentTypes = currentPriv.allowedQueryTypes || ['SELECT'];
      let updatedTypes: AllowedQueryType[];
      if (currentTypes.includes(qType)) {
        if (currentTypes.length === 1) return prev; // Keep at least one
        updatedTypes = currentTypes.filter(t => t !== qType);
      } else {
        updatedTypes = [...currentTypes, qType];
      }
      return {
        ...prev,
        [userId]: {
          ...currentPriv,
          allowedQueryTypes: updatedTypes
        }
      };
    });
  };

  // Set member privilege preset
  const handleSetMemberPrivilegePreset = (userId: string, preset: 'FULL_TEAM' | 'READ_ONLY' | 'CLEAR') => {
    setMemberPrivilegesState(prev => {
      const currentPriv = prev[userId] || { allowedDbIds: [], allowedQueryTypes: ['SELECT'] };
      if (preset === 'FULL_TEAM') {
        const allTeamDbIds = Array.from(new Set([
          ...(currentTeam?.allowedDbIds || []),
          ...teamSpecificDbs.map(d => d.id)
        ]));
        return {
          ...prev,
          [userId]: {
            allowedDbIds: allTeamDbIds,
            allowedQueryTypes: [...(selectedQueryTypes || ['SELECT'])]
          }
        };
      } else if (preset === 'READ_ONLY') {
        const allTeamDbIds = Array.from(new Set([
          ...(currentTeam?.allowedDbIds || []),
          ...teamSpecificDbs.map(d => d.id)
        ]));
        return {
          ...prev,
          [userId]: {
            allowedDbIds: allTeamDbIds,
            allowedQueryTypes: ['SELECT']
          }
        };
      } else {
        return {
          ...prev,
          [userId]: {
            allowedDbIds: [],
            allowedQueryTypes: ['SELECT']
          }
        };
      }
    });
  };

  // Save member privilege allocations
  const handleSaveMemberPrivileges = async () => {
    if (!currentTeam) return;
    setIsSavingMemberPrivileges(true);
    setMemberPrivSuccessMsg(null);
    setMemberPrivErrMsg(null);
    try {
      const res = await api.updateTeamMemberPrivileges(
        currentTeam.id,
        memberPrivilegesState,
        currentUser.id,
        currentUser.role
      );
      if (res?.team && onUpdateTeam) {
        onUpdateTeam(currentTeam.id, { memberPrivileges: res.team.memberPrivileges });
      }
      setMemberPrivSuccessMsg('Team member privilege allocations saved successfully.');
      setTimeout(() => setMemberPrivSuccessMsg(null), 4000);
    } catch (err: any) {
      setMemberPrivErrMsg(err.message || 'Failed to save member privileges');
    } finally {
      setIsSavingMemberPrivileges(false);
    }
  };

  React.useEffect(() => {
    if (onActiveTeamChange) {
      onActiveTeamChange(currentTeam ? currentTeam.name : null);
    }
  }, [currentTeam, onActiveTeamChange]);

  const currentTeamId = currentTeam ? currentTeam.id : '';
  const teamTasks = tasks.filter(t => t.teamId === currentTeamId);
  const teamInsights = insights.filter(i => i.teamId === currentTeamId);
  const teamMessages = messages.filter(m => m.teamId === currentTeamId);

  // Users in current team
  const currentTeamMemberIds = currentTeam ? [currentTeam.managerId, ...(currentTeam.memberIds || [])] : [];
  const currentTeamUsers = users.filter(u => currentTeamMemberIds.includes(u.id));

  // Modals state
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddInsightModal, setShowAddInsightModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);

  React.useEffect(() => {
    if (openCreateModalSignal && openCreateModalSignal > 0) {
      setShowCreateTeamModal(true);
    }
  }, [openCreateModalSignal]);

  // Directory filter state: 'all' | 'permanent' | 'working'
  const [directoryFilter, setDirectoryFilter] = useState<'all' | 'permanent' | 'working'>('all');

  // Form state for Create Team
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [newTeamType, setNewTeamType] = useState<'permanent' | 'working'>('working');
  const [newTeamMemberIds, setNewTeamMemberIds] = useState<string[]>([]);

  // Form states for New Task
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState(currentUser.id);
  const [newTaskPriority, setNewTaskPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskMilestone, setNewTaskMilestone] = useState('');
  const [newTaskIsPublic, setNewTaskIsPublic] = useState(true);
  const [newTaskVisibility, setNewTaskVisibility] = useState<'team' | 'public' | 'private'>('team');

  // Form states for New Insight
  const [newInsightTitle, setNewInsightTitle] = useState('');
  const [newInsightContent, setNewInsightContent] = useState('');
  const [newInsightTags, setNewInsightTags] = useState('BestPractices, OpsTip');

  // Form states for Chat
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLInputElement>(null);

  const handleStartChatWithMember = (username: string) => {
    setActiveTab('discussion');
    if (currentUser.username !== username) {
      setChatInput(`@${username} `);
    }
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
  };

  // Form state for Add Member
  const [selectedUserIdToAdd, setSelectedUserIdToAdd] = useState('');

  // Task filter
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>('All');

  // Maker-Checker & Team Governance State
  const [pendingResolutions, setPendingResolutions] = useState<any[]>([]);
  const [teamKpis, setTeamKpis] = useState<any>(null);
  const [visibilityGrants, setVisibilityGrants] = useState<any[]>([]);
  const [aiObjectives, setAiObjectives] = useState<any[]>([]);
  const [reviewReason, setReviewReason] = useState<Record<string, string>>({});

  // Workspace Setting Proposals State (Maker-Checker & Escalation)
  const [settingProposals, setSettingProposals] = useState<WorkspaceSettingProposal[]>([]);
  const [isLoadingSettingProposals, setIsLoadingSettingProposals] = useState(false);
  const [settingProposalFeedback, setSettingProposalFeedback] = useState<Record<string, string>>({});
  const [approvalsSubTab, setApprovalsSubTab] = useState<'resolutions' | 'settings'>('settings');
  const [settingStatusFilter, setSettingStatusFilter] = useState<string>('ALL');

  // Task Escalation Modal State
  const [escalatingTask, setEscalatingTask] = useState<TeamTask | null>(null);
  const [taskEscalationMatrix, setTaskEscalationMatrix] = useState<TeamEscalationTarget[]>([]);
  const [selectedTaskEscalationTargetId, setSelectedTaskEscalationTargetId] = useState('');
  const [taskEscalationReason, setTaskEscalationReason] = useState('');
  const [isSubmittingTaskEscalation, setIsSubmittingTaskEscalation] = useState(false);
  const [taskEscalationError, setTaskEscalationError] = useState<string | null>(null);

  // Setting Proposal Escalation Modal State
  const [escalatingProposal, setEscalatingProposal] = useState<WorkspaceSettingProposal | null>(null);
  const [proposalEscalationMatrix, setProposalEscalationMatrix] = useState<TeamEscalationTarget[]>([]);
  const [selectedProposalEscalationTargetId, setSelectedProposalEscalationTargetId] = useState('');
  const [proposalEscalationReason, setProposalEscalationReason] = useState('');
  const [isSubmittingProposalEscalation, setIsSubmittingProposalEscalation] = useState(false);
  const [proposalEscalationError, setProposalEscalationError] = useState<string | null>(null);

  // Create Setting Proposal Modal State
  const [showCreateProposalModal, setShowCreateProposalModal] = useState(false);
  const [newProposalType, setNewProposalType] = useState<SettingProposalType>('WORKSPACE_CONFIG');
  const [newProposalKey, setNewProposalKey] = useState('workspace_config');
  const [newProposalTitle, setNewProposalTitle] = useState('');
  const [newProposalJustification, setNewProposalJustification] = useState('');
  const [newProposalPayload, setNewProposalPayload] = useState('{\n  "environmentMode": "Production",\n  "requireHashtagForResolution": true\n}');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [createProposalError, setCreateProposalError] = useState<string | null>(null);

  // Team Relationships State
  const [teamRelationships, setTeamRelationships] = useState<TeamRelationship[]>([]);
  const [isLoadingRelationships, setIsLoadingRelationships] = useState(false);
  const [showDefineRelModal, setShowDefineRelModal] = useState(false);
  const [targetTeamIdForRel, setTargetTeamIdForRel] = useState('');
  const [relType, setRelType] = useState<TeamRelationshipType>('PARENT_UNIT');
  const [relDescription, setRelDescription] = useState('');
  const [relError, setRelError] = useState<string | null>(null);
  const [isSubmittingRel, setIsSubmittingRel] = useState(false);

  // Org Hierarchy Directory View State
  const [directoryViewMode, setDirectoryViewMode] = useState<'cards' | 'hierarchy'>('cards');
  const [orgHierarchyData, setOrgHierarchyData] = useState<any>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(false);

  // Fetch Team Relationships
  const loadTeamRelationships = React.useCallback(async () => {
    if (!currentTeamId) return;
    setIsLoadingRelationships(true);
    try {
      const res = await fetch(`/api/teams/relationships?teamId=${encodeURIComponent(currentTeamId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTeamRelationships(data);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load team relationships:', err);
    } finally {
      setIsLoadingRelationships(false);
    }
  }, [currentTeamId]);

  // Fetch Org Hierarchy
  const loadOrgHierarchy = React.useCallback(async () => {
    setIsLoadingHierarchy(true);
    try {
      const res = await fetch('/api/teams/hierarchy');
      if (res.ok) {
        const data = await res.json();
        setOrgHierarchyData(data);
      }
    } catch (err: any) {
      console.warn('Failed to load org hierarchy:', err);
    } finally {
      setIsLoadingHierarchy(false);
    }
  }, []);

  React.useEffect(() => {
    loadTeamRelationships();
  }, [loadTeamRelationships]);

  React.useEffect(() => {
    if (directoryViewMode === 'hierarchy' || !selectedTeamId) {
      loadOrgHierarchy();
    }
  }, [directoryViewMode, selectedTeamId, loadOrgHierarchy]);

  // Handler for defining a new relationship
  const handleDefineRelationshipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeamId || !targetTeamIdForRel || !relType) {
      setRelError('Please select a target team and relationship type.');
      return;
    }
    if (currentTeamId === targetTeamIdForRel) {
      setRelError('A team cannot define a relationship to itself.');
      return;
    }
    setIsSubmittingRel(true);
    setRelError(null);
    try {
      const res = await fetch('/api/teams/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTeamId: currentTeamId,
          targetTeamId: targetTeamIdForRel,
          relationshipType: relType,
          description: relDescription.trim() || undefined,
          createdBy: currentUser.username
        })
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to define relationship');
      }
      setShowDefineRelModal(false);
      setTargetTeamIdForRel('');
      setRelType('PARENT_UNIT');
      setRelDescription('');
      await loadTeamRelationships();
      await loadOrgHierarchy();
    } catch (err: any) {
      setRelError(err.message || 'Error defining relationship');
    } finally {
      setIsSubmittingRel(false);
    }
  };

  // Handler for deleting a relationship
  const handleDeleteRelationship = async (relId: string) => {
    if (!confirm('Are you sure you want to remove this team relationship?')) return;
    try {
      const res = await fetch(`/api/teams/relationships/${encodeURIComponent(relId)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await loadTeamRelationships();
        await loadOrgHierarchy();
      } else {
        const body = await res.json();
        alert(`Failed to delete relationship: ${body.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error deleting relationship: ${err.message}`);
    }
  };

  // Fetch Team Governance Data
  const loadGovernanceData = React.useCallback(async () => {
    try {
      const [resPending, resKpis, resGrants, resAi, resSettings] = await Promise.all([
        fetch(`/api/resolutions/pending?teamId=${currentTeamId || 'team-cards'}`).then(r => r.json()).catch(() => []),
        fetch(`/api/teams/kpis?teamId=${currentTeamId || 'team-cards'}`).then(r => r.json()).catch(() => null),
        fetch(`/api/teams/grants?teamId=${currentTeamId || 'team-cards'}`).then(r => r.json()).catch(() => []),
        fetch('/api/teams/ai-objectives').then(r => r.json()).catch(() => []),
        api.getWorkspaceSettingProposals({ teamId: currentTeamId || undefined }).catch(() => [])
      ]);

      if (Array.isArray(resPending)) setPendingResolutions(resPending);
      if (resKpis && resKpis.inflow) setTeamKpis(resKpis);
      if (Array.isArray(resGrants)) setVisibilityGrants(resGrants);
      if (Array.isArray(resAi)) setAiObjectives(resAi);
      if (Array.isArray(resSettings)) setSettingProposals(resSettings);
    } catch (err: any) {
      console.warn('Failed to load team governance data:', err);
    }
  }, [currentTeamId]);

  React.useEffect(() => {
    loadGovernanceData();
  }, [loadGovernanceData]);

  // Handler for reviewing a Maker-Checker proposal (Checker Approval/Rejection)
  const handleReviewProposal = async (requestId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      const res = await fetch('/api/resolutions/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          checkerId: currentUser.id,
          checkerName: currentUser.username,
          checkerTeamId: currentTeamId || 'team-cards',
          action,
          rejectionReason: reviewReason[requestId] || (action === 'REJECT' ? 'Rejected by supervisor' : undefined)
        })
      });

      const body = await res.json();
      if (!res.ok) {
        alert(`Review failed: ${body.error || 'Action failed'}`);
        return;
      }

      alert(`Proposal ${action === 'APPROVE' ? 'Approved & Committed' : 'Rejected & Returned to Maker'}!`);
      loadGovernanceData();
    } catch (err: any) {
      alert(`Error reviewing proposal: ${err.message}`);
    }
  };

  // Handler for reviewing a Workspace Setting Proposal (Checker Approval/Rejection)
  const handleReviewSettingProposal = async (proposalId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      await api.reviewWorkspaceSettingProposal(
        proposalId,
        action,
        currentUser.id,
        currentUser.username,
        settingProposalFeedback[proposalId] || undefined
      );
      alert(`Workspace setting proposal ${action === 'APPROVE' ? 'Approved & Applied' : 'Rejected'}!`);
      loadGovernanceData();
    } catch (err: any) {
      alert(`Setting proposal review failed: ${err.message || err}`);
    }
  };

  // Handler for opening Task Escalation modal
  const handleOpenTaskEscalation = async (task: TeamTask) => {
    setEscalatingTask(task);
    setTaskEscalationReason('');
    setTaskEscalationError(null);
    try {
      const matrix = await api.getTeamEscalationMatrix(task.teamId || currentTeamId);
      setTaskEscalationMatrix(matrix);
      if (matrix.length > 0) {
        setSelectedTaskEscalationTargetId(matrix[0].targetTeamId);
      } else {
        setSelectedTaskEscalationTargetId('');
      }
    } catch (err: any) {
      setTaskEscalationError(err.message || 'Could not load escalation matrix');
    }
  };

  // Handler for submitting Task Escalation
  const handleSubmitTaskEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalatingTask || !selectedTaskEscalationTargetId) return;
    setIsSubmittingTaskEscalation(true);
    setTaskEscalationError(null);
    try {
      await api.escalateTeamTask(
        escalatingTask.id,
        selectedTaskEscalationTargetId,
        taskEscalationReason.trim() || undefined
      );
      if (onUpdateTask) {
        onUpdateTask(escalatingTask.id, {
          escalatedToTeamId: selectedTaskEscalationTargetId,
          escalationReason: taskEscalationReason.trim() || undefined,
          escalatedAt: new Date().toISOString()
        });
      }
      setEscalatingTask(null);
      alert(`Task successfully escalated to team '${selectedTaskEscalationTargetId}' according to the escalation matrix.`);
    } catch (err: any) {
      setTaskEscalationError(err.message || 'Failed to escalate task');
    } finally {
      setIsSubmittingTaskEscalation(false);
    }
  };

  // Handler for opening Setting Proposal Escalation modal
  const handleOpenProposalEscalation = async (proposal: WorkspaceSettingProposal) => {
    setEscalatingProposal(proposal);
    setProposalEscalationReason('');
    setProposalEscalationError(null);
    try {
      const matrix = await api.getTeamEscalationMatrix(proposal.teamId || currentTeamId);
      setProposalEscalationMatrix(matrix);
      if (matrix.length > 0) {
        setSelectedProposalEscalationTargetId(matrix[0].targetTeamId);
      } else {
        setSelectedProposalEscalationTargetId('');
      }
    } catch (err: any) {
      setProposalEscalationError(err.message || 'Could not load escalation matrix');
    }
  };

  // Handler for submitting Setting Proposal Escalation
  const handleSubmitProposalEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalatingProposal || !selectedProposalEscalationTargetId) return;
    setIsSubmittingProposalEscalation(true);
    setProposalEscalationError(null);
    try {
      await api.escalateWorkspaceSettingProposal(
        escalatingProposal.id,
        selectedProposalEscalationTargetId,
        proposalEscalationReason.trim() || 'Escalated to escalation target team for secondary review',
        currentUser.id,
        currentUser.username
      );
      loadGovernanceData();
      setEscalatingProposal(null);
      alert(`Workspace setting proposal escalated to team '${selectedProposalEscalationTargetId}' according to escalation matrix.`);
    } catch (err: any) {
      setProposalEscalationError(err.message || 'Failed to escalate proposal');
    } finally {
      setIsSubmittingProposalEscalation(false);
    }
  };

  // Handler for creating a new Workspace Setting Proposal
  const handleCreateProposalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProposalTitle.trim() || !newProposalJustification.trim()) return;
    setIsSubmittingProposal(true);
    setCreateProposalError(null);
    try {
      let parsedChanges: Record<string, any> = {};
      try {
        parsedChanges = JSON.parse(newProposalPayload);
      } catch {
        throw new Error('Proposed changes must be valid JSON');
      }

      await api.createWorkspaceSettingProposal({
        settingType: newProposalType,
        settingKey: newProposalKey.trim() || 'custom_setting',
        title: newProposalTitle.trim(),
        justification: newProposalJustification.trim(),
        proposedChanges: parsedChanges,
        makerId: currentUser.id,
        makerName: currentUser.username,
        teamId: currentTeamId || 'team-cards',
        teamName: currentTeam?.name || 'Cards Team'
      });

      setShowCreateProposalModal(false);
      setNewProposalTitle('');
      setNewProposalJustification('');
      loadGovernanceData();
      alert('Workspace setting proposal submitted for Maker-Checker review!');
    } catch (err: any) {
      setCreateProposalError(err.message || 'Failed to submit proposal');
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  // Handler for creating a new visibility grant
  const handleCreateGrant = async (targetTeamId: string, accessLevel: 'FULL' | 'PARTIAL_KPI') => {
    try {
      const res = await fetch('/api/teams/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantorTeamId: currentTeamId || 'team-cards',
          granteeTeamId: targetTeamId,
          accessLevel,
          grantedBy: currentUser.username
        })
      });
      if (res.ok) {
        loadGovernanceData();
      }
    } catch (err: any) {
      console.warn('Failed to grant visibility:', err);
    }
  };


  // Handler for sending a chat message
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentTeamId) return;

    onSendMessage({
      teamId: currentTeamId,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderRole: currentUser.role,
      content: chatInput.trim()
    });

    setChatInput('');
  };

  // Handler for creating a new Task
  const handleCreateTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !currentTeamId) return;

    const assignee = users.find(u => u.id === newTaskAssigneeId) || currentUser;

    onAddTask({
      teamId: currentTeamId,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      assigneeId: assignee.id,
      assigneeName: assignee.username,
      creatorId: currentUser.id,
      creatorName: currentUser.username,
      status: 'To Do',
      priority: newTaskPriority,
      startDate: newTaskStartDate || undefined,
      dueDate: newTaskDueDate || undefined,
      milestone: newTaskMilestone.trim() || undefined,
      isPublic: newTaskIsPublic,
      visibility: newTaskVisibility
    });

    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskStartDate('');
    setNewTaskDueDate('');
    setNewTaskMilestone('');
    setNewTaskIsPublic(true);
    setNewTaskVisibility('team');
    setShowAddTaskModal(false);
  };

  // Handler for creating a new Insight
  const handleCreateInsightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInsightTitle.trim() || !newInsightContent.trim() || !currentTeamId) return;

    const tagsArray = newInsightTags
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    onAddInsight({
      teamId: currentTeamId,
      title: newInsightTitle.trim(),
      content: newInsightContent.trim(),
      authorId: currentUser.id,
      authorName: currentUser.username,
      authorRole: currentUser.role,
      tags: tagsArray.length > 0 ? tagsArray : ['General']
    });

    setNewInsightTitle('');
    setNewInsightContent('');
    setNewInsightTags('BestPractices, OpsTip');
    setShowAddInsightModal(false);
  };

  // Handler for creating a brand new Team
  const isManagerOrAdmin = true;

  const handleCreateTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !onCreateTeam) return;

    if (newTeamType === 'permanent') {
      const myPermTeam = userPermTeamMap[currentUser.id];
      if (myPermTeam) {
        alert(`Cannot create permanent team. You are already a member of permanent team "${myPermTeam.name}". A user can only belong to one permanent team.`);
        return;
      }
      for (const mId of newTeamMemberIds) {
        const otherPermTeam = userPermTeamMap[mId];
        if (otherPermTeam) {
          const userObj = users.find(u => u.id === mId);
          alert(`Cannot add @${userObj?.username || mId} to permanent team. They already belong to permanent team "${otherPermTeam.name}". A user can only belong to one permanent team.`);
          return;
        }
      }
    }

    onCreateTeam({
      name: newTeamName.trim(),
      description: newTeamDesc.trim(),
      teamType: isManagerOrAdmin ? newTeamType : 'working',
      managerId: currentUser.id,
      managerName: currentUser.username,
      memberIds: newTeamMemberIds,
      allowedDbIds: [],
      allowedQueryTypes: ['SELECT']
    });

    setNewTeamName('');
    setNewTeamDesc('');
    setNewTeamType('working');
    setNewTeamMemberIds([]);
    setShowCreateTeamModal(false);
  };

  // Handler for adding a user to current team
  const handleAddMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserIdToAdd || !currentTeam || !onUpdateTeam) return;

    if ((currentTeam.teamType || 'working') === 'permanent') {
      const existingPermTeam = userPermTeamMap[selectedUserIdToAdd];
      if (existingPermTeam && existingPermTeam.id !== currentTeam.id) {
        alert(`Cannot add user to this permanent team. A user can only be a member of one permanent team. User is already assigned to permanent team "${existingPermTeam.name}".`);
        return;
      }
    }

    const updatedMembers = Array.from(new Set([...currentTeam.memberIds, selectedUserIdToAdd]));
    onUpdateTeam(currentTeam.id, { memberIds: updatedMembers });

    setSelectedUserIdToAdd('');
    setShowAddMemberModal(false);
  };

  const handleRemoveMember = (memberId: string) => {
    if (!currentTeam || !onUpdateTeam) return;
    const updatedMembers = currentTeam.memberIds.filter(id => id !== memberId);
    onUpdateTeam(currentTeam.id, { memberIds: updatedMembers });
  };

  // Non-team members that can be added
  const availableUsersToAdd = users.filter(u => !currentTeamMemberIds.includes(u.id));

  // Filter tasks for task list
  const filteredTasks = teamTasks.filter(t => {
    if (taskFilterStatus === 'All') return true;
    return t.status === taskFilterStatus;
  });


  return (
    <div className="flex flex-col gap-2.5 h-[calc(100vh-2.85rem)] min-h-[500px]" id="team-workspace-container">
      
      {/* 1. TOP HEADER: Team Title & Badges + Horizontal Team Member Circles Along the Title */}
      {currentTeam && (
        <header className="w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0" id="team-workspace-header">
          {/* Left: Team Title + Badges */}
          <div className="flex items-center space-x-2.5 shrink-0">
            {/* Toggle Team List Rail Button */}
            <button
              onClick={handleToggleTeamRail}
              className="p-1.5 rounded-lg border border-slate-200/90 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
              title={isTeamRailOpen ? "Collapse Team List Rail" : "Expand Team List Rail"}
              id="btn-toggle-team-rail"
              aria-label={isTeamRailOpen ? "Collapse Team List Rail" : "Expand Team List Rail"}
            >
              {isTeamRailOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>

            <h2 className="text-base font-bold text-slate-900 font-mono tracking-tight" title={currentTeam.name}>
              {currentTeam.name}
            </h2>

            {(currentTeam.teamType || 'working') === 'permanent' ? (
              <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono">
                <ShieldCheck size={11} className="text-purple-600" />
                <span>Permanent Unit</span>
              </span>
            ) : (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono">
                <Briefcase size={11} className="text-emerald-600" />
                <span>Working Team</span>
              </span>
            )}

            {currentTeam.managerId === currentUser.id ? (
              <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono">
                <Crown size={11} className="text-amber-600" />
                <span>Team Lead</span>
              </span>
            ) : (
              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono">
                <UserCheck size={11} className="text-blue-600" />
                <span>Member</span>
              </span>
            )}
          </div>

          {/* Center: Team Member Cards Horizontally Along The Title (Small circles like the team list) */}
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-slate-300 mx-1 hidden sm:inline">|</span>
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold mr-1 hidden md:inline">
              Roster ({currentTeamUsers.length}):
            </span>

            {currentTeamUsers.map(member => {
              const isLead = currentTeam && member.id === currentTeam.managerId;
              const isSelf = member.id === currentUser.id;
              const initials = member.username.substring(0, 2).toUpperCase();

              return (
                <div key={member.id} className="relative group shrink-0">
                  <button
                    onClick={() => handleStartChatWithMember(member.username)}
                    title={`@${member.username} (${isLead ? 'Lead' : 'Member'}${isSelf ? ' • You' : ''}) - Click to chat`}
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-[11px] transition-all cursor-pointer relative shadow-2xs ${
                      isLead
                        ? 'bg-amber-100 text-amber-900 border-2 border-amber-400 hover:scale-105'
                        : isSelf
                        ? 'bg-blue-600 text-white border-2 border-blue-400 hover:scale-105'
                        : 'bg-slate-100 text-slate-700 border border-slate-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 hover:scale-105'
                    }`}
                  >
                    {initials}

                    {/* Small Lead Crown indicator dot */}
                    {isLead && (
                      <span className="absolute -top-1 -right-0.5 w-3 h-3 bg-amber-400 text-amber-950 rounded-full flex items-center justify-center text-[8px] font-bold shadow-xs">
                        ★
                      </span>
                    )}
                  </button>

                  {/* Floating Tooltip */}
                  <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 z-50 pointer-events-none hidden group-hover:flex flex-col bg-slate-900 text-white border border-slate-700 rounded-lg px-2.5 py-1.5 shadow-xl text-xs font-mono whitespace-nowrap">
                    <span className="font-bold text-slate-100">@{member.username} {isSelf && '(You)'}</span>
                    <span className="text-[10px] text-slate-400">{member.email}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-blue-300 mt-0.5">
                      <span>{isLead ? '👑 Team Lead' : '👤 Member'}</span>
                      <span>•</span>
                      <span className="uppercase text-slate-300">{member.role}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Quick Add Member (+) Circle Button */}
            {(currentUser.id === currentTeam.managerId || true) && (
              <button
                onClick={() => setShowAddMemberModal(true)}
                title="Add member to team"
                className="w-8 h-8 rounded-full border border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 flex items-center justify-center transition-all cursor-pointer shrink-0"
                id="btn-header-add-member"
              >
                <Plus size={13} />
              </button>
            )}
          </div>

          {/* Right: Quick Action Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setShowAddTaskModal(true)}
              className="px-3 py-1.5 bg-[#155DFC] hover:bg-blue-700 text-white rounded-xl text-xs font-bold font-mono flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <Plus size={13} />
              <span>Create Task</span>
            </button>
          </div>
        </header>
      )}

      {/* 2. LOWERED BODY: Left Circle Rail + Right Main Content */}
      <div className="flex-1 flex gap-2.5 min-h-0 overflow-hidden">
        {/* Left Side: Lowered Small Circles Navigation Rail - Color White & Aligned with Discussion */}
        {isTeamRailOpen && (
          <aside className="w-14 shrink-0 self-start h-[570px] bg-white border border-slate-200/90 rounded-2xl flex flex-col items-center py-2.5 px-1 shadow-xs select-none z-10" id="team-circle-rail">
            {/* Rail Header Icon */}
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-1" title="My Teams">
              <Users size={14} />
            </div>

            <div className="w-8 h-[1px] bg-slate-200 my-1 shrink-0" />

            {/* Circles List */}
            <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto no-scrollbar py-1">
              {visibleTeams.map(team => {
                const isSelected = currentTeam?.id === team.id;
                const isPermanent = (team.teamType || 'working') === 'permanent';
                const isManager = team.managerId === currentUser.id;
                const abbr = getTeamAbbreviation(team.name);

                return (
                  <div className="relative group w-full flex justify-center" key={team.id}>
                    {/* Active Indicator Bar on Left */}
                    {isSelected && (
                      <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#155DFC] rounded-r-full shadow-sm" />
                    )}

                    <button
                      onClick={() => setSelectedTeamId(team.id)}
                      title={`${team.name} (${isPermanent ? 'Permanent Unit' : 'Working Team'}${isManager ? ' • Lead' : ' • Member'})`}
                      className={`w-10 h-10 flex items-center justify-center font-mono font-bold text-xs transition-all duration-150 cursor-pointer relative ${
                        isSelected
                          ? 'bg-[#155DFC] text-white rounded-xl shadow-md ring-2 ring-blue-400/50 scale-105'
                          : isPermanent
                          ? 'bg-purple-50 text-purple-700 hover:text-purple-950 hover:bg-purple-100 border border-purple-200/90 rounded-full hover:rounded-xl shadow-2xs'
                          : 'bg-slate-50 text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/90 rounded-full hover:rounded-xl shadow-2xs'
                      }`}
                    >
                      {abbr}

                      {/* Corner indicator dot: Permanent vs Working */}
                      <span 
                        className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          isPermanent ? 'bg-purple-500' : 'bg-emerald-500'
                        }`} 
                        title={isPermanent ? 'Permanent Unit' : 'Working Team'}
                      />
                    </button>

                    {/* Floating Tooltip */}
                    <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 pointer-events-none hidden group-hover:flex flex-col bg-slate-900 text-white border border-slate-700/90 rounded-lg px-2.5 py-1.5 shadow-xl text-xs font-mono whitespace-nowrap min-w-[130px]">
                      <span className="font-bold text-slate-100">{team.name}</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        <span className={isPermanent ? 'text-purple-300' : 'text-emerald-300'}>
                          {isPermanent ? 'Permanent Unit' : 'Working Team'}
                        </span>
                        <span>•</span>
                        <span className={isManager ? 'text-amber-300' : 'text-blue-300'}>
                          {isManager ? 'Lead' : 'Member'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="w-8 h-[1px] bg-slate-200 my-1 shrink-0" />

            {/* Add Team (+) Circle Button */}
            <button
              onClick={() => setShowCreateTeamModal(true)}
              title="Create New Team"
              className="w-10 h-10 rounded-full border border-dashed border-slate-300 hover:border-[#155DFC] bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-[#155DFC] flex items-center justify-center transition-all cursor-pointer group shrink-0 shadow-2xs"
              id="btn-rail-create-team"
            >
              <Plus size={16} className="group-hover:scale-110 transition-transform" />
            </button>
          </aside>
        )}

        {/* Right Side: Workspace Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto space-y-2.5">
          {!currentTeam ? (
            /* Empty state if user has no teams */
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-3 border border-blue-100">
                <Users size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-800 font-mono">No Teams Joined Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mt-1.5 leading-relaxed">
                You will only see groups you create or groups where you were added as an authorized member.
              </p>
              <button
                onClick={() => setShowCreateTeamModal(true)}
                className="mt-4 px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>Create Your First Team</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-w-0 space-y-2.5">
              
              {/* Clean Uniform White Page-Specific Navigation Bar with Full Width for Tabs */}
              <div className="h-10 min-h-[40px] px-2.5 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between text-xs font-mono shadow-xs shrink-0 gap-2">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1">
                  {[
                    { id: 'discussion', label: 'Discussion', icon: MessageSquare, count: teamMessages.length },
                    { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: teamTasks.length },
                    { id: 'timeline', label: 'Roadmap', icon: Calendar },
                    { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
                    { id: 'resources', label: 'Resources', icon: Layers, count: (teamSpecificDbs.length + (currentTeam?.allowedDbIds?.length || 0)) },
                    { 
                      id: 'team_settings', 
                      label: 'Team Settings', 
                      icon: Settings, 
                      count: (pendingResolutions.length + settingProposals.filter(p => p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'ESCALATED_TO_TARGET_TEAM').length) > 0
                        ? (pendingResolutions.length + settingProposals.filter(p => p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'ESCALATED_TO_TARGET_TEAM').length)
                        : undefined
                    }
                  ].map(tab => {
                    const isActive = activeTab === tab.id || (tab.id === 'resources' && (activeTab === 'resources' || activeTab === 'insights')) || (tab.id === 'team_settings' && ['team_settings', 'approvals', 'grants', 'ai-strategy', 'relationships', 'db-access'].includes(activeTab));
                    const IconComp = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        id={`team-tab-${tab.id}`}
                        onClick={() => {
                          if (tab.id === 'team_settings') {
                            setActiveTab('team_settings');
                          } else if (tab.id === 'resources') {
                            setActiveTab('resources');
                          } else {
                            setActiveTab(tab.id as any);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'bg-[#155DFC] text-white font-bold shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/90'
                        }`}
                      >
                        <IconComp size={12} />
                        <span>{tab.label}</span>
                        {tab.count !== undefined && tab.count > 0 && (
                          <span className={`ml-0.5 text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                            isActive ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Tab Body Content */}
              <div className="flex-1 min-w-0">

        {/* TAB 1: TEAM MEMBERS */}
        {activeTab === 'members' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                    Team Roster & Roles
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Members belonging to <strong className="text-slate-800">{currentTeam?.name || 'this team'}</strong>.
                  </p>
                </div>

                {(currentUser.id === currentTeam?.managerId || true) && (
                  <button
                    onClick={() => setShowAddMemberModal(true)}
                    disabled={availableUsersToAdd.length === 0}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <UserPlus size={14} />
                    <span>Add Member to Team</span>
                  </button>
                )}
              </div>

              {/* Team Members Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentTeamUsers.map(member => {
                const isLead = currentTeam && member.id === currentTeam.managerId;
                const isSelf = member.id === currentUser.id;
                const memberTasks = teamTasks.filter(t => t.assigneeId === member.id);
                const completedTasks = memberTasks.filter(t => t.status === 'Done').length;

                return (
                  <div 
                    key={member.id} 
                    onClick={() => handleStartChatWithMember(member.username)}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between cursor-pointer group ${
                      isSelf 
                        ? 'bg-blue-50/50 border-blue-200 hover:border-blue-400 shadow-2xs' 
                        : 'bg-slate-50/70 border-slate-200 hover:border-blue-300 hover:shadow-xs'
                    }`}
                    title={`Click to start chat with @${member.username}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm font-mono border ${
                            isLead ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-300'
                          }`}>
                            {member.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 font-mono transition-colors">@{member.username}</span>
                              {isSelf && (
                                <span className="text-[9px] bg-blue-600 text-white font-bold px-1.5 py-0.2 rounded font-mono">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono block">{member.email}</span>
                          </div>
                        </div>

                        {/* Team-Specific Role Badge */}
                        {isLead ? (
                          <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1 shrink-0">
                            <Crown size={11} className="text-amber-600" />
                            <span>Team Lead</span>
                          </span>
                        ) : (
                          <span className="text-[9px] bg-blue-100 text-blue-900 border border-blue-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1 shrink-0">
                            <UserCheck size={11} className="text-blue-600" />
                            <span>Member</span>
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-200/60 font-mono text-[11px]">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Team Specific Role:</span>
                          <span className="font-bold text-slate-800">
                            {isLead 
                              ? ((currentTeam?.teamType || 'working') === 'permanent' ? 'Permanent Unit Lead' : 'Working Team Lead') 
                              : 'Team Member'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-500">
                          <span>System Role:</span>
                          <span className="font-bold px-2 py-0.5 rounded uppercase text-[10px] bg-blue-100 text-blue-700">
                            {member.role}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-500">
                          <span>Assigned Tasks:</span>
                          <span className="font-bold text-slate-800">
                            {completedTasks} / {memberTasks.length} Completed
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer / Controls */}
                    <div className="pt-3 mt-3 border-t border-slate-200/60 flex justify-between items-center text-[10px] font-mono text-slate-500">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartChatWithMember(member.username);
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-bold font-mono flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
                        title={`Start chat with @${member.username}`}
                      >
                        <MessageSquare size={13} />
                        <span>Start Chat</span>
                      </button>

                      <div className="flex items-center space-x-2">
                        <span className="flex items-center space-x-1 text-emerald-600 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span>Active</span>
                        </span>

                        {!isLead && !isSelf && (currentUser.id === currentTeam?.managerId || true) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveMember(member.id);
                            }}
                            className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remove member from team"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TEAM DISCUSSION / COMMUNICATION */}
      {activeTab === 'discussion' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col h-[520px]">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-2.5">
              <MessageSquare size={18} className="text-blue-600" />
              <div>
                <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                  Team Communication Stream
                </h3>
                <p className="text-[11px] text-slate-500">
                  Shared discussion channel for team members of <strong className="text-slate-800">{currentTeam?.name}</strong>.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-bold">
              {teamMessages.length} Messages
            </span>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 font-mono text-xs">
            {teamMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center space-y-2">
                <MessageSquare size={32} className="text-slate-300" />
                <p className="text-xs font-medium">No messages in team stream yet.</p>
                <p className="text-[11px] text-slate-400 max-w-xs">Start the conversation below to coordinate with team members.</p>
              </div>
            ) : (
              teamMessages.map(msg => {
                const isMe = msg.senderId === currentUser.id;

                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center space-x-1.5 mb-1 text-[10px] text-slate-500">
                      <span className="font-bold text-slate-800">@{msg.senderName}</span>
                      <span className="uppercase text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-mono">
                        {msg.senderRole}
                      </span>
                      <span>•</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className={`max-w-xl p-3.5 rounded-2xl leading-relaxed text-xs font-sans ${
                      isMe 
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-2xs' 
                        : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/70'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Send Message Form */}
          <form onSubmit={handleChatSubmit} className="pt-3 border-t border-slate-100 flex items-center space-x-2 shrink-0">
            <input
              ref={chatInputRef}
              type="text"
              placeholder={`Message @${currentTeam?.name || 'team'}...`}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
            >
              <Send size={14} />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: SHARED TASKS */}
      {activeTab === 'tasks' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                  Team Task Board & Assignments
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Track operational actions, database checks, and discrepancy reconciliation sub-tasks.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {/* Filter */}
                <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl text-xs font-mono">
                  <Filter size={13} className="text-slate-500 ml-1.5" />
                  {['All', 'To Do', 'In Progress', 'Done'].map(st => (
                    <button
                      key={st}
                      onClick={() => setTaskFilterStatus(st)}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        taskFilterStatus === st ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowAddTaskModal(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={15} />
                  <span>New Task</span>
                </button>
              </div>
            </div>

            {/* Tasks List */}
            {filteredTasks.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <CheckSquare size={32} className="mx-auto text-slate-300" />
                <h4 className="text-xs font-bold text-slate-700 font-mono">No tasks found</h4>
                <p className="text-[11px] text-slate-500">Create a new task to assign operational work items to team members.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTasks.map(task => {
                  const isDone = task.status === 'Done';
                  const isInProgress = task.status === 'In Progress';

                  return (
                    <div 
                      key={task.id} 
                      className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                        isDone 
                          ? 'bg-slate-50/80 border-slate-200 opacity-80' 
                          : isInProgress
                          ? 'bg-blue-50/30 border-blue-200 shadow-2xs'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                              task.priority === 'High' ? 'bg-amber-100 text-amber-700' :
                              task.priority === 'Medium' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {task.priority} Priority
                            </span>

                            {task.isPublic !== false && task.visibility !== 'private' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                                <Users size={10} />
                                <span>{task.visibility === 'public' ? 'Public' : 'Team Shared'}</span>
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                                <Lock size={10} />
                                <span>Private</span>
                              </span>
                            )}

                            {task.escalatedToTeamId && (
                              <span 
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1"
                                title={task.escalationReason ? `Reason: ${task.escalationReason}` : 'Escalated'}
                              >
                                <ArrowUpRight size={10} />
                                <span>Escalated: {task.escalatedToTeamId}</span>
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => onDeleteTask(task.id)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                            title="Delete task"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <h4 className={`text-xs font-bold font-sans ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                          {task.title}
                        </h4>

                        {task.description && (
                          <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                            {task.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 space-y-2 text-[10px] font-mono">
                        <div className="flex justify-between items-center text-slate-500">
                          <span>Assignee:</span>
                          <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                            @{task.assigneeName}
                          </span>
                        </div>

                        {task.dueDate && (
                          <div className="flex justify-between items-center text-slate-500">
                            <span>Due Date:</span>
                            <span className="font-medium text-slate-700 flex items-center space-x-1">
                              <Clock size={11} />
                              <span>{task.dueDate}</span>
                            </span>
                          </div>
                        )}

                        {/* Status & Escalation Buttons */}
                        <div className="pt-1 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenTaskEscalation(task)}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[10px] font-bold font-mono flex items-center space-x-1 transition cursor-pointer shadow-2xs"
                            title="Escalate this task to an authorized escalation target team"
                          >
                            <ArrowUpRight size={11} />
                            <span>Escalate</span>
                          </button>

                          <button
                            onClick={() => {
                              const nextStatus = task.status === 'To Do' ? 'In Progress' : task.status === 'In Progress' ? 'Done' : 'To Do';
                              onUpdateTaskStatus(task.id, nextStatus);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono flex items-center space-x-1 transition-all cursor-pointer ${
                              isDone ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' :
                              isInProgress ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' :
                              'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {isDone ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                            <span>{task.status}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TIMELINE & ROADMAP */}
      {activeTab === 'timeline' && (
        <div className="space-y-5 font-mono text-xs">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <Calendar className="text-blue-600" size={18} />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Team Project Timeline & Milestones
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 font-sans">
                  Visual roadmap created by Team Lead <strong className="text-slate-800">@{currentTeam?.managerName}</strong> to schedule operational deliverables and track milestones.
                </p>
              </div>

              <button
                onClick={() => setShowAddTaskModal(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Plus size={15} />
                <span>Add Milestone / Task</span>
              </button>
            </div>

            {/* Timeline Milestones Roadmap */}
            {teamTasks.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2 font-mono">
                <Calendar size={32} className="mx-auto text-slate-300" />
                <h4 className="text-xs font-bold text-slate-700">No milestone tasks defined</h4>
                <p className="text-[11px] text-slate-500 font-sans">
                  The Team Lead can create tasks with start dates, due dates, and milestone phases to build a project timeline.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Milestone Phases Breakdown */}
                {(() => {
                  const milestonesMap: { [key: string]: TeamTask[] } = {};
                  teamTasks.forEach(task => {
                    const key = task.milestone || 'General Deliverables';
                    if (!milestonesMap[key]) milestonesMap[key] = [];
                    milestonesMap[key].push(task);
                  });

                  return Object.entries(milestonesMap).map(([mName, mTasks]) => {
                    const doneCount = mTasks.filter(t => t.status === 'Done').length;
                    const percent = Math.round((doneCount / mTasks.length) * 100);

                    return (
                      <div key={mName} className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                          <div className="flex items-center space-x-2">
                            <Flag size={16} className="text-blue-600" />
                            <h4 className="font-bold text-slate-900 text-xs">{mName}</h4>
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">
                              {mTasks.length} {mTasks.length === 1 ? 'task' : 'tasks'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-3 text-[11px]">
                            <span className="text-slate-500">Milestone Progress:</span>
                            <div className="w-28 bg-slate-200 h-2 rounded-full overflow-hidden">
                              <div 
                                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <span className="font-bold text-slate-800">{percent}%</span>
                          </div>
                        </div>

                        {/* Task items in this milestone */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {mTasks.map(task => {
                            const isDone = task.status === 'Done';
                            const isInProg = task.status === 'In Progress';

                            return (
                              <div 
                                key={task.id}
                                className={`p-3.5 rounded-lg border bg-white space-y-2 flex flex-col justify-between ${
                                  isDone ? 'border-emerald-200 bg-emerald-50/30' : isInProg ? 'border-blue-300 shadow-2xs' : 'border-slate-200'
                                }`}
                              >
                                <div>
                                  <div className="flex justify-between items-start">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                      task.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {task.priority} Priority
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                      isDone ? 'bg-emerald-100 text-emerald-800' :
                                      isInProg ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                                    }`}>
                                      {task.status}
                                    </span>
                                  </div>

                                  <h5 className={`font-bold text-xs mt-1 font-sans ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                                    {task.title}
                                  </h5>
                                  {task.description && (
                                    <p className="text-[11px] text-slate-600 font-sans mt-0.5 line-clamp-2">
                                      {task.description}
                                    </p>
                                  )}
                                </div>

                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                                  <span>Assignee: <strong className="text-slate-800">@{task.assigneeName}</strong></span>
                                  <div className="flex items-center space-x-1 text-slate-600">
                                    <Clock size={11} />
                                    <span>
                                      {task.startDate ? `${task.startDate} → ` : ''}{task.dueDate || 'No due date'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: LEAD MANAGERIAL DASHBOARD (TASK COMPLETION FOLLOW-UP) */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5 font-mono text-xs">
          {/* Header Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white space-y-2 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl">
                  <BarChart2 size={22} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold tracking-tight text-white uppercase">
                      Team Lead Managerial Dashboard
                    </h3>
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold">
                      Completion Follow-Up
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-sans mt-0.5">
                    Real-time operational tracking for Team Lead <strong className="text-amber-300">@{currentTeam?.managerName}</strong> to follow up on assigned task completion across team members.
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center space-x-2">
                <button
                  onClick={() => setShowAddTaskModal(true)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Assign New Task</span>
                </button>
              </div>
            </div>
          </div>

          {/* Top KPI Metrics Cards */}
          {(() => {
            const total = teamTasks.length;
            const completed = teamTasks.filter(t => t.status === 'Done').length;
            const inProgress = teamTasks.filter(t => t.status === 'In Progress').length;
            const toDo = teamTasks.filter(t => t.status === 'To Do').length;
            const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

            const todayStr = new Date().toISOString().split('T')[0];
            const overdueTasks = teamTasks.filter(t => t.status !== 'Done' && t.dueDate && t.dueDate < todayStr);

            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Tasks</span>
                  <div className="text-xl font-bold text-slate-900">{total}</div>
                  <span className="text-[10px] text-slate-400 block font-sans">Assigned in Team</span>
                </div>

                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl shadow-2xs space-y-1">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">Completed</span>
                  <div className="text-xl font-bold text-emerald-800">{completed} ({completionRate}%)</div>
                  <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden mt-1">
                    <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${completionRate}%` }} />
                  </div>
                </div>

                <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl shadow-2xs space-y-1">
                  <span className="text-[10px] text-blue-700 font-bold uppercase block">In Progress</span>
                  <div className="text-xl font-bold text-blue-800">{inProgress}</div>
                  <span className="text-[10px] text-blue-600 block font-sans">Active Work</span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs space-y-1">
                  <span className="text-[10px] text-slate-600 font-bold uppercase block">To Do / Pending</span>
                  <div className="text-xl font-bold text-slate-800">{toDo}</div>
                  <span className="text-[10px] text-slate-500 block font-sans">Not Started</span>
                </div>

                <div className={`p-4 rounded-xl border shadow-2xs space-y-1 ${
                  overdueTasks.length > 0 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <span className="text-[10px] font-bold uppercase block flex items-center justify-between">
                    <span>Overdue</span>
                    {overdueTasks.length > 0 && <AlertCircle size={12} className="text-red-600" />}
                  </span>
                  <div className={`text-xl font-bold ${overdueTasks.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>
                    {overdueTasks.length}
                  </div>
                  <span className="text-[10px] opacity-80 block font-sans">
                    {overdueTasks.length > 0 ? 'Requires Follow-Up' : 'On Schedule'}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Member Workload & Completion Breakdown */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Users className="text-blue-600" size={16} />
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">
                  Team Member Completion & Workload Matrix
                </h4>
              </div>
              <span className="text-[10px] text-slate-500 font-sans">
                Follow up on individual completion progress
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentTeamUsers.map(member => {
                const isLead = currentTeam && member.id === currentTeam.managerId;
                const mTasks = teamTasks.filter(t => t.assigneeId === member.id);
                const mCompleted = mTasks.filter(t => t.status === 'Done').length;
                const mInProg = mTasks.filter(t => t.status === 'In Progress').length;
                const mToDo = mTasks.filter(t => t.status === 'To Do').length;
                const mRate = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;

                return (
                  <div key={member.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs font-mono border ${
                          isLead ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-300'
                        }`}>
                          {member.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900 text-xs">@{member.username}</span>
                            {isLead && (
                              <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-bold">
                                Team Lead
                              </span>
                            )}
                            <button
                              onClick={() => handleStartChatWithMember(member.username)}
                              className="px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-[9px] font-bold font-mono transition-colors cursor-pointer flex items-center space-x-1 ml-1"
                              title={`Start chat with @${member.username}`}
                            >
                              <MessageSquare size={10} />
                              <span>Chat</span>
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-500 block">{member.email}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-800 block">{mRate}% Done</span>
                        <span className="text-[10px] text-slate-500">{mCompleted} of {mTasks.length} tasks</span>
                      </div>
                    </div>

                    {/* Completion Bar */}
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          mRate === 100 ? 'bg-emerald-500' : mRate > 0 ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                        style={{ width: `${mRate}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-600 pt-1 border-t border-slate-200/60">
                      <span>In Progress: <strong className="text-blue-700">{mInProg}</strong></span>
                      <span>To Do: <strong className="text-slate-700">{mToDo}</strong></span>
                      <span>Done: <strong className="text-emerald-700">{mCompleted}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actionable Tasks Completion Follow-Up Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Target className="text-blue-600" size={16} />
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">
                  Managerial Follow-Up & Action Table
                </h4>
              </div>
              <span className="text-[10px] text-slate-500 font-sans">
                Team Lead direct status update controls
              </span>
            </div>

            {teamTasks.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl">
                No active tasks to display in follow-up table.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                      <th className="pb-2.5 font-bold">Task Title</th>
                      <th className="pb-2.5 font-bold">Assignee</th>
                      <th className="pb-2.5 font-bold">Milestone</th>
                      <th className="pb-2.5 font-bold">Due Date</th>
                      <th className="pb-2.5 font-bold">Priority</th>
                      <th className="pb-2.5 font-bold">Completion Status</th>
                      <th className="pb-2.5 font-bold text-right">Lead Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teamTasks.map(task => {
                      const isDone = task.status === 'Done';
                      const isInProg = task.status === 'In Progress';
                      const todayStr = new Date().toISOString().split('T')[0];
                      const isOverdue = !isDone && task.dueDate && task.dueDate < todayStr;

                      return (
                        <tr key={task.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 pr-3 font-sans font-bold text-slate-900">
                            <div>
                              <span className={isDone ? 'line-through text-slate-400' : ''}>{task.title}</span>
                              {isOverdue && (
                                <span className="ml-2 text-[9px] bg-red-100 text-red-800 border border-red-200 font-bold px-1.5 py-0.2 rounded">
                                  OVERDUE
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 pr-3 font-bold text-slate-800">
                            @{task.assigneeName}
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {task.milestone || 'General'}
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {task.dueDate || 'Unscheduled'}
                          </td>

                          <td className="py-3 pr-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                              task.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {task.priority}
                            </span>
                          </td>

                          <td className="py-3 pr-3">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold inline-flex items-center space-x-1 ${
                              isDone ? 'bg-emerald-100 text-emerald-800' :
                              isInProg ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {isDone ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                              <span>{task.status}</span>
                            </span>
                          </td>

                          <td className="py-3 text-right">
                            <button
                              onClick={() => {
                                const nextStatus = task.status === 'To Do' ? 'In Progress' : task.status === 'In Progress' ? 'Done' : 'To Do';
                                onUpdateTaskStatus(task.id, nextStatus);
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Toggle Status
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: TEAM RESOURCES (System Resources, Library, Insights) */}
      {(activeTab === 'resources' || activeTab === 'insights') && (
        <div className="space-y-4" id="team-resources-container">
          {/* Subview Navigation Bar for Resources */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-[#155DFC]">
                <Layers size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 font-mono flex items-center gap-2">
                  <span>Team Resources</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-[#155DFC] font-bold font-mono">
                    {currentTeam?.name || 'Unit'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 font-sans">
                  Manage team-specific external connections, SQL query libraries, and operational shift knowledge.
                </p>
              </div>
            </div>

            {/* Sub-tab pills */}
            <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/80 font-mono text-xs">
              <button
                type="button"
                id="btn-subtab-system-resources"
                onClick={() => setResourceSubTab('system-resources')}
                className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
                  resourceSubTab === 'system-resources'
                    ? 'bg-white text-[#155DFC] font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HardDrive size={13} />
                <span>System Resources</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-50 text-[#155DFC] font-bold ml-1">
                  {(teamSpecificDbs.length + (currentTeam?.allowedDbIds?.length || 0))}
                </span>
              </button>

              <button
                type="button"
                id="btn-subtab-library"
                onClick={() => setResourceSubTab('library')}
                className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
                  resourceSubTab === 'library'
                    ? 'bg-white text-[#155DFC] font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen size={13} />
                <span>Library</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold ml-1">
                  {libraryTemplates.length}
                </span>
              </button>

              <button
                type="button"
                id="btn-subtab-insights"
                onClick={() => setResourceSubTab('insights')}
                className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
                  resourceSubTab === 'insights'
                    ? 'bg-white text-[#155DFC] font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Lightbulb size={13} />
                <span>Insights</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold ml-1">
                  {teamInsights.length}
                </span>
              </button>
            </div>
          </div>

          {/* SUBVIEW 1: SYSTEM RESOURCES */}
          {resourceSubTab === 'system-resources' && (
            <div className="space-y-4 font-mono text-xs">
              {/* Information Banner */}
              <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-700">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-[#155DFC]" />
                    <span className="font-bold text-slate-900 text-xs">Team Connection Scoping & Promotion Governance</span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-sans">
                    Databases configured here are <strong>isolated to {currentTeam?.name || 'this team'}</strong> and inaccessible to other teams. Team Managers can request promotion to system-wide resources, requiring Workspace Admin approval.
                  </p>
                </div>

                <button
                  type="button"
                  id="btn-add-team-db"
                  onClick={() => setShowAddTeamDbModal(true)}
                  className="px-3.5 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-bold rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer shrink-0"
                >
                  <Plus size={14} />
                  <span>Configure Team Connection</span>
                </button>
              </div>

              {/* Subsection A: Team-Specific Database Connections (Isolated Scope) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Lock size={15} className="text-[#155DFC]" />
                      <span>Team-Specific Connections ({teamSpecificDbs.length})</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                        Isolated Scope
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Private database connections established by this team. Non-members cannot discover or query these databases.
                    </p>
                  </div>
                </div>

                {isLoadingTeamDbs ? (
                  <div className="p-8 text-center text-slate-400 font-sans text-xs">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-[#155DFC]" />
                    Loading team-specific database connections...
                  </div>
                ) : teamSpecificDbs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-sans text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                    <HardDrive size={24} className="mx-auto text-slate-300" />
                    <p className="font-bold text-slate-600">No team-specific connections configured yet.</p>
                    <p className="text-slate-400 text-[11px]">Click "Configure Team Connection" to connect a database isolated to your team.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {teamSpecificDbs.map(db => {
                      const isPending = db.promotionStatus === 'PENDING_ADMIN_APPROVAL';
                      const isApproved = db.promotionStatus === 'APPROVED';
                      const isRejected = db.promotionStatus === 'REJECTED';

                      return (
                        <div
                          key={db.id}
                          className="p-4 bg-slate-50/70 border border-slate-200 hover:border-slate-300 rounded-xl flex flex-col justify-between gap-3 transition-colors shadow-2xs"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center space-x-2">
                                <div className="p-1.5 rounded-lg bg-blue-100 text-[#155DFC]">
                                  <Database size={15} />
                                </div>
                                <div>
                                  <span className="font-bold text-slate-900 text-xs block truncate max-w-[160px]" title={db.name}>
                                    {db.name}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">{db.type || 'PostgreSQL'}</span>
                                </div>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold font-mono bg-blue-50 text-[#155DFC] border border-blue-200">
                                Team Only
                              </span>
                            </div>

                            {db.description && (
                              <p className="text-[11px] text-slate-600 font-sans line-clamp-2">
                                {db.description}
                              </p>
                            )}

                            <div className="space-y-1 text-[10px] text-slate-500 font-mono bg-white p-2 rounded-lg border border-slate-100">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Host:</span>
                                <span className="truncate max-w-[130px]" title={db.host}>{db.host}:{db.port}</span>
                              </div>
                              {db.databaseName && (
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Database:</span>
                                  <span className="truncate max-w-[130px]">{db.databaseName}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-slate-400">Status:</span>
                                <span className={db.status === 'online' ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                                  {db.status === 'online' ? 'Online' : 'Offline'} ({db.pingMs || 15}ms)
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Promotion Status & Action Area */}
                          <div className="pt-2 border-t border-slate-200/80 space-y-2">
                            {isPending ? (
                              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800 flex items-center gap-1.5 font-sans">
                                <Clock size={12} className="text-amber-600 shrink-0" />
                                <span>Awaiting Workspace Admin review on sidebar monitor.</span>
                              </div>
                            ) : isApproved ? (
                              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-800 flex items-center gap-1.5 font-sans">
                                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                                <span>Approved by Admin as System-Wide Resource.</span>
                              </div>
                            ) : isRejected ? (
                              <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[10px] text-rose-800 flex items-center gap-1.5 font-sans">
                                <X size={12} className="text-rose-600 shrink-0" />
                                <span>Promotion rejected. Notes: {db.promotionNotes || 'See admin feedback'}</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPromotingDb(db);
                                  setPromotionNotes('');
                                  setPromotionError(null);
                                }}
                                className="w-full py-1.5 px-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-slate-700 hover:text-[#155DFC] text-[10px] font-bold flex items-center justify-center space-x-1 transition-colors cursor-pointer"
                              >
                                <ArrowUpRight size={12} className="text-[#155DFC]" />
                                <span>Request System-Wide Promotion</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Subsection B: Admin-Granted Global Databases */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Globe size={15} className="text-[#155DFC]" />
                      <span>Admin-Authorized Global Databases ({(currentTeam?.allowedDbIds || []).length})</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200">
                        Admin Governed
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Enterprise data sources configured globally and granted to this team by Workspace Admins.
                    </p>
                  </div>
                </div>

                {databases.filter(d => (currentTeam?.allowedDbIds || []).includes(d.id)).length === 0 ? (
                  <div className="p-6 text-center text-slate-400 font-sans text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No global databases granted to this team yet. Workspace Admins allocate database envelopes in Team Settings &rarr; DB Access.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {databases.filter(d => (currentTeam?.allowedDbIds || []).includes(d.id)).map(db => (
                      <div
                        key={db.id}
                        className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl flex flex-col justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                                <Server size={15} />
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-xs block truncate max-w-[160px]" title={db.name}>
                                  {db.name}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">{db.type || 'PostgreSQL'}</span>
                              </div>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold font-mono bg-purple-50 text-purple-700 border border-purple-200">
                              Global Admin
                            </span>
                          </div>

                          <div className="space-y-1 text-[10px] text-slate-500 font-mono bg-white p-2 rounded-lg border border-slate-100">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Host:</span>
                              <span className="truncate max-w-[130px]">{db.host}:{db.port}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Status:</span>
                              <span className={db.status === 'online' ? 'text-emerald-600 font-bold' : 'text-slate-500'}>
                                {db.status === 'online' ? 'Online' : 'Offline'} ({db.pingMs || 15}ms)
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[10px] text-slate-500 font-sans">
                          <span>Envelope: Tier 1 Admin Granted</span>
                          <span className="font-bold text-[#155DFC]">Accessible in Sandbox</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUBVIEW 2: LIBRARY (SQL Templates, Schema Guides, Scripts) */}
          {resourceSubTab === 'library' && (
            <div className="space-y-4 font-mono text-xs">
              {/* Search & Filter Toolbar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search query templates by title, description, or SQL..."
                      value={searchLibraryQuery}
                      onChange={e => setSearchLibraryQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#155DFC] font-sans"
                    />
                  </div>

                  {/* Category Pills */}
                  <div className="flex items-center gap-1 shrink-0 overflow-x-auto">
                    {['ALL', 'Reconciliation', 'Staging & Feed', 'Risk & Audit'].map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedLibraryCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          selectedLibraryCategory === cat
                            ? 'bg-[#155DFC] text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-add-library-template"
                  onClick={() => setShowAddTemplateModal(true)}
                  className="px-3.5 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-bold rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer shrink-0"
                >
                  <Plus size={14} />
                  <span>Save Query Template</span>
                </button>
              </div>

              {/* Templates List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {libraryTemplates
                  .filter(tmpl => {
                    const matchesCategory = selectedLibraryCategory === 'ALL' || tmpl.category === selectedLibraryCategory;
                    const matchesSearch = !searchLibraryQuery.trim() || 
                      tmpl.title.toLowerCase().includes(searchLibraryQuery.toLowerCase()) ||
                      tmpl.description.toLowerCase().includes(searchLibraryQuery.toLowerCase()) ||
                      tmpl.sql.toLowerCase().includes(searchLibraryQuery.toLowerCase());
                    return matchesCategory && matchesSearch;
                  })
                  .map(tmpl => {
                    const isCopied = copiedTemplateId === tmpl.id;
                    return (
                      <div
                        key={tmpl.id}
                        className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-3 hover:border-slate-300 transition-colors"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 font-mono">{tmpl.title}</h4>
                              <p className="text-xs text-slate-500 font-sans mt-0.5 leading-relaxed">{tmpl.description}</p>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-50 text-[#155DFC] border border-blue-200 shrink-0">
                              {tmpl.category}
                            </span>
                          </div>

                          {/* Code block with 1-click copy */}
                          <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 text-slate-400 text-[10px] border-b border-slate-700">
                              <span className="font-mono text-slate-300">{tmpl.targetDb}</span>
                              <button
                                type="button"
                                onClick={() => handleCopySql(tmpl.id, tmpl.sql)}
                                className={`px-2 py-0.5 rounded flex items-center space-x-1 font-mono transition-colors cursor-pointer ${
                                  isCopied
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                }`}
                              >
                                {isCopied ? <CheckCheck size={12} /> : <Copy size={12} />}
                                <span>{isCopied ? 'Copied!' : 'Copy SQL'}</span>
                              </button>
                            </div>
                            <pre className="p-3 text-[11px] text-emerald-400 font-mono overflow-x-auto whitespace-pre leading-relaxed max-h-40">
                              {tmpl.sql}
                            </pre>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>Created by @{tmpl.authorName}</span>
                          <span>{tmpl.createdAt}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* SUBVIEW 3: INSIGHTS (Shift Handovers, Tips, Resolution Learnings) */}
          {resourceSubTab === 'insights' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                      Team Knowledge & Query Insights
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Share query shortcuts, database safety rules, operational tips, and past resolution learnings.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowAddInsightModal(true)}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Lightbulb size={15} />
                    <span>Share New Insight</span>
                  </button>
                </div>

                {/* Insights List */}
                {teamInsights.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <Lightbulb size={32} className="mx-auto text-slate-300" />
                    <h4 className="text-xs font-bold text-slate-700 font-mono">No insights published yet</h4>
                    <p className="text-[11px] text-slate-500">Publish your operational learnings or query shortcuts to help team members.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teamInsights.map(insight => (
                      <div key={insight.id} className="p-5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3 flex flex-col justify-between hover:border-slate-300 transition-colors">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <h4 className="text-xs font-bold text-slate-900 font-mono leading-snug">
                              {insight.title}
                            </h4>

                            <button
                              onClick={() => onDeleteInsight(insight.id)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete insight"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <p className="text-xs text-slate-700 leading-relaxed font-sans bg-white p-3 rounded-lg border border-slate-200/80">
                            {insight.content}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                          <div className="flex items-center space-x-1.5 text-slate-500">
                            <span className="font-semibold text-slate-800">@{insight.authorName}</span>
                            <span className="uppercase text-[9px] bg-slate-200 text-slate-700 px-1 py-0.2 rounded">
                              {insight.authorRole}
                            </span>
                            <span>•</span>
                            <span>{new Date(insight.createdAt).toLocaleDateString()}</span>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {insight.tags.map((tag, idx) => (
                              <span key={idx} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONSOLIDATED TAB: TEAM SETTINGS (Approvals, Cross-Team, AI Strategy, Org Structure, DB Access) */}
      {(activeTab === 'team_settings' || ['approvals', 'grants', 'ai-strategy', 'relationships', 'db-access'].includes(activeTab)) && (
        <div className="space-y-4" id="team-settings-container">
          {/* Team Settings Header */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs" id="team-settings-header">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-50 text-[#155DFC] border border-blue-200 rounded-xl">
                <Settings size={20} />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold tracking-tight text-slate-900 uppercase">
                    Team Settings &amp; Governance
                  </h3>
                  <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full font-bold">
                    {currentTeam?.name || 'Active Team'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                  Manage approvals, cross-team access grants, AI strategy objectives, organizational hierarchy, and external database permissions.
                </p>
              </div>
            </div>
          </div>

          {/* Segmented Sub-navigation Bar */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 border border-slate-200 rounded-2xl overflow-x-auto no-scrollbar shadow-2xs" id="team-settings-subnav">
            {[
              {
                id: 'approvals' as TeamSettingsSubTab,
                label: 'Approvals',
                icon: ShieldCheck,
                count: pendingResolutions.length + settingProposals.filter(p => p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'ESCALATED_TO_TARGET_TEAM').length
              },
              {
                id: 'grants' as TeamSettingsSubTab,
                label: 'Cross Team',
                icon: Users,
                count: visibilityGrants.length
              },
              {
                id: 'ai-strategy' as TeamSettingsSubTab,
                label: 'AI Strategy',
                icon: Sparkles,
                count: aiObjectives.length
              },
              {
                id: 'relationships' as TeamSettingsSubTab,
                label: 'Org Structure',
                icon: Network,
                count: teamRelationships.length
              },
              {
                id: 'db-access' as TeamSettingsSubTab,
                label: 'Database Access',
                icon: Database,
                count: currentTeam?.allowedDbIds?.length || 0
              }
            ].map(subTab => {
              const currentActiveSubTab = (activeTab === 'team_settings' ? teamSettingsSubTab : (['approvals', 'grants', 'ai-strategy', 'relationships', 'db-access'].includes(activeTab) ? activeTab : 'approvals'));
              const isSubActive = currentActiveSubTab === subTab.id;
              const SubIcon = subTab.icon;
              return (
                <button
                  key={subTab.id}
                  type="button"
                  id={`team-subtab-${subTab.id}`}
                  onClick={() => {
                    setActiveTab('team_settings');
                    setTeamSettingsSubTab(subTab.id);
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer shrink-0 ${
                    isSubActive
                      ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  <SubIcon className={`w-3.5 h-3.5 ${isSubActive ? 'text-white' : 'text-slate-500'}`} />
                  <span>{subTab.label}</span>
                  {typeof subTab.count === 'number' && subTab.count > 0 && (
                    <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${
                      isSubActive ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {subTab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* SUBTAB 1: APPROVALS */}
          {((activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'approvals') && (
        <div className="space-y-5 font-mono text-xs">
          <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-5 text-slate-800 space-y-2 shadow-xs">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-purple-100 text-purple-700 border border-purple-200 rounded-xl">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold tracking-tight text-purple-950 uppercase">
                    Maker-Checker Operational Approval Queue
                  </h3>
                  <span className="text-[9px] bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full font-bold">
                    Four-Eyes Principle
                  </span>
                </div>
                <p className="text-[11px] text-purple-800/80 font-sans mt-0.5">
                  Dual authorization review queue for discrepancy overrides and workspace configuration proposals. Anti-self-approval enforced.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-5">
            {/* Subtab navigation */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 pb-4">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setApprovalsSubTab('resolutions')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    approvalsSubTab === 'resolutions'
                      ? 'bg-purple-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck size={14} />
                  <span>Transaction Resolutions</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-800 text-purple-200 font-mono">
                    {pendingResolutions.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setApprovalsSubTab('settings')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    approvalsSubTab === 'settings'
                      ? 'bg-[#155DFC] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sliders size={14} />
                  <span>Workspace Setting Proposals</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-900 text-blue-200 font-mono">
                    {settingProposals.filter(p => p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'ESCALATED_TO_TARGET_TEAM').length}
                  </span>
                </button>
              </div>

              {approvalsSubTab === 'settings' && (
                <div className="flex items-center space-x-2">
                  {/* Status filter */}
                  <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-[10px] font-mono">
                    {['ALL', 'PENDING_TEAM_APPROVAL', 'ESCALATED_TO_TARGET_TEAM', 'APPROVED', 'REJECTED'].map(st => (
                      <button
                        key={st}
                        onClick={() => setSettingStatusFilter(st)}
                        className={`px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                          settingStatusFilter === st
                            ? 'bg-white text-blue-700 font-bold shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {st === 'PENDING_TEAM_APPROVAL' ? 'Pending' :
                         st === 'ESCALATED_TO_TARGET_TEAM' ? 'Escalated' :
                         st === 'ALL' ? 'All' : st}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCreateProposalModal(true)}
                    className="px-3 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-bold rounded-xl flex items-center space-x-1.5 transition shadow-2xs cursor-pointer text-xs"
                  >
                    <Plus size={14} />
                    <span>New Setting Proposal</span>
                  </button>
                </div>
              )}
            </div>

            {/* SUB-VIEW 1: TRANSACTION RESOLUTIONS */}
            {approvalsSubTab === 'resolutions' && (
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
                  <ShieldCheck className="text-purple-600" size={16} />
                  <span>Pending Discrepancy Resolution Proposals ({pendingResolutions.length})</span>
                </h4>

                {pendingResolutions.length === 0 ? (
                  <div className="p-10 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <ShieldCheck size={36} className="mx-auto text-slate-300" />
                    <h5 className="font-bold text-slate-700">No pending resolution requests</h5>
                    <p className="text-[11px] text-slate-500 font-sans">All transaction resolution proposals have been reviewed and processed.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingResolutions.map((proposal) => {
                      const isSelfMaker = proposal.makerId === currentUser.id;
                      return (
                        <div key={proposal.id} className="p-4 bg-slate-50 border border-purple-200 rounded-xl space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold rounded text-[10px]">
                                {proposal.proposedAction}
                              </span>
                              <span className="text-slate-800 font-bold">Task: {proposal.taskId}</span>
                              <span className="text-slate-500 text-[10px]">Txn: {proposal.transactionId}</span>
                            </div>
                            <span className="text-slate-400 text-[10px]">
                              Submitted: {new Date(proposal.createdAt).toLocaleString()}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-700">
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase font-bold block">Maker Analyst</span>
                              <span className="font-bold text-slate-900">@{proposal.makerName}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase font-bold block">Proposed Status</span>
                              <span className="font-bold text-emerald-700">{proposal.proposedStatus}</span>
                            </div>
                          </div>

                          <div className="bg-white p-3 rounded-lg border border-slate-200 text-slate-800">
                            <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Justification Note</span>
                            <p className="text-xs font-sans whitespace-pre-wrap">{proposal.justificationNote}</p>
                          </div>

                          {/* Anti-Self-Approval Enforcement Warning */}
                          {isSelfMaker ? (
                            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-center gap-2">
                              <AlertCircle size={14} className="text-amber-600 shrink-0" />
                              <span>Anti-Self-Approval Enforcement: You are the Maker of this proposal and cannot approve your own submission.</span>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
                              <input
                                type="text"
                                placeholder="Optional feedback / rejection reason..."
                                value={reviewReason[proposal.id] || ''}
                                onChange={(e) => setReviewReason(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                                className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-sans"
                              />
                              <div className="flex items-center space-x-2 shrink-0">
                                <button
                                  onClick={() => handleReviewProposal(proposal.id, 'REJECT')}
                                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-bold transition cursor-pointer"
                                >
                                  Reject Proposal
                                </button>
                                <button
                                  onClick={() => handleReviewProposal(proposal.id, 'APPROVE')}
                                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition shadow-2xs cursor-pointer flex items-center space-x-1"
                                >
                                  <CheckCircle2 size={13} />
                                  <span>Approve & Commit</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SUB-VIEW 2: WORKSPACE SETTING PROPOSALS */}
            {approvalsSubTab === 'settings' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
                    <Sliders className="text-blue-600" size={16} />
                    <span>Workspace Setting Proposals & Escalations</span>
                  </h4>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Team: {currentTeam?.name || currentTeamId || 'All'}
                  </span>
                </div>

                {(() => {
                  const filtered = settingProposals.filter(p => {
                    if (settingStatusFilter === 'ALL') return true;
                    return p.status === settingStatusFilter;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="p-10 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <Sliders size={36} className="mx-auto text-slate-300" />
                        <h5 className="font-bold text-slate-700">No workspace setting proposals found</h5>
                        <p className="text-[11px] text-slate-500 font-sans">
                          Team members can propose changes to workspace settings, table mappings, or validation workflows for team review.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {filtered.map((proposal) => {
                        const isSelfMaker = proposal.makerId === currentUser.id;
                        const isPending = proposal.status === 'PENDING_TEAM_APPROVAL' || proposal.status === 'ESCALATED_TO_TARGET_TEAM';
                        const isEscalated = proposal.status === 'ESCALATED_TO_TARGET_TEAM';

                        return (
                          <div 
                            key={proposal.id} 
                            className={`p-4 rounded-xl border space-y-3 transition-all ${
                              isEscalated
                                ? 'bg-purple-50/40 border-purple-200 shadow-2xs'
                                : proposal.status === 'APPROVED'
                                ? 'bg-emerald-50/20 border-emerald-200'
                                : proposal.status === 'REJECTED'
                                ? 'bg-rose-50/20 border-rose-200'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            {/* Proposal Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded text-[10px]">
                                  {proposal.settingType}
                                </span>
                                <span className="font-bold text-slate-900">{proposal.title}</span>
                                <span className="text-[10px] text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                                  Key: {proposal.settingKey}
                                </span>
                              </div>

                              <div className="flex items-center space-x-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center space-x-1 ${
                                  proposal.status === 'PENDING_TEAM_APPROVAL' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                  proposal.status === 'ESCALATED_TO_TARGET_TEAM' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                                  proposal.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                  'bg-rose-100 text-rose-800 border border-rose-300'
                                }`}>
                                  {proposal.status === 'ESCALATED_TO_TARGET_TEAM' && <ArrowUpRight size={11} />}
                                  <span>{proposal.status.replace(/_/g, ' ')}</span>
                                </span>

                                <span className="text-slate-400 text-[10px]">
                                  {new Date(proposal.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>

                            {/* Maker & Target Info */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-slate-700 text-[11px]">
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase font-bold block">Maker Analyst</span>
                                <span className="font-bold text-slate-900">@{proposal.makerName}</span>
                                <span className="text-[10px] text-slate-400 block font-sans">Team: {proposal.teamName || proposal.teamId}</span>
                              </div>

                              {isEscalated && (
                                <div className="p-2 bg-purple-100/60 border border-purple-200 rounded-lg sm:col-span-2 space-y-0.5">
                                  <span className="text-[10px] text-purple-900 uppercase font-bold flex items-center gap-1">
                                    <ArrowUpRight size={12} />
                                    <span>Escalation Matrix Target: {proposal.escalatedTeamName || proposal.escalatedTeamId}</span>
                                  </span>
                                  <p className="text-[10px] text-purple-800 font-sans">
                                    Escalated by @{proposal.escalatedByName || proposal.escalatedById}: "{proposal.escalationReason || 'Forwarded to supervisor unit'}"
                                  </p>
                                </div>
                              )}

                              {proposal.checkerName && (
                                <div>
                                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Checker Reviewer</span>
                                  <span className="font-bold text-slate-900">@{proposal.checkerName}</span>
                                  {proposal.checkerFeedback && (
                                    <span className="text-[10px] text-slate-600 block font-sans italic">"{proposal.checkerFeedback}"</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Justification */}
                            <div className="bg-white p-3 rounded-lg border border-slate-200 text-slate-800">
                              <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Proposal Justification</span>
                              <p className="text-xs font-sans leading-relaxed whitespace-pre-wrap">{proposal.justification}</p>
                            </div>

                            {/* Proposed Changes Preview */}
                            <details className="bg-slate-900 text-slate-100 rounded-lg p-3 border border-slate-800">
                              <summary className="text-[10px] font-bold text-slate-300 uppercase cursor-pointer hover:text-white flex items-center space-x-1">
                                <FileCode size={12} />
                                <span>Inspect Proposed Changes Payload (JSON)</span>
                              </summary>
                              <pre className="mt-2 text-[10px] font-mono text-emerald-300 overflow-x-auto p-2 bg-slate-950 rounded">
                                {JSON.stringify(proposal.proposedChanges, null, 2)}
                              </pre>
                            </details>

                            {/* Actions & Anti-Self-Approval Enforcement */}
                            {isPending && (
                              <div>
                                {isSelfMaker ? (
                                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px]">
                                    <div className="flex items-center gap-2">
                                      <AlertCircle size={14} className="text-amber-600 shrink-0" />
                                      <span>Anti-Self-Approval Enforcement: You are the Maker of this setting proposal. A team Checker must review it.</span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenProposalEscalation(proposal)}
                                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold transition flex items-center space-x-1 shrink-0 cursor-pointer shadow-2xs"
                                    >
                                      <ArrowUpRight size={12} />
                                      <span>Escalate to Matrix Target</span>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
                                    <input
                                      type="text"
                                      placeholder="Checker review feedback / notes..."
                                      value={settingProposalFeedback[proposal.id] || ''}
                                      onChange={(e) => setSettingProposalFeedback(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-sans"
                                    />
                                    <div className="flex items-center space-x-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenProposalEscalation(proposal)}
                                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-bold transition cursor-pointer flex items-center space-x-1"
                                        title="Escalate setting proposal to a higher unit"
                                      >
                                        <ArrowUpRight size={13} />
                                        <span>Escalate</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleReviewSettingProposal(proposal.id, 'REJECT')}
                                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-bold transition cursor-pointer"
                                      >
                                        Reject
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleReviewSettingProposal(proposal.id, 'APPROVE')}
                                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition shadow-2xs cursor-pointer flex items-center space-x-1"
                                      >
                                        <CheckCircle2 size={13} />
                                        <span>Approve & Apply</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

          {/* SUBTAB 2: CROSS-TEAM VISIBILITY GRANTS */}
          {((activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'grants') && (
        <div className="space-y-5 font-mono text-xs">
          <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-5 text-slate-800 space-y-2 shadow-xs">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl">
                <Users size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight text-indigo-950 uppercase">
                  Cross-Team Visibility & KPI Sharing
                </h3>
                <p className="text-[11px] text-indigo-800/80 font-sans mt-0.5">
                  Manage partial (KPI-only) or full dashboard access grants shared with other department teams.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">Active Access Grants</h4>
              <button
                onClick={() => {
                  const target = prompt('Enter Team ID to grant access (e.g. team-audit, team-cbs):');
                  if (target) handleCreateGrant(target, 'PARTIAL_KPI');
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition cursor-pointer"
              >
                + Grant Visibility to Team
              </button>
            </div>

            {visibilityGrants.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
                No cross-team dashboard visibility grants configured yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibilityGrants.map(grant => (
                  <div key={grant.id} className="py-3 flex items-center justify-between text-slate-800">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold">Grantor: {grant.grantorTeamId}</span>
                        <span>→</span>
                        <span className="font-bold text-indigo-700">Grantee: {grant.granteeTeamId}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 block">Granted by @{grant.grantedBy} on {new Date(grant.createdAt).toLocaleDateString()}</span>
                    </div>
                    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 font-bold rounded text-[10px]">
                      {grant.accessLevel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

          {/* SUBTAB 3: AI STRATEGIC OBJECTIVES */}
          {((activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'ai-strategy') && (
        <div className="space-y-5 font-mono text-xs">
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-5 text-slate-800 space-y-2 shadow-xs">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl">
                <Sparkles size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight text-emerald-950 uppercase">
                  AI Strategic Alignment Scaffolding
                </h3>
                <p className="text-[11px] text-emerald-800/80 font-sans mt-0.5">
                  Monitors organizational strategy document objectives against live team task resolution velocity.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiObjectives.map(obj => (
              <div key={obj.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-900 text-xs">{obj.title}</h4>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                    {obj.targetMetric}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-sans">{obj.description}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                    <span>Progress</span>
                    <span>{obj.currentValue} / {obj.targetValue}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full"
                      style={{ width: `${Math.min(100, (obj.currentValue / Math.max(1, obj.targetValue)) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-1.5 flex-wrap pt-1">
                  {obj.linkedHashtags?.map((tag: string, idx: number) => (
                    <span key={idx} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[9px] font-bold">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

          {/* SUBTAB 4: ORG STRUCTURE & TEAM RELATIONSHIPS */}
          {((activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'relationships') && (
        <div className="space-y-4" id="team-relationships-panel">
          {/* Header Card */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 text-slate-800 font-mono text-xs shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-xl">
                <Network size={20} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    {currentTeam?.name} — Org Structure & Inter-Team Relationships
                  </h3>
                  {(currentTeam?.teamType || 'working') === 'permanent' ? (
                    <span className="text-[9px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                      <ShieldCheck size={10} />
                      <span>Permanent Unit</span>
                    </span>
                  ) : (
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                      <Briefcase size={10} />
                      <span>Working Team</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 font-sans">
                  {(currentTeam?.teamType || 'working') === 'permanent'
                    ? 'Permanent teams represent core organizational departments. Define hierarchical reporting, subordinate units, escalation targets, and operational data dependencies.'
                    : 'Working teams represent project-based squads. Define which department you report into, lateral peers, upstream data sources, and settlement consumers.'}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setTargetTeamIdForRel('');
                setRelType('PARENT_UNIT');
                setRelDescription('');
                setRelError(null);
                setShowDefineRelModal(true);
              }}
              className="px-3.5 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-mono font-bold text-xs rounded-lg flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer border border-[#155DFC]/30 shrink-0 self-start md:self-auto"
              id="define-relationship-btn"
            >
              <Plus size={14} />
              <span>Define Relationship</span>
            </button>
          </div>

          {/* Quick Stats Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
            {/* Hierarchy Links */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                <span>Hierarchy Links</span>
                <GitFork size={13} className="text-purple-600" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {teamRelationships.filter(r => r.relationshipType === 'PARENT_UNIT' || r.relationshipType === 'SUB_UNIT').length}
              </div>
              <p className="text-[10px] text-slate-400">Parent & Sub-Units</p>
            </div>

            {/* Escalations & Audits */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                <span>Escalation / Audit</span>
                <AlertCircle size={13} className="text-amber-600" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {teamRelationships.filter(r => r.relationshipType === 'ESCALATION_TARGET' || r.relationshipType === 'AUDIT_COMPLIANCE_REVIEWER').length}
              </div>
              <p className="text-[10px] text-slate-400">Disputes & Oversight</p>
            </div>

            {/* Pipeline Dataflow */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                <span>Data Pipelines</span>
                <Layers size={13} className="text-teal-600" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {teamRelationships.filter(r => r.relationshipType === 'UPSTREAM_PROVIDER' || r.relationshipType === 'DOWNSTREAM_CONSUMER').length}
              </div>
              <p className="text-[10px] text-slate-400">Upstream / Downstream</p>
            </div>

            {/* Peer Collaborators */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                <span>Peer Units</span>
                <Share2 size={13} className="text-blue-600" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {teamRelationships.filter(r => r.relationshipType === 'PEER_COLLABORATOR').length}
              </div>
              <p className="text-[10px] text-slate-400">Lateral Collaborators</p>
            </div>
          </div>

          {/* Relationship List */}
          {isLoadingRelationships ? (
            <div className="p-12 text-center text-slate-500 font-mono text-xs bg-white rounded-2xl border border-slate-200">
              Loading team relationships...
            </div>
          ) : teamRelationships.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3 shadow-sm font-mono">
              <div className="w-12 h-12 bg-blue-50 text-[#155DFC] rounded-full flex items-center justify-center mx-auto">
                <Network size={22} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800">No Inter-Team Relationships Defined Yet</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto font-sans">
                  Define your team's parent department, subordinate units, escalation targets, or pipeline dataflow links to integrate into the organizational structure.
                </p>
              </div>
              <button
                onClick={() => {
                  setTargetTeamIdForRel('');
                  setRelType('PARENT_UNIT');
                  setRelDescription('');
                  setRelError(null);
                  setShowDefineRelModal(true);
                }}
                className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-bold text-xs rounded-xl inline-flex items-center space-x-2 transition-all cursor-pointer shadow-xs"
              >
                <Plus size={14} />
                <span>Define First Relationship</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {teamRelationships.map(rel => {
                const isSource = rel.sourceTeamId === currentTeamId;
                const otherTeamId = isSource ? rel.targetTeamId : rel.sourceTeamId;
                const otherTeamName = isSource ? (rel.targetTeamName || 'Unknown Team') : (rel.sourceTeamName || 'Unknown Team');
                const otherTeamType = isSource ? rel.targetTeamType : rel.sourceTeamType;
                const otherTeam = teams.find(t => t.id === otherTeamId);

                // Badge styling & icon per relationship type
                let typeBadgeBg = 'bg-blue-100 text-blue-800 border-blue-200';
                let typeLabel = 'Peer Collaborator';
                let typeIcon = <Share2 size={13} className="text-blue-600" />;

                if (rel.relationshipType === 'PARENT_UNIT') {
                  typeBadgeBg = 'bg-purple-100 text-purple-900 border-purple-300';
                  typeLabel = isSource ? 'Parent Department / Unit' : 'Subordinate Child Unit';
                  typeIcon = <ShieldCheck size={13} className="text-purple-600" />;
                } else if (rel.relationshipType === 'SUB_UNIT') {
                  typeBadgeBg = 'bg-indigo-100 text-indigo-900 border-indigo-300';
                  typeLabel = isSource ? 'Subordinate Sub-Unit' : 'Parent Department';
                  typeIcon = <GitFork size={13} className="text-indigo-600" />;
                } else if (rel.relationshipType === 'ESCALATION_TARGET') {
                  typeBadgeBg = 'bg-amber-100 text-amber-900 border-amber-300';
                  typeLabel = isSource ? 'Escalation Target' : 'Escalation Source';
                  typeIcon = <AlertCircle size={13} className="text-amber-600" />;
                } else if (rel.relationshipType === 'AUDIT_COMPLIANCE_REVIEWER') {
                  typeBadgeBg = 'bg-violet-100 text-violet-900 border-violet-300';
                  typeLabel = isSource ? 'Audit & Compliance Reviewer' : 'Audited Unit';
                  typeIcon = <ShieldCheck size={13} className="text-violet-600" />;
                } else if (rel.relationshipType === 'UPSTREAM_PROVIDER') {
                  typeBadgeBg = 'bg-cyan-100 text-cyan-900 border-cyan-300';
                  typeLabel = isSource ? 'Upstream Batch Provider' : 'Downstream Consumer';
                  typeIcon = <ArrowUpRight size={13} className="text-cyan-600" />;
                } else if (rel.relationshipType === 'DOWNSTREAM_CONSUMER') {
                  typeBadgeBg = 'bg-teal-100 text-teal-900 border-teal-300';
                  typeLabel = isSource ? 'Downstream Settlement Consumer' : 'Upstream Provider';
                  typeIcon = <ArrowDownLeft size={13} className="text-teal-600" />;
                }

                return (
                  <div
                    key={rel.id}
                    className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2.5">
                      {/* Top Row: Type Badge & Direction */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono flex items-center space-x-1 ${typeBadgeBg}`}>
                            {typeIcon}
                            <span>{typeLabel}</span>
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {isSource ? 'Outgoing Link' : 'Incoming Link'}
                          </span>
                        </div>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteRelationship(rel.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Remove relationship"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Connected Team Info */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <button
                            onClick={() => setSelectedTeamId(otherTeamId)}
                            className="font-bold text-sm text-slate-900 hover:text-[#155DFC] font-mono transition-colors flex items-center space-x-1 text-left"
                          >
                            <span>{otherTeamName}</span>
                            <ChevronRight size={14} className="text-slate-400" />
                          </button>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            {otherTeam ? `Lead: @${otherTeam.managerName} • ${otherTeam.memberIds?.length || 0} members` : 'Connected Team'}
                          </span>
                        </div>

                        {(otherTeamType || otherTeam?.teamType || 'working') === 'permanent' ? (
                          <span className="text-[9px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1 shrink-0">
                            <ShieldCheck size={10} />
                            <span>Permanent Unit</span>
                          </span>
                        ) : (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1 shrink-0">
                            <Briefcase size={10} />
                            <span>Working Team</span>
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {rel.description ? (
                        <p className="text-xs text-slate-600 font-sans leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          {rel.description}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic font-sans">
                          No specific SLA or context notes provided.
                        </p>
                      )}
                    </div>

                    {/* Footer / Meta */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>By @{rel.createdBy || 'system'}</span>
                      <span>{new Date(rel.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

          {/* SUBTAB 5: DATABASE & EXTERNAL SYSTEM ACCESS */}
          {((activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'db-access') && (
            <div className="space-y-5 font-mono text-xs" id="team-settings-db-access-panel">
              {/* Header Banner */}
              <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-5 text-slate-800 space-y-2 shadow-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-xl">
                      <Database size={22} />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-slate-900">External Database &amp; Query Governance</h3>
                        {(currentTeam?.teamType || 'working') === 'permanent' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-800 border border-purple-200 font-bold flex items-center gap-1">
                            <ShieldCheck size={11} />
                            Permanent Team Policy
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold flex items-center gap-1">
                            <Briefcase size={11} />
                            Working Squad
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 font-sans mt-0.5">
                        Configure which external back-office databases and SQL query execution types are authorized for members of <strong>{currentTeam?.name}</strong>.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    id="btn-save-team-db-access"
                    disabled={isSavingDbAccess}
                    onClick={handleSaveDbAccess}
                    className="px-4 py-2 bg-[#155DFC] hover:bg-blue-600 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-2 shadow-xs transition-all cursor-pointer shrink-0 self-start md:self-auto"
                  >
                    {isSavingDbAccess ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        <span>Save Access Policy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Notifications */}
                {dbAccessSuccessMsg && (
                  <div className="mt-2 p-2.5 bg-emerald-100/80 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-sans font-medium">
                    <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                    <span>{dbAccessSuccessMsg}</span>
                  </div>
                )}
                {dbAccessErrMsg && (
                  <div className="mt-2 p-2.5 bg-rose-100/80 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-center gap-2 font-sans font-medium">
                    <AlertCircle size={15} className="text-rose-700 shrink-0" />
                    <span>{dbAccessErrMsg}</span>
                  </div>
                )}

                {/* Explanatory Callout */}
                <div className="mt-3 p-3 bg-white/90 border border-blue-200/60 rounded-xl text-xs text-slate-700 font-sans space-y-1">
                  {(currentTeam?.teamType || 'working') === 'permanent' ? (
                    <p>
                      <strong>Governance Authority:</strong> Because this is a <strong>Permanent Team</strong>, its members' Query Sandbox privileges directly derive from this policy. Disallowed databases and forbidden statement types (e.g. UPDATE, DROP) are automatically blocked both client-side in the sandbox interface and server-side in the execution API.
                    </p>
                  ) : (
                    <p>
                      <strong>Working Squad Notice:</strong> Working squad members derive their primary Query Sandbox permissions from their assigned <strong>Permanent Team</strong>. Team-specific policies are applied when executing squad-scoped queries.
                    </p>
                  )}
                </div>
              </div>

              {/* SECTION 1: ALLOWED EXTERNAL DATABASES */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Server size={16} className="text-[#155DFC]" />
                      <span>Authorized External Databases ({selectedDbIds.length} of {databases.length} enabled)</span>
                    </h4>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Select which registered back-office connections members of this team are permitted to query.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedDbIds(databases.map(d => d.id))}
                      className="px-2.5 py-1 text-[11px] font-semibold text-[#155DFC] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDbIds([])}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {databases.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-sans text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No external databases registered in the system yet. Add databases via Database Management.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {databases.map(db => {
                      const isChecked = selectedDbIds.includes(db.id);
                      return (
                        <div
                          key={db.id}
                          onClick={() => handleToggleDbId(db.id)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                            isChecked
                              ? 'bg-blue-50/50 border-[#155DFC] shadow-xs ring-1 ring-[#155DFC]/20'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <div className={`p-1.5 rounded-lg ${isChecked ? 'bg-blue-100 text-[#155DFC]' : 'bg-slate-100 text-slate-500'}`}>
                                <Database size={15} />
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-xs block truncate max-w-[170px]">{db.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">{db.type || 'PostgreSQL'}</span>
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="rounded text-[#155DFC] focus:ring-[#155DFC] cursor-pointer mt-1"
                            />
                          </div>

                          <div className="pt-2 border-t border-slate-100/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                            <span className="truncate max-w-[130px]" title={db.host || 'localhost'}>
                              {db.host || 'localhost'}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded font-bold ${
                              db.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {db.status === 'online' ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION 2: ALLOWED QUERY STATEMENT TYPES */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Key size={16} className="text-[#155DFC]" />
                      <span>Authorized Query Statement Types</span>
                    </h4>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Determine which SQL operations team members can execute in the Query Sandbox.
                    </p>
                  </div>

                  {/* Quick Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setSelectedQueryTypes(['SELECT'])}
                      className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Safe Read-Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedQueryTypes(['SELECT', 'INSERT', 'UPDATE'])}
                      className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Standard DML
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedQueryTypes(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP'])}
                      className="px-2.5 py-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Full Admin
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { type: 'SELECT' as AllowedQueryType, name: 'SELECT', desc: 'Read-only data queries and row retrieval.', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', tag: 'Safe / Default' },
                    { type: 'INSERT' as AllowedQueryType, name: 'INSERT', desc: 'Insert new records into tables.', badge: 'bg-blue-100 text-blue-800 border-blue-200', tag: 'Data Ingestion' },
                    { type: 'UPDATE' as AllowedQueryType, name: 'UPDATE', desc: 'Modify existing values in table rows.', badge: 'bg-amber-100 text-amber-800 border-amber-200', tag: 'Data Mutation' },
                    { type: 'DELETE' as AllowedQueryType, name: 'DELETE', desc: 'Remove records and rows from tables.', badge: 'bg-rose-100 text-rose-800 border-rose-200', tag: 'Destructive' },
                    { type: 'CREATE' as AllowedQueryType, name: 'CREATE', desc: 'Create tables, indexes, or schemas.', badge: 'bg-orange-100 text-orange-800 border-orange-200', tag: 'DDL Schema' },
                    { type: 'ALTER' as AllowedQueryType, name: 'ALTER', desc: 'Alter table columns and constraints.', badge: 'bg-purple-100 text-purple-800 border-purple-200', tag: 'DDL Schema' },
                    { type: 'DROP' as AllowedQueryType, name: 'DROP', desc: 'Drop tables, schemas, or partitions.', badge: 'bg-red-100 text-red-800 border-red-200', tag: 'High Risk' }
                  ].map(item => {
                    const isChecked = selectedQueryTypes.includes(item.type);
                    return (
                      <div
                        key={item.type}
                        onClick={() => handleToggleQueryType(item.type)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          isChecked
                            ? 'bg-blue-50/50 border-[#155DFC] shadow-xs ring-1 ring-[#155DFC]/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="rounded text-[#155DFC] focus:ring-[#155DFC] cursor-pointer"
                            />
                            <span className="font-bold text-slate-900 text-xs font-mono">{item.name}</span>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono border ${item.badge}`}>
                            {item.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 3: TEAM MEMBER PRIVILEGE ALLOCATION (MANAGER DELEGATION) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Users size={16} className="text-[#155DFC]" />
                      <span>Team Member Privilege Allocation (Manager Delegation)</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-50 text-[#155DFC] font-bold border border-blue-200">
                        Tier 2 Delegation
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      As Team Manager, delegate specific databases and statement permissions to your team members. 
                      Permissions are strictly bounded by this team's granted envelope above.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveMemberPrivileges}
                    disabled={isSavingMemberPrivileges}
                    className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isSavingMemberPrivileges ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Saving Allocations...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={14} />
                        <span>Save Member Privileges</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Notifications */}
                {memberPrivSuccessMsg && (
                  <div className="p-2.5 bg-emerald-100/80 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-sans font-medium">
                    <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                    <span>{memberPrivSuccessMsg}</span>
                  </div>
                )}
                {memberPrivErrMsg && (
                  <div className="p-2.5 bg-rose-100/80 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-center gap-2 font-sans font-medium">
                    <AlertCircle size={15} className="text-rose-700 shrink-0" />
                    <span>{memberPrivErrMsg}</span>
                  </div>
                )}

                {/* Member Allocation Cards */}
                {currentTeamUsers.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 font-sans text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No members assigned to this team yet. Add members via the Members tab.
                  </div>
                ) : (
                  <div className="space-y-3 font-mono text-xs">
                    {currentTeamUsers.map(member => {
                      const isManager = member.id === currentTeam?.managerId;
                      const priv = memberPrivilegesState[member.id] || { allowedDbIds: [], allowedQueryTypes: ['SELECT'] };
                      const memberDbs = priv.allowedDbIds || [];
                      const memberTypes = priv.allowedQueryTypes || ['SELECT'];

                      // Total pool of DBs available to the team (granted global DBs + team-specific DBs)
                      const teamAccessibleDbs = [
                        ...databases.filter(d => (currentTeam?.allowedDbIds || []).includes(d.id)),
                        ...teamSpecificDbs
                      ];

                      if (isManager) {
                        return (
                          <div
                            key={member.id}
                            className="p-4 bg-purple-50/50 border border-purple-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs">
                                {member.username.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-bold text-slate-900">@{member.username}</span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold border border-purple-200">
                                    Team Manager
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                                  Holds full team authorization envelope automatically. Inherits all global and team-scoped databases.
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] text-purple-700 font-bold px-2.5 py-1 bg-white border border-purple-200 rounded-lg shrink-0">
                              Full Team Envelope
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={member.id}
                          className="p-4 bg-white border border-slate-200 hover:border-slate-300 rounded-xl space-y-3 transition-colors shadow-2xs"
                        >
                          {/* Member Header & Quick Presets */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs border border-slate-200">
                                {member.username.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900">@{member.username}</span>
                                <span className="text-[10px] text-slate-400 font-sans ml-2">({member.role})</span>
                              </div>
                            </div>

                            {/* Quick Presets for this member */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleSetMemberPrivilegePreset(member.id, 'FULL_TEAM')}
                                className="px-2 py-0.5 text-[10px] font-bold text-[#155DFC] bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                              >
                                Full Team Envelope
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetMemberPrivilegePreset(member.id, 'READ_ONLY')}
                                className="px-2 py-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                              >
                                Read-Only SELECT
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetMemberPrivilegePreset(member.id, 'CLEAR')}
                                className="px-2 py-0.5 text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          </div>

                          {/* Member Database Checkboxes */}
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                              Allocated External Databases ({memberDbs.length} of {teamAccessibleDbs.length} selected):
                            </span>
                            {teamAccessibleDbs.length === 0 ? (
                              <p className="text-[11px] text-slate-400 font-sans italic">
                                No databases currently authorized for this team. Configure team databases or request global access in Section 1.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {teamAccessibleDbs.map(db => {
                                  const isChecked = memberDbs.includes(db.id);
                                  const isTeamScoped = db.scope === 'team';
                                  return (
                                    <div
                                      key={db.id}
                                      onClick={() => handleToggleMemberDb(member.id, db.id)}
                                      className={`p-2 rounded-lg border text-xs cursor-pointer flex items-center justify-between gap-2 transition-all ${
                                        isChecked
                                          ? 'bg-blue-50/60 border-[#155DFC] text-slate-900'
                                          : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      <div className="flex items-center space-x-1.5 truncate">
                                        <Database size={13} className={isChecked ? 'text-[#155DFC]' : 'text-slate-400'} />
                                        <span className="truncate font-medium">{db.name}</span>
                                        {isTeamScoped && (
                                          <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded font-bold">Team</span>
                                        )}
                                      </div>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {}}
                                        className="rounded text-[#155DFC] focus:ring-[#155DFC] cursor-pointer"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Member Statement Types */}
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                              Allocated Query Statement Types (Envelope Ceiling: {selectedQueryTypes.join(', ')}):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedQueryTypes.map(qType => {
                                const isChecked = memberTypes.includes(qType);
                                return (
                                  <button
                                    key={qType}
                                    type="button"
                                    onClick={() => handleToggleMemberQueryType(member.id, qType)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer flex items-center space-x-1 border ${
                                      isChecked
                                        ? 'bg-[#155DFC] text-white border-[#155DFC] shadow-2xs'
                                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                    }`}
                                  >
                                    <span>{qType}</span>
                                    {isChecked && <Check size={10} />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* MODAL: ADD TASK */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <CheckSquare size={16} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Create Team Task</h3>
              </div>
              <button onClick={() => setShowAddTaskModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Audit Payment Gateway #4021 Discrepancies"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Details or specific instructions for assignee..."
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Assignee</label>
                  <select
                    value={newTaskAssigneeId}
                    onChange={e => setNewTaskAssigneeId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {currentTeamUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        @{u.username} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newTaskStartDate}
                    onChange={e => setNewTaskStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Target Due Date</label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Milestone / Timeline Phase</label>
                <input
                  type="text"
                  placeholder="e.g. Phase 1 - Reconciliation, Sprint 1, Final Audit"
                  value={newTaskMilestone}
                  onChange={e => setNewTaskMilestone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              {/* Task Action Visibility & Team Sharing */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users size={14} className="text-blue-600" />
                    <span className="text-xs font-bold text-slate-800">Make Public to Team</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={newTaskIsPublic}
                    onChange={e => {
                      setNewTaskIsPublic(e.target.checked);
                      if (!e.target.checked) setNewTaskVisibility('private');
                      else if (newTaskVisibility === 'private') setNewTaskVisibility('team');
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-slate-500 font-sans">
                  When enabled, this operational action is visible to all members of this unit workspace.
                </p>
                {newTaskIsPublic && (
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-600 font-bold uppercase">Visibility Scope:</span>
                    <select
                      value={newTaskVisibility}
                      onChange={e => setNewTaskVisibility(e.target.value as any)}
                      className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="team">Team Only (Unit Workspace)</option>
                      <option value="public">Public (All Operational Units)</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ESCALATE TASK (ESCALATION MATRIX) */}
      {escalatingTask && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <ArrowUpRight size={16} className="text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Escalate Task via Matrix</h3>
              </div>
              <button onClick={() => setEscalatingTask(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1 text-amber-900 font-sans text-xs">
              <span className="font-bold font-mono text-[10px] uppercase text-amber-800 block">Task Selected</span>
              <p className="font-semibold text-slate-900">{escalatingTask.title}</p>
              <p className="text-[11px] text-slate-500 font-mono">ID: {escalatingTask.id} • Current Team: {escalatingTask.teamId}</p>
            </div>

            {taskEscalationError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-rose-600" />
                <span>{taskEscalationError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitTaskEscalation} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Authorized Escalation Target (Matrix) *
                </label>
                {taskEscalationMatrix.length === 0 ? (
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 text-xs font-sans">
                    No authorized escalation targets or parent units configured in team relationships for this team.
                  </div>
                ) : (
                  <select
                    required
                    value={selectedTaskEscalationTargetId}
                    onChange={e => setSelectedTaskEscalationTargetId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                  >
                    {taskEscalationMatrix.map(t => (
                      <option key={t.targetTeamId} value={t.targetTeamId}>
                        {t.targetTeamName} ({t.relationshipType === 'PARENT_UNIT' ? 'Parent Unit' : 'Escalation Target'})
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                  Target selection is strictly enforced against the team's defined escalation matrix.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Escalation Reason / Context *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this task requires higher-level or cross-unit escalation..."
                  value={taskEscalationReason}
                  onChange={e => setTaskEscalationReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEscalatingTask(null)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTaskEscalation || !selectedTaskEscalationTargetId || !taskEscalationReason.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                >
                  <ArrowUpRight size={14} />
                  <span>{isSubmittingTaskEscalation ? 'Escalating...' : 'Confirm Escalation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ESCALATE SETTING PROPOSAL */}
      {escalatingProposal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <ArrowUpRight size={16} className="text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Escalate Proposal to Matrix Target</h3>
              </div>
              <button onClick={() => setEscalatingProposal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl space-y-1 text-purple-900 font-sans text-xs">
              <span className="font-bold font-mono text-[10px] uppercase text-purple-800 block">Proposal Details</span>
              <p className="font-semibold text-slate-900">{escalatingProposal.title}</p>
              <p className="text-[11px] text-slate-500 font-mono">Type: {escalatingProposal.settingType} • Key: {escalatingProposal.settingKey}</p>
            </div>

            {proposalEscalationError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-rose-600" />
                <span>{proposalEscalationError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitProposalEscalation} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Target Team in Escalation Matrix *
                </label>
                {proposalEscalationMatrix.length === 0 ? (
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 text-xs font-sans">
                    No authorized escalation targets or parent units configured in team relationships for this team.
                  </div>
                ) : (
                  <select
                    required
                    value={selectedProposalEscalationTargetId}
                    onChange={e => setSelectedProposalEscalationTargetId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                  >
                    {proposalEscalationMatrix.map(t => (
                      <option key={t.targetTeamId} value={t.targetTeamId}>
                        {t.targetTeamName} ({t.relationshipType === 'PARENT_UNIT' ? 'Parent Unit' : 'Escalation Target'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Escalation Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Specify rationale for transferring review to the escalation target unit..."
                  value={proposalEscalationReason}
                  onChange={e => setProposalEscalationReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 font-sans"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEscalatingProposal(null)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProposalEscalation || !selectedProposalEscalationTargetId || !proposalEscalationReason.trim()}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold rounded-lg flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                >
                  <ArrowUpRight size={14} />
                  <span>{isSubmittingProposalEscalation ? 'Escalating...' : 'Confirm Escalation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE WORKSPACE SETTING PROPOSAL */}
      {showCreateProposalModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Sliders size={16} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Propose Workspace Setting Change</h3>
              </div>
              <button onClick={() => setShowCreateProposalModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1 text-blue-900 font-sans text-xs">
              <span className="font-bold font-mono text-[10px] uppercase text-blue-800 block">Maker-Checker Four-Eyes Principle</span>
              <p>
                Proposals require dual authorization. Another team member or supervisor from your escalation matrix must approve before changes are applied.
              </p>
            </div>

            {createProposalError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-rose-600" />
                <span>{createProposalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateProposalSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Setting Type *</label>
                  <select
                    value={newProposalType}
                    onChange={e => setNewProposalType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  >
                    <option value="WORKSPACE_CONFIG">Workspace Config</option>
                    <option value="TABLE_MAPPING">Table Mapping</option>
                    <option value="COLUMN_CONFIG">Column Config</option>
                    <option value="VALIDATION_BOX">Validation Box</option>
                    <option value="WORKFLOW">Workflow</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Setting Key *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. general_config, switch_fe_mapping"
                    value={newProposalKey}
                    onChange={e => setNewProposalKey(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Proposal Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Update Settlement SLA window to 2 hours"
                  value={newProposalTitle}
                  onChange={e => setNewProposalTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Justification / Reason *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Why is this workspace setting change needed? Outline operational impact..."
                  value={newProposalJustification}
                  onChange={e => setNewProposalJustification(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Proposed Changes (JSON) *</label>
                <textarea
                  rows={5}
                  required
                  value={newProposalPayload}
                  onChange={e => setNewProposalPayload(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-emerald-300 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateProposalModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProposal || !newProposalTitle.trim() || !newProposalJustification.trim()}
                  className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 disabled:opacity-50 text-white font-bold rounded-lg flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                >
                  <Send size={14} />
                  <span>{isSubmittingProposal ? 'Submitting...' : 'Submit for Approval'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SHARE INSIGHT */}
      {showAddInsightModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Lightbulb size={16} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Share Operational Insight</h3>
              </div>
              <button onClick={() => setShowAddInsightModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateInsightSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Insight Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Always Dry-Run UPDATE queries before execution"
                  value={newInsightTitle}
                  onChange={e => setNewInsightTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Insight Content / Explanation *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Detail the operational learning, query shortcut, or safety step..."
                  value={newInsightContent}
                  onChange={e => setNewInsightContent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. BestPractices, SQLSafety, Reconciliation"
                  value={newInsightTags}
                  onChange={e => setNewInsightTags(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddInsightModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newInsightTitle.trim() || !newInsightContent.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
                >
                  Publish Insight
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD MEMBER */}
      {showAddMemberModal && currentTeam && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <UserPlus size={16} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Add Member to {currentTeam.name}</h3>
              </div>
              <button onClick={() => setShowAddMemberModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Select User to Add</label>
                <select
                  value={selectedUserIdToAdd}
                  onChange={e => setSelectedUserIdToAdd(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Choose user from organization --</option>
                  {availableUsersToAdd.map(u => {
                    const isPermTeam = (currentTeam.teamType || 'working') === 'permanent';
                    const userExistingPermTeam = userPermTeamMap[u.id];
                    const isBlocked = isPermTeam && userExistingPermTeam && userExistingPermTeam.id !== currentTeam.id;

                    return (
                      <option key={u.id} value={u.id} disabled={isBlocked}>
                        @{u.username} ({u.role} - {u.email}) {isBlocked ? `⚠️ Already in permanent team: ${userExistingPermTeam.name}` : ''}
                      </option>
                    );
                  })}
                </select>

                {(currentTeam.teamType || 'working') === 'permanent' && (
                  <p className="text-[10px] text-purple-700 bg-purple-50 p-2 rounded-lg border border-purple-200 mt-2 font-sans">
                    <strong>Single Permanent Team Rule:</strong> Users can only belong to one permanent team. Operators already assigned to another permanent team cannot be added.
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedUserIdToAdd}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE BRAND NEW TEAM */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Users size={18} className="text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create New Team</h3>
                  <p className="text-[10px] text-slate-500">You will be assigned as Lead/Manager for this team.</p>
                </div>
              </div>
              <button onClick={() => setShowCreateTeamModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTeamSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Team Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reconciliation Ops Squad, Data Integrity Team"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              {/* Team Classification Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Team Classification</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTeamType('working')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      newTeamType === 'working'
                        ? 'bg-blue-50/60 border-blue-500 ring-1 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                      <Briefcase size={14} className="text-emerald-600" />
                      <span>Working Squad</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Flexible project squads with multi-team membership.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewTeamType('permanent')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      newTeamType === 'permanent'
                        ? 'bg-purple-50/60 border-purple-500 ring-1 ring-purple-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                      <ShieldCheck size={14} className="text-purple-600" />
                      <span>Permanent Unit</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Permanent department. 1 permanent team per user.</p>
                  </button>
                </div>

                {newTeamType === 'permanent' && userPermTeamMap[currentUser.id] && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center gap-2 font-mono">
                    <AlertCircle size={14} className="text-amber-600 shrink-0" />
                    <span>You already belong to permanent team "<strong>{userPermTeamMap[currentUser.id].name}</strong>". Users can only belong to one permanent team.</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Team Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of your team's operational scope..."
                  value={newTeamDesc}
                  onChange={e => setNewTeamDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1.5">Select Team Members</label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                  {users.filter(u => u.id !== currentUser.id).length === 0 ? (
                    <p className="text-[11px] text-slate-400 p-2">No other users in system yet.</p>
                  ) : (
                    users.filter(u => u.id !== currentUser.id).map(user => {
                      const isSelected = newTeamMemberIds.includes(user.id);
                      const isPermMode = newTeamType === 'permanent';
                      const existingPermTeam = userPermTeamMap[user.id];
                      const isBlocked = isPermMode && !!existingPermTeam;

                      return (
                        <label
                          key={user.id}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${
                            isBlocked
                              ? 'opacity-50 bg-slate-100 cursor-not-allowed text-slate-400'
                              : isSelected
                              ? 'bg-blue-100/70 border border-blue-300 font-bold text-blue-900 cursor-pointer'
                              : 'hover:bg-slate-100 text-slate-700 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isBlocked}
                              onChange={e => {
                                if (e.target.checked) {
                                  setNewTeamMemberIds(prev => [...prev, user.id]);
                                } else {
                                  setNewTeamMemberIds(prev => prev.filter(id => id !== user.id));
                                }
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                            />
                            <span>@{user.username}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {isBlocked && (
                              <span className="text-[9px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded font-mono font-bold">
                                In {existingPermTeam.name}
                              </span>
                            )}
                            <span className="text-[10px] uppercase text-slate-500 font-mono">({user.role})</span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateTeamModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTeamName.trim() || (newTeamType === 'permanent' && !!userPermTeamMap[currentUser.id])}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DEFINE RELATIONSHIP */}
      {showDefineRelModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Network size={18} className="text-[#155DFC]" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Define Inter-Team Relationship</h3>
                  <p className="text-[10px] text-slate-500">
                    Connecting <strong className="text-slate-800">{currentTeam?.name}</strong> to another operational unit.
                  </p>
                </div>
              </div>
              <button onClick={() => setShowDefineRelModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            {relError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 rounded-lg text-[11px] flex items-center space-x-2">
                <AlertCircle size={14} className="shrink-0 text-rose-600" />
                <span>{relError}</span>
              </div>
            )}

            <form onSubmit={handleDefineRelationshipSubmit} className="space-y-4">
              {/* Target Team Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Target Team *
                </label>
                <select
                  required
                  value={targetTeamIdForRel}
                  onChange={e => setTargetTeamIdForRel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                >
                  <option value="">-- Select Target Team --</option>
                  {teams
                    .filter(t => t.id !== currentTeamId)
                    .map(t => {
                      const isPerm = (t.teamType || 'working') === 'permanent';
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name} [{isPerm ? 'Permanent Unit' : 'Working Squad'}] (Lead: @{t.managerName})
                        </option>
                      );
                    })}
                </select>
              </div>

              {/* Relationship Type Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1.5">
                  Relationship Type *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {[
                    {
                      type: 'PARENT_UNIT',
                      label: 'Parent Department',
                      desc: 'Target is our parent division / department unit in the organizational hierarchy.',
                      icon: ShieldCheck,
                      color: 'text-purple-700'
                    },
                    {
                      type: 'SUB_UNIT',
                      label: 'Child Sub-Unit',
                      desc: 'Target is a subordinate operational unit operating under this team.',
                      icon: GitFork,
                      color: 'text-indigo-700'
                    },
                    {
                      type: 'ESCALATION_TARGET',
                      label: 'Escalation Target',
                      desc: 'Target team handles escalated disputes, transaction exceptions & variances.',
                      icon: AlertCircle,
                      color: 'text-amber-700'
                    },
                    {
                      type: 'PEER_COLLABORATOR',
                      label: 'Peer Collaborator',
                      desc: 'Lateral operational partner for dual-control maker-checker & daily reconciliation.',
                      icon: Share2,
                      color: 'text-blue-700'
                    },
                    {
                      type: 'UPSTREAM_PROVIDER',
                      label: 'Upstream Batch Provider',
                      desc: 'Target team produces or imports raw transaction batches consumed by this team.',
                      icon: ArrowUpRight,
                      color: 'text-cyan-700'
                    },
                    {
                      type: 'DOWNSTREAM_CONSUMER',
                      label: 'Downstream Consumer',
                      desc: 'Target team consumes our validated settlement feeds & reconciliation sign-offs.',
                      icon: ArrowDownLeft,
                      color: 'text-teal-700'
                    },
                    {
                      type: 'AUDIT_COMPLIANCE_REVIEWER',
                      label: 'Compliance Reviewer',
                      desc: 'Target team performs independent regulatory audit and compliance verification.',
                      icon: ShieldCheck,
                      color: 'text-violet-700'
                    }
                  ].map(opt => {
                    const isSelected = relType === opt.type;
                    const IconComp = opt.icon;
                    return (
                      <div
                        key={opt.type}
                        onClick={() => setRelType(opt.type as TeamRelationshipType)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-50/90 border-[#155DFC] ring-1 ring-[#155DFC]'
                            : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center space-x-1.5 font-bold text-xs mb-0.5">
                          <IconComp size={13} className={opt.color} />
                          <span className={isSelected ? 'text-[#155DFC]' : 'text-slate-800'}>{opt.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-sans leading-tight">
                          {opt.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Operational Context / SLA Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Daily settlement batches handed over by 18:00 UTC; escalations reviewed within 4 hours..."
                  value={relDescription}
                  onChange={e => setRelDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDefineRelModal(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!targetTeamIdForRel || isSubmittingRel}
                  className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 disabled:opacity-50 text-white font-bold rounded-lg transition-all shadow-xs cursor-pointer"
                >
                  {isSubmittingRel ? 'Saving...' : 'Save Relationship'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURE TEAM DATABASE */}
      {showAddTeamDbModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Database size={16} className="text-[#155DFC]" />
                <h3 className="text-sm font-bold text-slate-900">Configure Team Database Connection</h3>
              </div>
              <button 
                onClick={() => {
                  setShowAddTeamDbModal(false);
                  setTeamDbTestResult(null);
                  setTeamDbError(null);
                }} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 font-sans">
              This database connection will be <strong>isolated to {currentTeam?.name || 'this team'}</strong>. Non-team users will not be able to discover or query it.
            </p>

            {teamDbError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-1.5 font-sans">
                <AlertCircle size={14} className="text-rose-600 shrink-0" />
                <span>{teamDbError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTeamDbSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Connection Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AIB Settlement Switch DB"
                  value={newTeamDbName}
                  onChange={e => setNewTeamDbName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Database Type *</label>
                  <select
                    value={newTeamDbType}
                    onChange={e => {
                      const val = e.target.value;
                      setNewTeamDbType(val);
                      if (val === 'MySQL') setNewTeamDbPort(3306);
                      else if (val === 'Oracle') setNewTeamDbPort(1521);
                      else if (val === 'MongoDB') setNewTeamDbPort(27017);
                      else setNewTeamDbPort(5432);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC]"
                  >
                    <option value="PostgreSQL">PostgreSQL</option>
                    <option value="MySQL">MySQL</option>
                    <option value="Oracle">Oracle</option>
                    <option value="SQLServer">SQL Server</option>
                    <option value="MongoDB">MongoDB</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Port</label>
                  <input
                    type="number"
                    value={newTeamDbPort}
                    onChange={e => setNewTeamDbPort(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Host / IP *</label>
                  <input
                    type="text"
                    required
                    placeholder="localhost or 10.0.0.12"
                    value={newTeamDbHost}
                    onChange={e => setNewTeamDbHost(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Database Name</label>
                  <input
                    type="text"
                    placeholder="e.g. settlements_db"
                    value={newTeamDbDatabaseName}
                    onChange={e => setNewTeamDbDatabaseName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Username</label>
                  <input
                    type="text"
                    placeholder="e.g. ops_user"
                    value={newTeamDbUsername}
                    onChange={e => setNewTeamDbUsername(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newTeamDbPassword}
                    onChange={e => setNewTeamDbPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Operational purpose, reconciliation schedule, or contact info..."
                  value={newTeamDbDescription}
                  onChange={e => setNewTeamDbDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] font-sans"
                />
              </div>

              {/* Socket Test Feedback */}
              {teamDbTestResult && (
                <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between font-sans ${
                  teamDbTestResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <div className="flex items-center space-x-1.5">
                    {teamDbTestResult.success ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-rose-600" />}
                    <span>{teamDbTestResult.message}</span>
                  </div>
                  {teamDbTestResult.pingMs && (
                    <span className="font-mono text-[10px] font-bold">{teamDbTestResult.pingMs}ms</span>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleTestTeamDbConnection}
                  disabled={isTestingTeamDb || !newTeamDbHost.trim()}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center space-x-1 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isTestingTeamDb ? 'animate-spin' : ''} />
                  <span>{isTestingTeamDb ? 'Testing...' : 'Test Connection'}</span>
                </button>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddTeamDbModal(false);
                      setTeamDbTestResult(null);
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingTeamDb}
                    className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-bold rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingTeamDb ? 'Saving...' : 'Save Connection'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REQUEST SYSTEM-WIDE PROMOTION */}
      {promotingDb && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <ArrowUpRight size={16} className="text-[#155DFC]" />
                <h3 className="text-sm font-bold text-slate-900">Request System-Wide Resource Promotion</h3>
              </div>
              <button onClick={() => setPromotingDb(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex justify-between font-bold text-slate-800">
                <span>{promotingDb.name}</span>
                <span className="text-slate-500 font-normal">{promotingDb.type}</span>
              </div>
              <p className="text-[11px] text-slate-500 font-sans">
                Host: {promotingDb.host}:{promotingDb.port} • Currently isolated to {currentTeam?.name}
              </p>
            </div>

            <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
              Submitting this request will dispatch an operational notification to <strong>Workspace Admins</strong> via the dedicated <strong>Team Resources Monitor</strong> in the sidebar. Once approved, this connection will become globally accessible across all teams.
            </p>

            {promotionError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-1.5 font-sans">
                <AlertCircle size={14} className="text-rose-600 shrink-0" />
                <span>{promotionError}</span>
              </div>
            )}

            <form onSubmit={handleRequestPromotionSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Justification / Operational Purpose *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this connection should be promoted globally (e.g. Cross-team AIB settlement reconciliation requirement)..."
                  value={promotionNotes}
                  onChange={e => setPromotionNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] font-sans"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPromotingDb(null)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPromotion || !promotionNotes.trim()}
                  className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-bold rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingPromotion ? 'Submitting...' : 'Submit to Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD LIBRARY QUERY TEMPLATE */}
      {showAddTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <BookOpen size={16} className="text-[#155DFC]" />
                <h3 className="text-sm font-bold text-slate-900">Save Query Template to Library</h3>
              </div>
              <button onClick={() => setShowAddTemplateModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddTemplateSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Template Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unreconciled Terminal Batch Audit"
                  value={newTemplateTitle}
                  onChange={e => setNewTemplateTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Category</label>
                  <select
                    value={newTemplateCategory}
                    onChange={e => setNewTemplateCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC]"
                  >
                    <option value="Reconciliation">Reconciliation</option>
                    <option value="Staging & Feed">Staging & Feed</option>
                    <option value="Risk & Audit">Risk & Audit</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Target Database</label>
                  <input
                    type="text"
                    placeholder="e.g. Core Banking CBS"
                    value={newTemplateDb}
                    onChange={e => setNewTemplateDb(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="What does this query do, when should it be run, and what tables does it touch?"
                  value={newTemplateDesc}
                  onChange={e => setNewTemplateDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">SQL Query Statement *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="SELECT * FROM ... WHERE ..."
                  value={newTemplateSql}
                  onChange={e => setNewTemplateSql(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-emerald-400 font-mono rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#155DFC]"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddTemplateModal(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-bold rounded-lg transition-all shadow-xs cursor-pointer"
                >
                  Save to Library
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
