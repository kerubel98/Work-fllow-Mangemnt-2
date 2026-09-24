import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type NavigationTab = 
  | 'workspace'
  | 'team_workspace'
  | 'direct_chat'
  | 'manager_analytics'
  | 'authority_center'
  | 'workspace_settings'
  | 'system_settings'
  | 'admin_panel'
  | 'admin_team_resources'
  | 'validation_box_manager'
  | 'workflow_studio'
  | 'db_mirror_config';

export interface NavigationParams {
  selectedIssueId?: string;
  selectedTaskId?: string;
  selectedWorkflowId?: string;
  selectedTeamId?: string;
  activeAdminSubTab?: 'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins';
  activeSettingsTab?: 'general' | 'workflow' | 'governance' | 'notifications' | 'data';
  [key: string]: any;
}

interface NavigationContextType {
  activeTab: NavigationTab;
  params: NavigationParams;
  navigateTo: (tab: NavigationTab, newParams?: Partial<NavigationParams>) => void;
  setParams: (updater: (prev: NavigationParams) => NavigationParams) => void;
  clearParams: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: ReactNode; initialTab?: NavigationTab }> = ({ 
  children, 
  initialTab = 'workspace' 
}) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>(initialTab);
  const [params, setParamsState] = useState<NavigationParams>({});

  const navigateTo = useCallback((tab: NavigationTab, newParams?: Partial<NavigationParams>) => {
    setActiveTab(tab);
    if (newParams) {
      setParamsState(prev => ({ ...prev, ...newParams }));
    }
  }, []);

  const setParams = useCallback((updater: (prev: NavigationParams) => NavigationParams) => {
    setParamsState(updater);
  }, []);

  const clearParams = useCallback(() => {
    setParamsState({});
  }, []);

  return (
    <NavigationContext.Provider value={{ activeTab, params, navigateTo, setParams, clearParams }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = (): NavigationContextType => {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
};
