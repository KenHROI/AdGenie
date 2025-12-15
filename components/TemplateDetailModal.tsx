import React, { useState, useEffect } from 'react';
import { AdTemplate } from '../types';

interface TemplateDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    template: AdTemplate | null;
    isSelected?: boolean;
    onToggleSelect?: (id: string) => void;
    onUpdateTemplate?: (updated: AdTemplate) => void;
}

const TemplateDetailModal: React.FC<TemplateDetailModalProps> = ({
    isOpen,
    onClose,
    template,
    isSelected,
    onToggleSelect,
    onUpdateTemplate
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editTags, setEditTags] = useState("");

    useEffect(() => {
        if (template) {
            setEditTags(template.tags.join(", "));
        }
    }, [template]);

    if (!isOpen || !template) return null;

    const handleSaveTags = () => {
        if (!onUpdateTemplate) return;
        const newTags = editTags.split(',').map(t => t.trim()).filter(Boolean);
        onUpdateTemplate({ ...template, tags: newTags });
        setIsEditing(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col md:flex-row max-h-[90vh] animate-scale-in">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors backdrop-blur-md"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                {/* Left: Image */}
                <div className="w-full md:w-2/3 bg-gray-100 flex items-center justify-center p-8 relative group">
                    <img
                        src={template.imageUrl}
                        alt={template.name}
                        className="max-h-full max-w-full object-contain shadow-lg rounded-lg"
                    />
                    <div className="absolute bottom-4 left-4 right-4 text-center text-xs text-gray-400 opacity-60">
                        ID: {template.id}
                    </div>
                </div>

                {/* Right: Metadata */}
                <div className="w-full md:w-1/3 p-8 flex flex-col bg-white overflow-y-auto custom-scrollbar">
                    <div className="flex-1">
                        <div className="mb-6">
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">{template.name}</h3>
                            <p className="text-gray-600 leading-relaxed text-sm">{template.description}</p>
                        </div>

                        <div className="mb-8">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tags & Attributes</h4>
                                {onUpdateTemplate && !isEditing && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="text-xs text-indigo-600 font-bold hover:underline"
                                    >
                                        Edit Tags
                                    </button>
                                )}
                            </div>

                            {isEditing ? (
                                <div className="flex flex-col gap-2">
                                    <textarea
                                        value={editTags}
                                        onChange={(e) => setEditTags(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="meta, instagram, sale..."
                                        rows={3}
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-900"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveTags}
                                            className="px-3 py-1 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {template.tags && template.tags.map(tag => (
                                        <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full border border-gray-200">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action - Only show if selection handler provided */}
                    {onToggleSelect && (
                        <div className="pt-6 border-t border-gray-100">
                            <button
                                onClick={() => onToggleSelect(template.id)}
                                className={`w-full py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-md ${isSelected
                                    ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                                    : 'bg-black text-white hover:bg-gray-800'
                                    }`}
                            >
                                {isSelected ? (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        <span>Remove from Selection</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        <span>Select This Template</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TemplateDetailModal;
