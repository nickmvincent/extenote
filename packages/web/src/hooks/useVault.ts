import { useState, useEffect } from 'react'
import { loadVaultData, type VaultData } from '../api/vault'

export function useVault() {
  const [data, setData] = useState<VaultData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const vaultData = await loadVaultData()
      setData(vaultData)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load vault'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  return { data, loading, error, reload }
}
