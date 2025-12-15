import React, { useEffect, useState } from 'react';
import { fetchLogs } from '../services/loggingService';
import { format } from 'date-fns';

interface LogEntry {
    id: string;
    timestamp: string;
    level: string;
    message: string;
    data: any;
}

interface LogsViewerProps {
    onClose: () => void;
}

const LogsViewer: React.FC<LogsViewerProps> = ({ onClose }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const loadLogs = async () => {
        setLoading(true);
        const data = await fetchLogs(50);
        setLogs(data);
        setLoading(false);
    };

    useEffect(() => {
        loadLogs();
    }, []);

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="text-lg font-bold text-gray-900">System Logs</h3>
                    <div className="flex gap-2">
                        <button onClick={loadLogs} className="p-2 hover:bg-gray-200 rounded-lg text-gray-600">
                            🔄 Refresh
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg text-gray-500">
                            ✕ Close
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50 font-mono text-sm">
                    {loading ? (
                        <div className="flex justify-center py-10 text-gray-400">Loading logs...</div>
                    ) : logs.length === 0 ? (
                        <div className="flex justify-center py-10 text-gray-400">No logs found.</div>
                    ) : (
                        <div className="space-y-2">
                            {logs.map((log) => (
                                <div key={log.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${log.level === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {log.level}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {format(new Date(log.timestamp), 'MMM d, HH:mm:ss')}
                                        </span>
                                    </div>
                                    <div className="text-gray-800 break-words">{log.message}</div>
                                    {log.data && (
                                        <pre className="mt-2 text-[10px] bg-gray-50 p-2 rounded overflow-x-auto text-gray-500">
                                            {JSON.stringify(log.data, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LogsViewer;
