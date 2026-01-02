import {
  loadSettings,
  saveSettings,
  validateSettings,
  resetSettings,
  resetSettingsSection,
  getSettingsPath,
  DEFAULT_SETTINGS,
  invalidateSettingsCache,
  type ExtenoteSettings,
  type PartialSettings,
} from '@extenote/core'
import { json } from '../utils.js'
import { invalidateVaultCache } from '../cache.js'

/**
 * GET /api/settings - Load current settings
 */
export async function handleGetSettings(cwd: string, headers: Headers) {
  const settings = loadSettings(cwd)
  const filePath = getSettingsPath(cwd)

  return json({
    settings,
    defaults: DEFAULT_SETTINGS,
    filePath,
  }, 200, headers)
}

/**
 * POST /api/settings - Save settings (supports partial updates)
 */
export async function handleSaveSettings(
  cwd: string,
  body: { settings: PartialSettings },
  headers: Headers
) {
  const { settings } = body

  if (!settings || typeof settings !== 'object') {
    return json({ error: 'settings object is required' }, 400, headers)
  }

  // Validate settings
  const errors = validateSettings(settings)
  if (errors.length > 0) {
    return json({
      error: 'Validation failed',
      validationErrors: errors,
    }, 400, headers)
  }

  try {
    saveSettings(settings, cwd)

    // Invalidate caches since settings may affect behavior
    invalidateSettingsCache()
    invalidateVaultCache()

    // Return updated settings
    const updatedSettings = loadSettings(cwd)

    return json({
      success: true,
      settings: updatedSettings,
    }, 200, headers)
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Failed to save settings',
    }, 500, headers)
  }
}

/**
 * POST /api/settings/reset - Reset settings to defaults
 */
export async function handleResetSettings(
  cwd: string,
  body: { section?: keyof ExtenoteSettings },
  headers: Headers
) {
  try {
    if (body.section) {
      // Reset specific section
      resetSettingsSection(body.section, cwd)
    } else {
      // Reset all settings
      resetSettings(cwd)
    }

    // Invalidate caches
    invalidateSettingsCache()
    invalidateVaultCache()

    const settings = loadSettings(cwd)

    return json({
      success: true,
      settings,
      reset: body.section || 'all',
    }, 200, headers)
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'Failed to reset settings',
    }, 500, headers)
  }
}
