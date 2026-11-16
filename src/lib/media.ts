import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { compressImage } from './image'

/** URL firmada temporal (1 h) para una foto privada. */
export function useSignedUrl(path?: string | null) {
  const q = useQuery({
    queryKey: ['signed', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('media').createSignedUrl(path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
  return q.data ?? null
}

/** Sube una foto comprimida y devuelve su ruta. folder: "users/<uid>" o "couples/<id>". */
export async function uploadPhoto(folder: string, file: File, name?: string): Promise<string> {
  const blob = await compressImage(file)
  const path = `${folder}/${name ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}.jpg`
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', upsert: !!name })
  if (error) throw new Error(error.message.includes('exceeded') ? 'La foto es demasiado grande' : error.message)
  return path
}

export async function deletePhoto(path: string | null | undefined) {
  if (path) await supabase.storage.from('media').remove([path])
}
