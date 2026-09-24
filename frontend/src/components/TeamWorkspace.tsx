/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  User, Team, TeamTask, TeamInsight, TeamDiscussionMessage, 
  TeamRelationship, TeamRelationshipType,
  WorkspaceSettingProposal, SettingProposalType, SettingProposalStatus, TeamEscalationTarget,
  DatabaseConnection, AllowedQueryType, MemberPrivilege, TeamAdminPrivileges, WorkflowBundle
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
  BookOpen, Copy, CheckCheck, Search, HardDrive, HelpCircle, FolderPlus, Activity, Table, Shield, Boxes
} from 'lucide-react';

import { TeamHeader } from './team/TeamHeader';
import { TeamOverviewTab } from './team/TeamOverviewTab';
import { TeamMembersTab } from './team/TeamMembersTab';
import { TeamTasksTab } from './team/TeamTasksTab';
import { TeamDiscussionTab } from './team/TeamDiscussionTab';
import { TeamResourcesTab } from './team/TeamResourcesTab';
import { TeamChannelsTab } from './team/TeamChannelsTab';
import { TeamStagedAssetsConsole } from './team/TeamStagedAssetsConsole';

export type TeamSettingsSubTab = 'bundles' | 'approvals' | 'grants' | 'ai-strategy' | 'relationships' | 'db-access' | 'delegated-admin' | 'channels';
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
  initialActiveTab?: 'overview' | 'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights' | 'resources' | 'team_settings' | 'approvals' | 'grants' | 'ai-strategy' | 'relationships' | 'db-access' | 'delegated-admin' | null;
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

  // Filter teams so user ONLY sees groups they are a member of (or manager of, or assigned permanent team):
  const visibleTeams = React.useMemo(() => {
    if (!currentUser) return [];
    return teams.filter(t => {
      const isMember = Array.isArray(t.memberIds) && (
        t.memberIds.includes(currentUser.id) || 
        t.memberIds.includes(currentUser.username)
      );
      const isManager = t.managerId === currentUser.id || t.managerName === currentUser.username;
      const isAssignedPermTeam = Boolean(currentUser.permanentTeamId && currentUser.permanentTeamId === t.id);
      const isAssignedLegacyTeam = Boolean((currentUser as any).teamId && (currentUser as any).teamId === t.id);
      return isMember || isManager || isAssignedPermTeam || isAssignedLegacyTeam;
    });
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

  const isInitialSettingsSubTab = ['approvals', 'grants', 'ai-strategy', 'relationships', 'db-access', 'delegated-admin'].includes(initialActiveTab as any);

  // Active sub-tab state inside Team Workspace
  const [activeTab, setActiveTab] = useState<
    'overview' | 'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights' | 'resources' | 'team_settings' | 'approvals' | 'grants' | 'ai-strategy' | 'relationships' | 'db-access' | 'delegated-admin'
  >(
    isInitialSettingsSubTab ? 'team_settings' : (initialActiveTab === 'insights' ? 'resources' : (initialActiveTab || 'overview'))
  );

  const [resourceSubTab, setResourceSubTab] = useState<ResourceSubTab>(
    initialActiveTab === 'insights' ? 'insights' : 'system-resources'
  );

  const [teamSettingsSubTab, setTeamSettingsSubTab] = useState<TeamSettingsSubTab>(
    isInitialSettingsSubTab ? (initialActiveTab as TeamSettingsSubTab) : 'bundles'
  );

  const isGlobalAdmin = 
    currentUser?.role === 'admin' || 
    (currentUser?.role as any) === 'system_admin' || 
    currentUser?.username?.toLowerCase() === 'admin' || 
    (currentUser?.role as string)?.toLowerCase() === 'administrator';

  // Database Access & Query Governance state for Current Team (Tier 1 Envelope)
  const [selectedDbIds, setSelectedDbIds] = useState<string[]>([]);
  const [selectedQueryTypes, setSelectedQueryTypes] = useState<AllowedQueryType[]>(['SELECT']);
  const [isSavingDbAccess, setIsSavingDbAccess] = useState(false);
  const [dbAccessSuccessMsg, setDbAccessSuccessMsg] = useState<string | null>(null);
  const [dbAccessErrMsg, setDbAccessErrMsg] = useState<string | null>(null);

  // Delegated Admin Privileges state
  const [teamAdminPrivileges, setTeamAdminPrivileges] = useState<TeamAdminPrivileges>({});
  const [isSavingAdminPrivileges, setIsSavingAdminPrivileges] = useState(false);
  const [adminPrivilegesSuccessMsg, setAdminPrivilegesSuccessMsg] = useState<string | null>(null);
  const [adminPrivilegesErrMsg, setAdminPrivilegesErrMsg] = useState<string | null>(null);


  // Team-Specific Database Connections state (Isolated Scope)
  const [teamSpecificDbs, setTeamSpecificDbs] = useState<DatabaseConnection[]>([]);
  const [isLoadingTeamDbs, setIsLoadingTeamDbs] = useState(false);

  // Live socket ping & table inspection monitoring state for team resources
  const [monitoringDbs, setMonitoringDbs] = useState<Record<string, { testing: boolean; pingMs?: number; success?: boolean; message?: string; lastTested?: string }>>({});
  const [isHealthCheckingAll, setIsHealthCheckingAll] = useState(false);
  const [inspectingDbTables, setInspectingDbTables] = useState<{ db: DatabaseConnection; tables: string[]; loading: boolean } | null>(null);

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
      if (['approvals', 'grants', 'ai-strategy', 'relationships', 'db-access', 'delegated-admin'].includes(initialActiveTab)) {
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
      setTeamAdminPrivileges(currentTeam.adminPrivileges || {});
      setAdminPrivilegesSuccessMsg(null);
      setAdminPrivilegesErrMsg(null);
      loadTeamSpecificDbs(currentTeam.id);
    }
  }, [currentTeam?.id, currentTeam?.allowedDbIds, currentTeam?.allowedQueryTypes, currentTeam?.memberPrivileges, currentTeam?.adminPrivileges, loadTeamSpecificDbs]);

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

  const handleSaveDelegatedAdminPrivileges = async () => {
    if (!currentTeam) return;
    setIsSavingAdminPrivileges(true);
    setAdminPrivilegesSuccessMsg(null);
    setAdminPrivilegesErrMsg(null);
    try {
      const res = await api.updateTeamAdminPrivileges(currentTeam.id, teamAdminPrivileges);
      if (onUpdateTeam) {
        onUpdateTeam(currentTeam.id, { adminPrivileges: teamAdminPrivileges });
      }
      setAdminPrivilegesSuccessMsg('Delegated administration privileges updated successfully.');
    } catch (err: any) {
      setAdminPrivilegesErrMsg(err.message || 'Failed to update delegated admin privileges.');
    } finally {
      setIsSavingAdminPrivileges(false);
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

  // Test and ping connection for a single team database
  const handleTestTeamDbPing = async (db: DatabaseConnection) => {
    setMonitoringDbs(prev => ({
      ...prev,
      [db.id]: { testing: true, lastTested: new Date().toLocaleTimeString() }
    }));
    try {
      const res = await api.testConnection({
        dbId: db.id,
        type: db.type,
        host: db.host,
        port: db.port,
        connectionString: db.connectionString,
        databaseName: db.databaseName,
        username: db.username
      });
      setMonitoringDbs(prev => ({
        ...prev,
        [db.id]: {
          testing: false,
          success: res.success,
          pingMs: res.pingMs,
          message: res.message || (res.success ? 'Socket reachable and verified' : 'Socket test failed'),
          lastTested: new Date().toLocaleTimeString()
        }
      }));
      // Update teamSpecificDbs in local state
      setTeamSpecificDbs(prev => prev.map(item => item.id === db.id ? {
        ...item,
        status: res.success ? 'online' : 'offline',
        pingMs: res.pingMs,
        lastTestedAt: new Date().toISOString()
      } : item));
    } catch (err: any) {
      setMonitoringDbs(prev => ({
        ...prev,
        [db.id]: {
          testing: false,
          success: false,
          pingMs: 0,
          message: err.message || 'Connection test failed',
          lastTested: new Date().toLocaleTimeString()
        }
      }));
      setTeamSpecificDbs(prev => prev.map(item => item.id === db.id ? {
        ...item,
        status: 'offline',
        lastTestedAt: new Date().toISOString()
      } : item));
    }
  };

  // Ping all team-scoped database connections concurrently
  const handleHealthCheckAllTeamDbs = async () => {
    if (teamSpecificDbs.length === 0) return;
    setIsHealthCheckingAll(true);
    await Promise.allSettled(teamSpecificDbs.map(db => handleTestTeamDbPing(db)));
    setIsHealthCheckingAll(false);
  };

  // Inspect database tables and schema
  const handleInspectTables = async (db: DatabaseConnection) => {
    setInspectingDbTables({ db, tables: [], loading: true });
    try {
      const res = await api.getDatabaseTables(db.id);
      const tableList = Array.isArray(res) 
        ? res.map((t: any) => typeof t === 'string' ? t : (t.name || t.tableName || '')) 
        : (res?.tables || res?.availableTables || res?.allowedTables || []);
      setInspectingDbTables({ db, tables: tableList.filter(Boolean), loading: false });
    } catch (err) {
      setInspectingDbTables({ db, tables: db.availableTables || db.allowedTables || [], loading: false });
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

  // Workflow Bundles & Team Operational Assets (Layer 2 Governance)
  const [teamBundles, setTeamBundles] = useState<WorkflowBundle[]>([]);
  const [isLoadingBundles, setIsLoadingBundles] = useState(false);
  const [promotingBundleId, setPromotingBundleId] = useState<string | null>(null);
  const [bundleActionMsg, setBundleActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // Fetch Team Governance & Workflow Bundle Data
  const loadGovernanceData = React.useCallback(async () => {
    try {
      const [resPending, resKpis, resGrants, resAi, resSettings, resBundles] = await Promise.all([
        fetch(`/api/resolutions/pending?teamId=${currentTeamId || 'team-cards'}`).then(r => r.json()).catch(() => []),
        fetch(`/api/teams/kpis?teamId=${currentTeamId || 'team-cards'}`).then(r => r.json()).catch(() => null),
        fetch(`/api/teams/grants?teamId=${currentTeamId || 'team-cards'}`).then(r => r.json()).catch(() => []),
        fetch('/api/teams/ai-objectives').then(r => r.json()).catch(() => []),
        api.getWorkspaceSettingProposals({ teamId: currentTeamId || undefined }).catch(() => []),
        api.getWorkflowBundles({ teamId: currentTeamId || undefined }).catch(() => [])
      ]);

      if (Array.isArray(resPending)) setPendingResolutions(resPending);
      if (resKpis && resKpis.inflow) setTeamKpis(resKpis);
      if (Array.isArray(resGrants)) setVisibilityGrants(resGrants);
      if (Array.isArray(resAi)) setAiObjectives(resAi);
      if (Array.isArray(resSettings)) setSettingProposals(resSettings);
      if (Array.isArray(resBundles)) setTeamBundles(resBundles);
    } catch (err: any) {
      console.warn('Failed to load team governance data:', err);
    }
  }, [currentTeamId]);

  React.useEffect(() => {
    loadGovernanceData();
  }, [loadGovernanceData]);

  const handlePromoteBundle = async (bundle: WorkflowBundle) => {
    if (!confirm(`Submit Maker request to promote bundle "${bundle.name}" (${bundle.bundleCode}) to Enterprise scope? This will route to the Operational Authority Center for Checker authorization.`)) {
      return;
    }
    setPromotingBundleId(bundle.id);
    try {
      await api.proposeWorkflowBundlePromotion(bundle.id, 'GLOBAL_ENTERPRISE', currentUser.id, currentUser.name || currentUser.username);
      setBundleActionMsg({
        type: 'success',
        text: `Bundle ${bundle.bundleCode} submitted for Enterprise promotion! Awaiting Checker review in Authority Center.`
      });
      setTimeout(() => setBundleActionMsg(null), 4000);
      await loadGovernanceData();
    } catch (err: any) {
      setBundleActionMsg({ type: 'error', text: err.message || 'Failed to submit bundle for promotion.' });
      setTimeout(() => setBundleActionMsg(null), 4000);
    } finally {
      setPromotingBundleId(null);
    }
  };

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
      memberIds: Array.from(new Set([currentUser.id, ...newTeamMemberIds])),
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


  const allTeamDbs = React.useMemo(() => {
    const globalAllowed = (databases || []).filter(d => currentTeam?.allowedDbIds?.includes(d.id));
    const combined = [...globalAllowed];
    teamSpecificDbs.forEach(td => {
      if (!combined.some(c => c.id === td.id)) {
        combined.push(td);
      }
    });
    return combined;
  }, [databases, currentTeam?.allowedDbIds, teamSpecificDbs]);

  const isGovernanceActive = activeTab === 'team_settings' || ['approvals', 'grants', 'ai-strategy', 'relationships', 'db-access', 'delegated-admin'].includes(activeTab);
  const pendingApprovalsCount = pendingResolutions.length + settingProposals.filter(p => p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'ESCALATED_TO_TARGET_TEAM').length;

  return (
    <div className="flex flex-col gap-2.5 h-[calc(100vh-2.85rem)] min-h-[500px]" id="team-workspace-container">
      {/* 1. TOP HEADER: Single Switcher, Status Badges, 3 High-Value Actions */}
      {currentTeam && (
        <TeamHeader
          currentTeam={currentTeam}
          visibleTeams={visibleTeams}
          currentUser={currentUser}
          onSelectTeam={setSelectedTeamId}
          onCreateTeamClick={() => setShowCreateTeamModal(true)}
          onAddMemberClick={() => setShowAddMemberModal(true)}
          onNewTaskClick={() => setShowAddTaskModal(true)}
          onOpenSettingsClick={() => setActiveTab(isGovernanceActive ? 'overview' : 'team_settings')}
          pendingApprovalsCount={pendingApprovalsCount}
          isSettingsOpen={isGovernanceActive}
        />
      )}

      {/* 2. MAIN WORKSPACE CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto space-y-2.5" id="team-workspace-main">
        {!currentTeam ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 mb-3 border border-blue-100">
              <Users size={28} />
            </div>
            <h3 className="text-base font-bold text-slate-800 font-mono">No Teams Joined Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mt-1.5 leading-relaxed">
              You will only see groups you create or groups where you were added as an authorized member.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateTeamModal(true)}
              className="mt-4 px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              <span>Create Your First Team</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 space-y-2.5">
            {/* Primary 5-Zone Tab Bar (Only displayed for operational team workspace) */}
            {!isGovernanceActive && (
              <div className="h-10 min-h-[40px] px-2.5 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between text-xs font-mono shadow-xs shrink-0 gap-2">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1">
                  {[
                    { id: 'overview', label: 'Overview', icon: BarChart2 },
                    { id: 'members', label: 'Members', icon: Users, count: currentTeamUsers.length },
                    { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: teamTasks.filter(t => t.status !== 'Done').length },
                    { id: 'discussion', label: 'Discussion', icon: MessageSquare, count: teamMessages.length },
                    { id: 'resources', label: 'Resources', icon: Layers, count: allTeamDbs.length }
                  ].map(tab => {
                    const isActive = activeTab === tab.id;
                    const IconComp = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        id={`team-tab-${tab.id}`}
                        type="button"
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'bg-[#155DFC] text-white font-bold shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/90'
                        }`}
                      >
                        <IconComp size={13} />
                        <span>{tab.label}</span>
                        {tab.count !== undefined && tab.count > 0 && (
                          <span className={`ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
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
            )}

            {/* Operational Tabs (5 Core Zones) */}
            {!isGovernanceActive && (
              <div className="flex-1 flex flex-col min-h-0">
                {activeTab === 'overview' && (
                  <TeamOverviewTab
                    currentTeam={currentTeam}
                    teamUsers={currentTeamUsers}
                    teamTasks={teamTasks}
                    teamMessages={teamMessages}
                    teamDatabases={allTeamDbs}
                    currentUser={currentUser}
                    onNavigateTab={(tab) => setActiveTab(tab as any)}
                    onOpenPersonalChat={onOpenPersonalChat}
                    onUpdateTaskStatus={onUpdateTaskStatus}
                  />
                )}

                {activeTab === 'members' && (
                  <TeamMembersTab
                    currentTeam={currentTeam}
                    teamUsers={currentTeamUsers}
                    currentUser={currentUser}
                    onAddMemberClick={() => setShowAddMemberModal(true)}
                    onOpenPersonalChat={onOpenPersonalChat}
                  />
                )}

                {activeTab === 'tasks' && (
                  <TeamTasksTab
                    currentTeam={currentTeam}
                    tasks={teamTasks}
                    teamUsers={currentTeamUsers}
                    currentUser={currentUser}
                    onAddTaskClick={() => setShowAddTaskModal(true)}
                    onUpdateTaskStatus={onUpdateTaskStatus}
                    onDeleteTask={onDeleteTask}
                  />
                )}

                {activeTab === 'discussion' && (
                  <TeamDiscussionTab
                    currentTeam={currentTeam}
                    messages={teamMessages}
                    currentUser={currentUser}
                    onSendMessage={onSendMessage}
                    availableTeams={visibleTeams}
                  />
                )}

                {activeTab === 'resources' && (
                  <TeamResourcesTab
                    currentTeam={currentTeam}
                    teamDatabases={allTeamDbs}
                    libraryTemplates={libraryTemplates}
                    currentUser={currentUser}
                    onAddDatabaseClick={() => setShowAddTeamDbModal(true)}
                    onTestConnection={handleTestTeamDbPing}
                    onInspectTables={handleInspectTables}
                    monitoringDbs={monitoringDbs}
                  />
                )}
              </div>
            )}

      {/* CONSOLIDATED TAB: TEAM SETTINGS (Approvals, Cross-Team, AI Strategy, Org Structure, DB Access, Delegated Admin) */}
      {(activeTab === 'team_settings' || ['approvals', 'grants', 'ai-strategy', 'relationships', 'db-access', 'delegated-admin'].includes(activeTab)) && (
        <div className="space-y-4" id="team-settings-container">
          {/* Team Settings Header with Back Button */}
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

            <button
              type="button"
              id="btn-back-to-workspace"
              onClick={() => setActiveTab('overview')}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-mono font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
            >
              <span>&larr; Back to Workspace</span>
            </button>
          </div>

          {/* Segmented Sub-navigation Bar */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 border border-slate-200 rounded-2xl overflow-x-auto no-scrollbar shadow-2xs" id="team-settings-subnav">
            {[
              {
                id: 'bundles' as TeamSettingsSubTab,
                label: 'Staged Assets & Verification',
                icon: Boxes,
                count: teamBundles.length
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
              },
              {
                id: 'channels' as TeamSettingsSubTab,
                label: 'Channels & Webhooks',
                icon: MessageSquare,
                count: 0
              },
              ...(isGlobalAdmin ? [{
                id: 'delegated-admin' as TeamSettingsSubTab,
                label: 'Admin Privileges',
                icon: Shield,
                count: (currentTeam?.adminPrivileges?.canManageConnections ? 1 : 0) + (currentTeam?.adminPrivileges?.canManageColumnMapping ? 1 : 0)
              }] : [])
            ].map(subTab => {
              const currentActiveSubTab = (activeTab === 'team_settings' ? teamSettingsSubTab : (['bundles', 'approvals', 'grants', 'ai-strategy', 'relationships', 'db-access', 'delegated-admin', 'channels'].includes(activeTab) ? (activeTab === 'approvals' ? 'bundles' : activeTab) : 'bundles'));

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

          {/* SUBTAB 1: WORKFLOW BUNDLES & COMPOSITE ASSETS (Layer 2 Governance) */}
          {((activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'bundles' || (activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'approvals') && (
            <div className="space-y-5 font-mono text-xs" id="team-bundles-container">
              {/* Header Banner */}
              <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-5 text-slate-800 space-y-2 shadow-xs">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-100 text-[#155DFC] border border-blue-200 rounded-xl">
                    <Boxes size={22} />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold tracking-tight text-blue-950 uppercase">
                        Team Workflow Bundles &amp; Composite Assets
                      </h3>
                      <span className="text-[9px] bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                        Layer 2 Governance
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-800/80 font-sans mt-0.5">
                      Deterministic operational bundles linking Flowchart DAGs, Validation Boxes, and DB Table Mappings. Multi-tier promotion adheres to Maker-Checker dual authorization.
                    </p>
                  </div>
                </div>
              </div>

              {/* Hands-On Checker Testing & Staged Assets Console */}
              {currentTeam && (
                <TeamStagedAssetsConsole
                  currentTeam={currentTeam}
                  currentUser={currentUser}
                />
              )}

              {bundleActionMsg && (
                <div className={`p-3 rounded-xl border text-xs font-mono font-medium flex items-center space-x-2 ${
                  bundleActionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  {bundleActionMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{bundleActionMsg.text}</span>
                </div>
              )}

              {/* Workflow Bundles Grid */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-800 text-sm">Published Team Bundles</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold">
                      {teamBundles.length} Bundles
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadGovernanceData()}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                    title="Refresh Bundles"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                {teamBundles.length === 0 ? (
                  <div className="text-center py-10 space-y-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 p-6">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#155DFC] mx-auto shadow-xs">
                      <Boxes size={24} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-800 text-sm">No Workflow Bundles Configured Yet</h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto font-sans">
                        Assemble your Flowchart DAGs and attached Validation Boxes into versioned bundles in Workflow Studio to enable team deployment and enterprise promotion.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teamBundles.map(bundle => (
                      <div 
                        key={bundle.id}
                        className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 space-y-3 hover:border-blue-300 transition-all shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 font-mono font-bold text-[10px] rounded-md">
                                {bundle.bundleCode}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 font-bold">
                                v{bundle.version}
                              </span>
                            </div>
                            <h4 className="font-bold text-slate-900 text-sm mt-1">{bundle.name}</h4>
                            {bundle.description && (
                              <p className="text-[11px] text-slate-600 font-sans mt-0.5 line-clamp-2">
                                {bundle.description}
                              </p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                            bundle.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            bundle.status === 'PENDING_CHECKER_REVIEW' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            bundle.status === 'REJECTED' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            'bg-slate-200 text-slate-700'
                          }`}>
                            {bundle.status}
                          </span>
                        </div>

                        {/* Bundle Metadata Pills */}
                        <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-600">
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">
                            Scope: <strong className="text-slate-800">{bundle.scope}</strong>
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">
                            Boxes: <strong className="text-slate-800">{bundle.validationBoxIds?.length || 0}</strong>
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">
                            DB Checks: <strong className="text-slate-800">{bundle.dbCheckIds?.length || 0}</strong>
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">
                            Maker: <strong className="text-slate-800">{bundle.makerName}</strong>
                          </span>
                        </div>

                        {/* Promotion Actions */}
                        <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                          <div className="text-[10px] text-slate-500 font-mono">
                            {bundle.status === 'APPROVED' && bundle.checkerName && (
                              <span>Authorized by {bundle.checkerName}</span>
                            )}
                          </div>

                          {bundle.scope !== 'GLOBAL_ENTERPRISE' && bundle.status !== 'PENDING_CHECKER_REVIEW' && (
                            <button
                              type="button"
                              disabled={promotingBundleId === bundle.id}
                              onClick={() => handlePromoteBundle(bundle)}
                              className="px-3 py-1 bg-[#155DFC] hover:bg-blue-600 text-white rounded-xl text-xs font-bold font-mono transition cursor-pointer flex items-center space-x-1 shadow-2xs disabled:opacity-50"
                            >
                              <ArrowUpRight size={13} />
                              <span>{promotingBundleId === bundle.id ? 'Submitting...' : 'Promote to Enterprise'}</span>
                            </button>
                          )}

                          {bundle.status === 'PENDING_CHECKER_REVIEW' && (
                            <span className="text-[10px] text-amber-700 font-mono font-bold flex items-center space-x-1">
                              <Clock size={12} />
                              <span>Pending Checker in Authority Center</span>
                            </span>
                          )}

                          {bundle.scope === 'GLOBAL_ENTERPRISE' && bundle.status === 'APPROVED' && (
                            <span className="text-[10px] text-emerald-700 font-mono font-bold flex items-center space-x-1">
                              <ShieldCheck size={12} />
                              <span>Enterprise Active</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
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

          {/* SUBTAB 6: DELEGATED ADMIN PRIVILEGES (ADMIN-ONLY) */}
          {((activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'delegated-admin') && (
            <div className="space-y-5 font-mono text-xs" id="team-settings-delegated-admin-panel">
              {/* Header Banner */}
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-5 text-slate-800 space-y-2 shadow-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl">
                      <Shield size={22} />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-slate-900">Delegated Team Administration Privileges</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold flex items-center gap-1">
                          Admin Delegation
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-sans mt-0.5">
                        Grant full or partial administration capabilities to members of <strong>{currentTeam?.name}</strong>.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    id="btn-save-team-admin-privileges"
                    disabled={isSavingAdminPrivileges}
                    onClick={handleSaveDelegatedAdminPrivileges}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-2 shadow-xs transition-all cursor-pointer shrink-0 self-start md:self-auto"
                  >
                    {isSavingAdminPrivileges ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        <span>Save Privileges</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Notifications */}
                {adminPrivilegesSuccessMsg && (
                  <div className="mt-2 p-2.5 bg-emerald-100/80 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-sans font-medium">
                    <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                    <span>{adminPrivilegesSuccessMsg}</span>
                  </div>
                )}
                {adminPrivilegesErrMsg && (
                  <div className="mt-2 p-2.5 bg-rose-100/80 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-center gap-2 font-sans font-medium">
                    <AlertCircle size={15} className="text-rose-700 shrink-0" />
                    <span>{adminPrivilegesErrMsg}</span>
                  </div>
                )}

                {/* Explanatory Callout */}
                <div className="mt-3 p-3 bg-white/90 border border-indigo-200/60 rounded-xl text-xs text-slate-700 font-sans space-y-1">
                  <p>
                    <strong>Architectural Governance & Separation of Duties:</strong> Database administrators can be delegated monitoring, DB endpoint creation, cross-team allocation, and query approval rights while strictly forbidding operational column mapping. Operational teams are granted column mapping and validation rule authoring on allocated databases.
                  </p>
                </div>
              </div>

              {/* QUICK PRESETS */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Sparkles size={16} className="text-indigo-600" />
                      <span>Role-Based Governance Presets</span>
                    </h4>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Apply recommended privilege envelopes tailored for specialized teams.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setTeamAdminPrivileges({
                        canManageConnections: true,
                        canViewMonitoring: true,
                        canManageAccessRequests: true,
                        canManageColumnMapping: false,
                        canManageUsers: false
                      })}
                      className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Database size={13} />
                      <span>Preset: Database Team (DBA)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeamAdminPrivileges({
                        canManageConnections: false,
                        canViewMonitoring: true,
                        canManageAccessRequests: false,
                        canManageColumnMapping: true,
                        canManageUsers: false
                      })}
                      className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Table size={13} />
                      <span>Preset: Operational Team (Ops)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeamAdminPrivileges({
                        canManageConnections: true,
                        canViewMonitoring: true,
                        canManageAccessRequests: true,
                        canManageColumnMapping: true,
                        canManageUsers: true
                      })}
                      className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer"
                    >
                      Full Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeamAdminPrivileges({
                        canManageConnections: false,
                        canViewMonitoring: false,
                        canManageAccessRequests: false,
                        canManageColumnMapping: false,
                        canManageUsers: false
                      })}
                      className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* GRANULAR PRIVILEGE TOGGLES */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {[
                    {
                      key: 'canManageConnections' as keyof TeamAdminPrivileges,
                      title: 'Manage Database Connections',
                      desc: 'Register physical databases (PostgreSQL, Oracle, MySQL, MongoDB, FTP), manage credentials, discover tables, test pings, and allocate database connections to other teams.',
                      icon: Database,
                      color: 'purple'
                    },
                    {
                      key: 'canViewMonitoring' as keyof TeamAdminPrivileges,
                      title: 'System Analytics & Connection Monitoring',
                      desc: 'Access System Analytics & Health dashboard, live socket tracking, execution distribution charts, and connection usage audit logs.',
                      icon: Activity,
                      color: 'emerald'
                    },
                    {
                      key: 'canManageAccessRequests' as keyof TeamAdminPrivileges,
                      title: 'Respond to System Access & Query Approvals',
                      desc: 'Review and approve/reject pending database access requests (DbAccessRequest) and DML/DDL query execution approvals.',
                      icon: ShieldCheck,
                      color: 'amber'
                    },
                    {
                      key: 'canManageColumnMapping' as keyof TeamAdminPrivileges,
                      title: 'Operational Column Mapping & Rule Builder',
                      desc: 'Configure table column validation rules, Type Groups, semantic row relationships, and global dictionary fields. (Forbidden for pure DB teams).',
                      icon: Table,
                      color: 'blue'
                    },
                    {
                      key: 'canManageUsers' as keyof TeamAdminPrivileges,
                      title: 'User Administration',
                      desc: 'Approve new operator registrations, delete users, and update operator privilege envelopes.',
                      icon: Users,
                      color: 'indigo'
                    }
                  ].map(priv => {
                    const isChecked = Boolean(teamAdminPrivileges[priv.key]);
                    const Icon = priv.icon;

                    return (
                      <div
                        key={priv.key}
                        onClick={() => setTeamAdminPrivileges(prev => ({
                          ...prev,
                          [priv.key]: !prev[priv.key]
                        }))}
                        className={`p-4 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-indigo-50/50 border-indigo-500/80 shadow-xs ring-1 ring-indigo-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                              <Icon size={14} />
                            </div>
                            <span className="font-bold text-slate-900 text-xs">{priv.title}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                            isChecked
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}>
                            {isChecked ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 font-sans leading-relaxed mt-2 pl-6">
                          {priv.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SUBTAB: CHANNELS & WEBHOOKS */}
          {((activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'channels') && (
            <TeamChannelsTab currentTeam={currentTeam} currentUser={currentUser} />
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

      {/* MODAL: INSPECT TABLES & SCHEMA */}
      {inspectingDbTables && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Table size={16} className="text-[#155DFC]" />
                <h3 className="text-sm font-bold text-slate-900 truncate max-w-[320px]">
                  Schema & Tables: {inspectingDbTables.db.name}
                </h3>
              </div>
              <button 
                onClick={() => setInspectingDbTables(null)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 font-sans">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Connection:</span>
                <span className="font-mono font-bold text-slate-800">{inspectingDbTables.db.type} • {inspectingDbTables.db.host}:{inspectingDbTables.db.port}</span>
              </div>
              {inspectingDbTables.db.databaseName && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Database Name:</span>
                  <span className="font-mono font-bold text-slate-800">{inspectingDbTables.db.databaseName}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Isolation Scope:</span>
                <span className="font-bold text-[#155DFC]">Team-Scoped (Private)</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700 text-xs">Discovered Tables ({inspectingDbTables.tables.length})</span>
                <button
                  type="button"
                  onClick={() => handleInspectTables(inspectingDbTables.db)}
                  className="text-[#155DFC] hover:underline text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={11} className={inspectingDbTables.loading ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>

              {inspectingDbTables.loading ? (
                <div className="p-6 text-center text-slate-400 font-sans text-xs">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-[#155DFC]" />
                  Querying database catalog...
                </div>
              ) : inspectingDbTables.tables.length === 0 ? (
                <div className="p-4 text-center text-slate-400 font-sans text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No public tables discovered on this database catalog.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {inspectingDbTables.tables.map(tbl => (
                    <div key={tbl} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200/80 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center space-x-2">
                        <Table size={13} className="text-slate-400" />
                        <span className="font-mono text-slate-800 font-semibold">{tbl}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-blue-50 text-[#155DFC] border border-blue-200">
                        Table
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingDbTables(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
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

      {/* MODAL: INSPECT DATABASE TABLES */}
      {inspectingDbTables && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Table size={16} className="text-[#155DFC]" />
                <h3 className="text-sm font-bold text-slate-900">
                  Tables in {inspectingDbTables.db.name}
                </h3>
              </div>
              <button onClick={() => setInspectingDbTables(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-sans">
                <span>Database: <strong className="text-slate-800 font-mono">{inspectingDbTables.db.databaseName || inspectingDbTables.db.name}</strong></span>
                <span>Type: <strong className="text-slate-800 font-mono">{inspectingDbTables.db.type || 'PostgreSQL'}</strong></span>
              </div>

              {inspectingDbTables.loading ? (
                <div className="p-8 text-center text-slate-400 font-sans flex items-center justify-center space-x-2">
                  <RefreshCw size={14} className="animate-spin text-[#155DFC]" />
                  <span>Discovering tables from database...</span>
                </div>
              ) : inspectingDbTables.tables.length === 0 ? (
                <div className="p-6 text-center text-slate-400 font-sans bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No public user tables discovered in this database.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {inspectingDbTables.tables.map(table => (
                    <div key={table} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-slate-800 hover:bg-blue-50/50 hover:border-blue-200 transition-colors">
                      <span className="font-mono text-xs font-semibold">{table}</span>
                      <span className="text-[10px] text-slate-400 font-sans">Ready for Reconciliation</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setInspectingDbTables(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
          </div>
        )}
      </main>
    </div>
  );
}
