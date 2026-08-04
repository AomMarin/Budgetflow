import { API_BASE_URL } from './api';

const HEALTH_URL = `${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}/health`;

export function warmUpBackend() {
  fetch(HEALTH_URL).catch(() => {});
}
