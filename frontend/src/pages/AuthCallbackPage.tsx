import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { hasOrbContent } from '../api/orbs';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginGoogle } = useAuthStore();

  useEffect(() => {
    const goToPostLogin = async () => {
      // Honor a pending return-to URL (e.g. OAuth consent flow where the
      // user was bounced to /oauth/authorize?... before signing in).
      // Mirrors LinkedInCallbackPage's behavior.
      const returnTo = sessionStorage.getItem('orbis_return_to');
      if (returnTo) {
        sessionStorage.removeItem('orbis_return_to');
        navigate(returnTo, { replace: true });
        return;
      }
      const hasContent = await hasOrbContent();
      navigate(hasContent ? '/myorbis' : '/create');
    };

    // Google redirect flow: ?code=
    const code = searchParams.get('code');
    if (code) {
      loginGoogle(code)
        .then(goToPostLogin)
        .catch(() => navigate('/'));
      return;
    }

    navigate('/');
  }, [searchParams, loginGoogle, navigate]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Signing you in...</p>
      </div>
    </div>
  );
}
