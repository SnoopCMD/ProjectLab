"use client";

import { useState } from 'react';

// Composant d'habillage Brutaliste
const Txt = ({ children }: { children: string }) => {
  if (!children) return null;
  return (
    <span style={{ textTransform: 'uppercase' }}>
      {children.split(' ').map((word, index, array) => (
        <span key={index}>
          {word}
          {index < array.length - 1 && (
            <span style={{ position: 'relative', display: 'inline-flex', justifyContent: 'center' }}>
              <span style={{ color: 'transparent', whiteSpace: 'pre' }}> </span>
              <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>_</span>
            </span>
          )}
        </span>
      ))}
    </span>
  );
};

export default function TemplateEditorTab() {
  const [activeTab, setActiveTab] = useState<'upload' | 'icons'>('icons');
  
  // États pour l'API Iconify
  const [searchQuery, setSearchQuery] = useState('sword');
  const [icons, setIcons] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Fonction pour appeler l'API gratuite Iconify
  const searchIcons = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      // Appel à l'API publique (recherche dans toutes les banques libres)
      const res = await fetch(`https://api.iconify.design/search?query=${searchQuery}&limit=60`);
      const data = await res.json();
      
      if (data && data.icons) {
        setIcons(data.icons); // Retourne un tableau du type ["mdi:sword", "game-icons:broadsword", ...]
      } else {
        setIcons([]);
      }
    } catch (err) {
      console.error("Erreur API Iconify", err);
    }
    setIsSearching(false);
  };

  return (
    <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 150px)' }}>
      
      {/* ========================================== */}
      {/* PANNEAU GAUCHE : LE CANVAS (ZONE DE DESSIN) */}
      {/* ========================================== */}
      <div className="panel border-thin flex-1" style={{ backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
        <div className="flex-between mb-4">
          <h2 style={{ color: 'var(--text-primary)', margin: 0 }}><Txt>Éditeur de gabarit</Txt></h2>
          <select className="tech-input" style={{ width: 'auto' }}>
            <option>GABARIT_MONSTRE_01</option>
            <option>GABARIT_SORT_01</option>
          </select>
        </div>
        
        {/* Zone de rendu de la carte (Placeholder pour la suite) */}
        <div style={{ flex: 1, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-secondary)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ width: '300px', height: '420px', backgroundColor: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#000', fontWeight: 'bold', opacity: 0.2 }}>ZONE_DE_RENDU_CARTE</span>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* PANNEAU DROIT : ASSET STORE (RESSOURCES) */}
      {/* ========================================== */}
      <div className="panel border-thin" style={{ width: '350px', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-secondary)' }}>
        <h2 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', fontSize: '1.2rem' }}>
          <Txt>Ressources visuelles</Txt>
        </h2>

        {/* Onglets du Store */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
          <button 
            onClick={() => setActiveTab('upload')}
            style={{ flex: 1, padding: '0.5rem', fontWeight: 700, color: activeTab === 'upload' ? 'var(--accent-red)' : 'var(--text-secondary)', borderBottom: activeTab === 'upload' ? '2px solid var(--accent-red)' : 'none' }}
          >
            [ MES_IMAGES ]
          </button>
          <button 
            onClick={() => setActiveTab('icons')}
            style={{ flex: 1, padding: '0.5rem', fontWeight: 700, color: activeTab === 'icons' ? 'var(--accent-red)' : 'var(--text-secondary)', borderBottom: activeTab === 'icons' ? '2px solid var(--accent-red)' : 'none' }}
          >
            [ ICÔNES_API ]
          </button>
        </div>

        {/* CONTENU : ICÔNES API */}
        {activeTab === 'icons' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <form onSubmit={searchIcons} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input 
                type="text" 
                className="tech-input flex-1" 
                placeholder="Ex: skull, fire, heart..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="btn-confirm" style={{ padding: '0 1rem' }}>
                {isSearching ? '...' : 'GO'}
              </button>
            </form>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', padding: '0.5rem' }}>
              {icons.length === 0 && !isSearching ? (
                <div className="flex-center" style={{ height: '100%', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.8rem' }}>
                  TAPEZ UN MOT CLÉ EN ANGLAIS<br/>POUR RECHERCHER DES ICÔNES
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {icons.map(iconName => (
                    <div 
                      key={iconName}
                      style={{ 
                        aspectRatio: '1/1', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', backgroundColor: 'var(--bg-secondary)', transition: 'border 0.2s'
                      }}
                      title={iconName}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-red)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      {/* Affichage direct du SVG via le CDN d'Iconify */}
                      <img 
                        src={`https://api.iconify.design/${iconName}.svg?color=white`} 
                        alt={iconName}
                        style={{ width: '60%', height: '60%', objectFit: 'contain', filter: 'invert(1)' /* Inverse pour mode sombre */ }} 
                        draggable="false"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTENU : UPLOADS (Placeholder) */}
        {activeTab === 'upload' && (
          <div className="flex-center" style={{ flex: 1, border: '1px dashed var(--border)', flexDirection: 'column', gap: '1rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>GLISSER_DÉPOSER_FICHIERS</span>
            <button className="btn-cancel">[ PARCOURIR ]</button>
          </div>
        )}

      </div>
    </div>
  );
}