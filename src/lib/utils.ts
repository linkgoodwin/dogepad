import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface TokenMeta {
  image?: string
  website?: string
  twitter?: string
  telegram?: string
  discord?: string
  description?: string
}

const IPFS_GATEWAY = "https://dweb.link/ipfs"

export function resolveIpfs(url: string): string {
  if (!url) return ''
  if (url.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY}/${url.slice(7)}`
  }
  if (url.startsWith('https://gateway.pinata.cloud/ipfs/')) {
    const cid = url.replace('https://gateway.pinata.cloud/ipfs/', '').split('/')[0]
    return `${IPFS_GATEWAY}/${cid}`
  }
  return url
}

export function parseMetadata(uri: string): TokenMeta {
  if (!uri) return {}
  try {
    if (uri.startsWith('data:application/json;base64,')) {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(uri.replace('data:application/json;base64,', '')))))
      if (parsed.image) parsed.image = resolveIpfs(parsed.image)
      return parsed
    }
    return {}
  } catch {
    return {}
  }
}

export function formatUsdc(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs < 0.0001) return sign + abs.toExponential(2)
  if (abs < 0.01) return sign + parseFloat(abs.toFixed(4)).toString()
  if (abs < 1) return sign + parseFloat(abs.toFixed(2)).toString()
  return sign + parseFloat(abs.toFixed(2)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function formatTokenAmount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return sign + parseFloat(abs.toFixed(0)).toLocaleString()
  if (abs < 0.01) return sign + abs.toExponential(2)
  return sign + parseFloat(abs.toFixed(2)).toString()
}

export function sanitizeHref(url: string): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (/^(javascript:|data:|vbscript:)/i.test(trimmed)) return ''
  if (trimmed && !/^(https?:\/\/|ipfs:\/\/)/i.test(trimmed)) return resolveIpfs('https://' + trimmed)
  return resolveIpfs(trimmed)
}
