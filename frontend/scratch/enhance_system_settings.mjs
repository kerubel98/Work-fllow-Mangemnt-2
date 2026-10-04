import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/components/settings/SystemSettings.tsx');
let code = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Add imports
const importTarget = `import { showSystemAlert } from '../common/MessageModal';`;
const importReplacement = `import { showSystemAlert } from '../common/MessageModal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Overlay';
import { ConfirmDialog } from '../common/Feedback';`;

code = code.replace(importTarget, importReplacement);

// 2. Add confirmDeleteSelectedOpen state
const stateTarget = `  const [dictSuccessMsg, setDictSuccessMsg] = useState<string | null>(null);`;
const stateReplacement = `  const [dictSuccessMsg, setDictSuccessMsg] = useState<string | null>(null);
  const [confirmDeleteSelectedOpen, setConfirmDeleteSelectedOpen] = useState(false);`;

code = code.replace(stateTarget, stateReplacement);

// 3. Rewrite handleDeleteSelectedFields to use ConfirmDialog
const delSelTarget = `  const handleDeleteSelectedFields = async () => {
    if (selectedFieldKeys.length === 0) return;
    if (!window.confirm(\`Delete \${selectedFieldKeys.length} selected fields from the Global Schema and Database?\`)) {
      return;
    }
    try {
      for (const key of selectedFieldKeys) {
        globalMappingService.deleteStandardField(key, currentUser?.username || 'admin');
        await api.deleteGlobalStandardDirectoryField(key).catch(() => {});
      }
      const refreshed = await api.getGlobalStandardDirectory().catch(() => null);
      if (Array.isArray(refreshed)) {
        setFields(refreshed);
      } else {
        setFields(prev => prev.filter(f => !selectedFieldKeys.includes(f.key)));
      }
      const deletedCount = selectedFieldKeys.length;
      setSelectedFieldKeys([]);
      setDictSuccessMsg(\`Deleted \${deletedCount} selected fields from Global Dictionary.\`);
      setTimeout(() => setDictSuccessMsg(null), 4000);
    } catch (err: any) {
      showSystemAlert({
        title: 'Delete Failed',
        message: \`Error deleting selected fields: \${err.message || err}\`,
        type: 'error'
      });
    }
  };`;

const delSelReplacement = `  const executeDeleteSelectedFields = async () => {
    if (selectedFieldKeys.length === 0) return;
    setConfirmDeleteSelectedOpen(false);
    try {
      for (const key of selectedFieldKeys) {
        globalMappingService.deleteStandardField(key, currentUser?.username || 'admin');
        await api.deleteGlobalStandardDirectoryField(key).catch(() => {});
      }
      const refreshed = await api.getGlobalStandardDirectory().catch(() => null);
      if (Array.isArray(refreshed)) {
        setFields(refreshed);
      } else {
        setFields(prev => prev.filter(f => !selectedFieldKeys.includes(f.key)));
      }
      const deletedCount = selectedFieldKeys.length;
      setSelectedFieldKeys([]);
      setDictSuccessMsg(\`Deleted \${deletedCount} selected fields from Global Dictionary.\`);
      setTimeout(() => setDictSuccessMsg(null), 4000);
    } catch (err: any) {
      showSystemAlert({
        title: 'Delete Failed',
        message: \`Error deleting selected fields: \${err.message || err}\`,
        type: 'error'
      });
    }
  };

  const handleDeleteSelectedFields = () => {
    if (selectedFieldKeys.length === 0) return;
    setConfirmDeleteSelectedOpen(true);
  };`;

code = code.replace(delSelTarget, delSelReplacement);

// 4. Replace fieldToDelete modal with ConfirmDialog
const fieldToDeleteModalOld = `      {/* ========================================================================= */}
      {/* MODAL: DELETE CONFIRMATION                                                */}
      {/* ========================================================================= */}
      {fieldToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Trash2 size={22} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Delete Column from Dictionary?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete the column <span className="font-mono font-bold text-slate-800">{fieldToDelete.key}</span> ({fieldToDelete.label}) from the Global Dictionary? This will also remove any corresponding table mapping references.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFieldToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteField}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
              >
                Delete Column
              </button>
            </div>
          </div>
        </div>
      )}`;

const fieldToDeleteModalNew = `      {/* ========================================================================= */}
      {/* MODAL: DELETE CONFIRMATION using accessible ConfirmDialog                 */}
      {/* ========================================================================= */}
      <ConfirmDialog
        open={Boolean(fieldToDelete)}
        title="Delete Column from Dictionary?"
        message={
          fieldToDelete ? (
            <span>
              Are you sure you want to delete the column <strong className="font-mono text-ds-text">{fieldToDelete.key}</strong> ({fieldToDelete.label}) from the Global Dictionary? This will also remove any corresponding table mapping references.
            </span>
          ) : ''
        }
        confirmLabel="Delete Column"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={handleConfirmDeleteField}
        onCancel={() => setFieldToDelete(null)}
      />`;

code = code.replace(fieldToDeleteModalOld, fieldToDeleteModalNew);

// 5. Replace showClearAllModal with ConfirmDialog
const clearAllModalOld = `      {/* ========================================================================= */}
      {/* MODAL: CLEAR ALL GLOBAL SCHEMA FIELDS                                      */}
      {/* ========================================================================= */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Trash2 size={22} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Delete All Global Schema Fields?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete <span className="font-bold text-rose-600">all {fields.length} canonical fields</span> from the Global Standard Directory and Schema? 
              </p>
              <p className="text-xs text-slate-400">
                This will clear all columns from the global directory in the database. You can always add custom fields or restore factory defaults anytime via &quot;Reset Defaults&quot;.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllFields}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                id="btn-confirm-clear-all"
              >
                Yes, Delete All ({fields.length})
              </button>
            </div>
          </div>
        </div>
      )}`;

const clearAllModalNew = `      {/* ========================================================================= */}
      {/* MODAL: CLEAR ALL GLOBAL SCHEMA FIELDS using accessible ConfirmDialog       */}
      {/* ========================================================================= */}
      <ConfirmDialog
        open={showClearAllModal}
        title="Delete All Global Schema Fields?"
        message={
          <span>
            Are you sure you want to delete <strong className="text-ds-danger">all {fields.length} canonical fields</strong> from the Global Standard Directory and Schema? This will clear all columns from the global directory in the database. You can restore factory defaults anytime via &quot;Reset Defaults&quot;.
          </span>
        }
        confirmLabel={\`Yes, Delete All (\${fields.length})\`}
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={handleClearAllFields}
        onCancel={() => setShowClearAllModal(false)}
      />

      {/* Accessible ConfirmDialog for bulk deleting selected fields */}
      <ConfirmDialog
        open={confirmDeleteSelectedOpen}
        title="Delete Selected Fields?"
        message={
          <span>
            Are you sure you want to delete <strong className="text-ds-danger">{selectedFieldKeys.length} selected fields</strong> from the Global Schema and Database?
          </span>
        }
        confirmLabel={\`Delete \${selectedFieldKeys.length} Fields\`}
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={executeDeleteSelectedFields}
        onCancel={() => setConfirmDeleteSelectedOpen(false)}
      />`;

code = code.replace(clearAllModalOld, clearAllModalNew);

fs.writeFileSync(filePath, code, 'utf8');
console.log('SystemSettings modal and confirm dialog enhancements complete');
