/**
 * Verification test for Workspace Settings redesign:
 * - White shade card containers (bg-white border-slate-200/90 rounded-2xl shadow-xs)
 * - Single-row non-wrapping header layout (overflow-x-auto no-scrollbar, shrink-0)
 * - Compact selector widths with truncation
 * - Clean modern segmented tab bars (bg-slate-100/90 border-slate-200 rounded-2xl)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- RUNNING WORKSPACE SETTINGS REDESIGN AUDIT ---');

const wsPath = path.join(__dirname, '..', 'frontend', 'src', 'components', 'WorkspaceSettings.tsx');
const dbConfigPath = path.join(__dirname, '..', 'frontend', 'src', 'components', 'settings', 'DatabaseColumnConfiguration.tsx');
const valBoxPath = path.join(__dirname, '..', 'frontend', 'src', 'components', 'settings', 'ValidationBoxManager.tsx');
const wfStudioPath = path.join(__dirname, '..', 'frontend', 'src', 'components', 'settings', 'WorkflowStudioFlowchart.tsx');
const sysSettingsPath = path.join(__dirname, '..', 'frontend', 'src', 'components', 'settings', 'SystemSettings.tsx');

// Test 1: WorkspaceSettings Header & Tabs
const wsContent = fs.readFileSync(wsPath, 'utf8');
assert.ok(wsContent.includes('id="workspace-settings-header"'), 'WorkspaceSettings must have workspace-settings-header id');
assert.ok(wsContent.includes('bg-white border border-slate-200/90 rounded-2xl'), 'WorkspaceSettings header must use white shade card styling');
assert.ok(wsContent.includes('overflow-x-auto no-scrollbar'), 'WorkspaceSettings header must have single-row scroll container');
assert.ok(wsContent.includes('id="workspace-settings-tabs"'), 'WorkspaceSettings must have workspace-settings-tabs id');
assert.ok(wsContent.includes('bg-slate-100/90 border border-slate-200 rounded-2xl'), 'WorkspaceSettings tab bar must use clean light container styling');
assert.ok(!wsContent.includes('bg-[#0F172B] border border-slate-800 rounded-xl px-3.5 py-2'), 'Dark header bar must be replaced');
console.log('✅ Test 1 Passed: WorkspaceSettings header and tab bar verified in clean white/light styling on single row.');

// Test 2: DatabaseColumnConfiguration Header, Compact Selectors & Single Row
const dbConfigContent = fs.readFileSync(dbConfigPath, 'utf8');
assert.ok(dbConfigContent.includes('id="db-column-config-header"'), 'DatabaseColumnConfiguration must have db-column-config-header id');
assert.ok(dbConfigContent.includes('bg-white border border-slate-200/90 rounded-2xl'), 'DatabaseColumnConfiguration header must use white shade card styling');
assert.ok(dbConfigContent.includes('id="db-config-selectors-row"'), 'DatabaseColumnConfiguration must have db-config-selectors-row id');
assert.ok(dbConfigContent.includes('max-w-[120px] sm:max-w-[140px] truncate'), 'DB selector must have compact width bound and truncate');
assert.ok(dbConfigContent.includes('max-w-[110px] sm:max-w-[130px] truncate'), 'Table selector must have compact width bound and truncate');
assert.ok(dbConfigContent.includes('Scan Tables') && dbConfigContent.includes('shrink-0 whitespace-nowrap'), 'Scan Tables button must be shrink-0 and single-row');
assert.ok(dbConfigContent.includes('Create Column Rule') && dbConfigContent.includes('shrink-0 whitespace-nowrap'), 'Create Rule button must be shrink-0 and single-row');
console.log('✅ Test 2 Passed: DatabaseColumnConfiguration header, selectors, and buttons verified on single row with compact widths.');

// Test 3: ValidationBoxManager Header
const valBoxContent = fs.readFileSync(valBoxPath, 'utf8');
assert.ok(valBoxContent.includes('id="val-box-header"'), 'ValidationBoxManager must have val-box-header id');
assert.ok(valBoxContent.includes('bg-white border border-slate-200/90 rounded-2xl'), 'ValidationBoxManager header must use white shade card styling');
assert.ok(valBoxContent.includes('id="val-box-actions-row"'), 'ValidationBoxManager must have val-box-actions-row id');
assert.ok(valBoxContent.includes('+ Search Box') && valBoxContent.includes('shrink-0 whitespace-nowrap'), 'ValidationBox actions must be shrink-0 and single-row');
console.log('✅ Test 3 Passed: ValidationBoxManager header verified in clean white styling on single row.');

// Test 4: WorkflowStudioFlowchart Header
const wfStudioContent = fs.readFileSync(wfStudioPath, 'utf8');
assert.ok(wfStudioContent.includes('id="workflow-studio-header"'), 'WorkflowStudioFlowchart must have workflow-studio-header id');
assert.ok(wfStudioContent.includes('bg-white border border-slate-200/90 rounded-2xl'), 'WorkflowStudioFlowchart header must use white shade card styling');
assert.ok(wfStudioContent.includes('id="workflow-studio-actions-row"'), 'WorkflowStudioFlowchart must have workflow-studio-actions-row id');
console.log('✅ Test 4 Passed: WorkflowStudioFlowchart header verified in clean white styling on single row.');

// Test 5: SystemSettings Header & Tabs
const sysContent = fs.readFileSync(sysSettingsPath, 'utf8');
assert.ok(sysContent.includes('id="system-settings-header"'), 'SystemSettings must have system-settings-header id');
assert.ok(sysContent.includes('bg-white text-slate-800 rounded-2xl'), 'SystemSettings header must use white shade styling');
assert.ok(sysContent.includes('id="system-settings-tabs"'), 'SystemSettings must have system-settings-tabs id');
assert.ok(sysContent.includes('bg-slate-100/90 rounded-2xl border border-slate-200'), 'SystemSettings tabs must use light rounded styling');
console.log('✅ Test 5 Passed: SystemSettings header and tabs verified in clean white/light styling on single row.');

console.log('\n🎉 ALL 5/5 WORKSPACE SETTINGS REDESIGN VERIFICATION TESTS PASSED!');
