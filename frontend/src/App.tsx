import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import LandingPage from './pages/LandingPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import CreateOrbPage from './pages/CreateOrbPage';
import AboutPage from './pages/AboutPage';
import OrbViewPage from './pages/OrbViewPage';
import SharedOrbPage from './pages/SharedOrbPage';
import CvExportPage from './pages/CvExportPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ToastContainer from './components/ToastContainer';

const scrollPositions: Record<string, number> = {};

function ScrollManager() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      scrollPositions[prevPathname.current] = window.scrollY;
      prevPathname.current = pathname;
    }

    if (navType === 'POP' && scrollPositions[pathname] != null) {
      window.scrollTo(0, scrollPositions[pathname]);
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, navType]);

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/create" element={<CreateOrbPage />} />
      <Route path="/myorbis" element={<OrbViewPage />} />
      <Route path="/cv-export" element={<CvExportPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/:orbId" element={<SharedOrbPage />} />
    </Routes>
  );
}

function App() {
  const { token, fetchUser } = useAuthStore();

  useEffect(() => {
    if (token) fetchUser();
  }, [token, fetchUser]);

  return (
    <BrowserRouter>
      <ScrollManager />
      <AppRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
