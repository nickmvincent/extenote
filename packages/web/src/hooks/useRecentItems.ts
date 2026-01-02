import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'extenote-recent-items'
const MAX_ITEMS = 10

export interface RecentItem {
  path: string
  title: string
  type: string
  visitedAt: string
}

export function useRecentItems() {
  const [items, setItems] = useState<RecentItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // Save to localStorage whenever items change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = useCallback((item: Omit<RecentItem, 'visitedAt'>) => {
    setItems(prev => {
      // Remove existing entry for this path
      const filtered = prev.filter(i => i.path !== item.path)
      // Add new entry at the beginning
      const newItems = [
        { ...item, visitedAt: new Date().toISOString() },
        ...filtered
      ].slice(0, MAX_ITEMS)
      return newItems
    })
  }, [])

  const clearItems = useCallback(() => {
    setItems([])
  }, [])

  return { items, addItem, clearItems }
}
