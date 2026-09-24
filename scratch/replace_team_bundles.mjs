import fs from 'fs';

const filePath = 'c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/TeamWorkspace.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const targetStart = `          {/* SUBTAB 1: APPROVALS */}`;
const targetEnd = `          {/* SUBTAB 2: CROSS-TEAM VISIBILITY GRANTS */}`;

const startIndex = content.indexOf(targetStart);
const endIndex = content.indexOf(targetEnd);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find markers!', { startIndex, endIndex });
  process.exit(1);
}

const replacement = `          {/* SUBTAB 1: WORKFLOW BUNDLES & COMPOSITE ASSETS (Layer 2 Governance) */}
          {((activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'bundles' || (activeTab === 'team_settings' ? teamSettingsSubTab : activeTab) === 'approvals') && (
            <div className="space-y-5 font-mono text-xs" id="team-bundles-container">
              {/* Header Banner */}
              <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-5 text-slate-800 space-y-2 shadow-xs">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-100 text-[#155DFC] border border-blue-200 rounded-xl">
                    <Boxes size={22} />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold tracking-tight text-blue-950 uppercase">
                        Team Workflow Bundles &amp; Composite Assets
                      </h3>
                      <span className="text-[9px] bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                        Layer 2 Governance
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-800/80 font-sans mt-0.5">
                      Deterministic operational bundles linking Flowchart DAGs, Validation Boxes, and DB Table Mappings. Multi-tier promotion adheres to Maker-Checker dual authorization.
                    </p>
                  </div>
                </div>
              </div>

              {/* Informative Authority Center Redirect Banner */}
              <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs text-xs">
                <div className="flex items-center space-x-2.5 text-amber-950 min-w-0">
                  <ShieldCheck size={18} className="text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">Dual-Authorization Approvals Segregated:</span>{' '}
                    <span className="text-slate-600">Financial overrides and bundle promotions to Enterprise scope are reviewed strictly in the Operational Authority Center under Four-Eyes control.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => window.location.hash = '#authority_center'}
                  className="font-bold text-[#155DFC] hover:underline cursor-pointer whitespace-nowrap self-start sm:self-auto shrink-0"
                >
                  Open Authority Center &rarr;
                </button>
              </div>

              {bundleActionMsg && (
                <div className={\`p-3 rounded-xl border text-xs font-mono font-medium flex items-center space-x-2 \${
                  bundleActionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                }\`}>
                  {bundleActionMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{bundleActionMsg.text}</span>
                </div>
              )}

              {/* Workflow Bundles Grid */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-800 text-sm">Published Team Bundles</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 font-bold">
                      {teamBundles.length} Bundles
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadGovernanceData()}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                    title="Refresh Bundles"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                {teamBundles.length === 0 ? (
                  <div className="text-center py-10 space-y-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 p-6">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#155DFC] mx-auto shadow-xs">
                      <Boxes size={24} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-800 text-sm">No Workflow Bundles Configured Yet</h4>
                      <p className="text-xs text-slate-500 max-w-md mx-auto font-sans">
                        Assemble your Flowchart DAGs and attached Validation Boxes into versioned bundles in Workflow Studio to enable team deployment and enterprise promotion.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {teamBundles.map(bundle => (
                      <div 
                        key={bundle.id}
                        className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 space-y-3 hover:border-blue-300 transition-all shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 font-mono font-bold text-[10px] rounded-md">
                                {bundle.bundleCode}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 font-bold">
                                v{bundle.version}
                              </span>
                            </div>
                            <h4 className="font-bold text-slate-900 text-sm mt-1">{bundle.name}</h4>
                            {bundle.description && (
                              <p className="text-[11px] text-slate-600 font-sans mt-0.5 line-clamp-2">
                                {bundle.description}
                              </p>
                            )}
                          </div>
                          <span className={\`px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 \${
                            bundle.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            bundle.status === 'PENDING_CHECKER_REVIEW' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            bundle.status === 'REJECTED' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            'bg-slate-200 text-slate-700'
                          }\`}>
                            {bundle.status}
                          </span>
                        </div>

                        {/* Bundle Metadata Pills */}
                        <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-600">
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">
                            Scope: <strong className="text-slate-800">{bundle.scope}</strong>
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">
                            Boxes: <strong className="text-slate-800">{bundle.validationBoxIds?.length || 0}</strong>
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">
                            DB Checks: <strong className="text-slate-800">{bundle.dbCheckIds?.length || 0}</strong>
                          </span>
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md">
                            Maker: <strong className="text-slate-800">{bundle.makerName}</strong>
                          </span>
                        </div>

                        {/* Promotion Actions */}
                        <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                          <div className="text-[10px] text-slate-500 font-mono">
                            {bundle.status === 'APPROVED' && bundle.checkerName && (
                              <span>Authorized by {bundle.checkerName}</span>
                            )}
                          </div>

                          {bundle.scope !== 'GLOBAL_ENTERPRISE' && bundle.status !== 'PENDING_CHECKER_REVIEW' && (
                            <button
                              type="button"
                              disabled={promotingBundleId === bundle.id}
                              onClick={() => handlePromoteBundle(bundle)}
                              className="px-3 py-1 bg-[#155DFC] hover:bg-blue-600 text-white rounded-xl text-xs font-bold font-mono transition cursor-pointer flex items-center space-x-1 shadow-2xs disabled:opacity-50"
                            >
                              <ArrowUpRight size={13} />
                              <span>{promotingBundleId === bundle.id ? 'Submitting...' : 'Promote to Enterprise'}</span>
                            </button>
                          )}

                          {bundle.status === 'PENDING_CHECKER_REVIEW' && (
                            <span className="text-[10px] text-amber-700 font-mono font-bold flex items-center space-x-1">
                              <Clock size={12} />
                              <span>Pending Checker in Authority Center</span>
                            </span>
                          )}

                          {bundle.scope === 'GLOBAL_ENTERPRISE' && bundle.status === 'APPROVED' && (
                            <span className="text-[10px] text-emerald-700 font-mono font-bold flex items-center space-x-1">
                              <ShieldCheck size={12} />
                              <span>Enterprise Active</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

`;

const newContent = content.slice(0, startIndex) + replacement + content.slice(endIndex);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Successfully replaced approvals with Workflow Bundles & Assets!');
