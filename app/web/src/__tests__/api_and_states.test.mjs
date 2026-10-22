import test from 'node:test';
import assert from 'node:assert/strict';

// Helper tests for API client headers and auth handling
function buildAuthHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function hasRole(userRole, allowedRoles) {
  if (!userRole) return false;
  if (userRole === 'admin') return true;
  return allowedRoles.includes(userRole);
}

function formatDeviation(pct) {
  if (pct === null || pct === undefined) return { label: 'No Data', color: 'gray' };
  if (pct > 20) return { label: 'High Increase', color: 'green' };
  if (pct < -20) return { label: 'Severe Decline', color: 'red' };
  return { label: 'Normal Seasonal Range', color: 'emerald' };
}

function evaluateQualityBadge(score) {
  if (score === null || score === undefined) return 'unassessed';
  if (score >= 0.70) return 'good';
  if (score >= 0.40) return 'acceptable';
  return 'poor';
}

test('Auth Header Builder produces Bearer token when logged in', () => {
  const headers = buildAuthHeader('jwt-test-token-xyz');
  assert.equal(headers.Authorization, 'Bearer jwt-test-token-xyz');

  const emptyHeaders = buildAuthHeader(null);
  assert.equal(emptyHeaders.Authorization, undefined);
});

test('RBAC Role hierarchy grants admin full access and restricts specific roles', () => {
  // Admin has access to everything
  assert.equal(hasRole('admin', ['gis_analyst']), true);
  assert.equal(hasRole('admin', ['reviewer']), true);
  assert.equal(hasRole('admin', ['viewer']), true);

  // gis_analyst has access only to gis_analyst permissions
  assert.equal(hasRole('gis_analyst', ['gis_analyst', 'admin']), true);
  assert.equal(hasRole('gis_analyst', ['reviewer']), false);

  // viewer is read-only
  assert.equal(hasRole('viewer', ['admin', 'gis_analyst']), false);
  assert.equal(hasRole('viewer', ['viewer']), true);

  // unauthenticated has no permissions
  assert.equal(hasRole(null, ['viewer']), false);
});

test('Seasonal deviation formatting handles positive, negative, and null values', () => {
  const normal = formatDeviation(5.2);
  assert.equal(normal.label, 'Normal Seasonal Range');
  assert.equal(normal.color, 'emerald');

  const decline = formatDeviation(-25.4);
  assert.equal(decline.label, 'Severe Decline');
  assert.equal(decline.color, 'red');

  const increase = formatDeviation(32.1);
  assert.equal(increase.label, 'High Increase');
  assert.equal(increase.color, 'green');

  const noData = formatDeviation(null);
  assert.equal(noData.label, 'No Data');
});

test('Photo quality badge threshold assigns accurate status', () => {
  assert.equal(evaluateQualityBadge(0.85), 'good');
  assert.equal(evaluateQualityBadge(0.65), 'acceptable');
  assert.equal(evaluateQualityBadge(0.20), 'poor');
  assert.equal(evaluateQualityBadge(null), 'unassessed');
});

// Storage mock for test isolation
function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

// Logic mirroring authContext.login() error handling
async function performLogin(usernameOrEmail, password, mockFetch, storage) {
  try {
    const res = await mockFetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username_or_email: usernameOrEmail.trim(),
        password: password,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      storage.setItem('varuni_auth_token', data.access_token);
      storage.setItem('varuni_auth_user', JSON.stringify(data.user));
      return { success: true };
    }

    if (res.status === 429) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: err.detail || 'Too many failed login attempts. Please wait a moment before trying again.',
      };
    }

    if (res.status === 401 || res.status === 400 || res.status === 403) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        error: err.detail || 'Invalid username/email or password. Please verify your credentials.',
      };
    }

    const err = await res.json().catch(() => ({}));
    return {
      success: false,
      error: err.detail || `Authentication failed (Server HTTP ${res.status}).`,
    };
  } catch {
    return {
      success: false,
      error: 'Server unreachable. Cannot connect to the authentication service. Please check your network or verify the backend is running.',
    };
  }
}

// Logic mirroring apiFetch 401 interceptor
function handleApiResponse(response, storage, location) {
  if (!response.ok) {
    if (response.status === 401) {
      storage.removeItem('varuni_auth_token');
      storage.removeItem('varuni_auth_user');
      if (location && location.pathname !== '/login') {
        location.href = '/login';
      }
    }
    throw new Error(`API Error ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

test('Failed login (network error) does not set a token and returns readable error', async () => {
  const storage = createMockStorage();
  const mockFetch = async () => {
    throw new Error('Failed to fetch (ECONNREFUSED)');
  };

  const result = await performLogin('admin', 'wrong_pass', mockFetch, storage);
  assert.equal(result.success, false);
  assert.match(result.error, /unreachable/i);
  assert.equal(storage.getItem('varuni_auth_token'), null);
  assert.equal(storage.getItem('varuni_auth_user'), null);
});

test('Failed login (401 invalid credentials) does not set a token', async () => {
  const storage = createMockStorage();
  const mockFetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ detail: 'Incorrect username or password' }),
  });

  const result = await performLogin('admin', 'bad_pass', mockFetch, storage);
  assert.equal(result.success, false);
  assert.match(result.error, /incorrect|invalid/i);
  assert.equal(storage.getItem('varuni_auth_token'), null);
  assert.equal(storage.getItem('varuni_auth_user'), null);
});

test('Failed login (429 rate limit) does not set a token', async () => {
  const storage = createMockStorage();
  const mockFetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ detail: 'Rate limit exceeded: 5 attempts per 60s' }),
  });

  const result = await performLogin('admin', 'pass', mockFetch, storage);
  assert.equal(result.success, false);
  assert.match(result.error, /rate limit|attempts/i);
  assert.equal(storage.getItem('varuni_auth_token'), null);
});

test('A 401 response from the API clears the stored session and redirects to /login', () => {
  const storage = createMockStorage();
  storage.setItem('varuni_auth_token', 'valid-looking-jwt-token');
  storage.setItem('varuni_auth_user', JSON.stringify({ username: 'admin', role: 'admin' }));

  const location = { pathname: '/dashboard', href: '/dashboard' };
  const mockResponse = {
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
  };

  assert.throws(
    () => handleApiResponse(mockResponse, storage, location),
    /API Error 401/
  );

  // Session must be completely cleared
  assert.equal(storage.getItem('varuni_auth_token'), null);
  assert.equal(storage.getItem('varuni_auth_user'), null);
  // Redirection to /login must occur
  assert.equal(location.href, '/login');
});

test('Successful login sets token and user in storage', async () => {
  const storage = createMockStorage();
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'signed-access-token-2026',
      user: { username: 'analyst', role: 'gis_analyst' },
    }),
  });

  const result = await performLogin('analyst', 'correct_pass', mockFetch, storage);
  assert.equal(result.success, true);
  assert.equal(storage.getItem('varuni_auth_token'), 'signed-access-token-2026');
  assert.deepEqual(JSON.parse(storage.getItem('varuni_auth_user')), { username: 'analyst', role: 'gis_analyst' });
});

