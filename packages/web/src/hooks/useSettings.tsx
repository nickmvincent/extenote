import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react'
import { API_ROUTES } from '../api/routes'
import type { ExtenoteSettings, PartialSettings } from '@extenote/core'

interface SettingsContextType {
  settings: ExtenoteSettings | null
  defaults: ExtenoteSettings | null
  loading: boolean
  error: string | null
  saving: boolean
  saveError: string | null
  updateSettings: (partial: PartialSettings) => Promise<boolean>
  resetSettings: (section?: keyof ExtenoteSettings) => Promise<boolean>
  reload: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ExtenoteSettings | null>(null)
  const [defaults, setDefaults] = useState<ExtenoteSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(API_ROUTES.SETTINGS)
      if (!response.ok) {
        throw new Error(`Failed to load settings: ${response.statusText}`)
      }
      const data = await response.json()
      setSettings(data.settings)
      setDefaults(data.defaults)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const updateSettings = useCallback(async (partial: PartialSettings): Promise<boolean> => {
    setSaving(true)
    setSaveError(null)

    try {
      const response = await fetch(API_ROUTES.SETTINGS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: partial }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMsg = data.validationErrors
          ? data.validationErrors.map((e: { path: string; message: string }) => `${e.path}: ${e.message}`).join(', ')
          : data.error || 'Failed to save settings'
        setSaveError(errorMsg)
        return false
      }

      setSettings(data.settings)
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const resetSettings = useCallback(async (section?: keyof ExtenoteSettings): Promise<boolean> => {
    setSaving(true)
    setSaveError(null)

    try {
      const response = await fetch(API_ROUTES.SETTINGS_RESET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section }),
      })

      const data = await response.json()

      if (!response.ok) {
        setSaveError(data.error || 'Failed to reset settings')
        return false
      }

      setSettings(data.settings)
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to reset settings')
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const value = useMemo(
    () => ({
      settings,
      defaults,
      loading,
      error,
      saving,
      saveError,
      updateSettings,
      resetSettings,
      reload: loadSettings,
    }),
    [settings, defaults, loading, error, saving, saveError, updateSettings, resetSettings, loadSettings]
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
