"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

// --- COMPOSANT D'HABILLAGE ---
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

// --- TYPES ---
type LayerType = 'text' | 'image' | 'shape';
type SourceType = 'static' | 'column';
type TextAlign = 'left' | 'center' | 'right';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';

interface TemplateLayer {
  id: string; name: string; type: LayerType; isVisible: boolean; isLocked: boolean;
  x: number; y: number; width: number; height: number;
  content: string; color: string;
  sourceType: SourceType;
  columnId: string;
  textAlign?: TextAlign;
  fontSize?: number;
  aspectLocked?: boolean;
  groupId?: string;
  rotation?: number;
}

interface Template {
  id: string; name: string; dataset_id: string; layers: TemplateLayer[]; db_id?: string;
  width?: number; height?: number;
}
interface Dataset { id: string; name: string; }
interface Column { id: string; name: string; type: string; }

export default function TemplateEditorTab() {
  const params = useParams();
  const projectSlug = params?.id as string;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'editor'>('grid');

  const [datasets, setDatasets] = useState<Dataset[]>([]); 
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateStore, setTemplateStore] = useState<Record<string, Template>>({});

  const [columnsByDataset, setColumnsByDataset] = useState<Record<string, Column[]>>({});
  const [allRowsByDataset, setAllRowsByDataset] = useState<Record<string, any[]>>({});
  const [previewRowIndex, setPreviewRowIndex] = useState<Record<string, number>>({});
  const [previewRows, setPreviewRows] = useState<Record<string, any>>({});

  const [layers, setLayers] = useState<TemplateLayer[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  
  // MULTI-SÉLECTION
  const [activeLayerIds, setActiveLayerIds] = useState<string[]>([]);
  const activeLayer = activeLayerIds.length === 1 ? layers.find(l => l.id === activeLayerIds[0]) : null;

  // PHYSIQUE & DRAG
  const [dragInfo, setDragInfo] = useState<{ initialMouseX: number; initialMouseY: number; layers: { id: string; startX: number; startY: number }[] } | null>(null);
  const [resizeInfo, setResizeInfo] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number; initialMouseX: number; initialMouseY: number; handle: ResizeHandle; aspectLocked: boolean } | null>(null);
  const [rotateInfo, setRotateInfo] = useState<{ id: string; centerX: number; centerY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggedLayerIdx, setDraggedLayerIdx] = useState<number | null>(null);
  const [dragOverLayerIdx, setDragOverLayerIdx] = useState<number | null>(null);

  const [history, setHistory] = useState<TemplateLayer[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [activeAssetTab, setActiveAssetTab] = useState<'upload' | 'icons'>('icons');
  const [searchQuery, setSearchQuery] = useState('skull');
  const [icons, setIcons] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [savedIcons, setSavedIcons] = useState<string[]>([]);

  const [isTplModalOpen, setIsTplModalOpen] = useState(false);
  const [tplModalMode, setTplModalMode] = useState<'add' | 'edit'>('add');
  const [tplFormName, setTplFormName] = useState('');
  const [activeTplToEdit, setActiveTplToEdit] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'template' | 'layer', id: string, subMenu?: 'copyTo' } | null>(null);

  // ==========================================
  // 1. CHARGEMENT & DB
  // ==========================================
  useEffect(() => {
    const loadData = async () => {
      if (!projectSlug) return;
      setIsLoading(true);

      const decodedSlug = decodeURIComponent(projectSlug);
      const { data, error: projectError } = await supabase
        .from('projects')
        .select('id, columns_schema, saved_assets')
        .eq('slug', decodedSlug)
        .limit(1);
        
      const projectData = data?.[0];

      if (projectError || !projectData) { 
        console.error("Erreur de chargement:", projectError);
        setIsLoading(false); 
        return; 
      }
      setProjectId(projectData.id);

      if (projectData.saved_assets && Array.isArray(projectData.saved_assets)) setSavedIcons(projectData.saved_assets);

      let loadedDatasets = [{ id: 'default', name: 'SET_PRINCIPAL' }];
      let loadedColumns: Record<string, Column[]> = {};

      if (projectData.columns_schema && !Array.isArray(projectData.columns_schema) && projectData.columns_schema.datasets) {
        loadedDatasets = projectData.columns_schema.datasets;
        loadedColumns = projectData.columns_schema.columnsByDataset || {};
      }
      setDatasets(loadedDatasets);
      setColumnsByDataset(loadedColumns);

      const { data: cardsData } = await supabase.from('cards').select('*').eq('project_id', projectData.id).order('row_order');
      const pRows: Record<string, any> = {};
      const allRows: Record<string, any[]> = {};
      if (cardsData) {
        cardsData.forEach(card => {
          const dsId = card.dataset_id || 'default';
          if (!allRows[dsId]) allRows[dsId] = [];
          allRows[dsId].push(card.data);
          if (!pRows[dsId]) pRows[dsId] = card.data;
        });
      }
      setAllRowsByDataset(allRows);
      setPreviewRows(pRows);

      const { data: templatesData } = await supabase.from('templates').select('*').eq('project_id', projectData.id);
      const initialStore: Record<string, Template> = {};
      let loadedTemplates: Template[] = [];

      if (templatesData && templatesData.length > 0) {
        loadedTemplates = templatesData.map(t => ({ 
          db_id: t.id, id: `tpl_${t.id}`, name: t.name, dataset_id: t.dataset_id || loadedDatasets[0].id,
          width: t.width || 300, height: t.height || 420,
          layers: (t.layers || []).map((l: any) => ({ ...l, sourceType: l.sourceType || 'static', columnId: l.columnId || '', textAlign: l.textAlign || 'center', aspectLocked: !!l.aspectLocked, groupId: l.groupId }))
        }));
      } else {
        const defaultTpl: Template = {
          id: 'tpl_default', name: 'Gabarit Base', dataset_id: loadedDatasets[0].id,
          layers: [
            { id: 'l1', name: 'Fond', type: 'shape', isVisible: true, isLocked: true, x: 0, y: 0, width: 300, height: 420, content: '', color: '#e0e0e0', sourceType: 'static', columnId: '', textAlign: 'center' },
            { id: 'l2', name: 'Titre', type: 'text', isVisible: true, isLocked: false, x: 20, y: 15, width: 260, height: 30, content: 'TITRE CARTE', color: '#111111', sourceType: 'static', columnId: '', textAlign: 'center' }
          ]
        };
        loadedTemplates = [defaultTpl];
      }

      loadedTemplates.forEach(t => initialStore[t.id] = t);
      setTemplates(loadedTemplates); setTemplateStore(initialStore);
      setActiveTemplateId(loadedTemplates[0].id); 
      setLayers(loadedTemplates[0].layers);
      setHistory([loadedTemplates[0].layers]);
      setIsLoading(false);
    };
    loadData();
  }, [projectSlug]);

  const saveToDatabase = async () => {
    if (!projectId || !activeTemplateId) return;
    setIsSaving(true);
    
    const updatedTemplates = templates.map(t => t.id === activeTemplateId ? { ...t, layers: layers } : t);
    setTemplates(updatedTemplates);

    const finalDataStore = { ...templateStore };
    finalDataStore[activeTemplateId] = { ...finalDataStore[activeTemplateId], layers: layers };
    setTemplateStore(finalDataStore);

    try {
      // 1. Sauvegarde du projet (assets)
      const { error: projErr } = await supabase.from('projects').update({ saved_assets: savedIcons }).eq('id', projectId);
      if (projErr) {
        console.error("Erreur Projet:", projErr);
        alert("Erreur sauvegarde projet : " + projErr.message);
      }

      // 2. Sauvegarde des gabarits
      for (const tpl of updatedTemplates) {
        if (tpl.db_id) {
          const { error: updErr } = await supabase.from('templates').update({ name: tpl.name, dataset_id: tpl.dataset_id, layers: tpl.layers, width: tpl.width || 300, height: tpl.height || 420 }).eq('id', tpl.db_id);
          if (updErr) {
            console.error("Erreur Update Gabarit:", updErr);
            alert("Erreur de mise à jour du gabarit : " + updErr.message);
          }
        } else {
          const { data, error: insErr } = await supabase.from('templates').insert({ project_id: projectId, name: tpl.name, dataset_id: tpl.dataset_id, layers: tpl.layers, width: tpl.width || 300, height: tpl.height || 420 }).select().single();
          if (insErr) {
            console.error("Erreur Insert Gabarit:", insErr);
            alert("Erreur de création du gabarit : " + insErr.message);
          }
          if (data) tpl.db_id = data.id;
        }
      }
      setHasChanges(false);
    } catch (e) {
      console.error("Erreur inattendue:", e);
      alert("Une erreur inattendue s'est produite.");
    } finally { 
      setIsSaving(false); 
    }
  };

  const pushHistory = (newLayers: TemplateLayer[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newLayers)));
    setHistory(newHistory); setHistoryIndex(newHistory.length - 1); 
    setLayers(newLayers); setHasChanges(true);
  };

  const undo = () => { if (historyIndex > 0) { setHistoryIndex(historyIndex - 1); setLayers(JSON.parse(JSON.stringify(history[historyIndex - 1]))); setHasChanges(true); setActiveLayerIds([]); } };
  const redo = () => { if (historyIndex < history.length - 1) { setHistoryIndex(historyIndex + 1); setLayers(JSON.parse(JSON.stringify(history[historyIndex + 1]))); setHasChanges(true); setActiveLayerIds([]); } };

  // ==========================================
  // 2. GESTION GABARITS
  // ==========================================
  const goToGrid = () => {
    if (activeTemplateId) {
      const currentTpl = templates.find(t => t.id === activeTemplateId);
      if (currentTpl) setTemplateStore(prev => ({ ...prev, [activeTemplateId]: { ...currentTpl, layers } }));
    }
    setViewMode('grid'); setActiveLayerIds([]);
  };

  const openTemplate = (newId: string) => {
    if (newId === activeTemplateId && viewMode === 'editor') return;
    if (activeTemplateId) {
      const currentTpl = templates.find(t => t.id === activeTemplateId);
      if (currentTpl) setTemplateStore(prev => ({ ...prev, [activeTemplateId]: { ...currentTpl, layers } }));
    }
    const nextData = templateStore[newId];
    if (nextData) { 
      setLayers(nextData.layers); setActiveTemplateId(newId); setActiveLayerIds([]); 
      setHistory([nextData.layers]); setHistoryIndex(0); setViewMode('editor'); 
    }
  };

  const saveSingleTemplate = async (tpl: Template): Promise<string | undefined> => {
    if (!projectId) return;
    if (tpl.db_id) {
      await supabase.from('templates').update({ name: tpl.name, dataset_id: tpl.dataset_id, layers: tpl.layers, width: tpl.width || 300, height: tpl.height || 420 }).eq('id', tpl.db_id);
      return tpl.db_id;
    } else {
      const { data } = await supabase.from('templates').insert({ project_id: projectId, name: tpl.name, dataset_id: tpl.dataset_id, layers: tpl.layers, width: tpl.width || 300, height: tpl.height || 420 }).select().single();
      return data?.id;
    }
  };

  const saveTemplateDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplFormName.trim()) return;
    if (tplModalMode === 'add') {
      const newId = 'tpl_' + Math.random().toString(36).substring(2, 9);
      const newTpl: Template = { id: newId, name: tplFormName, dataset_id: datasets[0]?.id || 'default', layers: [], width: 300, height: 420 };
      const dbId = await saveSingleTemplate(newTpl);
      if (dbId) newTpl.db_id = dbId;
      setTemplates(prev => {
        const updated = prev.map(t => t.id === activeTemplateId ? { ...t, layers } : t);
        return [...updated, newTpl];
      });
      setTemplateStore(prev => {
        const store = { ...prev, [newId]: newTpl };
        if (activeTemplateId) { const currentTpl = templates.find(t => t.id === activeTemplateId); if (currentTpl) store[activeTemplateId] = { ...currentTpl, layers }; }
        return store;
      });
      setLayers([]); setActiveTemplateId(newId); setHistory([[]]); setHistoryIndex(0); setViewMode('editor');
    }
    else if (tplModalMode === 'edit' && activeTplToEdit) {
      const tpl = templates.find(t => t.id === activeTplToEdit);
      if (tpl) await saveSingleTemplate({ ...tpl, name: tplFormName });
      setTemplates(templates.map(t => t.id === activeTplToEdit ? { ...t, name: tplFormName } : t));
      setTemplateStore(prev => ({ ...prev, [activeTplToEdit]: { ...prev[activeTplToEdit], name: tplFormName } }));
    }
    setIsTplModalOpen(false);
  };

  const duplicateTemplate = async (targetId: string) => {
    const original = templates.find(t => t.id === targetId);
    if (!original) return;
    setContextMenu(null);
    const newId = `tpl_${Date.now()}`;
    const clonedLayers = JSON.parse(JSON.stringify(original.layers)).map((l: TemplateLayer) => ({ ...l, id: 'l_' + Date.now() + Math.random() }));
    const newTpl: Template = { ...original, id: newId, name: `${original.name} Copie`, db_id: undefined, layers: clonedLayers };
    const dbId = await saveSingleTemplate(newTpl);
    if (dbId) newTpl.db_id = dbId;
    setTemplates(prev => [...prev, newTpl]);
    setTemplateStore(prev => ({ ...prev, [newId]: newTpl }));
    setHasChanges(true);
    // Ouvrir directement le renommage
    setActiveTplToEdit(newId);
    setTplFormName(newTpl.name);
    setTplModalMode('edit');
    setIsTplModalOpen(true);
  };

  const deleteTemplate = (targetId: string) => {
    if (templates.length <= 1) { alert("Impossible de supprimer le dernier gabarit."); setContextMenu(null); return; }
    const tplToDelete = templates.find(t => t.id === targetId);
    if (tplToDelete?.db_id) supabase.from('templates').delete().eq('id', tplToDelete.db_id).then();
    const newTemplates = templates.filter(t => t.id !== targetId); setTemplates(newTemplates);
    const newStore = { ...templateStore }; delete newStore[targetId]; setTemplateStore(newStore);
    if (activeTemplateId === targetId) { 
      setActiveTemplateId(newTemplates[0].id); setLayers(newStore[newTemplates[0].id]?.layers || []); 
      setHistory([newStore[newTemplates[0].id]?.layers || []]); setHistoryIndex(0);
    }
    setHasChanges(true); setContextMenu(null);
  };

  const linkDataset = (datasetId: string) => {
    if (!activeTemplateId) return;
    const updated = templates.map(t => t.id === activeTemplateId ? { ...t, dataset_id: datasetId } : t);
    setTemplates(updated);
    const tpl = updated.find(t => t.id === activeTemplateId);
    if (tpl) saveSingleTemplate({ ...tpl, layers });
    setHasChanges(true);
  };

  // ==========================================
  // 3. ACTIONS CALQUES
  // ==========================================
  const updateLayer = (id: string, updates: Partial<TemplateLayer>, recordHistory = true) => { 
    const targetLayer = layers.find(l => l.id === id);
    if (!targetLayer) return;

    if (targetLayer.aspectLocked && (updates.width !== undefined || updates.height !== undefined)) {
      const ratio = targetLayer.width / targetLayer.height;
      if (updates.width !== undefined && updates.height === undefined) updates.height = Math.round(updates.width / ratio);
      else if (updates.height !== undefined && updates.width === undefined) updates.width = Math.round(updates.height * ratio);
    }

    const newLayers = layers.map(l => l.id === id ? { ...l, ...updates } : l);
    setLayers(newLayers);
    if (recordHistory) pushHistory(newLayers);
    else setHasChanges(true);
  };
  
  const addLayer = (type: LayerType) => {
    const isShape = type === 'shape';
    const newLayer: TemplateLayer = { 
      id: 'l_' + Date.now(), name: `Nouveau ${type}`, type, 
      isVisible: true, isLocked: false, x: 20, y: 20, 
      width: isShape ? 100 : 260, height: isShape ? 100 : 30, 
      content: type === 'text' ? 'TEXTE' : '', 
      color: isShape ? '#cccccc' : '#000000', 
      sourceType: 'static', columnId: '', textAlign: 'center' 
    };
    pushHistory([newLayer, ...layers]); 
    setActiveLayerIds([newLayer.id]);
  };

  const duplicateLayer = (id: string) => {
    const original = layers.find(l => l.id === id);
    if (!original) return;
    const newLayer = { ...original, id: 'l_' + Date.now(), x: original.x + 10, y: original.y + 10, name: `${original.name} Copie`, groupId: undefined };
    pushHistory([newLayer, ...layers]);
    setActiveLayerIds([newLayer.id]);
    setContextMenu(null);
  };

  const deleteLayer = (id: string) => {
    pushHistory(layers.filter(l => l.id !== id));
    setActiveLayerIds(prev => prev.filter(i => i !== id));
    setContextMenu(null);
  };

  const moveLayerToFront = (id: string) => {
    const newLayers = [...layers];
    const idx = newLayers.findIndex(l => l.id === id);
    if (idx <= 0) return;
    const [item] = newLayers.splice(idx, 1);
    newLayers.unshift(item); 
    pushHistory(newLayers);
    setContextMenu(null);
  };

  const moveLayerToBack = (id: string) => {
    const newLayers = [...layers];
    const idx = newLayers.findIndex(l => l.id === id);
    if (idx >= newLayers.length - 1) return;
    const [item] = newLayers.splice(idx, 1);
    newLayers.push(item);
    pushHistory(newLayers);
    setContextMenu(null);
  };

  const copyLayerTo = (layerId: string, targetTemplateId: string) => {
    const layerToCopy = layers.find(l => l.id === layerId);
    if (!layerToCopy) return;
    const targetTpl = templateStore[targetTemplateId];
    if (!targetTpl) return;
    const copiedLayer = { ...layerToCopy, id: 'l_' + Date.now() + Math.random().toString(36).substring(2, 7), groupId: undefined };
    const updatedTpl = { ...targetTpl, layers: [copiedLayer, ...(targetTpl.layers || [])] };
    setTemplateStore(prev => ({ ...prev, [targetTemplateId]: updatedTpl }));
    setTemplates(prev => prev.map(t => t.id === targetTemplateId ? updatedTpl : t));
    setHasChanges(true);
    setContextMenu(null);
  };

  const copyLayerToAll = (layerId: string) => {
    const layerToCopy = layers.find(l => l.id === layerId);
    if (!layerToCopy) return;
    const others = templates.filter(t => t.id !== activeTemplateId);
    if (others.length === 0) return;
    const newStore = { ...templateStore };
    others.forEach((tpl, i) => {
      const targetTpl = newStore[tpl.id];
      if (!targetTpl) return;
      const copiedLayer = { ...layerToCopy, id: `l_${Date.now()}_${i}`, groupId: undefined };
      newStore[tpl.id] = { ...targetTpl, layers: [copiedLayer, ...(targetTpl.layers || [])] };
    });
    setTemplateStore(newStore);
    setTemplates(prev => prev.map(t => newStore[t.id] ?? t));
    setHasChanges(true);
    setContextMenu(null);
  };

  const handleGroup = () => {
    const gId = 'g_' + Date.now();
    pushHistory(layers.map(l => activeLayerIds.includes(l.id) ? { ...l, groupId: gId } : l));
  };
  
  const handleUngroup = () => {
    const targetGroupId = layers.find(l => activeLayerIds.includes(l.id))?.groupId;
    if (targetGroupId) pushHistory(layers.map(l => l.groupId === targetGroupId ? { ...l, groupId: undefined } : l));
  };

  // ==========================================
  // PHYSIQUE & DRAG SOURIS
  // ==========================================
  const handleLayerDragStart = (e: React.DragEvent, index: number) => { setDraggedLayerIdx(index); e.dataTransfer.effectAllowed = "move"; };
  const handleLayerDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); setDragOverLayerIdx(index); };
  const handleLayerDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (draggedLayerIdx === null || draggedLayerIdx === targetIdx) return;
    const newLayers = [...layers];
    const [removed] = newLayers.splice(draggedLayerIdx, 1);
    newLayers.splice(targetIdx, 0, removed);
    pushHistory(newLayers);
    setDraggedLayerIdx(null); setDragOverLayerIdx(null);
  };

  const handleDropOnCanvas = (e: React.DragEvent) => {
    e.preventDefault();
    const iconName = e.dataTransfer.getData('iconName');
    if (iconName) {
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = Math.round(e.clientX - rect.left - 25);
      const dropY = Math.round(e.clientY - rect.top - 25);
      const newLayer: TemplateLayer = { 
        id: 'l_' + Date.now(), name: `Icône ${iconName.split(':')[1] || iconName}`, type: 'image', 
        isVisible: true, isLocked: false, x: dropX, y: dropY, width: 50, height: 50, 
        content: iconName, color: '#000000', sourceType: 'static', columnId: '', aspectLocked: true 
      };
      pushHistory([newLayer, ...layers]); 
      setActiveLayerIds([newLayer.id]);
    }
  };

  const handleLayerClickSelection = (e: React.MouseEvent, layer: TemplateLayer) => {
    e.stopPropagation();
    let newSelection = [...activeLayerIds];
    if (e.shiftKey) {
      if (newSelection.includes(layer.id)) newSelection = newSelection.filter(id => id !== layer.id);
      else newSelection.push(layer.id);
    } else {
      if (!newSelection.includes(layer.id)) {
        if (layer.groupId) newSelection = layers.filter(l => l.groupId === layer.groupId).map(l => l.id);
        else newSelection = [layer.id];
      }
    }
    setActiveLayerIds(newSelection);
    return newSelection;
  };

  const handleMouseDownOnLayer = (e: React.MouseEvent, layer: TemplateLayer) => {
    if (layer.isLocked || e.button !== 0) return;
    const finalSelection = handleLayerClickSelection(e, layer);
    const draggedLayers = layers.filter(l => finalSelection.includes(l.id)).map(l => ({ id: l.id, startX: l.x, startY: l.y }));
    setDragInfo({ initialMouseX: e.clientX, initialMouseY: e.clientY, layers: draggedLayers });
  };

  const handleMouseDownOnHandle = (e: React.MouseEvent, layer: TemplateLayer, handle: ResizeHandle) => {
    e.stopPropagation();
    setResizeInfo({
      id: layer.id, startX: layer.x, startY: layer.y, startW: layer.width, startH: layer.height,
      initialMouseX: e.clientX, initialMouseY: e.clientY, handle, aspectLocked: !!layer.aspectLocked
    });
  };

  const handleMouseDownOnRotateHandle = (e: React.MouseEvent, layer: TemplateLayer) => {
    e.stopPropagation();
    e.preventDefault();
    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;
    setRotateInfo({ id: layer.id, centerX, centerY });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (rotateInfo) {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const dx = mouseX - rotateInfo.centerX;
      const dy = mouseY - rotateInfo.centerY;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      if (e.shiftKey) angle = Math.round(angle / 15) * 15;
      updateLayer(rotateInfo.id, { rotation: Math.round(angle) }, false);
      return;
    }

    if (dragInfo) {
      const dx = e.clientX - dragInfo.initialMouseX;
      const dy = e.clientY - dragInfo.initialMouseY;
      const tplW = currentTemplate?.width || 300;
      const tplH = currentTemplate?.height || 420;

      const newLayers = [...layers];
      dragInfo.layers.forEach(dragged => {
        const idx = newLayers.findIndex(l => l.id === dragged.id);
        if (idx > -1) {
          let nx = dragged.startX + dx;
          let ny = dragged.startY + dy;

          if (snapEnabled) {
            // Grille de 10px
            nx = Math.round(nx / 10) * 10;
            ny = Math.round(ny / 10) * 10;
            const cw = newLayers[idx].width; const ch = newLayers[idx].height;
            // Magnétisme Centre
            if (Math.abs(nx - (tplW / 2 - cw / 2)) < 15) nx = tplW / 2 - cw / 2;
            if (Math.abs(ny - (tplH / 2 - ch / 2)) < 15) ny = tplH / 2 - ch / 2;
            // Magnétisme Bords
            if (Math.abs(nx) < 10) nx = 0;
            if (Math.abs(nx + cw - tplW) < 10) nx = tplW - cw;
            if (Math.abs(ny) < 10) ny = 0;
            if (Math.abs(ny + ch - tplH) < 10) ny = tplH - ch;
          }
          newLayers[idx] = { ...newLayers[idx], x: nx, y: ny };
        }
      });
      setLayers(newLayers);
      return;
    }

    if (resizeInfo) {
      const dx = e.clientX - resizeInfo.initialMouseX;
      const dy = e.clientY - resizeInfo.initialMouseY;
      
      let newX = resizeInfo.startX; let newY = resizeInfo.startY;
      let newW = resizeInfo.startW; let newH = resizeInfo.startH;

      if (resizeInfo.handle.includes('e')) newW += dx;
      if (resizeInfo.handle.includes('w')) { newX += dx; newW -= dx; }
      if (resizeInfo.handle.includes('s')) newH += dy;
      if (resizeInfo.handle.includes('n')) { newY += dy; newH -= dy; }

      if (e.shiftKey || resizeInfo.aspectLocked) {
        const ratio = resizeInfo.startW / resizeInfo.startH;
        if (resizeInfo.handle === 'e' || resizeInfo.handle === 'w') {
          newH = Math.round(newW / ratio);
          if (resizeInfo.handle.includes('n')) newY = resizeInfo.startY + (resizeInfo.startH - newH);
        } else if (resizeInfo.handle === 'n' || resizeInfo.handle === 's') {
          newW = Math.round(newH * ratio);
          if (resizeInfo.handle.includes('w')) newX = resizeInfo.startX + (resizeInfo.startW - newW);
        } else {
          newH = Math.round(newW / ratio);
          if (resizeInfo.handle.includes('n')) newY = resizeInfo.startY + (resizeInfo.startH - newH);
        }
      }

      if (newW < 10) { newX = resizeInfo.startX + resizeInfo.startW - 10; newW = 10; }
      if (newH < 10) { newY = resizeInfo.startY + resizeInfo.startH - 10; newH = 10; }

      updateLayer(resizeInfo.id, { x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) }, false);
    }
  };

  const handleCanvasMouseUp = () => {
    if (dragInfo || resizeInfo || rotateInfo) {
      pushHistory(layers);
      setDragInfo(null); setResizeInfo(null); setRotateInfo(null);
    }
  };

  const toggleSaveIcon = (iconName: string) => {
    if (savedIcons.includes(iconName)) setSavedIcons(savedIcons.filter(id => id !== iconName));
    else setSavedIcons([...savedIcons, iconName]);
    setHasChanges(true);
  };

  const searchIcons = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://api.iconify.design/search?query=${searchQuery}&limit=60`);
      const data = await res.json();
      if (data && data.icons) setIcons(data.icons); else setIcons([]);
    } catch (err) { console.error(err); }
    setIsSearching(false);
  };

  useEffect(() => { 
    const handleGlobalClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'editor') return; 
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeLayerIds.length > 0 && !dragInfo && !resizeInfo) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          pushHistory(layers.filter(l => !activeLayerIds.includes(l.id)));
          setActiveLayerIds([]);
        }
      }
    };
    window.addEventListener('click', handleGlobalClick); 
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('click', handleGlobalClick); window.removeEventListener('keydown', handleKeyDown); }; 
  }, [viewMode, history, historyIndex, activeLayerIds, dragInfo, resizeInfo]);

  if (isLoading) return <div className="panel border-thin flex-center" style={{ minHeight: '600px' }}><p className="blink text-accent-red">CHARGEMENT_GABARITS...</p></div>;

  const currentTemplate = templates.find(t => t.id === activeTemplateId);
  const activeDatasetCols = columnsByDataset[currentTemplate?.dataset_id || 'default'] || [];
  const activeDatasetId = currentTemplate?.dataset_id || 'default';
  const allCardsForDataset = allRowsByDataset[activeDatasetId] || [];
  const currentCardIndex = previewRowIndex[activeDatasetId] ?? 0;
  const previewData = allCardsForDataset.length > 0 ? allCardsForDataset[currentCardIndex] : previewRows[activeDatasetId];

  const navigateCard = (dir: 1 | -1) => {
    const count = allCardsForDataset.length;
    if (count === 0) return;
    const next = (currentCardIndex + dir + count) % count;
    setPreviewRowIndex(prev => ({ ...prev, [activeDatasetId]: next }));
  };

  const renderResizeHandles = (layer: TemplateLayer) => {
    if (activeLayerIds.length !== 1 || activeLayerIds[0] !== layer.id || layer.isLocked) return null;
    const hStyle: React.CSSProperties = { position: 'absolute', width: '8px', height: '8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--accent-red)', zIndex: 10 };
    return (
      <>
        {/* Handle de rotation */}
        <div
          onMouseDown={(e) => handleMouseDownOnRotateHandle(e, layer)}
          title="Pivoter (Shift = 15°)"
          style={{ position: 'absolute', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--bg-primary)', border: '2px solid var(--accent-red)', top: -28, left: 'calc(50% - 6px)', cursor: 'grab', zIndex: 10 }}
        />
        {/* Ligne du handle de rotation */}
        <div style={{ position: 'absolute', width: '1px', height: '18px', backgroundColor: 'var(--accent-red)', top: -18, left: 'calc(50% - 0.5px)', pointerEvents: 'none', zIndex: 9, opacity: 0.5 }} />
        <div onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'nw')} style={{ ...hStyle, top: -4, left: -4, cursor: 'nwse-resize' }} />
        <div onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'ne')} style={{ ...hStyle, top: -4, right: -4, cursor: 'nesw-resize' }} />
        <div onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'sw')} style={{ ...hStyle, bottom: -4, left: -4, cursor: 'nesw-resize' }} />
        <div onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'se')} style={{ ...hStyle, bottom: -4, right: -4, cursor: 'nwse-resize' }} />
        <div onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'n')} style={{ ...hStyle, top: -4, left: 'calc(50% - 4px)', cursor: 'ns-resize' }} />
        <div onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 's')} style={{ ...hStyle, bottom: -4, left: 'calc(50% - 4px)', cursor: 'ns-resize' }} />
        <div onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'w')} style={{ ...hStyle, left: -4, top: 'calc(50% - 4px)', cursor: 'ew-resize' }} />
        <div onMouseDown={(e) => handleMouseDownOnHandle(e, layer, 'e')} style={{ ...hStyle, right: -4, top: 'calc(50% - 4px)', cursor: 'ew-resize' }} />
      </>
    );
  };

  return (
    <div className="panel border-thin relative" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 2rem)', backgroundColor: 'var(--bg-secondary)', overflow: 'hidden' }}>
      
      {/* COUCHE DE PROTECTION INVISIBLE (DRAG/RESIZE/ROTATE CALQUES) */}
      {(dragInfo || resizeInfo || rotateInfo) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: dragInfo ? 'grabbing' : rotateInfo ? 'crosshair' : 'crosshair' }} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} />
      )}

      {/* HEADER FIXE */}
      <div className="flex-between mb-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}><Txt>Gestion des gabarits</Txt></h2>
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
          </div>
        )}
      </div>

      {/* VUE MOSAÏQUE (GRILLE) */}
      {viewMode === 'grid' && (
        <div className="dataset-grid animate-table-switch" style={{ flex: 1, overflowY: 'auto' }}>
          {templates.map(tpl => {
            const layerCount = tpl.id === activeTemplateId ? layers.length : (templateStore[tpl.id]?.layers?.length || 0);
            const linkedDataset = datasets.find(d => d.id === tpl.dataset_id)?.name || 'Aucun';
            return (
              <div key={tpl.id} className="dataset-card" onClick={() => openTemplate(tpl.id)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'template', id: tpl.id }); }}>
                <h3><Txt>{tpl.name}</Txt></h3>
                <p className="stats">{layerCount} <Txt>Calques</Txt> | <span style={{color: 'var(--text-primary)'}}><Txt>{linkedDataset}</Txt></span></p>
              </div>
            );
          })}
          <div className="dataset-card dataset-card-add" onClick={() => { setTplFormName(`Gabarit ${templates.length + 1}`); setTplModalMode('add'); setIsTplModalOpen(true); }}>
            <h3 style={{ fontSize: '1rem' }}>+ <Txt>Nouveau gabarit</Txt></h3>
          </div>
        </div>
      )}

      {/* VUE ÉDITEUR */}
      {viewMode === 'editor' && (
        <>
          {/* ONGLETS GABARITS */}
          <div className="dataset-tabs-container animate-table-switch" onWheel={(e) => { e.preventDefault(); e.currentTarget.scrollLeft += e.deltaY; }}>
            <button className="dataset-tab" style={{ color: 'var(--text-primary)', marginRight: '1rem', border: '1px solid var(--border)' }} onClick={goToGrid}>[ &lt; MOSAÏQUE ]</button>
            {templates.map(tpl => (
              <button key={tpl.id} className={`dataset-tab ${activeTemplateId === tpl.id ? 'active' : ''}`} style={{ color: activeTemplateId === tpl.id ? 'var(--accent-red)' : 'var(--text-secondary)' }} onClick={() => openTemplate(tpl.id)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'template', id: tpl.id }); }}>
                [ <Txt>{tpl.name}</Txt> ]
              </button>
            ))}
            <button className="dataset-tab" style={{ color: 'var(--text-secondary)' }} onClick={() => { setTplFormName(`Gabarit ${templates.length + 1}`); setTplModalMode('add'); setIsTplModalOpen(true); }}>+ NOUVEAU</button>
          </div>

          {/* MAIN WRAPPER POUR L'ESPACE DE TRAVAIL */}
          <div className="animate-table-switch" style={{ display: 'flex', flex: 1, position: 'relative', width: '100%', overflow: 'hidden' }}>
            
            {/* CONTAINER DYNAMIQUE (Se compresse via padding-right quand le Store s'ouvre) */}
            <div style={{ display: 'flex', flex: 1, width: '100%', gap: '1.5rem', paddingRight: isStoreOpen ? '370px' : '40px', transition: 'padding-right 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>

              {/* --- CANVAS (PREND TOUT L'ESPACE DISPONIBLE) --- */}
              <div className="panel border-thin" style={{ flex: 1, backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
                
                <div className="flex-between mb-4" style={{ padding: '0 0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h3 style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}><Txt>Source</Txt> :</h3>
                    <select className="tech-input" style={{ width: 'auto', padding: '0.3rem', fontSize: '0.8rem' }} value={currentTemplate?.dataset_id || ''} onChange={(e) => linkDataset(e.target.value)}>
                      {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h3 style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}><Txt>Format</Txt> :</h3>
                    <select className="tech-input" style={{ width: 'auto', padding: '0.3rem', fontSize: '0.8rem' }} value={`${currentTemplate?.width || 300}x${currentTemplate?.height || 420}`} onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      setTemplates(templates.map(t => t.id === activeTemplateId ? { ...t, width: w, height: h } : t));
                      setHasChanges(true);
                    }}>
                      <option value="300x420">Standard (300x420)</option>
                      <option value="350x500">Poker (350x500)</option>
                      <option value="250x250">Carré (250x250)</option>
                      <option value="420x300">Paysage (420x300)</option>
                    </select>

                    <button onClick={() => setSnapEnabled(!snapEnabled)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', border: '1px solid var(--border)', background: snapEnabled ? 'var(--accent-red)' : 'transparent', color: snapEnabled ? '#fff' : 'var(--text-secondary)' }}>
                      {snapEnabled ? '[ MAGNÉTISME ON ]' : '[ MAGNÉTISME OFF ]'}
                    </button>
                  </div>
                </div>
                
                <div onClick={() => setActiveLayerIds([])} style={{ 
                  flex: 1, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  backgroundColor: 'var(--bg-secondary)', overflow: 'hidden', position: 'relative', 
                  backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)', backgroundSize: '20px 20px', backgroundPosition: 'center'
                }}>
                  <div
                    ref={canvasRef}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDropOnCanvas}
                    style={{ width: `${currentTemplate?.width || 300}px`, height: `${currentTemplate?.height || 420}px`, backgroundColor: '#fff', boxShadow: '0 20px 50px rgba(0,0,0,0.8)', position: 'relative', overflow: 'hidden' }}
                  >
                    
                    {[...layers].reverse().map((layer, index) => {
                      if (!layer.isVisible) return null;
                      const isSelected = activeLayerIds.includes(layer.id);
                      const isDraggingThis = dragInfo?.layers.find(l => l.id === layer.id);

                      let displayContent = layer.content;
                      if (layer.sourceType === 'column' && layer.columnId) {
                        displayContent = previewData && previewData[layer.columnId] !== undefined && previewData[layer.columnId] !== null ? previewData[layer.columnId] : '';
                      }

                      const justifyContent = layer.textAlign === 'right' ? 'flex-end' : layer.textAlign === 'center' ? 'center' : 'flex-start';

                      return (
                        <div 
                          key={layer.id} 
                          onMouseDown={(e) => handleMouseDownOnLayer(e, layer)}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setActiveLayerIds([layer.id]); setContextMenu({ x: e.clientX, y: e.clientY, type: 'layer', id: layer.id }); }}
                          style={{
                            position: 'absolute', left: layer.x, top: layer.y, width: layer.width, height: layer.height,
                            backgroundColor: layer.type === 'shape' ? layer.color : 'transparent', color: layer.color,
                            outline: isSelected && !isDraggingThis ? '2px solid var(--accent-red)' : 'none',
                            cursor: layer.isLocked ? 'default' : isDraggingThis ? 'grabbing' : 'grab', display: 'flex', alignItems: 'center',
                            justifyContent: layer.type === 'text' ? justifyContent : 'center', textAlign: layer.textAlign || 'left',
                            fontFamily: 'monospace', fontWeight: 'bold', fontSize: `${layer.fontSize || 16}px`, zIndex: layers.length - index,
                            wordBreak: 'break-word', padding: layer.type === 'text' ? '0 4px' : '0',
                            transform: `rotate(${layer.rotation || 0}deg)`, transformOrigin: 'center center',
                          }}
                        >
                          {renderResizeHandles(layer)}
                          {layer.type === 'text' && <span style={{ pointerEvents: 'none' }}>{displayContent}</span>}
                          {layer.type === 'image' && displayContent && (
                            <img src={`https://api.iconify.design/${displayContent}.svg?color=${encodeURIComponent(layer.color)}`} alt="icon" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} draggable="false" />
                          )}
                        </div>
                      );
                    })}
                    <div style={{ position: 'absolute', inset: '15px', border: '1px dashed rgba(255,0,0,0.3)', pointerEvents: 'none', zIndex: 1000 }} />
                  </div>
                </div>

                {/* Défileur de cartes */}
                {allCardsForDataset.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '0.5rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', flexShrink: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); navigateCard(-1); }} style={{ padding: '0.2rem 0.7rem', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1rem' }}>‹</button>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      CARTE {currentCardIndex + 1} / {allCardsForDataset.length}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); navigateCard(1); }} style={{ padding: '0.2rem 0.7rem', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1rem' }}>›</button>
                  </div>
                )}
              </div>

              {/* --- PANNEAU INSPECTEUR & CALQUES (LARGEUR FIXE 320px) --- */}
              <div className="panel border-thin" style={{ width: '320px', minWidth: '320px', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', padding: 0 }}>
                
                {/* Haut : Calques */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '40%', borderBottom: '2px solid var(--border)' }}>
                  <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}><Txt>Pile de calques</Txt></h3>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => addLayer('text')} className="btn-cancel" style={{ flex: 1, padding: '0.2rem', fontSize: '0.7rem' }}>+ TEXTE</button>
                        <button onClick={() => addLayer('shape')} className="btn-cancel" style={{ flex: 1, padding: '0.2rem', fontSize: '0.7rem' }}>+ FORME</button>
                      </div>
                    </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                    {layers.map((layer, index) => {
                      const isSelected = activeLayerIds.includes(layer.id);
                      return (
                        <div 
                          key={layer.id} 
                          draggable 
                          onDragStart={(e) => handleLayerDragStart(e, index)}
                          onDragOver={(e) => handleLayerDragOver(e, index)}
                          onDrop={(e) => handleLayerDrop(e, index)}
                          onClick={(e) => handleLayerClickSelection(e, layer)} 
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setActiveLayerIds([layer.id]); setContextMenu({ x: e.clientX, y: e.clientY, type: 'layer', id: layer.id }); }}
                          style={{ 
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', marginBottom: '0.25rem', cursor: 'grab', 
                            backgroundColor: isSelected ? 'color-mix(in srgb, var(--accent-red) 10%, transparent)' : 'transparent', 
                            border: `1px solid ${isSelected ? 'var(--accent-red)' : 'transparent'}`, 
                            boxShadow: dragOverLayerIdx === index && draggedLayerIdx !== null ? 'inset 0 2px 0 0 var(--accent-red)' : 'none', 
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' 
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ cursor: 'grab', opacity: 0.3 }}>≡</span>
                            <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{layer.type === 'text' ? '[T]' : layer.type === 'image' ? '[I]' : '[S]'}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? 700 : 400 }}><Txt>{layer.name}</Txt></span>
                            {layer.groupId && <span style={{ fontSize: '0.6rem', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0 2px' }}>G</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { isLocked: !layer.isLocked }); }} style={{ color: layer.isLocked ? 'var(--accent-red)' : 'inherit', opacity: layer.isLocked ? 1 : 0.5 }}>{layer.isLocked ? 'X' : 'O'}</button>
                            <button onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { isVisible: !layer.isVisible }); }} style={{ opacity: layer.isVisible ? 1 : 0.3 }}>V</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Bas : Inspecteur */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: 'var(--bg-secondary)', padding: '1rem', overflowY: 'auto' }}>
                  
                  {activeLayerIds.length > 1 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}><Txt>Sélection Multiple</Txt> ({activeLayerIds.length})</h3>
                      <button onClick={handleGroup} className="btn-confirm" style={{ padding: '0.5rem' }}>[ GROUPER SÉLECTION ]</button>
                      <button onClick={handleUngroup} className="btn-cancel" style={{ padding: '0.5rem' }}>[ DÉGROUPER ]</button>
                    </div>
                  ) : activeLayer ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                      <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '0.9rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}><Txt>Inspecteur</Txt> : {activeLayer.name}</h3>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}><Txt>Couleur</Txt></label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', padding: '0.3rem' }}>
                            <input type="color" value={activeLayer.color} onChange={(e) => updateLayer(activeLayer.id, { color: e.target.value })} style={{ width: '30px', height: '30px', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }} />
                            <input type="text" value={activeLayer.color} onChange={(e) => updateLayer(activeLayer.id, { color: e.target.value })} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', width: '100%', outline: 'none', textTransform: 'uppercase', fontSize: '0.9rem', fontFamily: 'monospace' }} />
                          </div>
                        </div>
                      </div>

                      {/* IMAGE SELECTION */}
                      {activeLayer.type === 'image' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '0.8rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}><Txt>Source des données</Txt></label>

                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => updateLayer(activeLayer.id, { sourceType: 'static' })} style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: activeLayer.sourceType === 'static' ? 'var(--accent-red)' : 'var(--bg-secondary)', color: activeLayer.sourceType === 'static' ? '#fff' : 'var(--text-primary)' }}>STATIQUE</button>
                            <button onClick={() => updateLayer(activeLayer.id, { sourceType: 'column' })} style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: activeLayer.sourceType === 'column' ? 'var(--accent-red)' : 'var(--bg-secondary)', color: activeLayer.sourceType === 'column' ? '#fff' : 'var(--text-primary)' }}>BDD</button>
                          </div>

                          {activeLayer.sourceType === 'column' ? (
                            <select className="tech-input" style={{ width: '100%', fontSize: '0.9rem' }} value={activeLayer.columnId || ''} onChange={(e) => updateLayer(activeLayer.id, { columnId: e.target.value })}>
                              <option value="">-- Choisir une colonne --</option>
                              {activeDatasetCols.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}><Txt>Icône</Txt></label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                <div style={{ width: '48px', height: '48px', background: '#fff', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {activeLayer.content ? (
                                    <img src={`https://api.iconify.design/${activeLayer.content}.svg?color=${encodeURIComponent(activeLayer.color)}`} alt="preview" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
                                  ) : (
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>?</span>
                                  )}
                                </div>
                                <input type="text" className="tech-input" style={{ flex: 1, fontSize: '0.8rem' }} value={activeLayer.content} onChange={(e) => updateLayer(activeLayer.id, { content: e.target.value })} placeholder="mdi:skull" />
                              </div>

                              {savedIcons.length > 0 && (
                                <>
                                  <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}><Txt>Favoris</Txt></label>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.3rem', maxHeight: '110px', overflowY: 'auto' }}>
                                    {savedIcons.map(iconName => (
                                      <div
                                        key={iconName}
                                        onClick={() => updateLayer(activeLayer.id, { content: iconName })}
                                        style={{ aspectRatio: '1/1', background: '#fff', border: `2px solid ${activeLayer.content === iconName ? 'var(--accent-red)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        title={iconName}
                                      >
                                        <img src={`https://api.iconify.design/${iconName}.svg`} alt={iconName} style={{ width: '70%', height: '70%', objectFit: 'contain', pointerEvents: 'none' }} />
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* DATA BINDING */}
                      {activeLayer.type === 'text' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '0.8rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}><Txt>Source des données</Txt></label>
                          
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => updateLayer(activeLayer.id, { sourceType: 'static' })} style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: activeLayer.sourceType === 'static' ? 'var(--accent-red)' : 'var(--bg-secondary)', color: activeLayer.sourceType === 'static' ? '#fff' : 'var(--text-primary)' }}>STATIQUE</button>
                            <button onClick={() => updateLayer(activeLayer.id, { sourceType: 'column' })} style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: activeLayer.sourceType === 'column' ? 'var(--accent-red)' : 'var(--bg-secondary)', color: activeLayer.sourceType === 'column' ? '#fff' : 'var(--text-primary)' }}>BDD</button>
                          </div>

                          {activeLayer.sourceType === 'column' ? (
                            <select className="tech-input" style={{ width: '100%', fontSize: '0.9rem', marginTop: '0.5rem' }} value={activeLayer.columnId || ''} onChange={(e) => updateLayer(activeLayer.id, { columnId: e.target.value })}>
                              <option value="">-- Choisir une colonne --</option>
                              {activeDatasetCols.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          ) : (
                            <input type="text" className="tech-input" style={{ width: '100%', fontSize: '0.9rem', marginTop: '0.5rem' }} value={activeLayer.content} onChange={(e) => updateLayer(activeLayer.id, { content: e.target.value })} placeholder="Texte libre..." />
                          )}
                          
                          {/* Alignement & Taille police */}
                          <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}><Txt>Alignement</Txt></label>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button onClick={() => updateLayer(activeLayer.id, { textAlign: 'left' })} style={{ width: '30px', height: '30px', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: activeLayer.textAlign === 'left' ? 'var(--accent-red)' : 'var(--bg-secondary)', color: activeLayer.textAlign === 'left' ? '#fff' : 'var(--text-primary)' }}>[L]</button>
                              <button onClick={() => updateLayer(activeLayer.id, { textAlign: 'center' })} style={{ width: '30px', height: '30px', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: activeLayer.textAlign === 'center' ? 'var(--accent-red)' : 'var(--bg-secondary)', color: activeLayer.textAlign === 'center' ? '#fff' : 'var(--text-primary)' }}>[C]</button>
                              <button onClick={() => updateLayer(activeLayer.id, { textAlign: 'right' })} style={{ width: '30px', height: '30px', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: activeLayer.textAlign === 'right' ? 'var(--accent-red)' : 'var(--bg-secondary)', color: activeLayer.textAlign === 'right' ? '#fff' : 'var(--text-primary)' }}>[R]</button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}><Txt>Taille police</Txt></label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <button onClick={() => updateLayer(activeLayer.id, { fontSize: Math.max(6, (activeLayer.fontSize || 16) - 1) })} style={{ width: '24px', height: '24px', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                              <input type="number" className="tech-input" style={{ width: '52px', fontSize: '0.9rem', textAlign: 'center' }} value={activeLayer.fontSize || 16} min={6} max={200} onChange={(e) => updateLayer(activeLayer.id, { fontSize: Math.max(6, parseInt(e.target.value) || 16) })} />
                              <button onClick={() => updateLayer(activeLayer.id, { fontSize: (activeLayer.fontSize || 16) + 1 })} style={{ width: '24px', height: '24px', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Rotation */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Rotation (°)</label>
                        <input type="number" className="tech-input" style={{ width: '70px', fontSize: '0.9rem' }} value={activeLayer.rotation || 0} min={-360} max={360} onChange={(e) => updateLayer(activeLayer.id, { rotation: parseInt(e.target.value) || 0 })} />
                        <button onClick={() => updateLayer(activeLayer.id, { rotation: 0 })} style={{ padding: '0 8px', height: '32px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>↺ RESET</button>
                      </div>

                      {/* Coordonnées & Lock Ratio */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Pos X</label><input type="number" className="tech-input" style={{ width: '100%', fontSize: '0.9rem' }} value={activeLayer.x} onChange={(e) => updateLayer(activeLayer.id, { x: parseInt(e.target.value) || 0 })} /></div>
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Pos Y</label><input type="number" className="tech-input" style={{ width: '100%', fontSize: '0.9rem' }} value={activeLayer.y} onChange={(e) => updateLayer(activeLayer.id, { y: parseInt(e.target.value) || 0 })} /></div>
                        
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Largeur</label><input type="number" className="tech-input" style={{ width: '100%', fontSize: '0.9rem' }} value={activeLayer.width} onChange={(e) => updateLayer(activeLayer.id, { width: Math.max(1, parseInt(e.target.value) || 1) })} /></div>
                        <div style={{ position: 'relative' }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Hauteur</label>
                          <input type="number" className="tech-input" style={{ width: '100%', fontSize: '0.9rem' }} value={activeLayer.height} onChange={(e) => updateLayer(activeLayer.id, { height: Math.max(1, parseInt(e.target.value) || 1) })} />
                          
                          {/* Bouton Cadenas (Lock Ratio) */}
                          <button 
                            onClick={() => updateLayer(activeLayer.id, { aspectLocked: !activeLayer.aspectLocked })}
                            style={{ position: 'absolute', left: '-20px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: activeLayer.aspectLocked ? 'var(--accent-red)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem' }}
                            title="Verrouiller les proportions (Shift pendant Resize)"
                          >
                            {activeLayer.aspectLocked ? '🔗' : '🔓'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : <div className="flex-center" style={{ height: '100%', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>SÉLECTIONNEZ UN CALQUE</div>}
                </div>
              </div>
            </div>

            {/* --- ASSET STORE (ABSOLUTE RIGHT) --- */}
            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', zIndex: 50, backgroundColor: 'var(--bg-primary)', boxShadow: isStoreOpen ? '-5px 0 20px rgba(0,0,0,0.5)' : 'none', transition: 'box-shadow 0.3s' }}>
              <div style={{ width: '30px', backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', borderRight: isStoreOpen ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'start', cursor: 'pointer', paddingTop: '1rem', zIndex: 10 }} onClick={() => setIsStoreOpen(!isStoreOpen)}>
                <div style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', fontSize: '16px', marginBottom: '1rem' }} onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-red)'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}>{isStoreOpen ? '>' : '<'}</div>
                {!isStoreOpen && <div style={{ color: 'var(--text-secondary)', fontSize: '12px', paddingTop: '2rem', width: '100%', display: 'flex', justifyContent: 'center' }}><Txt vertical>RESSOURCES</Txt></div>}
              </div>
              <div style={{ width: isStoreOpen ? '350px' : '0px', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-secondary)', transition: 'width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)', overflow: 'hidden', borderLeft: 'none' }}>
                <div style={{ width: '350px', display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem' }}>
                  <h2 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', fontSize: '1.2rem', whiteSpace: 'nowrap' }}><Txt>Ressources visuelles</Txt></h2>
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
                    <button onClick={() => setActiveAssetTab('upload')} style={{ flex: 1, padding: '0.5rem', fontWeight: 700, color: activeAssetTab === 'upload' ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: activeAssetTab === 'upload' ? '2px solid var(--accent-red)' : 'none' }}>[ MES_ASSETS ]</button>
                    <button onClick={() => setActiveAssetTab('icons')} style={{ flex: 1, padding: '0.5rem', fontWeight: 700, color: activeAssetTab === 'icons' ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: activeAssetTab === 'icons' ? '2px solid var(--accent-red)' : 'none' }}>[ ICÔNES_API ]</button>
                  </div>
                  {activeAssetTab === 'icons' && (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                      <form onSubmit={searchIcons} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <input type="text" className="tech-input flex-1" placeholder="Ex: skull, fire..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        <button type="submit" className="btn-confirm" style={{ padding: '0 1rem' }}>{isSearching ? '...' : 'GO'}</button>
                      </form>
                      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', padding: '0.5rem' }}>
                        {icons.length === 0 && !isSearching ? <div className="flex-center" style={{ height: '100%', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.8rem' }}>TAPEZ UN MOT CLÉ EN ANGLAIS<br/>POUR RECHERCHER DES ICÔNES</div> : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                            {icons.map(iconName => {
                              const isSaved = savedIcons.includes(iconName);
                              return (
                                <div 
                                  key={iconName} draggable="true" onDragStart={(e) => e.dataTransfer.setData('iconName', iconName)}
                                  style={{ aspectRatio: '1/1', background: '#ffffff', border: `2px solid ${isSaved ? 'var(--accent-red)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', position: 'relative', transition: 'all 0.1s' }} 
                                  title={iconName} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-red)'; e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.zIndex = '10'; e.currentTarget.style.boxShadow = '4px 4px 0 rgba(0,0,0,0.5)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = isSaved ? 'var(--accent-red)' : 'var(--border)'; e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = '1'; e.currentTarget.style.boxShadow = 'none';}}
                                >
                                  <img src={`https://api.iconify.design/${iconName}.svg`} alt={iconName} style={{ width: '65%', height: '65%', objectFit: 'contain', pointerEvents: 'none' }} draggable="false" />
                                  <button onClick={(e) => { e.stopPropagation(); toggleSaveIcon(iconName); }} style={{ position: 'absolute', top: '2px', right: '2px', width: '20px', height: '20px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: isSaved ? 'var(--accent-red)' : 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: isSaved ? 1 : 0.2, transition: 'all 0.2s', zIndex: 2 }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => { if (!isSaved) e.currentTarget.style.opacity = '0.2'; }}>{isSaved ? '×' : '+'}</button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {activeAssetTab === 'upload' && (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                      <div className="flex-center" style={{ padding: '1rem', border: '1px dashed var(--border)', marginBottom: '1rem', textAlign: 'center' }}><span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}><Txt>Glisser déposer images ici</Txt><br/><button className="btn-cancel" style={{ padding: '0.2rem 0.5rem', marginTop: '0.5rem' }}>[ PARCOURIR ]</button></span></div>
                      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', padding: '0.5rem' }}>
                        {savedIcons.length === 0 ? <div className="flex-center" style={{ height: '100%', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.8rem' }}>AUCUNE ICÔNE SAUVEGARDÉE</div> : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                            {savedIcons.map(iconName => (
                              <div key={`saved-${iconName}`} draggable="true" onDragStart={(e) => e.dataTransfer.setData('iconName', iconName)} style={{ aspectRatio: '1/1', background: '#ffffff', border: '2px solid var(--accent-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', position: 'relative' }}>
                                <img src={`https://api.iconify.design/${iconName}.svg`} alt={iconName} style={{ width: '65%', height: '65%', objectFit: 'contain', pointerEvents: 'none' }} draggable="false" />
                                <button onClick={(e) => { e.stopPropagation(); toggleSaveIcon(iconName); }} style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--accent-red)', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 }}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* MENUS CONTEXTUELS COMBINÉS (Gabarit / Calque) */}
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === 'template' ? (
            <>
              <div className="context-menu-label">// GABARIT</div>
              <div className="context-menu-item" onClick={() => { setActiveTplToEdit(contextMenu.id); setTplFormName(templates.find(t=>t.id===contextMenu.id)?.name || ''); setTplModalMode('edit'); setIsTplModalOpen(true); setContextMenu(null); }}>[ MODIFIER ]</div>
              <div className="context-menu-item" onClick={() => duplicateTemplate(contextMenu.id)}>[ DUPLIQUER ]</div>
              <div className="context-menu-divider" />
              <div className="context-menu-item" style={{ color: 'var(--accent-red)' }} onClick={() => deleteTemplate(contextMenu.id)}>[X] SUPPRIMER</div>
            </>
          ) : contextMenu.subMenu === 'copyTo' ? (
            <>
              <div className="context-menu-label">// COPIER VERS</div>
              <div className="context-menu-item" onClick={() => setContextMenu({ ...contextMenu, subMenu: undefined })}>← RETOUR</div>
              <div className="context-menu-divider" />
              {templates.filter(t => t.id !== activeTemplateId).length === 0 ? (
                <div className="context-menu-item" style={{ opacity: 0.5, cursor: 'default' }}>Aucun autre gabarit</div>
              ) : (
                <>
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {templates.filter(t => t.id !== activeTemplateId).map(t => (
                      <div key={t.id} className="context-menu-item" onClick={() => copyLayerTo(contextMenu.id, t.id)}>[ {t.name} ]</div>
                    ))}
                  </div>
                  <div className="context-menu-divider" />
                  <div className="context-menu-item" style={{ color: 'var(--accent-red)' }} onClick={() => copyLayerToAll(contextMenu.id)}>[ VERS TOUS ]</div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="context-menu-label">// CALQUE</div>
              <div className="context-menu-item" onClick={() => {
                const newName = prompt("Nouveau nom du calque :", layers.find(l => l.id === contextMenu.id)?.name);
                if (newName) updateLayer(contextMenu.id, { name: newName });
                setContextMenu(null);
              }}>[ RENOMMER ]</div>
              <div className="context-menu-divider" />
              <div className="context-menu-item" onClick={() => moveLayerToFront(contextMenu.id)}>[ PREMIER_PLAN ]</div>
              <div className="context-menu-item" onClick={() => moveLayerToBack(contextMenu.id)}>[ ARRIÈRE_PLAN ]</div>
              <div className="context-menu-divider" />
              <div className="context-menu-item" onClick={() => duplicateLayer(contextMenu.id)}>[ DUPLIQUER ]</div>
              <div className="context-menu-item" onClick={() => setContextMenu({ ...contextMenu, subMenu: 'copyTo' })}>[ COPIER VERS → ]</div>
              <div className="context-menu-divider" />
              <div className="context-menu-item" style={{ color: 'var(--accent-red)' }} onClick={() => deleteLayer(contextMenu.id)}>[X] SUPPRIMER</div>
            </>
          )}
        </div>
      )}

      {isTplModalOpen && (
        <div className="modal-overlay flex-center" style={{ zIndex: 100 }}>
          <div className="modal-content panel border-thin">
            <h3 className="modal-title"><Txt>{tplModalMode === 'add' ? 'Nouveau gabarit' : 'Renommer gabarit'}</Txt></h3>
            <form onSubmit={saveTemplateDetails} style={{ marginTop: '1rem' }}>
              <input type="text" className="tech-input mb-4" placeholder="Nom du gabarit" value={tplFormName} onChange={(e) => setTplFormName(e.target.value)} autoFocus required />
              <div className="flex-between" style={{ gap: '1rem' }}><button type="button" className="btn-cancel" onClick={() => setIsTplModalOpen(false)}>[ ANNULER ]</button><button type="submit" className="btn-confirm">[ ENREGISTRER ]</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}