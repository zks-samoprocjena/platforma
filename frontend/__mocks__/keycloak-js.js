// Mock keycloak-js module
export default function Keycloak() {
  return {
    init: jest.fn().mockResolvedValue(true),
    updateToken: jest.fn().mockResolvedValue(true),
    clearToken: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    register: jest.fn(),
    loadUserProfile: jest.fn().mockResolvedValue({}),
    token: 'mock-token',
    tokenParsed: {
      sub: 'user-123',
      email: 'test@example.com',
      realm_access: {
        roles: ['assessment_editor']
      }
    },
    authenticated: true,
    onTokenExpired: jest.fn(),
    onAuthError: jest.fn(),
    onAuthRefreshError: jest.fn(),
    onAuthRefreshSuccess: jest.fn(),
    onReady: jest.fn(),
  };
}