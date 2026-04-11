"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

const Txt = ({ children, vertical = false }: { children: string; vertical?: boolean }) => {
  if (!children) return null;
  const content = children.split(' ').map((word, index, array) => (
    <span key={index} style={{ whiteSpace: 'nowrap' }}>
      {word}
      {index < array.length - 1 && (
        <span style={{ position: 'relative', display: 'inline-flex', justifyContent: 'center' }}>
          <span style={{ color: 'transparent', whiteSpace: 'pre' }}> </span>
          <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>_</span>
        </span>
      )}
    </span>
  ));
  return (
    <span style={{ 
      textTransform: 'uppercase', writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
      display: 'inline-flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center'
    }}>{content}</span>
  );
};

type ColumnType = 'text' | 'image' | 'number';
interface Column { id: string; name: string; type: ColumnType; isBase?: boolean; }
interface Dataset { id: string; name: string; }

type ContextMenuState = {
  x: number; y: number; type: 'header' | 'cell' | 'row' | 'dataset'; rowIndex: number; colId: string | null; datasetId?: string | null;
} | null;

const defaultColumns: Column[] = [
  { id: 'qte', name: 'Quantité', type: 'number', isBase: true },
  { id: 'id', name: 'Identifiant', type: 'text', isBase: true },
  { id: 'name', name: 'Nom de la carte', type: 'text', isBase: true },
];

