import type { ProfileService } from '../../services/profileService'

// Lets tests that only need a signed-in /account page avoid calling the backend
export const stubProfileService: ProfileService = {
  async getProfile() {
    return {
      email: 'jane@example.com',
      firstname: 'Jane',
      surname: 'Doe',
      addressLine1: '1 High Street',
      addressLine2: null,
      postcode: 'BT7 1NT',
    }
  },
  async updateProfile() {
    throw new Error('Profile updates are not used in this test')
  },
  async getBasket() {
    return { items: [] }
  },
  async getOrders() {
    return []
  },
}
