import React, { useEffect, useState, useRef } from 'react';
import { BrandProfile, AdTemplate, GeneratedImage } from '../types';
import { CONFIG } from '../config';
import { generateAdVariation } from '../services/aiService';
import { useSettings } from '../context/SettingsContext';
import { useNotification } from '../context/NotificationContext';
import JSZip from 'jszip';

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
    const hasKey = !!(settings.apiKeys.google || settings.apiKeys.kie); // Simple check for now

    const [isGenerating, setIsGenerating] = useState(false);
    const [results, setResults] = useState<GeneratedImage[]>([]);
    const [progress, setProgress] = useState(0);
    const [currentAction, setCurrentAction] = useState('Initializing...');

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
        showToast("Starting generation workflow...", 'info');

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

                    const generatedBase64 = await generateAdVariation(settings, base64, brandData, sourceName);

                    if (generatedBase64) {
                        setResults(prev => [...prev, {
                            id: Math.random().toString(36).substr(2, 9),
                            base64: generatedBase64,
                            promptUsed: sourceName,
                            seedTemplateId: sourceId,
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

                        {/* Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {results.map((img) => (
                                <div key={img.id} className="group relative rounded-2xl overflow-hidden shadow-sm bg-gray-50 aspect-square animate-fade-in border border-gray-100 hover:shadow-xl hover:scale-[1.01] transition-all duration-300">
                                    <img src={img.base64} alt="Result" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                                        <button
                                            onClick={() => downloadImage(img.base64, img.id)}
                                            className="px-5 py-2.5 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors shadow-lg flex items-center gap-2"
                                        >
                                            <span>Download</span>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {isGenerating && progress < 100 && (
                                <div className="aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center animate-pulse gap-2">
                                    <span className="text-3xl opacity-20">🎨</span>
                                    <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">Rendering</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};

export default ImageGenerator;
