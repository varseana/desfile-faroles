// Compresion de imagenes del lado del cliente.
//
// El desfile dibuja 100-200 imagenes a la vez en el canvas. Si se cargan a
// resolucion completa (fotos de celular de varios MP), el bitmap decodificado
// en memoria explota el renderer y el navegador recarga la pestaña. Por eso al
// subir generamos dos variantes comprimidas:
//   - THUMB (~320px): la que usan los sprites del desfile. Poca memoria.
//   - HD (~1280px): la que se muestra grande al hacer hover. Nitida pero liviana.

export const THUMB_MAX = 320
export const HD_MAX = 1280

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file)
}

// Reescala manteniendo aspecto (nunca agranda) y devuelve un JPEG comprimido.
export async function makeVariant(
  source: Blob | ImageBitmap,
  maxSize: number,
  quality: number,
): Promise<Blob> {
  const bitmap = source instanceof ImageBitmap ? source : await loadBitmap(source)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context para comprimir')
  ctx.drawImage(bitmap, 0, 0, w, h)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob fallo'))),
      'image/jpeg',
      quality,
    )
  })
}

// Genera thumb + hd de un archivo, reusando un unico decode.
export async function makeVariants(file: File): Promise<{ thumb: Blob; hd: Blob }> {
  const bitmap = await loadBitmap(file)
  try {
    const [thumb, hd] = await Promise.all([
      makeVariant(bitmap, THUMB_MAX, 0.72),
      makeVariant(bitmap, HD_MAX, 0.82),
    ])
    return { thumb, hd }
  } finally {
    bitmap.close?.()
  }
}
