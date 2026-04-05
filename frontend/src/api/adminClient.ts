import axios from 'axios';

const adminClient = axios.create({
  baseURL: '/api',
});

adminClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('orbis_admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('orbis_admin_token');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

export default adminClient;
