import React, { createContext, useContext, useState, useEffect } from 'react';
import { SettingsState, ServiceConfig } from '../types';
import { CONFIG } from '../config';

const STORAGE_KEY = 'adgenie_settings_v1';

const DEFAULT_SETTINGS: SettingsState = {
    theme: 'light',
    notifications: true,
    apiKeys: {
        google: CONFIG.GEMINI_API_KEY,
        kie: CONFIG.KIE_API_KEY,
        openRouter: CONFIG.OPENROUTER_API_KEY,
    },
    services: {
        analysis: { provider: 'google', isEnabled: true },
        vision: { provider: 'google', isEnabled: true },
        imageGeneration: { provider: 'google', isEnabled: true },
    },
    openRouterModels: [],
    kieModels: [],
};

interface SettingsContextType {
    settings: SettingsState;
    updateSettings: (newSettings: Partial<SettingsState>) => void;
    updateApiKey: (provider: keyof SettingsState['apiKeys'], key: string) => void;
    updateService: (service: keyof SettingsState['services'], config: Partial<ServiceConfig>) => void;
    resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<SettingsState>(() => {
        // Load from local storage or fall back to defaults
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Merge with defaults to ensure new fields are present
                return {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                    apiKeys: {
                        google: parsed.apiKeys?.google || DEFAULT_SETTINGS.apiKeys.google,
                        kie: parsed.apiKeys?.kie || DEFAULT_SETTINGS.apiKeys.kie,
                        openRouter: parsed.apiKeys?.openRouter || DEFAULT_SETTINGS.apiKeys.openRouter,
                    }
                };
            }
        } catch (e) {
            console.error("Failed to load settings:", e);
        }
        return DEFAULT_SETTINGS;
    });

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error("Failed to save settings:", e);
        }
    }, [settings]);

    const updateSettings = (newSettings: Partial<SettingsState>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const updateApiKey = (provider: keyof SettingsState['apiKeys'], key: string) => {
        setSettings(prev => ({
            ...prev,
            apiKeys: { ...prev.apiKeys, [provider]: key }
        }));
    };

    const updateService = (service: keyof SettingsState['services'], config: Partial<ServiceConfig>) => {
        setSettings(prev => ({
            ...prev,
            services: {
                ...prev.services,
                [service]: { ...prev.services[service], ...config }
            }
        }));
    };

    const resetSettings = () => {
        setSettings(DEFAULT_SETTINGS);
        localStorage.removeItem(STORAGE_KEY);
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, updateApiKey, updateService, resetSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
