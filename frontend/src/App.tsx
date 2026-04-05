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
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import ToastContainer from './components/ToastContainer';
import { initTracker, identifyUser } from './analytics/tracker';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminLLMPage from './pages/admin/AdminLLMPage';
import AdminEventsPage from './pages/admin/AdminEventsPage';
import AdminRoute from './components/admin/AdminRoute';

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
        <Route path="/privacy" element={<PageWrapper><PrivacyPolicyPage /></PageWrapper>} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="/admin/llm" element={<AdminRoute><AdminLLMPage /></AdminRoute>} />
        <Route path="/admin/events" element={<AdminRoute><AdminEventsPage /></AdminRoute>} />
        <Route path="/:orbId" element={<PageWrapper><SharedOrbPage /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const { token, fetchUser } = useAuthStore();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    initTracker();
  }, []);

  useEffect(() => {
    if (user) {
      identifyUser(user.user_id);
    }
  }, [user]);

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
