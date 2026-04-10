import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { updateProfile, uploadProfileImage, deleteProfileImage } from '../../api/orbs';
import { useToastStore } from '../../stores/toastStore';

interface ProfileEditorModalProps {
  person: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
}

const SOCIAL_ACCOUNTS = [
  { key: 'linkedin_url', label: 'LinkedIn', icon: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z', color: '#0A66C2' },
  { key: 'github_url', label: 'GitHub', icon: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12', color: '#fff' },
  { key: 'twitter_url', label: 'X / Twitter', icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z', color: '#fff' },
  { key: 'website_url', label: 'Website', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z', color: '#60a5fa' },
  { key: 'scholar_url', label: 'Google Scholar', icon: 'M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 100 14 7 7 0 000-14z', color: '#4285F4' },
] as const;

function extractInitialValues(person: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const account of SOCIAL_ACCOUNTS) {
    values[account.key] = (person[account.key] as string) || '';
  }
  values.headline = (person.headline as string) || '';
  values.location = (person.location as string) || '';
  return values;
}

export default function ProfileEditorModal({ person, onClose, onSaved }: ProfileEditorModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [values, setValues] = useState<Record<string, string>>(() => extractInitialValues(person));
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDeleteConfirmPhoto, setShowDeleteConfirmPhoto] = useState(false);
  const photoRemovedRef = useRef(false);
  const [, forceRender] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValues(extractInitialValues(person));
  }, [person]);

  const profileImage = photoRemovedRef.current ? '' : ((person.profile_image as string) || (person.picture as string) || '');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('Please select an image file', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast('Image too large (max 2MB)', 'error');
      return;
    }

    setUploadingImage(true);
    try {
      await uploadProfileImage(file);
      photoRemovedRef.current = false;
      addToast('Profile picture updated', 'success');
      onSaved();
    } catch {
      addToast('Failed to upload profile picture', 'error');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageDelete = async () => {
    setUploadingImage(true);
    try {
      await deleteProfileImage();
      photoRemovedRef.current = true;
      forceRender((n) => n + 1);
      addToast('Profile picture removed', 'info');
      onSaved();
      setShowDeleteConfirmPhoto(false);
    } catch {
      addToast('Failed to remove profile picture', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const props: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(values)) props[key] = value.trim();
      await updateProfile(props);
      addToast('Profile updated', 'success');
      onSaved();
    } catch {
      addToast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/75 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 24 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative w-full max-w-[95vw] sm:max-w-2xl rounded-3xl border border-white/12 bg-neutral-950 shadow-[0_28px_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-violet-500/15 via-purple-500/8 to-transparent" />

        <div className="relative border-b border-white/10 px-5 sm:px-6 py-5 sm:py-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-white/15 text-white/45 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center"
            aria-label="Close profile editor"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="flex items-start gap-4 sm:gap-5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage}
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/[0.04] border border-white/15 flex items-center justify-center flex-shrink-0 group cursor-pointer hover:border-blue-400/50 transition-all overflow-hidden"
              title="Upload profile picture"
            >
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-blue-200 text-xl font-bold">
                  {((person.name as string) || 'O').charAt(0).toUpperCase()}
                </span>
              )}
              <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingImage ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </div>
            </button>

            <div className="min-w-0 pt-1">
              <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold mb-1">Profile</p>
              <h2 className="text-white text-xl sm:text-2xl font-semibold truncate">{(person.name as string) || 'My Orbis'}</h2>
              <p className="text-white/50 text-xs sm:text-sm mt-1">Update your public identity, links, and profile image.</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="text-xs font-medium rounded-lg border border-blue-400/30 text-blue-200 hover:bg-blue-500/15 px-2.5 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {uploadingImage ? 'Uploading...' : 'Change photo'}
                </button>
                {profileImage && (
                  showDeleteConfirmPhoto ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleImageDelete}
                        disabled={uploadingImage}
                        className="text-xs font-medium rounded-lg border border-red-400/35 text-red-300 hover:bg-red-500/20 px-2.5 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {uploadingImage ? 'Removing...' : 'Confirm remove'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirmPhoto(false)}
                        className="text-xs font-medium rounded-lg border border-white/15 text-white/60 hover:text-white hover:bg-white/8 px-2.5 py-1.5 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirmPhoto(true)}
                      className="text-xs font-medium rounded-lg border border-red-400/20 text-red-300/85 hover:bg-red-500/15 px-2.5 py-1.5 transition-colors cursor-pointer"
                    >
                      Remove photo
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageUpload}
          />
        </div>

        <div className="relative px-5 sm:px-6 py-5 sm:py-6 max-h-[65vh] overflow-y-auto space-y-5">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold mb-3">Basic Info</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/65 mb-1.5">Headline</label>
                <input
                  value={values.headline}
                  onChange={(e) => setValues({ ...values, headline: e.target.value })}
                  placeholder="e.g. Senior Software Engineer"
                  className="w-full bg-black/35 border border-white/15 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-300/35"
                />
              </div>
              <div>
                <label className="block text-xs text-white/65 mb-1.5">Location</label>
                <input
                  value={values.location}
                  onChange={(e) => setValues({ ...values, location: e.target.value })}
                  placeholder="e.g. San Francisco, CA"
                  className="w-full bg-black/35 border border-white/15 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-blue-400/40 focus:border-blue-300/35"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold mb-3">Social Accounts</p>
            <div className="space-y-2.5">
              {SOCIAL_ACCOUNTS.map((account) => (
                <div
                  key={account.key}
                  className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2 hover:border-white/20 transition-colors"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/10"
                    style={{ backgroundColor: `${account.color}15` }}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={account.color}>
                      <path d={account.icon} />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-white/60 mb-1">{account.label}</p>
                    <input
                      value={values[account.key]}
                      onChange={(e) => setValues({ ...values, [account.key]: e.target.value })}
                      placeholder={`${account.label} URL`}
                      className="w-full bg-transparent text-white text-xs placeholder:text-white/25 focus:outline-none"
                    />
                  </div>

                  {values[account.key]?.trim() && (
                    <button
                      onClick={() => setValues({ ...values, [account.key]: '' })}
                      className="w-7 h-7 rounded-md text-white/35 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center flex-shrink-0 cursor-pointer"
                      aria-label={`Clear ${account.label}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="relative border-t border-white/10 bg-black/45 backdrop-blur px-5 sm:px-6 py-4 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="border border-white/15 text-white/70 hover:text-white hover:bg-white/10 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
