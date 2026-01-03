import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { DEFAULT_API_PORT, DEFAULT_API_HOST, DEFAULT_WEB_ORIGINS } from '@extenote/core'

export const API_PORT = Number(process.env.EXTENOTE_API_PORT) || DEFAULT_API_PORT
export const API_HOST = process.env.EXTENOTE_API_HOST ?? DEFAULT_API_HOST

export const ALLOWED_ORIGINS = new Set(
  (process.env.EXTENOTE_WEB_ORIGIN ?? DEFAULT_WEB_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
)

export const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export function json(data: unknown, status = 200, headers = buildHeaders()) {
  return new Response(JSON.stringify(data), { status, headers })
}

export function buildHeaders(origin?: string | null) {
  const headers = new Headers(BASE_HEADERS)
  if (origin) {
    // Allow known origins
    if (ALLOWED_ORIGINS.has(origin)) {
      headers.set('Access-Control-Allow-Origin', origin)
    }
    // Allow browser extension origins (moz-extension://, chrome-extension://)
    else if (origin.startsWith('moz-extension://') || origin.startsWith('chrome-extension://')) {
      headers.set('Access-Control-Allow-Origin', origin)
    }
  }
  return headers
}

/**
 * Split a shell command string into an array of arguments.
 * Handles single and double quoted strings, preserving spaces within quotes.
 */
export function splitCommand(command: string): string[] {
  const args: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
    } else if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  if (current) {
    args.push(current)
  }

  return args
}

export function resolveProjectRoot() {
  const envRoot = process.env.EXTENOTE_PROJECT_ROOT?.trim()
  if (envRoot) {
    return path.resolve(envRoot)
  }

  const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
  if (existsSync(path.join(moduleRoot, 'projects'))) {
    return moduleRoot
  }

  return process.cwd()
}
