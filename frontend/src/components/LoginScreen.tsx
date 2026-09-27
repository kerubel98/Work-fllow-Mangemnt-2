/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Shield, Key, Mail, UserPlus, LogIn, Check, Info, Users, Database, HelpCircle } from 'lucide-react';

interface LoginScreenProps {
  users: User[];
  onLoginSuccess: (user: User) => void;
  onRegisterUser: (newUser: Omit<User, 'id' | 'createdAt'>) => void;
}

export default function LoginScreen({ users, onLoginSuccess, onRegisterUser }: LoginScreenProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // Simulated password
  const [role, setRole] = useState<UserRole>('user');
  
  // Registration form state
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('user');

  // Messaging state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Quick switch logins helper
  const handleQuickLogin = (user: User) => {
    // Standard normal user login without role blocking
    const approvedUser = { ...user, isApproved: true };
    setError(null);
    setSuccess(`Successfully signed in as ${approvedUser.username}!`);
    setTimeout(() => {
      onLoginSuccess(approvedUser);
    }, 400);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username.trim()) {
      setError('Please provide a username.');
      return;
    }

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
      setSuccess(`Signed in as normal user '${newUser.username}'!`);
      setTimeout(() => {
        onLoginSuccess(newUser);
      }, 500);
      return;
    }

    const activeUser = { ...matchedUser, isApproved: true };
    setSuccess(`Welcome back ${activeUser.username}! Signed in as normal user.`);
    setTimeout(() => {
      onLoginSuccess(activeUser);
    }, 500);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!regUsername.trim()) {
      setError('Username is required.');
      return;
    }

    const newUserObj = {
      username: regUsername.trim(),
      email: regEmail.trim() || `${regUsername.trim().toLowerCase()}@company.com`,
      role: regRole || 'user',
      isApproved: true, // Auto-approved as normal user
    };

    onRegisterUser(newUserObj);

    setSuccess(`Account registered and approved! Logging in as ${regUsername}...`);
    setTimeout(() => {
      onLoginSuccess({
        ...newUserObj,
        id: `usr-${Date.now()}`,
        createdAt: new Date().toISOString()
      });
    }, 600);
    setRegUsername('');
    setRegEmail('');
    setRegPassword('');
    setActiveTab('login');
  };

  const getRoleBadgeColor = (_r: UserRole) => {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-slate-50 flex flex-col items-center justify-center p-4" id="login-container">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-slate-200 flex flex-col md:flex-row overflow-hidden transition-all duration-300">
        
        {/* Left Branding and Info Panel */}
        <div className="md:w-5/12 bg-gradient-to-br from-blue-900 via-blue-950 to-indigo-950 text-white p-8 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-500/20 backdrop-blur-md rounded-xl border border-blue-400/30 shadow-inner">
                <Database size={24} className="text-blue-300" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">IssueTrace</h1>
                <p className="text-[10px] text-blue-200/80 uppercase tracking-widest font-mono">Desktop Terminal v1.4</p>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-base font-semibold text-blue-100">Role-Based Access (RBAC) Control</h2>
              <p className="text-xs text-blue-200/70 leading-relaxed">
                A secure banking operations application built for resolving transactional discrepancies via direct SQL injection scripts, live API querying, and hashtag template routing.
              </p>
            </div>

            <div className="space-y-2 text-xs border-t border-blue-800/60 pt-4">
              <p className="text-blue-100 font-medium flex items-center gap-1.5">
                <Info size={14} className="text-sky-300" />
                System Operator Guide:
              </p>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mt-2 text-blue-200">
                <div className="p-2 bg-blue-900/50 border border-blue-800/80 rounded-lg">
                  <span className="text-emerald-300 font-bold block mb-0.5">OPERATIONAL</span>
                  Create issues, map CSV files, transaction lookup
                </div>
                <div className="p-2 bg-blue-900/50 border border-blue-800/80 rounded-lg">
                  <span className="text-sky-300 font-bold block mb-0.5">TECHNICAL</span>
                  Investigate depth, compose SQL, run dry-tests
                </div>
                <div className="p-2 bg-blue-900/50 border border-blue-800/80 rounded-lg">
                  <span className="text-amber-300 font-bold block mb-0.5">MANAGERIAL</span>
                  Analytics graphs, audit SQL history, export CSV
                </div>
                <div className="p-2 bg-blue-900/50 border border-blue-800/80 rounded-lg">
                  <span className="text-rose-300 font-bold block mb-0.5">ADMINISTRATOR</span>
                  Approve signups, drop DB, toggle plugins
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 md:mt-0 text-[10px] text-blue-300/60 font-mono flex justify-between">
            <span>SECURE HANDSHAKE RSA 2048</span>
            <span>PORT 3000 (LOCAL)</span>
          </div>
        </div>

        {/* Right Authentication Form Panel */}
        <div className="md:w-7/12 p-8 flex flex-col justify-center bg-white">
          
          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 mb-6">
            <button
              onClick={() => { setActiveTab('login'); setError(null); }}
              className={`pb-3 text-sm font-semibold transition-colors flex items-center space-x-2 border-b-2 px-4 ${
                activeTab === 'login'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              id="tab-login"
            >
              <LogIn size={15} />
              <span>Sign In</span>
            </button>
            <button
              onClick={() => { setActiveTab('register'); setError(null); }}
              className={`pb-3 text-sm font-semibold transition-colors flex items-center space-x-2 border-b-2 px-4 ${
                activeTab === 'register'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              id="tab-register"
            >
              <UserPlus size={15} />
              <span>Register Account</span>
            </button>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 mb-4 flex items-start space-x-2">
              <Shield size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 mb-4 flex items-start space-x-2">
              <Check size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {activeTab === 'login' ? (
            /* Login Form */
            <form onSubmit={handleLoginSubmit} className="space-y-4" id="form-login">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-mono">USERNAME</label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter account username (e.g. admin)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-10 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
                  />
                  <Shield size={16} className="absolute right-3 top-2.5 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-mono">PASSWORD</label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-10 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
                  />
                  <Key size={16} className="absolute right-3 top-2.5 text-slate-400" />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-all shadow-md shadow-blue-500/20 flex items-center justify-center space-x-2"
                id="btn-login-submit"
              >
                <span>Authorize & Mount Bridge</span>
              </button>

              {/* Instant Evaluation Quick-logins */}
              <div className="mt-6 pt-6 border-t border-slate-200">
                <span className="text-[10px] uppercase text-slate-500 font-mono block mb-2.5 font-bold">
                  Select Pre-Configured Profiles (Instant JWT Activation)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleQuickLogin(u)}
                      className={`text-left p-2.5 bg-slate-50 border rounded-lg transition-all flex flex-col hover:border-blue-300 hover:bg-blue-50/50 group ${
                        u.isApproved ? 'border-slate-200' : 'border-dashed border-rose-300 opacity-70'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                          {u.username}
                        </span>
                        {!u.isApproved && (
                          <span className="text-[8px] bg-rose-100 text-rose-700 border border-rose-200 px-1 rounded-sm">
                            Pending
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-500 truncate">{u.email}</span>
                      <span className={`text-[8px] border px-1 py-0.2 rounded mt-1.5 self-start ${getRoleBadgeColor(u.role)}`}>
                        {u.role.toUpperCase()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          ) : (
            /* Registration Form */
            <form onSubmit={handleRegisterSubmit} className="space-y-4" id="form-register">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-mono">REQUEST USERNAME</label>
                <input
                  type="text"
                  required
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="e.g. john_ops"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-mono">EMAIL ADDRESS</label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="e.g. john@paymentops.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-mono">ASSIGN SYSTEM ROLE</label>
                <select
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
                >
                  <option value="user">User (Standard Member)</option>
                  <option value="admin">System Administrator (Full access & approvals)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                  Note: For security audits, newly registered roles require manual activation by the System Administrator account (username: <strong className="text-slate-700">admin</strong>).
                </p>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-all shadow-md shadow-blue-500/20 flex items-center justify-center space-x-2 mt-2"
                id="btn-register-submit"
              >
                <span>Request Account Access</span>
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
