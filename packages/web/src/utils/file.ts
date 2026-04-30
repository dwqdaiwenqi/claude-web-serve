const MEDIA_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp',
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac',
])

export function isMediaFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return MEDIA_EXTS.has(ext)
}
