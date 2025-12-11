
import { AdTemplate } from '../types';
import { CONFIG } from '../config';
import { AD_LIBRARY } from '../constants';

const LOCAL_STORAGE_KEY = 'ad_genie_library';

/**
 * MOCK Implementation for Demo Purposes
 * Used if backend is unreachable or disabled
 */
const mockStorage = {
  getLibrary: async (): Promise<AdTemplate[]> => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) {
       // Seed with default constants if empty
       localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(AD_LIBRARY));
       return AD_LIBRARY;
    }
    return JSON.parse(stored);
  },

  saveTemplate: async (template: AdTemplate): Promise<AdTemplate> => {
    const current = await mockStorage.getLibrary();
    const updated = [template, ...current];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800)); 
    return template;
  },

  deleteTemplate: async (id: string): Promise<void> => {
    const current = await mockStorage.getLibrary();
    const updated = current.filter(t => t.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    await new Promise(resolve => setTimeout(resolve, 300));
  }
};

/**
 * Real API Implementation
 */
const apiStorage = {
  getLibrary: async (): Promise<AdTemplate[]> => {
    const response = await fetch(`${CONFIG.BACKEND_API_URL}/images/library`);
    if (!response.ok) throw new Error('Failed to fetch library');
    return await response.json();
  },

  uploadImage: async (file: File, metadata: Partial<AdTemplate>): Promise<AdTemplate> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));

    const response = await fetch(`${CONFIG.BACKEND_API_URL}/images/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error('Upload failed');
    return await response.json();
  },

  deleteImage: async (id: string): Promise<void> => {
    const response = await fetch(`${CONFIG.BACKEND_API_URL}/images/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Delete failed');
  }
};

// --- Exported Facade ---

export const getLibrary = async (): Promise<AdTemplate[]> => {
  if (CONFIG.ENABLE_MOCK_FALLBACK) {
    try {
        // Try real API first, fall back if it fails
        return await apiStorage.getLibrary();
    } catch (e) {
        console.warn("Backend unreachable. Using local storage fallback.");
        return await mockStorage.getLibrary();
    }
  }
  return await apiStorage.getLibrary();
};

export const uploadTemplate = async (file: File, metadata: Partial<AdTemplate>): Promise<AdTemplate> => {
   if (CONFIG.ENABLE_MOCK_FALLBACK) {
       try {
           return await apiStorage.uploadImage(file, metadata);
       } catch (e) {
           console.warn("Backend upload failed. Saving locally.");
           // For local mock, we need to convert file to base64
           const base64 = await fileToBase64(file);
           const mockTemplate: AdTemplate = {
               id: `local-${Date.now()}`,
               imageUrl: base64,
               name: metadata.name || 'Uploaded Image',
               description: metadata.description || '',
               tags: metadata.tags || ['custom']
           };
           return await mockStorage.saveTemplate(mockTemplate);
       }
   }
   return await apiStorage.uploadImage(file, metadata);
};

export const deleteTemplate = async (id: string): Promise<void> => {
    if (CONFIG.ENABLE_MOCK_FALLBACK) {
        try {
            await apiStorage.deleteImage(id);
        } catch (e) {
             await mockStorage.deleteTemplate(id);
        }
        return;
    }
    await apiStorage.deleteImage(id);
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
};
