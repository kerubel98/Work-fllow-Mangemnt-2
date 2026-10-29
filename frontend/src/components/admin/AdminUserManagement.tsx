import React from 'react';
import { User, UserRole } from '../../types';
import PeopleAccessView from './PeopleAccessView';

interface AdminUserManagementProps {
  users: User[];
  onApproveUser: (userId: string) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateUserPrivileges?: (
    userId: string, 
    updates: { 
      canExecuteSelect?: boolean; 
      canExecuteUpdate?: boolean; 
      role?: UserRole;
      allowedDbIds?: string[];
    }
  ) => void;
}

export default function AdminUserManagement({
  users,
  onApproveUser,
  onDeleteUser,
  onUpdateUserPrivileges
}: AdminUserManagementProps) {
  const dummyUser = users[0] || { id: 'admin', username: 'admin', email: 'admin@paymentops.com', role: 'admin' as UserRole, isApproved: true, createdAt: new Date().toISOString() };
  return (
    <PeopleAccessView
      currentUser={dummyUser}
      users={users}
      onApproveUser={onApproveUser}
      onDeleteUser={onDeleteUser}
      onUpdateUserPrivileges={onUpdateUserPrivileges}
    />
  );
}
