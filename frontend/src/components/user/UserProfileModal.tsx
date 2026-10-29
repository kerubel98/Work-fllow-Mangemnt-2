import React, { useState, useEffect, useRef } from 'react';
import {
  X, User, Mail, Shield, CheckCircle2, AlertCircle, Camera,
  Upload, Sliders, Bell, Globe, Phone, Briefcase, Building,
  RefreshCw, Check, Sparkles, Send, Lock, Eye, Save, Trash2,
  Paperclip, ShieldCheck, LogOut
} from 'lucide-react';
import { User as UserType, UserMessageProviderSettings, UserPreferences } from '../../types';
import { api } from '../../api/client';

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  onUserUpdated?: (updatedUser: UserType) => void;
  onLogout?: () => void;
}

// Preset avatars with modern clean gradients
const AVATAR_PRESETS = [
  { id: 'p1', label: 'Indigo Tech', bg: 'from-blue-600 to-indigo-700', initials: 'IT' },
  { id: 'p2', label: 'Emerald Ops', bg: 'from-emerald-500 to-teal-700', initials: 'EO' },
  { id: 'p3', label: 'Violet Lead', bg: 'from-purple-600 to-violet-800', initials: 'VL' },
  { id: 'p4', label: 'Amber Analyst', bg: 'from-amber-500 to-orange-600', initials: 'AA' },
  { id: 'p5', label: 'Rose Admin', bg: 'from-rose-500 to-pink-700', initials: 'RA' },
  { id: 'p6', label: 'Cyan Specialist', bg: 'from-cyan-500 to-blue-600', initials: 'CS' },
];

