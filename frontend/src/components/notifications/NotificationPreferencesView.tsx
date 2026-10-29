/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Bell,
  Monitor,
  Mail,
  Volume2,
  Lock,
  Save,
  Send,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';
import { UserNotificationPreferences, ChannelNotificationSettings } from '../../types';
import { api } from '../../api/client';

interface NotificationPreferencesViewProps {
  userId?: string;
  onPreferencesSaved?: (prefs: UserNotificationPreferences) => void;
  onBackToNotifications?: () => void;
}

const DEFAULT_PREFERENCES: UserNotificationPreferences = {
  userId: 'admin',
  escalationsAndAssignments: { inApp: true, desktopPush: true, email: true, sound: true },
  mentions: { inApp: true, desktopPush: true, email: true, sound: false },
  approvalsAndReviews: { inApp: true, desktopPush: true, email: true, sound: false },
  investigationRuns: { inApp: true, desktopPush: false, email: false, sound: false },
  hashtagReports: { inApp: true, desktopPush: false, email: true, sound: false },
  slaWarnings: { inApp: true, desktopPush: true, email: true, sound: true },
  systemAndConnections: { inApp: true, desktopPush: true, email: true, sound: true },
  quietHours: { enabled: true, start: '22:00', end: '06:00' },
  emailDigest: { frequency: 'weekly', day: 'Monday', time: '08:00' },
  behavior: { floatingToasts: true, audioCueOnUrgent: false, markAsReadOnOpen: true }
};

