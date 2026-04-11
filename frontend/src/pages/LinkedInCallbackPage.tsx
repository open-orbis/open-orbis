import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { hasOrbContent } from '../api/orbs';

export default function LinkedInCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginLinkedIn } = useAuthStore();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const savedState = sessionStorage.getItem('linkedin_oauth_state');

    if (!code || state !== savedState) {
      navigate('/');
      return;
    }
    sessionStorage.removeItem('linkedin_oauth_state');

    loginLinkedIn(code)
      .then(async () => {
        const returnTo = sessionStorage.getItem('orbis_return_to');
        if (returnTo) {
          sessionStorage.removeItem('orbis_return_to');
          navigate(returnTo, { replace: true });
          return;
        }
        const hasContent = await hasOrbContent();
        navigate(hasContent ? '/myorbis' : '/create');
      })
      .catch(() => navigate('/'));
  }, [searchParams, loginLinkedIn, navigate]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#0A66C2] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Signing you in with LinkedIn...</p>
      </div>
    </div>
  );
}
