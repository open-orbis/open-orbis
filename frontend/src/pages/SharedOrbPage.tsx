import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useOrbStore } from '../stores/orbStore';
import OrbGraph3D from '../components/graph/OrbGraph3D';

export default function SharedOrbPage() {
  const { orbId } = useParams<{ orbId: string }>();
  const [searchParams] = useSearchParams();
  const filterToken = searchParams.get('filter_token') || undefined;
  const { data, loading, error, fetchPublicOrb } = useOrbStore();
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    if (orbId) fetchPublicOrb(orbId, filterToken);
  }, [orbId, filterToken, fetchPublicOrb]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Orb not found</h1>
          <p className="text-gray-400">This orb doesn't exist or is private.</p>
        </div>
      </div>
    );
  }

  const personName = data.person.name as string || orbId;

  return (
    <div className="min-h-screen bg-black relative">
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4">
        <div className="text-white">
          <span className="text-lg font-semibold">{personName}</span>
          <span className="text-gray-500 text-sm ml-3">{data.nodes.length} nodes</span>
          {filterToken && (
            <span className="text-amber-400/60 text-xs ml-3">Filtered view</span>
          )}
        </div>
        <a
          href="/"
          className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
        >
          Create your own Orb
        </a>
      </div>

      <OrbGraph3D
        data={data}
        width={dimensions.width}
        height={dimensions.height}
      />
    </div>
  );
}
