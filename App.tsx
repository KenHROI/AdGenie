
import React, { useState } from 'react';
import Layout from './components/Layout';
import InputForm from './components/InputForm';
import SuggestionSelector from './components/SuggestionSelector';
import ImageGenerator from './components/ImageGenerator';
import { AppStep, BrandProfile, AdTemplate } from './types';
import { analyzeAdCopyForStyles } from './services/geminiService';

const INITIAL_BRAND_DATA: BrandProfile = {
  colors: [],
  logo: null,
  adCopy: '',
  brandVoice: '',
  typography: '',
  librarySource: 'default',
};

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.INPUT);
  const [brandData, setBrandData] = useState<BrandProfile>(INITIAL_BRAND_DATA);
  const [recommendedIds, setRecommendedIds] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<AdTemplate[]>([]);
  const [customSeeds, setCustomSeeds] = useState<string[]>([]);
  const [variationsPerSeed, setVariationsPerSeed] = useState(2);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleInputSubmit = async (data: BrandProfile) => {
    setBrandData(data);
    setIsAnalyzing(true);
    try {
      const ids = await analyzeAdCopyForStyles(data.adCopy);
      setRecommendedIds(ids);
      setCurrentStep(AppStep.SELECTION);
    } catch (e) {
      console.error(e);
      setCurrentStep(AppStep.SELECTION);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectionNext = (templates: AdTemplate[], seeds: string[], variations: number) => {
    setSelectedTemplates(templates);
    setCustomSeeds(seeds);
    setVariationsPerSeed(variations);
    setCurrentStep(AppStep.GENERATION);
  };

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row h-full w-full">
        
        {/* Left Panel: Controls */}
        <div className="w-full lg:w-[480px] flex-shrink-0 h-[400px] lg:h-full border-r border-gray-100 bg-white z-20 shadow-sm lg:shadow-none">
           <InputForm 
             initialData={brandData} 
             onSubmit={handleInputSubmit} 
             isLoading={isAnalyzing}
            />
        </div>

        {/* Right Panel: Content/Results */}
        <div className="flex-1 h-full overflow-hidden bg-white relative">
             {/* Render Content Based on Step */}
             
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
                    <p className="text-gray-500 text-sm mt-2">Selecting best-fit layouts</p>
                </div>
             )}
        </div>
      </div>
    </Layout>
  );
};

export default App;
