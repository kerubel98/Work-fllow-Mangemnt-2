/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { 
  User, Issue, HashtagPreset, Plugin, DatabaseConnection, 
  Transaction, ChatMessage, EnvironmentSystem, QueryApprovalRequest, 
  DbAccessRequest, ConnectionUsageLog, UserRole, Team, TeamTask, TeamInsight, TeamDiscussionMessage, AppNotification, DirectMessage
} from './types';
import { 
  INITIAL_USERS, INITIAL_HASHTAGS, INITIAL_PLUGINS, 
  INITIAL_DBS, TRANSACTION_ARCHIVE, INITIAL_ISSUES, INITIAL_SYSTEMS, INITIAL_TEAMS,
  INITIAL_TEAM_TASKS, INITIAL_TEAM_INSIGHTS, INITIAL_TEAM_MESSAGES, INITIAL_NOTIFICATIONS, INITIAL_DIRECT_MESSAGES
} from './mockData';
import { api } from './api/client';
import TitleBar from './components/TitleBar';
import LoginScreen from './components/LoginScreen';
import SideNav from './components/SideNav';
import ErrorBoundary from './components/ErrorBoundary';
import MessageModal from './components/common/MessageModal';
import { ShieldAlert } from 'lucide-react';
import { getUserAdminCapabilities } from './utils/adminCapabilities';

import { usePersistentState } from './hooks/usePersistentState';

