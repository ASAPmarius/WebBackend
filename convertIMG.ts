import { readAll } from "https://deno.land/std@0.224.0/io/read_all.ts";

/**
 * Converts an image file to a Uint8Array (bytea) format
 * @param imagePath - Path to the image file
 * @returns Uint8Array representation of the image
 */
export async function convertImageToBytes(imagePath: string): Promise<Uint8Array> {
  try {
    const file = await Deno.open(imagePath, { read: true });
    const buffer = await readAll(file);
    file.close();
    return buffer;
  } catch (error) {
    console.error(`Error converting image ${imagePath}:`, (error as Error).message);
    throw error;
  }
}

/**
 * Converts a base64 string to Uint8Array
 * @param base64 - Base64 encoded string
 * @returns Uint8Array representation of the image
 */
export function base64ToBytes(base64: string): Uint8Array {
  // Remove data:image/[type];base64, prefix if present
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}

/**
 * Converts Uint8Array to base64 string for display
 * @param bytes - Uint8Array of image data
 * @returns Base64 encoded string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Function to create a data URL from bytes
export function bytesToDataURL(bytes: Uint8Array, mimeType: string = 'image/png'): string {
  const base64 = bytesToBase64(bytes);
  return `data:${mimeType};base64,${base64}`;
}
