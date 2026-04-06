export default function Card({ data }: { data: any }) {
  return (
    <div className="w-64 h-80 border-2 border-black rounded-xl p-4 m-4 flex flex-col bg-white shadow-md relative">
      <h2 className="text-lg font-bold uppercase">{data.name || "Sans nom"}</h2>
      
      {/* Emplacement pour l'illustration */}
      <div className="flex-grow bg-gray-200 my-2 border border-gray-300 rounded">
        {data.image_url && <img src={data.image_url} alt={data.name} className="object-cover w-full h-full" />}
      </div>
      
      {/* Zone de statistiques */}
      <div className="flex justify-between font-mono text-sm bg-gray-100 p-2 rounded">
        <span>ATK: {data.stats?.atk || 0}</span>
        <span>DEF: {data.stats?.def || 0}</span>
      </div>
    </div>
  );
}