// Code-split dynamic route panels
const IssueDetailView = lazy(() => import('./components/IssueDetailView'));
const TeamWorkspace = lazy(() => import('./components/TeamWorkspace'));
const PersonalChat = lazy(() => import('./components/PersonalChat'));
const DbQueryTool = lazy(() => import('./components/DbQueryTool'));
const IssueCreator = lazy(() => import('./components/IssueCreator'));
const ManagerialDashboard = lazy(() => import('./components/ManagerialDashboard'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const WorkspaceSettings = lazy(() => import('./components/WorkspaceSettings'));
const SystemSettings = lazy(() => import('./components/settings/SystemSettings'));
const AdminTeamResourcesMonitor = lazy(() => import('./components/AdminTeamResourcesMonitor'));

function PanelLoadingSkeleton() {
  return (
    <div className="w-full h-96 flex flex-col items-center justify-center gap-3 p-8 bg-white/50 rounded-2xl border border-slate-200/80 animate-pulse">
      <div className="w-9 h-9 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold text-slate-500 tracking-wide">Loading workspace view...</span>
    </div>
  );
}

const serializeIssues = (data: Issue[]) => {
  if (!Array.isArray(data)) return data;
  return data.map(i => {
    const { firstLevelMappedData, queryResults, ...lightweightIssue } = i;
    return lightweightIssue;
  });
};

export default function App() {
  // 1. Core State Engine (safely persisted with usePersistentState)
  const [users, setUsers] = usePersistentState<User[]>('it_users', INITIAL_USERS);
  const [currentUser, setCurrentUser] = usePersistentState<User | null>('it_session', null);
  const [issues, setIssues] = usePersistentState<Issue[]>('it_issues', INITIAL_ISSUES, serializeIssues);
  const [hashtags, setHashtags] = usePersistentState<HashtagPreset[]>('it_hashtags', INITIAL_HASHTAGS);
  const [plugins, setPlugins] = usePersistentState<Plugin[]>('it_plugins', INITIAL_PLUGINS);
  const [databases, setDatabases] = usePersistentState<DatabaseConnection[]>('it_databases', []);
  const [systems, setSystems] = usePersistentState<EnvironmentSystem[]>('it_systems', INITIAL_SYSTEMS);
  const [teams, setTeams] = usePersistentState<Team[]>('it_teams', INITIAL_TEAMS);
  const [teamTasks, setTeamTasks] = usePersistentState<TeamTask[]>('it_team_tasks', INITIAL_TEAM_TASKS);
  const [teamInsights, setTeamInsights] = usePersistentState<TeamInsight[]>('it_team_insights', INITIAL_TEAM_INSIGHTS);
  const [teamMessages, setTeamMessages] = usePersistentState<TeamDiscussionMessage[]>('it_team_messages', INITIAL_TEAM_MESSAGES);
  const [notifications, setNotifications] = usePersistentState<AppNotification[]>('it_notifications', INITIAL_NOTIFICATIONS);
  const [directMessages, setDirectMessages] = usePersistentState<DirectMessage[]>('it_direct_messages', INITIAL_DIRECT_MESSAGES);

  // Deep-linking target states for Notifications & Navigation
  const [deepLinkTeamId, setDeepLinkTeamId] = useState<string | null>(null);
  const [deepLinkTeamTab, setDeepLinkTeamTab] = useState<'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights' | 'team_settings' | 'approvals' | 'grants' | 'ai-strategy' | 'relationships' | null>(null);
  const [deepLinkTaskId, setDeepLinkTaskId] = useState<string | null>(null);
  const [deepLinkIssueId, setDeepLinkIssueId] = useState<string | null>(null);
  const [deepLinkDirectUserId, setDeepLinkDirectUserId] = useState<string | null>(null);

  const [activeTeamName, setActiveTeamName] = useState<string | null>(null);
  const [createTeamSignal, setCreateTeamSignal] = useState(0);

  const handleTriggerCreateTeam = () => {
    setActiveNavigation('team_workspace');
    setCreateTeamSignal(prev => prev + 1);
  };

  const [queryApprovals, setQueryApprovals] = usePersistentState<QueryApprovalRequest[]>('it_query_approvals', [
    {
      id: 'qreq-1',
      systemId: 'sys-2',
      systemName: 'Back End Settlement Engine',
      environment: 'production',
      tableName: 'sv_fin_tab',
      query: "UPDATE sv_fin_tab SET settlement_status = 'RECONCILED' WHERE ext_ref = 'TXN-9021';",
      requesterId: 'usr-3',
      requesterName: 'tech_sarah',
      requesterRole: 'technical',
      status: 'pending',
      requestDate: '2026-07-11T08:15:00Z',
      issueId: 'ISS-101',
      issueTitle: 'Duplicate auth charges on Amazon cardholders'
    }
  ]);

  const [dbAccessRequests, setDbAccessRequests] = usePersistentState<DbAccessRequest[]>('it_db_access_requests', [
    {
      id: 'dbreq-1',
      userId: 'usr-2',
      username: 'ops_john',
      userRole: 'operational',
      dbId: 'db-1',
      dbName: 'Core Retail Banking DB',
      requestedPrivilege: 'SELECT',
      reason: 'Need read access for checking card discrepancy settlement records',
      status: 'pending',
      requestDate: '2026-07-24T10:15:00Z'
    }
  ]);

  const [connectionUsageLogs, setConnectionUsageLogs] = usePersistentState<ConnectionUsageLog[]>('it_connection_usage_logs', [
    {
      id: 'log-1',
      userId: 'usr-2',
      username: 'ops_john',
      userRole: 'operational',
      dbId: 'db-1',
      dbName: 'Core Retail Banking DB',
      queryType: 'SELECT',
      queryText: 'SELECT id, ext_ref, amt, status FROM sv_fin_tab WHERE txn_date >= CURRENT_DATE - 1 LIMIT 50;',
      timestamp: '2026-07-24T10:30:00Z',
      durationMs: 42,
      status: 'success'
    }
  ]);

  const [transactions] = useState<Transaction[]>(TRANSACTION_ARCHIVE);

  // Helper State to link a transaction directly into the issue creator
  const [activeTransactionForLinking, setActiveTransactionForLinking] = useState<Transaction | null>(null);

  // Active view navigation
  const [activeNavigation, setActiveNavigation] = useState<string>('workspace');
  const [workspaceSubView, setWorkspaceSubView] = useState<'sandbox' | 'investigation' | 'open_case'>('sandbox');
  const [adminPanelSubTab, setAdminPanelSubTab] = useState<'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins'>('analytics');
  const [systemSettingsTab, setSystemSettingsTab] = useState<'dictionary' | 'connections' | 'environment'>('dictionary');

  const handleSelectNavigation = (tab: string, subTab?: any) => {
    if (tab === 'system_settings') {
      if (subTab === 'connections' || subTab === 'dictionary' || subTab === 'environment') {
        setSystemSettingsTab(subTab);
      }
      setActiveNavigation('system_settings');
      return;
    }
    if (tab === 'txn_settings') {
      setSystemSettingsTab('dictionary');
      setActiveNavigation('system_settings');
      return;
    }
    if (subTab) {
      setAdminPanelSubTab(subTab);
    }
    setActiveNavigation(tab);
  };

  // Two-stage state hydration: prioritize workspace essentials first, then load collaboration/audit secondary data
  useEffect(() => {
    let isMounted = true;

    const hydrateFromBackend = async () => {
      try {
        // Stage 1: Critical Workspace Entities (renders the active view immediately)
        const [
          fetchedUsers,
          fetchedIssues,
          fetchedDatabases,
          fetchedSystems,
          fetchedTeams,
          fetchedHashtags
        ] = await Promise.allSettled([
          api.getUsers(),
          api.getIssues(currentUser?.id),
          api.getDatabases(),
          api.getSystems(),
          api.getTeams(),
          api.getHashtags()
        ]);

        if (!isMounted) return;

        if (fetchedUsers.status === 'fulfilled' && Array.isArray(fetchedUsers.value) && fetchedUsers.value.length > 0) {
          setUsers(fetchedUsers.value);
        }
        if (fetchedIssues.status === 'fulfilled' && Array.isArray(fetchedIssues.value) && fetchedIssues.value.length > 0) {
          setIssues(fetchedIssues.value);
        }
        if (fetchedDatabases.status === 'fulfilled' && Array.isArray(fetchedDatabases.value)) {
          setDatabases(fetchedDatabases.value);
        }
        if (fetchedSystems.status === 'fulfilled' && Array.isArray(fetchedSystems.value) && fetchedSystems.value.length > 0) {
          setSystems(fetchedSystems.value);
        }
        if (fetchedTeams.status === 'fulfilled' && Array.isArray(fetchedTeams.value) && fetchedTeams.value.length > 0) {
          setTeams(fetchedTeams.value);
        }
        if (fetchedHashtags.status === 'fulfilled' && Array.isArray(fetchedHashtags.value) && fetchedHashtags.value.length > 0) {
          setHashtags(fetchedHashtags.value);
        }

        // Stage 2: Secondary / Collaboration Data (yields to render loop before fetching)
        setTimeout(async () => {
          if (!isMounted) return;
          try {
            const [
              fetchedTeamTasks,
              fetchedTeamInsights,
              fetchedTeamMessages,
              fetchedDirectMessages,
              fetchedNotifications,
              fetchedApprovals,
              fetchedDbRequests,
              fetchedLogs,
              fetchedPlugins
            ] = await Promise.allSettled([
              api.getTeamTasks(),
              api.getTeamInsights(),
              api.getTeamMessages(),
              api.getDirectMessages(),
              api.getNotifications(),
              api.getQueryApprovals(),
              api.getDbAccessRequests(),
              api.getQueryLogs(),
              api.getPlugins()
            ]);

            if (!isMounted) return;

            if (fetchedTeamTasks.status === 'fulfilled' && Array.isArray(fetchedTeamTasks.value) && fetchedTeamTasks.value.length > 0) {
              setTeamTasks(fetchedTeamTasks.value);
            }
            if (fetchedTeamInsights.status === 'fulfilled' && Array.isArray(fetchedTeamInsights.value) && fetchedTeamInsights.value.length > 0) {
              setTeamInsights(fetchedTeamInsights.value);
            }
            if (fetchedTeamMessages.status === 'fulfilled' && Array.isArray(fetchedTeamMessages.value) && fetchedTeamMessages.value.length > 0) {
              setTeamMessages(fetchedTeamMessages.value);
            }
            if (fetchedDirectMessages.status === 'fulfilled' && Array.isArray(fetchedDirectMessages.value) && fetchedDirectMessages.value.length > 0) {
              setDirectMessages(fetchedDirectMessages.value);
            }
            if (fetchedNotifications.status === 'fulfilled' && Array.isArray(fetchedNotifications.value) && fetchedNotifications.value.length > 0) {
              setNotifications(fetchedNotifications.value);
            }
            if (fetchedApprovals.status === 'fulfilled' && Array.isArray(fetchedApprovals.value) && fetchedApprovals.value.length > 0) {
              setQueryApprovals(fetchedApprovals.value);
            }
            if (fetchedDbRequests.status === 'fulfilled' && Array.isArray(fetchedDbRequests.value) && fetchedDbRequests.value.length > 0) {
              setDbAccessRequests(fetchedDbRequests.value);
            }
            if (fetchedLogs.status === 'fulfilled' && Array.isArray(fetchedLogs.value) && fetchedLogs.value.length > 0) {
              setConnectionUsageLogs(fetchedLogs.value);
            }
            if (fetchedPlugins.status === 'fulfilled' && Array.isArray(fetchedPlugins.value) && fetchedPlugins.value.length > 0) {
              setPlugins(fetchedPlugins.value);
            }
          } catch {
            // Secondary hydration notice
          }
        }, 150);
      } catch (err) {
        console.warn('Backend hydration notice: using localStorage cache fallback:', err);
      }
    };

    hydrateFromBackend();
    return () => { isMounted = false; };
  }, []);

  // Real-time EventSource (SSE) listener for multi-device cross-browser live push
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const setupSSE = () => {
      try {
        const streamUrl = `/api/events${currentUser ? `?userId=${currentUser.id}` : ''}`;
        eventSource = new EventSource(streamUrl);

        eventSource.addEventListener('direct_message:new', (e: MessageEvent) => {
          try {
            const newDM: DirectMessage = JSON.parse(e.data);
            setDirectMessages(prev => {
              if (prev.some(m => m.id === newDM.id)) return prev;
              return [...prev, newDM];
            });
          } catch (err) {
            console.warn('SSE direct_message:new parse error:', err);
          }
        });

        eventSource.addEventListener('notification:new', (e: MessageEvent) => {
          try {
            const notif: AppNotification = JSON.parse(e.data);
            setNotifications(prev => {
              if (prev.some(n => n.id === notif.id)) return prev;
              return [notif, ...prev];
            });
          } catch (err) {
            console.warn('SSE notification:new parse error:', err);
          }
        });

        eventSource.addEventListener('team_message:new', (e: MessageEvent) => {
          try {
            const msg: TeamDiscussionMessage = JSON.parse(e.data);
            setTeamMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          } catch (err) {
            console.warn('SSE team_message:new parse error:', err);
          }
        });

        eventSource.addEventListener('task:created', (e: MessageEvent) => {
          try {
            const task: TeamTask = JSON.parse(e.data);
            setTeamTasks(prev => {
              if (prev.some(t => t.id === task.id)) return prev;
              return [...prev, task];
            });
          } catch (err) {
            console.warn('SSE task:created error:', err);
          }
        });

        eventSource.addEventListener('task:updated', (e: MessageEvent) => {
          try {
            const updatedTask: TeamTask = JSON.parse(e.data);
            setTeamTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
          } catch (err) {
            console.warn('SSE task:updated error:', err);
          }
        });

        eventSource.addEventListener('task:deleted', (e: MessageEvent) => {
          try {
            const { id } = JSON.parse(e.data);
            setTeamTasks(prev => prev.filter(t => t.id !== id));
          } catch (err) {
            console.warn('SSE task:deleted error:', err);
          }
        });

        eventSource.addEventListener('issue:created', (e: MessageEvent) => {
          try {
            const newIssue: Issue = JSON.parse(e.data);
            setIssues(prev => {
              if (prev.some(i => i.id === newIssue.id)) return prev;
              const activeUser = currentUser;
              if (activeUser) {
                const isAdmin = activeUser.role === 'admin';
                const isOwner = newIssue.creatorId === activeUser.id;
                const isAssigned = newIssue.assignedTechUserId === activeUser.id;
                const permTeamId = activeUser.permanentTeamId || teams.find(t => t.teamType === 'permanent' && (t.managerId === activeUser.id || t.memberIds?.includes(activeUser.id)))?.id;
                const isTeamVisible = Boolean((newIssue.visibility === 'TEAM_PUBLIC' || !newIssue.visibility) && permTeamId && newIssue.teamId === permTeamId);
                if (!isAdmin && !isOwner && !isAssigned && !isTeamVisible) {
                  return prev;
                }
              }
              return [newIssue, ...prev];
            });
          } catch (err) {
            console.warn('SSE issue:created error:', err);
          }
        });

        eventSource.addEventListener('issue:updated', (e: MessageEvent) => {
          try {
            const updatedIssue: Issue = JSON.parse(e.data);
            setIssues(prev => prev.map(i => i.id === updatedIssue.id ? updatedIssue : i));
          } catch (err) {
            console.warn('SSE issue:updated error:', err);
          }
        });

        eventSource.addEventListener('issue_chat:new', (e: MessageEvent) => {
          try {
            const { issueId, message } = JSON.parse(e.data);
            setIssues(prev => prev.map(i => {
              if (i.id !== issueId) return i;
              const chatList = i.chat || [];
              if (chatList.some(c => c.id === message.id)) return i;
              return { ...i, chat: [...chatList, message] };
            }));
          } catch (err) {
            console.warn('SSE issue_chat:new error:', err);
          }
        });

        eventSource.onerror = () => {
          eventSource?.close();
          setTimeout(setupSSE, 3000);
        };
      } catch (err) {
        console.warn('Could not establish SSE connection:', err);
      }
    };

    setupSSE();

    return () => {
      eventSource?.close();
    };
  }, [currentUser?.id, teams]);

  // Refresh user-scoped issues whenever the active user changes
  useEffect(() => {
    if (currentUser?.id) {
      api.getIssues(currentUser.id)
        .then(res => {
          if (Array.isArray(res)) setIssues(res);
        })
        .catch(err => console.warn('Could not refresh user issues:', err));
    }
  }, [currentUser?.id]);

  // Direct Personal Chat Handlers
  const handleSendDirectMessage = (receiverId: string, content: string) => {
    if (!currentUser) return;
    const receiver = users.find(u => u.id === receiverId);
    if (!receiver) return;

    const freshDM: DirectMessage = {
      id: `dm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderRole: currentUser.role,
      receiverId: receiver.id,
      receiverName: receiver.username,
      content,
      timestamp: new Date().toISOString(),
      isRead: false
    };

    setDirectMessages(prev => [...prev, freshDM]);
    api.sendDirectMessage({ senderId: currentUser.id, receiverId: receiver.id, content }).catch(err => console.warn('Could not persist DM to API:', err));

    // Send direct notification to recipient
    handleAddNotification({
      userId: receiver.id,
      type: 'chat',
      title: `Direct Message from @${currentUser.username}`,
      message: `@${currentUser.username}: "${content}"`,
      linkTab: 'direct_chat',
      targetDirectUserId: currentUser.id,
      actorName: currentUser.username
    });
  };

  const handleMarkDirectMessagesRead = (senderId: string) => {
    if (!currentUser) return;
    setDirectMessages(prev => prev.map(m => 
      (m.senderId === senderId && m.receiverId === currentUser.id) ? { ...m, isRead: true } : m
    ));
    api.markDirectMessagesRead(senderId, currentUser.id).catch(err => console.warn('Could not mark DMs read on API:', err));
  };

  const handleOpenPersonalChat = (targetUserId: string) => {
    setActiveNavigation('direct_chat');
    setDeepLinkDirectUserId(targetUserId);
  };

  // Notification Deep Linking Handler
  const handleNotificationClick = (notif: AppNotification) => {
    if (!notif.isRead) {
      handleMarkNotificationAsRead(notif.id);
    }

    if (notif.linkTab === 'direct_chat' || notif.targetDirectUserId) {
      setActiveNavigation('direct_chat');
      if (notif.targetDirectUserId) {
        setDeepLinkDirectUserId(notif.targetDirectUserId);
      } else if (notif.actorName) {
        const actor = users.find(u => u.username === notif.actorName);
        if (actor) setDeepLinkDirectUserId(actor.id);
      }
    } else if (notif.linkTab === 'team_workspace' || notif.targetTeamId) {
      setActiveNavigation('team_workspace');
      if (notif.targetTeamId) {
        setDeepLinkTeamId(notif.targetTeamId);
      }
      if (notif.targetSubTab) {
        setDeepLinkTeamTab(notif.targetSubTab as any);
      } else {
        setDeepLinkTeamTab('discussion');
      }
      if (notif.targetTaskId) {
        setDeepLinkTaskId(notif.targetTaskId);
      }
    } else if (notif.linkTab === 'workspace' || notif.targetIssueId) {
      setActiveNavigation('workspace');
      if (notif.targetIssueId) {
        setDeepLinkIssueId(notif.targetIssueId);
      }
    } else if (notif.linkTab) {
      setActiveNavigation(notif.linkTab);
    } else {
      setActiveNavigation('team_workspace');
    }
  };

  // Notification Helper Handlers
  const handleAddNotification = (newNotif: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) => {
    const freshNotif: AppNotification = {
      ...newNotif,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      isRead: false
    };
    setNotifications(prev => [freshNotif, ...prev]);
    api.createNotification(freshNotif).catch(err => console.warn('Could not persist notification to API:', err));
  };

  const handleMarkNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    api.markNotificationRead(id).catch(err => console.warn('Could not mark notification read in API:', err));
  };

  const handleMarkAllNotificationsAsRead = () => {
    if (!currentUser) return;
    setNotifications(prev => prev.map(n => (n.userId === currentUser.id || n.userId === 'all') ? { ...n, isRead: true } : n));
  };

  const handleClearNotifications = () => {
    if (!currentUser) return;
    setNotifications(prev => prev.filter(n => n.userId !== currentUser.id && n.userId !== 'all'));
  };

  // Team Action Handlers
  const handleCreateTeam = (newTeamData: Omit<Team, 'id' | 'createdAt'>) => {
    const freshTeam: Team = {
      ...newTeamData,
      id: `team-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setTeams(prev => [...prev, freshTeam]);
    api.createTeam(freshTeam).catch(err => console.warn('Could not create team in API:', err));

    // Notify initial members
    newTeamData.memberIds.forEach(mId => {
      if (mId !== newTeamData.managerId) {
        handleAddNotification({
          userId: mId,
          type: 'team_added',
          title: `Added to Team: ${freshTeam.name}`,
          message: `@${newTeamData.managerName || 'Team Manager'} added you as a member to team "${freshTeam.name}".`,
          linkTab: 'team_workspace',
          targetTeamId: freshTeam.id,
          actorName: newTeamData.managerName
        });
      }
    });
  };

  const handleUpdateTeam = (teamId: string, updates: Partial<Team>) => {
    setTeams(prev => prev.map(t => {
      if (t.id === teamId) {
        const updated = { ...t, ...updates };
        if (updates.memberIds) {
          const addedMembers = updates.memberIds.filter(mId => !t.memberIds.includes(mId));
          addedMembers.forEach(mId => {
            handleAddNotification({
              userId: mId,
              type: 'team_added',
              title: `Added to Team: ${updated.name}`,
              message: `@${currentUser?.username || 'Team Manager'} added you to team "${updated.name}".`,
              linkTab: 'team_workspace',
              targetTeamId: teamId,
              actorName: currentUser?.username
            });
          });
        }
        return updated;
      }
      return t;
    }));
    api.updateTeam(teamId, updates).catch(err => console.warn('Could not update team in API:', err));
  };

  const handleDeleteTeam = (teamId: string) => {
    setTeams(prev => prev.filter(t => t.id !== teamId));
    api.deleteTeam(teamId).catch(err => console.warn('Could not delete team in API:', err));
  };

  const handleAddTeamTask = (newTaskData: Omit<TeamTask, 'id' | 'createdAt'>) => {
    const freshTask: TeamTask = {
      ...newTaskData,
      id: `ttask-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setTeamTasks(prev => [freshTask, ...prev]);
    api.createTeamTask(freshTask).catch(err => console.warn('Could not create task in API:', err));

    // Notify assigned user
    if (freshTask.assigneeId) {
      handleAddNotification({
        userId: freshTask.assigneeId,
        type: 'task_assigned',
        title: `New Task Assigned: ${freshTask.title}`,
        message: `@${freshTask.creatorName || 'Team Lead'} assigned task "${freshTask.title}" (${freshTask.priority} Priority) to you.`,
        linkTab: 'team_workspace',
        targetTeamId: freshTask.teamId,
        targetTaskId: freshTask.id,
        actorName: freshTask.creatorName
      });
    }
  };

  const handleUpdateTeamTaskStatus = (taskId: string, status: 'To Do' | 'In Progress' | 'Done') => {
    setTeamTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    api.updateTeamTask(taskId, { status }).catch(err => console.warn('Could not update task status in API:', err));
  };

  const handleUpdateTeamTask = (taskId: string, updates: Partial<TeamTask>) => {
    setTeamTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
    api.updateTeamTask(taskId, updates).catch(err => console.warn('Could not update task in API:', err));
  };

  const handleDeleteTeamTask = (taskId: string) => {
    setTeamTasks(prev => prev.filter(t => t.id !== taskId));
    api.deleteTeamTask(taskId).catch(err => console.warn('Could not delete task in API:', err));
  };

  const handleAddTeamInsight = (newInsightData: Omit<TeamInsight, 'id' | 'createdAt'>) => {
    const freshInsight: TeamInsight = {
      ...newInsightData,
      id: `tins-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setTeamInsights(prev => [freshInsight, ...prev]);
    api.createTeamInsight(freshInsight).catch(err => console.warn('Could not create insight in API:', err));
  };

  const handleDeleteTeamInsight = (insightId: string) => {
    setTeamInsights(prev => prev.filter(i => i.id !== insightId));
    api.deleteTeamInsight(insightId).catch(err => console.warn('Could not delete insight in API:', err));
  };

  const handleSendTeamMessage = (msgData: Omit<TeamDiscussionMessage, 'id' | 'timestamp'>) => {
    const freshMsg: TeamDiscussionMessage = {
      ...msgData,
      id: `tmsg-${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    setTeamMessages(prev => [...prev, freshMsg]);
    api.sendTeamMessage(freshMsg).catch(err => console.warn('Could not send team message in API:', err));

    // Send chat notifications to team members or mentioned user
    const targetTeam = teams.find(t => t.id === freshMsg.teamId);
    if (targetTeam) {
      targetTeam.memberIds.forEach(mId => {
        if (mId !== freshMsg.senderId) {
          const isMentioned = freshMsg.content.includes(`@`);
          handleAddNotification({
            userId: mId,
            type: 'chat',
            title: isMentioned ? `New Chat Mention from @${freshMsg.senderName}` : `New Team Chat in ${targetTeam.name}`,
            message: `@${freshMsg.senderName}: "${freshMsg.content}"`,
            linkTab: 'team_workspace',
            targetTeamId: targetTeam.id,
            actorName: freshMsg.senderName
          });
        }
      });
    }
  };

  // Auth Action Handlers
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setActiveNavigation('workspace');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveNavigation('workspace');
  };

  const handleRegisterUser = (newUser: Omit<User, 'id' | 'createdAt'>) => {
    const freshUser: User = {
      ...newUser,
      id: `usr-${Date.now()}`,
      createdAt: new Date().toISOString(),
      canExecuteSelect: true,
      canExecuteUpdate: true
    };
    setUsers(prev => [...prev, freshUser]);
    api.register(newUser.username, newUser.email, newUser.role).catch(err => console.warn('Could not register user in API:', err));
  };

  // User Management & Privilege Handlers
  const handleApproveUser = (userId: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, isApproved: true } : u));
    api.approveUser(userId).catch(err => console.warn('Could not approve user in API:', err));
  };

  const handleDeleteUser = (userId: string) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    api.deleteUser(userId).catch(err => console.warn('Could not delete user in API:', err));
  };

  const handleUpdateUserPrivileges = (
    userId: string, 
    updates: { 
      canExecuteSelect?: boolean; 
      canExecuteUpdate?: boolean; 
      role?: UserRole;
      allowedDbIds?: string[];
    }
  ) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        const updated = { ...u, ...updates };
        if (currentUser && currentUser.id === userId) {
          setCurrentUser(updated);
        }
        return updated;
      }
      return u;
    }));
    api.updateUserRole(userId, updates.role || 'operational', {
      canExecuteSelect: updates.canExecuteSelect,
      canExecuteUpdate: updates.canExecuteUpdate
    }).catch(err => console.warn('Could not update user privileges in API:', err));
  };

  // Database Connection Handlers
  const handleAddDatabase = (newDb: Omit<DatabaseConnection, 'id'>) => {
    const tempId = `db-${Date.now()}`;
    const freshDb: DatabaseConnection = {
      ...newDb,
      id: tempId
    };
    setDatabases(prev => [...prev, freshDb]);
    api.createDatabase(freshDb)
      .then(saved => {
        if (saved && saved.id) {
          setDatabases(prev => prev.map(db => db.id === tempId ? saved : db));
        }
      })
      .catch(err => {
        console.warn('Could not persist database to backend API:', err);
        setDatabases(prev => prev.filter(db => db.id !== tempId));
        alert('Failed to save database connection: ' + (err.message || 'Server error'));
      });
  };

  const handleUpdateDatabase = (dbId: string, updates: Partial<DatabaseConnection>) => {
    setDatabases(prev => prev.map(db => db.id === dbId ? { ...db, ...updates } : db));
    api.updateDatabase(dbId, updates).catch(err => {
      console.warn('Could not update database in backend API:', err);
      alert('Failed to update database connection: ' + (err.message || 'Server error'));
    });
  };

  const handleToggleDbStatus = (dbId: string) => {
    setDatabases(prev => prev.map(db => {
      if (db.id === dbId) {
        const nextStatus = db.status === 'online' ? 'offline' : 'online';
        api.updateDatabase(dbId, { status: nextStatus }).catch(err => console.warn('Could not update DB status in API:', err));
        return { ...db, status: nextStatus };
      }
      return db;
    }));
  };

  const handleDeleteDb = (dbId: string) => {
    setDatabases(prev => prev.filter(db => db.id !== dbId));
    api.deleteDatabase(dbId).catch(err => {
      console.warn('Could not delete database in backend API:', err);
      api.getDatabases().then(dbs => setDatabases(dbs)).catch(() => {});
      alert('Failed to delete database connection: ' + (err.message || 'Server error'));
    });
  };

  // Access Requests & Usage Logs Handlers
  const handleRequestDbAccess = (reqData: Omit<DbAccessRequest, 'id' | 'status' | 'requestDate'>) => {
    const newReq: DbAccessRequest = {
      ...reqData,
      id: `dbreq-${Date.now()}`,
      status: 'pending',
      requestDate: new Date().toISOString()
    };
    setDbAccessRequests(prev => [newReq, ...prev]);
    api.createDbAccessRequest(newReq).catch(err => console.warn('Could not create DB access request in API:', err));
  };

  const handleResolveDbAccessRequest = (id: string, status: 'approved' | 'rejected') => {
    const targetReq = dbAccessRequests.find(r => r.id === id);
    setDbAccessRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    api.resolveDbAccessRequest(id, status).catch(err => console.warn('Could not resolve DB access request in API:', err));

    if (status === 'approved' && targetReq) {
      // Grant the requesting user access to the DB and update privileges
      setUsers(prev => prev.map(u => {
        if (u.id === targetReq.userId) {
          const currentAllowed = u.allowedDbIds || databases.map(d => d.id);
          const newAllowed = Array.from(new Set([...currentAllowed, targetReq.dbId]));
          const grantsUpdate = targetReq.requestedPrivilege === 'UPDATE' || targetReq.requestedPrivilege === 'FULL';
          return {
            ...u,
            allowedDbIds: newAllowed,
            canExecuteSelect: true,
            canExecuteUpdate: grantsUpdate ? true : u.canExecuteUpdate
          };
        }
        return u;
      }));
    }
  };

  const handleLogQueryExecution = (logData: Omit<ConnectionUsageLog, 'id' | 'timestamp'>) => {
    const freshLog: ConnectionUsageLog = {
      ...logData,
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    setConnectionUsageLogs(prev => [freshLog, ...prev]);
  };

  const handleTogglePlugin = (pluginId: string) => {
    setPlugins(prev => prev.map(p => p.id === pluginId ? { ...p, enabled: !p.enabled } : p));
    const target = plugins.find(p => p.id === pluginId);
    api.togglePlugin(pluginId, target ? !target.enabled : true).catch(err => console.warn('Could not toggle plugin in API:', err));
  };

  // Query Approval Handlers
  const handleSubmitQueryApproval = (newReqData: Omit<QueryApprovalRequest, 'id' | 'status' | 'requestDate'>) => {
    const newReq: QueryApprovalRequest = {
      ...newReqData,
      id: `qreq-${Date.now()}`,
      status: 'pending',
      requestDate: new Date().toISOString()
    };
    setQueryApprovals(prev => [newReq, ...prev]);
    api.createQueryApproval(newReq).catch(err => console.warn('Could not create query approval in API:', err));
  };

  const handleResolveQueryApproval = (id: string, status: 'approved' | 'rejected') => {
    setQueryApprovals(prev => prev.map(req => req.id === id ? { ...req, status } : req));
    api.resolveQueryApproval(id, status).catch(err => console.warn('Could not resolve query approval in API:', err));
  };

  // Issue Action Handlers
  const handleUpdateIssue = (issueId: string, updatedFields: Partial<Issue>) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id === issueId) {
        return { ...issue, ...updatedFields };
      }
      return issue;
    }));
    api.updateIssue(issueId, updatedFields).catch(err => console.warn('Could not update issue in API:', err));
  };

  const handleDeleteIssue = (issueId: string) => {
    setIssues(prev => prev.filter(issue => issue.id !== issueId));
    api.deleteIssue(issueId).catch(err => console.warn('Could not delete issue in API:', err));
  };

  const handleCreateIssue = (newIssueData: Omit<Issue, 'id' | 'createdAt' | 'creatorId' | 'creatorName' | 'status'>) => {
    if (!currentUser) return;
    const newId = `ISS-${100 + issues.length + 1}`;
    const freshIssue: Issue = {
      ...newIssueData,
      id: newId,
      status: 'Open',
      creatorId: currentUser.id,
      creatorName: currentUser.username,
      createdAt: new Date().toISOString(),
      chat: []
    };
    setIssues(prev => [freshIssue, ...prev]);
    setDeepLinkIssueId(newId);
    api.createIssue(freshIssue).catch(err => console.warn('Could not create issue in API:', err));
    setActiveNavigation('workspace');
  };

  const handleCreateHashtagPreset = (newPreset: HashtagPreset) => {
    setHashtags(prev => [...prev, newPreset]);
    api.createHashtag(newPreset).catch(err => console.warn('Could not create hashtag in API:', err));
  };

  const handleSendChatMessage = (issueId: string, messageText: string) => {
    if (!currentUser) return;
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderRole: currentUser.role,
      text: messageText,
      timestamp: new Date().toISOString()
    };

    setIssues(prev => prev.map(issue => {
      if (issue.id === issueId) {
        return {
          ...issue,
          chat: [...(issue.chat || []), newMessage]
        };
      }
      return issue;
    }));

    api.postIssueChat(issueId, {
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderRole: currentUser.role,
      text: messageText
    }).catch(err => console.warn('Could not post issue chat in API:', err));
  };

  // Query Tool linking helper
  const handleLinkTransactionToIssue = (txn: Transaction) => {
    setActiveTransactionForLinking(txn);
    setActiveNavigation('create_case');
  };

  const handleClearLinkedTransaction = () => {
    setActiveTransactionForLinking(null);
  };

  // All users at same level with full access
  const effectiveRole: UserRole = currentUser ? currentUser.role : 'admin';

  const effectiveUser: User | null = currentUser ? {
    ...currentUser,
    role: currentUser.role || 'admin',
    canExecuteSelect: true,
    canExecuteUpdate: true,
    isApproved: true
  } : null;

  // Guard navigation against unauthorized role bypasses (honors global admin & delegated team capabilities)
  const isAuthorizedTab = (tab: string) => {
    if (!currentUser) return false;
    const caps = getUserAdminCapabilities(currentUser, teams);
    if (tab === 'admin_panel') {
      return caps.isFullAdmin || caps.canManageConnections || caps.canMonitorConnections || caps.canManageAccessRequests;
    }
    if (tab === 'user_admin') {
      return caps.isFullAdmin || caps.canManageUsers;
    }
    if (tab === 'txn_settings' || tab === 'system_settings') {
      return caps.isFullAdmin || caps.canManageSystems || caps.canManageColumnMapping;
    }
    if (tab === 'admin_team_resources') {
      return caps.isFullAdmin || caps.canManageConnections || caps.canMonitorConnections;
    }
    return true;
  };

  // Count active online connections for titlebar display
  const onlineCount = databases.filter(d => d.status === 'online').length;

  const unreadDirectMessageCount = effectiveUser ? directMessages.filter(
    m => m.receiverId === effectiveUser.id && !m.isRead
  ).length : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans" id="applet-viewport">
      {/* 1. Desktop TitleBar */}
      <TitleBar 
        currentUser={effectiveUser || currentUser} 
        onLogout={handleLogout} 
        onlineCount={onlineCount} 
        activeNavigation={activeNavigation}
        activeTeamName={activeTeamName}
        workspaceSubView={workspaceSubView}
      />

      {/* 2. Primary Layout Switcher */}
      {!currentUser ? (
        <LoginScreen 
          users={users} 
          onLoginSuccess={handleLoginSuccess} 
          onRegisterUser={handleRegisterUser} 
        />
      ) : (
        <div className="flex-grow flex flex-col lg:flex-row" id="app-desktop-workspace">
          
          {/* Left Vertical Native Sidebar Component */}
          <SideNav 
            currentUser={effectiveUser || currentUser} 
            teams={teams}
            activeNavigation={activeNavigation} 
            activeAdminSubTab={adminPanelSubTab}
            onSelectNavigation={handleSelectNavigation} 
            isAuthorizedTab={isAuthorizedTab} 
            onCreateTeamClick={handleTriggerCreateTeam}
            notifications={notifications}
            unreadDirectMessageCount={unreadDirectMessageCount}
            onMarkNotificationAsRead={handleMarkNotificationAsRead}
            onMarkAllNotificationsAsRead={handleMarkAllNotificationsAsRead}
            onClearNotifications={handleClearNotifications}
            onNotificationClick={handleNotificationClick}
          />

          {/* Main Context Dynamic Panel Router */}
          <main className="flex-grow p-2 lg:p-3 overflow-y-auto max-h-[calc(100vh-2.25rem)]">
            <Suspense fallback={<PanelLoadingSkeleton />}>
            {(activeNavigation === 'workspace' || activeNavigation === 'my_tasks' || activeNavigation === 'hashtags' || activeNavigation === 'open_case' || activeNavigation === 'create_case') && (
              <ErrorBoundary fallbackTitle="Workspace Display Error" fallbackMessage="An error occurred while loading the workspace. You can retry rendering or reset settings.">
                <IssueDetailView 
                  issues={issues} 
                  hashtags={hashtags} 
                  currentUser={effectiveUser || currentUser} 
                  systems={systems}
                  users={users}
                  teams={teams}
                  databases={databases}
                  transactions={transactions}
                  queryApprovals={queryApprovals}
                  onSubmitQueryApproval={handleSubmitQueryApproval}
                  onUpdateIssue={handleUpdateIssue} 
                  onDeleteIssue={handleDeleteIssue}
                  onCreateIssue={handleCreateIssue}
                  onCreateHashtagPreset={handleCreateHashtagPreset} 
                  onSendChatMessage={handleSendChatMessage} 
                  onChangeTab={setActiveNavigation}
                  onWorkspaceSubViewChange={setWorkspaceSubView}
                  initialSelectedIssueId={deepLinkIssueId}
                  activeMode={
                    activeNavigation === 'my_tasks'
                      ? 'my_tasks'
                      : activeNavigation === 'hashtags'
                      ? 'hashtags'
                      : (activeNavigation === 'open_case' || activeNavigation === 'create_case')
                      ? 'open_case'
                      : 'workspace'
                  }
                />
              </ErrorBoundary>
            )}

            {activeNavigation === 'team_workspace' && (
              <ErrorBoundary fallbackTitle="Team Workspace Error">
                <TeamWorkspace 
                  currentUser={effectiveUser || currentUser}
                  users={users}
                  teams={teams}
                  databases={databases}
                  tasks={teamTasks}
                  insights={teamInsights}
                  messages={teamMessages}
                  onCreateTeam={handleCreateTeam}
                  onUpdateTeam={handleUpdateTeam}
                  onAddTask={handleAddTeamTask}
                  onUpdateTaskStatus={handleUpdateTeamTaskStatus}
                  onUpdateTask={handleUpdateTeamTask}
                  onDeleteTask={handleDeleteTeamTask}
                  onAddInsight={handleAddTeamInsight}
                  onDeleteInsight={handleDeleteTeamInsight}
                  onSendMessage={handleSendTeamMessage}
                  openCreateModalSignal={createTeamSignal}
                  initialSelectedTeamId={deepLinkTeamId}
                  initialActiveTab={deepLinkTeamTab}
                  initialSelectedTaskId={deepLinkTaskId}
                  onOpenPersonalChat={handleOpenPersonalChat}
                  onActiveTeamChange={setActiveTeamName}
                />
              </ErrorBoundary>
            )}

            {activeNavigation === 'direct_chat' && (
              <PersonalChat 
                currentUser={effectiveUser || currentUser}
                users={users}
                directMessages={directMessages}
                initialSelectedUserId={deepLinkDirectUserId}
                onSendDirectMessage={handleSendDirectMessage}
                onMarkDirectMessagesRead={handleMarkDirectMessagesRead}
                onNavigateToTeamWorkspace={() => setActiveNavigation('team_workspace')}
              />
            )}

            {activeNavigation === 'db_explorer' && isAuthorizedTab('db_explorer') && (
              <DbQueryTool 
                databases={databases} 
                transactions={transactions} 
                currentUser={effectiveUser || currentUser}
                onAddDatabase={handleAddDatabase}
                onRequestDbAccess={handleRequestDbAccess}
                onLogQueryExecution={handleLogQueryExecution}
                onImportToIssue={handleLinkTransactionToIssue} 
              />
            )}

            {activeNavigation === 'create_case' && isAuthorizedTab('create_case') && (
              <IssueCreator 
                hashtags={hashtags} 
                transactions={transactions} 
                currentUser={effectiveUser || currentUser} 
                systems={systems}
                users={users}
                onCreateIssue={handleCreateIssue} 
                activeTransactionForLinking={activeTransactionForLinking}
                onClearLinkedTransaction={handleClearLinkedTransaction}
                onNavigateToWorkspace={() => setActiveNavigation('workspace')}
              />
            )}

            {activeNavigation === 'manager_analytics' && isAuthorizedTab('manager_analytics') && (
              <ManagerialDashboard 
                issues={issues} 
                hashtags={hashtags} 
                currentUser={effectiveUser || currentUser}
                users={users}
                teams={teams}
                onCreateTeam={handleCreateTeam}
                onUpdateTeam={handleUpdateTeam}
                onDeleteTeam={handleDeleteTeam}
                onUpdateIssue={handleUpdateIssue}
                onChangeTab={setActiveNavigation}
              />
            )}

            {activeNavigation === 'admin_panel' && isAuthorizedTab('admin_panel') && (
              <AdminPanel 
                currentUser={effectiveUser || currentUser}
                teams={teams}
                users={users} 
                databases={databases} 
                plugins={plugins} 
                systems={systems}
                queryApprovals={queryApprovals}
                dbAccessRequests={dbAccessRequests}
                connectionUsageLogs={connectionUsageLogs}
                onResolveQueryApproval={handleResolveQueryApproval}
                onResolveDbAccessRequest={handleResolveDbAccessRequest}
                onApproveUser={handleApproveUser} 
                onDeleteUser={handleDeleteUser} 
                onTogglePlugin={handleTogglePlugin} 
                onAddDatabase={handleAddDatabase} 
                onToggleDbStatus={handleToggleDbStatus} 
                onDeleteDb={handleDeleteDb} 
                onUpdateDb={handleUpdateDatabase} 
                onAddSystem={(sys) => setSystems(prev => [...prev, sys])}
                onDeleteSystem={(sysId) => setSystems(prev => prev.filter(s => s.id !== sysId))}
                onUpdateSystem={(updatedSys) => setSystems(prev => prev.map(s => s.id === updatedSys.id ? updatedSys : s))}
                onUpdateUserPrivileges={handleUpdateUserPrivileges}
                activeSubTab={adminPanelSubTab}
                onSelectSubTab={setAdminPanelSubTab}
              />
            )}

            {activeNavigation === 'user_admin' && isAuthorizedTab('user_admin') && (
              <AdminPanel 
                currentUser={effectiveUser || currentUser}
                teams={teams}
                users={users} 
                databases={databases} 
                plugins={plugins} 
                systems={systems}
                queryApprovals={queryApprovals}
                dbAccessRequests={dbAccessRequests}
                connectionUsageLogs={connectionUsageLogs}
                onResolveQueryApproval={handleResolveQueryApproval}
                onResolveDbAccessRequest={handleResolveDbAccessRequest}
                onApproveUser={handleApproveUser} 
                onDeleteUser={handleDeleteUser} 
                onTogglePlugin={handleTogglePlugin} 
                onAddDatabase={handleAddDatabase} 
                onToggleDbStatus={handleToggleDbStatus} 
                onDeleteDb={handleDeleteDb} 
                onUpdateDb={handleUpdateDatabase} 
                onAddSystem={(sys) => setSystems(prev => [...prev, sys])}
                onDeleteSystem={(sysId) => setSystems(prev => prev.filter(s => s.id !== sysId))}
                onUpdateSystem={(updatedSys) => setSystems(prev => prev.map(s => s.id === updatedSys.id ? updatedSys : s))}
                onUpdateUserPrivileges={handleUpdateUserPrivileges}
                activeSubTab="user_admin"
                onSelectSubTab={setAdminPanelSubTab}
              />
            )}

            {(activeNavigation === 'workspace_settings' || activeNavigation === 'setting') && (
              <ErrorBoundary fallbackTitle="Workspace Settings Error" fallbackMessage="Could not display workspace settings. You can retry or reset local settings.">
                <WorkspaceSettings
                  currentUser={effectiveUser || currentUser!}
                  teams={teams}
                  databases={databases}
                  onNavigateToWorkspace={() => setActiveNavigation('workspace')}
                />
              </ErrorBoundary>
            )}

            {activeNavigation === 'system_settings' && isAuthorizedTab('system_settings') && (
              <ErrorBoundary fallbackTitle="System Settings Error" fallbackMessage="Could not display System Settings. You can retry or return to workspace.">
                <SystemSettings
                  currentUser={effectiveUser || currentUser!}
                  teams={teams}
                  databases={databases}
                  systems={systems}
                  onAddDatabase={handleAddDatabase}
                  onToggleDbStatus={handleToggleDbStatus}
                  onDeleteDb={handleDeleteDb}
                  onUpdateDb={handleUpdateDatabase}
                  onNavigateToWorkspace={() => setActiveNavigation('workspace')}
                  initialTab={systemSettingsTab}
                />
              </ErrorBoundary>
            )}

            {activeNavigation === 'admin_team_resources' && isAuthorizedTab('admin_team_resources') && (
              <ErrorBoundary fallbackTitle="Admin Team Resources Monitor Error">
                <AdminTeamResourcesMonitor
                  currentUser={effectiveUser || currentUser!}
                  teams={teams}
                  databases={databases}
                  onRefreshDatabases={() => {
                    api.getDatabases().then(dbs => setDatabases(dbs)).catch(() => {});
                  }}
                  onNavigateToWorkspace={() => setActiveNavigation('workspace')}
                />
              </ErrorBoundary>
            )}

            {activeNavigation === 'txn_settings' && isAuthorizedTab('txn_settings') && (
              <ErrorBoundary fallbackTitle="System Settings Error" fallbackMessage="Could not display System Settings. You can retry or return to workspace.">
                <SystemSettings
                  currentUser={effectiveUser || currentUser!}
                  teams={teams}
                  databases={databases}
                  systems={systems}
                  onAddDatabase={handleAddDatabase}
                  onToggleDbStatus={handleToggleDbStatus}
                  onDeleteDb={handleDeleteDb}
                  onUpdateDb={handleUpdateDatabase}
                  onNavigateToWorkspace={() => setActiveNavigation('workspace')}
                  initialTab="dictionary"
                />
              </ErrorBoundary>
            )}

            {/* Unauthorized Administrative Route Guard Screen */}
            {['admin_panel', 'user_admin', 'txn_settings', 'system_settings', 'admin_team_resources'].includes(activeNavigation) && !isAuthorizedTab(activeNavigation) && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4" id="admin-access-denied-screen">
                <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
                  <ShieldAlert size={32} />
                </div>
                <div className="space-y-1 max-w-md">
                  <h2 className="text-base font-bold text-slate-900">Access Restricted to Administrators</h2>
                  <p className="text-xs text-slate-500 font-sans">
                    Administrative panels (User Administration, System Settings, Global Dictionaries, and Central Team Resource Monitors) require Workspace Administrator authorization.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => setActiveNavigation('workspace')}
                    className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Return to Operations Workspace
                  </button>
                </div>
              </div>
            )}
            </Suspense>
          </main>

        </div>
      )}
      <MessageModal />
    </div>
  );
}