export default function DataTab() {
  const params = useParams();
  const projectSlug = params?.id as string;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'editor'>('grid');

  const [datasets, setDatasets] = useState<Dataset[]>([{ id: 'default', name: 'Set Principal' }]);
  const [activeDatasetId, setActiveDatasetId] = useState('default');
  const [dataStore, setDataStore] = useState<Record<string, { columns: Column[], rows: any[] }>>({});
  const [columns, setColumns] = useState<Column[]>(defaultColumns);
  const [rows, setRows] = useState<any[]>([]);
  const [history, setHistory] = useState<any[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [isSetModalOpen, setIsSetModalOpen] = useState(false);
  const [datasetModalMode, setDatasetModalMode] = useState<'add' | 'edit'>('add');
  const [setFormName, setSetFormName] = useState('');
  const [activeDatasetToEdit, setActiveDatasetToEdit] = useState<string | null>(null);

  const [isColModalOpen, setIsColModalOpen] = useState(false);
  const [colForm, setColForm] = useState({ name: '', type: 'text' as ColumnType });
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const [colInsertIndex, setColInsertIndex] = useState<number | null>(null);

  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ row: number, col: string } | null>(null);
  const [lastSelectedRowIndex, setLastSelectedRowIndex] = useState<number | null>(null);

  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const [fillTargetCells, setFillTargetCells] = useState<string[]>([]);
  const [bottomRightCell, setBottomRightCell] = useState<string | null>(null);

  const selectedRowIndices = Array.from(new Set(selectedCells.map(c => parseInt(c.split('-')[0]))));
  const isMultiRowSelected = selectedRowIndices.length > 1;

  useEffect(() => {
    if (selectedCells.length === 0) { setBottomRightCell(null); return; }
    let maxRow = -1; let maxColIdx = -1;
    selectedCells.forEach(cell => {
      const [rStr, cId] = cell.split('-');
      const r = parseInt(rStr); const cIdx = columns.findIndex(c => c.id === cId);
      if (r > maxRow) maxRow = r; if (cIdx > maxColIdx) maxColIdx = cIdx;
    });
    setBottomRightCell(`${maxRow}-${columns[maxColIdx]?.id}`);
  }, [selectedCells, columns]);

  useEffect(() => {
    const loadData = async () => {
      if (!projectSlug) return;
      setIsLoading(true);

      const decodedSlug = decodeURIComponent(projectSlug);
      const { data, error: projectError } = await supabase
        .from('projects')
        .select('id, columns_schema')
        .eq('slug', decodedSlug)
        .limit(1);
      
      const projectData = data?.[0]; // On prend le premier résultat de façon sécurisée

      if (projectError || !projectData) { 
        console.error("Erreur de chargement:", projectError);
        setIsLoading(false); 
        return; 
      }
      setProjectId(projectData.id);
      
      let loadedDatasets = [{ id: 'default', name: 'Set Principal' }];
      let loadedColumnsByDataset: Record<string, Column[]> = { 'default': defaultColumns };

      if (projectData.columns_schema && !Array.isArray(projectData.columns_schema) && projectData.columns_schema.datasets) {
        loadedDatasets = projectData.columns_schema.datasets;
        loadedColumnsByDataset = projectData.columns_schema.columnsByDataset || {};
      } else if (Array.isArray(projectData.columns_schema) && projectData.columns_schema.length > 0) {
        loadedColumnsByDataset['default'] = projectData.columns_schema;
      }

      setDatasets(loadedDatasets);
      const firstId = loadedDatasets[0].id;
      setActiveDatasetId(firstId);

      const initialStore: Record<string, { columns: Column[], rows: any[] }> = {};
      loadedDatasets.forEach(ds => { initialStore[ds.id] = { columns: loadedColumnsByDataset[ds.id] || defaultColumns, rows: [] }; });

      const { data: cardsData } = await supabase.from('cards').select('*').eq('project_id', projectData.id).order('row_order');

      if (cardsData) {
        cardsData.forEach(card => {
          const dsId = card.dataset_id || 'default';
          if (!initialStore[dsId]) initialStore[dsId] = { columns: defaultColumns, rows: [] };
          initialStore[dsId].rows.push(card.data);
        });
      }

      loadedDatasets.forEach(ds => {
        if (initialStore[ds.id].rows.length === 0) initialStore[ds.id].rows = [{ id: '#001', name: 'Nouvelle Entrée', qte: '1' }];
      });

      setDataStore(initialStore);
      setColumns(initialStore[firstId].columns);
      setRows(initialStore[firstId].rows);
      setHistory([initialStore[firstId].rows]);
      setIsLoading(false);
    };
    loadData();
  }, [projectSlug]);

  const saveToDatabase = async () => {
    if (!projectId) return;
    setIsSaving(true);
    const finalDataStore = { ...dataStore, [activeDatasetId]: { columns, rows } };
    setDataStore(finalDataStore);

    const columnsByDataset: Record<string, Column[]> = {};
    datasets.forEach(ds => { columnsByDataset[ds.id] = finalDataStore[ds.id]?.columns || defaultColumns; });

    // 1. Sauvegarde du schéma
    const { error: errProj } = await supabase.from('projects').update({ columns_schema: { datasets, columnsByDataset } }).eq('id', projectId);
    if (errProj) console.error("❌ Erreur projet:", errProj);

    // 2. Suppression des anciennes cartes
    const { error: errDel } = await supabase.from('cards').delete().eq('project_id', projectId);
    if (errDel) console.error("❌ Erreur suppression:", errDel);
    
    // 3. Insertion des nouvelles cartes
    const cardsToInsert: any[] = [];
    datasets.forEach(ds => {
      const dsRows = finalDataStore[ds.id]?.rows || [];
      dsRows.forEach((row, index) => { cardsToInsert.push({ project_id: projectId, dataset_id: ds.id, row_order: index, data: row }); });
    });

    if (cardsToInsert.length > 0) {
      const { error: errIns } = await supabase.from('cards').insert(cardsToInsert);
      if (errIns) console.error("❌ Erreur insertion:", errIns);
    }
    
    setIsSaving(false); setHasChanges(false);
  };

  const goToGrid = () => { setDataStore(prev => ({ ...prev, [activeDatasetId]: { columns, rows } })); setViewMode('grid'); setSelectedCells([]); setContextMenu(null); };

  const openDataset = (newId: string) => {
    if (newId === activeDatasetId && viewMode === 'editor') return;
    setDataStore(prev => ({ ...prev, [activeDatasetId]: { columns, rows } }));
    const nextData = dataStore[newId] || { columns: defaultColumns, rows: [{ id: '#001', name: 'Nouvelle Entrée', qte: '1' }] };
    setColumns(nextData.columns); setRows(nextData.rows); setActiveDatasetId(newId);
    setHistory([nextData.rows]); setHistoryIndex(0); setSelectedCells([]); setContextMenu(null); setViewMode('editor');
  };

  const saveSchema = async (updatedDatasets: Dataset[], updatedDataStore: Record<string, { columns: Column[], rows: any[] }>) => {
    if (!projectId) return;
    const columnsByDataset: Record<string, Column[]> = {};
    updatedDatasets.forEach(ds => { columnsByDataset[ds.id] = updatedDataStore[ds.id]?.columns || defaultColumns; });
    await supabase.from('projects').update({ columns_schema: { datasets: updatedDatasets, columnsByDataset } }).eq('id', projectId);
  };

  const openAddDatasetModal = () => { setSetFormName(`Set de cartes ${datasets.length + 1}`); setDatasetModalMode('add'); setIsSetModalOpen(true); };

  const saveDatasetDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setFormName.trim()) return;

    if (datasetModalMode === 'add') {
      const newId = 'ds_' + Math.random().toString(36).substring(2, 9);
      const newDataset = { id: newId, name: setFormName };
      const newDatasets = [...datasets, newDataset];
      const newDataStore = { ...dataStore, [activeDatasetId]: { columns, rows }, [newId]: { columns: defaultColumns, rows: [{ id: '#001', name: 'Nouvelle Entrée', qte: '1' }] } };
      setDatasets(newDatasets);
      setDataStore(newDataStore);
      setColumns(defaultColumns); setRows([{ id: '#001', name: 'Nouvelle Entrée', qte: '1' }]); setActiveDatasetId(newId);
      setHistory([[{ id: '#001', name: 'Nouvelle Entrée', qte: '1' }]]); setHistoryIndex(0); setViewMode('editor');
      await saveSchema(newDatasets, newDataStore);
    } else if (datasetModalMode === 'edit' && activeDatasetToEdit) {
      const newDatasets = datasets.map(ds => ds.id === activeDatasetToEdit ? { ...ds, name: setFormName } : ds);
      setDatasets(newDatasets);
      await saveSchema(newDatasets, { ...dataStore, [activeDatasetId]: { columns, rows } });
    }
    setIsSetModalOpen(false);
  };

  const handleDatasetContextMenu = (e: React.MouseEvent, datasetId: string) => {
    e.preventDefault(); e.stopPropagation();
    let x = e.clientX; let y = e.clientY;
    if (y + 200 > window.innerHeight) y = Math.max(0, e.clientY - 200); 
    if (x + 220 > window.innerWidth) x = Math.max(0, e.clientX - 220);
    setContextMenu({ x, y, type: 'dataset', rowIndex: -1, colId: null, datasetId });
  };

  const openEditDatasetModal = (datasetId: string) => {
    const ds = datasets.find(d => d.id === datasetId);
    if (ds) { setSetFormName(ds.name); setActiveDatasetToEdit(datasetId); setDatasetModalMode('edit'); setIsSetModalOpen(true); }
    setContextMenu(null);
  };

  const duplicateDataset = async (targetId: string) => {
    const original = datasets.find(ds => ds.id === targetId);
    if (!original) return;
    setContextMenu(null);
    const newId = 'ds_' + Math.random().toString(36).substring(2, 9);
    const newDataset = { id: newId, name: `${original.name} Copie` };
    const sourceData = targetId === activeDatasetId ? { columns, rows } : dataStore[targetId] || { columns: defaultColumns, rows: [] };
    const clonedData = JSON.parse(JSON.stringify(sourceData));
    clonedData.rows.forEach((r: any, i: number) => { r.id = `#${String(i + 1).padStart(3, '0')}`; });
    const newDatasets = [...datasets, newDataset];
    const newDataStore = { ...dataStore, [activeDatasetId]: { columns, rows }, [newId]: clonedData };
    setDatasets(newDatasets);
    setDataStore(newDataStore);
    setHasChanges(true);
    await saveSchema(newDatasets, newDataStore);
    // Ouvrir directement le renommage
    setActiveDatasetToEdit(newId);
    setSetFormName(newDataset.name);
    setDatasetModalMode('edit');
    setIsSetModalOpen(true);
  };

  const deleteDataset = (targetId: string) => {
    if (datasets.length <= 1) { alert("⚠️ SÉCURITÉ : Vous ne pouvez pas supprimer le dernier set de données."); setContextMenu(null); return; }
    const newDatasets = datasets.filter(ds => ds.id !== targetId);
    setDatasets(newDatasets);
    const newDataStore = { ...dataStore }; delete newDataStore[targetId]; setDataStore(newDataStore);
    if (activeDatasetId === targetId) {
      const nextId = newDatasets[0].id; setActiveDatasetId(nextId);
      setColumns(newDataStore[nextId]?.columns || defaultColumns); setRows(newDataStore[nextId]?.rows || []);
      setHistory([newDataStore[nextId]?.rows || []]); setHistoryIndex(0);
    }
    setHasChanges(true); setContextMenu(null);
  };

  const pushHistory = (newRows: any[]) => {
    const newHistory = history.slice(0, historyIndex + 1); newHistory.push(JSON.parse(JSON.stringify(newRows)));
    setHistory(newHistory); setHistoryIndex(newHistory.length - 1); setRows(newRows); setHasChanges(true);
  };

  const undo = () => { if (historyIndex > 0) { setHistoryIndex(historyIndex - 1); setRows(JSON.parse(JSON.stringify(history[historyIndex - 1]))); setHasChanges(true); } };
  const redo = () => { if (historyIndex < history.length - 1) { setHistoryIndex(historyIndex + 1); setRows(JSON.parse(JSON.stringify(history[historyIndex + 1]))); setHasChanges(true); } };

  useEffect(() => {
    const handleGlobalClick = () => { setContextMenu(null); setSelectedCells([]); setLastSelectedRowIndex(null); };
    const handleMouseUp = () => { setIsDraggingSelection(false); if (isDraggingFill) applyFillHandle(); };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'editor') return; 
      if (e.ctrlKey || e.metaKey) { if (e.key === 'z') { e.preventDefault(); undo(); } if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); } }
    };
    window.addEventListener('click', handleGlobalClick); window.addEventListener('mouseup', handleMouseUp); window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('click', handleGlobalClick); window.removeEventListener('mouseup', handleMouseUp); window.removeEventListener('keydown', handleKeyDown); };
  }, [isDraggingFill, fillTargetCells, viewMode]);

  const applyFillHandle = () => {
    if (fillTargetCells.length === 0) { setIsDraggingFill(false); return; }
    const newRows = [...rows];
    const selRows = Array.from(new Set(selectedCells.map(c => parseInt(c.split('-')[0])))).sort((a,b)=>a-b);
    const colIndices = columns.map(c => c.id);
    const selColIds = Array.from(new Set(selectedCells.map(c => c.split('-')[1])));
    selColIds.sort((a,b) => colIndices.indexOf(a) - colIndices.indexOf(b));
    const origMinR = selRows[0]; const origMinCIdx = colIndices.indexOf(selColIds[0]);
    const rowLen = selRows.length; const colLen = selColIds.length;

    fillTargetCells.forEach(targetCell => {
      const [rStr, colId] = targetCell.split('-');
      const rIdx = parseInt(rStr); const cIdx = colIndices.indexOf(colId);
      if (colId !== 'id') { 
        let rOffset = (rIdx - origMinR) % rowLen; if (rOffset < 0) rOffset += rowLen; 
        let cOffset = (cIdx - origMinCIdx) % colLen; if (cOffset < 0) cOffset += colLen;
        newRows[rIdx][colId] = newRows[selRows[rOffset]][selColIds[cOffset]];
      }
    });
    pushHistory(newRows); setIsDraggingFill(false); setFillTargetCells([]);
    setSelectedCells(Array.from(new Set([...selectedCells, ...fillTargetCells])));
  };

  const handleFillMouseEnter = (rowIndex: number, colId: string) => {
    if (!isDraggingFill || selectedCells.length === 0) return;
    const origRows = selectedCells.map(c => parseInt(c.split('-')[0]));
    const origColIndices = selectedCells.map(c => columns.findIndex(col => col.id === c.split('-')[1]));
    const targetCIdx = columns.findIndex(c => c.id === colId);
    const minR = Math.min(...origRows, rowIndex); const maxR = Math.max(...origRows, rowIndex);
    const minCIdx = Math.min(...origColIndices, targetCIdx); const maxCIdx = Math.max(...origColIndices, targetCIdx);
    const newTargetCells: string[] = [];
    for (let r = minR; r <= maxR; r++) {
      for (let c = minCIdx; c <= maxCIdx; c++) {
        const cellKey = `${r}-${columns[c].id}`;
        if (!selectedCells.includes(cellKey)) newTargetCells.push(cellKey);
      }
    }
    setFillTargetCells(newTargetCells);
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'header' | 'cell' | 'row', rowIndex: number, colId: string | null) => {
    e.preventDefault();
    let x = e.clientX; let y = e.clientY;
    if (y + 350 > window.innerHeight) y = Math.max(0, e.clientY - 350); 
    if (x + 220 > window.innerWidth) x = Math.max(0, e.clientX - 220);
    setContextMenu({ x, y, type, rowIndex, colId });
  };

  const handleRowGripClick = (e: React.MouseEvent, rowIndex: number) => {
    e.stopPropagation(); 
    const allColIds = columns.map(c => c.id);
    let newSelection = [...selectedCells];
    if (e.shiftKey && lastSelectedRowIndex !== null) {
      newSelection = [];
      const start = Math.min(lastSelectedRowIndex, rowIndex); const end = Math.max(lastSelectedRowIndex, rowIndex);
      for (let r = start; r <= end; r++) allColIds.forEach(colId => newSelection.push(`${r}-${colId}`));
    } else if (e.ctrlKey || e.metaKey) {
      const rowCells = allColIds.map(colId => `${rowIndex}-${colId}`);
      if (rowCells.every(cell => newSelection.includes(cell))) newSelection = newSelection.filter(cell => !rowCells.includes(cell));
      else rowCells.forEach(cell => { if (!newSelection.includes(cell)) newSelection.push(cell); });
      setLastSelectedRowIndex(rowIndex);
    } else {
      newSelection = allColIds.map(colId => `${rowIndex}-${colId}`);
      setLastSelectedRowIndex(rowIndex);
    }
    setSelectedCells(newSelection);
  };

  const selectEntireColumn = (colId: string) => setSelectedCells(rows.map((_, rowIndex) => `${rowIndex}-${colId}`));

  const calculateSelectionBox = (startRow: number, startColId: string, endRow: number, endColId: string) => {
    const colIds = columns.map(c => c.id);
    const minCol = Math.min(colIds.indexOf(startColId), colIds.indexOf(endColId));
    const maxCol = Math.max(colIds.indexOf(startColId), colIds.indexOf(endColId));
    const minRow = Math.min(startRow, endRow); const maxRow = Math.max(startRow, endRow);
    const newSelection = [];
    for (let r = minRow; r <= maxRow; r++) { for (let c = minCol; c <= maxCol; c++) newSelection.push(`${r}-${colIds[c]}`); }
    return newSelection;
  };

  const handleCellMouseDown = (e: React.MouseEvent, rowIndex: number, colId: string) => {
    if (e.button !== 0) return; 
    setIsDraggingSelection(true); setSelectionStart({ row: rowIndex, col: colId });
    if (e.ctrlKey || e.metaKey) setSelectedCells(prev => [...prev, `${rowIndex}-${colId}`]);
    else setSelectedCells([`${rowIndex}-${colId}`]);
  };

  const handleCellMouseEnter = (rowIndex: number, colId: string) => {
    if (isDraggingSelection && selectionStart) setSelectedCells(calculateSelectionBox(selectionStart.row, selectionStart.col, rowIndex, colId));
    if (isDraggingFill) handleFillMouseEnter(rowIndex, colId);
  };

  const handleRowDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedRowIndex === null || draggedRowIndex === targetIndex) return;
    const newRows = [...rows]; const [removed] = newRows.splice(draggedRowIndex, 1);
    newRows.splice(targetIndex, 0, removed); pushHistory(newRows); setDraggedRowIndex(null);
  };

  const handleColDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedColId || draggedColId === targetId) return;
    const newCols = [...columns]; const draggedIdx = newCols.findIndex(c => c.id === draggedColId); const targetIdx = newCols.findIndex(c => c.id === targetId);
    const [removed] = newCols.splice(draggedIdx, 1); newCols.splice(targetIdx, 0, removed);
    setColumns(newCols); setDraggedColId(null); setHasChanges(true);
  };

  const processPaste = (text: string, targetRowIdx: number, targetColId: string) => {
    const newRows = [...rows];
    if (!text.includes('\n') && !text.includes('\t') && selectedCells.length > 1) {
      selectedCells.forEach(cellKey => { const [rStr, colId] = cellKey.split('-'); if (colId !== 'id') newRows[parseInt(rStr)][colId] = text.trim(); });
    } else {
      const pasteRows = text.split('\n').map(r => r.split('\t')); const colOrder = columns.map(c => c.id); const startColIdx = colOrder.indexOf(targetColId);
      pasteRows.forEach((pRow, rOffset) => {
        const rowIdx = targetRowIdx + rOffset;
        if (newRows[rowIdx]) {
          pRow.forEach((val, cOffset) => { const targetCol = colOrder[startColIdx + cOffset]; if (targetCol && targetCol !== 'id') newRows[rowIdx][targetCol] = val.trim(); });
        }
      });
    }
    pushHistory(newRows);
  };

  const handleCopy = () => {
    if (selectedCells.length > 0) {
      const rIndexes = Array.from(new Set(selectedCells.map(c => parseInt(c.split('-')[0])))).sort((a,b)=>a-b);
      const colOrder = columns.map(c => c.id);
      const textData = rIndexes.map(r => {
        const cellsInRow = selectedCells.filter(c => c.startsWith(`${r}-`));
        cellsInRow.sort((a,b) => colOrder.indexOf(a.split('-')[1]) - colOrder.indexOf(b.split('-')[1]));
        return cellsInRow.map(c => rows[r][c.split('-')[1]] || '').join('\t');
      }).join('\n');
      navigator.clipboard.writeText(textData);
    } else if (contextMenu && contextMenu.colId) {
      navigator.clipboard.writeText(rows[contextMenu.rowIndex][contextMenu.colId] || '');
    }
    setContextMenu(null);
  };

  const handleMenuPaste = async () => {
    try {
      const text = await navigator.clipboard.readText(); const targetColId = contextMenu?.colId || columns[0].id;
      if (contextMenu && (contextMenu.type === 'cell' || contextMenu.type === 'row')) processPaste(text, contextMenu.rowIndex, targetColId);
      setContextMenu(null);
    } catch (err) { alert("⚠️ Utilisez CTRL+V / CMD+V à la place."); setContextMenu(null); }
  };

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (viewMode !== 'editor' || selectedCells.length === 0) return;
      const text = e.clipboardData?.getData('text'); if (!text) return;
      if (document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault(); const firstCell = selectedCells[0].split('-'); processPaste(text, parseInt(firstCell[0]), firstCell[1]);
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [rows, columns, selectedCells, viewMode]);

  const saveColumn = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedName = colForm.name; 
    if (modalMode === 'add') {
      const newId = formattedName.toLowerCase().replace(/\s+/g, '_');
      const newCol = { id: newId, name: formattedName, type: colForm.type };
      if (colInsertIndex !== null) { const newCols = [...columns]; newCols.splice(colInsertIndex, 0, newCol); setColumns(newCols); } 
      else setColumns([...columns, newCol]);
    } else setColumns(columns.map(c => c.id === activeColId ? { ...c, name: formattedName, type: colForm.type } : c));
    setIsColModalOpen(false); setHasChanges(true);
  };

  const deleteColumn = (id: string) => { setColumns(columns.filter(c => c.id !== id)); pushHistory(rows.map(row => { const { [id]: _, ...rest } = row; return rest; })); setHasChanges(true); };

  const duplicateSelectedRows = () => {
    const rowsToDuplicate = selectedRowIndices.map(i => ({...rows[i], id: `#${String(rows.length + Math.floor(Math.random()*100)).padStart(3, '0')}`}));
    const insertIndex = Math.max(...selectedRowIndices) + 1;
    const newRows = [...rows]; newRows.splice(insertIndex, 0, ...rowsToDuplicate); pushHistory(newRows); setContextMenu(null);
  };

  if (isLoading) return <div className="panel border-thin flex-center" style={{ minHeight: '600px' }}><p className="blink text-accent-red">CONNEXION_BASE_DE_DONNÉES...</p></div>;

  return (
    // CORRECTION DU LAYOUT ICI (flex-direction: column)
    <div className="panel border-thin relative" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 2rem)', overflow: 'hidden', backgroundColor: 'var(--bg-secondary)' }}>
      
      <div className="flex-between mb-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}><Txt>Base de données cartes</Txt></h2>
          <button onClick={saveToDatabase} disabled={!hasChanges || isSaving} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, backgroundColor: hasChanges ? 'var(--accent-red)' : 'transparent', color: hasChanges ? 'var(--bg-primary)' : 'var(--text-secondary)', border: `1px solid ${hasChanges ? 'var(--accent-red)' : 'var(--border)'}`, transition: 'all 0.2s', cursor: hasChanges ? 'pointer' : 'default' }}>
            {isSaving ? '[ SYNCHRONISATION... ]' : hasChanges ? '[ ENREGISTRER MODIFICATIONS ]' : '[ À JOUR ]'}
          </button>
        </div>
        
        {viewMode === 'editor' && (
          <div className="animate-table-switch" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginRight: '1rem' }}>
              <button onClick={undo} disabled={historyIndex === 0} style={{ opacity: historyIndex === 0 ? 0.3 : 1, padding: '0 5px' }}>&lt; UNDO</button>
              <button onClick={redo} disabled={historyIndex === history.length - 1} style={{ opacity: historyIndex === history.length - 1 ? 0.3 : 1, padding: '0 5px' }}>REDO &gt;</button>
            </span>
            <button onClick={() => { setModalMode('add'); setColInsertIndex(null); setColForm({ name: '', type: 'text' }); setIsColModalOpen(true); }} className="btn-cancel" style={{ padding: '0.5rem 1rem' }}>+ COLONNE</button>
            <button onClick={() => pushHistory([...rows, { id: `#${String(rows.length + 1).padStart(3, '0')}`, qte: '1' }])} className="btn-confirm" style={{ padding: '0.5rem 1rem' }}>+ LIGNE</button>
          </div>
        )}
      </div>

      {viewMode === 'grid' && (
        <div className="dataset-grid animate-table-switch" style={{ flex: 1, overflowY: 'auto' }}>
          {datasets.map(ds => {
            const rowCount = ds.id === activeDatasetId ? rows.length : (dataStore[ds.id]?.rows?.length || 0);
            return (
              <div key={ds.id} className="dataset-card" onClick={() => openDataset(ds.id)} onContextMenu={(e) => handleDatasetContextMenu(e, ds.id)}>
                <h3><Txt>{ds.name}</Txt></h3>
                <p className="stats">{rowCount} <Txt>unités actives</Txt></p>
              </div>
            );
          })}
          <div className="dataset-card dataset-card-add" onClick={openAddDatasetModal}><h3 style={{ fontSize: '1rem' }}>+ <Txt>Init nouveau set</Txt></h3></div>
        </div>
      )}

      {viewMode === 'editor' && (
        <>
          <div className="dataset-tabs-container animate-table-switch">
            <button className="dataset-tab" style={{ color: 'var(--text-primary)', marginRight: '1rem', border: '1px solid var(--border)' }} onClick={goToGrid}>[ &lt; MOSAÏQUE ]</button>
            {datasets.map(ds => (
              <button key={ds.id} className={`dataset-tab ${activeDatasetId === ds.id ? 'active' : ''}`} style={{ color: activeDatasetId === ds.id ? 'var(--accent-red)' : 'var(--text-secondary)' }} onClick={() => openDataset(ds.id)} onContextMenu={(e) => handleDatasetContextMenu(e, ds.id)}>[ <Txt>{ds.name}</Txt> ]</button>
            ))}
            <button className="dataset-tab" style={{ color: 'var(--text-secondary)' }} onClick={openAddDatasetModal}>+ NOUVEAU</button>
          </div>

          <div key={activeDatasetId} className="animate-table-switch flex-1" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
            <div className={`border-thin table-container ${isDraggingSelection || isDraggingFill ? 'is-selecting' : ''}`} style={{ overflowX: 'auto', flex: 1, backgroundColor: 'var(--bg-primary)' }} onClick={(e) => e.stopPropagation()}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-primary)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: '#111' }}>
                    <th style={{ width: '30px', borderRight: '1px solid var(--border)' }}></th>
                    {columns.map(col => (
                      <th key={col.id} className={`data-cell ${draggedColId === col.id ? 'is-dragging' : ''}`} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', width: col.id === 'qte' ? '80px' : 'auto' }} draggable onDragStart={(e) => { setDraggedColId(col.id); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleColDrop(e, col.id)} onContextMenu={(e) => handleContextMenu(e, 'header', -1, col.id)}>
                        <div style={{ display: 'flex', alignItems: 'center' }}><span className="drag-grip" title="Réorganiser">||</span><span className="col-header-title" onClick={() => selectEntireColumn(col.id)}><Txt>{col.name}</Txt> <span style={{ fontSize: '0.5rem', opacity: 0.5 }}>[{col.type.toUpperCase()}]</span></span></div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => {
                    const isRowFullySelected = columns.every(c => selectedCells.includes(`${rowIndex}-${c.id}`));
                    return (
                      <tr key={rowIndex} className={draggedRowIndex === rowIndex ? 'row-is-dragging' : ''} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className={`row-grip-cell ${isRowFullySelected ? 'selected-grip' : ''}`} draggable onDragStart={(e) => { setDraggedRowIndex(rowIndex); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleRowDrop(e, rowIndex)} onClick={(e) => handleRowGripClick(e, rowIndex)} onContextMenu={(e) => handleContextMenu(e, 'row', rowIndex, null)}><span className="drag-grip" style={{ margin: 0 }}>||</span></td>
                        {columns.map(col => {
                          const cellKey = `${rowIndex}-${col.id}`; const isSelected = selectedCells.includes(cellKey); const isFillTarget = fillTargetCells.includes(cellKey); const isBottomRight = bottomRightCell === cellKey;
                          return (
                            <td key={col.id} className={`data-cell ${isSelected ? 'selected' : ''} ${isFillTarget ? 'fill-target' : ''}`} onMouseDown={(e) => handleCellMouseDown(e, rowIndex, col.id)} onMouseEnter={() => handleCellMouseEnter(rowIndex, col.id)} onContextMenu={(e) => handleContextMenu(e, 'cell', rowIndex, col.id)}>
                              <input type={col.type === 'number' ? 'number' : 'text'} value={row[col.id] || ''} onChange={(e) => { const newRows = [...rows]; newRows[rowIndex][col.id] = e.target.value; pushHistory(newRows); }} onFocus={(e) => e.target.select()} onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) e.preventDefault(); }} style={{ width: '100%', padding: '0.75rem', background: 'transparent', border: 'none', color: 'inherit', fontFamily: 'inherit', textAlign: col.id === 'qte' ? 'center' : 'left', pointerEvents: isDraggingSelection || isDraggingFill ? 'none' : 'auto' }} />
                              {isBottomRight && <div className="fill-handle" onMouseDown={(e) => { e.stopPropagation(); setIsDraggingFill(true); }} />}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MENUS ET MODALES */}
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {(contextMenu.type === 'cell' || contextMenu.type === 'row') && (
            <>
              <div className="context-menu-label">// PRESSE-PAPIER</div>
              <div className="context-menu-item" onClick={handleCopy}>[ COPIER ]</div>
              <div className="context-menu-item" onClick={handleMenuPaste}>[ COLLER ]</div>
              <div className="context-menu-divider" />
              <div className="context-menu-label">// LIGNE{isMultiRowSelected ? 'S' : ''}</div>
              <div className="context-menu-item" onClick={() => { const newRows = [...rows]; newRows.splice(contextMenu.rowIndex, 0, { id: `#${String(rows.length + 1).padStart(3, '0')}`, qte: '1' }); pushHistory(newRows); setContextMenu(null); }}>+ INSERER DESSUS</div>
              <div className="context-menu-item" onClick={() => { const newRows = [...rows]; newRows.splice(contextMenu.rowIndex + 1, 0, { id: `#${String(rows.length + 1).padStart(3, '0')}`, qte: '1' }); pushHistory(newRows); setContextMenu(null); }}>+ INSERER DESSOUS</div>
              <div className="context-menu-item" onClick={() => { if (isMultiRowSelected) duplicateSelectedRows(); else { const newRows = [...rows]; newRows.splice(contextMenu.rowIndex + 1, 0, { ...rows[contextMenu.rowIndex], id: `#${String(rows.length + 1).padStart(3, '0')}` }); pushHistory(newRows); setContextMenu(null); } }}>[ DUPLIQUER ]</div>
              <div className="context-menu-item" style={{ color: 'var(--accent-red)' }} onClick={() => { if (isMultiRowSelected) { pushHistory(rows.filter((_, i) => !selectedRowIndices.includes(i))); } else { pushHistory(rows.filter((_, i) => i !== contextMenu.rowIndex)); } setContextMenu(null); setSelectedCells([]); }}>[X] PURGER {isMultiRowSelected ? `LES LIGNES (${selectedRowIndices.length})` : 'LIGNE'}</div>
            </>
          )}
          {contextMenu.type === 'header' && (
            <>
              <div className="context-menu-label">// COLONNE</div>
              <div className="context-menu-item" onClick={() => { const idx = columns.findIndex(c => c.id === contextMenu.colId); setModalMode('add'); setColInsertIndex(idx); setColForm({ name: '', type: 'text' }); setIsColModalOpen(true); setContextMenu(null); }}>+ INSERER GAUCHE</div>
              <div className="context-menu-item" onClick={() => { const idx = columns.findIndex(c => c.id === contextMenu.colId); setModalMode('add'); setColInsertIndex(idx + 1); setColForm({ name: '', type: 'text' }); setIsColModalOpen(true); setContextMenu(null); }}>+ INSERER DROITE</div>
              {!columns.find(c => c.id === contextMenu.colId)?.isBase && (
                <>
                  <div className="context-menu-divider" />
                  <div className="context-menu-item" onClick={() => { const col = columns.find(c => c.id === contextMenu.colId)!; setModalMode('edit'); setActiveColId(col.id); setColForm({ name: col.name, type: col.type }); setIsColModalOpen(true); setContextMenu(null); }}>[ MODIFIER ]</div>
                  <div className="context-menu-item" style={{ color: 'var(--accent-red)' }} onClick={() => { if (contextMenu.colId) deleteColumn(contextMenu.colId); setContextMenu(null); }}>[X] SUPPRIMER</div>
                </>
              )}
            </>
          )}
          {contextMenu.type === 'dataset' && contextMenu.datasetId && (
            <>
              <div className="context-menu-label">// SET DE DONNÉES</div>
              <div className="context-menu-item" onClick={() => openEditDatasetModal(contextMenu.datasetId!)}>[ MODIFIER ]</div>
              <div className="context-menu-item" onClick={() => duplicateDataset(contextMenu.datasetId!)}>[ DUPLIQUER ]</div>
              <div className="context-menu-divider" />
              <div className="context-menu-item" style={{ color: 'var(--accent-red)' }} onClick={() => deleteDataset(contextMenu.datasetId!)}>[X] PURGER SET</div>
            </>
          )}
        </div>
      )}

      {isSetModalOpen && (
        <div className="modal-overlay flex-center">
          <div className="modal-content panel border-thin">
            <h3 className="modal-title"><Txt>{datasetModalMode === 'add' ? 'Initialiser nouveau set' : 'Recoder identifiant set'}</Txt></h3>
            <form onSubmit={saveDatasetDetails} style={{ marginTop: '1rem' }}>
              <input type="text" className="tech-input mb-4" placeholder="Nom du set" value={setFormName} onChange={(e) => setSetFormName(e.target.value)} autoFocus required />
              <div className="flex-between" style={{ gap: '1rem' }}><button type="button" className="btn-cancel" onClick={() => setIsSetModalOpen(false)}>[ ANNULER ]</button><button type="submit" className="btn-confirm">[ ENREGISTRER ]</button></div>
            </form>
          </div>
        </div>
      )}

      {isColModalOpen && (
        <div className="modal-overlay flex-center">
          <div className="modal-content panel border-thin">
            <h3 className="modal-title"><Txt>{modalMode === 'add' ? 'Initialiser propriété' : 'Modifier propriété'}</Txt></h3>
            <form onSubmit={saveColumn} style={{ marginTop: '1rem' }}>
              <input type="text" className="tech-input mb-4" placeholder="Nom de la colonne" value={colForm.name} onChange={(e) => setColForm({...colForm, name: e.target.value})} required />
              <select className="tech-input mb-4" value={colForm.type} onChange={(e) => setColForm({...colForm, type: e.target.value as ColumnType})}><option value="text">TEXTE</option><option value="number">NOMBRE</option><option value="image">IMAGE (URL)</option></select>
              <div className="flex-between" style={{ gap: '1rem' }}><button type="button" className="btn-cancel" onClick={() => setIsColModalOpen(false)}>[ ANNULER ]</button><button type="submit" className="btn-confirm">[ ENREGISTRER ]</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}