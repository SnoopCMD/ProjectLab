import { supabase } from '../lib/supabase';
import CreateProjectCard from '../components/CreateProjectCard';
import Link from 'next/link';

export default async function Home() {
  // Récupération en temps réel
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <main className="main-layout border-thin">
      <header className="home-header panel">
        <h1>PROJEcT:LAB // CONSOLE</h1>
        <p className="subtitle">ÉTAT DU SYSTÈME: OPÉRATIONNEL</p>
      </header>
      
      <div className="project-grid">
        <CreateProjectCard />

        {projects?.map((project) => (
          <Link href={`/projet/${project.slug}`} key={project.id} className="project-panel panel border-thin flex-between">
            <div className="project-info">
              <h2>{project.name}</h2>
              <p className="timestamp">INITIALISÉ: {new Date(project.created_at).toLocaleDateString()}</p>
            </div>
            <div className="card-count panel">
              {project.card_count}_UNITÉS
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}