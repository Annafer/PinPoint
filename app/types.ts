export interface Point {
  id: string;
  user_id: string;
  collection_id?: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  created_at?: string;
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_public: boolean;
  created_at?: string;
}

export interface Photo {
  id: string;
  point_id: string;
  url: string;
  created_at?: string;
}

export type FilterType = 
  | 'all-public'           // Все доступные коллекции (публичные)
  | 'my-collections'       // Мои коллекции
  | 'public-collections';  // Публичные коллекции

export type MyCollectionFilter = 
  | 'all-my'               // Все мои точки
  | 'no-collection'        // Мои точки без коллекции
  | string;                // ID конкретной моей коллекции