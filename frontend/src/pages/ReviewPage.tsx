import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { confirmCV, type ExtractedData } from '../api/cv';
import { NODE_TYPE_LABELS } from '../components/graph/NodeColors';

export default function ReviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const extracted = (location.state as { extracted: ExtractedData })?.extracted;
  const [nodes, setNodes] = useState(extracted?.nodes || []);
  const [confirming, setConfirming] = useState(false);

  if (!extracted) {
    navigate('/create');
    return null;
  }

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await confirmCV(nodes, undefined, extracted?.cv_owner_name);
      navigate('/orb');
    } catch {
      setConfirming(false);
    }
  };

  const removeNode = (index: number) => {
    setNodes(nodes.filter((_, i) => i !== index));
  };

  const updateProperty = (nodeIndex: number, key: string, value: string) => {
    const updated = [...nodes];
    updated[nodeIndex] = {
      ...updated[nodeIndex],
      properties: { ...updated[nodeIndex].properties, [key]: value },
    };
    setNodes(updated);
  };

  // Group nodes by type
  const grouped = nodes.reduce<Record<string, typeof nodes>>((acc, node, idx) => {
    const type = node.node_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push({ ...node, _index: idx } as any);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-white py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Double-check what we read from your CV
        </h1>
        <p className="text-gray-500 mb-8">
          Edit, remove, or confirm each entry before creating your orb.
        </p>

        {Object.entries(grouped).map(([type, groupNodes]) => (
          <div key={type} className="mb-8">
            <h2 className="text-lg font-semibold text-purple-600 uppercase tracking-wide mb-3">
              {NODE_TYPE_LABELS[type] || type}
            </h2>
            <div className="space-y-4">
              {groupNodes.map((node: any) => (
                <div key={node._index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm text-gray-400">#{node._index + 1}</span>
                    <button
                      onClick={() => removeNode(node._index)}
                      className="text-red-400 hover:text-red-600 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(node.properties as Record<string, unknown>).map(([key, value]) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {key.replace(/_/g, ' ')}
                        </label>
                        <input
                          type="text"
                          value={String(value || '')}
                          onChange={(e) => updateProperty(node._index, key, e.target.value)}
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex gap-4 mt-8">
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {confirming ? 'Creating your orb...' : 'Confirm & Create My Orb'}
          </button>
          <button
            onClick={() => navigate('/create')}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
