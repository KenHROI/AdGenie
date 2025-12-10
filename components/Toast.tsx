
import React from 'react';
import { useNotification } from '../context/NotificationContext';

const ToastContainer: React.FC = () => {
  const { notifications, removeToast } = useNotification();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none">
      {notifications.map((note) => (
        <div
          key={note.id}
          className={`pointer-events-auto flex items-center p-4 rounded-xl shadow-lg border animate-slide-in-right max-w-sm ${
            note.type === 'error'
              ? 'bg-white border-red-100 text-red-600'
              : note.type === 'success'
              ? 'bg-black text-white border-black'
              : 'bg-white border-gray-100 text-gray-800'
          }`}
        >
          <div className="flex-shrink-0 mr-3">
            {note.type === 'success' && (
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {note.type === 'error' && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {note.type === 'info' && (
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="text-sm font-medium">{note.message}</div>
          <button
            onClick={() => removeToast(note.id)}
            className="ml-auto pl-4 text-xs opacity-50 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
