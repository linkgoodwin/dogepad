const PINATA_JWT = import.meta.env.VITE_PINATA_JWT

const MAX_FILE_SIZE = 200 * 1024
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]
const MAX_DIMENSION = 512
const JPEG_QUALITY = 0.8
const PINATA_API = "https://api.pinata.cloud/pinning/pinFileToIPFS"

const IPFS_GATEWAYS = [
  "https://dweb.link/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
  "https://ipfs.io/ipfs",
  "https://gateway.pinata.cloud/ipfs",
]

export function getGatewayUrl(cid: string): string {
  return `${IPFS_GATEWAYS[0]}/${cid}`
}

export function resolveIpfsUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('ipfs://')) {
    const path = url.slice(7)
    return `${IPFS_GATEWAYS[0]}/${path}`
  }
  if (url.startsWith('https://gateway.pinata.cloud/ipfs/')) {
    const cid = url.replace('https://gateway.pinata.cloud/ipfs/', '').split('/')[0]
    return `${IPFS_GATEWAYS[0]}/${cid}`
  }
  return url
}

function validateFile(file: File): void {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds 200KB limit (${(file.size / 1024).toFixed(1)}KB)`)
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(", ")}`
    )
  }
}

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (file.type === "image/svg+xml") {
      resolve(file)
      return
    }

    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size <= MAX_FILE_SIZE) {
        resolve(file)
        return
      }

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Failed to get canvas 2d context"))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg"
      const quality = outputType === "image/jpeg" ? JPEG_QUALITY : undefined

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed"))
            return
          }
          resolve(blob)
        },
        outputType,
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to load image for compression"))
    }

    img.src = url
  })
}

export async function uploadToIpfs(file: File): Promise<string> {
  validateFile(file)

  const compressed = await compressImage(file)

  const formData = new FormData()
  const filename = file.name || "image.png"
  formData.append("file", compressed, filename)

  const response = await fetch(PINATA_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error")
    throw new Error(`Pinata upload failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  const cid: string = data.IpfsHash
  return `ipfs://${cid}`
}
