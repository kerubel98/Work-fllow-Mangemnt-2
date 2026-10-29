/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { User, DirectMessage, UserRole, Team, HashtagPreset } from '../types';
import {
  Send, Search, User as UserIcon, MessageSquare, Clock,
  CheckCheck, ShieldCheck, Sparkles, AlertCircle, ArrowLeft,
  Circle, Filter, Users, ChevronRight, Check, Mail, Inbox,
  Paperclip, RefreshCw, ExternalLink, Download, FileText,
  FileSpreadsheet, CornerDownLeft, Shield, Eye, Sliders, Phone,
  Trash2, Play, Plus, X, Globe, Key, Smartphone, LogOut
} from 'lucide-react';
import { api } from '../api/client';
import { SharedAssetChatCard } from './chat/SharedAssetChatCard';
import UnifiedChatInput, { InChatDirectiveType } from './chat/UnifiedChatInput';
import { ProviderLogo } from './common/ProviderLogo';

interface PersonalChatProps {
  currentUser: User;
  users: User[];
  teams?: Team[];
  hashtags?: HashtagPreset[];
  directMessages: DirectMessage[];
  initialSelectedUserId?: string | null;
  onSendDirectMessage: (receiverId: string, content: string) => void;
  onMarkDirectMessagesRead: (senderId: string) => void;
  onNavigateToTeamWorkspace?: () => void;
  onNavigateToTaskCreation?: (initialData?: any) => void;
}

