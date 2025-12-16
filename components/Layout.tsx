
import React from 'react';
import { AppStep } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentStep: AppStep;
  onNavigate: (step: AppStep) => void;
}

const SidebarItem = ({
  icon,
  label,
  active = false,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${active
        ? 'bg-gray-50 text-black font-medium'
        : 'text-gray-500 hover:text-black hover:bg-gray-50'
      }`}
  >
    <span className={`text-xl transition-transform duration-200 ${active ? 'scale-100' : 'scale-90 group-hover:scale-100'}`}>
      {icon}
    </span>
    <span className="text-sm font-medium">{label}</span>
  </button>
);

const Layout: React.FC<LayoutProps> = ({ children, currentStep, onNavigate }) => {
  return (
    <div className="h-screen flex overflow-hidden bg-white font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-72 flex-shrink-0 flex flex-col justify-between p-6 border-r border-gray-100 bg-white z-20">
        <div>
          {/* Logo area */}
          <div className="flex items-center space-x-3 mb-12 px-2">
            <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center shadow-md relative overflow-hidden">
              {/* Abstract Genie Lamp / Spark Icon */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L14.4 7.2L20 9.6L14.4 12L12 17.2L9.6 12L4 9.6L9.6 7.2L12 2Z" fill="url(#paint0_linear)" />
                <defs>
                  <linearGradient id="paint0_linear" x1="12" y1="2" x2="12" y2="17.2" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#E2E8F0" />
                    <stop offset="1" stopColor="#FFFFFF" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent"></div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-none tracking-tight">Ad Genie</h1>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Pro Studio</span>
            </div>
          </div>

          {/* Menu */}
          <nav className="space-y-1">
            <SidebarItem
              icon="✨"
              label="Create Campaign"
              active={currentStep !== AppStep.SETTINGS}
              onClick={() => onNavigate(AppStep.INPUT)}
            />
            <SidebarItem
              icon="⚙️"
              label="Settings"
              active={currentStep === AppStep.SETTINGS}
              onClick={() => onNavigate(AppStep.SETTINGS)}
            />
            <SidebarItem
              icon="📂"
              label="Campaigns"
              active={currentStep === AppStep.CAMPAIGNS}
              onClick={() => onNavigate(AppStep.CAMPAIGNS)}
            />
          </nav>
        </div>

        {/* User Profile / Footer */}
        <div className="mt-auto pt-6 border-t border-gray-100">
          <div className="flex items-center p-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group">
            <div className="relative">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200" />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-black">Demo User</p>
              <p className="text-xs text-gray-400 truncate">Pro Plan</p>
            </div>
            <svg className="w-4 h-4 ml-auto text-gray-300 group-hover:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden bg-white relative">
        <div className="absolute inset-0 p-4 lg:p-6 overflow-hidden flex">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
