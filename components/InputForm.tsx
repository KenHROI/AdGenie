
import React, { useState, useEffect } from 'react';
import { BrandProfile } from '../types';

interface InputFormProps {
  initialData: BrandProfile;
  onSubmit: (data: BrandProfile) => void;
  isLoading?: boolean;
}

// NOTE: In a real production app, this should be in process.env.REACT_APP_GOOGLE_CLIENT_ID
// If not provided, the Drive button will show a configuration warning.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''; 
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Icons
const DriveIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.9 2.5 3.2 3.3l12.3-21.3-6.5-11.3-12.85 22.65c0 .05 0 .05 0 .05z" fill="#0066da"/>
    <path d="m43.65 25-12.9-22.25c-1.3.8-2.4 1.9-3.2 3.2l-12.8 22.2 6.45 11.25 12.9-22.35z" fill="#00ac47"/>
    <path d="m73.55 66.85-6.4-11.2-12.9-22.2h-12.9l12.9 22.2 6.45 11.2h25.85c-.8-1.35-1.9-2.4-3.2-3.2z" fill="#ea4335"/>
    <path d="m43.65 25 12.9 22.25 6.45 11.15 6.35 11.05c1.4-.8 2.5-1.9 3.3-3.2l12.75-22.2c.8-1.4.8-3 .05-4.35l-6.45-11.15-6.3-11.05-12.9-22.4c-1.3-.8-2.95-.8-4.25 0z" fill="#ffba00"/>
    <path d="m73.55 66.85h-25.8l-6.5 11.15h25.75c1.55 0 3.05-.4 4.35-1.2l-3.85-6.65z" fill="#2684fc"/>
    <path d="m19.25 55.5h25.85l12.9-22.25h-25.75c-1.55 0-3.05.4-4.35 1.2l-12.9 22.3z" fill="#00832d"/>
  </svg>
);

const S3Icon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.626 7.64L10.372 2.709C11.164 1.886 12.38 1.886 13.172 2.709L21.325 11.181L18.736 13.843L11.772 6.605L7.697 10.841L11.772 15.078L15.398 11.31L17.986 14.001L13.172 19.004C12.38 19.827 11.164 19.827 10.372 19.004L2.219 10.533L5.626 7.64Z" fill="#DD344C"/>
    <path d="M12.0001 21.397L10.3721 19.705C11.1641 20.528 12.3801 20.528 13.1721 19.705L21.3251 11.233L22.9531 12.925L12.0001 24.305V21.397Z" fill="#232F3E"/>
  </svg>
);

