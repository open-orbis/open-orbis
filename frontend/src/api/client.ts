import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('orbis_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = localStorage.getItem('orbis_token') !== null;
      localStorage.removeItem('orbis_token');
      // Notify the app — handled in App.tsx (toast + soft navigation)
      if (hadToken) {
        window.dispatchEvent(new CustomEvent('orbis:session-expired'));
      }
    }
    return Promise.reject(error);
  }
);

export default client;
