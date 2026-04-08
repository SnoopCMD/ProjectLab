"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase'; // Importez votre client

export default function CreateProjectCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || loading) return;

    setLoading(true);
    const uniqueSuffix = Math.random().toString(36).substring(2, 6);
    const slug = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${uniqueSuffix}`;

    // Insertion dans Supabase
    const { error } = await supabase
      .from('projects')
      .insert([{ name: projectName, slug: slug }]);

    if (error) {
      alert("ERREUR_SYSTÈME: " + error.message);
      setLoading(false);
      return;
    }

    setIsOpen(false);
    router.push(`/projet/${slug}`);
  };

  return (
    <>
      {/* Bouton pour ouvrir la pop-up */}
      <button 
        onClick={() => setIsOpen(true)}
        className="create-project-panel panel border-thin flex-center"
      >
        <span className="plus">+</span>
        <span className="label">INITIALISER NOUVEAU PROJET</span>
      </button>

      {/* La Pop-up (Modal) */}
      {isOpen && (
        <div className="modal-overlay flex-center">
          <div className="modal-content panel border-thin">
            <h3 className="modal-title">NOUVELLE_ENTRÉE_SYSTÈME</h3>
            <p className="subtitle mb-4">DÉFINIR L'IDENTIFIANT DU PROJET :</p>
            
            <form onSubmit={handleCreate}>
              <input 
                type="text" 
                className="tech-input mb-4" 
                placeholder="EX: PROJECT_SET_00"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                autoFocus
              />
              
              <div className="flex-between" style={{ gap: '1rem' }}>
                <button type="button" className="btn-cancel" onClick={() => setIsOpen(false)}>
                  [ ANNULER ]
                </button>
                <button type="submit" className="btn-confirm">
                  [ CONFIRMER ]
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}