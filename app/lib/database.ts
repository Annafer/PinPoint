import { supabase } from './supabase';
import { Point, Collection } from '../types';

// Коллекции
export async function fetchCollections() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', user.id)  // Только коллекции текущего пользователя
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return data as Collection[];
}

export async function fetchPublicCollections() {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return data as Collection[];
}

export async function createCollection(name: string, color: string, isPublic: boolean = false) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('collections')
    .insert([{ name, color, is_public: isPublic, user_id: user.id }])
    .select()
    .single();
  
  if (error) throw error;
  return data as Collection;
}

export async function updateCollection(id: string, updates: Partial<Collection>) {
  const { data, error } = await supabase
    .from('collections')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data as Collection;
}

export async function deleteCollection(id: string) {
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

// Точки
export async function fetchPoints() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('points')
    .select('*')
    .eq('user_id', user.id)  // Только точки текущего пользователя
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as Point[];
}

export async function fetchPointsFromPublicCollections() {
  try {
    // Сначала получаем все публичные коллекции
    const { data: publicCollections, error: collectionsError } = await supabase
      .from('collections')
      .select('id')
      .eq('is_public', true);
    
    if (collectionsError) {
      console.error('Error fetching public collections:', collectionsError);
      throw collectionsError;
    }
    
    if (!publicCollections || publicCollections.length === 0) {
      console.log('No public collections found');
      return [];
    }
    
    console.log('Found public collections:', publicCollections.map(c => c.id));
    
    // Затем получаем все точки из этих коллекций
    const publicCollectionIds = publicCollections.map(c => c.id);
    
    const { data: points, error: pointsError } = await supabase
      .from('points')
      .select('*')
      .in('collection_id', publicCollectionIds)
      .order('created_at', { ascending: false });
    
    if (pointsError) {
      console.error('Error fetching points from public collections:', pointsError);
      throw pointsError;
    }
    
    console.log('Found public points:', points?.length || 0);
    return points as Point[] || [];
    
  } catch (error) {
    console.error('Error in fetchPointsFromPublicCollections:', error);
    // Fallback: возвращаем пустой массив
    return [];
  }
}

export async function fetchPointsByCollectionId(collectionId: string) {
  console.log('Fetching points for collection:', collectionId);
  
  const { data, error } = await supabase
    .from('points')
    .select('*')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching points by collection ID:', error);
    throw error;
  }
  
  console.log('Found points for collection:', data?.length || 0);
  return data as Point[] || [];
}

export async function createPoint(point: Omit<Point, 'id' | 'user_id' | 'created_at'>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('points')
    .insert([{ ...point, user_id: user.id }])
    .select()
    .single();
  
  if (error) throw error;
  return data as Point;
}

export async function updatePoint(id: string, updates: Partial<Point>) {
  const { data, error } = await supabase
    .from('points')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data as Point;
}

export async function deletePoint(id: string) {
  const { error } = await supabase
    .from('points')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

// --- Photos -------------------------------------------------
export async function fetchPhotos(pointId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('point_id', pointId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as Photo[];
}

export async function uploadPhoto(pointId: string, file: File): Promise<Photo> {
  const fileName = `${crypto.randomUUID()}.${file.name.split('.').pop()}`;
  const { error: upError } = await supabase.storage
    .from('photos')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });
  if (upError) throw upError;

  const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName);
  const { data, error } = await supabase
    .from('photos')
    .insert([{ point_id: pointId, url: publicUrl }])
    .select()
    .single();
  if (error) throw error;
  return data as Photo;
}

// Функция для отладки - получить все точки
export async function fetchAllPointsDebug() {
  const { data, error } = await supabase
    .from('points')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching all points:', error);
    throw error;
  }
  
  console.log('All points in database:', data?.length || 0);
  return data as Point[] || [];
}

// Функция для отладки - получить все публичные коллекции с их точками
export async function fetchPublicCollectionsWithPoints() {
  const { data, error } = await supabase
    .from('collections')
    .select(`
      *,
      points(*)
    `)
    .eq('is_public', true);
  
  if (error) {
    console.error('Error fetching public collections with points:', error);
    throw error;
  }
  
  console.log('Public collections with points:', data);
  return data || [];
}

export async function deletePhoto(id: string, url: string) {
  await supabase.from('photos').delete().eq('id', id);
  const path = url.split('/').pop()!;
  await supabase.storage.from('photos').remove([path]);
}