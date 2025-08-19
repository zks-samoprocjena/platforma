export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const apiEndpoints = {
  organizations: {
    check: `${API_URL}/api/v1/organizations/check`,
    generateCode: `${API_URL}/api/v1/organizations/generate-code`,
    register: `${API_URL}/api/v1/organizations/register`,
    completeSetup: (id: string) => `${API_URL}/api/v1/organizations/${id}/complete-setup`,
    get: (id: string) => `${API_URL}/api/v1/organizations/${id}`,
  },
}