export default function NotificationPreferencesView({
  userId = 'admin',
  onPreferencesSaved,
  onBackToNotifications
}: NotificationPreferencesViewProps) {
  const [prefs, setPrefs] = useState<UserNotificationPreferences>(DEFAULT_PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    api.getNotificationPreferences(userId)
      .then(res => {
        if (res && res.userId) {
          setPrefs(res);
        }
      })
      .catch(err => console.warn('Could not load notification preferences:', err));
  }, [userId]);

  const toggleChannel = (
    category:
      | 'escalationsAndAssignments'
      | 'mentions'
      | 'approvalsAndReviews'
      | 'investigationRuns'
      | 'hashtagReports',
    channel: keyof ChannelNotificationSettings
  ) => {
    setPrefs(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !prev[category][channel]
      }
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await api.saveNotificationPreferences(prefs);
      setPrefs(saved);
      setSaveSuccess(true);
      if (onPreferencesSaved) onPreferencesSaved(saved);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    setIsTesting(true);
    try {
      await api.sendTestNotification(userId);
    } catch (err) {
      console.warn('Failed to send test notification:', err);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#F8FAFC]">
      {/* 1. Header */}
      <div className="px-8 py-5 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 font-sans">
            <button
              onClick={onBackToNotifications}
              className="hover:text-slate-700 transition-colors cursor-pointer"
            >
              Settings
            </button>
            <span>/</span>
            <span className="text-slate-700 font-medium">Notifications</span>
          </div>
          <h1 className="text-xl font-heading font-bold text-slate-900 tracking-tight mt-1">
            Notification preferences
          </h1>
          <p className="text-xs text-slate-500 font-sans mt-0.5">
            Choose what reaches you and where. Critical alerts cannot be turned off.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleSendTest}
            disabled={isTesting}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:text-slate-900 shadow-2xs transition-all cursor-pointer"
          >
            <Send size={13} className="text-slate-500" />
            <span>{isTesting ? 'Sending...' : 'Send a test'}</span>
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[#F27421] hover:bg-[#d96215] text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 size={14} />
                <span>Preferences saved!</span>
              </>
            ) : (
              <>
                <Save size={14} />
                <span>{isSaving ? 'Saving...' : 'Save preferences'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Main Content Grid */}
      <div className="p-8 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Matrix Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 pb-3">
                  <th className="pb-3 font-normal">What</th>
                  <th className="pb-3 font-normal text-center w-20">
                    <div className="flex items-center justify-center space-x-1">
                      <Bell size={13} />
                      <span>In-app</span>
                    </div>
                  </th>
                  <th className="pb-3 font-normal text-center w-24">
                    <div className="flex items-center justify-center space-x-1">
                      <Monitor size={13} />
                      <span>Desktop push</span>
                    </div>
                  </th>
                  <th className="pb-3 font-normal text-center w-20">
                    <div className="flex items-center justify-center space-x-1">
                      <Mail size={13} />
                      <span>Email</span>
                    </div>
                  </th>
                  <th className="pb-3 font-normal text-center w-20">
                    <div className="flex items-center justify-center space-x-1">
                      <Volume2 size={13} />
                      <span>Sound</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                
                {/* 1. Escalations and assignments */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 pr-4">
                    <span className="font-heading font-semibold text-slate-900 block">
                      Escalations and assignments
                    </span>
                    <span className="text-slate-400 text-[11px] font-sans">
                      You are assigned or an escalation arrives
                    </span>
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.escalationsAndAssignments.inApp}
                      onChange={() => toggleChannel('escalationsAndAssignments', 'inApp')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.escalationsAndAssignments.desktopPush}
                      onChange={() => toggleChannel('escalationsAndAssignments', 'desktopPush')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.escalationsAndAssignments.email}
                      onChange={() => toggleChannel('escalationsAndAssignments', 'email')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.escalationsAndAssignments.sound}
                      onChange={() => toggleChannel('escalationsAndAssignments', 'sound')}
                    />
                  </td>
                </tr>

                {/* 2. Mentions */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 pr-4">
                    <span className="font-heading font-semibold text-slate-900 block">
                      Mentions
                    </span>
                    <span className="text-slate-400 text-[11px] font-sans">
                      @you or @@your team in a discussion
                    </span>
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.mentions.inApp}
                      onChange={() => toggleChannel('mentions', 'inApp')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.mentions.desktopPush}
                      onChange={() => toggleChannel('mentions', 'desktopPush')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.mentions.email}
                      onChange={() => toggleChannel('mentions', 'email')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.mentions.sound}
                      onChange={() => toggleChannel('mentions', 'sound')}
                    />
                  </td>
                </tr>

                {/* 3. Approvals and reviews */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 pr-4">
                    <span className="font-heading font-semibold text-slate-900 block">
                      Approvals and reviews
                    </span>
                    <span className="text-slate-400 text-[11px] font-sans">
                      Checker or maker updates on your requests
                    </span>
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.approvalsAndReviews.inApp}
                      onChange={() => toggleChannel('approvalsAndReviews', 'inApp')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.approvalsAndReviews.desktopPush}
                      onChange={() => toggleChannel('approvalsAndReviews', 'desktopPush')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.approvalsAndReviews.email}
                      onChange={() => toggleChannel('approvalsAndReviews', 'email')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.approvalsAndReviews.sound}
                      onChange={() => toggleChannel('approvalsAndReviews', 'sound')}
                    />
                  </td>
                </tr>

                {/* 4. Investigation runs */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 pr-4">
                    <span className="font-heading font-semibold text-slate-900 block">
                      Investigation runs
                    </span>
                    <span className="text-slate-400 text-[11px] font-sans">
                      Finished, paused or failed runs
                    </span>
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.investigationRuns.inApp}
                      onChange={() => toggleChannel('investigationRuns', 'inApp')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.investigationRuns.desktopPush}
                      onChange={() => toggleChannel('investigationRuns', 'desktopPush')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.investigationRuns.email}
                      onChange={() => toggleChannel('investigationRuns', 'email')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.investigationRuns.sound}
                      onChange={() => toggleChannel('investigationRuns', 'sound')}
                    />
                  </td>
                </tr>

                {/* 5. Hashtag reports */}
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 pr-4">
                    <span className="font-heading font-semibold text-slate-900 block">
                      Hashtag reports
                    </span>
                    <span className="text-slate-400 text-[11px] font-sans">
                      Weekly digest and every failure
                    </span>
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.hashtagReports.inApp}
                      onChange={() => toggleChannel('hashtagReports', 'inApp')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.hashtagReports.desktopPush}
                      onChange={() => toggleChannel('hashtagReports', 'desktopPush')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.hashtagReports.email}
                      onChange={() => toggleChannel('hashtagReports', 'email')}
                    />
                  </td>
                  <td className="py-4 text-center">
                    <ToggleSwitch
                      checked={prefs.hashtagReports.sound}
                      onChange={() => toggleChannel('hashtagReports', 'sound')}
                    />
                  </td>
                </tr>

                {/* 6. SLA warnings (Locked ON) */}
                <tr className="bg-amber-50/20">
                  <td className="py-4 pr-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-heading font-semibold text-slate-900">
                        SLA warnings
                      </span>
                      <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                        <Lock size={9} />
                        <span>Always on</span>
                      </span>
                    </div>
                    <span className="text-slate-400 text-[11px] font-sans">
                      Response or resolution clock reaches 80%
                    </span>
                  </td>
                  <td className="py-4 text-center"><ToggleSwitch checked={true} disabled={true} /></td>
                  <td className="py-4 text-center"><ToggleSwitch checked={true} disabled={true} /></td>
                  <td className="py-4 text-center"><ToggleSwitch checked={true} disabled={true} /></td>
                  <td className="py-4 text-center"><ToggleSwitch checked={true} disabled={true} /></td>
                </tr>

                {/* 7. System and connections (Locked ON) */}
                <tr className="bg-rose-50/20">
                  <td className="py-4 pr-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-heading font-semibold text-slate-900">
                        System and connections
                      </span>
                      <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                        <Lock size={9} />
                        <span>Always on</span>
                      </span>
                    </div>
                    <span className="text-slate-400 text-[11px] font-sans">
                      Databases offline, staging errors
                    </span>
                  </td>
                  <td className="py-4 text-center"><ToggleSwitch checked={true} disabled={true} /></td>
                  <td className="py-4 text-center"><ToggleSwitch checked={true} disabled={true} /></td>
                  <td className="py-4 text-center"><ToggleSwitch checked={true} disabled={true} /></td>
                  <td className="py-4 text-center"><ToggleSwitch checked={true} disabled={true} /></td>
                </tr>

              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Settings Cards */}
        <div className="space-y-6">

          {/* Card 1: Quiet Hours */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-xs text-slate-900">Quiet hours</h3>
              <ToggleSwitch
                checked={prefs.quietHours.enabled}
                onChange={() => setPrefs(prev => ({
                  ...prev,
                  quietHours: { ...prev.quietHours, enabled: !prev.quietHours.enabled }
                }))}
              />
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Silence sound and push. Critical alerts still come through.
            </p>
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="text"
                value={prefs.quietHours.start}
                onChange={e => setPrefs(prev => ({
                  ...prev,
                  quietHours: { ...prev.quietHours, start: e.target.value }
                }))}
                className="w-20 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-center outline-none focus:bg-white focus:border-[#F27421]"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="text"
                value={prefs.quietHours.end}
                onChange={e => setPrefs(prev => ({
                  ...prev,
                  quietHours: { ...prev.quietHours, end: e.target.value }
                }))}
                className="w-20 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-center outline-none focus:bg-white focus:border-[#F27421]"
              />
            </div>
          </div>

          {/* Card 2: Email Digest */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <h3 className="font-heading font-bold text-xs text-slate-900">Email digest</h3>
            <p className="text-[11px] text-slate-400 font-sans">
              One email instead of many for low-priority updates.
            </p>

            {/* Segmented frequency toggle */}
            <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200/60">
              {(['off', 'daily', 'weekly'] as const).map(freq => (
                <button
                  key={freq}
                  onClick={() => setPrefs(prev => ({
                    ...prev,
                    emailDigest: { ...prev.emailDigest, frequency: freq }
                  }))}
                  className={`flex-1 py-1 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                    prefs.emailDigest.frequency === freq
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {freq}
                </button>
              ))}
            </div>

            {/* Day & Time selection */}
            {prefs.emailDigest.frequency === 'weekly' && (
              <div className="flex items-center space-x-2 pt-1">
                <select
                  value={prefs.emailDigest.day}
                  onChange={e => setPrefs(prev => ({
                    ...prev,
                    emailDigest: { ...prev.emailDigest, day: e.target.value }
                  }))}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:bg-white focus:border-[#F27421]"
                >
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                </select>

                <input
                  type="text"
                  value={prefs.emailDigest.time}
                  onChange={e => setPrefs(prev => ({
                    ...prev,
                    emailDigest: { ...prev.emailDigest, time: e.target.value }
                  }))}
                  className="w-20 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-center outline-none focus:bg-white focus:border-[#F27421]"
                />
              </div>
            )}
          </div>

          {/* Card 3: Behavior */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            <h3 className="font-heading font-bold text-xs text-slate-900">Behavior</h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700">Floating toasts for new items</span>
                <ToggleSwitch
                  checked={prefs.behavior.floatingToasts}
                  onChange={() => setPrefs(prev => ({
                    ...prev,
                    behavior: { ...prev.behavior, floatingToasts: !prev.behavior.floatingToasts }
                  }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700">Audio cue on urgent issues</span>
                <ToggleSwitch
                  checked={prefs.behavior.audioCueOnUrgent}
                  onChange={() => setPrefs(prev => ({
                    ...prev,
                    behavior: { ...prev.behavior, audioCueOnUrgent: !prev.behavior.audioCueOnUrgent }
                  }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700">Mark as read when I open the item</span>
                <ToggleSwitch
                  checked={prefs.behavior.markAsReadOnOpen}
                  onChange={() => setPrefs(prev => ({
                    ...prev,
                    behavior: { ...prev.behavior, markAsReadOnOpen: !prev.behavior.markAsReadOnOpen }
                  }))}
                />
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled = false
}: {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-50 bg-[#F27421]'
          : checked
          ? 'bg-[#F27421] cursor-pointer'
          : 'bg-slate-200 hover:bg-slate-300 cursor-pointer'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
