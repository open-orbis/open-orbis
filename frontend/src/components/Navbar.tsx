import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import UserMenu from './UserMenu';

interface NavbarProps {
  /** Optional center content (e.g. page title, node count) */
  center?: React.ReactNode;
  /** Optional right content placed before the user menu */
  rightBefore?: React.ReactNode;
  /** Hide the Orbis ID search bar */
  hideSearch?: boolean;
}

export default function Navbar({ center, rightBefore, hideSearch }: NavbarProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchValue, setSearchValue] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);

  const handleSearch = () => {
    const orbId = searchValue.trim();
    if (!orbId) return;
    setSearchValue('');
    setSearchExpanded(false);
    navigate(`/${orbId}`);
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-30 px-3 sm:px-5 py-2 sm:py-3">
      <div className="flex items-center justify-between gap-3">
        {/* Left: logo */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 cursor-pointer group"
          title="Go to My Orbis"
        >
          <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center group-hover:bg-purple-600/50 transition-colors">
            <div className="w-3 h-3 rounded-full bg-purple-400" />
          </div>
          <span className="text-white font-bold text-sm tracking-tight hidden sm:inline">OpenOrbis</span>
        </button>

        {/* Center */}
        {center && <div className="flex-1 flex justify-center min-w-0">{center}</div>}

        {/* Right */}
        <div className="flex items-center gap-2">
          {rightBefore}

          {/* Search by Orbis ID — authenticated only, hidden on some pages */}
          {user && !hideSearch && (
            <>
              {/* Mobile: icon toggle */}
              <button
                onClick={() => setSearchExpanded((v) => !v)}
                className="sm:hidden w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 text-white/50 hover:text-white transition-all"
                title="Search by Orbis ID"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Desktop: always visible */}
              <form
                onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
                className={`items-center gap-1.5 ${searchExpanded ? 'flex' : 'hidden sm:flex'}`}
              >
                <div className="flex items-center bg-white/10 border border-white/15 rounded-lg px-2.5 py-1.5 focus-within:border-purple-500/50 focus-within:bg-white/15 transition-all">
                  <svg className="w-3.5 h-3.5 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Search Orbis ID..."
                    className="bg-transparent text-white text-xs placeholder-white/30 focus:outline-none ml-2 w-28 sm:w-36"
                    onBlur={() => { if (!searchValue) setSearchExpanded(false); }}
                  />
                </div>
              </form>
            </>
          )}

          <UserMenu />
        </div>
      </div>
    </div>
  );
}
