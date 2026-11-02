/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, Database, Folder } from 'lucide-react';
import { User } from '../../../types';
import { api } from '../../../api/client';
import { globalMappingService } from '../../../services/globalMappingService';
import { Step1Connect } from './Step1Connect';
import { Step2ChooseTables } from './Step2ChooseTables';
import { Step3MapColumns } from './Step3MapColumns';
import { Step4Translations } from './Step4Translations';
import { Step5ReviewActivate } from './Step5ReviewActivate';
import { ColumnActionsPopover } from '../../database/ColumnActionsPopover';

export interface DataSetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: 1 | 2 | 3 | 4 | 5;
  resource?: any;
  currentUser?: User;
  onSaved: (resource: any) => void;
}

export function DataSetupWizardModal({
  isOpen,
  onClose,
  initialStep = 1,
  resource,
  currentUser,
  onSaved
}: DataSetupWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(initialStep);

  // Wizard Accumulated State
  const [wizardData, setWizardData] = useState<any>({
    name: resource?.name || 'Sett',
    type: resource?.type || 'MySQL',
    host: resource?.host || '127.0.0.1:3306',
    tables: ['auth_log_tab', 'sv_fin_tab', 'tran_log_tab', 'usonas_fin_tab'],
    mappings: {},
    translations: [],
    status: resource?.status || 'SETUP_NOT_FINISHED'
  });

  // Screen 67 Leave Guard State
  const [isLeaveGuardOpen, setIsLeaveGuardOpen] = useState(false);
  const [isColumnActionsOpen, setIsColumnActionsOpen] = useState(false);
  const [selectedColumnForActions, setSelectedColumnForActions] = useState<string>('Transaction_Place');

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(initialStep || 1);
      if (resource) {
        setWizardData(prev => ({
          ...prev,
          ...resource
        }));
      }
    }
  }, [isOpen, initialStep, resource]);

  if (!isOpen) return null;

  // Stepper steps configuration
  const steps = [
    { number: 1, title: 'Connect', sub: 'Credentials and test' },
    { number: 2, title: 'Choose tables', sub: 'What IssueTrace may read' },
    { number: 3, title: 'Map columns', sub: 'Link to global fields' },
    { number: 4, title: 'Add translations', sub: 'Codes to names (optional)' },
    { number: 5, title: 'Review & activate', sub: 'Make it usable' }
  ];

  const handleAttemptClose = () => {
    // If on or past step 3 and required mapping isn't finished, show Leave Guard (Screen 67)
    if (currentStep >= 3 && wizardData.status !== 'READY') {
      setIsLeaveGuardOpen(true);
    } else {
      onClose();
    }
  };

  const handleConfirmExit = () => {
    setIsLeaveGuardOpen(false);
    onSaved({
      ...wizardData,
      setupStep: currentStep,
      status: 'SETUP_NOT_FINISHED',
      statusLabel: 'Setup not finished'
    });
    onClose();
  };

  const handleActivate = async () => {
    try {
      if (wizardData.type === 'MySQL' || wizardData.type === 'PostgreSQL') {
        const payload: any = {
          name: wizardData.name,
          type: wizardData.type.toLowerCase(),
          host: wizardData.host?.split(':')[0] || wizardData.host,
          port: Number(wizardData.port || (wizardData.type === 'PostgreSQL' ? 5432 : 3306)),
          database: wizardData.database || 'bo_test',
          username: wizardData.username || 'root',
          status: 'ACTIVE',
          scope: wizardData.scope || 'team',
          allowedTables: wizardData.tables || []
        };
        if (currentUser?.teamId && wizardData.scope === 'team') {
          await api.createTeamDatabase(currentUser.teamId, payload).catch(() => {});
        } else {
          await api.createDatabase(payload).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Activate persistence notice:', e);
    }

    onSaved({
      ...wizardData,
      setupStep: 5,
      status: 'READY',
      statusLabel: 'Ready',
      isMapped: true
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl w-full max-w-6xl h-[88vh] overflow-hidden flex flex-col"
        style={{ zoom: 0.9 }}
      >
        {/* Top Bar matching 62-68 */}
        <div className="px-8 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div>
            <div className="text-[11px] font-semibold text-slate-400">
              Data setup / {resource ? resource.name : 'Add resource'}
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {wizardData.name} · {wizardData.type}
            </h1>
          </div>

          <div className="flex items-center space-x-3">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>Draft · not usable yet</span>
            </span>

            <button
              type="button"
              onClick={handleAttemptClose}
              className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Save & exit
            </button>
          </div>
        </div>

        {/* Wizard Main Grid: Stepper (Left 280px) + Step Body (Right Flex-1) */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Stepper Sidebar matching 62-68 */}
          <div className="w-72 border-r border-slate-100 p-6 flex flex-col justify-between shrink-0 bg-white">
            <div className="space-y-6">
              {steps.map((st) => {
                const isPassed = currentStep > st.number;
                const isCurrent = currentStep === st.number;

                return (
                  <div key={st.number} className="flex items-start space-x-3">
                    {/* Circle */}
                    <div 
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                        isPassed
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-[#F97316] text-white ring-4 ring-orange-100'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isPassed ? <Check size={14} /> : st.number}
                    </div>

                    {/* Step Title & Subtitle */}
                    <div className="min-w-0">
                      <div className={`font-bold text-xs ${isCurrent ? 'text-slate-900' : isPassed ? 'text-slate-700' : 'text-slate-400'}`}>
                        {st.title}
                      </div>
                      <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                        {st.sub}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-[11px] text-slate-400 pt-6 border-t border-slate-100">
              ✓ Saved automatically.<br />
              Required: steps 1 to 3 and 5.
            </div>
          </div>

          {/* Active Step Content */}
          <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50/30">
            {currentStep === 1 && (
              <Step1Connect
                initialData={wizardData}
                onNext={(step1Data) => {
                  setWizardData(prev => ({ ...prev, ...step1Data }));
                  setCurrentStep(2);
                }}
                onBack={onClose}
              />
            )}

            {currentStep === 2 && (
              <Step2ChooseTables
                initialTables={wizardData.tables}
                onNext={(selectedTables) => {
                  setWizardData(prev => ({ ...prev, tables: selectedTables }));
                  setCurrentStep(3);
                }}
                onBack={() => setCurrentStep(1)}
              />
            )}

            {currentStep === 3 && (
              <Step3MapColumns
                resourceType={wizardData.type}
                selectedTables={wizardData.tables}
                initialMappings={wizardData.mappings}
                onNext={(mappings) => {
                  setWizardData(prev => ({ ...prev, mappings }));
                  setCurrentStep(4);
                }}
                onBack={() => setCurrentStep(2)}
                onOpenMergeColumns={() => {
                  setSelectedColumnForActions('Transaction_Place');
                  setIsColumnActionsOpen(true);
                }}
                onOpenColumnActions={(colName) => {
                  setSelectedColumnForActions(colName);
                  setIsColumnActionsOpen(true);
                }}
              />
            )}

            {currentStep === 4 && (
              <Step4Translations
                initialDictionaries={wizardData.translations}
                onNext={(translations) => {
                  setWizardData(prev => ({ ...prev, translations }));
                  setCurrentStep(5);
                }}
                onBack={() => setCurrentStep(3)}
              />
            )}

            {currentStep === 5 && (
              <Step5ReviewActivate
                summaryData={wizardData}
                onEditStep={(stepNum) => setCurrentStep(stepNum)}
                onActivate={handleActivate}
                onBack={() => setCurrentStep(4)}
              />
            )}
          </div>
        </div>

        {/* Screen 67 Leave Guard Modal */}
        {isLeaveGuardOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl w-full max-w-md p-6 flex flex-col" style={{ zoom: 0.95 }}>
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center mb-4">
                <AlertTriangle size={20} />
              </div>

              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Leave before mapping is finished?
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Your progress is saved. But <strong className="text-slate-800">{wizardData.name}</strong> stays in draft and cannot be used in rules, workflows, searches or queries until the required fields are mapped.
              </p>

              <div className="mt-4 p-2.5 bg-rose-50 border border-rose-200/80 rounded-xl text-rose-700 text-xs font-semibold">
                1 required field left: refnum
              </div>

              <div className="mt-6 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={handleConfirmExit}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs transition cursor-pointer"
                >
                  Save & exit
                </button>
                <button
                  type="button"
                  onClick={() => setIsLeaveGuardOpen(false)}
                  className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-xs"
                >
                  Keep mapping
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Column Actions Popover / Modals (Screen 52) */}
        <ColumnActionsPopover
          isOpen={isColumnActionsOpen}
          onClose={() => setIsColumnActionsOpen(false)}
          columnName={selectedColumnForActions || 'Transaction_Place'}
          onSplitColumn={({ part1Name, part2Name }) => {
            setWizardData((prev: any) => ({
              ...prev,
              mappings: {
                ...prev.mappings,
                [part1Name]: 'terminal_id',
                [part2Name]: 'tran_place'
              }
            }));
            setIsColumnActionsOpen(false);
          }}
          onMergeColumns={({ newColumnName }) => {
            setWizardData((prev: any) => ({
              ...prev,
              mappings: {
                ...prev.mappings,
                [newColumnName]: 'tran_place'
              }
            }));
            setIsColumnActionsOpen(false);
          }}
          onAddToGlobalFields={({ fieldKey, label, type, category, autoMap }) => {
            // Register field with Global Mapping Service so it persists in the standard dictionary
            globalMappingService.addStandardField({
              key: fieldKey,
              label: label || fieldKey,
              dataType: (type as any) || 'string',
              category: category || 'General',
              required: false
            });

            if (autoMap && selectedColumnForActions) {
              setWizardData((prev: any) => ({
                ...prev,
                mappings: {
                  ...prev.mappings,
                  [selectedColumnForActions]: fieldKey
                }
              }));
            }
            setIsColumnActionsOpen(false);
          }}
          onUnmapColumn={(colName) => {
            setWizardData((prev: any) => {
              const updated = { ...prev.mappings };
              delete updated[colName];
              return { ...prev, mappings: updated };
            });
            setIsColumnActionsOpen(false);
          }}
        />
      </div>
    </div>
  );
}

export default DataSetupWizardModal;

