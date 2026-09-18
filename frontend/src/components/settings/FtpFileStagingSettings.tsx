import React, { useState, useEffect, useMemo } from 'react';
import { DatabaseConnection, FtpFileStagingConfig, FtpFieldMapping, FolderStructureException, FtpStagingScheduleConfig, FtpSkippedMismatch } from '../../types';
import { api } from '../../api/client';
import { globalMappingService } from '../../services/globalMappingService';
import { 
  FolderDown, FileSpreadsheet, Play, CheckCircle2, AlertCircle, RefreshCw, 
  Settings2, Plus, Trash2, Edit3, ArrowRight, Eye, Layers, ShieldCheck, 
  Save, X, Database, Table, HelpCircle, FileText, Check, Filter,
  FolderTree, Search, Sparkles, CheckSquare, Square, Info,
  Folder, FolderOpen, ChevronRight, ChevronDown, FileCode, Calendar, CheckCheck,
  AlertTriangle, Clock, Zap
} from 'lucide-react';

interface FtpFileStagingSettingsProps {
  databases: DatabaseConnection[];
  preSelectedDbId?: string;
  onNavigateToConnections?: () => void;
  onNavigateToValidationBoxes?: () => void;
}

interface DiscoveredRecursiveFile {
  name: string;
  fullPath: string;
  relativeFolder: string;
  size: number;
  fileType: string;
}

/**
 * Analyzes remote file path to separate permanent base path from rotating date/batch patterns
 */
export function analyzeFolderPath(fullPath: string, fileName: string): {
  permanentBasePath: string;
  dynamicPathPattern: string;
  recommendedPattern: string;
} {
  const normalized = (fullPath || '').replace(/\\/g, '/');
  const dirPath = normalized.substring(0, normalized.lastIndexOf('/')) || '/';
  const parts = dirPath.split('/').filter(Boolean);

  const isRotating = (seg: string) => {
    return /^(19\d\d|20\d\d)$/.test(seg) ||
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(seg) ||
      /^\d{4}[-_]\d{1,2}([-_]\d{1,2})?$/.test(seg) ||
      /^\d{1,2}[-_]\d{1,2}[-_]\d{2,4}$/.test(seg) ||
      /^\d{6,8}$/.test(seg) ||
      /^(daily|batch|archive|history|current|inbox)$/i.test(seg);
  };

  const rotatingIndex = parts.findIndex(isRotating);

  if (rotatingIndex !== -1) {
    const permanentBase = '/' + parts.slice(0, rotatingIndex).join('/');
    const rotatingSegments = parts.slice(rotatingIndex);
    const dynamicPattern = rotatingSegments.map(() => '*').join('/');
    const fileExt = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
    const baseName = fileName.replace(fileExt, '');
    const dateWildcard = baseName.replace(/\d{4}[._-]\d{1,2}[._-]\d{1,2}/g, '*')
                                 .replace(/\d{1,2}[._-]\d{1,2}[._-]\d{2,4}/g, '*')
                                 .replace(/\d{6,8}/g, '*');
    const recommendedPattern = `${dynamicPattern}/${dateWildcard}${fileExt}`;

    return {
      permanentBasePath: permanentBase || '/',
      dynamicPathPattern: dynamicPattern,
      recommendedPattern: recommendedPattern
    };
  }

  const permanentBase = '/' + parts.join('/');
  return {
    permanentBasePath: permanentBase || '/',
    dynamicPathPattern: '',
    recommendedPattern: fileName
  };
}

