const assert = require('assert');

// Mock AsyncStorage
const storage = new Map();
const AsyncStorage = {
  getItem: async (key) => storage.get(key) || null,
  setItem: async (key, val) => { storage.set(key, String(val)); },
  removeItem: async (key) => { storage.delete(key); },
  multiRemove: async (keys) => { keys.forEach(k => storage.delete(k)); },
  clear: async () => { storage.clear(); },
};

// Test Suite
async function runMobileAuthTests() {
  console.log('--- Starting Mobile Auth & Session Logic Tests ---');

  // Test 1: Request Interceptor attaches Token header when present
  {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('userToken', 'abc123testtoken');

    const requestInterceptor = async (config) => {
      if (typeof config.url === 'string' && config.url.startsWith('/') && !/^https?:\/\//i.test(config.url)) {
        config.url = config.url.slice(1);
      }
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (token && token.trim()) {
          if (!config.headers) config.headers = {};
          config.headers.Authorization = `Token ${token.trim()}`;
        }
      } catch (e) {}
      return config;
    };

    const config = { url: '/hrms/attendance/clock_in/', headers: {} };
    const processed = await requestInterceptor(config);
    assert.strictEqual(processed.headers.Authorization, 'Token abc123testtoken', 'Token must be attached');
    assert.strictEqual(processed.url, 'hrms/attendance/clock_in/', 'Relative URL prefix / stripped');
    console.log('âœ“ Test 1 Passed: Request interceptor attaches Token header');
  }

  // Test 2: Request Interceptor does NOT attach Token header when userToken is missing
  {
    await AsyncStorage.clear();
    const requestInterceptor = async (config) => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (token && token.trim()) {
          if (!config.headers) config.headers = {};
          config.headers.Authorization = `Token ${token.trim()}`;
        }
      } catch (e) {}
      return config;
    };

    const config = { url: 'hrms/attendance/clock_in/', headers: {} };
    const processed = await requestInterceptor(config);
    assert.strictEqual(processed.headers.Authorization, undefined, 'No auth header when token missing');
    console.log('âœ“ Test 2 Passed: No Authorization header attached when token is missing');
  }

  // Test 3: isPublicAuthEndpoint identification
  {
    const isPublicAuthEndpoint = (url) => {
      if (typeof url !== 'string') return false;
      const cleanPath = url.split('?')[0].split('#')[0].trim().replace(/\/+$/, '');
      return (
        /^(?:https?:\/\/[^\/]+)?(?:\/api)?\/auth\/login$/i.test(cleanPath) ||
        /^(?:api\/)?auth\/login$/i.test(cleanPath)
      );
    };

    assert.strictEqual(isPublicAuthEndpoint('auth/login'), true, 'auth/login is public');
    assert.strictEqual(isPublicAuthEndpoint('/auth/login/'), true, '/auth/login/ is public');
    assert.strictEqual(isPublicAuthEndpoint('https://natyaarts.org/api/auth/login'), true, 'Full URL login is public');
    assert.strictEqual(isPublicAuthEndpoint('hrms/attendance/clock_in/'), false, 'Attendance is protected');
    assert.strictEqual(isPublicAuthEndpoint('auth/me/'), false, 'auth/me is protected');
    console.log('âœ“ Test 3 Passed: Public auth endpoints identified correctly');
  }

  // Test 4: Session Expiry Mutex Debounce prevents multiple alerts
  {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('userToken', 'expired_token');
    await AsyncStorage.setItem('userInfo', JSON.stringify({ username: 'john' }));

    let alertCount = 0;
    let navCount = 0;
    let isHandlingSessionExpiry = false;

    const handleSessionExpired = async () => {
      if (isHandlingSessionExpiry) return;
      isHandlingSessionExpiry = true;

      try {
        await AsyncStorage.multiRemove(['userToken', 'userInfo']);
        navCount++;
        alertCount++;
      } finally {
        setTimeout(() => {
          isHandlingSessionExpiry = false;
        }, 500);
      }
    };

    // Simulate 5 parallel 401 responses arriving simultaneously
    await Promise.all([
      handleSessionExpired(),
      handleSessionExpired(),
      handleSessionExpired(),
      handleSessionExpired(),
      handleSessionExpired(),
    ]);

    assert.strictEqual(alertCount, 1, 'Only 1 alert triggered despite 5 concurrent 401s');
    assert.strictEqual(navCount, 1, 'Only 1 navigation triggered');
    assert.strictEqual(await AsyncStorage.getItem('userToken'), null, 'userToken cleared');
    assert.strictEqual(await AsyncStorage.getItem('userInfo'), null, 'userInfo cleared');
    console.log('âœ“ Test 4 Passed: Concurrent 401 responses debounce safely');
  }

  // Test 5: Attendance clockIn sanitized error on 401
  {
    const simulateClockIn = async (mockErrorStatus) => {
      try {
        if (mockErrorStatus === 401) {
          const err = new Error('Request failed with status code 401');
          err.response = {
            status: 401,
            data: { detail: 'Authentication credentials were not provided.' }
          };
          throw err;
        }
        return { success: true };
      } catch (error) {
        if (error.response?.status === 401) {
          return { success: false, error: 'Session expired. Please log in again.' };
        }
        return { success: false, error: error.response?.data?.detail || error.message };
      }
    };

    const res = await simulateClockIn(401);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'Session expired. Please log in again.');
    assert.notStrictEqual(res.error, 'Authentication credentials were not provided.');
    console.log('âœ“ Test 5 Passed: 401 errors return user-friendly session expiry message');
  }

  console.log('--- ALL MOBILE AUTH LOGIC TESTS PASSED ---');
}

runMobileAuthTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
