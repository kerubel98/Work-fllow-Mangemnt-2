import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export type MessageModalType = 'info' | 'success' | 'warning' | 'error' | 'confirm';

export interface MessageModalOptions {
  title?: string;
  message: string;
  type?: MessageModalType;
  confirmText?: string;
  confirmLabel?: string;
  cancelText?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

// Global dispatcher to open message modal from anywhere in the application
export function showSystemAlert(options: string | MessageModalOptions) {
  const detail: MessageModalOptions = typeof options === 'string'
    ? { message: options }
    : options;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-system-message-modal', { detail }));
  }
}

export const MessageModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<MessageModalOptions>({ message: '' });

  useEffect(() => {
    // Intercept native browser alert to route to this dedicated pop-up modal across the entire system
    const originalAlert = window.alert;
    window.alert = (message: any) => {
      const msgStr = typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message);
      
      let inferredType: MessageModalType = 'info';
      let inferredTitle = 'System Notification';

      const lower = msgStr.toLowerCase();
      if (lower.includes('fail') || lower.includes('error') || lower.includes('invalid') || lower.includes('cannot')) {
        inferredType = 'error';
        inferredTitle = 'Action Failed';
      } else if (lower.includes('success') || lower.includes('saved') || lower.includes('reconciled') || lower.includes('completed')) {
        inferredType = 'success';
        inferredTitle = 'Action Successful';
      } else if (lower.includes('warning') || lower.includes('please') || lower.includes('required') || lower.includes('must')) {
        inferredType = 'warning';
        inferredTitle = 'Attention Required';
      }

      setConfig({
        title: inferredTitle,
        message: msgStr,
        type: inferredType,
        confirmText: 'Acknowledge'
      });
      setIsOpen(true);
    };

    const handleCustomModal = (e: Event) => {
      const customEvent = e as CustomEvent<MessageModalOptions>;
      if (customEvent.detail) {
        setConfig({
          title: customEvent.detail.title || (
            customEvent.detail.type === 'confirm' ? 'Confirm Action' :
            customEvent.detail.type === 'error' ? 'Error' :
            customEvent.detail.type === 'success' ? 'Success' :
            customEvent.detail.type === 'warning' ? 'Notice' : 'Information'
          ),
          message: customEvent.detail.message,
          type: customEvent.detail.type || 'info',
          confirmText: customEvent.detail.confirmLabel || customEvent.detail.confirmText || (customEvent.detail.type === 'confirm' ? 'Confirm' : 'OK'),
          cancelText: customEvent.detail.cancelLabel || customEvent.detail.cancelText || 'Cancel',
          onConfirm: customEvent.detail.onConfirm,
          onCancel: customEvent.detail.onCancel
        });
        setIsOpen(true);
      }
    };

    window.addEventListener('app-system-message-modal', handleCustomModal);

    return () => {
      window.alert = originalAlert;
      window.removeEventListener('app-system-message-modal', handleCustomModal);
    };
  }, []);

  const handleCancel = () => {
    setIsOpen(false);
    if (config.onCancel) {
      try {
        config.onCancel();
      } catch (err) {
        console.error('Error in onCancel callback:', err);
      }
    }
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (config.onConfirm) {
      try {
        config.onConfirm();
      } catch (err) {
        console.error('Error in onConfirm callback:', err);
      }
    }
  };

  if (!isOpen) return null;

  const typeStyles: Record<string, { bg: string; border: string; icon: React.ReactNode; btn: string; titleColor: string }> = {
    info: {
      bg: 'bg-blue-950/90',
      border: 'border-blue-500/50',
      icon: <Info size={22} className="text-blue-400" />,
      btn: 'bg-blue-600 hover:bg-blue-500 text-white',
      titleColor: 'text-blue-200'
    },
    success: {
      bg: 'bg-emerald-950/90',
      border: 'border-emerald-500/50',
      icon: <CheckCircle2 size={22} className="text-emerald-400" />,
      btn: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      titleColor: 'text-emerald-200'
    },
    warning: {
      bg: 'bg-amber-950/90',
      border: 'border-amber-500/50',
      icon: <AlertTriangle size={22} className="text-amber-400" />,
      btn: 'bg-amber-600 hover:bg-amber-500 text-white',
      titleColor: 'text-amber-200'
    },
    error: {
      bg: 'bg-rose-950/90',
      border: 'border-rose-500/50',
      icon: <AlertCircle size={22} className="text-rose-400" />,
      btn: 'bg-rose-600 hover:bg-rose-500 text-white',
      titleColor: 'text-rose-200'
    },
    confirm: {
      bg: 'bg-slate-950/95',
      border: 'border-red-500/50',
      icon: <AlertTriangle size={22} className="text-red-400" />,
      btn: 'bg-red-600 hover:bg-red-500 text-white font-bold',
      titleColor: 'text-red-200'
    }
  };

  const selectedType = (config.type && typeStyles[config.type]) ? config.type : 'info';
  const styles = typeStyles[selectedType];

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden bg-slate-900 ${styles.border} text-white animate-in zoom-in-95 duration-200`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className={`px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between ${styles.bg}`}>
          <div className="flex items-center gap-2.5">
            <div className="shrink-0">{styles.icon}</div>
            <h3 className={`font-bold text-sm tracking-tight ${styles.titleColor}`}>
              {config.title || 'System Message'}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition cursor-pointer"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Message Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2 text-slate-200">
          <p className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
            {config.message}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2.5">
          {config.type === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                {config.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-md cursor-pointer ${styles.btn}`}
              >
                {config.confirmText || 'Confirm'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-md cursor-pointer ${styles.btn}`}
            >
              {config.confirmText || 'OK'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageModal;
