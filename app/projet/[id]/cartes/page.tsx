"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

// ─── TYPES ───────────────────────────────────────────────────────────────────

type LayerType = 'text' | 'image' | 'shape';
type SourceType = 'static' | 'column';

interface TemplateLayer {
  id: string; name: string; type: LayerType; isVisible: boolean;
  x: number; y: number; width: number; height: number;
  content: string; color: string; sourceType: SourceType; columnId: string;
  textAlign?: 'left' | 'center' | 'right'; fontSize?: number; aspectLocked?: boolean; rotation?: number;
}

interface Template {
  id: string; name: string; dataset_id: string;
  layers: TemplateLayer[]; width: number; height: number;
}

interface Deck {
  id: string; name: string;
  cards: any[];
  template: Template | null;
}

// ─── RENDU D'UNE CARTE ───────────────────────────────────────────────────────

function CardRender({ template, data, scale = 1 }: { template: Template; data: any; scale?: number }) {
  const w = template.width || 300;
  const h = template.height || 420;
  return (
    <div style={{ width: w * scale, height: h * scale, position: 'relative', overflow: 'hidden', backgroundColor: '#fff', flexShrink: 0 }}>
      {[...template.layers].reverse().map((layer, idx) => {
        if (!layer.isVisible) return null;
        const value = layer.sourceType === 'column' && layer.columnId && data
          ? (data[layer.columnId] ?? '')
          : layer.content;
        const justify = layer.textAlign === 'right' ? 'flex-end' : layer.textAlign === 'center' ? 'center' : 'flex-start';
        return (
          <div key={layer.id} style={{
            position: 'absolute',
            left: layer.x * scale, top: layer.y * scale,
            width: layer.width * scale, height: layer.height * scale,
            backgroundColor: layer.type === 'shape' ? layer.color : 'transparent',
            color: layer.color,
            display: 'flex', alignItems: 'center', justifyContent: justify,
            textAlign: layer.textAlign || 'left',
            fontFamily: '"Courier New", Courier, monospace', fontWeight: 'bold',
            fontSize: (layer.fontSize || 16) * scale + 'px',
            lineHeight: 1.2,
            wordBreak: 'break-word', padding: layer.type === 'text' ? `0 ${4 * scale}px` : '0',
            zIndex: template.layers.length - idx,
            overflow: 'hidden',
            transform: `rotate(${layer.rotation || 0}deg)`, transformOrigin: 'center center',
          }}>
            {layer.type === 'text' && <span style={{ pointerEvents: 'none', display: 'block', width: '100%', wordBreak: 'break-word' }}>{value}</span>}
            {layer.type === 'image' && value && (
              <img src={`https://api.iconify.design/${value}.svg?color=${encodeURIComponent(layer.color)}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PAGE PRINCIPALE ─────────────────────────────────────────────────────────

const Txt = ({ children }: { children: string }) => {
  if (!children) return null;
  const words = children.split(' ');
  return (
    <span style={{ textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center' }}>
      {words.map((w, i) => (
        <span key={i} style={{ whiteSpace: 'nowrap' }}>
          {w}
          {i < words.length - 1 && (
            <span style={{ position: 'relative', display: 'inline-flex', justifyContent: 'center' }}>
              <span style={{ color: 'transparent', whiteSpace: 'pre' }}> </span>
              <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center' }}>_</span>
            </span>
          )}
        </span>
      ))}
    </span>
  );
};

// Formats papier en mm
const PAGE_FORMATS: Record<string, [number, number]> = {
  'A4': [210, 297],
  'A3': [297, 420],
  'Letter': [216, 279],
};

const MM_TO_PX = 3.7795275591;

export default function CartesPage() {
  const params = useParams();
  const projectSlug = params?.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [decks, setDecks] = useState<Deck[]>([]);

  // Sélection
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set()); // "deckId:cardIndex"
  const [collapsedDecks, setCollapsedDecks] = useState<Set<string>>(new Set());

  // Paramètres PDF
  const [pageFormat, setPageFormat] = useState<'A4' | 'A3' | 'Letter'>('A4');
  const [cardWidthMm, setCardWidthMm] = useState(63);
  const [marginMm, setMarginMm] = useState(5);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [borderWidth, setBorderWidth] = useState(0);
  const [showCutLines, setShowCutLines] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // ─── CHARGEMENT ────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      if (!projectSlug) return;
      const decodedSlug = decodeURIComponent(projectSlug);

      const { data: projectData } = await supabase
        .from('projects').select('id, columns_schema').eq('slug', decodedSlug).limit(1).single();
      if (!projectData) { setIsLoading(false); return; }

      const schema = projectData.columns_schema;
      const datasetList: { id: string; name: string }[] =
        schema?.datasets || [{ id: 'default', name: 'Set Principal' }];

      const [{ data: cardsData }, { data: tplData }] = await Promise.all([
        supabase.from('cards').select('*').eq('project_id', projectData.id).order('row_order'),
        supabase.from('templates').select('*').eq('project_id', projectData.id),
      ]);

      // Grouper les cartes par dataset
      const cardsByDataset: Record<string, any[]> = {};
      (cardsData || []).forEach(card => {
        const dsId = card.dataset_id || 'default';
        if (!cardsByDataset[dsId]) cardsByDataset[dsId] = [];
        cardsByDataset[dsId].push(card.data);
      });

      // Associer chaque dataset à son template (le premier qui le référence)
      const tplByDataset: Record<string, Template> = {};
      (tplData || []).forEach(t => {
        if (t.dataset_id && !tplByDataset[t.dataset_id]) {
          tplByDataset[t.dataset_id] = { ...t, layers: t.layers || [], width: t.width || 300, height: t.height || 420 };
        }
      });

      const loadedDecks: Deck[] = datasetList.map(ds => ({
        id: ds.id,
        name: ds.name,
        cards: cardsByDataset[ds.id] || [],
        template: tplByDataset[ds.id] || null,
      })).filter(d => d.cards.length > 0);

      setDecks(loadedDecks);
      setIsLoading(false);
    };
    load();
  }, [projectSlug]);

  // ─── SÉLECTION ─────────────────────────────────────────────────────────────

  const toggleCard = (deckId: string, cardIdx: number) => {
    const key = `${deckId}:${cardIdx}`;
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleDeck = (deckId: string, cards: any[]) => {
    const keys = cards.map((_, i) => `${deckId}:${i}`);
    const allSelected = keys.every(k => selectedCards.has(k));
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (allSelected) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set<string>();
    decks.forEach(d => d.cards.forEach((_, i) => all.add(`${d.id}:${i}`)));
    setSelectedCards(all);
  };

  const deselectAll = () => setSelectedCards(new Set());

  const totalSelected = selectedCards.size;

  // ─── GÉNÉRATION PDF ────────────────────────────────────────────────────────

  const generatePDF = useCallback(async () => {
    if (totalSelected === 0) return;
    setIsGenerating(true);

    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');
      const { createRoot } = await import('react-dom/client');
      const { flushSync } = await import('react-dom');
      const React = await import('react');

      const [pageW, pageH] = orientation === 'portrait'
        ? PAGE_FORMATS[pageFormat]
        : [PAGE_FORMATS[pageFormat][1], PAGE_FORMATS[pageFormat][0]];

      // Cartes sélectionnées dans l'ordre des decks
      const selectedList: { template: Template; data: any }[] = [];
      decks.forEach(deck => {
        if (!deck.template) return;
        deck.cards.forEach((card, i) => {
          if (selectedCards.has(`${deck.id}:${i}`))
            selectedList.push({ template: deck.template!, data: card });
        });
      });
      if (selectedList.length === 0) { setIsGenerating(false); return; }

      const firstTpl = selectedList[0].template;
      const aspectRatio = firstTpl.height / firstTpl.width;

      // Dimensions fixes de la carte (taille réelle demandée)
      const cardWmm = cardWidthMm;
      const cardHmm = cardWmm * aspectRatio;
      const cardWpx = cardWmm * MM_TO_PX;
      const cardHpx = cardHmm * MM_TO_PX;

      const cardsPerRow = Math.max(1, Math.floor((pageW - marginMm * 2) / cardWmm));
      const rowsPerPage = Math.max(1, Math.floor((pageH - marginMm * 2) / cardHmm));
      const cardsPerPage = cardsPerRow * rowsPerPage;
      const renderW = cardsPerRow * cardWpx;

      const pdf = new jsPDF({ orientation, unit: 'mm', format: pageFormat });

      // Conteneur de rendu — placé hors écran pour éviter qu'html2canvas le capture deux fois
      const containerH = rowsPerPage * cardHpx;
      const renderContainer = document.createElement('div');
      renderContainer.style.cssText = `position:fixed;top:-${containerH + 100}px;left:-${renderW + 100}px;z-index:-1;background:white;width:${renderW}px;height:${containerH}px;overflow:hidden;pointer-events:none;`;
      document.body.appendChild(renderContainer);

      const waitForImages = (el: HTMLElement): Promise<void> => new Promise(resolve => {
        const imgs = el.querySelectorAll('img');
        if (!imgs.length) { resolve(); return; }
        let pending = imgs.length;
        const done = () => { if (--pending === 0) resolve(); };
        imgs.forEach(img => {
          if (img.complete && img.naturalWidth > 0) done();
          else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
        });
        setTimeout(resolve, 3000);
      });

      // Root React créé une seule fois, réutilisé par page
      const root = createRoot(renderContainer);

      for (let pageIdx = 0; pageIdx * cardsPerPage < selectedList.length; pageIdx++) {
        const pageCards = selectedList.slice(pageIdx * cardsPerPage, (pageIdx + 1) * cardsPerPage);
        const scale = cardWpx / (pageCards[0].template.width || 300);

        // Positionnement absolu précis — évite les problèmes de rendu flex par html2canvas
        flushSync(() => {
          root.render(
            React.createElement('div', {
              style: { position: 'relative', width: renderW, height: containerH, background: 'white' }
            },
              pageCards.map((item, idx) => {
                const col = idx % cardsPerRow;
                const row = Math.floor(idx / cardsPerRow);
                return React.createElement('div', {
                  key: idx,
                  style: {
                    position: 'absolute',
                    left: col * cardWpx,
                    top: row * cardHpx,
                    boxShadow: borderWidth > 0 ? `inset 0 0 0 ${borderWidth}px #000` : 'none',
                  }
                },
                  React.createElement(CardRender, { template: item.template, data: item.data, scale })
                );
              })
            )
          );
        });

        // Attendre le chargement des images SVG
        await waitForImages(renderContainer);

        const canvas = await html2canvas(renderContainer, {
          scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
          x: 0, y: 0, width: renderW, height: containerH,
          onclone: (_doc, el) => {
            // Supprimer tous les autres éléments du document cloné pour éviter qu'ils soient capturés
            [..._doc.body.children].forEach(child => { if (child !== el) child.remove(); });
            _doc.body.style.cssText = 'margin:0;padding:0;overflow:hidden;';
            el.style.cssText = `position:absolute;top:0;left:0;background:white;width:${renderW}px;height:${containerH}px;overflow:hidden;`;
          },
        });

        if (pageIdx > 0) pdf.addPage();

        // Taille réelle en mm dans le PDF (cartes à la taille demandée, pas étirées)
        const imgW = cardsPerRow * cardWmm;
        const imgH = rowsPerPage * cardHmm;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', marginMm, marginMm, imgW, imgH);

        // Lignes de coupe
        if (showCutLines) {
          const cutLen = 3; // mm
          const cutOffset = 1;
          pdf.setDrawColor(150, 150, 150);
          pdf.setLineWidth(0.2);
          const rows = Math.ceil(pageCards.length / cardsPerRow);
          for (let row = 0; row <= rows; row++) {
            for (let col = 0; col <= cardsPerRow; col++) {
              if (col >= pageCards.length % cardsPerRow && row === rows && pageCards.length % cardsPerRow !== 0 && col > pageCards.length % cardsPerRow) break;
              const x = marginMm + col * cardWmm;
              const y = marginMm + row * cardHmm;
              // Croix aux intersections
              pdf.line(x - cutLen - cutOffset, y, x - cutOffset, y);
              pdf.line(x + cutOffset, y, x + cutLen + cutOffset, y);
              pdf.line(x, y - cutLen - cutOffset, x, y - cutOffset);
              pdf.line(x, y + cutOffset, x, y + cutLen + cutOffset);
            }
          }
        }
      }

      root.unmount();
      document.body.removeChild(renderContainer);
      pdf.save(`cartes_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Erreur génération PDF:', err);
      alert('Erreur lors de la génération du PDF.');
    }

    setIsGenerating(false);
  }, [selectedCards, decks, pageFormat, cardWidthMm, marginMm, orientation, borderWidth, showCutLines, totalSelected]);

  // ─── RENDU ─────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--accent-red)' }}>
      CHARGEMENT_DECKS...
    </div>
  );

  if (decks.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', flexDirection: 'column', gap: '0.5rem' }}>
      <span style={{ fontSize: '1.2rem' }}>AUCUN DECK DISPONIBLE</span>
      <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>Ajoutez des données dans l'onglet Données</span>
    </div>
  );

  // Aperçu scale
  const PREVIEW_W = 120;

  return (
    <div style={{ display: 'flex', height: '100%', gap: '1rem', overflow: 'hidden' }}>

      {/* ── PANNEAU GAUCHE : DECKS ── */}
      <div className="panel border-thin" style={{ width: '260px', minWidth: '260px', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}><Txt>Decks</Txt></h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={selectAll} className="btn-confirm" style={{ flex: 1, padding: '0.3rem', fontSize: '0.7rem' }}>[ TOUT ]</button>
            <button onClick={deselectAll} className="btn-cancel" style={{ flex: 1, padding: '0.3rem', fontSize: '0.7rem' }}>[ RIEN ]</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {decks.map(deck => {
            const deckKeys = deck.cards.map((_, i) => `${deck.id}:${i}`);
            const selectedCount = deckKeys.filter(k => selectedCards.has(k)).length;
            const allSelected = selectedCount === deck.cards.length;
            const someSelected = selectedCount > 0 && !allSelected;
            const isCollapsed = collapsedDecks.has(deck.id);

            return (
              <div key={deck.id} style={{ marginBottom: '0.3rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => { const s = new Set(collapsedDecks); s.has(deck.id) ? s.delete(deck.id) : s.add(deck.id); setCollapsedDecks(s); }}
                >
                  <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={(e) => { e.stopPropagation(); toggleDeck(deck.id, deck.cards); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: 'var(--accent-red)', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, fontSize: '0.8rem', color: allSelected ? 'var(--accent-red)' : 'var(--text-primary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Txt>{deck.name}</Txt>
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {selectedCount}/{deck.cards.length}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{isCollapsed ? '▶' : '▼'}</span>
                </div>
                {!isCollapsed && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {deck.cards.map((card, i) => {
                      const key = `${deck.id}:${i}`;
                      const isSel = selectedCards.has(key);
                      return (
                        <div key={i} onClick={() => toggleCard(deck.id, i)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.3rem', cursor: 'pointer', backgroundColor: isSel ? 'color-mix(in srgb, var(--accent-red) 15%, transparent)' : 'transparent' }}>
                          <input type="checkbox" checked={isSel} onChange={() => toggleCard(deck.id, i)} onClick={e => e.stopPropagation()} style={{ accentColor: 'var(--accent-red)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.75rem', color: isSel ? 'var(--accent-red)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {card.name || card.id || `Carte ${i + 1}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ZONE PRINCIPALE ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '0.75rem' }}>

        {/* BARRE PARAMÈTRES PDF */}
        <div className="panel border-thin" style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>FORMAT</label>
            <select className="tech-input" style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }} value={pageFormat} onChange={e => setPageFormat(e.target.value as any)}>
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="Letter">Letter</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ORIENTATION</label>
            <select className="tech-input" style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem' }} value={orientation} onChange={e => setOrientation(e.target.value as any)}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Paysage</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>TAILLE CARTE</label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {[{ l: 'Mini', mm: 41 }, { l: 'Poker', mm: 63 }, { l: 'Tarot', mm: 70 }].map(p => (
                <button key={p.mm} onClick={() => setCardWidthMm(p.mm)} style={{ padding: '0 6px', height: '28px', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: cardWidthMm === p.mm ? 'var(--accent-red)' : 'var(--bg-secondary)', color: cardWidthMm === p.mm ? '#fff' : 'var(--text-primary)', fontSize: '0.7rem' }}>{p.l}</button>
              ))}
              <input type="number" className="tech-input" style={{ width: '48px', padding: '0.2rem 0.4rem', fontSize: '0.8rem' }} value={cardWidthMm} min={20} max={150} onChange={e => setCardWidthMm(Number(e.target.value))} />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>mm</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>MARGE (mm)</label>
            <input type="number" className="tech-input" style={{ width: '52px', padding: '0.2rem 0.4rem', fontSize: '0.8rem' }} value={marginMm} min={0} max={20} onChange={e => setMarginMm(Number(e.target.value))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>BORDURE</label>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {[0, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setBorderWidth(n)} style={{ width: '28px', height: '28px', border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: borderWidth === n ? 'var(--accent-red)' : 'var(--bg-secondary)', color: borderWidth === n ? '#fff' : 'var(--text-primary)', fontSize: '0.75rem' }}>{n === 0 ? '✕' : `${n}px`}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={showCutLines} onChange={e => setShowCutLines(e.target.checked)} style={{ accentColor: 'var(--accent-red)' }} />
              TRAITS DE COUPE
            </label>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.8rem', color: totalSelected > 0 ? 'var(--accent-red)' : 'var(--text-secondary)', fontWeight: 700 }}>
              {totalSelected} CARTE{totalSelected > 1 ? 'S' : ''} SÉLECTIONNÉE{totalSelected > 1 ? 'S' : ''}
            </span>
            <button
              onClick={generatePDF}
              disabled={totalSelected === 0 || isGenerating}
              className="btn-confirm"
              style={{ padding: '0.4rem 1.2rem', fontSize: '0.85rem', opacity: totalSelected === 0 ? 0.4 : 1 }}
            >
              {isGenerating ? '[ GÉNÉRATION... ]' : '[ GÉNÉRER PDF ]'}
            </button>
          </div>
        </div>

        {/* GRILLE D'APERÇU */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {decks.map(deck => {
            if (collapsedDecks.has(deck.id)) return null;
            return (
              <div key={deck.id} style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}><Txt>{deck.name}</Txt></h3>
                  {!deck.template && <span style={{ fontSize: '0.7rem', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0 4px' }}>SANS GABARIT</span>}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{deck.cards.filter((_, i) => selectedCards.has(`${deck.id}:${i}`)).length}/{deck.cards.length}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {deck.cards.map((card, i) => {
                    const key = `${deck.id}:${i}`;
                    const isSel = selectedCards.has(key);
                    const scale = PREVIEW_W / (deck.template?.width || 300);
                    const previewH = (deck.template?.height || 420) * scale;
                    return (
                      <div
                        key={i}
                        onClick={() => toggleCard(deck.id, i)}
                        style={{ cursor: 'pointer', position: 'relative', outline: isSel ? '3px solid var(--accent-red)' : '2px solid var(--border)', outlineOffset: '2px', transition: 'outline 0.1s', flexShrink: 0 }}
                        title={card.name || card.id || `Carte ${i + 1}`}
                      >
                        {deck.template ? (
                          <CardRender template={deck.template} data={card} scale={scale} />
                        ) : (
                          <div style={{ width: PREVIEW_W, height: previewH, backgroundColor: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '4px' }}>
                            {card.name || card.id || `#${i + 1}`}
                          </div>
                        )}
                        {isSel && (
                          <div style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, backgroundColor: 'var(--accent-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 700 }}>✓</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
