import React from 'react';
import { X } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export const Sidebar = ({ isOpen, onClose }: { isOpen?: boolean, onClose?: () => void }) => {
    const location = useLocation(); // Get the current route

    return (
        <div className={`fixed md:relative inset-y-0 left-0 w-41 h-screen bg-black text-white p-6 flex flex-col z-50 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out`}>
            {/* Close button for mobile */}
            <button
                className="md:hidden absolute top-4 right-4 text-gray-400 hover:text-white"
                onClick={onClose}
            >
                <X className="w-6 h-6" />
            </button>

            {/* User profile section with right-sided curve */}
            <div
                className="mb-8 px-4 py-3 rounded-tr-full rounded-br-full "
                style={{
                    backgroundColor: 'rgba(30, 30, 30, 1)',
                    borderTopRightRadius: '24px',
                    borderBottomRightRadius: '24px',
                }}
            >
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center text-xl font-bold">
                        AG
                    </div>
                    <div>
                        <h2 className="">Alex Goldburg</h2>
                        <p className="text-gray-400 text-sm border-white">Contributor</p>
                    </div>
                </div>
            </div>

            {/* Navigation links */}
            <nav className="flex-1">
                <ul className="space-y-2">
                    <li>
                        <a
                            href="/"
                            className={`flex items-center gap-3 p-3 rounded-full text-white transition-all duration-200 ${location.pathname === '/' ? 'bg-[rgba(30,30,30,1)]' : 'hover:bg-[rgba(30,30,30,0.5)]'
                                }`}
                        >
                            <img src="Group 1.png" alt="Dashboard Icon" />
                            <span>Dashboard</span>
                        </a>
                    </li>
                    <li>
                        <a
                            href="/earnings"
                            className={`flex items-center gap-3 p-3 rounded-full text-white transition-all duration-200 ${location.pathname === '/earnings' ? 'bg-[rgba(30,30,30,1)]' : 'hover:bg-[rgba(30,30,30,0.5)]'
                                }`}
                        >
                            <img src="Vector (7).png" alt="Earning Icon" />
                            <span>Earning</span>
                        </a>
                    </li>
                    <li>
                        <a
                            href="/referral"
                            className={`flex items-center gap-3 p-3 rounded-full text-white transition-all duration-200 ${location.pathname === '/referral' ? 'bg-[rgba(30,30,30,1)]' : 'hover:bg-[rgba(30,30,30,0.5)]'
                                }`}
                        >
                            <img src="1.png" alt="Referral Icon" />
                            <span>Referral</span>
                        </a>
                    </li>
                    <li>
                        <a
                            href="/global-statistics"
                            className={`flex items-center gap-3 p-3 rounded-full text-white transition-all duration-200 ${location.pathname === '/global-statistics' ? 'bg-[rgba(30,30,30,1)]' : 'hover:bg-[rgba(30,30,30,0.5)]'
                                }`}
                        >
                            <img src="Group 2.png" alt="Global Statistics Icon" />
                            <span>Global Statistics</span>
                        </a>
                    </li>
                </ul>
            </nav>
        </div>
    );
};