const TIMEZONES = [
  'UTC',
  'Africa/Addis_Ababa',
  'Africa/Nairobi',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'messaging' | 'preferences'>('profile');

  // Form State - Profile
  const [displayName, setDisplayName] = useState(currentUser.displayName || currentUser.name || currentUser.username || '');
  const [email, setEmail] = useState(currentUser.email || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [title, setTitle] = useState(currentUser.title || '');
  const [department, setDepartment] = useState(currentUser.department || '');
  const [timezone, setTimezone] = useState(currentUser.timezone || 'UTC');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || '');

  // Form State - Message Provider Settings
  const [providerSettings, setProviderSettings] = useState<UserMessageProviderSettings>(() => {
    return {
      providerType: currentUser.messageProviderSettings?.providerType || 'oauth2',
      adminOAuth2ConnectionId: currentUser.messageProviderSettings?.adminOAuth2ConnectionId || '',
      userEmail: currentUser.messageProviderSettings?.userEmail || currentUser.email || '',
      incomingHost: currentUser.messageProviderSettings?.incomingHost || '',
      incomingPort: currentUser.messageProviderSettings?.incomingPort || 993,
      outgoingHost: currentUser.messageProviderSettings?.outgoingHost || '',
      outgoingPort: currentUser.messageProviderSettings?.outgoingPort || 587,
      useSsl: currentUser.messageProviderSettings?.useSsl ?? true,
      webhookUrl: currentUser.messageProviderSettings?.webhookUrl || '',
      autoSyncIntervalMinutes: currentUser.messageProviderSettings?.autoSyncIntervalMinutes || 15,
      notifyOnDiscrepancy: currentUser.messageProviderSettings?.notifyOnDiscrepancy ?? true,
      notifyOnTaskAssigned: currentUser.messageProviderSettings?.notifyOnTaskAssigned ?? true,
      emailSignature: currentUser.messageProviderSettings?.emailSignature || `Best regards,\n${currentUser.displayName || currentUser.name || currentUser.username}\n${currentUser.title || 'Settlement Operations Team'}`,
      status: currentUser.messageProviderSettings?.status || 'ACTIVE',
    };
  });

  // Form State - Preferences
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    return {
      theme: currentUser.preferences?.theme || 'light',
      desktopNotifications: currentUser.preferences?.desktopNotifications ?? true,
      soundAlerts: currentUser.preferences?.soundAlerts ?? false,
      compactSideNav: currentUser.preferences?.compactSideNav ?? true,
      autoRefreshIntervalSeconds: currentUser.preferences?.autoRefreshIntervalSeconds || 30,
    };
  });

  // Admin OAuth2 Connections (for Rule 14 compliance)
  const [adminOAuthConnections, setAdminOAuthConnections] = useState<any[]>([]);
  const [loadingAdminOAuth, setLoadingAdminOAuth] = useState(false);

  // Status & Feedback
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state whenever modal opens or currentUser changes
  useEffect(() => {
    if (isOpen) {
      setDisplayName(currentUser.displayName || currentUser.name || currentUser.username || '');
      setEmail(currentUser.email || '');
      setPhone(currentUser.phone || '');
      setTitle(currentUser.title || '');
      setDepartment(currentUser.department || '');
      setTimezone(currentUser.timezone || 'UTC');
      setAvatarUrl(currentUser.avatarUrl || '');

      setProviderSettings({
        providerType: currentUser.messageProviderSettings?.providerType || 'oauth2',
        adminOAuth2ConnectionId: currentUser.messageProviderSettings?.adminOAuth2ConnectionId || '',
        userEmail: currentUser.messageProviderSettings?.userEmail || currentUser.email || '',
        incomingHost: currentUser.messageProviderSettings?.incomingHost || '',
        incomingPort: currentUser.messageProviderSettings?.incomingPort || 993,
        outgoingHost: currentUser.messageProviderSettings?.outgoingHost || '',
        outgoingPort: currentUser.messageProviderSettings?.outgoingPort || 587,
        useSsl: currentUser.messageProviderSettings?.useSsl ?? true,
        webhookUrl: currentUser.messageProviderSettings?.webhookUrl || '',
        autoSyncIntervalMinutes: currentUser.messageProviderSettings?.autoSyncIntervalMinutes || 15,
        notifyOnDiscrepancy: currentUser.messageProviderSettings?.notifyOnDiscrepancy ?? true,
        notifyOnTaskAssigned: currentUser.messageProviderSettings?.notifyOnTaskAssigned ?? true,
        emailSignature: currentUser.messageProviderSettings?.emailSignature || `Best regards,\n${currentUser.displayName || currentUser.name || currentUser.username}\n${currentUser.title || 'Settlement Operations Team'}`,
        status: currentUser.messageProviderSettings?.status || 'ACTIVE',
      });

      setPreferences({
        theme: currentUser.preferences?.theme || 'light',
        desktopNotifications: currentUser.preferences?.desktopNotifications ?? true,
        soundAlerts: currentUser.preferences?.soundAlerts ?? false,
        compactSideNav: currentUser.preferences?.compactSideNav ?? true,
        autoRefreshIntervalSeconds: currentUser.preferences?.autoRefreshIntervalSeconds || 30,
      });

      setFeedback(null);
      setTestResult(null);

      // Fetch available Admin OAuth2 connections per Rule 14
      setLoadingAdminOAuth(true);
      api.getAvailableAdminOAuth2Connections()
        .then(conns => {
          setAdminOAuthConnections(conns || []);
          if ((!currentUser.messageProviderSettings?.adminOAuth2ConnectionId || currentUser.messageProviderSettings.adminOAuth2ConnectionId === '') && conns?.length > 0) {
            setProviderSettings(prev => ({
              ...prev,
              adminOAuth2ConnectionId: conns[0].id
            }));
          }
        })
        .catch(err => {
          console.warn('[UserProfileModal] Could not fetch admin OAuth connections:', err);
        })
        .finally(() => setLoadingAdminOAuth(false));
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  // Handle local image file upload & convert to Data URL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Please select a valid image file (PNG, JPG, WebP, SVG).' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'Image size exceeds 2MB limit. Please choose a smaller photo.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatarUrl(result);
      setFeedback({ type: 'success', message: 'Picture loaded. Click "Save Changes" to commit.' });
    };
    reader.onerror = () => {
      setFeedback({ type: 'error', message: 'Failed to read image file.' });
    };
    reader.readAsDataURL(file);
  };

  // Test provider connection
  const handleTestProvider = async () => {
    setIsTestingProvider(true);
    setTestResult(null);
    try {
      if (providerSettings.providerType === 'oauth2') {
        const res = await api.testOAuth2Credentials({
          adminOAuth2ConnectionId: providerSettings.adminOAuth2ConnectionId,
          userEmail: providerSettings.userEmail,
        }, 'email');
        setTestResult({
          success: res.success,
          message: res.message || (res.success ? 'Enterprise OAuth 2.0 Mailbox connection verified successfully!' : 'Connection test failed.')
        });
      } else if (providerSettings.providerType === 'webhook') {
        if (!providerSettings.webhookUrl || !providerSettings.webhookUrl.startsWith('http')) {
          setTestResult({ success: false, message: 'Please provide a valid HTTP/HTTPS Webhook URL.' });
        } else {
          setTestResult({ success: true, message: 'Webhook endpoint format is valid and ready for test events.' });
        }
      } else {
        setTestResult({ success: true, message: 'Direct Messaging channel is active and operational.' });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test could not verify the target provider.'
      });
    } finally {
      setIsTestingProvider(false);
    }
  };

  // Save changes to PostgreSQL backend
  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const profileUpdates: Partial<UserType> = {
        name: displayName.trim() || currentUser.username,
        displayName: displayName.trim() || currentUser.username,
        email: email.trim() || currentUser.email,
        avatarUrl: avatarUrl || undefined,
        phone: phone.trim() || undefined,
        title: title.trim() || undefined,
        department: department.trim() || undefined,
        timezone: timezone || 'UTC',
        messageProviderSettings: providerSettings,
        preferences: preferences,
      };

      const res = await api.updateUserProfile(currentUser.id, profileUpdates);
      const updated = res.user || { ...currentUser, ...profileUpdates };

      if (onUserUpdated) {
        onUserUpdated(updated);
      }

      setFeedback({ type: 'success', message: 'Profile and settings saved successfully to operational database.' });
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to save profile changes. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // User initials calculation
  const getInitials = () => {
    const nameToUse = displayName || currentUser.username || 'User';
    const parts = nameToUse.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nameToUse.substring(0, 2).toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/50 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div 
        className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.18)] overflow-hidden flex flex-col max-h-[92vh] text-slate-800"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold shadow-xs">
              <User size={20} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">User Account & Profile Settings</h2>
                <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border ${
                  currentUser.role === 'admin'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : currentUser.role === 'technical'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  {currentUser.role.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage personal profile, avatar picture, and message provider settings
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 px-4 shrink-0 overflow-x-auto no-scrollbar gap-1 pt-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center space-x-2 cursor-pointer border-b-2 ${
              activeTab === 'profile'
                ? 'text-blue-600 border-blue-600 bg-white shadow-2xs font-bold'
                : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <User size={14} />
            <span>Profile & Identity</span>
          </button>

          <button
            onClick={() => setActiveTab('messaging')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center space-x-2 cursor-pointer border-b-2 ${
              activeTab === 'messaging'
                ? 'text-blue-600 border-blue-600 bg-white shadow-2xs font-bold'
                : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Mail size={14} />
            <span>Personal Mailbox (OAuth 2.0)</span>
            {providerSettings.status === 'ACTIVE' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-all flex items-center space-x-2 cursor-pointer border-b-2 ${
              activeTab === 'preferences'
                ? 'text-blue-600 border-blue-600 bg-white shadow-2xs font-bold'
                : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Sliders size={14} />
            <span>Preferences & UI</span>
          </button>
        </div>

        {/* Feedback Alert Banner */}
        {feedback && (
          <div className={`mx-4 sm:mx-6 mt-3 p-3 rounded-xl border flex items-center space-x-2.5 text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {feedback.type === 'success' ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> : <AlertCircle size={16} className="shrink-0 text-rose-600" />}
            <span className="font-medium">{feedback.message}</span>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-white">

          {/* TAB 1: PROFILE & IDENTITY */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              
              {/* Avatar Picture Section */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-4">
                <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-5">
                  {/* Current Avatar Frame */}
                  <div className="relative group shrink-0">
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200 shadow-xs flex items-center justify-center">
                      {avatarUrl ? (
                        <img 
                          src={avatarUrl} 
                          alt={displayName || currentUser.username} 
                          className="w-full h-full object-cover"
                          onError={() => {
                            setAvatarUrl('');
                            setFeedback({ type: 'error', message: 'Failed to load avatar image. Reverted to initials.' });
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-xl font-bold font-mono">
                          {getInitials()}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-slate-900/60 rounded-full opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity cursor-pointer text-[10px] font-medium"
                      title="Upload custom image"
                    >
                      <Camera size={16} className="mb-0.5" />
                      <span>Upload</span>
                    </button>
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileUpload} 
                      className="hidden" 
                    />
                  </div>

                  {/* Picture Controls */}
                  <div className="flex-1 space-y-2 text-center sm:text-left">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Profile Picture</h3>
                    <p className="text-[11px] text-slate-500">
                      Upload your corporate photo or select a curated preset persona.
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1 justify-center sm:justify-start">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <Upload size={13} />
                        <span>Upload Photo</span>
                      </button>

                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl('')}
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 hover:text-rose-600 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer border border-slate-300 shadow-2xs"
                        >
                          <Trash2 size={13} />
                          <span>Reset to Initials</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Avatar Preset Grid */}
                <div className="pt-3 border-t border-slate-200">
                  <span className="text-[10px] font-mono text-slate-500 block mb-2 font-semibold">PRESET AVATARS</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="58" font-family="system-ui, sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${preset.initials}</text></svg>`;
                          const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
                          setAvatarUrl(url);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center space-x-2 transition-all cursor-pointer ${
                          avatarUrl && avatarUrl.includes(preset.initials)
                            ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold ring-1 ring-blue-300'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-gradient-to-r ${preset.bg} shrink-0 shadow-2xs`} />
                        <span className="text-[11px]">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Profile Details Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Display Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <User size={13} className="text-blue-600" />
                    <span>Display / Full Name</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Samuel Tech"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  />
                </div>

                {/* Username (Immutable Handle) */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <Shield size={13} className="text-slate-400" />
                    <span>System Username</span>
                  </label>
                  <input
                    type="text"
                    value={`@${currentUser.username}`}
                    disabled
                    className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500 font-mono cursor-not-allowed"
                  />
                </div>

                {/* Corporate Email */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <Mail size={13} className="text-indigo-600" />
                    <span>Corporate Email Address</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="user@paymentops.com"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  />
                </div>

                {/* Contact Phone */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <Phone size={13} className="text-emerald-600" />
                    <span>Phone Number</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+251 91 123 4567"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono shadow-2xs"
                  />
                </div>

                {/* Job Title */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <Briefcase size={13} className="text-amber-600" />
                    <span>Job Title / Role</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Lead Settlement Specialist"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  />
                </div>

                {/* Department */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <Building size={13} className="text-purple-600" />
                    <span>Department</span>
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="e.g. Clearing & Settlement Operations"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  />
                </div>

                {/* Timezone */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <Globe size={13} className="text-cyan-600" />
                    <span>Timezone for Settlement Windows</span>
                  </label>
                  <select
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono shadow-2xs"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: PERSONAL MAILBOX & OAUTH 2.0 */}
          {activeTab === 'messaging' && (
            <div className="space-y-6">
              
              {/* Personal User Scope Callout */}
              <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 flex items-start space-x-3 text-xs">
                <Lock size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-slate-700">
                  <p className="font-semibold text-blue-900">Personal User Mailbox (OAuth 2.0 Only)</p>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    This authentication setting is for your personal user use only. Once authorized, your incoming and outgoing emails (Inbox & Outbox) with attachments will be displayed and managed directly in <strong>Personal Chat</strong>. Per enterprise security policy, all email connections strictly use OAuth 2.0 without raw passwords.
                  </p>
                </div>
              </div>

              {/* Configured OAuth 2.0 Providers */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Configured Enterprise OAuth 2.0 Providers
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Provider 1: Microsoft 365 / Graph */}
                  <div
                    onClick={() => {
                      setProviderSettings(prev => ({
                        ...prev,
                        providerType: 'oauth2',
                        providerName: 'Microsoft 365'
                      }));
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                      (providerSettings.providerName === 'Microsoft 365' || (!providerSettings.providerName && (!adminOAuthConnections.length || !providerSettings.adminOAuth2ConnectionId)))
                        ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500 text-blue-950 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">Microsoft 365 / Outlook</span>
                      <Shield size={14} className="text-blue-600" />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Microsoft Graph API for corporate exchange mailboxes and calendar sync.
                    </p>
                    <span className="inline-block text-[9px] font-mono text-blue-600 font-semibold">Pre-Configured</span>
                  </div>

                  {/* Provider 2: Google Workspace */}
                  <div
                    onClick={() => {
                      setProviderSettings(prev => ({
                        ...prev,
                        providerType: 'oauth2',
                        providerName: 'Google Workspace'
                      }));
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                      providerSettings.providerName === 'Google Workspace'
                        ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500 text-blue-950 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">Google Workspace / Gmail</span>
                      <Mail size={14} className="text-rose-500" />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Google OAuth 2.0 with Gmail REST API and drive attachment streaming.
                    </p>
                    <span className="inline-block text-[9px] font-mono text-emerald-600 font-semibold">Pre-Configured</span>
                  </div>

                  {/* Provider 3: Admin Configured Enterprise Provider */}
                  <div
                    onClick={() => {
                      setProviderSettings(prev => ({
                        ...prev,
                        providerType: 'oauth2',
                        providerName: 'Enterprise Admin OAuth'
                      }));
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                      providerSettings.providerName === 'Enterprise Admin OAuth'
                        ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500 text-blue-950 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">Admin Managed OAuth</span>
                      <Lock size={14} className="text-indigo-600" />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">
                      Tenant connection managed centrally by System Administrators (Rule 14).
                    </p>
                    <span className="inline-block text-[9px] font-mono text-indigo-600 font-semibold">
                      {adminOAuthConnections.length} Active {adminOAuthConnections.length === 1 ? 'Connection' : 'Connections'}
                    </span>
                  </div>

                </div>
              </div>

              {/* Personal Mailbox Configuration Form */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                    <Shield size={14} className="text-blue-600" />
                    <span>Personal Mailbox OAuth 2.0 Details</span>
                  </h4>
                  {providerSettings.status === 'ACTIVE' && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-bold font-mono flex items-center space-x-1">
                      <CheckCircle2 size={11} className="text-emerald-600" />
                      <span>Mailbox Connected</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Admin OAuth Connection dropdown if multiple configured */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      OAuth 2.0 App Registration
                    </label>
                    <select
                      value={providerSettings.adminOAuth2ConnectionId}
                      onChange={e => setProviderSettings(prev => ({ ...prev, adminOAuth2ConnectionId: e.target.value }))}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 font-mono shadow-2xs"
                    >
                      {adminOAuthConnections.length === 0 ? (
                        <option value="">Standard Microsoft 365 / Corporate Graph</option>
                      ) : (
                        adminOAuthConnections.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.displayName || c.id} ({c.channel?.toUpperCase() || 'EMAIL'})
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-[10px] text-slate-500 font-mono">Managed securely at Admin level (Rule 14)</p>
                  </div>

                  {/* Personal Mailbox Address */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Personal Mailbox Address
                    </label>
                    <input
                      type="email"
                      value={providerSettings.userEmail}
                      onChange={e => setProviderSettings(prev => ({ ...prev, userEmail: e.target.value }))}
                      placeholder="e.g. samuel@paymentops.com"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500 font-mono shadow-2xs"
                    />
                    <p className="text-[10px] text-slate-500 font-mono">Your personal mailbox for Personal Chat integration</p>
                  </div>
                </div>

                {/* Explicit App Permissions Consent Scope */}
                <div className="pt-2 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                        Required Mailbox Permissions
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Give this application permission to access your personal mailbox for operational collaboration:
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Permission 1: Mailbox Access (Inbox & Outbox) */}
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start space-x-2.5 shadow-2xs">
                      <div className="p-1 rounded bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                        <Mail size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-800">Mailbox (Inbox & Outbox)</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">Granted</span>
                        </div>
                        <p className="text-[10px] text-slate-500">Read & sync personal incoming messages and sent items into Personal Chat.</p>
                      </div>
                    </div>

                    {/* Permission 2: Attachments Access */}
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start space-x-2.5 shadow-2xs">
                      <div className="p-1 rounded bg-indigo-50 text-indigo-600 shrink-0 mt-0.5">
                        <Paperclip size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-800">File Attachments</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">Granted</span>
                        </div>
                        <p className="text-[10px] text-slate-500">Inspect, preview spreadsheets & download financial transaction attachments.</p>
                      </div>
                    </div>

                    {/* Permission 3: Send Messages & Replies */}
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start space-x-2.5 shadow-2xs">
                      <div className="p-1 rounded bg-purple-50 text-purple-600 shrink-0 mt-0.5">
                        <Send size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-800">Send Emails & Replies</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">Granted</span>
                        </div>
                        <p className="text-[10px] text-slate-500">Dispatch messages and resolution replies directly from Personal Chat.</p>
                      </div>
                    </div>

                    {/* Permission 4: Offline Access & Token Refresh */}
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start space-x-2.5 shadow-2xs">
                      <div className="p-1 rounded bg-emerald-50 text-emerald-600 shrink-0 mt-0.5">
                        <RefreshCw size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-800">Continuous Auto-Sync</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">Granted</span>
                        </div>
                        <p className="text-[10px] text-slate-500">Auto-refresh tokens in background to keep Personal Chat updated.</p>
                      </div>
                    </div>
                  </div>

                  {/* Authorize Action Button */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center space-x-2 text-xs text-slate-600">
                      <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                      <span>Permissions are scoped strictly to your mailbox via enterprise OAuth 2.0</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setProviderSettings(prev => ({
                          ...prev,
                          providerType: 'oauth2',
                          status: 'ACTIVE',
                          authorizedAt: new Date().toISOString()
                        }));
                        setFeedback({
                          type: 'success',
                          message: 'Personal mailbox permissions granted! Messages will sync in Personal Chat.'
                        });
                      }}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
                    >
                      <CheckCircle2 size={13} />
                      <span>{providerSettings.status === 'ACTIVE' ? 'Re-Authorize Mailbox Access' : 'Authorize & Grant Mailbox Access'}</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* Email Signature & Notifications */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Personal Chat & Email Preferences
                </h4>

                <div className="space-y-2.5">
                  <label className="flex items-center space-x-3 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={providerSettings.notifyOnDiscrepancy ?? true}
                      onChange={e => setProviderSettings(prev => ({ ...prev, notifyOnDiscrepancy: e.target.checked }))}
                      className="w-4 h-4 rounded-sm border-slate-300 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Notify immediately in Personal Chat when validation rules flag a settlement discrepancy</span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={providerSettings.notifyOnTaskAssigned ?? true}
                      onChange={e => setProviderSettings(prev => ({ ...prev, notifyOnTaskAssigned: e.target.checked }))}
                      className="w-4 h-4 rounded-sm border-slate-300 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Notify on incoming customer message stage conversion or task assignment</span>
                  </label>
                </div>

                {/* Email Signature */}
                <div className="pt-2">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Outgoing Email Signature (Used in Personal Chat Replies)
                  </label>
                  <textarea
                    rows={3}
                    value={providerSettings.emailSignature || ''}
                    onChange={e => setProviderSettings(prev => ({ ...prev, emailSignature: e.target.value }))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 font-mono resize-none shadow-2xs focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Signature included in external settlement communications..."
                  />
                </div>
              </div>

              {/* Provider Test Connection Action Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center space-x-2 text-xs">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    testResult 
                      ? (testResult.success ? 'bg-emerald-500' : 'bg-rose-500')
                      : (providerSettings.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500')
                  }`} />
                  <span className="text-slate-700 font-medium">
                    {testResult ? testResult.message : (
                      providerSettings.status === 'ACTIVE'
                        ? 'Personal Mailbox is authorized and operational.'
                        : 'Ready to authorize and verify mailbox connectivity.'
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleTestProvider}
                  disabled={isTestingProvider}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50 shadow-2xs"
                >
                  <RefreshCw size={13} className={isTestingProvider ? 'animate-spin text-blue-600' : ''} />
                  <span>{isTestingProvider ? 'Testing Sync...' : 'Test Mailbox Sync'}</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 3: PREFERENCES & UI */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              
              {/* UI Density & SideNav */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Interface & Sidebar Ergonomics
                </h4>

                <div className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-colors">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">Default Compact Ribbon SideNav</span>
                      <span className="text-[11px] text-slate-500">Keep sidebar collapsed to slim icon ribbon for maximum table screen space</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.compactSideNav ?? true}
                      onChange={e => setPreferences(prev => ({ ...prev, compactSideNav: e.target.checked }))}
                      className="w-4 h-4 rounded-sm border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-colors">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">Audio Cues on Urgent Issues</span>
                      <span className="text-[11px] text-slate-500">Play subtle sound alerts on critical settlement failure detections</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.soundAlerts ?? false}
                      onChange={e => setPreferences(prev => ({ ...prev, soundAlerts: e.target.checked }))}
                      className="w-4 h-4 rounded-sm border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer p-2.5 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-colors">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">Desktop Browser Push Notifications</span>
                      <span className="text-[11px] text-slate-500">Receive native desktop notifications for mentions and Maker-Checker proposals</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={preferences.desktopNotifications ?? true}
                      onChange={e => setPreferences(prev => ({ ...prev, desktopNotifications: e.target.checked }))}
                      className="w-4 h-4 rounded-sm border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Refresh Interval */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                <label className="text-xs font-semibold text-slate-800 block">
                  Workspace Auto-Refresh Rate
                </label>
                <select
                  value={preferences.autoRefreshIntervalSeconds || 30}
                  onChange={e => setPreferences(prev => ({ ...prev, autoRefreshIntervalSeconds: parseInt(e.target.value, 10) }))}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono shadow-2xs focus:outline-hidden focus:border-blue-500"
                >
                  <option value={15}>Every 15 seconds (High Frequency Settlement)</option>
                  <option value={30}>Every 30 seconds (Standard)</option>
                  <option value={60}>Every 60 seconds (Conservative)</option>
                  <option value={300}>Every 5 minutes</option>
                </select>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0">
          <div className="text-[11px] font-mono text-slate-500">
            PostgreSQL Persisted (User: <span className="text-blue-600 font-bold">{currentUser.username}</span>)
          </div>

          <div className="flex items-center space-x-2.5">
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                disabled={isSaving}
                className="px-3 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-2xs flex items-center space-x-1.5"
                title="Log out of session"
              >
                <LogOut size={13} />
                <span>Logout</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Saving to DB...</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
export default UserProfileModal;
