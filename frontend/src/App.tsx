import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuthStore } from './stores/authStore';
import { useToastStore } from './stores/toastStore';
import LandingPage from './pages/LandingPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import LinkedInCallbackPage from './pages/LinkedInCallbackPage';
import CreateOrbPage from './pages/CreateOrbPage';
import AboutPage from './pages/AboutPage';
import OrbViewPage from './pages/OrbViewPage';
import SharedOrbPage from './pages/SharedOrbPage';
import CvExportPage from './pages/CvExportPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ToastContainer from './components/ToastContainer';
import ProtectedRoute from './components/ProtectedRoute';

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const pageTransition = { duration: 0.4, ease: 'easeInOut' };

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="min-h-screen bg-black"
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);

  // Handle global session-expired events from the API client
  useEffect(() => {
    const handler = () => {
      logout();
      addToast('Your session has expired. Please sign in again.', 'info');
      navigate('/', { replace: true });
    };
    window.addEventListener('orbis:session-expired', handler);
    return () => window.removeEventListener('orbis:session-expired', handler);
  }, [logout, addToast, navigate]);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><LandingPage /></PageWrapper>} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/linkedin/callback" element={<LinkedInCallbackPage />} />
        <Route path="/about" element={<PageWrapper><AboutPage /></PageWrapper>} />
        <Route path="/create" element={<ProtectedRoute><PageWrapper><CreateOrbPage /></PageWrapper></ProtectedRoute>} />
        <Route path="/myorbis" element={<ProtectedRoute><PageWrapper><OrbViewPage /></PageWrapper></ProtectedRoute>} />
        <Route path="/cv-export" element={<ProtectedRoute><CvExportPage /></ProtectedRoute>} />
        <Route path="/privacy" element={<PageWrapper><PrivacyPolicyPage /></PageWrapper>} />
        <Route path="/:orbId" element={<PageWrapper><SharedOrbPage /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const { token, fetchUser } = useAuthStore();

  useEffect(() => {
    if (token) fetchUser();
  }, [token, fetchUser]);

  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
      <BrowserRouter>
        <AnimatedRoutes />
        <ToastContainer />
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;
