/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Database, Folder, Plus, AlertTriangle, RefreshCw
} from 'lucide-react';
import { User } from '../../types';
import { api } from '../../api/client';
import { globalMappingService } from '../../services/globalMappingService';
import { DataSetupWizardModal } from './wizard/DataSetupWizardModal';
import { ResourceDetailView } from './ResourceDetailView';
import { MappingDictionaryView } from './MappingDictionaryView';
import { ValueDictionariesView } from './ValueDictionariesView';

export interface DataSetupLandingViewProps {
  currentUser?: User;
  onOpenMappingDictionary?: () => void;
  onOpenValueDictionaries?: () => void;
}

export function DataSetupLandingView({
  currentUser,
  onOpenMappingDictionary,
  onOpenValueDictionaries
}: DataSetupLandingViewProps) {
  const [activeTab, setActiveTab] = useState<'resources' | 'mapping' | 'values'>('resources');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardTargetResource, setWizardTargetResource] = useState<any | null>(null);
  const [wizardInitialStep, setWizardInitialStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Active Resource for Resource Detail View (Screens 69 & 70)
  const [selectedResourceDetail, setSelectedResourceDetail] = useState<any | null>(null);

  // Initial resources matching 61_resources_list.png
  const [resources, setResources] = useState<any[]>([
    {
      id: 'res-core-ledger',
      name: 'Core Ledger',
      type: 'PostgreSQL',
      host: '10.0.4.12:5432',
      contents: '3 tables',
      setupStep: 3,
      totalSteps: 5,
      status: 'SETUP_NOT_FINISHED',
      statusLabel: 'Setup not finished',
      isMapped: false,
      missingFields: ['refnum']
    },
    {
      id: 'res-sett',
      name: 'Sett',
      type: 'MySQL',
      host: '127.0.0.1:3306',
      contents: '4 tables',
      setupStep: 5,
      totalSteps: 5,
      status: 'READY',
      statusLabel: 'Ready',
      isMapped: true
    },
    {
      id: 'res-local-ftp',
      name: 'LocalFTP',
      type: 'SFTP',
      host: '127.0.0.1:22',
      contents: '1 feeds',
      setupStep: 5,
      totalSteps: 5,
      status: 'READY',
      statusLabel: 'Ready',
      isMapped: true
    },
    {
      id: 'res-mongo',
      name: 'MongoDB Operational Workflow',
      type: 'MongoDB',
      host: '127.0.0.1:27017',
      contents: '0 tables',
      setupStep: 0,
      totalSteps: 5,
      status: 'DIAGNOSTIC_ONLY',
      statusLabel: 'Diagnostic only',
      isMapped: false
    },
    {
      id: 'res-settlem-ftp',
      name: 'SettlemFTP',
      type: 'SFTP',
      host: '192.168.22.210:2222',
      contents: '1 feeds',
      setupStep: 5,
      totalSteps: 5,
      status: 'OFFLINE',
      statusLabel: 'Offline',
      isMapped: true
    }
  ]);

  // Load real databases and FTP configs from PostgreSQL backend
  useEffect(() => {
    let isMounted = true;
    Promise.allSettled([
      api.getDatabases(),
      api.getFtpStagingConfigs()
    ]).then(([dbsRes, ftpRes]) => {
      if (!isMounted) return;
      const loadedDbs = dbsRes.status === 'fulfilled' && Array.isArray(dbsRes.value) ? dbsRes.value : [];
      const loadedFtp = ftpRes.status === 'fulfilled' && Array.isArray(ftpRes.value) ? ftpRes.value : [];

      if (loadedDbs.length > 0 || loadedFtp.length > 0) {
        setResources(prev => {
          const list = [...prev];
          loadedDbs.forEach(db => {
            if (!list.some(r => r.id === db.id || r.name?.toLowerCase() === db.name?.toLowerCase())) {
              list.push({
                id: db.id,
                name: db.name || db.database,
                type: db.type?.toUpperCase() || 'POSTGRESQL',
                host: `${db.host || '127.0.0.1'}:${db.port || 5432}`,
                contents: `${(db.availableTables || db.allowedTables || []).length} tables`,
                setupStep: 5,
                totalSteps: 5,
                status: db.status === 'ACTIVE' ? 'READY' : 'OFFLINE',
                statusLabel: db.status === 'ACTIVE' ? 'Ready' : 'Offline',
                isMapped: true
              });
            }
          });
          return list;
        });
      }
    });

    return () => { isMounted = false; };
  }, []);

  const handleOpenAddResource = () => {
    setWizardTargetResource(null);
    setWizardInitialStep(1);
    setIsWizardOpen(true);
  };

  const handleContinueSetup = (res: any) => {
    setWizardTargetResource(res);
    setWizardInitialStep((res.setupStep as any) || 3);
    setIsWizardOpen(true);
  };

  const handleOpenResource = (res: any) => {
    setSelectedResourceDetail(res);
  };

  const hasIncompleteCoreLedger = resources.some(r => r.name === 'Core Ledger' && r.status !== 'READY');

  // If viewing a specific resource's detail page (Screen 69 or 70)
  if (selectedResourceDetail) {
    return (
      <ResourceDetailView
        resource={selectedResourceDetail}
        onBack={() => setSelectedResourceDetail(null)}
        onEditSetup={(step) => {
          setWizardTargetResource(selectedResourceDetail);
          setWizardInitialStep(step || 1);
          setIsWizardOpen(true);
        }}
        onEditTableMapping={(tableName) => {
          setWizardTargetResource(selectedResourceDetail);
          setWizardInitialStep(3);
          setIsWizardOpen(true);
        }}
        currentUser={currentUser}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto text-slate-800 text-xs p-8" style={{ zoom: 0.9 }}>
      {/* Top Header matching 61, 71 & 72 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-slate-400">Admin / Data setup</div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">Data setup</h1>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === 'resources'
              ? 'Connect an outside system, choose what to read, and map it. All in one guided flow.'
              : 'Resources, the field dictionary, and value translations.'}
          </p>
        </div>

        {activeTab === 'resources' && (
          <button
            type="button"
            onClick={handleOpenAddResource}
            className="px-4 py-2.5 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs shadow-xs transition cursor-pointer flex items-center space-x-1.5"
          >
            <Plus size={15} />
            <span>Add resource</span>
          </button>
        )}
      </div>

      {/* 3 Tabs matching 73_data_setup_structure.png */}
      <div className="flex border-b border-slate-200 mt-6 gap-6 text-xs font-semibold shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('resources')}
          className={`pb-3 border-b-2 transition cursor-pointer ${
            activeTab === 'resources'
              ? 'border-orange-500 text-orange-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Resources <span className="ml-1 px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">{resources.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('mapping')}
          className={`pb-3 border-b-2 transition cursor-pointer ${
            activeTab === 'mapping'
              ? 'border-orange-500 text-orange-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Mapping dictionary <span className="ml-1 px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">499</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('values')}
          className={`pb-3 border-b-2 transition cursor-pointer ${
            activeTab === 'values'
              ? 'border-orange-500 text-orange-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Value dictionaries <span className="ml-1 px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">6</span>
        </button>
      </div>

      {/* TAB 1: RESOURCES LIST (Screen 61) */}
      {activeTab === 'resources' && (
        <div className="space-y-6 mt-5">
          {/* Warning Banner: Core Ledger Incomplete */}
          {hasIncompleteCoreLedger && (
            <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-center justify-between text-xs text-amber-900 shadow-xs">
              <div className="flex items-center space-x-2.5">
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                <span>
                  <strong className="text-amber-950">Core Ledger is not usable yet.</strong> A resource cannot be used in rules, workflows or queries until its required fields are mapped.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleContinueSetup(resources[0])}
                className="px-3 py-1.5 bg-white border border-amber-200 hover:bg-amber-50 text-amber-900 rounded-xl font-semibold text-xs transition cursor-pointer shadow-2xs"
              >
                Continue setup
              </button>
            </div>
          )}

          {/* Resources Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-medium text-[11px] bg-slate-50/50">
                  <th className="py-3 px-5">Resource</th>
                  <th className="py-3 px-5">Contents</th>
                  <th className="py-3 px-5">Setup progress</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {resources.map((res) => (
                  <tr key={res.id} className="hover:bg-slate-50/50 transition">
                    {/* Resource Info */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                          {res.type === 'SFTP' ? <Folder size={15} /> : <Database size={15} />}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{res.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {res.type} · {res.host}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Contents */}
                    <td className="py-3.5 px-5 font-medium text-slate-700">
                      {res.contents}
                    </td>

                    {/* Setup Progress */}
                    <td className="py-3.5 px-5">
                      {res.status === 'DIAGNOSTIC_ONLY' ? (
                        <div className="flex items-center space-x-2">
                          <div className="w-24 h-1.5 bg-slate-200 rounded-full" />
                          <span className="text-[11px] text-slate-400">n/a</span>
                        </div>
                      ) : res.isMapped ? (
                        <div className="flex items-center space-x-2">
                          <div className="w-24 h-1.5 bg-emerald-500 rounded-full" />
                          <span className="text-[11px] text-slate-600 font-medium">Mapped</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#F97316] rounded-full"
                              style={{ width: `${(res.setupStep / res.totalSteps) * 100}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">Step {res.setupStep} of {res.totalSteps}</span>
                        </div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-5">
                      {res.status === 'READY' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 inline-flex items-center space-x-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Ready</span>
                        </span>
                      )}
                      {res.status === 'SETUP_NOT_FINISHED' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 inline-flex items-center space-x-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>Setup not finished</span>
                        </span>
                      )}
                      {res.status === 'DIAGNOSTIC_ONLY' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center space-x-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span>Diagnostic only</span>
                        </span>
                      )}
                      {res.status === 'OFFLINE' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60 inline-flex items-center space-x-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          <span>Offline</span>
                        </span>
                      )}
                    </td>

                    {/* Action CTA */}
                    <td className="py-3.5 px-5 text-right">
                      {res.status === 'SETUP_NOT_FINISHED' ? (
                        <button
                          type="button"
                          onClick={() => handleContinueSetup(res)}
                          className="px-3.5 py-1.5 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-2xs"
                        >
                          Continue setup
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenResource(res)}
                          className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-medium text-xs transition cursor-pointer shadow-2xs"
                        >
                          Open
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom 3 Explanatory Cards matching 61_resources_list.png */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-1.5">
              <h3 className="font-bold text-slate-900 text-xs">How adding a resource works</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Connect, choose tables, map columns, add translations, then activate. Your progress is saved at every step.
              </p>
            </div>

            <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-1.5">
              <h3 className="font-bold text-slate-900 text-xs">Mapping is required</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                The flow ends at mapping on purpose. Unmapped resources stay in draft and never reach workflows.
              </p>
            </div>

            <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-1.5">
              <h3 className="font-bold text-slate-900 text-xs">Replaces two old tabs</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Table mapping and File staging now live inside each resource, as steps 3 and 2.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MAPPING DICTIONARY (Screen 71) */}
      {activeTab === 'mapping' && (
        <div className="mt-5">
          <MappingDictionaryView />
        </div>
      )}

      {/* TAB 3: VALUE DICTIONARIES (Screen 72) */}
      {activeTab === 'values' && (
        <div className="mt-5">
          <ValueDictionariesView />
        </div>
      )}

      {/* Guided 5-Step Wizard Modal */}
      <DataSetupWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        initialStep={wizardInitialStep}
        resource={wizardTargetResource}
        currentUser={currentUser}
        onSaved={(updatedResource) => {
          setIsWizardOpen(false);
          if (updatedResource) {
            setResources(prev => {
              const idx = prev.findIndex(r => r.id === updatedResource.id);
              if (idx !== -1) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...updatedResource };
                return next;
              }
              return [...prev, updatedResource];
            });
            if (selectedResourceDetail && selectedResourceDetail.id === updatedResource.id) {
              setSelectedResourceDetail(updatedResource);
            }
          }
        }}
      />
    </div>
  );
}

export default DataSetupLandingView;
