import React, { useEffect, useState, useRef } from 'react';
import { BrandProfile, AdTemplate, GeneratedImage } from '../types';
import { CONFIG } from '../config';
import { generateAdVariation, extractAdComponents } from '../services/geminiService';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import JSZip from 'jszip';
import GalleryModal from './GalleryModal';

interface ImageGeneratorProps {
    brandData: BrandProfile;
    selectedTemplates: AdTemplate[];
    customSeeds: string[];
    variationsPerSeed: number;
    onBack: () => void;
}

const ImageGenerator: React.FC<ImageGeneratorProps> = ({
    brandData,
    selectedTemplates,
    customSeeds,
    variationsPerSeed,
    onBack,
}) => {
    const { settings } = useSettings();
    const hasKey = !!(settings.apiKeys.google || settings.apiKeys.kie || settings.apiKeys.openRouter); // Simple check for now

    const [isGenerating, setIsGenerating] = useState(false);
    const [results, setResults] = useState<GeneratedImage[]>([]);
    const [progress, setProgress] = useState(0);
    const [currentAction, setCurrentAction] = useState('Initializing...');

    // Design Director State
    const [adComponents, setAdComponents] = useState<{ headline: string; subheadline: string; cta: string } | null>(null);

    // Gallery Modal State
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);

    const { showToast } = useNotification();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        checkKey();
    }, []);

    useEffect(() => {
        if (results.length > 0 && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [results]);

    // Simplified check - rely on settings context
    const checkKey = async () => {
        if (hasKey && !isGenerating && results.length === 0) {
            startGeneration();
        }
    };



    const startGeneration = async () => {
        setIsGenerating(true);
        setResults([]);
        setProgress(0);
        showToast("Starting Design Director...", 'info');

        // Step 1: Design Director
        let components = adComponents;
        if (!components) {
            setCurrentAction("Design Director: Analyzing script...");
            try {
                components = await extractAdComponents(brandData.adCopy);
                setAdComponents(components);
            } catch (e) {
                console.error("Design Director failed", e);
                // Fallback objects are handled in service, but we can set defaults here too if needed
            }
        }

        let completed = 0;
        const totalTasks = (selectedTemplates.length + customSeeds.length) * variationsPerSeed;

        const processSeed = async (seedUrl: string, sourceName: string, sourceId?: string) => {
            for (let i = 0; i < variationsPerSeed; i++) {
                setCurrentAction(`Variation ${i + 1} for ${sourceName}...`);
                try {
                    let base64 = seedUrl;
                    if (seedUrl.startsWith('http')) {
                        // Attempt to fetch, handles CORS if server allows, otherwise might fail.
                        // For Google Drive thumbnails, it's often fine.
                        try {
                            const resp = await fetch(seedUrl);
                            const blob = await resp.blob();
                            base64 = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            });
                        } catch (e) {
                            console.warn("Could not fetch image for base64 conversion, trying direct URL", e);
                        }
                    }

                    const generatedBase64 = await generateAdVariation(
                        base64,
                        brandData,
                        sourceName,
                        undefined, // No custom prompt for initial run
                        components || undefined
                    );

                    if (generatedBase64) {
                        setResults(prev => [...prev, {
                            id: Math.random().toString(36).substr(2, 9),
                            base64: generatedBase64,
                            promptUsed: `Reskin of ${sourceName}`, // Initial prompt description
                            seedTemplateId: sourceId,
                            referenceUrl: seedUrl,
                            timestamp: Date.now()
                        }]);
                    }
                } catch (err: any) {
                    console.error(`Failed to generate`, err);
                    if (err.message && err.message.includes("Requested entity was not found")) {
                        showToast("API Key expired or invalid. Please reconnect.", 'error');
                        showToast("API Key expired or invalid. Please check settings.", 'error');
                        setIsGenerating(false);
                        return;
                    } else if (err.message?.includes("Quota")) {
                        showToast("Quota exceeded. Slowing down...", 'error');
                    }
                } finally {
                    completed++;
                    setProgress((completed / totalTasks) * 100);
                }
            }
        };

        // Process templates
        for (const template of selectedTemplates) {
            if (!hasKey) break;
            await processSeed(template.imageUrl, template.name, template.id);
        }

        // Process custom seeds
        for (let i = 0; i < customSeeds.length; i++) {
            if (!hasKey) break;
            await processSeed(customSeeds[i], `Custom Seed ${i + 1} `);
        }

        setIsGenerating(false);
        setCurrentAction('Done!');
        if (completed > 0) {
            showToast("Generation workflow complete!", 'success');
        }
    };



    const handleRespin = async (img: GeneratedImage, newPrompt: string) => {
        if (!img.referenceUrl) return;

        setIsGenerating(true);
        showToast("Respinning variation...", 'info');

        try {
            // Fetch original ref again
            let base64 = img.referenceUrl;
            if (img.referenceUrl.startsWith('http')) {
                const resp = await fetch(img.referenceUrl);
                const blob = await resp.blob();
                base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            }

            const generatedBase64 = await generateAdVariation(
                base64,
                brandData,
                img.promptUsed || "Respin",
                newPrompt,
                adComponents || undefined
            );

            if (generatedBase64) {
                // Replace the old image with new one, or add as new? 
                // UX: Users usually want to refine, so let's update the existing card but keep history?
                // For now, let's append as a new variation right next to it or just replace.
                // Let's UPDATE the local state for that ID to show the new result.
                setResults(prev => prev.map(item =>
                    item.id === img.id
                        ? { ...item, base64: generatedBase64, promptUsed: newPrompt, timestamp: Date.now() }
                        : item
                ));
                showToast("Variation updated!", 'success');
            }
        } catch (e) {
            console.error("Respin failed", e);
            showToast("Failed to respin", 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const downloadImage = (base64: string, id: string) => {
        const link = document.createElement('a');
        link.href = base64;
        link.download = `ad - genie - ${id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("Image downloading...", 'success');
    };

    const handleDownloadAll = async () => {
        if (results.length === 0) return;

        showToast("Preparing ZIP file...", 'info');
        const zip = new JSZip();

        results.forEach((img, i) => {
            // Remove data:image/png;base64, prefix
            const data = img.base64.split(',')[1];
            zip.file(`ad - genie - variation - ${i + 1} -${img.id}.png`, data, { base64: true });
        });

        try {
            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `ad - genie - batch - ${Date.now()}.zip`;
            link.click();
            showToast("Batch download started!", 'success');
        } catch (err) {
            console.error("ZIP Error:", err);
            showToast("Failed to create ZIP file", 'error');
        }
    };

    if (!hasKey) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-white">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-3xl mb-6 shadow-sm">🔑</div>
                <h2 className="text-xl font-bold mb-2 text-gray-900">Missing Credentials</h2>
                <p className="text-gray-500 max-w-sm mb-8">Please configure your API keys in the Settings menu to continue.</p>
                <div className="flex gap-4">
                    <button onClick={onBack} className="bg-black text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-lg">Back to Setup</button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white overflow-hidden relative">
            {/* Clean Banner Area */}
            <div className="flex-shrink-0 py-6 px-8 border-b border-gray-100 bg-white flex items-center justify-between z-10">
                <div>
                    <div className="flex items-center space-x-2 text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span>Nano Banana Pro Active</span>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900">
                        Workspace
                    </h1>
                </div>
                <div className="flex space-x-2">
                    {results.length > 0 && !isGenerating && (
                        <button
                            onClick={handleDownloadAll}
                            className="flex items-center space-x-2 bg-gray-50 text-gray-900 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            <span>Download All (ZIP)</span>
                        </button>
                    )}
                    <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm font-medium px-4 py-2">
                        Back
                    </button>
                </div>
            </div>

            {/* Chat / Feed Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar bg-white">

                {/* User Message */}
                <div className="flex space-x-5 animate-fade-in-up">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" className="w-12 h-12 rounded-full bg-gray-50 flex-shrink-0 border border-gray-100" />
                    <div className="max-w-3xl">
                        <div className="flex items-baseline space-x-3 mb-2">
                            <span className="font-bold text-gray-900">You</span>
                            <span className="text-xs text-gray-400">Just now</span>
                        </div>
                        <div className="bg-gray-50 p-6 rounded-2xl rounded-tl-none text-gray-700 text-sm leading-relaxed border border-gray-100 shadow-sm">
                            <p className="font-semibold text-gray-900 mb-2">Ad Brief:</p>
                            <p className="mb-4 text-base">"{brandData.adCopy}"</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-3 py-1 bg-white rounded-lg border border-gray-200 text-xs font-medium text-gray-500">{brandData.brandVoice || 'Default Voice'}</span>
                                {brandData.colors.length > 0 && (
                                    <span className="px-3 py-1 bg-white rounded-lg border border-gray-200 text-xs font-medium text-gray-500 flex items-center gap-2">
                                        Palette: <div className="flex -space-x-1">{brandData.colors.map(c => <div key={c} className="w-3 h-3 rounded-full ring-2 ring-white" style={{ backgroundColor: c }}></div>)}</div>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI Response */}
                <div className="flex space-x-5 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <div className="w-12 h-12 rounded-xl bg-black text-white flex items-center justify-center text-2xl flex-shrink-0 shadow-lg shadow-gray-200">🧞‍♂️</div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline space-x-3 mb-2">
                            <span className="font-bold text-gray-900">Image Ad Genie</span>
                            <span className="text-xs text-gray-400">AI Generated</span>
                        </div>

                        <div className="mb-6 text-sm text-gray-500">
                            {isGenerating ? (
                                <div className="flex items-center space-x-3 p-2">
                                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
                                    <span className="font-medium text-indigo-600">{currentAction}</span>
                                    <span className="text-gray-300">|</span>
                                    <span className="text-gray-400">{Math.round(progress)}% complete</span>
                                </div>
                            ) : (
                                <p>Here are your high-fidelity variations. Click any image to download.</p>
                            )}
                        </div>

                        {/* Comparison Grid */}
                        <div className="grid grid-cols-1 gap-12">
                            {results.map((img, index) => (
                                <div key={img.id} className="bg-gray-50 rounded-2xl p-6 border border-gray-200 animate-fade-in">
                                    <div className="flex flex-col md:flex-row gap-6 items-start">
                                        {/* Reference - Left */}
                                        <div className="w-full md:w-1/3 flex flex-col gap-2">
                                            <div className="relative aspect-auto rounded-lg overflow-hidden border border-gray-300 shadow-sm bg-white">
                                                <img src={img.referenceUrl} alt="Reference" className="w-full h-auto object-cover opacity-80" />
                                                <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded uppercase font-bold tracking-wider">
                                                    Reference
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-500 font-medium text-center">{img.promptUsed}</p>
                                        </div>

                                        {/* Result - Right */}
                                        <div className="w-full md:w-2/3 flex flex-col gap-4">
                                            <div
                                                className="relative aspect-auto rounded-xl overflow-hidden shadow-lg border border-indigo-100 group cursor-zoom-in bg-white"
                                                onClick={() => {
                                                    setGalleryIndex(index);
                                                    setIsGalleryOpen(true);
                                                }}
                                            >
                                                <img src={img.base64} alt="Result" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                    <span className="opacity-0 group-hover:opacity-100 bg-white/90 px-4 py-2 rounded-full text-xs font-bold shadow-sm transition-opacity">
                                                        Click to Expand
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Bar */}
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="text"
                                                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    placeholder="Edit prompt to refine..."
                                                    defaultValue="Strictly match reference layout. Use brand colors."
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            handleRespin(img, e.currentTarget.value);
                                                        }
                                                    }}
                                                />
                                                <button
                                                    onClick={(e) => {
                                                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                                        handleRespin(img, input.value);
                                                    }}
                                                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                                    disabled={isGenerating}
                                                >
                                                    Respin
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        downloadImage(img.base64, img.id);
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-black hover:bg-gray-200 rounded-lg transition-colors"
                                                    title="Download"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {isGenerating && progress < 100 && (
                                <div className="p-12 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-4 bg-gray-50/50">
                                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-gray-400 font-medium text-sm animate-pulse">{currentAction}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div ref={messagesEndRef} />
            </div>

            <GalleryModal
                isOpen={isGalleryOpen}
                onClose={() => setIsGalleryOpen(false)}
                images={results}
                selectedIndex={galleryIndex}
                onNext={() => setGalleryIndex(prev => (prev + 1) % results.length)}
                onPrev={() => setGalleryIndex(prev => (prev - 1 + results.length) % results.length)}
            />
        </div>
    );
};

export default ImageGenerator;
