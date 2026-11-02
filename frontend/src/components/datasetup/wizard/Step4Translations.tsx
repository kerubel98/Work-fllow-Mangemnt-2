/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BookOpen, Sparkles, Plus } from 'lucide-react';

export interface Step4TranslationsProps {
  initialDictionaries?: any[];
  onNext: (appliedTranslations: any[]) => void;
  onBack: () => void;
}

export function Step4Translations({ initialDictionaries, onNext, onBack }: Step4TranslationsProps) {
  const [translations, setTranslations] = useState([
    {
      id: 'dict-inst',
      columns: 'institution1, institution2',
      title: 'Institution IDs → names',
      example: '02 → Awash Bank',
      enabled: true
    },
    {
      id: 'dict-status',
      columns: 'status_state',
      title: 'Transaction status codes → names',
      example: 'STL → Settled',
      enabled: true
    },
    {
      id: 'dict-iso',
      columns: 'resp_code',
      title: 'ISO 8583 codes → descriptions',
      example: '51 → Insufficient funds',
      enabled: false
    }
  ]);

  const toggleTranslation = (id: string) => {
    setTranslations(prev =>
      prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t)
    );
  };

  const handleContinue = () => {
    const active = translations.filter(t => t.enabled);
    onNext(active);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-8 text-xs text-slate-800">
      <div className="max-w-3xl space-y-6">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Turn codes into names</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
              Optional
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            We found code-like columns and matched them to your value dictionaries. You can change this later.
          </p>
        </div>

        {/* Translation Cards matching 65_step4_translations.png */}
        <div className="space-y-3">
          {translations.map(t => (
            <div
              key={t.id}
              className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-xs hover:border-slate-300 transition"
            >
              <div className="flex items-center space-x-3.5">
                <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                  <BookOpen size={15} />
                </div>
                <div>
                  <div className="font-mono font-bold text-slate-900 text-xs">{t.columns}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{t.title}</div>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  {t.example}
                </span>

                {/* Modern Toggle Switch */}
                <button
                  type="button"
                  onClick={() => toggleTranslation(t.id)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    t.enabled ? 'bg-[#F97316]' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                      t.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Helper tip matching 65_step4_translations.png */}
        <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center space-x-2 text-slate-500 text-xs">
          <Sparkles size={14} className="text-slate-400 shrink-0" />
          <div>
            <span className="font-mono font-semibold text-slate-700">resp_code</span> has no dictionary yet.{' '}
            <span className="font-bold text-slate-800 underline cursor-pointer">Create one</span> or skip. Skipped columns still work, they just show raw codes.
          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs transition cursor-pointer"
        >
          Back
        </button>

        <div className="text-[11px] text-slate-400">
          You can skip this step.
        </div>

        <button
          type="button"
          onClick={handleContinue}
          className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-xs"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

export default Step4Translations;

