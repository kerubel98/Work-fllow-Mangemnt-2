/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { 
  ShieldCheck, Shield, Key, Mail, UserPlus, LogIn, Check, Info, Users, Database, Sparkles, ArrowRight 
} from 'lucide-react';
import { Button } from './common/Button';
import { Badge } from './common/Badge';

interface LoginScreenProps {
  users: User[];
  onLoginSuccess: (user: User) => void;
  onRegisterUser: (newUser: Omit<User, 'id' | 'createdAt'>) => void;
}

export default function LoginScreen({ users, onLoginSuccess, onRegisterUser }: LoginScreenProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  
  // Registration form state
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('user');

  // Messaging state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick switch logins helper
  const handleQuickLogin = (user: User) => {
    const approvedUser = { ...user, isApproved: true };
    setError(null);
    setSuccess(`Signing in as ${approvedUser.username}...`);
    setIsSubmitting(true);
    setTimeout(() => {
      onLoginSuccess(approvedUser);
    }, 350);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username.trim()) {
      setError('Please provide a username.');
      return;
    }

    setIsSubmitting(true);

    const matchedUser = users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!matchedUser) {
      // Auto-create & login as normal user if not found
      const newUser: User = {
        id: `usr-${Date.now()}`,
        username: username.trim(),
        email: `${username.trim().toLowerCase()}@company.com`,
        role: 'user',
        isApproved: true,
        createdAt: new Date().toISOString()
      };
      setSuccess(`Signed in as '${newUser.username}'!`);
      setTimeout(() => {
        onLoginSuccess(newUser);
      }, 400);
      return;
    }

    const activeUser = { ...matchedUser, isApproved: true };
    setSuccess(`Welcome back, ${activeUser.username}!`);
    setTimeout(() => {
      onLoginSuccess(activeUser);
    }, 400);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!regUsername.trim()) {
      setError('Username is required.');
      return;
    }

    setIsSubmitting(true);

    const newUserObj = {
      username: regUsername.trim(),
      email: regEmail.trim() || `${regUsername.trim().toLowerCase()}@company.com`,
      role: regRole || 'user',
      isApproved: true,
    };

    onRegisterUser(newUserObj);

    setSuccess(`Account registered successfully! Logging in as ${regUsername}...`);
    setTimeout(() => {
      onLoginSuccess({
        ...newUserObj,
        id: `usr-${Date.now()}`,
        createdAt: new Date().toISOString()
      });
    }, 500);
    setRegUsername('');
    setRegEmail('');
    setRegPassword('');
    setActiveTab('login');
  };

  return (
    <div 
      className="min-h-[calc(100vh-2.75rem)] w-full flex items-center justify-center p-4 bg-[#07080f] relative overflow-hidden select-none"
      id="login-container"
      style={{
        backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% 100%, #1a2744 0%, #07080f 75%)'
      }}
    >
      {/* Ambient background glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#3b6cff]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Centered Frosted Glass Card */}
      <div className="w-full max-w-lg bg-slate-900/70 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-6 sm:p-8 z-10 text-slate-100 transition-all duration-300 panel-enter">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3b6cff] to-[#1e40af] flex items-center justify-center shadow-[0_0_24px_rgba(59,108,255,0.4)] mb-3">
            <ShieldCheck size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white font-sans flex items-center gap-2">
            IssueTrace
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-500/25 font-mono">
              v1.4
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
            Operational Workflow Management & Reconciliation Platform
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex rounded-lg bg-slate-950/60 p-1 border border-white/5 mb-5">
          <button
            onClick={() => { setActiveTab('login'); setError(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'login'
                ? 'bg-[#3b6cff] text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            id="tab-login"
          >
            <LogIn size={13} />
            <span>Sign In</span>
          </button>
          <button
            onClick={() => { setActiveTab('register'); setError(null); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'register'
                ? 'bg-[#3b6cff] text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
            id="tab-register"
          >
            <UserPlus size={13} />
            <span>Request Access</span>
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 mb-4 flex items-start space-x-2 animate-in fade-in">
            <Shield size={15} className="text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 mb-4 flex items-start space-x-2 animate-in fade-in">
            <Check size={15} className="text-emerald-400 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {activeTab === 'login' ? (
          /* Sign In Form */
          <form onSubmit={handleLoginSubmit} className="space-y-4" id="form-login">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username (e.g. admin)"
                  className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg py-2.5 pl-3.5 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#3b6cff] focus:ring-2 focus:ring-[#3b6cff]/20 transition-all"
                  autoFocus
                />
                <Shield size={16} className="absolute right-3.5 top-3 text-slate-500" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg py-2.5 pl-3.5 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#3b6cff] focus:ring-2 focus:ring-[#3b6cff]/20 transition-all"
                />
                <Key size={16} className="absolute right-3.5 top-3 text-slate-500" />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              className="w-full mt-2"
              id="btn-login-submit"
            >
              Sign In
            </Button>

            {/* Quick Access Profiles Section */}
            <div className="mt-6 pt-5 border-t border-white/8">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-mono">
                  Quick Access Profiles
                </span>
                <span className="text-[10px] text-slate-500">1-click demo</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {users.slice(0, 4).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickLogin(u)}
                    className="p-2.5 bg-slate-950/40 hover:bg-slate-800/60 border border-white/5 hover:border-[#3b6cff]/40 rounded-xl transition-all flex flex-col text-left group cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center space-x-1.5">
                        <div className="w-5 h-5 rounded-full bg-slate-800 text-slate-200 group-hover:bg-[#3b6cff] group-hover:text-white transition-colors flex items-center justify-center font-bold text-[9px]">
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">
                          {u.username}
                        </span>
                      </div>
                      <Badge variant={u.role} size="xs" />
                    </div>
                    <span className="text-[9.5px] text-slate-500 truncate">{u.email}</span>
                  </button>
                ))}
              </div>
            </div>
          </form>
        ) : (
          /* Request Account Form */
          <form onSubmit={handleRegisterSubmit} className="space-y-4" id="form-register">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                Requested Username
              </label>
              <input
                type="text"
                required
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="e.g. john_ops"
                className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg py-2 px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#3b6cff] focus:ring-2 focus:ring-[#3b6cff]/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                Work Email Address
              </label>
              <input
                type="email"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="e.g. john@operations.com"
                className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg py-2 px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#3b6cff] focus:ring-2 focus:ring-[#3b6cff]/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">
                System Role
              </label>
              <select
                value={regRole}
                onChange={(e) => setRegRole(e.target.value as UserRole)}
                className="w-full bg-slate-950/60 border border-slate-700/60 rounded-lg py-2 px-3 text-sm text-slate-100 focus:outline-none focus:border-[#3b6cff] focus:ring-2 focus:ring-[#3b6cff]/20 transition-all"
              >
                <option value="user" className="bg-slate-900 text-white">Standard Member</option>
                <option value="operational" className="bg-slate-900 text-white">Operational Operator</option>
                <option value="technical" className="bg-slate-900 text-white">Technical Engineer</option>
                <option value="managerial" className="bg-slate-900 text-white">Manager / Auditor</option>
                <option value="admin" className="bg-slate-900 text-white">System Administrator</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Newly registered roles are automatically assigned standard operational privileges.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              className="w-full mt-3"
              id="btn-register-submit"
            >
              Request Account Access
            </Button>
          </form>
        )}

      </div>
    </div>
  );
}
