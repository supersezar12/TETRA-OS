export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  companyId?: string | null;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.companyId) {
    headers['X-Company-Id'] = options.companyId;
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const errMsg =
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as {error?: unknown}).error === 'string'
        ? (parsed as {error: string}).error
        : `Request failed with status ${response.status}`;
    throw new Error(errMsg);
  }

  return parsed as T;
}

export async function downloadAuthorizedFile(
  path: string,
  fallbackFilename: string,
  token: string,
  companyId?: string | null,
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (companyId) {
    headers['X-Company-Id'] = companyId;
  }
  const res = await fetch(path, {headers});
  if (!res.ok) {
    const errText = await res.text();
    let msg = `Download failed (${res.status})`;
    try {
      const json = JSON.parse(errText) as {error?: string};
      if (json.error) msg = json.error;
    } catch {
      // ignore non-json
    }
    throw new Error(msg);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match ? match[1] : fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return filename;
}
