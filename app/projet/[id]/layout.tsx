"use client";

import { useState, use } from 'react'; // <-- Ajout de 'use'
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Composant d'habillage Brutaliste
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

export default function ProjectLayout({ 
  children, 
  params 
}: { 
  children: React.ReactNode, 
  params: Promise<{ id: string }> // <-- Next.js 15 demande une Promise ici
}) {
  // Déballage de la promesse pour récupérer l'ID
  const resolvedParams = use(params); 
  
  const [isNavOpen, setIsNavOpen] = useState(false); 
  const pathname = usePathname();

  // Les chemins sont mis à jour (Gabarits = racine du projet)
  const tabs = [
    { id: 'gabarits', label: 'GABARITS', path: `/projet/${resolvedParams.id}` },
    { id: 'donnees', label: 'DONNÉES', path: `/projet/${resolvedParams.id}/donnees` },
    { id: 'cartes', label: 'CARTES', path: `/projet/${resolvedParams.id}/cartes` }
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: 'var(--bg-primary)' }}>
      
      {/* SIDEBAR LATÉRALE */}
      <div style={{
        width: isNavOpen ? '250px' : '40px',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        backgroundColor: 'var(--bg-secondary)',
        zIndex: 100
      }}>
        
        {/* BOUTON BASCULE */}
        <div 
          onClick={() => setIsNavOpen(!isNavOpen)}
          style={{
            height: '40px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', cursor: 'pointer', color: 'var(--text-primary)', transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
        >
          {isNavOpen ? '< FERMER' : '☰'}
        </div>

        {/* CONTENU DU MENU */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: isNavOpen ? '1rem' : '1rem 0', gap: '1rem', overflow: 'hidden' }}>
          
          {isNavOpen && (
            <div style={{ marginBottom: '1rem', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}><Txt>Projet actif</Txt></div>
              <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '1.2rem' }}>
                <Txt>{resolvedParams.id.replace(/-/g, ' ')}</Txt>
              </div>
            </div>
          )}

          {tabs.map(tab => {
            // Logique stricte : Si c'est gabarits, le chemin doit être EXACTEMENT la racine
            // Sinon, les autres onglets apparaîtraient tous allumés en même temps
            const isActive = tab.id === 'gabarits' 
              ? pathname === tab.path 
              : pathname.includes(tab.path);

            return (
              <Link href={tab.path} key={tab.id} style={{ textDecoration: 'none' }}>
                <div style={{
                  padding: isNavOpen ? '0.5rem' : '1rem 0',
                  textAlign: isNavOpen ? 'left' : 'center',
                  color: isActive ? 'var(--accent-red)' : 'var(--text-secondary)',
                  borderLeft: isActive && isNavOpen ? '2px solid var(--accent-red)' : '2px solid transparent',
                  backgroundColor: isActive && isNavOpen ? 'color-mix(in srgb, var(--accent-red) 10%, transparent)' : 'transparent',
                  whiteSpace: 'nowrap', overflow: 'hidden', transition: 'all 0.2s',
                  writingMode: isNavOpen ? 'horizontal-tb' : 'vertical-rl',
                  transform: isNavOpen ? 'none' : 'rotate(180deg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Txt vertical={!isNavOpen}>{tab.label}</Txt>
                </div>
              </Link>
            );
          })}
        </div>

        {/* BOUTON QUITTER */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{
            padding: isNavOpen ? '1rem' : '1rem 0', 
            borderTop: '1px solid var(--border)', color: 'var(--text-secondary)', 
            textAlign: 'center', cursor: 'pointer', whiteSpace: 'nowrap',
            writingMode: isNavOpen ? 'horizontal-tb' : 'vertical-rl',
            transform: isNavOpen ? 'none' : 'rotate(180deg)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
             <Txt vertical={!isNavOpen}>{isNavOpen ? 'X_QUITTER' : 'X'}</Txt>
          </div>
        </Link>
      </div>

      {/* CONTENU PRINCIPAL (LES PAGES) */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '1rem', backgroundColor: 'var(--bg-primary)' }}>
         {children}
      </div>
      
    </div>
  );
}