'use client';

import dynamic from 'next/dynamic';
import { Point, Collection, FilterType, MyCollectionFilter } from './types';
import { forwardRef } from 'react';

interface MapProps {
  points: Point[];
  collections: Collection[];
  publicCollections: Collection[];
  onPointsUpdate: (points: Point[]) => void;
  onCollectionsUpdate?: (collections: Collection[]) => void;
  centerPointId?: string | null;
  onCenterPointShown?: () => void;
  selectedCollectionId?: string | undefined;
  filterType: FilterType;
  myCollectionFilter: MyCollectionFilter;
  selectedPublicCollectionId?: string | undefined;
}

const MapComponent = dynamic(
  () => import('./MapInner'),
  { 
    ssr: false,
    loading: () => <div className="h-full w-full bg-gray-100 flex items-center justify-center">Загрузка карты...</div>
  }
);

export default forwardRef<any, MapProps>((props, ref) => {
  return <MapComponent {...props} ref={ref} />;
});