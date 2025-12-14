
import React, { useState, useRef } from 'react';
import { AdTemplate } from '../types';
import TemplateDetailModal from './TemplateDetailModal';
import { useNotification } from '../context/NotificationContext';
import { useSettings } from '../context/SettingsContext';
import { describeImageStyle, fetchOpenRouterModels } from '../services/aiService';
import { uploadTemplate } from '../services/storageService';
import { AD_LIBRARY, GOOGLE_IMAGE_MODELS, KIE_IMAGE_MODELS, GOOGLE_TEXT_MODELS, GOOGLE_VISION_MODELS } from '../constants';

interface SettingsProps {
    templates: AdTemplate[];
    onAddTemplate: (template: AdTemplate) => void;
    onRemoveTemplate: (id: string) => void;
    onClearLibrary: () => void;
    onUpdateTemplate: (template: AdTemplate) => void;
}
// Utility to resize and compress images before processing
const optimizeImage = (file: File, maxWidth = 1024, quality = 0.8): Promise<File> => {
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
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                    } else {
                        reject(new Error("Compression failed"));
                    }
                }, 'image/jpeg', quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

const Settings: React.FC<SettingsProps> = ({ templates, onAddTemplate, onRemoveTemplate, onClearLibrary, onUpdateTemplate }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scanStatus, setScanStatus] = useState<string>('');
    const [selectedLibIds, setSelectedLibIds] = useState<Set<string>>(new Set());
    const [isPaused, setIsPaused] = useState(false);
    const [progressState, setProgressState] = useState({ current: 0, total: 0 });
    const [errorLogs, setErrorLogs] = useState<string[]>([]);
    const [viewedTemplate, setViewedTemplate] = useState<AdTemplate | null>(null);

    // API Key State (Masking)
    const { settings, updateApiKey, updateService, updateSettings } = useSettings();
    const [showGoogleKey, setShowGoogleKey] = useState(false);
    const [showKieKey, setShowKieKey] = useState(false);
    const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    const { showToast } = useNotification();

    const handleRefreshModels = async () => {
        if (!settings.apiKeys.openRouter) {
            showToast("Enter OpenRouter Key first", "error");
            return;
        }
        setIsLoadingModels(true);
        try {
            const models = await fetchOpenRouterModels(settings.apiKeys.openRouter);
            if (models.length > 0) {
                updateSettings({ openRouterModels: models });
                showToast(`Fetched ${models.length} OpenRouter models`, "success");
            } else {
                showToast("No OpenRouter models found", "error");
            }
        } catch (e) {
            showToast("Failed to fetch OpenRouter models", "error");
        } finally {
            setIsLoadingModels(false);
        }
    };

    const handleRefreshKieModels = async () => {
        if (!settings.apiKeys.kie) {
            showToast("Enter Kie.ai Key first", "error");
            return;
        }
        setIsLoadingModels(true);
        try {
            // Import dynamically to avoid circular dep issues if any, or just use imported
            const { fetchKieModels } = await import('../services/aiService');
            const models = await fetchKieModels(settings.apiKeys.kie);
            if (models.length > 0) {
                updateSettings({ kieModels: models });
                showToast(`Fetched ${models.length} Kie.ai models`, "success");
            } else {
                showToast("No Kie.ai models found", "error");
            }
        } catch (e) {
            showToast("Failed to fetch Kie.ai models", "error");
        } finally {
            setIsLoadingModels(false);
        }
    };

    // Refs for control
    const isMounted = useRef(true);
    const isPausedRef = useRef(false);
    const isCancelledRef = useRef(false);

    React.useEffect(() => {
        return () => { isMounted.current = false; };
    }, []);

    const handlePause = () => {
        isPausedRef.current = true;
        setIsPaused(true);
    };

    const handleResume = () => {
        isPausedRef.current = false;
        setIsPaused(false);
    };

    const handleCancel = () => {
        isCancelledRef.current = true;
        isPausedRef.current = false; // ensure we break loops
        setIsPaused(false);
        setIsUploading(false);
        setIsScanning(false); // Fix: Reset scanning state
        showToast("Operation cancelled", "info");
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsUploading(true);
        setIsPaused(false);
        setErrorLogs([]); // Clear previous errors
        isPausedRef.current = false;
        isCancelledRef.current = false;

        const totalFiles = files.length;
        setProgressState({ current: 0, total: totalFiles });

        const fileArray: File[] = Array.from(files);
        let processedCount = 0;
        let successCount = 0;
        let failCount = 0;

        // Concurrency Limit (max parallel requests)
        const CONCURRENCY_LIMIT = 2; // Reduced to prevent AI API rate limiting
        let index = 0;

        const processNext = async (): Promise<void> => {
            // Check Cancel
            if (isCancelledRef.current) return;

            // Check Pause Loop
            while (isPausedRef.current) {
                if (isCancelledRef.current) return;
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Get next file index atomically
            if (index >= fileArray.length) return;
            const currentIndex = index++;
            const file = fileArray[currentIndex];

            try {
                if (file.size > 20 * 1024 * 1024) {
                    throw new Error("File too large (>20MB)");
                }

                // 1. Optimize (Client-side)
                const optimizedFile = await optimizeImage(file);

                // Get base64 for AI analysis
                const base64: string = await new Promise(resolve => {
                    const r = new FileReader();
                    r.onload = () => resolve(r.result as string);
                    r.readAsDataURL(optimizedFile);
                });

                // 2. Analyze (non-fatal if AI fails)
                let aiData: { name?: string; description?: string; tags?: string[] } = {
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    description: "User uploaded template",
                    tags: ["custom"]
                };
                try {
                    if (isMounted.current) setScanStatus && setScanStatus(`Analyzing ${file.name}...`);
                    const result = await describeImageStyle(settings, base64);
                    if (result && result.name) {
                        aiData = result;
                    }
                } catch (aiError: any) {
                    console.warn(`AI analysis failed for ${file.name}:`, aiError);
                    if (isMounted.current) {
                        setErrorLogs(prev => [...prev, `${file.name}: ${aiError.message}`]);
                        setScanStatus && setScanStatus(`Analysis failed: ${aiError.message}`);
                        // Don't swallow error completely, let the user know, but fall back to defaults so upload succeeds
                        showToast(`Analysis failed for ${file.name}: ${aiError.message}`, "error");
                    }
                }

                // Small delay to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 300));

                // 3. Upload via Service (API or Local Fallback)
                const newTemplate = await uploadTemplate(optimizedFile, {
                    name: aiData.name || "Custom Upload",
                    description: aiData.description || "User uploaded template",
                    tags: aiData.tags || ["custom"]
                });

                if (isMounted.current && !isCancelledRef.current) {
                    onAddTemplate(newTemplate);
                    successCount++;
                }

            } catch (error: any) {
                console.error(`Error processing ${file.name}:`, error);
                failCount++;
                if (isMounted.current) {
                    setErrorLogs(prev => [...prev, `${file.name}: ${error.message || "Unknown error"}`]);
                }
            } finally {
                if (!isCancelledRef.current) {
                    processedCount++;
                    if (isMounted.current) {
                        setProgressState(prev => ({ ...prev, current: processedCount }));
                    }
                    // Recursive call
                    await processNext();
                }
            }
        };

        // Initialize worker pool
        const workers = [];
        const initialPoolSize = Math.min(totalFiles, CONCURRENCY_LIMIT);

        for (let i = 0; i < initialPoolSize; i++) {
            workers.push(processNext());
        }

        await Promise.all(workers);

        if (isMounted.current && !isCancelledRef.current) {
            setIsUploading(false);
            setProgressState({ current: 0, total: 0 });

            if (successCount > 0) {
                showToast(`Completed: ${successCount} added`, "success");
            }
            if (failCount > 0) {
                showToast(`Failed: ${failCount} files`, "error");
            }
        }

        // Reset input
        e.target.value = '';
    };



    const handleScanLibrary = async () => {
        console.log("Starting Scan Library...");
        console.log("Settings:", settings);
        console.log("Selected IDs:", Array.from(selectedLibIds));

        // Validation: Check for API Key
        // Assuming we rely on settings passed to describeImageStyle, which uses aiServiceUtils
        // We should double check if we can make a call.

        const hasGoogle = !!settings.apiKeys.google;
        const hasOpenRouter = !!settings.apiKeys.openRouter;

        // Simple heuristic: we need at least one vision capable key.
        // If vision provider is set to 'google', we need google key.
        // If vision provider is 'openRouter', we need openRouter key.

        if (settings.services.vision.provider === 'google' && !hasGoogle) {
            console.error("Missing Google Key");
            showToast("Google API Key missing for Vision Analysis", "error");
            return;
        }

        if (settings.services.vision.provider === 'openRouter' && !hasOpenRouter) {
            console.error("Missing OpenRouter Key");
            showToast("OpenRouter API Key missing for Vision Analysis", "error");
            return;
        }

        const idsToScan = Array.from(selectedLibIds);
        if (idsToScan.length === 0) {
            showToast("No templates selected to scan", "info");
            return;
        }

        setIsScanning(true);
        setIsPaused(false);
        setErrorLogs([]);
        isPausedRef.current = false;
        isCancelledRef.current = false;

        setProgressState({ current: 0, total: idsToScan.length });

        let processedCount = 0;
        let successCount = 0;
        let failCount = 0;

        // Use a pool for concurrency
        const CONCURRENCY_LIMIT = 2; // Keep low to avoid rate limits
        let index = 0;

        const processNextScan = async (): Promise<void> => {
            if (isCancelledRef.current) return;
            while (isPausedRef.current) {
                if (isCancelledRef.current) return;
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (index >= idsToScan.length) return;
            const currentId = idsToScan[index++];
            const template = templates.find(t => t.id === currentId);

            if (!template) return;

            try {
                console.log(`Processing ${template.id} (${template.name})`);

                // Determine image source for analysis
                let base64 = template.imageUrl;
                // If it's a URL, we need to fetch it to get base64 for the AI service
                if (template.imageUrl.startsWith('http')) {
                    console.log(`Fetching ${template.imageUrl}...`);
                    try {
                        const resp = await fetch(template.imageUrl, { mode: 'cors' });
                        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
                        const blob = await resp.blob();
                        console.log(`Fetched blob: ${blob.size} bytes`);
                        base64 = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    } catch (fetchErr) {
                        console.error(`Fetch error for ${template.name}:`, fetchErr);
                        throw fetchErr;
                    }
                }

                console.log("Analyzing with AI...");
                if (isMounted.current) setScanStatus && setScanStatus(`Analyzing structure of ${template.name}...`);
                const aiData = await describeImageStyle(settings, base64);
                console.log("AI Analysis complete");

                const updatedTemplate = {
                    ...template,
                    ...aiData,
                    tags: [...new Set([...template.tags, ...(aiData.tags || [])])]
                };

                if (isMounted.current && !isCancelledRef.current) {
                    console.log("Calling onUpdateTemplate...");
                    onUpdateTemplate(updatedTemplate);
                    console.log("onUpdateTemplate returned");
                    successCount++;
                }

            } catch (err: any) {
                console.error(`Scan failed for ${template.name}`, err);
                failCount++;
                if (isMounted.current) {
                    setErrorLogs(prev => [...prev, `${template.name}: ${err.message}`]);
                }
            } finally {
                console.log(`Finally block for ${template.name}`);
                if (!isCancelledRef.current) {
                    processedCount++;
                    if (isMounted.current) {
                        console.log(`Updating progress: ${processedCount}/${progressState.total}`);
                        setProgressState(prev => ({ ...prev, current: processedCount }));
                    }
                    await processNextScan();
                }
            }
        };

        const workers = [];
        const initialPoolSize = Math.min(idsToScan.length, CONCURRENCY_LIMIT);
        for (let i = 0; i < initialPoolSize; i++) {
            workers.push(processNextScan());
        }

        await Promise.all(workers);

        if (isMounted.current && !isCancelledRef.current) {
            setIsScanning(false);
            setProgressState({ current: 0, total: 0 });
            if (successCount > 0) showToast(`Scanned ${successCount} images`, "success");
            if (failCount > 0) showToast(`Failed to scan ${failCount} images`, "error");

            // Clear selection after success
            setSelectedLibIds(new Set());
        }
    };

    const toggleLibSelection = (id: string) => {
        const newSet = new Set(selectedLibIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedLibIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedLibIds.size === templates.length) {
            setSelectedLibIds(new Set());
        } else {
            setSelectedLibIds(new Set(templates.map(t => t.id)));
        }
    };



    return (
        <div className="w-full h-full bg-white flex flex-col overflow-hidden">
            <div className="flex-shrink-0 mb-8 flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h2>
                    <p className="text-sm text-gray-500 mt-1">Manage your application preferences and assets.</p>
                </div>
                <div className="flex items-center space-x-3">
                    {isUploading && (
                        <div className="flex items-center space-x-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                            <button onClick={isPaused ? handleResume : handlePause} className="px-3 py-1 text-xs font-bold bg-white border border-gray-200 rounded hover:bg-gray-50">
                                {isPaused ? 'Resume' : 'Pause'}
                            </button>
                            <button onClick={handleCancel} className="px-3 py-1 text-xs font-bold bg-red-50 text-red-600 border border-red-100 rounded hover:bg-red-100">
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-12">

                <section className="mb-12 border-b border-gray-100 pb-12">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-900">API Configuration</h3>
                        <div className="flex gap-4">
                            {settings.apiKeys.kie && (
                                <button
                                    onClick={handleRefreshKieModels}
                                    className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                                >
                                    {isLoadingModels ? 'Loading...' : 'Refresh Kie.ai Models'}
                                </button>
                            )}
                            {settings.apiKeys.openRouter && (
                                <button
                                    onClick={handleRefreshModels}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                    {isLoadingModels ? 'Loading...' : 'Refresh OpenRouter Models'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        {/* Credentials Vault */}
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                            <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <span className="text-lg">🔐</span> Credentials Vault
                            </h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Google API Key (Gemini)</label>
                                    <div className="relative">
                                        <input
                                            type={showGoogleKey ? "text" : "password"}
                                            value={settings.apiKeys.google}
                                            onChange={(e) => updateApiKey('google', e.target.value)}
                                            placeholder="AIzaSy..."
                                            className="w-full pl-3 pr-10 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                                        />
                                        <button
                                            onClick={() => setShowGoogleKey(!showGoogleKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                        >
                                            {showGoogleKey ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Kie.ai API Key</label>
                                    <div className="relative">
                                        <input
                                            type={showKieKey ? "text" : "password"}
                                            value={settings.apiKeys.kie}
                                            onChange={(e) => updateApiKey('kie', e.target.value)}
                                            placeholder="kie_..."
                                            className="w-full pl-3 pr-10 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                                        />
                                        <button
                                            onClick={() => setShowKieKey(!showKieKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                        >
                                            {showKieKey ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">OpenRouter API Key</label>
                                    <div className="relative">
                                        <input
                                            type={showOpenRouterKey ? "text" : "password"}
                                            value={settings.apiKeys.openRouter}
                                            onChange={(e) => updateApiKey('openRouter', e.target.value)}
                                            placeholder="sk-or-..."
                                            className="w-full pl-3 pr-10 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                                        />
                                        <button
                                            onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                        >
                                            {showOpenRouterKey ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Service Routing */}
                    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                        <h4 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <span className="text-xl">⚡️</span> Service Routing
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                            {/* 1. Text Analysis */}
                            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50 flex flex-col h-full hover:shadow-md transition-shadow">
                                <div className="mb-4">
                                    <h5 className="font-bold text-gray-900">Text Analysis</h5>
                                    <p className="text-xs text-gray-500 mt-1">Ad copy & brand voice</p>
                                </div>
                                <div className="mt-auto">
                                    <select
                                        className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all appearance-none cursor-pointer font-medium text-gray-700 hover:border-gray-300"
                                        value={`${settings.services.analysis.provider}|${settings.services.analysis.modelId || 'default'}`}
                                        onChange={(e) => {
                                            const [provider, modelId] = e.target.value.split('|');
                                            updateService('analysis', { provider: provider as any, modelId: modelId === 'default' ? undefined : modelId });
                                        }}
                                        style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23333%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.7-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem top 50%', backgroundSize: '0.65rem auto' }}
                                    >
                                        <optgroup label="Google Gemini">
                                            {GOOGLE_TEXT_MODELS.map(m => (
                                                <option key={m.id} value={`google|${m.id}`}>{m.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="OpenAI (via OpenRouter)">
                                            <option value="openRouter|openai/gpt-4o">GPT-4o</option>
                                            <option value="openRouter|openai/gpt-4-turbo">GPT-4 Turbo</option>
                                            {settings.openRouterModels?.filter(m => !m.capabilities.isImageGen && !m.capabilities.isVision).map(m => (
                                                <option key={m.id} value={`openRouter|${m.id}`}>{m.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>
                            </div>

                            {/* 2. Vision Analysis */}
                            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50 flex flex-col h-full hover:shadow-md transition-shadow">
                                <div className="mb-4">
                                    <h5 className="font-bold text-gray-900">Vision Analysis</h5>
                                    <p className="text-xs text-gray-500 mt-1">Template analysis</p>
                                </div>
                                <div className="mt-auto">
                                    <select
                                        className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all appearance-none cursor-pointer font-medium text-gray-700 hover:border-gray-300"
                                        value={`${settings.services.vision.provider}|${settings.services.vision.modelId || 'default'}`}
                                        onChange={(e) => {
                                            const [provider, modelId] = e.target.value.split('|');
                                            updateService('vision', { provider: provider as any, modelId: modelId === 'default' ? undefined : modelId });
                                        }}
                                        style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23333%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.7-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem top 50%', backgroundSize: '0.65rem auto' }}
                                    >
                                        <optgroup label="Google Gemini">
                                            {GOOGLE_VISION_MODELS.map(m => (
                                                <option key={m.id} value={`google|${m.id}`}>{m.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="OpenAI (via OpenRouter)">
                                            <option value="openRouter|openai/gpt-4o">GPT-4o (Vision)</option>
                                            <option value="openRouter|openai/gpt-4-turbo">GPT-4 Turbo (Vision)</option>
                                            {settings.openRouterModels?.filter(m => m.capabilities.isVision).map(m => (
                                                <option key={m.id} value={`openRouter|${m.id}`}>{m.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>
                            </div>

                            {/* 3. Image Generation */}
                            <div className="p-5 rounded-xl border border-gray-100 bg-gray-50 flex flex-col h-full hover:shadow-md transition-shadow">
                                <div className="mb-4">
                                    <h5 className="font-bold text-gray-900">Image Generation</h5>
                                    <p className="text-xs text-gray-500 mt-1">Creating variations</p>
                                </div>
                                <div className="mt-auto">
                                    <select
                                        className="w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all appearance-none cursor-pointer font-medium text-gray-700 hover:border-gray-300"
                                        value={`${settings.services.imageGeneration.provider}|${settings.services.imageGeneration.modelId || 'default'}`}
                                        onChange={(e) => {
                                            const [provider, modelId] = e.target.value.split('|');
                                            updateService('imageGeneration', { provider: provider as any, modelId: modelId === 'default' ? undefined : modelId });
                                        }}
                                        style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23333%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.7-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.7rem top 50%', backgroundSize: '0.65rem auto' }}
                                    >
                                        <optgroup label="Google Imagen">
                                            {GOOGLE_IMAGE_MODELS.map(m => (
                                                <option key={m.id} value={`google|${m.id}`}>{m.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Kie.ai (Dynamic)">
                                            {(settings.kieModels && settings.kieModels.length > 0) ? (
                                                settings.kieModels.filter(m => m.category === 'image').map(m => (
                                                    <option key={m.id} value={`kie|${m.id}`}>{m.name}</option>
                                                ))
                                            ) : (
                                                KIE_IMAGE_MODELS.map(m => (
                                                    <option key={m.id} value={`kie|${m.id}`}>{m.name}</option>
                                                ))
                                            )}
                                        </optgroup>
                                        <optgroup label="OpenAI (via OpenRouter)">
                                            <option value="openRouter|openai/dall-e-3">DALL-E 3</option>
                                            {settings.openRouterModels?.filter(m => m.capabilities.isImageGen).map(m => (
                                                <option key={m.id} value={`openRouter|${m.id}`}>{m.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>
                            </div>

                        </div>
                    </div>
                </section>

                {/* Library Management Section */}
                <section className="mb-12">
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Default Swipe File Library</h3>
                            <p className="text-sm text-gray-500">
                                These templates are available when "Default" is selected in your campaign.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Scanning Controls */}
                            {selectedLibIds.size > 0 && (
                                <>
                                    <span className="text-xs font-medium text-gray-500">{selectedLibIds.size} selected</span>
                                    {!isScanning && (
                                        <button
                                            onClick={handleScanLibrary}
                                            disabled={isScanning}
                                            className="text-xs font-bold text-white bg-black hover:bg-gray-800 px-3 py-1.5 rounded-md transition-colors flex items-center gap-2"
                                        >
                                            <span>⚡️ Scan Selected</span>
                                        </button>
                                    )}
                                </>
                            )}

                            {isScanning && (
                                <button
                                    onClick={handleCancel}
                                    className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition-colors"
                                >
                                    Cancel Scan
                                </button>
                            )}

                            <button
                                onClick={handleSelectAll}
                                className="text-xs font-bold text-gray-600 hover:bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200 transition-colors"
                            >
                                {selectedLibIds.size === templates.length ? 'Deselect All' : 'Select All'}
                            </button>

                            <button
                                onClick={onClearLibrary}
                                className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-md border border-red-200 transition-colors"
                            >
                                Clear Library
                            </button>
                            <span className="text-xs font-bold bg-gray-100 px-3 py-1.5 rounded-full text-gray-600">
                                {templates.length} Assets
                            </span>
                        </div>
                    </div>

                    {/* Scanning Progress Bar (reusing structure) */}
                    {isScanning && (
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-4">
                            <div className="w-8 h-8 flex items-center justify-center bg-white text-blue-600 rounded-full shadow-sm animate-pulse">
                                ⚡️
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between mb-1">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-blue-900">Scanning Library with AI...</span>
                                        <span className="text-[10px] text-blue-600 font-mono animate-pulse">{scanStatus || "Initializing..."}</span>
                                    </div>
                                    <span className="text-xs font-mono text-blue-700">{progressState.current} / {progressState.total}</span>
                                </div>
                                <div className="w-full bg-blue-200 rounded-full h-1.5">
                                    <div
                                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                        style={{ width: `${(progressState.current / Math.max(progressState.total, 1)) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error Logs */}
                    {errorLogs.length > 0 && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-sm font-bold text-red-800">Errors ({errorLogs.length})</h4>
                                <button onClick={() => setErrorLogs([])} className="text-xs text-red-600 hover:text-red-800 underline">Dismiss</button>
                            </div>
                            <div className="max-h-32 overflow-y-auto custom-scrollbar">
                                {errorLogs.map((log, i) => (
                                    <p key={i} className="text-xs text-red-600 font-mono mb-1 last:mb-0">{log}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {/* Upload Card */}
                        <label className={`relative rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-white hover:border-black transition-all cursor-pointer flex flex-col items-center justify-center aspect-square group ${isUploading ? 'opacity-100 cursor-default' : ''}`}>
                            {isUploading ? (
                                <div className="flex flex-col items-center w-full px-4 text-center">
                                    {isPaused ? (
                                        <div className="w-8 h-8 flex items-center justify-center bg-yellow-100 text-yellow-600 rounded-full mb-2">
                                            ⏸
                                        </div>
                                    ) : (
                                        <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-2 mx-auto"></div>
                                    )}
                                    <span className="text-[10px] text-gray-500 font-mono block mb-1">
                                        {isPaused ? 'Paused' : 'Uploading...'}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-mono block">
                                        {progressState.current} / {progressState.total}
                                    </span>
                                    <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                                        <div
                                            className={`h-1 rounded-full transition-all duration-300 ${isPaused ? 'bg-yellow-400' : 'bg-black'}`}
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
                        {templates.map(t => {
                            const isSelected = selectedLibIds.has(t.id);
                            return (
                                <div
                                    key={t.id}
                                    onClick={() => toggleLibSelection(t.id)}
                                    className={`relative rounded-2xl overflow-hidden border transition-all cursor-pointer group aspect-square
                                    ${isSelected ? 'border-2 border-blue-600 ring-2 ring-blue-100' : 'border-gray-100 bg-white hover:border-gray-300'}
                                `}
                                >
                                    <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />

                                    {/* Selection Indicator */}
                                    <div className={`absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 text-white' : 'bg-white/50 border border-gray-300'}`}>
                                        {isSelected && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    </div>

                                    {/* Category Badge */}
                                    {t.category && (
                                        <div className="absolute top-2 right-8 bg-black/50 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
                                            {t.category}
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end">
                                        <p className="text-white text-xs font-bold truncate">{t.name}</p>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {t.tags.slice(0, 2).map(tag => (
                                                <span key={tag} className="text-[9px] bg-white/20 text-white px-1.5 rounded-sm">{tag}</span>
                                            ))}
                                        </div>
                                        {/* View Details Button (stopPropagation) */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setViewedTemplate(t); }}
                                            className="mt-2 w-full py-1 bg-white text-black text-[10px] font-bold rounded shadow-sm hover:bg-gray-100"
                                        >
                                            View Details
                                        </button>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onRemoveTemplate(t.id); }}
                                        className="absolute top-2 right-2 bg-white/90 text-red-500 p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all shadow-sm z-10"
                                        title="Delete Template"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </section>
            </div >

            <TemplateDetailModal
                isOpen={!!viewedTemplate}
                template={viewedTemplate}
                onClose={() => setViewedTemplate(null)}
            />
        </div >
    );
};

export default Settings;
