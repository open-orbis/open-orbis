import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from './stores/authStore';
import LandingPage from './pages/LandingPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import CreateOrbPage from './pages/CreateOrbPage';
import AboutPage from './pages/AboutPage';
import OrbViewPage from './pages/OrbViewPage';
import SharedOrbPage from './pages/SharedOrbPage';
import CvExportPage from './pages/CvExportPage';
import ToastContainer from './components/ToastContainer';

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

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><LandingPage /></PageWrapper>} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/about" element={<PageWrapper><AboutPage /></PageWrapper>} />
        <Route path="/create" element={<PageWrapper><CreateOrbPage /></PageWrapper>} />
        <Route path="/orb" element={<PageWrapper><OrbViewPage /></PageWrapper>} />
        <Route path="/cv-export" element={<CvExportPage />} />
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
    <BrowserRouter>
      <AnimatedRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
