"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';

const Txt = ({ children }: { children: string }) => {
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
  return <span style={{ textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center' }}>{content}</span>;
};

export default function ResourcesPage() {
  const params = useParams();
  const projectSlug = params?.id as string;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [savedIcons, setSavedIcons] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!projectSlug) return;
      const decodedSlug = decodeURIComponent(projectSlug);
      const { data } = await supabase.from('projects').select('id, saved_assets').eq('slug', decodedSlug).limit(1);
      const project = data?.[0];
      if (project) {
        setProjectId(project.id);
        if (project.saved_assets && Array.isArray(project.saved_assets)) setSavedIcons(project.saved_assets);
      }
      setIsLoading(false);
    };
    load();
  }, [projectSlug]);

  const saveAssets = async (icons: string[]) => {
    if (!projectId) return;
    setIsSaving(true);
    await supabase.from('projects').update({ saved_assets: icons }).eq('id', projectId);
    setIsSaving(false);
  };

  const toggleIcon = (iconName: string) => {
    const next = savedIcons.includes(iconName)
      ? savedIcons.filter(i => i !== iconName)
      : [...savedIcons, iconName];
    setSavedIcons(next);
    saveAssets(next);
  };

  const searchIcons = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://api.iconify.design/search?query=${searchQuery}&limit=60`);
      const data = await res.json();
      setSearchResults(data?.icons || []);
    } catch { setSearchResults([]); }
    finally { setIsSearching(false); }
  };

  if (isLoading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--accent-red)' }}>CHARGEMENT_RESSOURCES...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h2 style={{ color: 'var(--text-primary)', margin: 0 }}><Txt>Ressources visuelles</Txt></h2>
        {isSaving && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SYNC...</span>}
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflow: 'hidden' }}>

        {/* FAVORIS */}
        <div className="panel border-thin" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', overflow: 'hidden' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <Txt>Icônes sauvegardées</Txt> ({savedIcons.length})
          </h3>
          {savedIcons.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>
              AUCUNE ICÔNE SAUVEGARDÉE<br />
              <span style={{ opacity: 0.5, marginTop: '0.5rem', display: 'block' }}>Recherchez et ajoutez des icônes ci-contre</span>
            </div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '0.5rem' }}>
                {savedIcons.map(iconName => (
                  <div
                    key={iconName}
                    style={{ aspectRatio: '1/1', background: '#fff', border: '2px solid var(--accent-red)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', padding: '4px' }}
                    title={iconName}
                    onClick={() => toggleIcon(iconName)}
                  >
                    <img src={`https://api.iconify.design/${iconName}.svg`} alt={iconName} style={{ width: '65%', height: '65%', objectFit: 'contain' }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleIcon(iconName); }}
                      style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--accent-red)', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >×</button>
                    <span style={{ fontSize: '0.5rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center', marginTop: '2px' }}>{iconName.split(':')[1] || iconName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RECHERCHE */}
        <div className="panel border-thin" style={{ width: '400px', display: 'flex', flexDirection: 'column', padding: '1rem', overflow: 'hidden' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <Txt>Rechercher des icônes</Txt>
          </h3>
          <form onSubmit={searchIcons} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input type="text" className="tech-input flex-1" placeholder="skull, fire, sword..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <button type="submit" className="btn-confirm" style={{ padding: '0 1rem' }}>{isSearching ? '...' : 'GO'}</button>
          </form>
          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', padding: '0.5rem' }}>
            {searchResults.length === 0 && !isSearching ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center', fontSize: '0.8rem' }}>
                TAPEZ UN MOT CLÉ EN ANGLAIS
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {searchResults.map(iconName => {
                  const isSaved = savedIcons.includes(iconName);
                  return (
                    <div
                      key={iconName}
                      style={{ aspectRatio: '1/1', background: '#fff', border: `2px solid ${isSaved ? 'var(--accent-red)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', transition: 'all 0.1s' }}
                      title={iconName}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-red)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = isSaved ? 'var(--accent-red)' : 'var(--border)'; e.currentTarget.style.transform = 'scale(1)'; }}
                      onClick={() => toggleIcon(iconName)}
                    >
                      <img src={`https://api.iconify.design/${iconName}.svg`} alt={iconName} style={{ width: '65%', height: '65%', objectFit: 'contain', pointerEvents: 'none' }} />
                      <div style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', background: isSaved ? 'var(--accent-red)' : 'var(--bg-primary)', border: '1px solid var(--border)', color: isSaved ? '#fff' : 'var(--text-secondary)', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSaved ? '✓' : '+'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
