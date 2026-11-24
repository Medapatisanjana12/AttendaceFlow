export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '') : '') ||
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:5000');

export const API_BASE_URL = `${BACKEND_URL}/api`;
