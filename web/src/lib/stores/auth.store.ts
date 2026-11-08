import { getMe, getProfileDetails, getProfileStream, type Unsubscribe } from '../api'
import { writable } from 'svelte/store'
import type { Profile, SamnaUser } from '../api/types'
import { currentCharacterId, userCharacters } from './character.store'
import { currentCampaign, currentCampaignId, userCampaigns } from './campaign.store'

export const user = writable<SamnaUser | null>(null)
export const userProfile = writable<Profile | null>(null)
export const userDetails = writable<any>(null)
export const isLoading = writable(true)
export const authError = writable<string | null>(null)

export const isAuthenticated = writable(false)

user.subscribe(($user) => {
  isAuthenticated.set(!!$user)
})

export function initializeAuth(): Unsubscribe {
  let unsubscribeProfile: Unsubscribe | null = null
  let closed = false

  const load = async () => {
    isLoading.set(true)
    try {
      const found = await getMe().catch(() => null)
      if (closed) return

      if (found) {
        user.set(found)

        try {
          let settle: () => void = () => {}
          const firstProfile = new Promise<void>((resolve) => (settle = resolve))

          unsubscribeProfile = getProfileStream((profile) => {
            if (profile) userProfile.set(profile)
            settle()
          })

          const [details] = await Promise.all([getProfileDetails(), firstProfile])

          userDetails.set(details ?? {})
        } catch (error) {
          console.error('Error loading user data:', error)
        }
      } else {
        user.set(null)
        userProfile.set(null)
        userDetails.set(null)

        userCharacters.set([])
        userCampaigns.set([])
        currentCharacterId.set(null)
        currentCampaign.set(null)
        currentCampaignId.set(null)
      }

      authError.set(null)
    } catch (error) {
      console.error('Auth state change error:', error)
      authError.set(error instanceof Error ? error.message : 'Authentication error')
    } finally {
      isLoading.set(false)
    }
  }

  void load()

  return () => {
    closed = true
    unsubscribeProfile?.()
  }
}
