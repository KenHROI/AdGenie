import React from 'react';

interface GalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
    images: { id: string; base64: string; promptUsed: string }[];
    selectedIndex: number;
    onNext: () => void;
    onPrev: () => void;
}

const GalleryModal: React.FC<GalleryModalProps> = ({
    isOpen,
    onClose,
    images,
    selectedIndex,
    onNext,
    onPrev
}) => {
    if (!isOpen || images.length === 0) return null;

    const currentImage = images[selectedIndex];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm">
            <button onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-50">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="flex items-center w-full h-full p-10">
                <button onClick={onPrev} className="p-4 text-white/50 hover:text-white transition-colors">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>

                <div className="flex-1 h-full flex flex-col items-center justify-center space-y-6">
                    <div className="relative max-h-[80vh] w-full flex items-center justify-center">
                        <img
                            src={currentImage.base64}
                            alt="Full view"
                            className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl"
                        />
                    </div>
                    <div className="text-center max-w-2xl">
                        <p className="text-white/80 text-lg font-medium mb-2">{currentImage.promptUsed}</p>
                        <div className="flex gap-2 justify-center">
                            {images.map((_, idx) => (
                                <div
                                    key={idx}
                                    className={`w-2 h-2 rounded-full transition-all ${idx === selectedIndex ? 'bg-white scale-125' : 'bg-white/30'}`}
                                ></div>
                            ))}
                        </div>
                    </div>
                </div>

                <button onClick={onNext} className="p-4 text-white/50 hover:text-white transition-colors">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>

            {/* Keyboard Nav Overlay */}
            <div className="absolute inset-0 z-[-1]" onClick={onClose}></div>
        </div>
    );
};

export default GalleryModal;