export default function PersonalChat({
  currentUser,
  users = [],
  teams = [],
  hashtags = [],
  directMessages = [],
  initialSelectedUserId,
  onSendDirectMessage,
  onMarkDirectMessagesRead,
  onNavigateToTeamWorkspace,
  onNavigateToTaskCreation,
}: PersonalChatProps) {
  // Filter: 'all' (unified) | 'direct' | providerId / preset
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [selectedConversationType, setSelectedConversationType] = useState<'direct' | 'mailbox'>('direct');

  // ================= Direct Messages State =================
  const availableContacts = users.filter(u => u.id !== currentUser.id);

  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    if (initialSelectedUserId && availableContacts.some(u => u.id === initialSelectedUserId)) {
      return initialSelectedUserId;
    }
    return availableContacts[0]?.id || '';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [messageInput, setMessageInput] = useState('');
  const [directShares, setDirectShares] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ================= Personal Mailbox State =================
  const [mailboxThreads, setMailboxThreads] = useState<any[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [mailboxFilter, setMailboxFilter] = useState<'all' | 'inbound' | 'outbound' | 'unassigned'>('all');
  const [mailboxChannelFilter, setMailboxChannelFilter] = useState<string>('all');
  const [mailboxSearch, setMailboxSearch] = useState('');
  const [loadingMailbox, setLoadingMailbox] = useState(false);
  const [isSyncingMailbox, setIsSyncingMailbox] = useState(false);
  const [mailboxReplyText, setMailboxReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [mailboxFeedback, setMailboxFeedback] = useState<string | null>(null);
  const [mailboxStats, setMailboxStats] = useState({ total: 0, unread: 0 });

  // ================= Enterprise Global & Personal Providers =================
  const [availableGlobalProviders, setAvailableGlobalProviders] = useState<any[]>([]);
  const [toggledOffProviderIds, setToggledOffProviderIds] = useState<Set<string>>(new Set());
  const [userProviders, setUserProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Horizontal Providers & Add Dropdown State
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const providerDropdownRef = useRef<HTMLDivElement>(null);

  // Quick link personal account modal state (Authorization & Consent)
  const [linkingProvider, setLinkingProvider] = useState<any | null>(null);
  const [personalHandleInput, setPersonalHandleInput] = useState('');
  const [isLinkingProvider, setIsLinkingProvider] = useState(false);
  const [linkingFeedback, setLinkingFeedback] = useState<string | null>(null);
  const [oauthBanner, setOauthBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [oauthAuthMode, setOauthAuthMode] = useState<'redirect' | 'manual'>('redirect');

  const adminZohoProvider = availableGlobalProviders.find((p: any) => p.preset === 'ZOHO' || p.name?.toLowerCase().includes('zoho') || p.displayName?.toLowerCase().includes('zoho'));
  const isUserZohoConnected = userProviders.some((p: any) => p.preset === 'ZOHO' || p.name?.toLowerCase().includes('zoho') || p.displayName?.toLowerCase().includes('zoho'));

  // ================= User Contacts & Multi-Channel Identifiers State =================
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [userContacts, setUserContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [isAddingNewContact, setIsAddingNewContact] = useState(false);

  // Form states for new contact
  const [newContactName, setNewContactName] = useState('');
  const [newContactOrg, setNewContactOrg] = useState('');
  const [newContactRole, setNewContactRole] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactNotes, setNewContactNotes] = useState('');
  const [newContactInitialChannel, setNewContactInitialChannel] = useState('email');
  const [newContactInitialIdVal, setNewContactInitialIdVal] = useState('');
  const [isSavingContact, setIsSavingContact] = useState(false);

  // Form states for adding additional identifier to selected contact
  const [additionalChannel, setAdditionalChannel] = useState('whatsapp');
  const [additionalIdVal, setAdditionalIdVal] = useState('');
  const [additionalLabel, setAdditionalLabel] = useState('');
  const [isAddingIdentifier, setIsAddingIdentifier] = useState(false);

  // Close provider dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target as Node)) {
        setShowProviderDropdown(false);
      }
    }
    if (showProviderDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProviderDropdown]);

  // Load user contacts from PostgreSQL
  const loadUserContacts = async () => {
    if (!currentUser?.id) return;
    setLoadingContacts(true);
    try {
      const list = await api.getUserContacts(currentUser.id);
      setUserContacts(Array.isArray(list) ? list : []);
      if (list?.length > 0 && !selectedContactId) {
        setSelectedContactId(list[0].id);
      }
    } catch (err) {
      console.warn('[PersonalChat] Failed to load contacts:', err);
    } finally {
      setLoadingContacts(false);
    }
  };

  // Helper for channel metadata (label, icon, styling)
  const getChannelMeta = (channelStr: string) => {
    const ch = (channelStr || 'email').toLowerCase();
    if (ch === 'teams') {
      return { label: 'Teams', icon: MessageSquare, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
    }
    if (ch === 'whatsapp') {
      return { label: 'WhatsApp', icon: Phone, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    }
    if (ch === 'telegram') {
      return { label: 'Telegram', icon: Send, color: 'text-sky-700 bg-sky-50 border-sky-200' };
    }
    return { label: 'Email', icon: Mail, color: 'text-blue-700 bg-blue-50 border-blue-200' };
  };

  // Load configured global providers from Tier 1 Admin
  const loadGlobalProviders = async () => {
    try {
      const conns = await api.getAvailableAdminOAuth2Connections();
      setAvailableGlobalProviders(Array.isArray(conns) ? conns : []);
    } catch (err) {
      console.warn('[PersonalChat] Failed to load global providers:', err);
    }
  };

  // Load user's connected providers from PostgreSQL
  const loadUserProviders = async () => {
    if (!currentUser?.id) return;
    setLoadingProviders(true);
    try {
      const providers = await api.getMessageProviders({ userId: currentUser.id });
      setUserProviders(Array.isArray(providers) ? providers : []);
    } catch (err) {
      console.warn('[PersonalChat] Failed to load user providers:', err);
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    loadGlobalProviders();
    loadUserProviders();
    loadUserContacts();
  }, [currentUser?.id]);

  useEffect(() => {
    if (linkingProvider && !personalHandleInput) {
      const email = currentUser?.messageProviderSettings?.userEmail || currentUser?.email || '';
      setPersonalHandleInput(email);
    }
  }, [linkingProvider, currentUser]);

  // Check for OAuth 2.0 redirect callback parameters (?oauth_success=zoho, ?oauth_error=..., or direct ?code=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const oauthSuccess = params.get('oauth_success');
      const oauthError = params.get('oauth_error');
      const authCode = params.get('code');
      const authState = params.get('state');

      // If Zoho redirected directly to frontend root with ?code=..., forward to backend callback
      if (authCode && !oauthSuccess) {
        const callbackUrl = `/api/messages/oauth2/callback?code=${encodeURIComponent(authCode)}${authState ? `&state=${encodeURIComponent(authState)}` : ''}`;
        window.location.href = callbackUrl;
        return;
      }

      if (oauthSuccess) {
        setOauthBanner({
          type: 'success',
          message: 'Enterprise Mailbox successfully authenticated via official OAuth 2.0! Live personal mailbox is now synchronized.'
        });
        loadUserProviders();
        handleSyncPersonalMailbox();
        const url = new URL(window.location.href);
        url.searchParams.delete('oauth_success');
        url.searchParams.delete('oauth_error');
        window.history.replaceState({}, document.title, url.toString());
      } else if (oauthError) {
        setOauthBanner({
          type: 'error',
          message: `OAuth 2.0 Authorization Failed: ${oauthError}`
        });
        const url = new URL(window.location.href);
        url.searchParams.delete('oauth_success');
        url.searchParams.delete('oauth_error');
        window.history.replaceState({}, document.title, url.toString());
      }
    } catch (e) {
      console.warn('[PersonalChat] Error parsing OAuth search params:', e);
    }
  }, []);

  // Handler: Create a new contact
  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !currentUser?.id) return;
    setIsSavingContact(true);
    try {
      const res = await api.createUserContact({
        userId: currentUser.id,
        name: newContactName.trim(),
        organization: newContactOrg.trim() || undefined,
        roleOrTitle: newContactRole.trim() || undefined,
        primaryEmail: newContactEmail.trim() || undefined,
        primaryPhone: newContactPhone.trim() || undefined,
        notes: newContactNotes.trim() || undefined,
        initialIdentifier: newContactInitialIdVal.trim() ? {
          channel: newContactInitialChannel,
          identifierValue: newContactInitialIdVal.trim(),
          label: 'Primary'
        } : undefined
      });
      setNewContactName('');
      setNewContactOrg('');
      setNewContactRole('');
      setNewContactEmail('');
      setNewContactPhone('');
      setNewContactNotes('');
      setNewContactInitialIdVal('');
      setIsAddingNewContact(false);
      await loadUserContacts();
      if (res?.id) setSelectedContactId(res.id);
    } catch (err: any) {
      alert(`Could not create contact: ${err.message}`);
    } finally {
      setIsSavingContact(false);
    }
  };

  // Handler: Add additional identifier to selected contact
  const handleAddIdentifier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId || !additionalIdVal.trim()) return;
    setIsAddingIdentifier(true);
    try {
      await api.addContactIdentifier(selectedContactId, {
        channel: additionalChannel,
        identifierValue: additionalIdVal.trim(),
        label: additionalLabel.trim() || additionalChannel.toUpperCase(),
        isPrimary: false
      });
      setAdditionalIdVal('');
      setAdditionalLabel('');
      await loadUserContacts();
    } catch (err: any) {
      alert(`Could not add ID: ${err.message}`);
    } finally {
      setIsAddingIdentifier(false);
    }
  };

  // Handler: Delete contact
  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact and all associated identifiers?')) return;
    try {
      await api.deleteUserContact(contactId);
      setSelectedContactId(null);
      await loadUserContacts();
    } catch (err: any) {
      alert(`Could not delete contact: ${err.message}`);
    }
  };

  // Handler: Delete identifier
  const handleDeleteIdentifier = async (identifierId: string) => {
    if (!confirm('Remove this alternate identifier from the contact?')) return;
    try {
      await api.deleteContactIdentifier(identifierId);
      await loadUserContacts();
    } catch (err: any) {
      alert(`Could not delete identifier: ${err.message}`);
    }
  };

  // Handler: Start genuine OAuth 2.0 consent redirect using Admin-configured provider
  const handleStartOAuthRedirect = (provider: any, emailAddress: string) => {
    const returnUrl = `${window.location.origin}${window.location.pathname}?activeNav=messages`;
    const authorizeUrl = `/api/messages/oauth2/authorize?providerId=${encodeURIComponent(provider.id)}&userId=${encodeURIComponent(currentUser.id)}&userEmail=${encodeURIComponent(emailAddress)}&returnUrl=${encodeURIComponent(returnUrl)}`;
    // Navigate browser to backend OAuth2 gateway which seamlessly redirects using the Admin-configured callback URL
    window.location.href = authorizeUrl;
  };

  // Handler: Link personal account to selected enterprise provider
  const handleLinkPersonalAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingProvider || !personalHandleInput.trim()) return;

    const channel = (linkingProvider.channel || 'email').toLowerCase();
    const address = personalHandleInput.trim();
    const preset = (linkingProvider.providerPreset || '').toUpperCase();
    const isOAuth = preset === 'ZOHO' || 
                    preset === 'GOOGLE_WORKSPACE' || 
                    preset === 'MICROSOFT_365' || 
                    linkingProvider.displayName?.toLowerCase().includes('zoho') ||
                    Boolean(linkingProvider.config?.clientId);

    // OAuth providers (e.g. Zoho Mail) redirect seamlessly via Admin-configured callback
    if (isOAuth) {
      setIsLinkingProvider(true);
      handleStartOAuthRedirect(linkingProvider, address);
      return;
    }

    // Fallback for non-OAuth channels (e.g. WhatsApp, Telegram handle)
    setIsLinkingProvider(true);
    setLinkingFeedback(null);

    const config: Record<string, any> = {
      adminOAuth2ConnectionId: linkingProvider.id,
      providerPreset: linkingProvider.providerPreset,
      address
    };
    if (channel === 'email') {
      config.userEmail = address;
      config.email = address;
    } else if (channel === 'teams') {
      config.teamsEmail = address;
      config.userUpn = address;
    } else if (channel === 'whatsapp') {
      config.phoneNumber = address;
      config.phone = address;
    } else if (channel === 'telegram') {
      config.telegramHandle = address;
      config.username = address;
    }

    try {
      await api.createMessageProvider({
        channel,
        displayName: `${linkingProvider.displayName} (${address})`,
        userId: currentUser.id,
        status: 'ACTIVE',
        createdBy: currentUser.username || currentUser.id,
        config
      });
      setLinkingFeedback(`Connected ${address} to ${linkingProvider.displayName}!`);
      await loadUserProviders();
      handleSyncPersonalMailbox();
      setTimeout(() => {
        setLinkingProvider(null);
        setLinkingFeedback(null);
        setPersonalHandleInput('');
      }, 1200);
    } catch (err: any) {
      alert(`Could not link account: ${err.message}`);
    } finally {
      setIsLinkingProvider(false);
    }
  };


  // Handler: Toggle a provider active status (on/off)
  const handleToggleProviderActive = (provId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setToggledOffProviderIds(prev => {
      const next = new Set(prev);
      if (next.has(provId)) next.delete(provId);
      else next.add(provId);
      return next;
    });
  };

  // Handler: Select provider to filter inbox
  const handleSelectProviderFilter = (prov: any) => {
    const ch = (prov.channel || 'email').toLowerCase();
    if (mailboxChannelFilter === ch) {
      setMailboxChannelFilter('all');
    } else {
      setMailboxChannelFilter(ch);
      // Ensure provider is not toggled off when explicitly selected
      setToggledOffProviderIds(prev => {
        const next = new Set(prev);
        next.delete(prov.id);
        return next;
      });
    }
  };

  // Helper: Calculate incoming data stats & unread badge for a provider
  const getProviderIncomingStats = (prov: any) => {
    const ch = (prov.channel || 'email').toLowerCase();
    const matchingThreads = mailboxThreads.filter(t => (t.channel || 'email').toLowerCase() === ch);
    const unreadCount = matchingThreads.reduce((sum, t) => {
      const unreadMsgs = t.messages?.filter((m: any) => !m.is_read && m.direction === 'inbound')?.length || 0;
      return sum + (t.unread ? 1 : unreadMsgs);
    }, 0);
    return {
      total: matchingThreads.length,
      unread: unreadCount
    };
  };

  // Fetch direct operational asset shares
  useEffect(() => {
    window.scrollTo(0, 0);
    if (currentUser?.id) {
      api.getDirectShares(currentUser.id).then(res => {
        if (res?.shares) setDirectShares(res.shares);
      }).catch(console.warn);
    }
  }, [currentUser?.id]);

  // Sync initialSelectedUserId when changed externally (deep linking)
  useEffect(() => {
    if (initialSelectedUserId && availableContacts.some(u => u.id === initialSelectedUserId)) {
      setSelectedUserId(initialSelectedUserId);
      setSelectedConversationType('direct');
    }
  }, [initialSelectedUserId]);

  // Fetch personal mailbox data (Zoho OAuth 2.0)
  const loadPersonalMailbox = (sync = false) => {
    if (!currentUser?.id) return;
    setLoadingMailbox(true);
    if (sync) setIsSyncingMailbox(true);
    api.getPersonalMailbox(currentUser.id, mailboxFilter, mailboxSearch, sync)
      .then(res => {
        const threads = res?.threads || [];
        setMailboxThreads(threads);
        setMailboxStats({
          total: res?.totalThreads || threads.length,
          unread: res?.unreadCount || 0
        });
        if (!selectedThreadId && threads.length > 0) {
          setSelectedThreadId(threads[0].threadId);
        } else if (selectedThreadId && !threads.some(t => t.threadId === selectedThreadId) && threads.length > 0) {
          setSelectedThreadId(threads[0].threadId);
        }
      })
      .catch(err => {
        console.warn('[PersonalChat] Error fetching personal mailbox:', err);
      })
      .finally(() => {
        setLoadingMailbox(false);
        setIsSyncingMailbox(false);
      });
  };

  const handleSyncPersonalMailbox = async () => {
    if (!currentUser?.id || isSyncingMailbox) return;
    setIsSyncingMailbox(true);
    setLoadingMailbox(true);
    try {
      await api.fetchUserProviderMessages(currentUser.id);
      loadPersonalMailbox(false);
    } catch (err) {
      console.warn('[PersonalChat] Error syncing personal mailbox:', err);
      loadPersonalMailbox(false);
    } finally {
      setIsSyncingMailbox(false);
      setLoadingMailbox(false);
    }
  };

  useEffect(() => {
    loadPersonalMailbox();
  }, [currentUser?.id, mailboxFilter, mailboxSearch]);

  const selectedContact = users.find(u => u.id === selectedUserId);

  // Filter messages between currentUser and selectedUser
  const currentConversation = directMessages.filter(
    m => (m.senderId === currentUser.id && m.receiverId === selectedUserId) ||
      (m.senderId === selectedUserId && m.receiverId === currentUser.id)
  ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Mark unread messages as read when viewing conversation
  useEffect(() => {
    if (selectedUserId && selectedConversationType === 'direct') {
      const hasUnread = directMessages.some(
        m => m.senderId === selectedUserId && m.receiverId === currentUser.id && !m.isRead
      );
      if (hasUnread) {
        onMarkDirectMessagesRead(selectedUserId);
      }
    }
  }, [selectedUserId, directMessages, currentUser.id, selectedConversationType]);

  // Auto scroll to bottom of direct chat
  useEffect(() => {
    if (selectedConversationType === 'direct') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentConversation.length, selectedUserId, selectedConversationType]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !selectedUserId) return;

    onSendDirectMessage(selectedUserId, messageInput.trim());
    setMessageInput('');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Dispatch email reply from Personal Mailbox
  const handleSendMailboxReply = async (thread: any) => {
    if (!mailboxReplyText.trim() || !thread) return;
    setIsSendingReply(true);
    setMailboxFeedback(null);
    try {
      const recipient = thread.participants?.find((p: any) => p.direction === 'inbound')?.address ||
        thread.messages?.[0]?.sender_address ||
        'operations@bank.com';

      const lastMsg = thread.messages?.[thread.messages.length - 1];

      await api.replyToMessage({
        userId: currentUser.id,
        channel: thread.channel || 'email',
        to: recipient,
        subject: thread.subject.startsWith('Re: ') ? thread.subject : `Re: ${thread.subject}`,
        textBody: mailboxReplyText.trim(),
        conversationId: thread.threadId,
        threadId: thread.threadId,
        inReplyToMessageId: lastMsg?.id,
        senderAddress: currentUser.messageProviderSettings?.userEmail || currentUser.email
      });

      setMailboxReplyText('');
      setMailboxFeedback('Reply dispatched successfully via personal OAuth 2.0 connection!');
      loadPersonalMailbox();
    } catch (err: any) {
      setMailboxFeedback(`Failed to send reply: ${err.message}`);
    } finally {
      setIsSendingReply(false);
    }
  };

  const getRoleBadgeColor = (_role: UserRole) => {
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  const formatTimeAgo = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const activeMailboxThread = mailboxThreads.find(t => t.threadId === selectedThreadId);

  // Check if current user has an active authenticated personal connection for Email/Mailbox
  const userMailboxProvider = userProviders.find(p => 
    (p.channel || '').toLowerCase() === 'email' && p.status === 'ACTIVE'
  );
  const isUserMailboxConnected = !!userMailboxProvider;

  // Selected or active enterprise provider definition
  const activeSelectedProvider = availableGlobalProviders.find(p => 
    p.id === channelFilter || p.providerPreset?.toLowerCase() === channelFilter
  ) || availableGlobalProviders[0];

  // Unread count aggregations
  const directUnreadCount = directMessages.filter(
    m => m.receiverId === currentUser.id && !m.isRead
  ).length;

  const mailboxUnreadCount = isUserMailboxConnected
    ? mailboxThreads.reduce((sum, t) => {
        const unreadMsgs = t.messages?.filter((m: any) => !m.is_read && m.direction === 'inbound')?.length || 0;
        return sum + (t.unread ? 1 : unreadMsgs);
      }, 0)
    : 0;

  // Only enterprise providers configured and tested by Tier 1 Admin in PostgreSQL that are not already connected
  const globallyConfiguredDropdownProviders = React.useMemo(() => {
    return availableGlobalProviders.filter(gp => {
      const isActive = gp.status === 'ACTIVE' || !gp.status;
      const isAlreadyConnected = userProviders.some(up => 
        (up.config?.adminOAuth2ConnectionId === gp.id || up.providerPreset === gp.providerPreset) &&
        up.status === 'ACTIVE'
      );
      return isActive && !isAlreadyConnected;
    });
  }, [availableGlobalProviders, userProviders]);

  // Unified conversation feed combining Direct Chats and Zoho Mail Threads
  const unifiedConversations = React.useMemo(() => {
    const list: Array<{
      type: 'direct' | 'mailbox';
      id: string;
      title: string;
      subtitle: string;
      preview: string;
      timestamp: number;
      unreadCount: number;
      raw: any;
      providerPreset?: string;
      channel?: string;
    }> = [];

    // 1. Direct Chats
    if (channelFilter === 'all' || channelFilter === 'direct') {
      for (const contact of availableContacts) {
        const msgs = directMessages.filter(
          m => (m.senderId === currentUser.id && m.receiverId === contact.id) ||
            (m.senderId === contact.id && m.receiverId === currentUser.id)
        );
        const sortedMsgs = [...msgs].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const lastMsg = sortedMsgs[0];
        const unreadCount = msgs.filter(
          m => m.senderId === contact.id && m.receiverId === currentUser.id && !m.isRead
        ).length;
        const timestamp = lastMsg ? new Date(lastMsg.timestamp).getTime() : 0;

        const term = searchTerm.toLowerCase().trim();
        const matchesSearch = !term ||
          contact.username.toLowerCase().includes(term) ||
          (contact.displayName && contact.displayName.toLowerCase().includes(term)) ||
          contact.email.toLowerCase().includes(term) ||
          (lastMsg && lastMsg.content.toLowerCase().includes(term));

        if (matchesSearch) {
          list.push({
            type: 'direct',
            id: contact.id,
            title: contact.displayName || `@${contact.username}`,
            subtitle: contact.role ? `${contact.role.toLowerCase()} • ${contact.email}` : contact.email,
            preview: lastMsg ? lastMsg.content : 'No messages yet',
            timestamp,
            unreadCount,
            raw: contact,
            channel: 'direct'
          });
        }
      }
    }

    // 2. Mailbox Threads (Only populated when personal user connection is authenticated)
    const isMailboxFilter = channelFilter === 'all' || 
                            channelFilter === 'mailbox' || 
                            channelFilter === 'email' ||
                            availableGlobalProviders.some(gp => gp.id === channelFilter || gp.providerPreset?.toLowerCase() === channelFilter);

    if (isUserMailboxConnected && isMailboxFilter) {
      for (const thread of mailboxThreads) {
        const lastMsg = thread.messages?.[thread.messages.length - 1];
        const timestamp = new Date(lastMsg?.created_at || lastMsg?.sent_at || thread.lastMessageAt || 0).getTime();
        const unreadCount = thread.unread ? 1 : (thread.messages?.filter((m: any) => !m.is_read && m.direction === 'inbound')?.length || 0);
        const counterparty = thread.participants?.find((p: any) => p.direction === 'inbound')?.name ||
          thread.participants?.find((p: any) => p.direction === 'inbound')?.address ||
          thread.messages?.[0]?.sender_address ||
          'Counterparty';

        const term = searchTerm.toLowerCase().trim();
        const matchesSearch = !term ||
          (thread.subject && thread.subject.toLowerCase().includes(term)) ||
          counterparty.toLowerCase().includes(term) ||
          (lastMsg && (lastMsg.text_body || '').toLowerCase().includes(term));

        if (matchesSearch) {
          list.push({
            type: 'mailbox',
            id: thread.threadId,
            title: thread.subject || 'No Subject',
            subtitle: counterparty,
            preview: lastMsg?.text_body || thread.snippet || 'No message content',
            timestamp,
            unreadCount,
            raw: thread,
            channel: 'email',
            providerPreset: userMailboxProvider?.providerPreset || 'EMAIL'
          });
        }
      }
    }

    return list.sort((a, b) => {
      if (a.timestamp > 0 && b.timestamp > 0) {
        return b.timestamp - a.timestamp;
      }
      if (a.timestamp > 0) return -1;
      if (b.timestamp > 0) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [availableContacts, directMessages, mailboxThreads, channelFilter, searchTerm, currentUser.id, isUserMailboxConnected, availableGlobalProviders, userMailboxProvider]);

  // Auto-selection synchronization
  useEffect(() => {
    if (unifiedConversations.length > 0) {
      const isCurrentValid = selectedConversationType === 'direct'
        ? unifiedConversations.some(c => c.type === 'direct' && c.id === selectedUserId)
        : unifiedConversations.some(c => c.type === 'mailbox' && c.id === selectedThreadId);

      if (!isCurrentValid) {
        const first = unifiedConversations[0];
        setSelectedConversationType(first.type);
        if (first.type === 'direct') {
          setSelectedUserId(first.id);
        } else {
          setSelectedThreadId(first.id);
        }
      }
    }
  }, [unifiedConversations, selectedConversationType, selectedUserId, selectedThreadId]);

  const handleExecuteChatDirective = (directive: InChatDirectiveType, currentContext: string) => {
    if (directive === 'create-task') {
      if (onNavigateToTaskCreation) {
        onNavigateToTaskCreation({
          title: `Task from Direct Chat with ${selectedContact?.displayName || selectedContact?.username || 'colleague'}`,
          description: currentContext || `Operational coordination notes: ${currentContext}`,
          source: 'DIRECT_CHAT'
        });
      } else {
        alert(`Task Direct Action: Creating task from discussion with @${selectedContact?.username || 'colleague'}.`);
      }
    } else if (directive === 'create-escalate') {
      if (onNavigateToTeamWorkspace) {
        onNavigateToTeamWorkspace();
      } else {
        alert('Incident Escalation: Navigating to Team Escalation Room.');
      }
    } else if (directive === 'create-hashtag' || directive === 'call-hashtag') {
      // Directives automatically insert token
    } else if (directive === 'request-approval') {
      alert('Maker-Checker Proposal: Staged proposal prompt. Enter discrepancy resolution details in this thread.');
    }
  };

  // Helper for rendering circular user avatar
  const renderCircularAvatar = (avatarUrl?: string, name?: string, sizeClass = 'w-8 h-8', borderClass = 'border border-slate-200') => {
    const initials = (name || 'User').trim().substring(0, 2).toUpperCase();
    return (
      <div className={`relative shrink-0 rounded-full overflow-hidden ${sizeClass} ${borderClass} bg-slate-100 flex items-center justify-center shadow-2xs`}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={name || 'Avatar'} className="w-full h-full object-cover rounded-full" />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold font-mono">
            {initials}
          </div>
        )}
      </div>
    );
  };

  const isOAuthConnected = currentUser.messageProviderSettings?.status === 'ACTIVE';
  const personalEmailAddress = currentUser.messageProviderSettings?.userEmail || currentUser.email;

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col p-6 overflow-hidden bg-slate-50/50" id="personal-chat-workspace">

      {/* OAuth 2.0 Return Feedback Banner */}
      {oauthBanner && (
        <div className={`mb-3 p-3 rounded-xl border flex items-center justify-between text-xs font-medium shadow-xs transition-all shrink-0 ${
          oauthBanner.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center space-x-2">
            {oauthBanner.type === 'success' ? (
              <CheckCheck size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            <span>{oauthBanner.message}</span>
          </div>
          <button 
            type="button"
            onClick={() => setOauthBanner(null)} 
            className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Bar: "Messages" title, small circle avatars listed horizontally right along the title, '+' dropdown, and far-right Contacts */}
      <div className="mb-4 flex items-center justify-between gap-3 shrink-0 bg-white border border-slate-200/90 px-4 py-2.5 rounded-xl shadow-2xs">
        {/* Left: Title + Horizontal Avatars (Direct Messages + Zoho Mail + Add (+)) */}
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-bold text-slate-900 tracking-tight shrink-0">Messages</h1>

          <div className="h-4 w-px bg-slate-200 shrink-0" />

          {/* Small horizontal list of configured avatars */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 1. Direct Messages Default Avatar */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => setChannelFilter(prev => prev === 'direct' ? 'all' : 'direct')}
                className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
                  channelFilter === 'direct'
                    ? 'ring-2 ring-[#F27421] ring-offset-1 bg-[#0F142A] text-white scale-105'
                    : 'hover:ring-2 hover:ring-slate-300 ring-1 ring-slate-200 bg-white text-slate-700 hover:scale-105'
                }`}
                title={`Direct Messages • ${directUnreadCount > 0 ? `${directUnreadCount} unread` : 'Direct colleague messages'}. Click to filter`}
              >
                <UserIcon size={13} className={channelFilter === 'direct' ? 'text-white' : 'text-slate-600'} />
                {directUnreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-[#F27421] text-white text-[7px] font-bold rounded-full border border-white flex items-center justify-center shadow-xs">
                    {directUnreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* 2. Dynamically Configured Enterprise Provider Avatars from PostgreSQL */}
            {availableGlobalProviders.map((gp) => {
              const preset = (gp.providerPreset || 'CUSTOM').toUpperCase();
              const userProvider = userProviders.find(p => 
                (p.config?.adminOAuth2ConnectionId === gp.id || p.providerPreset === gp.providerPreset) &&
                p.status === 'ACTIVE'
              );
              const isConnected = !!userProvider;
              const isSelected = channelFilter === gp.id || channelFilter === preset.toLowerCase();

              return (
                <div key={gp.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isConnected) {
                        setLinkingProvider(gp);
                        setPersonalHandleInput(currentUser.email || '');
                      } else {
                        setChannelFilter(prev => prev === gp.id ? 'all' : gp.id);
                      }
                    }}
                    className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
                      isSelected
                        ? 'ring-2 ring-[#F27421] ring-offset-1 bg-white scale-105'
                        : 'hover:ring-2 hover:ring-slate-300 ring-1 ring-slate-200 bg-white hover:scale-105'
                    }`}
                    title={
                      isConnected
                        ? `${gp.displayName} • Connected & Active. Click to filter`
                        : `${gp.displayName} • Account not authenticated yet. Click to authenticate`
                    }
                  >
                    <ProviderLogo
                      preset={preset}
                      channel={gp.channel}
                      logoUrl={gp.logoUrl}
                      size={16}
                    />
                    {isConnected && mailboxUnreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-[#F27421] text-white text-[7px] font-bold rounded-full border border-white flex items-center justify-center shadow-xs">
                        {mailboxUnreadCount}
                      </span>
                    )}
                    {!isConnected && (
                      <span
                        className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white shadow-xs"
                        title="Account not authenticated yet. Click to sign in"
                      />
                    )}
                  </button>
                </div>
              );
            })}

            {/* 3. Add button (+) with dropdown of ONLY globally configured providers by Admin */}
            <div className="relative" ref={providerDropdownRef}>
              <button
                type="button"
                onClick={() => setShowProviderDropdown(prev => !prev)}
                className={`w-7 h-7 rounded-full border border-dashed flex items-center justify-center transition shadow-2xs cursor-pointer ${
                  showProviderDropdown
                    ? 'border-[#F27421] bg-orange-50 text-[#F27421]'
                    : 'border-slate-300 hover:border-[#F27421] hover:bg-orange-50/60 text-slate-500 hover:text-[#F27421]'
                }`}
                title="Add account from globally configured enterprise gateways"
              >
                <Plus size={13} />
              </button>

              {/* Dropdown: ONLY globally configured providers by Admin */}
              {showProviderDropdown && (
                <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-2 text-xs animate-in fade-in slide-in-from-top-1">
                  <div className="px-2.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900 text-xs">Globally Configured Providers</p>
                      <p className="text-[10px] text-slate-400">Pre-authorized enterprise connections</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProviderDropdown(false)}
                      className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div className="py-1 max-h-64 overflow-y-auto divide-y divide-slate-50">
                    {availableGlobalProviders.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-xs space-y-1.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                          <Globe size={14} />
                        </div>
                        <p className="font-semibold text-slate-800">No Enterprise Gateways Configured</p>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          A system administrator must first configure and test corporate OAuth 2.0 connections (e.g. Microsoft 365, Google Workspace, Zoho) in <strong>Admin Hub &gt; Connections</strong>.
                        </p>
                      </div>
                    ) : globallyConfiguredDropdownProviders.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-xs space-y-1.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-emerald-600">
                          <Check size={14} />
                        </div>
                        <p className="font-semibold text-slate-800">All Configured Gateways Connected</p>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          All {availableGlobalProviders.length} enterprise provider(s) configured in Admin Hub are connected and active in your header.
                        </p>
                      </div>
                    ) : (
                      globallyConfiguredDropdownProviders.map(gp => {
                        const ch = (gp.channel || 'email').toLowerCase();
                        return (
                          <div
                            key={gp.id}
                            className="p-2 hover:bg-slate-50 rounded-lg flex items-center justify-between transition gap-2"
                          >
                            <div className="flex items-center space-x-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                                <ProviderLogo
                                  preset={gp.providerPreset}
                                  channel={gp.channel}
                                  logoUrl={gp.logoUrl}
                                  size={16}
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate text-xs">{gp.displayName}</p>
                                <p className="text-[10px] text-slate-400 capitalize">{ch} • Enterprise OAuth 2.0</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setShowProviderDropdown(false);
                                setLinkingProvider(gp);
                                setPersonalHandleInput('');
                              }}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#0F142A] hover:bg-slate-800 text-white shadow-2xs transition cursor-pointer shrink-0"
                            >
                              Authorize
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right end of horizontal display: Only Contacts button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowContactsModal(true)}
            className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs bg-white border-slate-200 text-slate-700 hover:border-[#F27421] hover:text-[#F27421]"
            title="Manage unified contacts and multi-channel alternate IDs"
          >
            <Users size={13} className="text-[#F27421]" />
            <span>Contacts</span>
            {userContacts.length > 0 && (
              <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-full font-mono">
                {userContacts.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ================= UNIFIED TWO-PANE WORKSPACE ================= */}
      <div className="flex-1 bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden flex flex-col lg:flex-row min-h-0">

        {/* Left Column: Unified Conversation Feed & Search */}
        <div className="w-full lg:w-84 border-r border-slate-200 bg-slate-50/40 flex flex-col shrink-0 min-h-0">
          {/* Search & Filter Header */}
          <div className="p-3 border-b border-slate-200 bg-white space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-slate-800">
                  {channelFilter === 'all' 
                    ? 'All Conversations' 
                    : channelFilter === 'direct' 
                    ? 'Direct Messages' 
                    : (availableGlobalProviders.find(p => p.id === channelFilter)?.displayName || 'Enterprise Mailbox')}
                </span>
                <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 font-mono text-[9px] rounded font-bold">
                  {unifiedConversations.length}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSyncPersonalMailbox}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title="Sync and refresh mailbox"
              >
                <RefreshCw size={12} className={(loadingMailbox || isSyncingMailbox) ? 'animate-spin text-[#F27421]' : ''} />
              </button>
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search messages, contacts, subjects..."
                className="w-full pl-8 pr-7 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421] bg-slate-50 focus:bg-white"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Active Pill Indicator */}
            {channelFilter !== 'all' && (
              <div className="flex items-center justify-between px-2 py-1 rounded bg-orange-50/80 border border-orange-200 text-[10px] text-orange-900">
                <span className="flex items-center gap-1 font-medium">
                  <Filter size={10} className="text-[#F27421]" />
                  <span>Filtered by: <strong>{channelFilter === 'direct' ? 'Direct Chat' : (availableGlobalProviders.find(p => p.id === channelFilter)?.displayName || 'Enterprise Mailbox')}</strong></span>
                </span>
                <button
                  type="button"
                  onClick={() => setChannelFilter('all')}
                  className="text-[#F27421] hover:text-orange-900 font-bold hover:underline cursor-pointer"
                >
                  Show all
                </button>
              </div>
            )}
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0">
            {channelFilter !== 'all' && channelFilter !== 'direct' && !isUserMailboxConnected ? (
              <div className="p-6 text-center text-slate-500 text-xs space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                  <AlertCircle size={20} />
                </div>
                <p className="font-bold text-slate-800">
                  {activeSelectedProvider ? `${activeSelectedProvider.displayName} Not Connected` : 'Mailbox Not Connected'}
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Authenticate your personal user account to view {activeSelectedProvider?.displayName || 'mailbox'} threads.
                </p>
                {activeSelectedProvider && (
                  <button
                    type="button"
                    onClick={() => {
                      setLinkingProvider(activeSelectedProvider);
                      setPersonalHandleInput(currentUser.email || '');
                    }}
                    className="w-full px-3 py-1.5 bg-[#F27421] hover:bg-[#e06516] text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Key size={13} />
                    <span>Authenticate {activeSelectedProvider.displayName}</span>
                  </button>
                )}
              </div>
            ) : unifiedConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs space-y-3">
                <p>{searchTerm ? 'No matching conversations' : 'No messages in this view'}</p>
                {isUserMailboxConnected && (
                  <button
                    type="button"
                    onClick={handleSyncPersonalMailbox}
                    disabled={isSyncingMailbox}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#F27421] border border-orange-200 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                  >
                    <RefreshCw size={11} className={isSyncingMailbox ? 'animate-spin' : ''} />
                    <span>{isSyncingMailbox ? 'Syncing...' : 'Sync Mailbox'}</span>
                  </button>
                )}
              </div>
            ) : (
              unifiedConversations.map(conv => {
                const isSelected = conv.type === 'direct'
                  ? (selectedConversationType === 'direct' && selectedUserId === conv.id)
                  : (selectedConversationType === 'mailbox' && selectedThreadId === conv.id);

                return (
                  <div
                    key={`${conv.type}-${conv.id}`}
                    onClick={() => {
                      setSelectedConversationType(conv.type);
                      if (conv.type === 'direct') {
                        setSelectedUserId(conv.id);
                      } else {
                        setSelectedThreadId(conv.id);
                      }
                    }}
                    className={`p-3 transition-colors cursor-pointer flex items-start space-x-2.5 ${
                      isSelected
                        ? 'bg-orange-50/50 border-l-3 border-l-[#F27421]'
                        : 'hover:bg-slate-50/80 border-l-3 border-l-transparent'
                    }`}
                  >
                    {/* Avatar */}
                    {conv.type === 'direct' ? (
                      <div className="relative shrink-0">
                        {renderCircularAvatar(conv.raw.avatarUrl, conv.title, 'w-8 h-8')}
                        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white bg-emerald-500" />
                      </div>
                    ) : (
                      <div className="relative shrink-0 w-8 h-8 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F27421] shadow-2xs overflow-hidden">
                        <ProviderLogo preset={conv.providerPreset || 'EMAIL'} channel="email" size={16} />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className={`text-xs truncate ${isSelected ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>
                          {conv.title}
                        </p>
                        {conv.timestamp > 0 && (
                          <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                            {formatTimeAgo(new Date(conv.timestamp).toISOString())}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 truncate mb-1.5">
                        {conv.preview}
                      </p>

                      {/* Bottom row: Source Badge + Counterparty/Role + Unread */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* Small Source Badge */}
                          {conv.type === 'direct' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                              <UserIcon size={9} className="text-slate-500" />
                              <span>Direct</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-50 text-[#F27421] border border-orange-200 shrink-0">
                              <ProviderLogo preset={conv.providerPreset || 'EMAIL'} channel="email" size={12} />
                              <span>{conv.providerPreset || 'Mailbox'}</span>
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 truncate">
                            {conv.subtitle}
                          </span>
                        </div>

                        {conv.unreadCount > 0 && (
                          <span className={`px-1.5 py-0.2 text-white text-[9px] font-bold rounded-full shrink-0 ${
                            conv.type === 'direct' ? 'bg-[#F27421]' : 'bg-rose-500'
                          }`}>
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Conversation Viewer (Direct Chat OR Zoho Mail Thread) */}
        <div className="flex-1 flex flex-col bg-white min-h-0 overflow-hidden">
          {selectedConversationType === 'direct' ? (
            selectedContact ? (
              <>
                {/* Direct Conversation Header */}
                <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-2.5">
                    {renderCircularAvatar(selectedContact.avatarUrl, selectedContact.displayName || selectedContact.username, 'w-9 h-9')}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {selectedContact.displayName || `@${selectedContact.username}`}
                        </span>
                        {/* Direct Source Badge */}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          <UserIcon size={9} className="text-slate-500" />
                          <span>Direct Message</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {selectedContact.email} • {selectedContact.role}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Direct Message Bubbles History */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-slate-50/20">
                  {currentConversation.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400 text-xs">
                      <MessageSquare size={24} className="text-slate-300 mb-2" />
                      <p>No messages yet with {selectedContact.displayName || selectedContact.username}</p>
                      <p className="text-[10px] mt-1 text-slate-400">Send an operational message below</p>
                    </div>
                  ) : (
                    currentConversation.map((msg) => {
                      const isSelf = msg.senderId === currentUser.id;
                      const sender = isSelf ? currentUser : selectedContact;

                      return (
                        <div
                          key={msg.id}
                          className={`flex items-start gap-2.5 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                          <div className="shrink-0 mt-0.5">
                            {renderCircularAvatar(sender.avatarUrl, sender.displayName || sender.username, 'w-7 h-7')}
                          </div>

                          <div className={`max-w-[70%] flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-1.5 mb-0.5 text-[10px] text-slate-400">
                              <span className="font-semibold text-slate-700">
                                {isSelf ? 'You' : sender.displayName || sender.username}
                              </span>
                              <span>•</span>
                              <span>
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {/* Source badge indicator on each message */}
                              <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400">
                                <UserIcon size={8} /> Direct
                              </span>
                            </div>

                            <div
                              className={`p-3 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                                isSelf
                                  ? 'bg-[#0F142A] text-white rounded-tr-xs'
                                  : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                              {isSelf && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                  <CheckCheck size={12} className={msg.isRead ? 'text-[#F27421]' : 'text-slate-300'} />
                                </span>
                              )}

                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await fetch('/api/resolutions/propose', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          reconciliationId: `dm-${msg.id}`,
                                          action: 'FORCE_MATCH',
                                          justification: `Direct operational message from @${sender.username}: "${msg.content.substring(0, 100)}"`,
                                          evidenceSnapshot: {
                                            messageId: msg.id,
                                            sender: sender.username,
                                            content: msg.content,
                                            timestamp: msg.timestamp
                                          },
                                          teamId: 'team-cards',
                                          makerId: currentUser.id,
                                          makerName: currentUser.username
                                        })
                                      });
                                      alert('Message submitted as Maker Proposal to Team Lead!');
                                    } catch (err: any) {
                                      alert(`Submission error: ${err.message}`);
                                    }
                                  }}
                                  className="text-[10px] text-[#F27421] hover:text-orange-600 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <ShieldCheck size={11} className="text-[#F27421]" />
                                  <span>Submit as maker proposal</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Shared Operational Assets */}
                  {directShares
                    .filter(
                      s => (s.senderId === currentUser.id && s.targetId === selectedUserId) ||
                        (s.senderId === selectedUserId && s.targetId === currentUser.id)
                    )
                    .map(share => {
                      const isSelf = share.senderId === currentUser.id;
                      return (
                        <div
                          key={share.id}
                          className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} my-2`}
                        >
                          <div className="flex items-center space-x-1.5 mb-1 text-[10px] text-slate-400">
                            <span className="font-bold text-slate-700">
                              {isSelf ? 'You (Shared Asset)' : `@${share.senderName} (Shared Asset)`}
                            </span>
                            <span>•</span>
                            <span>{share.createdAt ? new Date(share.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                          <SharedAssetChatCard
                            shareId={share.id}
                            assetType={share.assetType}
                            assetId={share.assetId}
                            senderName={share.senderName}
                            message={share.message}
                            visualPayload={share.visualPayload || {}}
                          />
                        </div>
                      );
                    })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Direct Message Input */}
                <div className="p-3 border-t border-slate-200 bg-white shrink-0">
                  <UnifiedChatInput
                    currentUser={currentUser}
                    users={users}
                    teams={teams}
                    hashtags={hashtags}
                    placeholder={`Message @${selectedContact.username}...`}
                    value={messageInput}
                    onChange={setMessageInput}
                    onSendMessage={() => {
                      if (!messageInput.trim()) return;
                      onSendDirectMessage(selectedUserId, messageInput.trim());
                      setMessageInput('');
                    }}
                    onExecuteDirective={handleExecuteChatDirective}
                    quickPrompts={[
                      'Task review?',
                      'Check DB access',
                      'SQL dry-run status'
                    ]}
                    inputId="input-direct-chat"
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
                Select a colleague from the left directory to open a direct message channel
              </div>
            )
          ) : !isUserMailboxConnected ? (
            /* ================= MAILBOX NOT AUTHENTICATED SCREEN ================= */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/40">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex items-center justify-center mb-4 relative">
                <ProviderLogo preset={activeSelectedProvider?.providerPreset || 'EMAIL'} channel="email" size={32} />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center text-white text-[11px] font-bold">
                  !
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 mb-1.5">
                {activeSelectedProvider ? `${activeSelectedProvider.displayName} Not Authenticated` : 'Enterprise Mailbox Not Configured'}
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
                {activeSelectedProvider ? (
                  <>The enterprise <strong>{activeSelectedProvider.displayName}</strong> OAuth 2.0 gateway is configured globally by your administrator, but your personal user account (<strong className="text-slate-800">{currentUser.email || currentUser.username}</strong>) has not completed authentication yet. Connect your account to read and send operational emails.</>
                ) : (
                  <>No enterprise messaging or mailbox providers have been configured by your administrator yet in <strong>Admin Hub &gt; Connections</strong>.</>
                )}
              </p>
              {activeSelectedProvider && (
                <button
                  type="button"
                  onClick={() => {
                    setLinkingProvider(activeSelectedProvider);
                    setPersonalHandleInput(currentUser.email || '');
                  }}
                  className="px-5 py-2.5 bg-[#0F142A] hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-2"
                >
                  <ShieldCheck size={16} className="text-[#F27421]" />
                  <span>Authorize & Connect {activeSelectedProvider.displayName}</span>
                </button>
              )}
            </div>
          ) : (
            activeMailboxThread ? (
              <>
                {/* Thread Header */}
                <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center space-x-2 mb-0.5">
                      <h2 className="text-sm font-bold text-slate-900 truncate">
                        {activeMailboxThread.subject || 'No Subject'}
                      </h2>
                      {/* Mail Source Badge */}
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-50 text-[#F27421] border border-orange-200 shrink-0">
                        <ProviderLogo preset={userMailboxProvider?.providerPreset || 'EMAIL'} channel="email" size={12} />
                        <span>{userMailboxProvider?.displayName || 'Enterprise Mail'}</span>
                      </span>
                      <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[9px] font-mono shrink-0">
                        OAuth 2.0
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      Participants: {activeMailboxThread.participants?.map((p: any) => p.name || p.address).join(', ') || 'Operational Counterparties'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSyncPersonalMailbox}
                    className="p-1.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    title="Sync and refresh thread"
                  >
                    <RefreshCw size={13} className={(loadingMailbox || isSyncingMailbox) ? 'animate-spin text-[#F27421]' : ''} />
                  </button>
                </div>

                {/* Zoho Messages History */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-slate-50/20">
                  {activeMailboxThread.messages?.map((msg: any) => {
                    const isOutbound = msg.direction === 'outbound';
                    const senderDisplay = msg.sender_address || 'operations@bank.com';

                    return (
                      <div
                        key={msg.id}
                        className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs space-y-3"
                      >
                        {/* Message Metadata Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
                              {senderDisplay.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-slate-900 font-mono">
                                  {senderDisplay}
                                </span>
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                                  isOutbound ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {isOutbound ? 'OUTBOUND' : 'INBOUND'}
                                </span>
                                {/* Source Indicator on Email Card */}
                                <div className="flex items-center gap-1 px-1.5 py-0.2 rounded bg-orange-50 border border-orange-200 text-[9px] font-mono font-semibold text-orange-800">
                                  <ProviderLogo preset="ZOHO" channel="email" size={12} />
                                  <span>Zoho Mail</span>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400 font-mono">
                                From: {msg.sender_address || personalEmailAddress} • To: {msg.recipient_address || personalEmailAddress}
                              </p>
                            </div>
                          </div>

                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(msg.created_at || msg.sent_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>

                        {/* Message Body */}
                        <div className="text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                          {msg.html_body ? (
                            <div
                              className="prose prose-xs max-w-none text-slate-800"
                              dangerouslySetInnerHTML={{ __html: msg.html_body }}
                            />
                          ) : (
                            <p>{msg.text_body || 'Empty message content'}</p>
                          )}
                        </div>

                        {/* File Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 space-y-2">
                            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase flex items-center space-x-1">
                              <Paperclip size={11} className="text-[#F27421]" />
                              <span>Attachments ({msg.attachments.length})</span>
                            </span>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {msg.attachments.map((att: any, attIdx: number) => {
                                const isSpreadsheet = att.filename?.endsWith('.csv') || att.filename?.endsWith('.xlsx') || att.filename?.endsWith('.xls');
                                const sizeFormatted = att.sizeBytes ? `${Math.round(att.sizeBytes / 1024)} KB` : 'Unknown size';

                                return (
                                  <div
                                    key={att.id || attIdx}
                                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors shadow-2xs"
                                  >
                                    <div className="flex items-center space-x-2 min-w-0">
                                      <div className="p-1.5 rounded bg-orange-50 text-[#F27421] shrink-0">
                                        {isSpreadsheet ? <FileSpreadsheet size={14} /> : <FileText size={14} />}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-slate-800 truncate font-mono">
                                          {att.filename}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-mono">
                                          {sizeFormatted} • {att.mimeType || 'Document'}
                                        </p>
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        alert(`Attachment "${att.filename}" is available for inspection and local processing.`);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-[#F27421] transition-colors cursor-pointer shrink-0"
                                      title="Download / View Attachment"
                                    >
                                      <Download size={13} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Mailbox Feedback Alert */}
                {mailboxFeedback && (
                  <div className="px-4 py-2 bg-emerald-50 border-t border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                    <span>{mailboxFeedback}</span>
                    <button onClick={() => setMailboxFeedback(null)} className="text-emerald-700 font-bold">×</button>
                  </div>
                )}

                {/* Zoho Reply Bar */}
                <div className="p-3 border-t border-slate-200 bg-white space-y-2 shrink-0">
                  <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-500">
                    <CornerDownLeft size={12} className="text-[#F27421]" />
                    <span>Replying to thread via personal Zoho OAuth 2.0 ({personalEmailAddress})</span>
                  </div>

                  <UnifiedChatInput
                    currentUser={currentUser}
                    users={users}
                    teams={teams}
                    hashtags={hashtags}
                    placeholder={`Reply to ${activeMailboxThread.subject || 'thread'}...`}
                    value={mailboxReplyText}
                    onChange={setMailboxReplyText}
                    onSendMessage={() => handleSendMailboxReply(activeMailboxThread)}
                    onExecuteDirective={handleExecuteChatDirective}
                    disabled={isSendingReply}
                    inputId="input-mailbox-reply"
                    buttonLabel={isSendingReply ? 'Sending...' : 'Send'}
                  />
                </div>
              </>
            ) : selectedConversationType === 'zoho' && !isUserZohoConnected ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F27421] shadow-2xs">
                  <ProviderLogo preset="ZOHO" channel="email" size={28} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">Zoho Mail Account Not Authenticated</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    The corporate Zoho Mail gateway is configured by the Global Administrator. Authenticate your personal mailbox via Zoho OAuth 2.0 to access live messages and dispatch verified replies.
                  </p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1 text-left w-full">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-[#F27421]" />
                    <span>Admin OAuth 2.0 Gateway</span>
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-between">
                    <span>Gateway Client ID:</span>
                    <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-700">
                      {adminZohoProvider?.config?.clientId || '1000.UYVBUR0W5ZYW0PH2WHT1LZR0WJVZ8T'}
                    </code>
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-between">
                    <span>Authorized Scopes:</span>
                    <span className="font-mono text-slate-700">ZohoMail.messages.ALL, ZohoMail.accounts.ALL</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (adminZohoProvider) {
                      setLinkingProvider(adminZohoProvider);
                      setPersonalHandleInput(currentUser.email || '');
                      setOauthAuthMode('redirect');
                    }
                  }}
                  className="px-5 py-2.5 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-2"
                >
                  <ExternalLink size={14} />
                  <span>Authenticate Zoho Mailbox</span>
                </button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
                Select an email conversation from the left to read its full message content and attachments
              </div>
            )
          )}
        </div>
      </div>
      {/* ================= MODAL: AUTHORIZATION & DATA ACCESS CONSENT ================= */}
      {linkingProvider && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-[#0F142A] text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                  <ProviderLogo
                    preset={linkingProvider.providerPreset}
                    channel={linkingProvider.channel}
                    logoUrl={linkingProvider.logoUrl}
                    size="md"
                  />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Authorize {linkingProvider.displayName}</h3>
                  <p className="text-[11px] text-slate-300">
                    Enterprise OAuth 2.0 • {(linkingProvider.channel || 'email').toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLinkingProvider(null);
                  setLinkingFeedback(null);
                  setPersonalHandleInput('');
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition"
              >
                <X size={16} />
              </button>
            </div>

            {(() => {
              const preset = (linkingProvider.providerPreset || '').toUpperCase();
              const isOAuth = preset === 'ZOHO' ||
                              preset === 'GOOGLE_WORKSPACE' ||
                              preset === 'MICROSOFT_365' ||
                              linkingProvider.displayName?.toLowerCase().includes('zoho') ||
                              Boolean(linkingProvider.config?.clientId);

              return (
                <form onSubmit={handleLinkPersonalAccount} className="p-5 space-y-4 text-xs font-sans">
                  {/* Clean Enterprise User Banner */}
                  {isOAuth ? (
                    <div className="p-3.5 rounded-xl bg-orange-50/80 border border-orange-200 text-[11px] text-orange-950 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-orange-900">
                        <ShieldCheck size={14} className="text-[#F27421]" />
                        <span>Connect Your Work Mailbox</span>
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        Sign in with your enterprise {linkingProvider.displayName} account. Once authorized, you can send and receive operational emails directly in your personal workspace.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900">
                        <ShieldCheck size={14} className="text-[#F27421]" />
                        <span>Channel Link & Governance</span>
                      </div>
                      <p className="text-slate-500">
                        Link your personal handle to ingest counterparty messages and dispatch operational updates under your verified identity.
                      </p>
                    </div>
                  )}

                  {/* Clean Account Switcher (only for Zoho OAuth) */}
                  {isOAuth && preset === 'ZOHO' && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                      <span className="text-slate-600">Signing in with a different Zoho account?</span>
                      <button
                        type="button"
                        onClick={() => window.open('https://accounts.zoho.com/logout', '_blank')}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded font-semibold text-[10px] cursor-pointer transition shadow-2xs"
                      >
                        Sign out of Zoho first ↗
                      </button>
                    </div>
                  )}

                  {/* Account Address Input */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {(linkingProvider.channel || 'email').toLowerCase() === 'teams' ? 'Your Teams Account / UPN' :
                       (linkingProvider.channel || 'email').toLowerCase() === 'whatsapp' ? 'Your WhatsApp Phone Number' :
                       (linkingProvider.channel || 'email').toLowerCase() === 'telegram' ? 'Your Telegram Handle (@username)' :
                       'Your Work Email Address'}
                      <span className="text-rose-500 ml-1">*</span>
                    </label>
                    <input
                      type={(linkingProvider.channel || 'email').toLowerCase() === 'email' ? 'email' : 'text'}
                      required
                      autoFocus
                      value={personalHandleInput}
                      onChange={(e) => setPersonalHandleInput(e.target.value)}
                      placeholder={
                        (linkingProvider.channel || 'email').toLowerCase() === 'teams' ? 'e.g. user@company.onmicrosoft.com' :
                        (linkingProvider.channel || 'email').toLowerCase() === 'whatsapp' ? 'e.g. +251 91 122 3344' :
                        (linkingProvider.channel || 'email').toLowerCase() === 'telegram' ? 'e.g. @settlement_desk' :
                        'e.g. user@operations.et'
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-[#F27421] text-xs font-mono"
                    />
                  </div>

                  {linkingFeedback && (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center space-x-1.5">
                      <CheckCheck size={14} className="text-emerald-600 shrink-0" />
                      <span>{linkingFeedback}</span>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setLinkingProvider(null);
                        setLinkingFeedback(null);
                        setPersonalHandleInput('');
                      }}
                      className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-medium cursor-pointer transition text-xs"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={isLinkingProvider || !personalHandleInput.trim()}
                      className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] disabled:opacity-50 text-white rounded-xl font-bold cursor-pointer shadow-xs transition text-xs flex items-center space-x-1.5"
                    >
                      {isLinkingProvider ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Connecting...</span>
                        </>
                      ) : isOAuth ? (
                        <>
                          <ExternalLink size={13} />
                          <span>Sign in with {linkingProvider.displayName} ↗</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={13} />
                          <span>Connect Channel</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* ================= MODAL: CONTACTS & MULTI-CHANNEL IDENTIFIERS ================= */}
      {showContactsModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#F27421] flex items-center justify-center text-white">
                  <Users size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Counterparty Contacts & Multi-Channel Directory</h3>
                  <p className="text-[11px] text-slate-300">
                    Unified contact records with multi-channel alternate IDs (Email, WhatsApp, Teams, Telegram, SWIFT)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowContactsModal(false);
                  setIsAddingNewContact(false);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body: Split Pane */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
              {/* Left Pane: Contacts Directory List & Search */}
              <div className="w-full md:w-80 border-r border-slate-200 bg-slate-50/60 flex flex-col shrink-0 min-h-0">
                <div className="p-3 border-b border-slate-200 space-y-2 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Saved Contacts</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewContact(true);
                        setSelectedContactId(null);
                      }}
                      className="px-2.5 py-1 bg-[#F27421] hover:bg-[#e06516] text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer shadow-2xs transition"
                    >
                      <Plus size={12} />
                      <span>Add Contact</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search name, phone, handle..."
                      value={contactSearchTerm}
                      onChange={(e) => setContactSearchTerm(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421]"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {loadingContacts ? (
                    <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                      <RefreshCw size={13} className="animate-spin text-[#F27421]" />
                      <span>Loading contacts...</span>
                    </div>
                  ) : userContacts.filter(c => {
                      const q = contactSearchTerm.toLowerCase();
                      if (!q) return true;
                      const matchName = (c.name || '').toLowerCase().includes(q);
                      const matchOrg = (c.organization || '').toLowerCase().includes(q);
                      const matchEmail = (c.primary_email || '').toLowerCase().includes(q);
                      const matchPhone = (c.primary_phone || '').toLowerCase().includes(q);
                      const matchIdent = (c.identifiers || []).some((id: any) =>
                        (id.identifierValue || '').toLowerCase().includes(q) || (id.label || '').toLowerCase().includes(q)
                      );
                      return matchName || matchOrg || matchEmail || matchPhone || matchIdent;
                    }).length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                      <Users size={24} className="mx-auto text-slate-300 stroke-[1.5]" />
                      <p className="font-semibold text-slate-600">No contacts found</p>
                      <p className="text-[11px] text-slate-400">Click &ldquo;Add Contact&rdquo; to add a counterparty.</p>
                    </div>
                  ) : (
                    userContacts
                      .filter(c => {
                        const q = contactSearchTerm.toLowerCase();
                        if (!q) return true;
                        const matchName = (c.name || '').toLowerCase().includes(q);
                        const matchOrg = (c.organization || '').toLowerCase().includes(q);
                        const matchEmail = (c.primary_email || '').toLowerCase().includes(q);
                        const matchPhone = (c.primary_phone || '').toLowerCase().includes(q);
                        const matchIdent = (c.identifiers || []).some((id: any) =>
                          (id.identifierValue || '').toLowerCase().includes(q) || (id.label || '').toLowerCase().includes(q)
                        );
                        return matchName || matchOrg || matchEmail || matchPhone || matchIdent;
                      })
                      .map((contact) => {
                        const isSelected = !isAddingNewContact && contact.id === selectedContactId;
                        const identCount = contact.identifiers?.length || 0;

                        return (
                          <button
                            key={contact.id}
                            type="button"
                            onClick={() => {
                              setSelectedContactId(contact.id);
                              setIsAddingNewContact(false);
                            }}
                            className={`w-full p-3 text-left transition flex items-start space-x-2.5 cursor-pointer ${
                              isSelected
                                ? 'bg-orange-50/80 border-l-4 border-[#F27421]'
                                : 'hover:bg-slate-100/70'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 font-mono">
                              {(contact.name || 'C').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900 truncate">
                                  {contact.name}
                                </span>
                                {identCount > 0 && (
                                  <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-200 text-slate-600 text-[9px] font-mono rounded font-semibold shrink-0">
                                    {identCount} {identCount === 1 ? 'ID' : 'IDs'}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 truncate">
                                {contact.organization || contact.role_or_title || contact.primary_email || 'No organization'}
                              </p>
                            </div>
                          </button>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Right Pane: Selected Contact Details OR Create Form */}
              <div className="flex-1 bg-white flex flex-col overflow-y-auto p-5 min-h-0">
                {isAddingNewContact ? (
                  /* ================= CREATE NEW CONTACT FORM ================= */
                  <form onSubmit={handleCreateContact} className="space-y-4 max-w-lg">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="text-sm font-bold text-slate-900">Add New Contact</h4>
                      <button
                        type="button"
                        onClick={() => setIsAddingNewContact(false)}
                        className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Full Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newContactName}
                          onChange={(e) => setNewContactName(e.target.value)}
                          placeholder="e.g. Elena Rostova"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Organization / Bank
                        </label>
                        <input
                          type="text"
                          value={newContactOrg}
                          onChange={(e) => setNewContactOrg(e.target.value)}
                          placeholder="e.g. Deutsche Bank / Settlement Dept"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Role / Title
                        </label>
                        <input
                          type="text"
                          value={newContactRole}
                          onChange={(e) => setNewContactRole(e.target.value)}
                          placeholder="e.g. Chief Settlement Officer"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Primary Email
                        </label>
                        <input
                          type="email"
                          value={newContactEmail}
                          onChange={(e) => setNewContactEmail(e.target.value)}
                          placeholder="e.g. elena@deutsche.com"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Primary Phone
                        </label>
                        <input
                          type="text"
                          value={newContactPhone}
                          onChange={(e) => setNewContactPhone(e.target.value)}
                          placeholder="e.g. +49 69 123456"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Initial Alternate Identifier
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={newContactInitialChannel}
                            onChange={(e) => setNewContactInitialChannel(e.target.value)}
                            className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                          >
                            <option value="email">Email</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="teams">Teams</option>
                            <option value="telegram">Telegram</option>
                            <option value="other">SWIFT / Other</option>
                          </select>
                          <input
                            type="text"
                            value={newContactInitialIdVal}
                            onChange={(e) => setNewContactInitialIdVal(e.target.value)}
                            placeholder="Address, phone, or handle"
                            className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Operational Notes
                      </label>
                      <textarea
                        rows={2}
                        value={newContactNotes}
                        onChange={(e) => setNewContactNotes(e.target.value)}
                        placeholder="Internal notes, trading desk instructions, escalation routing..."
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421]"
                      />
                    </div>

                    <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsAddingNewContact(false)}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingContact || !newContactName.trim()}
                        className="px-4 py-1.5 bg-[#F27421] hover:bg-[#e06516] disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer shadow-xs"
                      >
                        {isSavingContact ? 'Saving...' : 'Save Contact'}
                      </button>
                    </div>
                  </form>
                ) : selectedContactId && userContacts.some(c => c.id === selectedContactId) ? (
                  /* ================= SELECTED CONTACT VIEW & ADD ADDITIONAL ID ================= */
                  (() => {
                    const activeContact = userContacts.find(c => c.id === selectedContactId);
                    if (!activeContact) return null;

                    return (
                      <div className="space-y-5">
                        {/* Contact Header */}
                        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-11 h-11 rounded-full bg-[#0F142A] text-white flex items-center justify-center font-bold text-sm shadow-2xs font-mono">
                              {(activeContact.name || 'C').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-slate-900">{activeContact.name}</h3>
                              <p className="text-xs text-slate-500">
                                {activeContact.role_or_title ? `${activeContact.role_or_title} • ` : ''}
                                {activeContact.organization || 'External Counterparty'}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteContact(activeContact.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                            title="Delete Contact"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {/* Contact Info Pills */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Primary Email</span>
                            <p className="font-mono text-slate-800 font-semibold">{activeContact.primary_email || 'Not specified'}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Primary Phone</span>
                            <p className="font-mono text-slate-800 font-semibold">{activeContact.primary_phone || 'Not specified'}</p>
                          </div>
                          {activeContact.notes && (
                            <div className="sm:col-span-2 pt-1 border-t border-slate-200">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Notes</span>
                              <p className="text-slate-600 mt-0.5">{activeContact.notes}</p>
                            </div>
                          )}
                        </div>

                        {/* ================= MULTI-CHANNEL IDENTIFIERS SECTION ================= */}
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Associated Communication IDs ({activeContact.identifiers?.length || 0})
                              </h4>
                              <p className="text-[11px] text-slate-500">
                                Link additional communication channels (WhatsApp, Teams, Telegram, etc.) to this contact.
                              </p>
                            </div>
                          </div>

                          {/* Existing Identifiers List */}
                          <div className="space-y-2">
                            {(!activeContact.identifiers || activeContact.identifiers.length === 0) ? (
                              <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                No additional identifiers added yet. Use the form below to add alternate WhatsApp, Teams, or Telegram handles.
                              </p>
                            ) : (
                              activeContact.identifiers.map((ident: any) => {
                                const chMeta = getChannelMeta(ident.channel);
                                const ChIcon = chMeta.icon;

                                return (
                                  <div
                                    key={ident.id}
                                    className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-2xs hover:border-slate-300 transition"
                                  >
                                    <div className="flex items-center space-x-2.5 min-w-0">
                                      <div className={`p-1.5 rounded-lg border flex items-center justify-center shrink-0 ${chMeta.color}`}>
                                        <ChIcon size={13} />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center space-x-2">
                                          <span className="text-xs font-bold font-mono text-slate-900 truncate">
                                            {ident.identifierValue}
                                          </span>
                                          {ident.label && (
                                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px] font-semibold">
                                              {ident.label}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-slate-400 capitalize">
                                          {ident.channel} channel identifier
                                        </p>
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteIdentifier(ident.id)}
                                      className="p-1 text-slate-300 hover:text-rose-600 rounded transition cursor-pointer"
                                      title="Remove this identifier"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* ================= FORM: ADD ADDITIONAL ID ================= */}
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                              <Plus size={13} className="text-[#F27421]" />
                              <span>Add Additional Identifier to {activeContact.name}</span>
                            </span>

                            <form onSubmit={handleAddIdentifier} className="flex flex-col sm:flex-row gap-2">
                              <select
                                value={additionalChannel}
                                onChange={(e) => setAdditionalChannel(e.target.value)}
                                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-medium"
                              >
                                <option value="whatsapp">WhatsApp</option>
                                <option value="teams">Microsoft Teams</option>
                                <option value="telegram">Telegram</option>
                                <option value="email">Alternate Email</option>
                                <option value="other">SWIFT BIC / Other</option>
                              </select>

                              <input
                                type="text"
                                required
                                value={additionalIdVal}
                                onChange={(e) => setAdditionalIdVal(e.target.value)}
                                placeholder={
                                  additionalChannel === 'whatsapp' ? 'Phone (+251 91 123 4567)' :
                                  additionalChannel === 'teams' ? 'Teams UPN (user@partner.com)' :
                                  additionalChannel === 'telegram' ? 'Telegram Handle (@desk_rep)' :
                                  'Identifier or address value'
                                }
                                className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#F27421]"
                              />

                              <input
                                type="text"
                                value={additionalLabel}
                                onChange={(e) => setAdditionalLabel(e.target.value)}
                                placeholder="Label (e.g. Desk Phone)"
                                className="w-32 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421]"
                              />

                              <button
                                type="submit"
                                disabled={isAddingIdentifier || !additionalIdVal.trim()}
                                className="px-3 py-1.5 bg-[#0F142A] hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs shrink-0 flex items-center gap-1"
                              >
                                <Plus size={12} />
                                <span>{isAddingIdentifier ? 'Adding...' : 'Add ID'}</span>
                              </button>
                            </form>
                          </div>
                        </div>

                      </div>
                    );
                  })()
                ) : (
                  /* Empty state */
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                    <Users size={32} className="text-slate-300 stroke-[1.5]" />
                    <p className="text-xs font-semibold text-slate-600">No contact selected</p>
                    <p className="text-xs text-slate-400 max-w-xs">
                      Select a contact from the left list to view and manage their communication IDs, or click &ldquo;Add Contact&rdquo; to create a new one.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowContactsModal(false);
                  setIsAddingNewContact(false);
                }}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
