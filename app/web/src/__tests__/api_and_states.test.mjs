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
