// Comprime fotos en el iPhone antes de subirlas (ahorra espacio del plan gratuito: 1 GB).
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    await img.decode()
    return img as unknown as ImageBitmap
  })
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  return await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('No se pudo procesar la imagen'))), 'image/jpeg', quality))
}
