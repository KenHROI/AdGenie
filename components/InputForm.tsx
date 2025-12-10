
import React, { useState, useEffect } from 'react';
import { BrandProfile } from '../types';
import { useNotification } from '../context/NotificationContext';
import { listImagesInFolder } from '../services/driveService';

interface InputFormProps {
  initialData: BrandProfile;
  onSubmit: (data: BrandProfile) => void;
  isLoading?: boolean;
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''; 
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Icons
const DefaultIcon = () => (
  <svg className="w-5 h-5 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

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
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [pickerInited, setPickerInited] = useState(false);
  const [s3Status, setS3Status] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [isValidatingDrive, setIsValidatingDrive] = useState(false);
  
  const { showToast } = useNotification();

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

    Promise.all([
      loadScript('https://apis.google.com/js/api.js'),
      loadScript('https://accounts.google.com/gsi/client'),
    ])
    .then(() => {
      // Initialize Picker API
      if (window.gapi) {
          window.gapi.load('picker', () => {
              console.log('Picker loaded');
              setPickerInited(true);
          });
      }

      // Initialize Identity Services
      if (window.google && window.google.accounts) {
          if (GOOGLE_CLIENT_ID) {
              try {
                const client = window.google.accounts.oauth2.initTokenClient({
                    client_id: GOOGLE_CLIENT_ID,
                    scope: SCOPES,
                    callback: (response: any) => {
                        if (response.error !== undefined) {
                            showToast(`Drive Auth Error: ${response.error}`, 'error');
                            return;
                        }
                        if (response.access_token) {
                            setFormData(prev => ({ ...prev, driveAccessToken: response.access_token }));
                            createPicker(response.access_token);
                        }
                    },
                });
                setTokenClient(client);
              } catch (e) {
                console.error(e);
                showToast("Failed to init Google Auth", 'error');
              }
          }
      }
    })
    .catch((err) => {
      console.error(err);
      showToast("Failed to load Google Scripts", 'error');
    });
  }, []);

  const createPicker = (accessToken: string) => {
    if (!pickerInited || !window.google || !window.google.picker) {
        showToast("Google Picker API not ready. Please try again in a moment.", 'error');
        return;
    }

    const pickerCallback = async (data: any) => {
        if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
            const doc = data[window.google.picker.Response.DOCUMENTS][0];
            const folderId = doc[window.google.picker.Document.ID];
            const folderName = doc[window.google.picker.Document.NAME];
            
            setIsValidatingDrive(true);
            showToast(`Scanning '${folderName}' for images...`, 'info');

            try {
                // Validate folder content immediately
                const files = await listImagesInFolder(folderId, accessToken);
                
                if (files.length === 0) {
                     showToast(`Folder '${folderName}' contains no images. Please select another.`, 'error');
                     setIsValidatingDrive(false);
                     return; // Do not update state
                }

                setFormData(prev => ({
                    ...prev,
                    librarySource: 'drive',
                    driveFolderId: folderId,
                    driveFolderName: folderName
                }));
                setS3Status('idle');
                showToast(`Connected: ${folderName} (${files.length} images)`, 'success');
            } catch (err) {
                console.error("Error checking folder:", err);
                showToast("Failed to verify folder contents.", 'error');
            } finally {
                setIsValidatingDrive(false);
            }

        } else if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.CANCEL) {
            console.log('Picker canceled');
        }
    };

    const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setMimeTypes('application/vnd.google-apps.folder');

    const pickerBuilder = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setCallback(pickerCallback)
        .setTitle('Select an Ad Library Folder');

    if (process.env.API_KEY) {
        pickerBuilder.setDeveloperKey(process.env.API_KEY);
    }
        
    const picker = pickerBuilder.build();
    picker.setVisible(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
          showToast("Logo file too large (max 5MB)", 'error');
          return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, logo: reader.result as string }));
        showToast("Logo uploaded successfully", 'success');
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

  const handleSetDefault = () => {
      setFormData(prev => ({ ...prev, librarySource: 'default', driveFolderId: undefined, driveFolderName: undefined }));
      setS3Status('idle');
  };

  const handleConnectDrive = () => {
    // If we already have a valid folder and just clicked again, maybe we want to change it?
    // Always reopen picker.
    
    if (!GOOGLE_CLIENT_ID) {
        if (confirm("Missing GOOGLE_CLIENT_ID. Click OK to simulate connection.")) {
             setFormData(prev => ({ 
                 ...prev, 
                 librarySource: 'drive', 
                 driveFolderName: 'Simulated Folder',
                 driveAccessToken: 'simulated-token',
                 driveFolderId: 'simulated-id'
             }));
             setS3Status('idle');
             showToast("Simulated Drive Connection Active", 'info');
        }
        return;
    }
    
    if (tokenClient) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        showToast("Google API still loading...", 'info');
    }
  };

  const handleConnectS3 = () => {
    if (s3Status === 'connected') return;
    setS3Status('connecting');
    setTimeout(() => {
        setS3Status('connected');
        setFormData(prev => ({ ...prev, librarySource: 's3', driveFolderId: undefined }));
        showToast("Connected to Amazon S3 Bucket", 'success');
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.adCopy.length < 10) {
        showToast("Please enter a more descriptive ad copy (min 10 chars).", 'error');
        return;
    }
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
             <div className="flex justify-between items-baseline">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Swipe File Library</label>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                 {/* Default Option */}
                 <button
                    type="button"
                    onClick={handleSetDefault}
                    className={`relative overflow-hidden p-3 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all duration-300 ${
                        formData.librarySource === 'default'
                        ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-200 shadow-sm' 
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                 >
                    <DefaultIcon />
                    <span className={`text-xs font-semibold ${formData.librarySource === 'default' ? 'text-purple-700' : 'text-gray-700'}`}>Default</span>
                 </button>

                 {/* Google Drive Option */}
                 <button
                    type="button"
                    onClick={handleConnectDrive}
                    className={`relative overflow-hidden p-3 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all duration-300 ${
                        formData.librarySource === 'drive'
                        ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200 shadow-sm' 
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                 >
                    {isValidatingDrive ? (
                        <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    ) : (
                        <DriveIcon />
                    )}
                    <div className="flex flex-col items-center">
                        <span className={`text-xs font-semibold ${formData.librarySource === 'drive' ? 'text-blue-700' : 'text-gray-700'}`}>Google Drive</span>
                        {formData.librarySource === 'drive' && (
                             <span className="text-[10px] text-blue-500 max-w-[80px] truncate">{formData.driveFolderName}</span>
                        )}
                    </div>
                 </button>

                 {/* Amazon S3 Option */}
                 <button
                    type="button"
                    onClick={handleConnectS3}
                    className={`relative overflow-hidden p-3 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all duration-300 ${
                        s3Status === 'connected' 
                        ? 'bg-orange-50 border-orange-200 ring-1 ring-orange-200 shadow-sm' 
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                 >
                     {s3Status === 'connecting' ? (
                        <div className="w-5 h-5 border-2 border-orange-200 border-t-orange-600 rounded-full animate-spin"></div>
                     ) : (
                        <S3Icon />
                     )}
                     <div className="flex flex-col items-center">
                        <span className={`text-xs font-semibold ${s3Status === 'connected' ? 'text-orange-800' : 'text-gray-700'}`}>Amazon S3</span>
                        {s3Status === 'connected' && <span className="text-[10px] text-orange-500">Active</span>}
                     </div>
                 </button>
             </div>
             <p className="text-[10px] text-gray-400 text-center">
                {formData.librarySource === 'drive' 
                    ? `Scanning folder for ad layouts.` 
                    : formData.librarySource === 's3' 
                        ? "Using connected S3 Bucket assets." 
                        : "Using Ad Genie's curated high-converting templates."}
             </p>
        </div>

        {/* Simplified Asset Sections */}
        <div className="space-y-4 pt-6 border-t border-dashed border-gray-200">
             <div className="flex items-start justify-between gap-4">
                 <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Palette</label>
                    <div className="flex flex-wrap gap-2">
                        {formData.colors.map((color, idx) => (
                        <button key={idx} type="button" onClick={() => removeColor(color)} className="w-8 h-8 rounded-full shadow-sm border border-gray-100 relative group">
                            <div className="w-full h-full rounded-full" style={{ backgroundColor: color }} />
                            <div className="absolute inset-0 bg-black/20 rounded-full hidden group-hover:flex items-center justify-center text-white text-xs">×</div>
                        </button>
                        ))}
                        <div className="relative">
                            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="opacity-0 absolute inset-0 w-8 h-8 cursor-pointer" />
                            <button type="button" onClick={addColor} className="w-8 h-8 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-black bg-gray-50">+</button>
                        </div>
                    </div>
                 </div>

                 <div className="w-1/3">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Logo</label>
                    {formData.logo ? (
                        <div className="relative group w-full h-12">
                            <img src={formData.logo} alt="Logo" className="w-full h-full object-contain border border-gray-100 rounded-lg p-1 bg-gray-50" />
                            <button onClick={() => setFormData(prev => ({...prev, logo: null}))} className="absolute -top-1 -right-1 bg-gray-900 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100">×</button>
                        </div>
                    ) : (
                    <label className="cursor-pointer h-12 border border-gray-200 bg-gray-50 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-900 transition-all w-full flex items-center justify-center gap-1">
                        <span>📂</span> Upload
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                    )}
                 </div>
             </div>
        </div>

        <div className="pt-6 border-t border-dashed border-gray-200">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ad Concept & Copy</label>
          <textarea
            name="adCopy"
            value={formData.adCopy}
            onChange={handleChange}
            required
            rows={4}
            placeholder="Describe your ad campaign..."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:ring-1 focus:ring-black focus:border-black outline-none resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Voice</label>
                <div className="relative">
                    <select name="brandVoice" value={formData.brandVoice} onChange={handleChange} className="w-full appearance-none px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-medium focus:outline-none focus:border-black">
                        <option value="">Default</option>
                        <option value="Professional">Professional</option>
                        <option value="Playful">Playful</option>
                        <option value="Luxury">Luxury</option>
                        <option value="Urgent">Urgent</option>
                    </select>
                </div>
             </div>
             <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Typography</label>
                <div className="relative">
                    <select name="typography" value={formData.typography} onChange={handleChange} className="w-full appearance-none px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-medium focus:outline-none focus:border-black">
                        <option value="">Default</option>
                        <option value="Modern Sans">Modern Sans</option>
                        <option value="Classic Serif">Classic Serif</option>
                        <option value="Bold Display">Bold Display</option>
                    </select>
                </div>
             </div>
        </div>

        <div className="mt-auto pt-6">
          <button
            type="submit"
            disabled={isLoading || isValidatingDrive}
            className="w-full bg-black text-white font-semibold py-4 rounded-xl shadow-lg transition-all hover:bg-gray-800 disabled:opacity-50 flex justify-center items-center space-x-2"
          >
            {isLoading ? (
                <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Processing...</span>
                </>
            ) : (
                <><span>✨</span><span>Generate Options</span></>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InputForm;
