import { useNavigate } from 'react-router-dom';
import UserMenu from './UserMenu';

interface NavbarProps {
  /** Optional center content (e.g. page title, node count) */
  center?: React.ReactNode;
  /** Optional right content placed before the user menu */
  rightBefore?: React.ReactNode;
}

export default function Navbar({ center, rightBefore }: NavbarProps) {
  const navigate = useNavigate();

  return (
    <div className="absolute top-0 left-0 right-0 z-30 px-3 sm:px-5 py-2 sm:py-3">
      <div className="flex items-center justify-between gap-3">
        {/* Left: logo */}
        <button
          onClick={() => navigate('/myorbis')}
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
          <UserMenu />
        </div>
      </div>
    </div>
  );
}
