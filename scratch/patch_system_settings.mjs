import fs from 'fs';
import path from 'path';

const filePath = path.resolve('frontend/src/components/settings/SystemSettings.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add state hooks for togglingRequiredKey, autoClassifying, importingJson
const stateTarget = `  const [jsonError, setJsonError] = useState<string | null>(null);`;
const stateReplacement = `  const [jsonError, setJsonError] = useState<string | null>(null);
  const [togglingRequiredKey, setTogglingRequiredKey] = useState<string | null>(null);
  const [autoClassifying, setAutoClassifying] = useState(false);
  const [importingJson, setImportingJson] = useState(false);`;

if (!content.includes(stateTarget)) {
  console.error('Target 1 not found');
  process.exit(1);
}
content = content.replace(stateTarget, stateReplacement);

// 2. Enhance handleSaveField to pass all casing of required to API
const saveTarget = `      if (isEditingField) {
        globalMappingService.updateStandardField(originalKey, fieldObj, currentUser?.username || 'admin');
        await api.updateGlobalStandardDirectoryField(fieldObj.id, fieldObj);
      } else {
        globalMappingService.addStandardField(fieldObj, currentUser?.username || 'admin');
        await api.createGlobalStandardDirectoryField(fieldObj);
      }`;

const saveReplacement = `      const existingField = fields.find(f => f.key === originalKey);
      const targetId = existingField?.id || originalKey;
      const payload = {
        ...fieldObj,
        required: fieldRequired,
        is_required: fieldRequired,
        isRequired: fieldRequired
      };
      if (isEditingField) {
        globalMappingService.updateStandardField(originalKey, payload, currentUser?.username || 'admin');
        await api.updateGlobalStandardDirectoryField(targetId, payload);
      } else {
        globalMappingService.addStandardField(payload, currentUser?.username || 'admin');
        await api.createGlobalStandardDirectoryField(payload);
      }`;

if (!content.includes(saveTarget)) {
  console.error('Target 2 not found');
  process.exit(1);
}
content = content.replace(saveTarget, saveReplacement);

// 3. Replace handleExecuteJsonAction and add handleToggleFieldRequired & handleAutoClassifyAll
const jsonActionTarget = `  const handleExecuteJsonAction = () => {
    if (jsonMode === 'export') {
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`global_dictionary_\${new Date().toISOString().slice(0, 10)}.json\`;
      a.click();
      URL.revokeObjectURL(url);
      setShowJsonModal(false);
    } else {
      try {
        const parsed = JSON.parse(jsonContent);
        if (!Array.isArray(parsed)) {
          throw new Error('Imported JSON must be an array of column definitions.');
        }
        parsed.forEach((f: any) => {
          if (f.key && f.label) {
            globalMappingService.addStandardField(f, currentUser?.username || 'admin');
          }
        });
        setFields(globalMappingService.getStandardFields());
        setShowJsonModal(false);
        setDictSuccessMsg(\`Successfully imported \${parsed.length} fields into the dictionary!\`);
        setTimeout(() => setDictSuccessMsg(null), 4000);
      } catch (e: any) {
        setJsonError(\`Invalid JSON: \${e.message}\`);
      }
    }
  };`;

const jsonActionReplacement = `  const handleToggleFieldRequired = async (field: GlobalTransactionSchemaField) => {
    const nextVal = !field.required;
    setTogglingRequiredKey(field.key);
    
    // Optimistic UI update
    setFields(prev => prev.map(f => f.key === field.key ? { ...f, required: nextVal } : f));
    
    try {
      const targetId = field.id || field.key;
      await api.updateGlobalStandardDirectoryField(targetId, {
        ...field,
        required: nextVal,
        is_required: nextVal,
        isRequired: nextVal
      });
      globalMappingService.updateStandardField(field.key, { ...field, required: nextVal }, currentUser?.username || 'admin');
      setDictSuccessMsg(\`Field "\${field.key}" is now \${nextVal ? 'Required' : 'Optional'}.\`);
      setTimeout(() => setDictSuccessMsg(null), 3000);
    } catch (err: any) {
      // Revert on error
      setFields(prev => prev.map(f => f.key === field.key ? { ...f, required: field.required } : f));
      alert(\`Failed to update required constraint: \${err.message}\`);
    } finally {
      setTogglingRequiredKey(null);
    }
  };

  const handleAutoClassifyAll = async () => {
    setAutoClassifying(true);
    try {
      const res = await api.autoClassifyGlobalFields();
      const refreshed = await api.getGlobalStandardDirectory().catch(() => res.fields || []);
      if (Array.isArray(refreshed) && refreshed.length > 0) {
        setFields(refreshed);
      } else if (res.fields) {
        setFields(res.fields);
      }
      setDictSuccessMsg(res.message || \`Successfully auto-classified \${res.classifiedCount || 0} fields!\`);
      setTimeout(() => setDictSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(\`Failed to auto-classify fields: \${err.message}\`);
    } finally {
      setAutoClassifying(false);
    }
  };

  const handleExecuteJsonAction = async () => {
    if (jsonMode === 'export') {
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`global_dictionary_\${new Date().toISOString().slice(0, 10)}.json\`;
      a.click();
      URL.revokeObjectURL(url);
      setShowJsonModal(false);
    } else {
      try {
        const parsed = JSON.parse(jsonContent);
        if (!Array.isArray(parsed)) {
          throw new Error('Imported JSON must be an array of column definitions.');
        }
        setImportingJson(true);
        setJsonError(null);

        // Persist directly to PostgreSQL with automatic domain classification
        const res = await api.batchImportGlobalFields(parsed, true, currentUser?.username || 'admin');

        // Sync local mapping service
        parsed.forEach((f: any) => {
          if (f.key && f.label) {
            globalMappingService.addStandardField(f, currentUser?.username || 'admin');
          }
        });

        // Re-fetch directory directly from database
        const refreshed = await api.getGlobalStandardDirectory().catch(() => res.fields || []);
        if (Array.isArray(refreshed) && refreshed.length > 0) {
          setFields(refreshed);
        } else if (res.fields) {
          setFields(res.fields);
        }

        setShowJsonModal(false);
        setDictSuccessMsg(res.message || \`Successfully imported and persisted \${res.importedCount || parsed.length} fields to database!\`);
        setTimeout(() => setDictSuccessMsg(null), 5000);
      } catch (e: any) {
        setJsonError(\`Import failed: \${e.message}\`);
      } finally {
        setImportingJson(false);
      }
    }
  };`;

if (!content.includes(jsonActionTarget)) {
  console.error('Target 3 not found');
  process.exit(1);
}
content = content.replace(jsonActionTarget, jsonActionReplacement);

// 4. Add "Auto-Classify All" button in dictionary toolbar
const toolbarTarget = `              <button
                type="button"
                onClick={handleOpenImportTableModal}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                id="btn-import-table-columns"
                title="Import physical columns from a specific connected database table"
              >
                <Table size={13} className="text-slate-500" />
                <span className="hidden sm:inline">Import from Table</span>
              </button>`;

const toolbarReplacement = `              <button
                type="button"
                onClick={handleAutoClassifyAll}
                disabled={autoClassifying || fields.length === 0}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                id="btn-auto-classify-all"
                title="Automatically categorize and organize all fields into standard business domains"
              >
                {autoClassifying ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} className="text-indigo-600" />}
                <span>{autoClassifying ? 'Classifying...' : 'Auto-Classify All'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenImportTableModal}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                id="btn-import-table-columns"
                title="Import physical columns from a specific connected database table"
              >
                <Table size={13} className="text-slate-500" />
                <span className="hidden sm:inline">Import from Table</span>
              </button>`;

if (!content.includes(toolbarTarget)) {
  console.error('Target 4 not found');
  process.exit(1);
}
content = content.replace(toolbarTarget, toolbarReplacement);

// 5. Replace static constraint cell with interactive toggle button
const constraintCellTarget = `                          <td className="py-3 px-4">
                            {f.required ? (
                              <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                Required
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">Optional</span>
                            )}
                          </td>`;

const constraintCellReplacement = `                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => handleToggleFieldRequired(f)}
                              disabled={togglingRequiredKey === f.key}
                              className={\`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition border \${
                                f.required
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                              }\`}
                              title={\`Click to toggle constraint (currently \${f.required ? 'Required' : 'Optional'})\`}
                              id={\`btn-toggle-required-\${f.key}\`}
                            >
                              {togglingRequiredKey === f.key ? (
                                <Loader2 size={10} className="animate-spin text-slate-500" />
                              ) : (
                                <span className={\`w-1.5 h-1.5 rounded-full \${f.required ? 'bg-rose-500' : 'bg-slate-300'}\`} />
                              )}
                              {f.required ? 'Required' : 'Optional'}
                            </button>
                          </td>`;

if (!content.includes(constraintCellTarget)) {
  console.error('Target 5 not found');
  process.exit(1);
}
content = content.replace(constraintCellTarget, constraintCellReplacement);

// 6. Update JSON modal import button to show loading state
const jsonBtnTarget = `              <button
                type="button"
                onClick={handleExecuteJsonAction}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
              >
                {jsonMode === 'export' ? 'Download JSON File' : 'Import Columns'}
              </button>`;

const jsonBtnReplacement = `              <button
                type="button"
                onClick={handleExecuteJsonAction}
                disabled={importingJson}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                id="btn-submit-json-action"
              >
                {importingJson && <Loader2 size={13} className="animate-spin" />}
                <span>{jsonMode === 'export' ? 'Download JSON File' : importingJson ? 'Saving to Database...' : 'Import Columns'}</span>
              </button>`;

if (!content.includes(jsonBtnTarget)) {
  console.error('Target 6 not found');
  process.exit(1);
}
content = content.replace(jsonBtnTarget, jsonBtnReplacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched SystemSettings.tsx');
