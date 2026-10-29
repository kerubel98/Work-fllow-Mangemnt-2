/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  X,
  ExternalLink,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Server,
  Flag
} from 'lucide-react';
import { AppNotification } from '../../types';

export interface ToastItem {
  id: string;
  notification: AppNotification;
  autoHide: boolean;
}

interface NotificationToastsAndBannerProps {
  notifications: AppNotification[];
  criticalBannerItem?: AppNotification | null;
  onDismissBanner?: () => void;
  onNotificationClick: (notif: AppNotification) => void;
  onTakeAction?: (notif: AppNotification) => void;
  enableFloatingToasts?: boolean;
}

export default function NotificationToastsAndBanner({
  notifications,
  criticalBannerItem,
  onDismissBanner,
  onNotificationClick,
  onTakeAction,
  enableFloatingToasts = true
}: NotificationToastsAndBannerProps) {
  const [activeToasts, setActiveToasts] = useState<ToastItem[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Auto-detect newly received notification and trigger a floating toast
  useEffect(() => {
    if (!enableFloatingToasts || notifications.length === 0) return;
    const latest = notifications[0];

    // Only toast if unread and recent (under 15 seconds)
    const isRecent = (Date.now() - new Date(latest.timestamp).getTime()) < 15000;
    if (latest && !latest.isRead && isRecent) {
      setActiveToasts(prev => {
        if (prev.some(t => t.id === latest.id)) return prev;
        const isUrgent = latest.priority === 'needs_action' || latest.priority === 'critical' || latest.category === 'sla' || latest.category === 'system';
        const newToast: ToastItem = {
          id: latest.id,
          notification: latest,
          autoHide: !isUrgent // warning and critical stay until dismissed
        };
        return [newToast, ...prev.slice(0, 3)];
      });
    }
  }, [notifications, enableFloatingToasts]);

  // Handle auto-dismiss for info/success toasts after 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveToasts(prev => prev.filter(t => !t.autoHide));
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const dismissToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  };

  // Determine active critical banner item
  const effectiveCritical = !bannerDismissed
    ? (criticalBannerItem || notifications.find(n => n.priority === 'critical' && !n.isRead) || null)
    : null;

  return (
    <>
      {/* 1. Critical Banner (sits under top bar on every page until handled) */}
      {effectiveCritical && (
        <div className="w-full bg-rose-50 border-b border-rose-200/90 px-6 py-2.5 flex items-center justify-between z-30 shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center space-x-2.5 text-xs text-rose-900">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <span className="font-semibold">
              {effectiveCritical.title}:
            </span>
            <span className="text-rose-800">
              {effectiveCritical.message}
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => {
                onNotificationClick(effectiveCritical);
              }}
              className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-800 font-semibold text-xs border border-rose-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Open
            </button>
            <button
              onClick={() => {
                setBannerDismissed(true);
                if (onDismissBanner) onDismissBanner();
              }}
              className="p-1 text-rose-400 hover:text-rose-700 transition-colors cursor-pointer"
              title="Dismiss banner"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 2. Floating Toasts (Bottom-Right, 49_notification_states) */}
      {enableFloatingToasts && activeToasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3 max-w-sm w-full pointer-events-none">
          {activeToasts.map(toast => {
            const notif = toast.notification;
            const isWarning = notif.category === 'sla' || notif.priority === 'needs_action';
            const isCritical = notif.priority === 'critical' || notif.category === 'system';

            const accentBorder = isCritical
              ? 'border-l-4 border-l-rose-500'
              : isWarning
              ? 'border-l-4 border-l-amber-500'
              : 'border-l-4 border-l-emerald-500';

            const icon = isCritical
              ? <Server size={16} className="text-rose-500" />
              : isWarning
              ? <Clock size={16} className="text-amber-500" />
              : <CheckCircle2 size={16} className="text-emerald-500" />;

            const actionLabel = notif.actionLabel ||
              (notif.type === 'task_assigned' ? 'Stage task' : (isCritical ? 'Open' : 'View'));

            return (
              <div
                key={toast.id}
                className={`pointer-events-auto bg-white rounded-xl shadow-xl border border-slate-200/90 p-4 flex items-start space-x-3 ${accentBorder} animate-in slide-in-from-bottom-2 fade-in duration-200`}
              >
                <div className="shrink-0 mt-0.5">
                  {icon}
                </div>

                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between">
                    <h5 className="font-heading font-semibold text-xs text-slate-900 truncate pr-2">
                      {notif.title}
                    </h5>
                    <button
                      onClick={() => dismissToast(toast.id)}
                      className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-500 font-sans mt-0.5 line-clamp-2">
                    {notif.message}
                  </p>

                  <div className="mt-2.5 flex items-center">
                    <button
                      onClick={() => {
                        dismissToast(toast.id);
                        if (onTakeAction) onTakeAction(notif);
                        else onNotificationClick(notif);
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
                    >
                      {actionLabel}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
