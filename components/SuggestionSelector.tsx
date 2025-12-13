
import React, { useState, useEffect } from 'react';
import { AdTemplate } from '../types';
import TemplateDetailModal from './TemplateDetailModal';

interface SuggestionSelectorProps {
  recommendedIds: string[];
  onBack: () => void;
  onNext: (selectedTemplates: AdTemplate[], customSeeds: string[], variations: number) => void;
  availableTemplates: AdTemplate[];
}

const SuggestionSelector: React.FC<SuggestionSelectorProps> = ({ recommendedIds, onBack, onNext, availableTemplates }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(recommendedIds));
  const [customSeeds, setCustomSeeds] = useState<string[]>([]);
  const [variations, setVariations] = useState(2);
  const [viewedTemplate, setViewedTemplate] = useState<AdTemplate | null>(null);

  useEffect(() => {
    setSelectedIds(new Set(recommendedIds));
  }, [recommendedIds]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setCustomSeeds(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const removeCustomSeed = (index: number) => {
    setCustomSeeds(prev => prev.filter((_, i) => i !== index));
  }

  const handleContinue = () => {
    const selectedTemplates = availableTemplates.filter(t => selectedIds.has(t.id));
    onNext(selectedTemplates, customSeeds, variations);
  };

  return (
    <div className="h-full flex flex-col p-8 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Select Layouts</h2>
          <p className="text-gray-500 text-sm mt-1">Choose the visual structures for your campaign.</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-100">
            <span className="text-xs font-semibold px-3 text-gray-500 uppercase tracking-wide">Variations</span>
            {[1, 2, 3, 4].map(num => (
              <button
                key={num}
                onClick={() => setVariations(num)}
                className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold transition-all ${variations === num
                  ? 'bg-white shadow-sm border border-gray-100 text-black'
                  : 'text-gray-400 hover:text-gray-600'
                  }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-10 custom-scrollbar">
        {/* Templates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {availableTemplates.map((template) => {
            const isSelected = selectedIds.has(template.id);
            const isRecommended = recommendedIds.includes(template.id);
            return (
              <div
                key={template.id}
                onClick={() => setViewedTemplate(template)}
                className={`group relative cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 aspect-square border border-gray-100 bg-gray-50 ${isSelected
                  ? 'ring-2 ring-black shadow-xl scale-[1.02]'
                  : 'hover:shadow-lg hover:scale-[1.01]'
                  }`}
              >
                <img
                  src={template.imageUrl}
                  alt={template.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Preview';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-5 flex flex-col justify-end">
                  <p className="text-white font-bold text-sm">{template.name}</p>
                  <p className="text-gray-300 text-xs truncate mt-1">{template.description}</p>
                </div>
                {/* Selection Checkbox - always clickable */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(template.id);
                  }}
                  className={`absolute top-3 right-3 p-2 rounded-full shadow-sm transition-all z-10 ${isSelected
                    ? 'bg-black text-white scale-100'
                    : 'bg-white text-gray-300 hover:text-black hover:scale-110 opacity-0 group-hover:opacity-100'
                    }`}
                >
                  {isSelected ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                  )}
                </button>

                {isRecommended && !isSelected && (
                  <span className="absolute top-4 right-4 bg-white text-black text-[10px] font-bold px-3 py-1 rounded-full shadow-sm border border-gray-100">
                    Best Match
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Custom Uploads */}
        <div>
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Your References</h3>
          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
            {customSeeds.map((seed, idx) => (
              <div key={idx} className="relative rounded-xl overflow-hidden group aspect-square border border-gray-100 bg-gray-50">
                <img src={seed} alt={`Custom Seed ${idx}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeCustomSeed(idx)}
                  className="absolute top-1 right-1 bg-white text-gray-900 rounded-full w-5 h-5 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
                >
                  &times;
                </button>
              </div>
            ))}

            <label className="border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-black hover:bg-gray-50 transition-all aspect-square group">
              <span className="text-2xl text-gray-300 group-hover:text-black transition-colors">+</span>
              <input type="file" accept="image/*" onChange={handleCustomUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="pt-6 mt-6 border-t border-gray-100 flex justify-end items-center space-x-6 flex-shrink-0">
        <div className="text-right">
          <span className="block text-sm font-bold text-gray-900">{(selectedIds.size + customSeeds.length) * variations} assets</span>
          <span className="block text-xs text-gray-400">Total Generation</span>
        </div>
        <button
          onClick={handleContinue}
          disabled={selectedIds.size === 0 && customSeeds.length === 0}
          className="bg-black text-white hover:bg-gray-800 font-semibold py-3 px-8 rounded-xl shadow-lg shadow-gray-200 transform transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate &rarr;
        </button>
      </div>


      <TemplateDetailModal
        isOpen={!!viewedTemplate}
        template={viewedTemplate}
        onClose={() => setViewedTemplate(null)}
        isSelected={viewedTemplate ? selectedIds.has(viewedTemplate.id) : false}
        onToggleSelect={(id) => {
          toggleSelection(id);
          // Optionally close the modal, or keep it open. Keeping it open is usually better for "shopping" behavior.
        }}
      />
    </div >
  );
};

export default SuggestionSelector;
