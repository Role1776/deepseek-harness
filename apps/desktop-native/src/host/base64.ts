/** Base64 helpers: React Native has no reliable `btoa`/`atob` for binary data. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Encode raw bytes as standard base64 without padding-free shortcuts. */
export function bytesToBase64(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1] ?? 0
    const third = bytes[index + 2] ?? 0
    const triple = (first << 16) | (second << 8) | third
    output += ALPHABET[(triple >> 18) & 0x3f]
    output += ALPHABET[(triple >> 12) & 0x3f]
    output += index + 1 < bytes.length ? ALPHABET[(triple >> 6) & 0x3f] : '='
    output += index + 2 < bytes.length ? ALPHABET[triple & 0x3f] : '='
  }
  return output
}

/** Decode standard base64 into raw bytes. */
export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const length = Math.floor((clean.length * 3) / 4)
  const bytes = new Uint8Array(length)
  let byteIndex = 0
  for (let index = 0; index < clean.length; index += 4) {
    const a = ALPHABET.indexOf(clean[index] ?? 'A')
    const b = ALPHABET.indexOf(clean[index + 1] ?? 'A')
    const c = ALPHABET.indexOf(clean[index + 2] ?? 'A')
    const d = ALPHABET.indexOf(clean[index + 3] ?? 'A')
    const triple = ((a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d)) >>> 0
    if (byteIndex < length) bytes[byteIndex++] = (triple >> 16) & 0xff
    if (byteIndex < length) bytes[byteIndex++] = (triple >> 8) & 0xff
    if (byteIndex < length) bytes[byteIndex++] = triple & 0xff
  }
  return bytes
}
