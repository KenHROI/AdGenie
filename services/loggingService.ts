import { supabase } from './supabaseClient';

export const logInfo = async (message: string, data?: any) => {
    // Also log to console for development visibility (optional, can be removed if strictly no-console)
    console.log(`[INFO] ${message}`, data || '');
    if (supabase) {
        await supabase.from('logs').insert({ level: 'INFO', message, data });
    }
};

export const logError = async (message: string, data?: any) => {
    console.error(`[ERROR] ${message}`, data || '');
    if (supabase) {
        await supabase.from('logs').insert({ level: 'ERROR', message, data });
    }
};

export const fetchLogs = async (limit = 100) => {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Failed to fetch logs", error);
        return [];
    }
    return data;
};
