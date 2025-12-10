
import React, { useState, useRef } from 'react';
import { AdTemplate } from '../types';
import { useNotification } from '../context/NotificationContext';
import { describeImageStyle } from '../services/geminiService';

interface SettingsProps {
  templates: AdTemplate[];
  onAddTemplate: (template: AdTemplate) => void;
  onRemoveTemplate: (id: string) => void;
}

// Utility to resize and compress images before processing
const optimizeImage = (file: File, maxWidth = 1024, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxWidth) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxWidth) / height);
                        height = maxWidth;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error("Could not get canvas context"));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

const Settings: React.FC<SettingsProps> = ({ templates, onAddTemplate, onRemoveTemplate }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progressState, setProgressState] = useState({ current: 0, total: 0 });
  const { showToast } = useNotification();
  
  // Use a ref to track mounted state to avoid setting state after unmount during long processes
  const isMounted = useRef(true);
  React.useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const totalFiles = files.length;
    setProgressState({ current: 0, total: totalFiles });

    const fileArray: File[] = Array.from(files);
    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;

    // Concurrency Limit (max parallel requests)
    const CONCURRENCY_LIMIT = 3;
    let index = 0;

    const processNext = async (): Promise<void> => {
        if (index >= fileArray.length) return;
        
        const currentIndex = index++;
        const file = fileArray[currentIndex];

        try {
            if (file.size > 20 * 1024 * 1024) { // 20MB Hard limit before optimization check
                throw new Error("File too large (>20MB)");
            }

            // 1. Optimize Image (Client-side resize)
            const base64 = await optimizeImage(file);

            // 2. Analyze with AI
            const aiData = await describeImageStyle(base64);

            const newTemplate: AdTemplate = {
                id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                imageUrl: base64,
                name: aiData.name || "Custom Upload",
                description: aiData.description || "User uploaded template",
                tags: aiData.tags || ["custom"],
            };

            if (isMounted.current) {
                onAddTemplate(newTemplate);
                successCount++;
            }

        } catch (error: any) {
            console.error(`Error processing ${file.name}:`, error);
            failCount++;
            // Optional: Show specific error for single file failures if needed, 
            // but for bulk, usually better to summarize at end or log.
        } finally {
            processedCount++;
            if (isMounted.current) {
                setProgressState(prev => ({ ...prev, current: processedCount }));
            }
            // Recursive call to process next item in queue
            await processNext();
        }
    };

    // Initialize worker pool
    const workers = [];
    const initialPoolSize = Math.min(totalFiles, CONCURRENCY_LIMIT);
    
    for (let i = 0; i < initialPoolSize; i++) {
        workers.push(processNext());
    }

    await Promise.all(workers);

    if (isMounted.current) {
        setIsUploading(false);
        setProgressState({ current: 0, total: 0 });

        if (successCount > 0) {
            showToast(`Successfully added ${successCount} images to library`, "success");
        }
        if (failCount > 0) {
            showToast(`Failed to process ${failCount} images`, "error");
        }
    }
    
    // Reset input
    e.target.value = '';
  };

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
        <div className="flex-shrink-0 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h2>
            <p className="text-sm text-gray-500 mt-1">Manage your application preferences and assets.</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-12">
            
            {/* Library Management Section */}
            <section className="mb-12">
                <div className="flex justify-between items-end mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Default Swipe File Library</h3>
                        <p className="text-sm text-gray-500">
                            These templates are available when "Default" is selected in your campaign.
                            Upload images here to expand your permanent library.
                        </p>
                    </div>
                    <span className="text-xs font-bold bg-gray-100 px-3 py-1 rounded-full text-gray-600">
                        {templates.length} Assets
                    </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {/* Upload Card */}
                    <label className={`relative rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-white hover:border-black transition-all cursor-pointer flex flex-col items-center justify-center aspect-square group ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                         {isUploading ? (
                             <div className="flex flex-col items-center w-full px-4 text-center">
                                 <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-2 mx-auto"></div>
                                 <span className="text-[10px] text-gray-400 font-mono block">
                                    {progressState.current} / {progressState.total}
                                 </span>
                                 <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                                     <div 
                                        className="bg-black h-1 rounded-full transition-all duration-300" 
                                        style={{ width: `${(progressState.current / Math.max(progressState.total, 1)) * 100}%` }}
                                     ></div>
                                 </div>
                             </div>
                         ) : (
                            <>
                                <span className="text-3xl text-gray-300 group-hover:text-black transition-colors mb-2">+</span>
                                <span className="text-xs font-bold text-gray-400 group-hover:text-black">Bulk Upload</span>
                            </>
                         )}
                         <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={isUploading} />
                    </label>

                    {/* Existing Templates */}
                    {templates.map(t => (
                        <div key={t.id} className="relative rounded-2xl overflow-hidden border border-gray-100 bg-white group aspect-square">
                            <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                                <p className="text-white text-xs font-bold truncate">{t.name}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {t.tags.slice(0,2).map(tag => (
                                        <span key={tag} className="text-[9px] bg-white/20 text-white px-1.5 rounded-sm">{tag}</span>
                                    ))}
                                </div>
                            </div>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onRemoveTemplate(t.id); }}
                                className="absolute top-2 right-2 bg-white/90 text-red-500 p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all shadow-sm z-10"
                                title="Delete Template"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* API Settings Section */}
            <section className="mb-12 border-t border-gray-100 pt-8 opacity-60">
                <h3 className="text-lg font-bold text-gray-900 mb-4">API Configuration</h3>
                 <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                     <p className="text-sm text-gray-500 mb-4">API keys are managed securely via environment variables or session storage.</p>
                     <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        System Active
                     </div>
                 </div>
            </section>
        </div>
    </div>
  );
};

export default Settings;
