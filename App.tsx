
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import InputForm from './components/InputForm';
import SuggestionSelector from './components/SuggestionSelector';
import ImageGenerator from './components/ImageGenerator';
import Settings from './components/Settings';
import { AppStep, BrandProfile, AdTemplate } from './types';
import { analyzeAdCopyForStyles } from './services/geminiService';
import { listImagesInFolder } from './services/driveService';
import { getLibrary, deleteTemplate, clearLibrary } from './services/storageService';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import ToastContainer from './components/Toast';
import { AD_LIBRARY } from './constants';

const INITIAL_BRAND_DATA: BrandProfile = {
    colors: [],
    logo: null,
    adCopy: '',
    brandVoice: '',
    typography: '',
    librarySource: 'default',
};

const MainApp: React.FC = () => {
    const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.INPUT);
    const [brandData, setBrandData] = useState<BrandProfile>(INITIAL_BRAND_DATA);
    const [recommendedIds, setRecommendedIds] = useState<string[]>([]);
    const [selectedTemplates, setSelectedTemplates] = useState<AdTemplate[]>([]);
    const [customSeeds, setCustomSeeds] = useState<string[]>([]);
    const [variationsPerSeed, setVariationsPerSeed] = useState(2);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Unified state for the Default Library (Pre-loaded + User Uploaded)
    const [defaultLibrary, setDefaultLibrary] = useState<AdTemplate[]>(AD_LIBRARY);

    // State for the templates available in the CURRENT campaign session (could be Drive or Default)
    const [availableTemplates, setAvailableTemplates] = useState<AdTemplate[]>(AD_LIBRARY);

    const { showToast } = useNotification();

    // Load Library on Mount
    useEffect(() => {
        const loadLibrary = async () => {
            try {
                const lib = await getLibrary();
                setDefaultLibrary(lib);
            } catch (e) {
                console.error("Failed to load library", e);
            }
        };
        loadLibrary();
    }, []);

    const handleNavigate = useCallback((step: AppStep) => {
        setCurrentStep(step);
    }, []);

    const handleInputSubmit = async (data: BrandProfile) => {
        setBrandData(data);
        setIsAnalyzing(true);

        // Start with the current Default Library state
        let templatesToAnalyze = [...defaultLibrary];

        try {
            // 1. Fetch Drive Images if needed
            if (data.librarySource === 'drive' && data.driveFolderId && data.driveAccessToken) {
                try {
                    showToast("Fetching Drive files...", 'info');
                    const driveTemplates = await listImagesInFolder(data.driveFolderId, data.driveAccessToken);
                    if (driveTemplates.length > 0) {
                        templatesToAnalyze = driveTemplates;
                        showToast(`Found ${driveTemplates.length} images in Drive`, 'success');
                    } else {
                        showToast("Drive folder is empty. Using default library.", 'error');
                    }
                } catch (driveErr: any) {
                    console.error(driveErr);
                    showToast(`Drive Error: ${driveErr.message}`, 'error');
                    // Fallback to default is already set in templatesToAnalyze init
                }
            }

            setAvailableTemplates(templatesToAnalyze);

            // 2. Analyze
            const ids = await analyzeAdCopyForStyles(data.adCopy, templatesToAnalyze);
            setRecommendedIds(ids);
            setCurrentStep(AppStep.SELECTION);
        } catch (e: any) {
            console.error(e);
            showToast("Analysis failed. Showing defaults.", 'error');
            // If critical fail, fallback
            setRecommendedIds(templatesToAnalyze.slice(0, 3).map(t => t.id));
            setCurrentStep(AppStep.SELECTION);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSelectionNext = useCallback((templates: AdTemplate[], seeds: string[], variations: number) => {
        setSelectedTemplates(templates);
        setCustomSeeds(seeds);
        setVariationsPerSeed(variations);
        setCurrentStep(AppStep.GENERATION);
    }, []);

    const handleAddTemplate = useCallback((template: AdTemplate) => {
        setDefaultLibrary(prev => [template, ...prev]);
    }, []);

    const handleRemoveTemplate = useCallback(async (id: string) => {
        try {
            await deleteTemplate(id);
            setDefaultLibrary(prev => prev.filter(t => t.id !== id));
            showToast("Template removed from library", "info");
        } catch (e) {
            console.error(e);
            showToast("Failed to delete template", "error");
        }
    }, [showToast]);

    const handleClearLibrary = useCallback(async () => {
        if (!window.confirm("Are you sure you want to delete ALL images from the library? This cannot be undone.")) {
            return;
        }
        try {
            await clearLibrary();
            setDefaultLibrary([]);
            showToast("Library cleared successfully", "success");
        } catch (e) {
            console.error(e);
            showToast("Failed to clear library", "error");
        }
    }, [showToast]);

    // Determine what to render in the main area
    const renderContent = () => {
        if (currentStep === AppStep.SETTINGS) {
            return (
                <div className="h-full w-full max-w-7xl mx-auto">
                    <Settings
                        templates={defaultLibrary}
                        onAddTemplate={handleAddTemplate}
                        onRemoveTemplate={handleRemoveTemplate}
                        onClearLibrary={handleClearLibrary}
                    />
                </div>
            );
        }

        // Campaign Workflow
        return (
            <div className="flex flex-col lg:flex-row h-full w-full">
                <div className={`
                transition-all duration-300 ease-in-out border-r border-gray-100 bg-white z-20 shadow-sm lg:shadow-none
                ${currentStep === AppStep.GENERATION ? 'w-0 overflow-hidden opacity-0 lg:w-0' : 'w-full lg:w-[480px] flex-shrink-0'}
            `}>
                    <div className="h-full overflow-y-auto custom-scrollbar p-6">
                        <InputForm
                            initialData={brandData}
                            onSubmit={handleInputSubmit}
                            isLoading={isAnalyzing}
                        />
                    </div>
                </div>

                {/* Right Panel: Content/Results */}
                <div className="flex-1 h-full overflow-hidden bg-white relative">

                    {/* Empty/Welcome State */}
                    {currentStep === AppStep.INPUT && !isAnalyzing && (
                        <div className="h-full flex flex-col relative overflow-hidden bg-white">
                            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-25"></div>
                            <div className="p-8 flex-1 flex flex-col items-center justify-center text-center text-gray-500 z-10">
                                <div className="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center text-4xl mb-6 shadow-sm border border-gray-100">✨</div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready to Create?</h2>
                                <p className="max-w-md text-gray-500">Fill out the creative brief on the left. Our AI will analyze your brand and suggest the perfect visual layouts.</p>
                            </div>
                        </div>
                    )}

                    {currentStep === AppStep.SELECTION && (
                        <SuggestionSelector
                            recommendedIds={recommendedIds}
                            onBack={() => setCurrentStep(AppStep.INPUT)}
                            onNext={handleSelectionNext}
                            availableTemplates={availableTemplates}
                        />
                    )}

                    {currentStep === AppStep.GENERATION && (
                        <ImageGenerator
                            brandData={brandData}
                            selectedTemplates={selectedTemplates}
                            customSeeds={customSeeds}
                            variationsPerSeed={variationsPerSeed}
                            onBack={() => setCurrentStep(AppStep.SELECTION)}
                        />
                    )}

                    {isAnalyzing && (
                        <div className="absolute inset-0 bg-white/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                            <div className="w-16 h-16 border-4 border-gray-100 border-t-black rounded-full animate-spin mb-6"></div>
                            <p className="text-gray-900 font-bold text-lg">Analyzing Brand Identity...</p>
                            <p className="text-gray-500 text-sm mt-2">Connecting dots...</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Layout currentStep={currentStep} onNavigate={handleNavigate}>
            {renderContent()}
            <ToastContainer />
        </Layout>
    );
};

const App: React.FC = () => (
    <NotificationProvider>
        <MainApp />
    </NotificationProvider>
);

export default App;
