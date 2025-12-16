import React, { useEffect, useState } from 'react';
import { Campaign, CampaignImage } from '../types';
import { loadCampaigns, loadCampaign } from '../services/campaignService';

interface CampaignListProps {
    onSelectCampaign: (campaign: Campaign, images: CampaignImage[]) => void;
    onBack: () => void;
}

const CampaignList: React.FC<CampaignListProps> = ({ onSelectCampaign, onBack }) => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        try {
            const data = await loadCampaigns();
            setCampaigns(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = async (c: Campaign) => {
        setLoadingId(c.id);
        try {
            const fullCampaign = await loadCampaign(c.id);
            if (fullCampaign && fullCampaign.images) {
                onSelectCampaign(fullCampaign, fullCampaign.images);
            }
        } catch (e) {
            console.error("Failed to load campaign details", e);
            alert("Failed to load campaign details");
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 py-6 px-8 border-b border-gray-100 bg-white flex items-center justify-between z-10">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">
                        Saved Campaigns
                    </h1>
                </div>
                <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm font-medium px-4 py-2">
                    Back
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {isLoading ? (
                    <div className="text-center text-gray-500 mt-20">Loading campaigns...</div>
                ) : campaigns.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20">No saved campaigns yet.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {campaigns.map(c => (
                            <div
                                key={c.id}
                                onClick={() => handleSelect(c)}
                                className="border border-gray-200 rounded-xl p-6 hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group bg-gray-50"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="font-bold text-gray-900 group-hover:text-indigo-600">{c.name}</h3>
                                    <span className="text-xs text-gray-400 bg-white px-2 py-1 rounded border border-gray-100">
                                        {new Date(c.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-600 line-clamp-2 mb-4">
                                    {c.brandData.adCopy}
                                </div>
                                <div className="flex items-center text-xs text-gray-400">
                                    {loadingId === c.id ? (
                                        <span className="text-indigo-600 font-medium">Loading...</span>
                                    ) : (
                                        <span>Click to open</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CampaignList;