const InputForm: React.FC<InputFormProps> = ({ initialData, onSubmit, isLoading }) => {
  const [formData, setFormData] = useState<BrandProfile>(initialData);
  const [newColor, setNewColor] = useState('#000000');
  
  // Real Google Drive State
  const [isDriveApiLoaded, setIsDriveApiLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [driveError, setDriveError] = useState<string | null>(null);

  // Mock S3 State
  const [s3Status, setS3Status] = useState<'idle' | 'connecting' | 'connected'>('idle');

  // Initialize Google API and Identity Services
  useEffect(() => {
    const loadScript = (src: string) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    };

    // Load both libraries
    Promise.all([
      loadScript('https://apis.google.com/js/api.js'),
      loadScript('https://accounts.google.com/gsi/client'),
    ])
    .then(() => {
      // 1. Load Picker API
      window.gapi.load('picker', () => {
        console.log('Picker API loaded');
      });

      // 2. Initialize Token Client (GIS)
      if (window.google && window.google.accounts) {
          try {
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: (response: any) => {
                    if (response.error !== undefined) {
                        setDriveError(`Auth Error: ${response.error}`);
                        return;
                    }
                    if (response.access_token) {
                        createPicker(response.access_token);
                    }
                },
            });
            setTokenClient(client);
            setIsDriveApiLoaded(true);
          } catch (e) {
            console.error("Error initializing Google Token Client", e);
          }
      }
    })
    .catch((err) => {
      console.error('Failed to load Google Scripts', err);
      setDriveError('Failed to load Google API');
    });
  }, []);

  const createPicker = (accessToken: string) => {
    setDriveError(null);
    if (!window.google || !window.google.picker) {
        setDriveError('Picker API not ready');
        return;
    }

    const pickerCallback = (data: any) => {
        if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS][0];
            const folderId = doc[window.google.picker.Document.ID];
            const folderName = doc[window.google.picker.Document.NAME];
            
            setFormData(prev => ({
                ...prev,
                librarySource: 'drive',
                driveFolderId: folderId,
                driveFolderName: folderName
            }));
            
            // Reset S3
            setS3Status('idle');
        }
    };

    // Create the picker specifically for folders
    const view = new window.google.picker.View(window.google.picker.ViewId.FOLDERS);
    view.setMimeTypes('application/vnd.google-apps.folder');

    const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(process.env.API_KEY || '') // Using the Gemini API Key as Developer Key (often interchangeable for simple setups)
        .setCallback(pickerCallback)
        .setTitle('Select an Ad Library Folder')
        .build();
    
    picker.setVisible(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, logo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const addColor = () => {
    if (!formData.colors.includes(newColor)) {
      setFormData(prev => ({ ...prev, colors: [...prev.colors, newColor] }));
    }
  };

  const removeColor = (colorToRemove: string) => {
    setFormData(prev => ({ ...prev, colors: prev.colors.filter(c => c !== colorToRemove) }));
  };

  const handleConnectDrive = () => {
    if (!GOOGLE_CLIENT_ID) {
        // Fallback demo mode if no Client ID is configured
        if (confirm("Missing GOOGLE_CLIENT_ID in configuration. Click OK to simulate connection, or Cancel to stay.")) {
             setFormData(prev => ({ ...prev, librarySource: 'drive', driveFolderName: 'Simulated Drive Folder' }));
             setS3Status('idle');
        }
        return;
    }
    
    if (tokenClient) {
        // Trigger the OAuth flow.
        // We use requestAccessToken({prompt: ''}) to skip consent if already granted.
        tokenClient.requestAccessToken({prompt: ''});
    } else {
        setDriveError("Google API not fully loaded yet.");
    }
  };

  const handleConnectS3 = () => {
    if (s3Status === 'connected') return;
    setS3Status('connecting');
    // Mock S3 Connection
    setTimeout(() => {
        setS3Status('connected');
        setFormData(prev => ({ ...prev, librarySource: 's3', driveFolderId: undefined, driveFolderName: undefined }));
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="bg-white h-full flex flex-col overflow-y-auto pr-2 custom-scrollbar">
      <div className="mb-6 flex-shrink-0">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Campaign Brief</h2>
        <p className="text-sm text-gray-500 mt-1">Define your assets and strategy.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-8 pb-4">
        
        {/* Swipe File Library */}
        <div className="space-y-3">
             <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Swipe File Library</label>
             <div className="grid grid-cols-2 gap-3">
                 {/* Google Drive Button */}
                 <button
                    type="button"
                    onClick={handleConnectDrive}
                    className={`relative overflow-hidden p-3 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all duration-300 ${
                        formData.librarySource === 'drive'
                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' 
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                 >
                    <div className="flex items-center space-x-2">
                        <DriveIcon />
                        <span className={`text-sm font-semibold ${formData.librarySource === 'drive' ? 'text-blue-700' : 'text-gray-700'}`}>Google Drive</span>
                    </div>
                    
                    {formData.librarySource === 'drive' && (
                        <div className="flex items-center text-[10px] text-blue-600 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"></span>
                            {formData.driveFolderName || 'Folder Selected'}
                        </div>
                    )}
                     {formData.librarySource !== 'drive' && (
                        <div className="text-[10px] text-gray-400">Select Folder</div>
                    )}
                 </button>

                 {/* Amazon S3 Button */}
                 <button
                    type="button"
                    onClick={handleConnectS3}
                    className={`relative overflow-hidden p-3 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all duration-300 ${
                        s3Status === 'connected' 
                        ? 'bg-orange-50 border-orange-200 ring-1 ring-orange-200' 
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                 >
                     <div className="flex items-center space-x-2">
                        <S3Icon />
                        <span className={`text-sm font-semibold ${s3Status === 'connected' ? 'text-orange-800' : 'text-gray-700'}`}>Amazon S3</span>
                    </div>
                    {s3Status === 'connecting' && (
                        <div className="text-xs text-gray-400 animate-pulse">Connecting...</div>
                    )}
                    {s3Status === 'connected' && (
                        <div className="flex items-center text-[10px] text-orange-600 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"></span>
                            Synced
                        </div>
                    )}
                    {s3Status === 'idle' && (
                        <div className="text-[10px] text-gray-400">Connect Bucket</div>
                    )}
                 </button>
             </div>
             
             {driveError && (
                 <p className="text-[10px] text-red-500 mt-1">{driveError}</p>
             )}

             <p className="text-[10px] text-gray-400">
                {formData.librarySource === 'drive' ? `Analyizing assets in '${formData.driveFolderName || 'Selected Folder'}'` : 
                 s3Status === 'connected' ? "Using 'ad-genie-bucket-prod' from S3." : 
                 "Connect cloud storage to browse your own ad library, or use our curated defaults."}
             </p>
        </div>

        {/* Brand Assets - Condensed */}
        <div className="space-y-4 pt-6 border-t border-dashed border-gray-200">
             <div className="flex items-start justify-between gap-4">
                 <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Palette</label>
                    <div className="flex flex-wrap gap-2">
                        {formData.colors.map((color, idx) => (
                        <button key={idx} type="button" onClick={() => removeColor(color)} className="w-8 h-8 rounded-full shadow-sm border border-gray-100 relative group transition-transform hover:scale-110">
                            <div className="w-full h-full rounded-full" style={{ backgroundColor: color }} />
                            <div className="absolute inset-0 bg-black/20 rounded-full hidden group-hover:flex items-center justify-center text-white text-xs">×</div>
                        </button>
                        ))}
                        <div className="relative">
                            <input
                                type="color"
                                value={newColor}
                                onChange={(e) => setNewColor(e.target.value)}
                                className="opacity-0 absolute inset-0 w-8 h-8 cursor-pointer"
                            />
                            <button type="button" onClick={addColor} className="w-8 h-8 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-black hover:text-black transition-colors bg-gray-50">
                                <span className="text-base">+</span>
                            </button>
                        </div>
                    </div>
                 </div>

                 <div className="w-1/3">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Logo</label>
                    {formData.logo ? (
                        <div className="relative group w-full h-12">
                            <img src={formData.logo} alt="Logo" className="w-full h-full object-contain border border-gray-100 rounded-lg p-1 bg-gray-50" />
                            <button onClick={() => setFormData(prev => ({...prev, logo: null}))} className="absolute -top-1 -right-1 bg-gray-900 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 shadow-sm transition-opacity">×</button>
                        </div>
                    ) : (
                    <label className="cursor-pointer h-12 border border-gray-200 bg-gray-50 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-all w-full flex items-center justify-center gap-1">
                        <span>📂</span> Upload
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                    )}
                 </div>
             </div>
        </div>

        {/* Concept & Copy */}
        <div className="pt-6 border-t border-dashed border-gray-200">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            Ad Concept & Copy
          </label>
          <textarea
            name="adCopy"
            value={formData.adCopy}
            onChange={handleChange}
            required
            rows={4}
            placeholder="A minimalist sneaker campaign on a concrete background..."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-1 focus:ring-black focus:border-black focus:bg-white outline-none transition-all resize-none text-sm leading-relaxed"
          />
        </div>

        {/* Brand Voice Dropdown style */}
        <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Voice</label>
                <div className="relative">
                    <select
                        name="brandVoice"
                        value={formData.brandVoice}
                        onChange={handleChange}
                        className="w-full appearance-none px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-xs font-medium focus:outline-none focus:border-black focus:bg-white cursor-pointer transition-colors"
                    >
                        <option value="">Default</option>
                        <option value="Professional">Professional</option>
                        <option value="Playful">Playful</option>
                        <option value="Luxury">Luxury</option>
                        <option value="Urgent">Urgent</option>
                    </select>
                     <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
             </div>

             <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Typography</label>
                <div className="relative">
                    <select
                        name="typography"
                        value={formData.typography}
                        onChange={handleChange}
                        className="w-full appearance-none px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-xs font-medium focus:outline-none focus:border-black focus:bg-white cursor-pointer transition-colors"
                    >
                        <option value="">Default</option>
                        <option value="Modern Sans">Modern Sans</option>
                        <option value="Classic Serif">Classic Serif</option>
                        <option value="Bold Display">Bold Display</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
             </div>
        </div>

        <div className="mt-auto pt-6">
          <button
            type="submit"
            disabled={!formData.adCopy || isLoading}
            className="w-full bg-black text-white font-semibold py-4 rounded-xl shadow-lg shadow-gray-200 transform transition-all hover:translate-y-[-1px] active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center space-x-2"
          >
            {isLoading ? (
                <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Analyzing Library...</span>
                </>
            ) : (
                <>
                 <span>✨</span>
                 <span>Generate Options</span>
                </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InputForm;
