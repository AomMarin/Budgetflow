import { API_BASE_URL } from './api';

const HEALTH_URL = `${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}/health`;

export async function warmUpBackend(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL);
    return res.ok;
  } catch {
    return false;
  }
}
