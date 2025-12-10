
import { AdTemplate } from '../types';
import { CONFIG } from '../config';
import { AD_LIBRARY } from '../constants';

const DB_NAME = 'AdGenieDB';
const STORE_NAME = 'templates';
const DB_VERSION = 1;

/**
 * Utility: Wait function
 */
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Utility: Retry Operation with Exponential Backoff
 */
const retryOperation = async <T>(
  operation: () => Promise<T>, 
  retries: number = 3, 
  baseDelay: number = 1000
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      console.warn(`Operation failed, retrying in ${baseDelay}ms...`, error);
      await wait(baseDelay);
      return retryOperation(operation, retries - 1, baseDelay * 2);
    }
    throw error;
  }
};

/**
 * IndexedDB Helper
 */
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

const getAllFromDB = async (): Promise<AdTemplate[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as AdTemplate[]);
        request.onerror = () => reject(request.error);
    });
};

const saveToDB = async (item: AdTemplate): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

const deleteFromDB = async (id: string): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

/**
 * MOCK Implementation (IndexedDB-based)
 * Used if backend is unreachable or disabled
 */
const mockStorage = {
  getLibrary: async (): Promise<AdTemplate[]> => {
    try {
        const stored = await getAllFromDB();
        if (stored.length === 0) {
            // Seed defaults if DB is empty
            for (const t of AD_LIBRARY) {
                await saveToDB(t);
            }
            return AD_LIBRARY;
        }
        return stored.reverse(); // Show newest first
    } catch (e) {
        console.error("IDB Error", e);
        return AD_LIBRARY;
    }
  },

  saveTemplate: async (template: AdTemplate): Promise<AdTemplate> => {
    await saveToDB(template);
    // Simulate network delay
    await wait(300);
    return template;
  },

  deleteTemplate: async (id: string): Promise<void> => {
    await deleteFromDB(id);
    await wait(100);
  }
};

/**
 * Real API Implementation with Retry Logic
 */
const apiStorage = {
  getLibrary: async (): Promise<AdTemplate[]> => {
    return retryOperation(async () => {
        const response = await fetch(`${CONFIG.BACKEND_API_URL}/images/library`);
        if (!response.ok) throw new Error('Failed to fetch library');
        return await response.json();
    });
  },

  uploadImage: async (file: File, metadata: Partial<AdTemplate>): Promise<AdTemplate> => {
    return retryOperation(async () => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('metadata', JSON.stringify(metadata));

        const response = await fetch(`${CONFIG.BACKEND_API_URL}/images/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error('Upload failed');
        return await response.json();
    });
  },

  deleteImage: async (id: string): Promise<void> => {
    return retryOperation(async () => {
        const response = await fetch(`${CONFIG.BACKEND_API_URL}/images/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Delete failed');
    });
  }
};

// --- Exported Facade ---

export const getLibrary = async (): Promise<AdTemplate[]> => {
  if (CONFIG.ENABLE_MOCK_FALLBACK) {
    try {
        // Try real API first, fall back if it fails
        return await apiStorage.getLibrary();
    } catch (e) {
        console.warn("Backend unreachable. Using IndexedDB fallback.");
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
           console.warn("Backend upload failed. Saving locally to IndexedDB.");
           // For local mock, we need to convert file to base64
           const base64 = await fileToBase64(file);
           const mockTemplate: AdTemplate = {
               id: `local-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
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
