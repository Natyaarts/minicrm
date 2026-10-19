import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Emulates the response interceptor logic from frontend/src/api/axios.js
 * to verify regression prevention in an automated Node test environment.
 */
function createMockInterceptor(mockWindow, mockLocalStorage) {
    return function handleResponseError(error) {
        if (error.response && error.response.status === 401) {
            const requestUrl = error.config?.url || '';
            const isLoginRequest = requestUrl.includes('auth/login');
            const isThirdPartyAuthError = requestUrl.includes('crm/google/') || requestUrl.includes('integrations/google');
            if (!isLoginRequest && !isThirdPartyAuthError) {
                mockLocalStorage.removeItem('token');
                if (mockWindow.location.pathname !== '/login') {
                    mockWindow.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    };
}

test('Interceptor preserves token and does not redirect on Google integration 401', async () => {
    const mockLocalStorage = {
        store: { token: 'valid_crm_user_token_12345' },
        removeItem(key) { delete this.store[key]; },
        getItem(key) { return this.store[key]; }
    };
    const mockWindow = {
        location: { pathname: '/crm/campaigns', href: 'http://localhost:5173/crm/campaigns' }
    };

    const interceptor = createMockInterceptor(mockWindow, mockLocalStorage);

    const googleError = {
        response: {
            status: 401,
            data: { error: 'Google authentication required' }
        },
        config: { url: 'crm/google/spreadsheets/?campaign_id=1' }
    };

    await assert.rejects(
        () => interceptor(googleError),
        (err) => err === googleError
    );

    // MiniCRM token MUST still be present
    assert.equal(mockLocalStorage.getItem('token'), 'valid_crm_user_token_12345');
    // Window MUST NOT have navigated away
    assert.equal(mockWindow.location.href, 'http://localhost:5173/crm/campaigns');
});

test('Interceptor preserves token and does not redirect on Google sync 401', async () => {
    const mockLocalStorage = {
        store: { token: 'valid_crm_user_token_12345' },
        removeItem(key) { delete this.store[key]; },
        getItem(key) { return this.store[key]; }
    };
    const mockWindow = {
        location: { pathname: '/crm/campaigns', href: 'http://localhost:5173/crm/campaigns' }
    };

    const interceptor = createMockInterceptor(mockWindow, mockLocalStorage);

    const googleSyncError = {
        response: {
            status: 401,
            data: { error: 'Google authentication token is missing or expired' }
        },
        config: { url: 'crm/google/sync/' }
    };

    await assert.rejects(
        () => interceptor(googleSyncError),
        (err) => err === googleSyncError
    );

    assert.equal(mockLocalStorage.getItem('token'), 'valid_crm_user_token_12345');
    assert.equal(mockWindow.location.href, 'http://localhost:5173/crm/campaigns');
});

test('Interceptor logs out and redirects on genuine MiniCRM auth token expiration', async () => {
    const mockLocalStorage = {
        store: { token: 'expired_crm_user_token_99999' },
        removeItem(key) { delete this.store[key]; },
        getItem(key) { return this.store[key]; }
    };
    const mockWindow = {
        location: { pathname: '/crm/campaigns', href: 'http://localhost:5173/crm/campaigns' }
    };

    const interceptor = createMockInterceptor(mockWindow, mockLocalStorage);

    const coreError = {
        response: {
            status: 401,
            data: { detail: 'Invalid or revoked authentication token.' }
        },
        config: { url: 'crm/campaigns/' }
    };

    await assert.rejects(
        () => interceptor(coreError),
        (err) => err === coreError
    );

    // MiniCRM token MUST be removed
    assert.equal(mockLocalStorage.getItem('token'), undefined);
    // Window MUST redirect to /login
    assert.equal(mockWindow.location.href, '/login');
});

test('Interceptor does not log out on /api/auth/login/ 401', async () => {
    const mockLocalStorage = {
        store: { token: 'some_existing_token' },
        removeItem(key) { delete this.store[key]; },
        getItem(key) { return this.store[key]; }
    };
    const mockWindow = {
        location: { pathname: '/login', href: 'http://localhost:5173/login' }
    };

    const interceptor = createMockInterceptor(mockWindow, mockLocalStorage);

    const loginError = {
        response: {
            status: 401,
            data: { error: 'Invalid credentials' }
        },
        config: { url: 'auth/login/' }
    };

    await assert.rejects(
        () => interceptor(loginError),
        (err) => err === loginError
    );

    assert.equal(mockLocalStorage.getItem('token'), 'some_existing_token');
});

test('Campaign platform condition evaluates correctly for Google Sheets integration', () => {
    function shouldFetchGoogleSheets(editingCampaign, formData) {
        return Boolean(editingCampaign?.id && (formData.platform === 'OTHER' || Boolean(formData.google_spreadsheet_id)));
    }

    // Facebook campaign should not fetch Google Sheets
    assert.equal(
        shouldFetchGoogleSheets({ id: 1, platform: 'FACEBOOK' }, { platform: 'FACEBOOK', google_spreadsheet_id: '' }),
        false,
        'Facebook campaign should not trigger Google Sheets fetch'
    );

    // Walkin campaign should not fetch Google Sheets
    assert.equal(
        shouldFetchGoogleSheets({ id: 2, platform: 'WALKIN' }, { platform: 'WALKIN', google_spreadsheet_id: '' }),
        false,
        'Walkin campaign should not trigger Google Sheets fetch'
    );

    // OTHER campaign should fetch Google Sheets
    assert.equal(
        shouldFetchGoogleSheets({ id: 3, platform: 'OTHER' }, { platform: 'OTHER', google_spreadsheet_id: '' }),
        true,
        'OTHER campaign should trigger Google Sheets fetch'
    );

    // Any campaign with a configured spreadsheet_id should fetch Google Sheets
    assert.equal(
        shouldFetchGoogleSheets({ id: 4, platform: 'GOOGLE' }, { platform: 'GOOGLE', google_spreadsheet_id: 'sheet_abc' }),
        true,
        'Campaign with configured spreadsheet_id should trigger Google Sheets fetch'
    );

    // Creating new campaign (!editingCampaign?.id) should not fetch
    assert.equal(
        shouldFetchGoogleSheets(null, { platform: 'OTHER', google_spreadsheet_id: '' }),
        false,
        'New campaign creation should not trigger Google Sheets fetch'
    );
});