export default function FtpFileStagingSettings({
  databases = [],
  preSelectedDbId,
  onNavigateToConnections,
  onNavigateToValidationBoxes
}: FtpFileStagingSettingsProps) {
  // Filter for FTP and SFTP servers
  const ftpServers = useMemo(() => {
    return databases.filter(d => d.type === 'FTP' || d.type === 'SFTP');
  }, [databases]);

  const [selectedDbId, setSelectedDbId] = useState<string>(() => {
    if (preSelectedDbId && ftpServers.some(d => d.id === preSelectedDbId)) return preSelectedDbId;
    const saved = typeof window !== 'undefined' ? localStorage.getItem('preferred_ftp_server_id') : null;
    if (saved && ftpServers.some(d => d.id === saved)) return saved;
    const liveSftp = ftpServers.find(d => d.type === 'SFTP' || d.host === '127.0.0.1' || d.host === 'localhost');
    return liveSftp?.id || ftpServers[0]?.id || '';
  });

  const selectedDb = useMemo(() => {
    return ftpServers.find(d => d.id === selectedDbId);
  }, [ftpServers, selectedDbId]);

  // Available remote files & folder tree
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [recursiveFiles, setRecursiveFiles] = useState<DiscoveredRecursiveFile[]>([]);
  const [loadingRecursive, setLoadingRecursive] = useState(false);

  // Directory explorer filter & collapse state
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [explorerFilterType, setExplorerFilterType] = useState<string>('ALL');
  const [explorerSearch, setExplorerSearch] = useState<string>('');

  // Sample file chosen for schema configuration
  const [sampleFileName, setSampleFileName] = useState<string>('');

  // Staging configurations list
  const [stagingConfigs, setStagingConfigs] = useState<FtpFileStagingConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [activeMessage, setActiveMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modal / Form state
  const [isEditing, setIsEditing] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [configName, setConfigName] = useState('');
  const [targetFileName, setTargetFileName] = useState('');
  const [fileFormat, setFileFormat] = useState<FtpFileStagingConfig['fileFormat']>('CSV');
  const [customDelimiter, setCustomDelimiter] = useState(',');
  const [hasHeader, setHasHeader] = useState(true);
  const [headerRowIndex, setHeaderRowIndex] = useState(1);
  const [headerRowCount, setHeaderRowCount] = useState(1);
  const [handleMergedCells, setHandleMergedCells] = useState(true);
  const [mergedHeaderSeparator, setMergedHeaderSeparator] = useState('_');
  const [dataStartRow, setDataStartRow] = useState(2);
  const [skipFooterLines, setSkipFooterLines] = useState(0);
  const [quoteChar, setQuoteChar] = useState('"');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');
  const [excelSheetName, setExcelSheetName] = useState('');
  const [folderTraversalMode, setFolderTraversalMode] = useState<'SINGLE_FILE' | 'DIRECTORY_SCAN' | 'RECURSIVE_SCAN'>('SINGLE_FILE');
  const [sourceDirectoryPath, setSourceDirectoryPath] = useState('');
  const [selectedImportantColumns, setSelectedImportantColumns] = useState<string[]>([]);
  const [xmlRootElement, setXmlRootElement] = useState('');
  const [xmlRecordElement, setXmlRecordElement] = useState('');
  const [fieldMappings, setFieldMappings] = useState<FtpFieldMapping[]>([]);

  // Root Directory & Exception Overrides
  const [rootDirectoryPath, setRootDirectoryPath] = useState('/');
  const [folderExceptions, setFolderExceptions] = useState<FolderStructureException[]>([]);
  const [mismatchHandling, setMismatchHandling] = useState<'SKIP_AND_NOTIFY' | 'ABORT'>('SKIP_AND_NOTIFY');

  // Scheduled Parsing Configuration
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState<'EVERY_15_MIN' | 'HOURLY' | 'DAILY' | 'MANUAL'>('HOURLY');
  const [scheduleTargetType, setScheduleTargetType] = useState<'ALL' | 'CSV' | 'EXCEL' | 'XML' | 'TXT'>('ALL');
  const [scheduleDailyTime, setScheduleDailyTime] = useState('02:00');
  const [runningScheduled, setRunningScheduled] = useState(false);

  // Unconfigured Remote Folders Audit
  const [unconfiguredFolders, setUnconfiguredFolders] = useState<any[]>([]);
  const [loadingUnconfigured, setLoadingUnconfigured] = useState(false);

  // Exception Form State
  const [isAddingException, setIsAddingException] = useState(false);
  const [newExcPattern, setNewExcPattern] = useState('');
  const [newExcFormat, setNewExcFormat] = useState<any>('CSV');
  const [newExcDelimiter, setNewExcDelimiter] = useState(';');
  const [newExcHasHeader, setNewExcHasHeader] = useState(true);
  const [newExcHeaderRowIndex, setNewExcHeaderRowIndex] = useState(1);
  const [newExcDataStartRow, setNewExcDataStartRow] = useState(2);
  const [newExcExcelSheet, setNewExcExcelSheet] = useState('');
  const [newExcDescription, setNewExcDescription] = useState('');

  // Skipped Mismatches inspection modal
  const [viewingMismatchesConfig, setViewingMismatchesConfig] = useState<FtpFileStagingConfig | null>(null);

  // File structure inspection state
  const [structureInspection, setStructureInspection] = useState<any | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  // Preview state
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState<'parsed' | 'mapped' | 'raw' | 'important'>('parsed');

  // Standard Canonical Directory fields
  const standardFields = useMemo(() => {
    return globalMappingService.getStandardFields();
  }, []);

  // Fetch unconfigured folders discovered on server
  const fetchUnconfiguredFolders = () => {
    if (!selectedDbId) return;
    setLoadingUnconfigured(true);
    api.getUnconfiguredFtpFolders(selectedDbId)
      .then(res => setUnconfiguredFolders(Array.isArray(res) ? res : []))
      .catch(err => console.warn('Could not load unconfigured folders:', err))
      .finally(() => setLoadingUnconfigured(false));
  };

  // Auto-discover folder tree and fetch configs when selected FTP server changes
  useEffect(() => {
    if (!selectedDbId) return;

    setLoadingConfigs(true);
    api.getFtpStagingConfigs(selectedDbId)
      .then(res => setStagingConfigs(Array.isArray(res) ? res : []))
      .catch(err => console.warn('Could not load FTP staging configs:', err))
      .finally(() => setLoadingConfigs(false));

    setLoadingFiles(true);
    api.getDatabaseTables(selectedDbId)
      .then(res => {
        if (res && res.availableTables) {
          setAvailableFiles(res.availableTables);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingFiles(false));

    // Audit unconfigured folders
    fetchUnconfiguredFolders();

    // Automatically discover directory tree & files across folders
    setLoadingRecursive(true);
    api.discoverFtpFilesRecursive(selectedDbId)
      .then(res => {
        setRecursiveFiles(res || []);
        fetchUnconfiguredFolders();
      })
      .catch(err => {
        console.warn('Could not discover recursive FTP files:', err);
        setActiveMessage({ type: 'error', text: `Directory discovery failed: ${err.message}` });
      })
      .finally(() => setLoadingRecursive(false));
  }, [selectedDbId]);

  // Group discovered files by folder
  const filesByFolder = useMemo(() => {
    const groups: Record<string, DiscoveredRecursiveFile[]> = {};
    for (const f of recursiveFiles) {
      const folder = f.relativeFolder || '/';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(f);
    }
    return groups;
  }, [recursiveFiles]);

  // Filtered files by search & format type
  const filteredFilesByFolder = useMemo(() => {
    const searchLower = explorerSearch.trim().toLowerCase();
    const result: Record<string, DiscoveredRecursiveFile[]> = {};

    for (const [folder, files] of (Object.entries(filesByFolder) as [string, DiscoveredRecursiveFile[]][])) {
      const matching = files.filter(f => {
        const matchesType = explorerFilterType === 'ALL' || f.fileType === explorerFilterType;
        const matchesSearch = !searchLower || 
          f.name.toLowerCase().includes(searchLower) || 
          f.fullPath.toLowerCase().includes(searchLower) ||
          folder.toLowerCase().includes(searchLower);
        return matchesType && matchesSearch;
      });

      if (matching.length > 0) {
        result[folder] = matching;
      }
    }
    return result;
  }, [filesByFolder, explorerFilterType, explorerSearch]);

  // Live pattern match calculation: shows which files match permanent path + dynamic pattern
  const matchingFilesInScope = useMemo(() => {
    if (!targetFileName && !sourceDirectoryPath) return [];
    return recursiveFiles.filter(f => {
      // Check folder match if sourceDirectoryPath is specified
      if (sourceDirectoryPath && sourceDirectoryPath.trim() !== '' && sourceDirectoryPath.trim() !== '/') {
        const cleanBase = sourceDirectoryPath.trim().replace(/\/+$/, '');
        const folder = f.relativeFolder || '';
        if (!f.fullPath.includes(cleanBase) && !folder.startsWith(cleanBase)) {
          return false;
        }
      }

      // Target file pattern check
      const pattern = targetFileName.trim();
      if (!pattern || pattern === '*' || pattern === '*.*') return true;

      if (pattern.includes('*')) {
        const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
        try {
          const rx = new RegExp(regexStr, 'i');
          return rx.test(f.name) || rx.test(f.fullPath);
        } catch {
          return f.name.toLowerCase().includes(pattern.replace(/\*/g, '').toLowerCase());
        }
      }

      return f.name.toLowerCase() === pattern.toLowerCase() || f.fullPath.toLowerCase().endsWith(pattern.toLowerCase());
    });
  }, [recursiveFiles, sourceDirectoryPath, targetFileName]);

  const toggleFolderCollapse = (folder: string) => {
    setCollapsedFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
  };

  // Inspect physical structure of selected file
  const handleInspectStructure = async (filename?: string) => {
    let target = (filename || sampleFileName || targetFileName || '').trim();
    if (!selectedDbId || !target) return;

    // Resolve wildcards or bare filenames against recursiveFiles
    if (target.includes('*') || target.includes('?')) {
      const match = matchingFilesInScope[0] || recursiveFiles.find(f => f.name === sampleFileName || f.fullPath === sampleFileName);
      if (match) {
        target = match.fullPath;
      }
    } else if (!target.startsWith('/')) {
      const match = recursiveFiles.find(f => f.name === target || f.fullPath === target || f.fullPath.endsWith(`/${target}`));
      if (match) {
        target = match.fullPath;
      }
    }

    setIsInspecting(true);
    setInspectionError(null);
    try {
      const res = await api.inspectFtpFileStructure(selectedDbId, target);
      setStructureInspection(res);
      setInspectionError(null);

      // Auto-configure format from inspection
      if (res.fileType === 'EXCEL') {
        setFileFormat('EXCEL');
        if (res.excelSheets && res.excelSheets.length > 0 && !excelSheetName) {
          setExcelSheetName(res.excelSheets[0].name);
        }
      } else if (res.fileType === 'XML') {
        setFileFormat('XML');
        if (res.xmlRootElement) setXmlRootElement(res.xmlRootElement);
        if (res.xmlCandidateElements && res.xmlCandidateElements.length > 0 && !xmlRecordElement) {
          setXmlRecordElement(res.xmlCandidateElements[0]);
        }
      } else if (res.fileType === 'TXT') {
        setFileFormat('TXT' as any);
      } else if (res.detectedDelimiter) {
        if (res.detectedDelimiter === ',') setFileFormat('CSV');
        else if (res.detectedDelimiter === '\t') setFileFormat('TSV');
        else if (res.detectedDelimiter === '|') setFileFormat('PIPE');
        else if (res.detectedDelimiter === ';') setFileFormat('SEMICOLON');
        else {
          setFileFormat('CUSTOM_DELIMITED');
          setCustomDelimiter(res.detectedDelimiter);
        }
      }

      if (res.suggestedHeaderRow && !editingConfigId) {
        setHeaderRowIndex(res.suggestedHeaderRow);
      }
      if (res.suggestedDataStartRow && !editingConfigId) {
        setDataStartRow(res.suggestedDataStartRow);
      }
    } catch (e: any) {
      setStructureInspection(null);
      setInspectionError(e.message || 'Structure inspection failed');
      setActiveMessage({ type: 'error', text: `Structure inspection failed for "${target}": ${e.message}` });
    } finally {
      setIsInspecting(false);
    }
  };

  // Discover recursive files across folders (manual trigger)
  const handleDiscoverRecursive = async () => {
    if (!selectedDbId) return;
    setLoadingRecursive(true);
    try {
      const res = await api.discoverFtpFilesRecursive(selectedDbId, sourceDirectoryPath || undefined);
      setRecursiveFiles(res || []);
      setActiveMessage({ type: 'info', text: `Discovered ${res?.length || 0} remote files across directory hierarchy.` });
    } catch (e: any) {
      setActiveMessage({ type: 'error', text: `Recursive discovery failed: ${e.message}` });
    } finally {
      setLoadingRecursive(false);
    }
  };


  // Use a specific file from the explorer as the representative configuration sample
  const handleUseFileAsSample = (file: DiscoveredRecursiveFile) => {
    setIsEditing(true);
    setEditingConfigId(null);
    const sampleTarget = file.fullPath || file.name;
    setSampleFileName(sampleTarget);

    const analyzed = analyzeFolderPath(file.fullPath || file.name, file.name);
    setSourceDirectoryPath(analyzed.permanentBasePath);
    setTargetFileName(analyzed.recommendedPattern);
    setFolderTraversalMode(analyzed.dynamicPathPattern ? 'RECURSIVE_SCAN' : 'SINGLE_FILE');

    const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    setConfigName(`${baseName.charAt(0).toUpperCase() + baseName.slice(1)} Feed`);
    setFileFormat(file.fileType as any || 'CSV');
    setCustomDelimiter(',');
    setHasHeader(true);
    setHeaderRowIndex(1);
    setHeaderRowCount(1);
    setHandleMergedCells(true);
    setMergedHeaderSeparator('_');
    setDataStartRow(2);
    setSkipFooterLines(0);
    setQuoteChar('"');
    setDateFormat('YYYY-MM-DD');
    setExcelSheetName('');
    setSelectedImportantColumns([]);
    setXmlRootElement('');
    setXmlRecordElement('');
    setFieldMappings([]);
    setPreviewResult(null);
    setStructureInspection(null);
    setActiveMessage(null);

    handleInspectStructure(sampleTarget);
  };

  const handleOpenCreateModal = () => {
    setIsEditing(true);
    setEditingConfigId(null);
    setConfigName(selectedDb ? `${selectedDb.name} Staging Feed` : 'Settlement Feed Staging');
    const sampleFile = recursiveFiles[0]?.fullPath || availableFiles[0] || '';
    setSampleFileName(sampleFile);
    if (recursiveFiles[0]) {
      const analyzed = analyzeFolderPath(recursiveFiles[0].fullPath, recursiveFiles[0].name);
      setSourceDirectoryPath(analyzed.permanentBasePath);
      setRootDirectoryPath(analyzed.permanentBasePath);
      setTargetFileName(analyzed.recommendedPattern);
      setFolderTraversalMode(analyzed.dynamicPathPattern ? 'RECURSIVE_SCAN' : 'SINGLE_FILE');
    } else {
      setSourceDirectoryPath('/');
      setRootDirectoryPath('/');
      setTargetFileName(sampleFile || '*.csv');
      setFolderTraversalMode('SINGLE_FILE');
    }
    setFolderExceptions([]);
    setMismatchHandling('SKIP_AND_NOTIFY');
    setScheduleEnabled(false);
    setScheduleFrequency('HOURLY');
    setScheduleTargetType('ALL');
    setScheduleDailyTime('02:00');
    setFileFormat('CSV');
    setCustomDelimiter(',');
    setHasHeader(true);
    setHeaderRowIndex(1);
    setHeaderRowCount(1);
    setHandleMergedCells(true);
    setMergedHeaderSeparator('_');
    setDataStartRow(2);
    setSkipFooterLines(0);
    setQuoteChar('"');
    setDateFormat('YYYY-MM-DD');
    setExcelSheetName('');
    setSelectedImportantColumns([]);
    setXmlRootElement('');
    setXmlRecordElement('');
    setFieldMappings([]);
    setPreviewResult(null);
    setStructureInspection(null);
    setActiveMessage(null);

    if (sampleFile) {
      handleInspectStructure(sampleFile);
    }
  };

  const handleOpenEditModal = (cfg: FtpFileStagingConfig) => {
    setIsEditing(true);
    setEditingConfigId(cfg.id);
    setConfigName(cfg.name);
    setSampleFileName(cfg.sampleFileName || cfg.fileNamePattern || '');
    setTargetFileName(cfg.fileNamePattern);
    setFileFormat(cfg.fileFormat);
    setCustomDelimiter(cfg.customDelimiter || ',');
    setHasHeader(cfg.hasHeader);
    setHeaderRowIndex(cfg.headerRowIndex || 1);
    setHeaderRowCount(cfg.headerRowCount || 1);
    setHandleMergedCells(cfg.handleMergedCells ?? true);
    setMergedHeaderSeparator(cfg.mergedHeaderSeparator || '_');
    setDataStartRow(cfg.dataStartRow || 2);
    setSkipFooterLines(cfg.skipFooterLines || 0);
    setQuoteChar(cfg.quoteChar || '"');
    setDateFormat(cfg.dateFormat || 'YYYY-MM-DD');
    setExcelSheetName(cfg.excelSheetName || '');
    setFolderTraversalMode(cfg.folderTraversalMode || 'SINGLE_FILE');
    setSourceDirectoryPath(cfg.sourceDirectoryPath || '/');
    setRootDirectoryPath(cfg.rootDirectoryPath || cfg.sourceDirectoryPath || '/');
    setFolderExceptions(cfg.folderExceptions || []);
    setMismatchHandling(cfg.mismatchHandling || 'SKIP_AND_NOTIFY');
    setScheduleEnabled(cfg.scheduleConfig?.enabled ?? false);
    setScheduleFrequency(cfg.scheduleConfig?.frequency || 'HOURLY');
    setScheduleTargetType(cfg.scheduleConfig?.targetType || 'ALL');
    setScheduleDailyTime(cfg.scheduleConfig?.scheduledTime || '02:00');
    setSelectedImportantColumns(cfg.selectedImportantColumns || []);
    setXmlRootElement(cfg.xmlRootElement || '');
    setXmlRecordElement(cfg.xmlRecordElement || '');
    setFieldMappings(cfg.fieldMappings || []);
    setPreviewResult(null);
    setStructureInspection(null);
    setActiveMessage(null);

    handleInspectStructure(cfg.sampleFileName || cfg.fileNamePattern);
  };

  // Add Folder Structure Exception
  const handleAddException = () => {
    if (!newExcPattern.trim()) {
      setActiveMessage({ type: 'error', text: 'Folder pattern is required for a subfolder exception override.' });
      return;
    }
    const newExc: FolderStructureException = {
      id: `exc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      folderPattern: newExcPattern.trim(),
      description: newExcDescription.trim() || undefined,
      fileFormat: newExcFormat,
      customDelimiter: newExcDelimiter,
      hasHeader: newExcHasHeader,
      headerRowIndex: Number(newExcHeaderRowIndex),
      dataStartRow: Number(newExcDataStartRow),
      excelSheetName: newExcExcelSheet.trim() || undefined
    };
    setFolderExceptions(prev => [...prev, newExc]);
    setIsAddingException(false);
    setNewExcPattern('');
    setNewExcDescription('');
    setNewExcFormat('CSV');
    setNewExcDelimiter(';');
  };

  const handleDeleteException = (id: string) => {
    setFolderExceptions(prev => prev.filter(e => e.id !== id));
  };

  // Resolve discovered unconfigured folder
  const handleResolveUnconfiguredFolder = async (folderPath: string) => {
    try {
      await api.resolveUnconfiguredFtpFolder(folderPath, selectedDbId);
      setUnconfiguredFolders(prev => prev.filter(f => f.folderPath !== folderPath));
      setActiveMessage({ type: 'info', text: `Marked directory '${folderPath}' as resolved.` });
    } catch (err: any) {
      setActiveMessage({ type: 'error', text: `Failed to resolve folder: ${err.message}` });
    }
  };

  // Quick configure staging root from discovered folder
  const handleConfigureUnconfiguredFolder = (folder: any) => {
    handleOpenCreateModal();
    setRootDirectoryPath(folder.folderPath);
    setSourceDirectoryPath(folder.folderPath);
    const cleanName = folder.folderPath.replace(/^\//, '').replace(/\//g, ' ').toUpperCase() || 'ROOT';
    setConfigName(`${cleanName} Staging Feed`);
    if (folder.sampleFileNames && folder.sampleFileNames.length > 0) {
      const sample = folder.sampleFileNames[0];
      setSampleFileName(sample);
      handleInspectStructure(`${folder.folderPath}/${sample}`);
    }
  };

  // Trigger Scheduled Parsing on demand (type-based or ALL)
  const handleTriggerScheduledStaging = async (targetType: string = 'ALL') => {
    setRunningScheduled(true);
    setActiveMessage(null);
    try {
      const res = await api.runScheduledFtpStaging({
        connectionId: selectedDbId,
        targetType,
        forceAll: true
      });
      if (res.success) {
        setActiveMessage({
          type: 'success',
          text: `Scheduled staging completed in ${res.executionTimeMs}ms! Executed ${res.executedCount} feeds, staged ${res.totalStaged} records, skipped ${res.totalSkippedMismatches} mismatches.`
        });
        // Refresh configs list to reflect staged metrics
        const updated = await api.getFtpStagingConfigs(selectedDbId);
        setStagingConfigs(Array.isArray(updated) ? updated : []);
      }
    } catch (err: any) {
      setActiveMessage({ type: 'error', text: `Scheduled execution failed: ${err.message}` });
    } finally {
      setRunningScheduled(false);
    }
  };

  // Test Parse & Preview
  const handleTestParse = async () => {
    if (!selectedDbId) return;
    setIsPreviewing(true);
    setActiveMessage(null);

    const configPayload: Partial<FtpFileStagingConfig> = {
      name: configName,
      ftpConnectionId: selectedDbId,
      fileNamePattern: targetFileName,
      sampleFileName: sampleFileName || targetFileName,
      fileFormat,
      customDelimiter,
      hasHeader,
      headerRowIndex: Number(headerRowIndex),
      headerRowCount: Number(headerRowCount),
      handleMergedCells,
      mergedHeaderSeparator,
      dataStartRow: Number(dataStartRow),
      skipFooterLines: Number(skipFooterLines),
      quoteChar,
      dateFormat,
      excelSheetName,
      folderTraversalMode,
      sourceDirectoryPath: rootDirectoryPath || sourceDirectoryPath || '/',
      rootDirectoryPath: rootDirectoryPath || sourceDirectoryPath || '/',
      folderExceptions,
      mismatchHandling,
      scheduleConfig: {
        enabled: scheduleEnabled,
        frequency: scheduleFrequency,
        targetType: scheduleTargetType,
        scheduledTime: scheduleDailyTime
      },
      selectedImportantColumns,
      xmlRootElement,
      xmlRecordElement,
      fieldMappings
    };

    try {
      const preview = await api.testFtpPreviewParse(selectedDbId, configPayload);
      setPreviewResult(preview);

      // Auto-populate column mappings if currently empty
      if (preview.headersDetected && fieldMappings.length === 0) {
        const autoMapped: FtpFieldMapping[] = preview.headersDetected.map((hdr: string) => {
          const cleanHdr = hdr.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          const matched = standardFields.find(f => 
            f.key.toLowerCase() === cleanHdr ||
            f.key.toLowerCase().includes(cleanHdr) ||
            cleanHdr.includes(f.key.toLowerCase())
          );
          return {
            sourceColumn: hdr,
            canonicalField: matched ? matched.key : cleanHdr,
            dataType: matched ? matched.dataType : 'string',
            isImportant: true,
            isRequired: matched?.required || false,
            transform: 'TRIM'
          };
        });
        setFieldMappings(autoMapped);
      }
    } catch (err: any) {
      setActiveMessage({ type: 'error', text: `Test parse error: ${err.message}` });
    } finally {
      setIsPreviewing(false);
    }
  };

  // Toggle column as Important (projection filtering)
  const toggleColumnImportance = (colName: string) => {
    setSelectedImportantColumns(prev => {
      const exists = prev.includes(colName);
      const next = exists ? prev.filter(c => c !== colName) : [...prev, colName];
      // Sync with field mappings
      setFieldMappings(mappings => mappings.map(m => m.sourceColumn === colName ? { ...m, isImportant: !exists } : m));
      return next;
    });
  };

  const handleSelectAllImportant = () => {
    const all = previewResult?.headersDetected || fieldMappings.map(m => m.sourceColumn);
    setSelectedImportantColumns(all);
    setFieldMappings(mappings => mappings.map(m => ({ ...m, isImportant: true })));
  };

  const handleDeselectAllImportant = () => {
    setSelectedImportantColumns([]);
    setFieldMappings(mappings => mappings.map(m => ({ ...m, isImportant: false })));
  };

  // Save Staging Configuration
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDbId || !configName || !targetFileName) {
      setActiveMessage({ type: 'error', text: 'Name, FTP Server, and Target File are required.' });
      return;
    }

    const payload: Partial<FtpFileStagingConfig> = {
      name: configName,
      ftpConnectionId: selectedDbId,
      fileNamePattern: targetFileName,
      sampleFileName: sampleFileName || targetFileName,
      fileFormat,
      customDelimiter,
      hasHeader,
      headerRowIndex: Number(headerRowIndex),
      headerRowCount: Number(headerRowCount),
      handleMergedCells,
      mergedHeaderSeparator,
      dataStartRow: Number(dataStartRow),
      skipFooterLines: Number(skipFooterLines),
      quoteChar,
      dateFormat,
      excelSheetName,
      folderTraversalMode,
      sourceDirectoryPath: rootDirectoryPath || sourceDirectoryPath || '/',
      rootDirectoryPath: rootDirectoryPath || sourceDirectoryPath || '/',
      folderExceptions,
      mismatchHandling,
      scheduleConfig: {
        enabled: scheduleEnabled,
        frequency: scheduleFrequency,
        targetType: scheduleTargetType,
        scheduledTime: scheduleDailyTime
      },
      unconfiguredFolderAction: 'NOTIFY_ADMIN',
      selectedImportantColumns,
      xmlRootElement,
      xmlRecordElement,
      fieldMappings
    };

    try {
      if (editingConfigId) {
        const updated = await api.updateFtpStagingConfig(editingConfigId, payload);
        setStagingConfigs(prev => prev.map(c => c.id === editingConfigId ? updated : c));
        setActiveMessage({ type: 'success', text: `Configuration "${updated.name}" updated successfully.` });
      } else {
        const created = await api.createFtpStagingConfig(payload);
        setStagingConfigs(prev => [created, ...prev]);
        setActiveMessage({ type: 'success', text: `Configuration "${created.name}" created successfully.` });
      }
      setIsEditing(false);
    } catch (err: any) {
      setActiveMessage({ type: 'error', text: `Save error: ${err.message}` });
    }
  };

  // Delete Configuration
  const handleDeleteConfig = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove staging configuration "${name}"?`)) return;
    try {
      await api.deleteFtpStagingConfig(id);
      setStagingConfigs(prev => prev.filter(c => c.id !== id));
      setActiveMessage({ type: 'info', text: `Configuration "${name}" removed.` });
    } catch (err: any) {
      setActiveMessage({ type: 'error', text: `Delete failed: ${err.message}` });
    }
  };

  // Stage & Prepare File for Validation
  const handleStageFile = async (cfg: FtpFileStagingConfig) => {
    setIsStaging(true);
    setActiveMessage(null);
    try {
      const res = await api.stageFtpFile({ configId: cfg.id, connectionId: selectedDbId });
      if (res.success) {
        let msg = res.message || `Successfully staged ${res.stagedCount} records into prepared table ${res.stagingTableName}. Ready for lookup workflows!`;
        if (res.skippedMismatches && res.skippedMismatches.length > 0) {
          msg += ` (${res.skippedMismatches.length} incompatible files skipped with in-app notification).`;
        }
        setActiveMessage({
          type: res.skippedMismatches && res.skippedMismatches.length > 0 ? 'info' : 'success',
          text: msg
        });
        // Update local status
        setStagingConfigs(prev => prev.map(c => c.id === cfg.id ? {
          ...c,
          lastStagedStatus: 'STAGED_READY',
          lastStagedCount: res.stagedCount,
          lastStagedAt: new Date().toISOString(),
          stagingTableName: res.stagingTableName,
          lastSkippedMismatches: res.skippedMismatches || []
        } : c));
      }
    } catch (err: any) {
      setActiveMessage({ type: 'error', text: `Staging failed: ${err.message}` });
    } finally {
      setIsStaging(false);
    }
  };

  // Auto-map detected columns against canonical dictionary
  const handleAutoMapFields = () => {
    if (!previewResult || !previewResult.headersDetected) return;
    const mapped: FtpFieldMapping[] = previewResult.headersDetected.map((hdr: string) => {
      const clean = hdr.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const sf = standardFields.find(f => 
        f.key.toLowerCase() === clean ||
        f.key.toLowerCase().includes(clean) ||
        clean.includes(f.key.toLowerCase())
      );
      const isImportant = selectedImportantColumns.length === 0 || selectedImportantColumns.includes(hdr);
      return {
        sourceColumn: hdr,
        canonicalField: sf ? sf.key : clean,
        dataType: sf ? sf.dataType : 'string',
        isImportant,
        isRequired: sf?.required || false,
        transform: 'TRIM'
      };
    });
    setFieldMappings(mapped);
  };

  // Reduction percentage calculation
  const totalHeadersCount = previewResult?.headersDetected?.length || fieldMappings.length || 0;
  const selectedCount = selectedImportantColumns.length > 0 ? selectedImportantColumns.length : totalHeadersCount;
  const reductionPercent = totalHeadersCount > 0 ? Math.round((1 - (selectedCount / totalHeadersCount)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 rounded-2xl p-6 text-white border border-purple-800/40 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider font-bold bg-purple-500/20 text-purple-300 border border-purple-400/30 uppercase flex items-center gap-1">
              <FolderDown size={11} className="text-purple-400" />
              Multi-Format FTP & SFTP Parser Engine
            </span>
            <span className="text-xs text-purple-200 font-mono">Excel • CSV • XML • TXT</span>
          </div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <FileSpreadsheet className="text-purple-400" size={24} />
            FTP File Staging & Prepared Tables
          </h2>
          <p className="text-xs text-purple-200/80 max-w-3xl leading-relaxed">
            Configure multi-row and merged header extraction, inspect physical file structures, filter important columns to eliminate redundant data, and loop through multi-folder hierarchies to insert records into prepared tables ready for Validation and Lookup Workflows.
          </p>
        </div>

        {/* Server Switcher */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <div className="bg-slate-800/90 border border-purple-500/30 rounded-xl p-2 flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400 ml-1" />
            <select
              value={selectedDbId}
              onChange={e => {
                setSelectedDbId(e.target.value);
                if (typeof window !== 'undefined') localStorage.setItem('preferred_ftp_server_id', e.target.value);
              }}
              className="bg-transparent text-xs text-white font-bold focus:outline-none cursor-pointer pr-4"
              id="select-ftp-db-server"
            >
              {ftpServers.length === 0 ? (
                <option value="" className="bg-slate-900 text-white">No FTP Servers Configured</option>
              ) : (
                ftpServers.map(s => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                    {s.name} ({s.type} • {s.host}:{s.port}) {s.host === '127.0.0.1' || s.type === 'SFTP' ? '• Live SFTP' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            disabled={!selectedDb}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
            id="btn-new-ftp-staging-config"
          >
            <Plus className="w-4 h-4" />
            <span>Configure File Parser</span>
          </button>
        </div>
      </div>

      {/* Status / Alert Banner */}
      {activeMessage && (
        <div className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between border shadow-xs animate-in fade-in duration-200 ${
          activeMessage.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
          activeMessage.type === 'error' ? 'bg-rose-50 text-rose-900 border-rose-200' :
          'bg-blue-50 text-blue-900 border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {activeMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {activeMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {activeMessage.type === 'info' && <RefreshCw className="w-4 h-4 text-blue-600 shrink-0" />}
            <span>{activeMessage.text}</span>
          </div>
          <button onClick={() => setActiveMessage(null)} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* No FTP Server Notice */}
      {ftpServers.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto">
            <FolderDown className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-bold text-slate-800 text-sm">No FTP / SFTP Connections Registered</h3>
            <p className="text-xs text-slate-500">
              Register an FTP or SFTP server in Connection Settings to configure automated file staging, header parsing, and mirror table ingestion.
            </p>
          </div>
          {onNavigateToConnections && (
            <button
              type="button"
              onClick={onNavigateToConnections}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Go to Connection Settings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Interactive Remote Directory & File Structure Explorer */}
      {selectedDb && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
          {/* Explorer Top Bar */}
          <div className="p-4 bg-gradient-to-r from-slate-950 via-slate-900 to-purple-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-purple-900/40">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg border border-purple-400/30">
                  <FolderTree className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                  <span>Remote Directory &amp; File Structure Explorer</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-200 border border-purple-400/30">
                    {recursiveFiles.length} file{recursiveFiles.length !== 1 ? 's' : ''} detected
                  </span>
                </h3>
              </div>
              <p className="text-[11px] text-purple-200/80 max-w-2xl leading-relaxed">
                Explore folder hierarchies on <strong>{selectedDb.name}</strong> ({selectedDb.host}:{selectedDb.port}). File locations may change across rotating date folders while keeping the same format and schema. Pick any file as a representative sample to configure multi-row headers and column mappings for that entire file pattern.
              </p>
            </div>

            {/* Filter and Refresh Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search filter */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter files or folders..."
                  value={explorerSearch}
                  onChange={e => setExplorerSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-800/90 border border-purple-500/30 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-400 font-mono w-40 sm:w-48"
                />
              </div>

              {/* Format Filter */}
              <select
                value={explorerFilterType}
                onChange={e => setExplorerFilterType(e.target.value)}
                className="bg-slate-800/90 border border-purple-500/30 text-purple-200 text-xs rounded-xl px-2.5 py-1.5 font-mono focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Formats</option>
                <option value="CSV">CSV</option>
                <option value="EXCEL">EXCEL</option>
                <option value="XML">XML</option>
                <option value="TXT">TXT</option>
              </select>

              {/* Refresh Tree Button */}
              <button
                type="button"
                onClick={handleDiscoverRecursive}
                disabled={loadingRecursive}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                title="Rescan remote FTP directory tree"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRecursive ? 'animate-spin' : ''}`} />
                <span>{loadingRecursive ? 'Scanning...' : 'Scan Tree'}</span>
              </button>
            </div>
          </div>

          {/* Explorer Directory Tree Body */}
          <div className="p-4 divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {loadingRecursive ? (
              <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-purple-600" />
                <span>Scanning remote FTP directory tree across folders...</span>
              </div>
            ) : Object.keys(filteredFilesByFolder).length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 space-y-2">
                <FolderTree className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-700">No remote files detected on {selectedDb.name} ({selectedDb.host}:{selectedDb.port}).</p>
                <p className="text-[11px] text-slate-400">Ensure the remote FTP/SFTP service is running and accessible.</p>
                {ftpServers.some(s => s.id !== selectedDb.id && (s.host === '127.0.0.1' || s.type === 'SFTP')) && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const target = ftpServers.find(s => s.id !== selectedDb.id && (s.host === '127.0.0.1' || s.type === 'SFTP'));
                        if (target) {
                          setSelectedDbId(target.id);
                          if (typeof window !== 'undefined') localStorage.setItem('preferred_ftp_server_id', target.id);
                        }
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>Switch to Local SFTP ({ftpServers.find(s => s.id !== selectedDb.id && (s.host === '127.0.0.1' || s.type === 'SFTP'))?.name})</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              (Object.entries(filteredFilesByFolder) as [string, DiscoveredRecursiveFile[]][]).map(([folder, files]) => {
                const isCollapsed = collapsedFolders[folder];
                const isRoot = folder === '/' || !folder;
                const isDateFolder = /\b(19\d\d|20\d\d)\b/i.test(folder) || 
                  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(folder) ||
                  /\d{4}[-_/]\d{2}/.test(folder) || /\d{8}/.test(folder);

                return (
                  <div key={folder} className="py-2.5 first:pt-0 last:pb-0 space-y-2">
                    {/* Folder Header */}
                    <div className="flex items-center justify-between group">
                      <button
                        type="button"
                        onClick={() => toggleFolderCollapse(folder)}
                        className="flex items-center gap-2 text-left hover:text-purple-700 transition cursor-pointer py-1"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-purple-600" />
                        )}
                        <span className="p-1 rounded bg-slate-100 text-slate-600 group-hover:bg-purple-100 group-hover:text-purple-700">
                          {isCollapsed ? <Folder className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5 text-purple-600" />}
                        </span>
                        <span className="text-xs font-bold font-mono text-slate-800 group-hover:text-purple-700">
                          {isRoot ? '/ (Root Directory)' : folder}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {files.length} file{files.length !== 1 ? 's' : ''}
                        </span>
                        {isDateFolder && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-amber-600" />
                            <span>Rotating Date Folder (Dynamic Location)</span>
                          </span>
                        )}
                      </button>

                      <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                        {isRoot ? 'Permanent Base Directory' : 'Changing Subfolder Path'}
                      </span>
                    </div>

                    {/* Files inside folder */}
                    {!isCollapsed && (
                      <div className="pl-6 sm:pl-7 space-y-1.5">
                        {files.map((file, idx) => {
                          const formatBadgeColor = 
                            file.fileType === 'EXCEL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            file.fileType === 'XML' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            file.fileType === 'CSV' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            'bg-slate-100 text-slate-700 border-slate-200';

                          const FileIcon = 
                            file.fileType === 'EXCEL' ? FileSpreadsheet :
                            file.fileType === 'XML' ? FileCode :
                            FileText;

                          return (
                            <div
                              key={idx}
                              className="p-2 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-purple-50/40 hover:border-purple-200 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`p-1.5 rounded-lg border shrink-0 ${formatBadgeColor}`}>
                                  <FileIcon className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold font-mono text-slate-900 truncate">
                                      {file.name}
                                    </span>
                                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold border ${formatBadgeColor}`}>
                                      {file.fileType}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400">
                                      {(file.size / 1024).toFixed(1)} KB
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-500 truncate block">
                                    Full Path: {file.fullPath}
                                  </span>
                                </div>
                              </div>

                              {/* Action Buttons for this file */}
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() => handleUseFileAsSample(file)}
                                  className="px-2.5 py-1 text-slate-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer border border-slate-200 bg-white"
                                  title="Inspect physical structure of this file"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Inspect</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUseFileAsSample(file)}
                                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                                  title="Configure multi-row parsing & column mappings using this file as representative sample"
                                >
                                  <Sparkles className="w-3 h-3 text-purple-200" />
                                  <span>Use as Configuration Sample</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Active Staging Configurations Cards */}
      {ftpServers.length > 0 && (
        <div className="space-y-4">
          {/* Unconfigured Remote Folders Alert Banner */}
          {unconfiguredFolders.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-amber-900 shadow-xs animate-in fade-in-50">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-amber-500/20 text-amber-700 rounded-xl shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-950 flex items-center gap-2">
                    <span>Unconfigured Remote Folders Discovered ({unconfiguredFolders.length})</span>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-mono font-semibold">
                      Admin Notification Dispatched
                    </span>
                  </h4>
                  <p className="text-[11px] text-amber-800/90 mt-1">
                    Remote folder inspection identified files in directories not governed by any Root Staging Feed. Click to quickly configure a consolidated Root Staging Feed:
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {unconfiguredFolders.map(u => (
                      <div key={u.folderPath} className="inline-flex items-center gap-2 bg-white border border-amber-300 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-800 shadow-2xs">
                        <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
                        <span className="font-bold">{u.folderPath}</span>
                        <span className="text-[10px] text-slate-500 font-sans">({u.fileCount} file{u.fileCount !== 1 ? 's' : ''})</span>
                        <button
                          type="button"
                          onClick={() => handleConfigureUnconfiguredFolder(u)}
                          className="px-2 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded font-bold text-[10px] cursor-pointer transition"
                          title="Configure Root Staging Feed for this directory"
                        >
                          + Configure Root
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveUnconfiguredFolder(u.folderPath)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5"
                          title="Mark Resolved"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>Configured File Staging &amp; Prepared Tables ({stagingConfigs.length})</span>
            </h3>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleTriggerScheduledStaging('ALL')}
                disabled={runningScheduled || stagingConfigs.length === 0}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-purple-200 hover:text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5 border border-purple-800/40 disabled:opacity-50"
                title="Run scheduled ingestion event across all active feeds"
              >
                <Zap className={`w-3.5 h-3.5 text-amber-400 ${runningScheduled ? 'animate-pulse' : ''}`} />
                <span>{runningScheduled ? 'Executing Schedule...' : '⚡ Run Scheduled Ingestion'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Configure Staging Feed</span>
              </button>
            </div>
          </div>

          {loadingConfigs ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
              <span>Loading file staging configurations...</span>
            </div>
          ) : stagingConfigs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-3">
              <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
              <div>
                <h4 className="font-bold text-slate-700 text-xs">No Staging Feed Configured for this FTP Server</h4>
                <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-1">
                  Create a configuration to define multi-row headers, select important columns, and stage files into PostgreSQL mirror tables.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Configure Staging Feed</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stagingConfigs.map(cfg => {
                const isReady = cfg.lastStagedStatus === 'STAGED_READY';
                const hasError = cfg.lastStagedStatus === 'FAILED';
                const formatColor = 
                  cfg.fileFormat === 'EXCEL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  cfg.fileFormat === 'XML' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-purple-50 text-purple-700 border-purple-200';

                return (
                  <div
                    key={cfg.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-xs hover:border-purple-300 p-4.5 flex flex-col justify-between transition group"
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg border ${formatColor}`}>
                            <FileSpreadsheet className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-600 transition">
                              {cfg.name}
                            </h4>
                            <span className="text-[10px] font-mono text-slate-500">
                              {cfg.fileFormat} • {cfg.fileNamePattern}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(cfg)}
                            className="p-1 text-slate-400 hover:text-purple-600 rounded cursor-pointer"
                            title="Edit Configuration"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteConfig(cfg.id, cfg.name)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Delete Configuration"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Path & Pattern Architecture Badges */}
                      <div className="my-2 p-2 bg-slate-50 rounded-lg border border-slate-100 font-mono text-[11px] text-slate-600 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-[10px] uppercase font-bold">Root Folder:</span>
                          <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-800 font-semibold truncate max-w-[170px]" title={cfg.rootDirectoryPath || cfg.sourceDirectoryPath || '/'}>
                            {cfg.rootDirectoryPath || cfg.sourceDirectoryPath || '/'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-[10px] uppercase font-bold">Dynamic Pattern:</span>
                          <span className="px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-800 font-semibold truncate max-w-[170px]" title={cfg.fileNamePattern}>
                            {cfg.fileNamePattern}
                          </span>
                        </div>
                        {cfg.folderExceptions && cfg.folderExceptions.length > 0 && (
                          <div className="flex justify-between items-center text-indigo-700">
                            <span className="text-[10px] uppercase font-bold">Subfolder Exceptions:</span>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold text-[10px]">
                              {cfg.folderExceptions.length} override{cfg.folderExceptions.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {cfg.scheduleConfig?.enabled && (
                          <div className="flex justify-between items-center text-emerald-700">
                            <span className="text-[10px] uppercase font-bold flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" />
                              Schedule:
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[10px]">
                              {cfg.scheduleConfig.frequency} ({cfg.scheduleConfig.targetType || 'ALL'})
                            </span>
                          </div>
                        )}
                        {cfg.sampleFileName && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-[10px] uppercase font-bold">Sample File:</span>
                            <span className="text-emerald-700 font-medium truncate max-w-[170px]" title={cfg.sampleFileName}>
                              {cfg.sampleFileName}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t border-slate-200/60">
                          <span className="text-slate-400">Header Span:</span>
                          <span>Row {cfg.headerRowIndex || 1} ({cfg.headerRowCount || 1} rows)</span>
                        </div>
                        {cfg.excelSheetName && (
                          <div className="flex justify-between text-emerald-700">
                            <span>Excel Sheet:</span>
                            <span className="font-semibold">{cfg.excelSheetName}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-400">Important Columns:</span>
                          <span className="font-semibold text-purple-700">
                            {cfg.selectedImportantColumns?.length || cfg.fieldMappings?.length || 0} fields
                          </span>
                        </div>
                        {cfg.lastSkippedMismatches && cfg.lastSkippedMismatches.length > 0 && (
                          <div className="flex justify-between items-center pt-1 border-t border-amber-200/60 text-amber-800">
                            <span className="text-[10px] uppercase font-bold flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                              Skipped Mismatches:
                            </span>
                            <button
                              type="button"
                              onClick={() => setViewingMismatchesConfig(cfg)}
                              className="px-1.5 py-0.5 rounded bg-amber-100/70 border border-amber-300 text-amber-900 font-bold text-[10px] hover:bg-amber-200 cursor-pointer underline"
                            >
                              {cfg.lastSkippedMismatches.length} file{cfg.lastSkippedMismatches.length !== 1 ? 's' : ''}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Prepared Table Badge */}
                      {cfg.stagingTableName && (
                        <div className="p-1.5 bg-purple-50/70 border border-purple-200 rounded-lg text-[10px] font-mono text-purple-900 mb-2 truncate">
                          Table: <span className="font-bold">{cfg.stagingTableName}</span>
                        </div>
                      )}

                      {/* Staging Metrics Badge */}
                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                          isReady ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          hasError ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {isReady ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Layers className="w-3 h-3" />}
                          <span>{cfg.lastStagedStatus || 'IDLE'}</span>
                        </span>

                        <span className="text-[10px] text-slate-500 font-mono">
                          {cfg.lastStagedCount ? `${cfg.lastStagedCount} records` : 'Not staged'}
                        </span>
                      </div>
                    </div>

                    {/* Stage & Prepare Action Button */}
                    <div className="pt-3 border-t border-slate-100 mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleStageFile(cfg)}
                        disabled={isStaging}
                        className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>{isStaging ? 'Staging...' : 'Stage & Prepare Table'}</span>
                      </button>

                      {isReady && onNavigateToValidationBoxes && (
                        <button
                          type="button"
                          onClick={onNavigateToValidationBoxes}
                          className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold flex items-center gap-1 transition"
                          title="Use this prepared mirror table in Workflow Studio Lookups"
                        >
                          <span>Lookup Workflow</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Advanced Staging Configuration Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-50 text-purple-700 rounded-xl border border-purple-200">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingConfigId ? 'Edit Advanced File Parsing & Staging' : 'Configure Multi-Format File Staging & Table Preparation'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Target Server: {selectedDb?.name} ({selectedDb?.type} • {selectedDb?.host})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 overflow-y-auto flex-1 pr-1">
              {/* Configuration Name & Traversal Mode */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Configuration Name</label>
                  <input
                    type="text"
                    value={configName}
                    onChange={e => setConfigName(e.target.value)}
                    placeholder="e.g. Visa Daily Clearing Staging Feed"
                    required
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Traversal Scope</label>
                  <select
                    value={folderTraversalMode}
                    onChange={e => setFolderTraversalMode(e.target.value as any)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-800"
                  >
                    <option value="RECURSIVE_SCAN">Scan Subfolders Recursively (Rotating Folders)</option>
                    <option value="DIRECTORY_SCAN">Current Directory Scan</option>
                    <option value="SINGLE_FILE">Single Target File Only</option>
                  </select>
                </div>
              </div>

              {/* Path Architecture: Consolidated Root Folder & Subfolder Inheritance */}
              <div className="p-4 bg-slate-900 text-white rounded-xl border border-purple-800/40 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                      <FolderTree className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Consolidated Root Folder &amp; Subfolder Inheritance
                      </span>
                      <p className="text-[10px] text-purple-300/90 font-sans mt-0.5">
                        Configure once for a root directory. All child folders automatically inherit this format and stage into one consolidated mirror table.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono bg-purple-900/60 border border-purple-500/40 text-purple-200 px-2 py-0.5 rounded-full">
                    Single Mirror Table
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Root Folder Path */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-purple-200">
                        Root Directory Path (Consolidated Scope)
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono">Inherited by all subfolders</span>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={rootDirectoryPath}
                        onChange={e => {
                          setRootDirectoryPath(e.target.value);
                          setSourceDirectoryPath(e.target.value);
                        }}
                        placeholder="e.g. / or /incoming/ (Root Directory)"
                        className="flex-1 text-xs p-2 bg-slate-800 border border-purple-500/30 rounded-lg font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setRootDirectoryPath('/');
                          setSourceDirectoryPath('/');
                        }}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-purple-500/30 text-purple-300 rounded-lg text-[10px] font-mono cursor-pointer"
                        title="Set to server root directory"
                      >
                        / (Root)
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      All subfolders under this root directory are automatically scanned and consolidated into a single mirror table tagged with <code className="text-purple-300">_source_folder</code> and <code className="text-purple-300">_source_file</code>.
                    </p>
                  </div>

                  {/* Dynamic Path / File Pattern */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-purple-200">
                        File Matching Pattern
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono">Wildcard / Subfolder Mask</span>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={targetFileName}
                        onChange={e => {
                          setTargetFileName(e.target.value);
                          handleInspectStructure(sampleFileName || e.target.value);
                        }}
                        placeholder="e.g. */*.csv or *.csv or **/*.xlsx"
                        required
                        className="flex-1 text-xs p-2 bg-slate-800 border border-purple-500/30 rounded-lg font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                      {availableFiles.length > 0 && (
                        <select
                          onChange={e => {
                            if (e.target.value) {
                              setTargetFileName(e.target.value);
                              setSampleFileName(e.target.value);
                              handleInspectStructure(e.target.value);
                            }
                          }}
                          className="text-xs p-1.5 bg-slate-800 border border-purple-500/30 rounded-lg font-mono text-purple-200 cursor-pointer"
                        >
                          <option value="">Pattern...</option>
                          <option value="*/*.csv">*/*.csv (All Child Subfolders)</option>
                          <option value="*.csv">*.csv (Root Files Only)</option>
                          <option value="**/*.xlsx">**/*.xlsx (Nested Spreadsheets)</option>
                          <option value="**/*.xml">**/*.xml (Nested XML Feeds)</option>
                        </select>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Pattern to identify target files across the folder hierarchy.
                    </p>
                  </div>
                </div>

                {/* Scope & Match Status */}
                <div className="pt-2 border-t border-purple-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-slate-400">Effective Root Scope:</span>
                    <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-200 border border-purple-500/40 font-bold">
                      {rootDirectoryPath ? (rootDirectoryPath.endsWith('/') ? rootDirectoryPath : rootDirectoryPath + '/') : '/'}{targetFileName}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      matchingFilesInScope.length > 0 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {matchingFilesInScope.length} file{matchingFilesInScope.length !== 1 ? 's' : ''} currently discovered on server
                    </span>
                  </div>
                </div>

                {/* Matching Files Chips */}
                {matchingFilesInScope.length > 0 && (
                  <div className="p-2.5 bg-slate-950/70 rounded-lg border border-purple-900/40 text-[11px] font-mono space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Sample Files Discovered (Click any file to load as configuration sample):
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {matchingFilesInScope.map(mf => (
                        <button
                          key={mf.fullPath}
                          type="button"
                          onClick={() => {
                            setSampleFileName(mf.name);
                            handleInspectStructure(mf.fullPath || mf.name);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono transition flex items-center gap-1 cursor-pointer border ${
                            sampleFileName === mf.name || sampleFileName === mf.fullPath
                              ? 'bg-purple-600 text-white border-purple-400 font-bold shadow-xs'
                              : 'bg-slate-800 text-purple-200 border-purple-900/60 hover:bg-slate-700'
                          }`}
                        >
                          <span>{mf.relativeFolder !== '/' ? `${mf.relativeFolder}/${mf.name}` : mf.name}</span>
                          {(sampleFileName === mf.name || sampleFileName === mf.fullPath) && (
                            <Check className="w-2.5 h-2.5 text-white" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Subfolder Structure Exceptions Section */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200">
                      <FolderTree className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <span>Subfolder Structure Exceptions (Overrides)</span>
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.2 rounded-full font-mono font-semibold">
                          {folderExceptions.length} configured
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        If specific subfolders have different delimiters, formats, or header rows, specify them here. They stage into the same mirror table without creating redundant feeds.
                      </p>
                    </div>
                  </div>

                  {!isAddingException && (
                    <button
                      type="button"
                      onClick={() => setIsAddingException(true)}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Exception Override</span>
                    </button>
                  )}
                </div>

                {/* Inline Exception Creator */}
                {isAddingException && (
                  <div className="p-3.5 bg-white rounded-xl border-2 border-indigo-300 space-y-3 animate-in fade-in-50">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <h5 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-indigo-600" />
                        <span>New Subfolder Structure Exception</span>
                      </h5>
                      <button
                        type="button"
                        onClick={() => setIsAddingException(false)}
                        className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Subfolder Pattern</label>
                        <input
                          type="text"
                          value={newExcPattern}
                          onChange={e => setNewExcPattern(e.target.value)}
                          placeholder="e.g. /legacy/** or *special*"
                          className="w-full text-xs p-1.5 bg-slate-50 border border-slate-300 rounded font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Override Format</label>
                        <select
                          value={newExcFormat}
                          onChange={e => setNewExcFormat(e.target.value as any)}
                          className="w-full text-xs p-1.5 bg-slate-50 border border-slate-300 rounded font-semibold"
                        >
                          <option value="CSV">CSV</option>
                          <option value="TSV">TSV (Tab-Delimited)</option>
                          <option value="SEMICOLON">Semicolon-Delimited (;)</option>
                          <option value="PIPE">Pipe-Delimited (|)</option>
                          <option value="EXCEL">EXCEL (.xlsx / .xls)</option>
                          <option value="XML">XML</option>
                          <option value="TXT">Plain Text / Fixed</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Delimiter</label>
                        <input
                          type="text"
                          value={newExcDelimiter}
                          onChange={e => setNewExcDelimiter(e.target.value)}
                          placeholder="e.g. ; or | or \t"
                          className="w-full text-xs p-1.5 bg-slate-50 border border-slate-300 rounded font-mono text-center"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Header Row Index</label>
                        <input
                          type="number"
                          min={1}
                          value={newExcHeaderRowIndex}
                          onChange={e => setNewExcHeaderRowIndex(Number(e.target.value))}
                          className="w-full text-xs p-1.5 bg-slate-50 border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Data Start Row</label>
                        <input
                          type="number"
                          min={1}
                          value={newExcDataStartRow}
                          onChange={e => setNewExcDataStartRow(Number(e.target.value))}
                          className="w-full text-xs p-1.5 bg-slate-50 border border-slate-300 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Excel Sheet (Optional)</label>
                        <input
                          type="text"
                          value={newExcExcelSheet}
                          onChange={e => setNewExcExcelSheet(e.target.value)}
                          placeholder="Sheet Name"
                          className="w-full text-xs p-1.5 bg-slate-50 border border-slate-300 rounded font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Description / Note</label>
                      <input
                        type="text"
                        value={newExcDescription}
                        onChange={e => setNewExcDescription(e.target.value)}
                        placeholder="e.g. Legacy vendor clearing files use semicolon and 2 header rows"
                        className="w-full text-xs p-1.5 bg-slate-50 border border-slate-300 rounded"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsAddingException(false)}
                        className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddException}
                        className="px-4 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold cursor-pointer transition shadow-2xs"
                      >
                        Save Exception
                      </button>
                    </div>
                  </div>
                )}

                {/* Exceptions List */}
                {folderExceptions.length > 0 ? (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white overflow-hidden text-xs">
                    {folderExceptions.map(exc => (
                      <div key={exc.id} className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
                              {exc.folderPattern}
                            </span>
                            <span className="font-mono text-slate-500 font-semibold text-[10px]">
                              Format: {exc.fileFormat || 'Default'} {exc.customDelimiter ? `(Delimiter: ${exc.customDelimiter})` : ''}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Header Row: {exc.headerRowIndex || 1} • Data Start: {exc.dataStartRow || 2}
                            </span>
                          </div>
                          {exc.description && (
                            <p className="text-[11px] text-slate-500 italic truncate">{exc.description}</p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteException(exc.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Remove Exception"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  !isAddingException && (
                    <p className="text-[11px] text-slate-400 p-2.5 bg-white rounded-lg border border-slate-200 text-center">
                      No subfolder exceptions defined. All child folders and files will inherit the standard schema.
                    </p>
                  )
                )}
              </div>

              {/* Fault-Tolerant Mismatch Handling & Automated Scheduling Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Fault-Tolerant Mismatch Handling */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Fault-Tolerant Structure Mismatch Handling</h4>
                      <p className="text-[10px] text-slate-500">When an incompatible or corrupt file occurs during ingestion:</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                      mismatchHandling === 'SKIP_AND_NOTIFY' ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 font-bold' : 'bg-white border-slate-200 text-slate-700'
                    }`}>
                      <input
                        type="radio"
                        name="mismatchHandling"
                        checked={mismatchHandling === 'SKIP_AND_NOTIFY'}
                        onChange={() => setMismatchHandling('SKIP_AND_NOTIFY')}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <span>Skip File &amp; Notify User (Recommended)</span>
                        <p className="text-[10px] font-normal text-slate-500 mt-0.5">
                          Incompatible files are gracefully bypassed, an in-app notification is sent, and remaining files continue processing.
                        </p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                      mismatchHandling === 'ABORT' ? 'bg-rose-50/70 border-rose-300 text-rose-950 font-bold' : 'bg-white border-slate-200 text-slate-700'
                    }`}>
                      <input
                        type="radio"
                        name="mismatchHandling"
                        checked={mismatchHandling === 'ABORT'}
                        onChange={() => setMismatchHandling('ABORT')}
                        className="mt-0.5 text-rose-600 focus:ring-rose-500"
                      />
                      <div>
                        <span>Abort Batch on Mismatch</span>
                        <p className="text-[10px] font-normal text-slate-500 mt-0.5">
                          Stop ingestion immediately and fail the job upon encountering any incompatible file structure.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Automated Parsing Scheduling */}
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-purple-50 text-purple-700 rounded-lg border border-purple-200">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Scheduled Parsing Event</h4>
                        <p className="text-[10px] text-slate-500">Automate periodic parsing and ingestion:</p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scheduleEnabled}
                        onChange={e => setScheduleEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  <div className={`space-y-2 pt-1 transition-opacity ${scheduleEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Frequency</label>
                        <select
                          value={scheduleFrequency}
                          onChange={e => setScheduleFrequency(e.target.value as any)}
                          className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded font-semibold text-slate-800"
                        >
                          <option value="EVERY_15_MIN">Every 15 Minutes</option>
                          <option value="HOURLY">Hourly</option>
                          <option value="DAILY">Daily at Scheduled Time</option>
                          <option value="MANUAL">Manual Only</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Target File Type</label>
                        <select
                          value={scheduleTargetType}
                          onChange={e => setScheduleTargetType(e.target.value as any)}
                          className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded font-semibold text-slate-800"
                        >
                          <option value="ALL">All File Types</option>
                          <option value="CSV">CSV Only</option>
                          <option value="EXCEL">EXCEL Only</option>
                          <option value="XML">XML Feeds Only</option>
                          <option value="TXT">TXT / Fixed Width Only</option>
                        </select>
                      </div>
                    </div>

                    {scheduleFrequency === 'DAILY' && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Scheduled Time (HH:MM)</label>
                        <input
                          type="time"
                          value={scheduleDailyTime}
                          onChange={e => setScheduleDailyTime(e.target.value)}
                          className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Representative Sample File for Configuration */}
              <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-200 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <div>
                      <h4 className="text-xs font-bold text-purple-950">
                        Representative Sample File for Configuration
                      </h4>
                      <p className="text-[11px] text-purple-800/80">
                        This concrete sample file is parsed to detect multi-row headers, sheets, delimiters, and canonical mappings. This single configuration automatically governs all matching files across permanent and dynamic paths.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={sampleFileName || targetFileName}
                      onChange={e => {
                        const sel = e.target.value;
                        setSampleFileName(sel);
                        const match = recursiveFiles.find(f => f.name === sel || f.fullPath === sel);
                        handleInspectStructure(match?.fullPath || sel);
                      }}
                      className="text-xs p-1.5 bg-white border border-purple-300 rounded-lg font-mono font-bold text-purple-950 cursor-pointer shadow-2xs"
                    >
                      {matchingFilesInScope.length > 0 ? (
                        matchingFilesInScope.map(f => (
                          <option key={f.fullPath} value={f.name}>
                            Sample: {f.name} ({(f.size / 1024).toFixed(0)} KB)
                          </option>
                        ))
                      ) : (
                        recursiveFiles.map(f => (
                          <option key={f.fullPath} value={f.name}>
                            Sample: {f.name}
                          </option>
                        ))
                      )}
                    </select>

                    <button
                      type="button"
                      onClick={() => handleInspectStructure(sampleFileName || targetFileName)}
                      className="px-2.5 py-1.5 bg-white hover:bg-purple-100 text-purple-700 border border-purple-300 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Re-Inspect Sample</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic File Structure Inspector Banner */}
              <div className="p-3.5 bg-gradient-to-r from-purple-50 to-indigo-50/50 rounded-xl border border-purple-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-bold text-purple-950">File Structure & Type Inspection</span>
                    {isInspecting && <RefreshCw className="w-3 h-3 animate-spin text-purple-600" />}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInspectStructure()}
                    className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Re-Inspect File</span>
                  </button>
                </div>

                {isInspecting ? (
                  <div className="p-3 bg-white/80 rounded-lg border border-purple-100 flex items-center gap-2 text-xs text-purple-800 font-medium">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600" />
                    <span>Inspecting physical file structure on remote server...</span>
                  </div>
                ) : inspectionError ? (
                  <div className="p-3 bg-red-50/90 rounded-lg border border-red-200 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>Remote File Inspection Failed</span>
                    </div>
                    <p className="text-[11px] font-mono text-red-700 bg-white/90 p-2 rounded border border-red-200/60 break-all select-all">
                      {inspectionError}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Please correct the issue: verify that the file exists on the FTP/SFTP server, check credentials and folder permissions, or select a matching sample file from the discovered files list above.
                    </p>
                  </div>
                ) : structureInspection ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-1">
                    <div className="p-2 bg-white rounded-lg border border-purple-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Detected Type</span>
                      <span className="font-bold text-purple-700">{structureInspection.fileType}</span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-purple-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">File Size</span>
                      <span className="font-bold text-slate-800">{(structureInspection.fileSizeBytes / 1024).toFixed(1)} KB</span>
                    </div>
                    {structureInspection.excelSheets && (
                      <div className="p-2 bg-white rounded-lg border border-purple-100 sm:col-span-2">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Excel Sheets Detected ({structureInspection.excelSheets.length})</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <select
                            value={excelSheetName}
                            onChange={e => setExcelSheetName(e.target.value)}
                            className="text-xs font-semibold p-1 border border-slate-200 rounded bg-white text-slate-800 w-full"
                          >
                            {structureInspection.excelSheets.map((s: any) => (
                              <option key={s.name} value={s.name}>
                                {s.name} ({s.rowCount} rows, {s.colCount} cols {s.hasMergedCells ? '• Merged Cells' : ''})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                    {structureInspection.xmlRootElement && (
                      <div className="p-2 bg-white rounded-lg border border-purple-100 sm:col-span-2">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">XML Root & Record Path</span>
                        <span className="text-slate-800 font-semibold">{structureInspection.xmlRootElement} &gt; {xmlRecordElement || 'TxDtls'}</span>
                      </div>
                    )}
                    {structureInspection.detectedDelimiter && (
                      <div className="p-2 bg-white rounded-lg border border-purple-100">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Delimiter</span>
                        <span className="font-bold text-emerald-700">{structureInspection.detectedDelimiter === '\t' ? 'TAB' : structureInspection.detectedDelimiter}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Click &ldquo;Re-Inspect File&rdquo; to analyze the sheets, dimensions, or delimiters of this remote file.
                  </p>
                )}
              </div>

              {/* Advanced Header & Row Settings */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>Header Parsing & Row Location Configuration</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">File Format</label>
                    <select
                      value={fileFormat}
                      onChange={e => setFileFormat(e.target.value as any)}
                      className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 font-bold"
                    >
                      <option value="CSV">CSV (Comma Delimited)</option>
                      <option value="EXCEL">Excel Spreadsheet (.xlsx / .xls)</option>
                      <option value="XML">XML Feed (ISO 20022 / Clearing)</option>
                      <option value="PIPE">PIPE Delimited (|)</option>
                      <option value="TSV">TSV (Tab-Separated)</option>
                      <option value="SEMICOLON">Semicolon (;)</option>
                      <option value="TXT">Text / Fixed / Custom</option>
                      <option value="CUSTOM_DELIMITED">Custom Delimiter</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Header Row Location #
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={headerRowIndex}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setHeaderRowIndex(val);
                        setDataStartRow(val + headerRowCount);
                      }}
                      className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                      title="Row number where headers begin (skips earlier metadata/preambles)"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Header Span (Multi-Row)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={headerRowCount}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setHeaderRowCount(val);
                        setDataStartRow(headerRowIndex + val);
                      }}
                      className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                      title="Number of rows comprising the header (e.g. 2 for Category + Subfield)"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Data Start Row #</label>
                    <input
                      type="number"
                      min={headerRowIndex + 1}
                      value={dataStartRow}
                      onChange={e => setDataStartRow(Number(e.target.value))}
                      className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-200/60">
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="cb-handle-merged"
                      checked={handleMergedCells}
                      onChange={e => setHandleMergedCells(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="cb-handle-merged" className="text-[11px] font-semibold text-slate-700 cursor-pointer">
                      Forward-Fill Merged Cells
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Header Separator</label>
                    <input
                      type="text"
                      value={mergedHeaderSeparator}
                      onChange={e => setMergedHeaderSeparator(e.target.value)}
                      placeholder="_"
                      className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-lg font-mono text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Skip Trailer Lines</label>
                    <input
                      type="number"
                      min={0}
                      value={skipFooterLines}
                      onChange={e => setSkipFooterLines(Number(e.target.value))}
                      placeholder="0"
                      className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-lg font-mono"
                    />
                  </div>

                  {fileFormat === 'XML' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Repeating Record Tag</label>
                      <input
                        type="text"
                        value={xmlRecordElement}
                        onChange={e => setXmlRecordElement(e.target.value)}
                        placeholder="e.g. TxDtls"
                        className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  )}
                </div>
              </div>


              {/* Action: Run Test Parse */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestParse}
                    disabled={isPreviewing || !targetFileName}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPreviewing ? 'animate-spin' : ''}`} />
                    <span>{isPreviewing ? 'Parsing Remote Sample...' : 'Run Test & Extract Headers'}</span>
                  </button>

                  {previewResult && previewResult.headersDetected?.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoMapFields}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Auto-Map to Global Standard Directory</span>
                    </button>
                  )}
                </div>

                {previewResult && (
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg text-xs font-bold font-mono">
                      {previewResult.headersDetected?.length || 0} Headers Discovered
                    </span>
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold font-mono">
                      {selectedCount} Important Columns ({reductionPercent}% Storage Saved)
                    </span>
                  </div>
                )}
              </div>

              {/* Important Columns Selection (Projection Filtering) */}
              {previewResult && previewResult.headersDetected?.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5 text-purple-600" />
                        <span>Select Important Columns to Collect &amp; Stage</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Unchecked columns will be excluded from the prepared mirror table, avoiding database bloat.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllImportant}
                        className="text-[11px] px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded font-semibold text-slate-700"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={handleDeselectAllImportant}
                        className="text-[11px] px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded font-semibold text-slate-700"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {previewResult.headersDetected.map((hdr: string) => {
                      const isSelected = selectedImportantColumns.includes(hdr);
                      return (
                        <button
                          key={hdr}
                          type="button"
                          onClick={() => toggleColumnImportance(hdr)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition flex items-center gap-1.5 cursor-pointer border ${
                            isSelected
                              ? 'bg-purple-600 text-white border-purple-700 shadow-2xs font-bold'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3 text-slate-400" />}
                          <span>{hdr}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Live Preview Tabs */}
              {previewResult && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="flex items-center gap-1 bg-slate-100 p-1.5 border-b border-slate-200 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setActivePreviewTab('parsed')}
                      className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer ${
                        activePreviewTab === 'parsed' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Parsed Rows ({previewResult.parsedRowsSample?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePreviewTab('mapped')}
                      className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer ${
                        activePreviewTab === 'mapped' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Mapped Canonical Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePreviewTab('raw')}
                      className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer ${
                        activePreviewTab === 'raw' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Raw Lines &amp; Trailers
                    </button>
                  </div>

                  <div className="p-3 max-h-56 overflow-auto">
                    {activePreviewTab === 'parsed' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] font-mono">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="p-1.5 text-slate-400 font-semibold">#</th>
                              {previewResult.headersDetected?.map((h: string) => {
                                const isImp = selectedImportantColumns.includes(h);
                                return (
                                  <th key={h} className={`p-1.5 whitespace-nowrap ${isImp ? 'text-purple-700 font-bold' : 'text-slate-400'}`}>
                                    {h} {isImp ? '★' : ''}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {previewResult.parsedRowsSample?.map((row: any, idx: number) => (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="p-1.5 text-slate-400">{idx + 1}</td>
                                {previewResult.headersDetected?.map((h: string) => (
                                  <td key={h} className="p-1.5 text-slate-700 whitespace-nowrap">{row[h] ?? '—'}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activePreviewTab === 'mapped' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] font-mono">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="p-1.5 text-slate-400 font-semibold">#</th>
                              {fieldMappings.map(m => (
                                <th key={m.canonicalField} className="p-1.5 text-purple-700 font-bold whitespace-nowrap">
                                  {m.canonicalField}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewResult.mappedRowsSample?.map((row: any, idx: number) => (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="p-1.5 text-slate-400">{idx + 1}</td>
                                {fieldMappings.map(m => (
                                  <td key={m.canonicalField} className="p-1.5 text-slate-800 whitespace-nowrap font-medium">
                                    {row[m.canonicalField] ?? '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activePreviewTab === 'raw' && (
                      <div className="space-y-2 font-mono text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Sample Raw Content:</span>
                          <div className="bg-slate-900 text-emerald-400 p-2.5 rounded-lg overflow-x-auto space-y-0.5">
                            {previewResult.rawLinesSample?.map((line: string, i: number) => (
                              <div key={i} className="whitespace-pre">
                                <span className="text-slate-500 mr-2 select-none">{i + 1}:</span>
                                {line}
                              </div>
                            ))}
                          </div>
                        </div>

                        {previewResult.footerSkippedLines?.length > 0 && (
                          <div>
                            <span className="text-amber-600 block text-[10px] uppercase font-bold mb-1">
                              Skipped Trailer Lines ({previewResult.footerSkippedLines.length}):
                            </span>
                            <div className="bg-amber-50 text-amber-800 border border-amber-200 p-2 rounded-lg overflow-x-auto space-y-0.5">
                              {previewResult.footerSkippedLines.map((line: string, i: number) => (
                                <div key={i} className="whitespace-pre">
                                  <span className="text-amber-400 mr-2 select-none">TRL:</span>
                                  {line}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Field Mapping Grid */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Table className="w-3.5 h-3.5 text-purple-600" />
                    <span>Canonical Field Mappings (Global Standard Directory)</span>
                  </h4>

                  <button
                    type="button"
                    onClick={() => {
                      setFieldMappings(prev => [
                        ...prev,
                        { sourceColumn: '', canonicalField: 'transaction_id', dataType: 'string', isImportant: true, transform: 'TRIM' }
                      ]);
                    }}
                    className="text-[11px] font-bold text-purple-600 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Field Mapping</span>
                  </button>
                </div>

                {fieldMappings.length === 0 ? (
                  <p className="text-[11px] text-slate-400 p-3 bg-slate-50 rounded-lg border border-slate-100 text-center">
                    Click &ldquo;Run Test &amp; Extract Headers&rdquo; above to automatically detect file headers and map columns.
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 text-[11px]">
                        <tr>
                          <th className="p-2 w-16 text-center">Collect</th>
                          <th className="p-2">Raw File Column</th>
                          <th className="p-2">Canonical Target Field</th>
                          <th className="p-2">Transformation</th>
                          <th className="p-2 w-10 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {fieldMappings.map((m, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={m.isImportant !== false}
                                onChange={e => {
                                  const checked = e.target.checked;
                                  setFieldMappings(prev => prev.map((item, i) => i === idx ? { ...item, isImportant: checked } : item));
                                  if (m.sourceColumn) {
                                    setSelectedImportantColumns(cols => checked ? [...new Set([...cols, m.sourceColumn])] : cols.filter(c => c !== m.sourceColumn));
                                  }
                                }}
                                className="rounded text-purple-600 focus:ring-purple-500"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                value={m.sourceColumn}
                                onChange={e => {
                                  const val = e.target.value;
                                  setFieldMappings(prev => prev.map((item, i) => i === idx ? { ...item, sourceColumn: val } : item));
                                }}
                                placeholder="Source Column Name"
                                className="w-full text-xs p-1 bg-white border border-slate-200 rounded font-mono"
                              />
                            </td>
                            <td className="p-1.5">
                              <select
                                value={m.canonicalField}
                                onChange={e => {
                                  const val = e.target.value;
                                  const sf = standardFields.find(f => f.key === val);
                                  setFieldMappings(prev => prev.map((item, i) => i === idx ? { 
                                    ...item, 
                                    canonicalField: val,
                                    dataType: sf?.dataType || item.dataType
                                  } : item));
                                }}
                                className="w-full text-xs p-1 bg-white border border-slate-200 rounded font-semibold text-purple-700"
                              >
                                {standardFields.map(sf => (
                                  <option key={sf.key} value={sf.key}>
                                    {sf.label} ({sf.key})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-1.5">
                              <select
                                value={m.transform || 'TRIM'}
                                onChange={e => {
                                  const val = e.target.value as any;
                                  setFieldMappings(prev => prev.map((item, i) => i === idx ? { ...item, transform: val } : item));
                                }}
                                className="w-full text-xs p-1 bg-white border border-slate-200 rounded text-slate-600"
                              >
                                <option value="NONE">None</option>
                                <option value="TRIM">Trim Whitespace</option>
                                <option value="UPPERCASE">Uppercase</option>
                                <option value="LOWERCASE">Lowercase</option>
                                <option value="NUMERIC_CLEAN">Numeric Clean (Strip $, ,)</option>
                              </select>
                            </td>
                            <td className="p-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => setFieldMappings(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Staging Configuration</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Skipped Mismatches Inspection Modal */}
      {viewingMismatchesConfig && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-200">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Skipped Incompatible Files (Fault-Tolerant Log)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Feed: {viewingMismatchesConfig.name} • {viewingMismatchesConfig.lastSkippedMismatches?.length || 0} files skipped
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setViewingMismatchesConfig(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-600">
                The following files encountered structure or format mismatches and were gracefully bypassed without interrupting the consolidated staging batch:
              </p>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 text-[11px]">
                    <tr>
                      <th className="p-2.5">File Name</th>
                      <th className="p-2.5">Subfolder</th>
                      <th className="p-2.5">Mismatch Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {viewingMismatchesConfig.lastSkippedMismatches?.map((sm, i) => (
                      <tr key={i} className="hover:bg-amber-50/40">
                        <td className="p-2.5 font-bold text-slate-900">{sm.fileName}</td>
                        <td className="p-2.5 text-slate-500">{sm.folder || '/'}</td>
                        <td className="p-2.5 text-rose-700 font-sans">{sm.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewingMismatchesConfig(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
