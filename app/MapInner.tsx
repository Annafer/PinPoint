'use client';

import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import { useState, useMemo, useEffect, forwardRef, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Point, Collection, FilterType, MyCollectionFilter } from './types';
import {
  createPoint,
  updatePoint,
  deletePoint,
  fetchPointsFromPublicCollections,
  fetchPointsByCollectionId,
  createCollection,
} from './lib/database';
import { supabase } from './lib/supabase';

/* ----------  ICON  ---------- */
const createColoredIcon = (color: string) => {
  const styles = `
    background-color: ${color};
    width: 26px; height: 26px;
    display: block;
    left: -13px; top: -26px;
    position: absolute;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 2px solid #fff;
    box-shadow: 0 2px 5px rgba(0,0,0,.25);
  `;
  return L.divIcon({
    className: 'custom-pin',
    iconAnchor: [0, 0],
    popupAnchor: [0, 0],
    html: `<span style="${styles}" />`,
  });
};
const defaultIcon = createColoredIcon('#9CA3AF');

/* ----------  PROPS  ---------- */
interface MapInnerProps {
  points: Point[];
  collections: Collection[];
  publicCollections: Collection[];
  onPointsUpdate: (points: Point[]) => void;
  centerPointId?: string | null;
  onCenterPointShown?: () => void;
  selectedCollectionId?: string | undefined;
  filterType: FilterType;
  myCollectionFilter: MyCollectionFilter;
  selectedPublicCollectionId?: string | undefined;
}

/* ----------  CENTER MAP  ---------- */
function CenterMap({ point, onCentered }: { point: Point | null; onCentered: () => void }) {
  const map = useMap();
  useEffect(() => {
    if (!point) return;
    map.flyTo([point.lat, point.lng], 16, { duration: 1 });
    setTimeout(() => {
      map.eachLayer((layer: any) => {
        if (layer instanceof L.Marker && layer.getLatLng) {
          const ll = layer.getLatLng();
          if (ll.lat === point.lat && ll.lng === point.lng) layer.openPopup();
        }
      });
      onCentered();
    }, 1100);
  }, [point, map, onCentered]);
  return null;
}

/* ----------  MAIN COMPONENT  ---------- */
const MapInner = forwardRef<any, MapInnerProps>((props, ref) => {
  const {
    points,
    collections,
    publicCollections,
    onPointsUpdate,
    centerPointId,
    onCenterPointShown,
    selectedCollectionId,
    filterType,
    myCollectionFilter,
    selectedPublicCollectionId,
  } = props;

  /* ----------  STATE  ---------- */
  const [map, setMap] = useState<L.Map | null>(null);
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);
  const [editingPoint, setEditingPoint] = useState<Point | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [bottomSheetPoint, setBottomSheetPoint] = useState<Point | null>(null);
  const [bottomSheetHeight, setBottomSheetHeight] = useState<'default' | 'expanded'>('default');
  const [dragStartY, setDragStartY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [ignoreNextClick, setIgnoreNextClick] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [filteredPoints, setFilteredPoints] = useState<Point[]>(points);
  const [currentFilterType, setCurrentFilterType] = useState<FilterType>(filterType);
  const [currentMyCollectionFilter, setCurrentMyCollectionFilter] = useState<MyCollectionFilter>(myCollectionFilter);
  const [currentPublicCollectionId, setCurrentPublicCollectionId] = useState<string | undefined>(selectedPublicCollectionId);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [searchDebounceTimer, setSearchDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [showNewCollectionModal, setShowNewCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionColor, setNewCollectionColor] = useState('#3B82F6');
  const [newCollectionIsPublic, setNewCollectionIsPublic] = useState(false);

  const [pendingPoint, setPendingPoint] = useState<{ lat: number; lng: number } | null>(null);

  /* ----------  EFFECTS  ---------- */
  useEffect(() => setIsClient(true), []);
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setCurrentUserId(data?.user?.id ?? null);
    };
    getUser();
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const canEditPoint = useCallback(
    (p: Point) => !!currentUserId && p.user_id === currentUserId,
    [currentUserId],
  );

  const loadFilteredPoints = useCallback(async () => {
    try {
      let res: Point[] = [];
      switch (currentFilterType) {
        case 'my-collections':
          if (currentMyCollectionFilter === 'all-my') res = points;
          else if (currentMyCollectionFilter === 'no-collection') res = points.filter((p) => !p.collection_id);
          else res = points.filter((p) => p.collection_id === currentMyCollectionFilter);
          break;
        case 'public-collections':
          if (currentPublicCollectionId === 'all-public') res = await fetchPointsFromPublicCollections();
          else if (currentPublicCollectionId) res = await fetchPointsByCollectionId(currentPublicCollectionId);
          else res = [];
          break;
        default:
          res = points;
      }
      setFilteredPoints(res);
    } catch (e) {
      console.error(e);
      setFilteredPoints(points);
    }
  }, [currentFilterType, currentMyCollectionFilter, currentPublicCollectionId, points]);
  useEffect(() => {
  (async () => {
    await loadFilteredPoints();
  })();
}, [loadFilteredPoints]);

  /* ----------  COLORS MAP  ---------- */
  const allCollections = useMemo(() => {
    const map: Record<string, string> = {};
    [...collections, ...publicCollections].forEach((c) => (map[c.id] = c.color));
    return map;
  }, [collections, publicCollections]);

  const centerPoint = useMemo(
    () => (centerPointId ? filteredPoints.find((p) => p.id === centerPointId) || null : null),
    [centerPointId, filteredPoints],
  );

  /* ----------  MAP CLICK HANDLER  ---------- */
  const MapClickHandler = () => {
    useMapEvents({
      click: async (e) => {
        if (ignoreNextClick) {
          setIgnoreNextClick(false);
          return;
        }
        if (!isClient || !currentUserId) {
          alert('Войдите в систему для создания точек');
          return;
        }
        const { lat, lng } = e.latlng;
        setPendingPoint({ lat, lng });
        const tempEditingPoint: Point = {
          id: 'editing-new',
          user_id: currentUserId,
          name: 'Новая точка',
          description: '',
          lat,
          lng,
          collection_id: selectedCollectionId,
          created_at: new Date().toISOString(),
        };
        setEditingPoint(tempEditingPoint);
        if (isMobile) {
          setBottomSheetPoint(tempEditingPoint);
          setShowBottomSheet(true);
        } else {
          const virtualPoint = { ...tempEditingPoint, id: 'virtual-new' };
          onPointsUpdate([...points, virtualPoint]);
          setOpenPopupId('virtual-new');
        }
      },
    });
    return null;
  };

  /* ----------  SEARCH ---------- */
  const handleSearchChange = (v: string) => {
    setSearchQuery(v);
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    const timer = setTimeout(async () => {
      if (v.trim().length < 3) return setSearchResults([]);
      const coord = v.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
      if (coord) {
        const [lat, lng] = [parseFloat(coord[1]), parseFloat(coord[2])];
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return setSearchResults([
            { display_name: `Координаты: ${lat}, ${lng}`, lat, lon: lng, isCoordinate: true },
          ]);
        }
      }
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(v)}&limit=5`,
        );
        const data = await res.json();
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      }
    }, 500);
    setSearchDebounceTimer(timer);
  };
  useEffect(() => {
   return () => {
     if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
   };
 }, [searchDebounceTimer]);

  /* ----------  CRUD ---------- */
  const handleSave = async (id: string) => {
    if (!editingPoint) return;
    if (!editingPoint.name.trim() || editingPoint.name === 'Новая точка') {
      alert('Введите название точки');
      return;
    }
    try {
      if ((editingPoint.id === 'editing-new' || editingPoint.id === 'virtual-new') && pendingPoint) {
        const saved = await createPoint({
          name: editingPoint.name,
          description: editingPoint.description,
          lat: pendingPoint.lat,
          lng: pendingPoint.lng,
          collection_id: editingPoint.collection_id,
        });
        onPointsUpdate([...points.filter((p) => p.id !== 'virtual-new'), saved]);
        setPendingPoint(null);
      } else {
        if (!canEditPoint(editingPoint)) {
          alert('Нет прав для редактирования');
          return;
        }
        const updated = await updatePoint(id, {
          name: editingPoint.name,
          description: editingPoint.description,
          collection_id: editingPoint.collection_id,
        });
        onPointsUpdate(points.map((p) => (p.id === id ? updated : p)));
      }
      setEditingPoint(null);
      setOpenPopupId(null);
      if (isMobile) setShowBottomSheet(false);
    } catch (e) {
      console.error(e);
      alert('Ошибка при сохранении');
    }
  };

  const handleDelete = async (id: string) => {
    if (id === 'virtual-new' || id === 'editing-new') return handleCloseWithConfirm();
    const pt = filteredPoints.find((p) => p.id === id);
    if (!pt || !canEditPoint(pt)) return alert('Нет прав для удаления');
    if (!confirm('Удалить точку?')) return;
    await deletePoint(id);
    onPointsUpdate(points.filter((p) => p.id !== id));
    if (isMobile) setShowBottomSheet(false);
  };

  const handleCloseWithConfirm = () => {
    if (editingPoint?.name === 'Новая точка' && !confirm('Не добавлять объект?')) return;
    if (editingPoint && editingPoint.name !== 'Новая точка' && !confirm('Не сохранять изменения?')) return;

    if (editingPoint?.id === 'editing-new') {
      onPointsUpdate(points.filter((p) => p.id !== 'virtual-new'));
      setPendingPoint(null);
    }
    setEditingPoint(null);
    setOpenPopupId(null);
    setIgnoreNextClick(true);
    setTimeout(() => setIgnoreNextClick(false), 300);
    if (isMobile) setShowBottomSheet(false);
  };

  /* ----------  HANDLE FILTER ---------- */
  const handleFilterChange = async (
    type: FilterType,
    myFilter?: MyCollectionFilter,
    publicId?: string,
    close = false,
  ) => {
    setCurrentFilterType(type);
    if (myFilter !== undefined) setCurrentMyCollectionFilter(myFilter);
    if (publicId !== undefined) setCurrentPublicCollectionId(publicId);
    await loadFilteredPoints();
    if (close) setShowFilters(false);
  };

  /* ----------  RENDER ---------- */
  return (
    <>
      {/* ----------  MOBILE FAB ---------- */}
      <div className="fixed top-4 left-4 z-[1000] flex gap-3 md:hidden">
        <button
          onClick={() => setShowFilters(true)}
          className="bg-white/80 backdrop-blur-sm rounded-full shadow-lg p-3 hover:scale-110 transition"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
          </svg>
        </button>
        <button
          onClick={() => setShowSearch(true)}
          className="bg-white/80 backdrop-blur-sm rounded-full shadow-lg p-3 hover:scale-110 transition"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx={11} cy={11} r={8} />
            <line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
        </button>
      </div>

      {/* ----------  DESKTOP ---------- */}
      <div className="absolute top-4 left-4 z-[1000] hidden md:flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-white/70 backdrop-blur-sm rounded-xl shadow-sm px-4 py-2 text-sm font-medium text-slate-800 flex items-center gap-2 hover:shadow-md transition"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
            </svg>
            Фильтры
          </button>
          {showFilters && (
            <div className="absolute top-full mt-2 bg-white rounded-xl shadow-lg p-4 w-80">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Показать</label>
              <div className="mt-3 space-y-2">
                {/* My collections */}
                <div className={`border rounded-lg ${currentFilterType === 'my-collections' ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                  <button
                    onClick={() => handleFilterChange('my-collections')}
                    className={`w-full text-left p-3 rounded-t-lg transition-all ${currentFilterType === 'my-collections' ? 'text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📍</span>
                      <div>
                        <div className="font-medium">Мои коллекции</div>
                        <div className="text-xs opacity-70">Мои точки и коллекции</div>
                      </div>
                    </div>
                  </button>
                  {currentFilterType === 'my-collections' && (
                    <div className="px-3 pb-3 space-y-1">
                      <button
                        onClick={() => handleFilterChange('my-collections', 'all-my', undefined, true)}
                        className={`w-full text-left p-2 rounded-md text-sm ${currentMyCollectionFilter === 'all-my' ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        ✨ Все мои точки ({points.length})
                      </button>
                      <button
                        onClick={() => handleFilterChange('my-collections', 'no-collection', undefined, true)}
                        className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 ${currentMyCollectionFilter === 'no-collection' ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                        Без коллекции ({points.filter((p) => !p.collection_id).length})
                      </button>
                      {collections.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleFilterChange('my-collections', c.id, undefined, true)}
                          className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 ${currentMyCollectionFilter === c.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name} ({points.filter((p) => p.collection_id === c.id).length})
                          {c.is_public && <span className="text-xs">🌐</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Public collections */}
                <div className={`border rounded-lg ${currentFilterType === 'public-collections' ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                  <button
                    onClick={() => handleFilterChange('public-collections')}
                    className={`w-full text-left p-3 rounded-t-lg transition-all ${currentFilterType === 'public-collections' ? 'text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌍</span>
                      <div className="font-medium">Публичные коллекции</div>
                    </div>
                  </button>
                  {currentFilterType === 'public-collections' && (
                    <div className="px-3 pb-3 space-y-1 max-h-40 overflow-y-auto">
                      <button
                        onClick={() => handleFilterChange('public-collections', undefined, 'all-public', true)}
                        className={`w-full text-left p-2 rounded-md text-sm ${currentPublicCollectionId === 'all-public' ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        🌐 Все публичные коллекции
                      </button>
                      {publicCollections.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleFilterChange('public-collections', undefined, c.id, true)}
                          className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 ${currentPublicCollectionId === c.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name} 🌐
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="bg-white/70 backdrop-blur-sm rounded-xl shadow-sm px-4 py-2 text-sm font-medium text-slate-800 flex items-center gap-2 hover:shadow-md transition"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx={11} cy={11} r={8} />
              <line x1={21} y1={21} x2={16.65} y2={16.65} />
            </svg>
            Поиск
          </button>
          {showSearch && (
            <div className="absolute top-full mt-2 bg-white rounded-xl shadow-lg p-4 w-72">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Координаты или название"
                  className="flex-1 p-2 border border-slate-300 rounded-md text-sm"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && searchResults.length) {
                      const r = searchResults[0];
                      map?.flyTo([r.lat, r.lon], 16);
                      setShowSearch(false);
                      setSearchResults([]);
                      setSearchQuery('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (!searchResults.length) return;
                    const r = searchResults[0];
                    map?.flyTo([r.lat, r.lon], 16);
                    setShowSearch(false);
                    setSearchResults([]);
                    setSearchQuery('');
                  }}
                  className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx={11} cy={11} r={8} />
                    <line x1={21} y1={21} x2={16.65} y2={16.65} />
                  </svg>
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-64 overflow-y-auto text-sm">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        map?.flyTo([r.lat, r.lon], 16);
                        setShowSearch(false);
                        setSearchResults([]);
                        setSearchQuery('');
                      }}
                      className="w-full text-left p-2 hover:bg-slate-100 rounded-md"
                    >
                      {r.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ----------  MOBILE FILTERS ---------- */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/40 z-[2000] md:hidden" onClick={() => setShowFilters(false)}>
          <div className="fixed top-0 left-0 right-0 bg-white rounded-b-2xl p-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="space-y-3">

              <div className={`border rounded-lg ${currentFilterType === 'my-collections' ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                <button
                  onClick={() => handleFilterChange('my-collections')}
                  className={`w-full text-left p-3 rounded-t-lg ${
                    currentFilterType === 'my-collections' ? 'text-blue-700 font-semibold' : 'text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📍</span>
                    <div>
                      <div className="font-medium">Мои коллекции</div>
                      <div className="text-sm opacity-70">Мои точки и коллекции</div>
                    </div>
                  </div>
                </button>
                
                {currentFilterType === 'my-collections' && (
                  <div className="px-3 pb-3 space-y-1">
                    <button
                      onClick={() => handleFilterChange('my-collections', 'all-my', undefined, true)}
                      className={`w-full text-left p-2 rounded-md ${
                        currentMyCollectionFilter === 'all-my' ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      ✨ Все мои точки ({points.length})
                    </button>
                    
                    <button
                      onClick={() => handleFilterChange('my-collections', 'no-collection', undefined, true)}
                      className={`w-full text-left p-2 rounded-md flex items-center gap-2 ${
                        currentMyCollectionFilter === 'no-collection' ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                      Без коллекции ({points.filter(p => !p.collection_id).length})
                    </button>

                    {collections.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleFilterChange('my-collections', c.id, undefined, true)}
                        className={`w-full text-left p-2 rounded-md flex items-center gap-2 ${
                          currentMyCollectionFilter === c.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name} ({points.filter(p => p.collection_id === c.id).length})
                        {c.is_public && <span className="text-xs">🌐</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={`border rounded-lg ${currentFilterType === 'public-collections' ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                <button
                  onClick={() => handleFilterChange('public-collections')}
                  className={`w-full text-left p-3 rounded-t-lg ${
                    currentFilterType === 'public-collections' ? 'text-blue-700 font-semibold' : 'text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🌍</span>
                    <div>
                      <div className="font-medium">Публичные коллекции</div>
                    </div>
                  </div>
                </button>
                
                {currentFilterType === 'public-collections' && (
                  <div className="px-3 pb-3 space-y-1 max-h-40 overflow-y-auto">
                    <button
                      onClick={() => handleFilterChange('public-collections', undefined, 'all-public', true)}
                      className={`w-full text-left p-2 rounded-md flex items-center gap-2 ${
                        currentPublicCollectionId === 'all-public' ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      🌐 Все публичные коллекции
                    </button>
                    
                    {publicCollections.length === 0 ? (
                      <p className="text-sm text-gray-500 p-2">Нет других публичных коллекций</p>
                    ) : (
                      publicCollections.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleFilterChange('public-collections', undefined, c.id, true)}
                          className={`w-full text-left p-2 rounded-md flex items-center gap-2 ${
                            currentPublicCollectionId === c.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                          {c.name} 🌐
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------  MOBILE SEARCH ---------- */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/40 z-[2000] md:hidden" onClick={() => setShowSearch(false)}>
          <div className="fixed top-0 left-0 right-0 bg-white rounded-b-2xl p-4" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              placeholder="Координаты или название"
              className="w-full p-2 border border-gray-200 rounded-lg text-sm"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              onKeyPress={e => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  const firstResult = searchResults[0];
                  map?.flyTo([firstResult.lat, firstResult.lon], 16);
                  setShowSearch(false);
                  setSearchResults([]);
                  setSearchQuery('');
                }
              }}
            />
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto text-sm">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      map?.flyTo([r.lat, r.lon], 16);
                      setShowSearch(false);
                      setSearchResults([]);
                      setSearchQuery('');
                    }}
                    className="w-full text-left p-2 hover:bg-gray-50 rounded"
                  >
                    {r.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------  MOBILE BOTTOM-SHEET ---------- */}
      {isMobile && showBottomSheet && bottomSheetPoint && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[1999]" onClick={handleCloseWithConfirm} />
          <div
            className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[2000] transition-all duration-300 ${bottomSheetHeight === 'expanded' ? 'h-[90vh]' : 'h-auto max-h-[70vh]'}`}
            style={{ transform: isDragging ? 'none' : undefined }}
          >
            {/* drag handle */}
            <div
              className="py-3 cursor-grab active:cursor-grabbing"
              onTouchStart={(e) => {
                setDragStartY(e.touches[0].clientY);
                setIsDragging(true);
              }}
              onTouchMove={(e) => {
                if (!isDragging) return;
                const delta = dragStartY - e.touches[0].clientY;
                if (delta > 50 && bottomSheetHeight === 'default') setBottomSheetHeight('expanded');
                if (delta < -50 && bottomSheetHeight === 'expanded') setBottomSheetHeight('default');
              }}
              onTouchEnd={() => setIsDragging(false)}
              onMouseDown={(e) => {
                setDragStartY(e.clientY);
                setIsDragging(true);
              }}
              onMouseMove={(e) => {
                if (!isDragging) return;
                const delta = dragStartY - e.clientY;
                if (delta > 50 && bottomSheetHeight === 'default') setBottomSheetHeight('expanded');
                if (delta < -50 && bottomSheetHeight === 'expanded') setBottomSheetHeight('default');
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            >
              <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto" />
            </div>

            <div className={`px-4 pb-safe ${bottomSheetHeight === 'expanded' ? 'h-full overflow-y-auto' : ''}`}>
              <div className="flex justify-between items-center py-3 border-b">
                <h3 className="text-lg font-semibold">
                  {canEditPoint(bottomSheetPoint) ? 'Карточка объекта' : 'Просмотр объекта'}
                </h3>
                <button onClick={handleCloseWithConfirm} className="p-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="py-4 space-y-4">
                {canEditPoint(bottomSheetPoint) ? (
                  <>
                    <input
                      type="text"
                      placeholder="Название места"
                      className="w-full p-3 border border-gray-200 rounded-lg text-gray-900"
                      value={editingPoint?.id === bottomSheetPoint.id ? editingPoint.name : bottomSheetPoint.name}
                      onChange={(e) => {
                        if (!editingPoint || editingPoint.id !== bottomSheetPoint.id) setEditingPoint(bottomSheetPoint);
                        setEditingPoint((prev) => ({ ...prev!, name: e.target.value }));
                      }}
                    />
                    <textarea
                      placeholder="Описание"
                      className="w-full p-3 border border-gray-200 rounded-lg text-gray-900 resize-none"
                      rows={bottomSheetHeight === 'expanded' ? 6 : 3}
                      value={editingPoint?.id === bottomSheetPoint.id ? editingPoint.description : bottomSheetPoint.description}
                      onChange={(e) => {
                        if (!editingPoint || editingPoint.id !== bottomSheetPoint.id) setEditingPoint(bottomSheetPoint);
                        setEditingPoint((prev) => ({ ...prev!, description: e.target.value }));
                      }}
                    />
                    <div className="flex gap-2">
                      <select
                        className="flex-1 p-3 border border-gray-200 rounded-lg text-gray-900"
                        value={editingPoint?.id === bottomSheetPoint.id ? editingPoint.collection_id || '' : bottomSheetPoint.collection_id || ''}
                        onChange={(e) => {
                          if (!editingPoint || editingPoint.id !== bottomSheetPoint.id) setEditingPoint(bottomSheetPoint);
                          setEditingPoint((prev) => ({ ...prev!, collection_id: e.target.value || undefined }));
                        }}
                      >
                        <option value="">⚪ Без коллекции</option>
                        {collections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.is_public ? ' 🌐' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewCollectionModal(true)}
                        className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                        title="Создать новую коллекцию"
                      >
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>

                    {bottomSheetHeight === 'expanded' && (
                      <div className="pt-4 border-t">
                        <h4 className="font-medium mb-2">Дополнительная информация</h4>
                        <p className="text-sm text-gray-600">📍 {bottomSheetPoint.lat.toFixed(6)}, {bottomSheetPoint.lng.toFixed(6)}</p>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button
                        className="flex-1 bg-blue-500 text-white px-4 py-3 rounded-xl"
                        onClick={() => handleSave(bottomSheetPoint.id)}
                      >
                        Сохранить
                      </button>
                      {bottomSheetPoint.id !== 'virtual-new' && bottomSheetPoint.id !== 'editing-new' && (
                        <button
                          className="flex-1 bg-red-500 text-white px-4 py-3 rounded-xl"
                          onClick={() => handleDelete(bottomSheetPoint.id)}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold text-gray-900 text-lg mb-2">{bottomSheetPoint.name}</h4>
                      {bottomSheetPoint.description && <p className="text-gray-600">{bottomSheetPoint.description}</p>}
                    </div>
                    {bottomSheetPoint.collection_id && (
                      <div>
                        <span className="inline-flex items-center gap-2 text-sm bg-gray-100 px-3 py-1 rounded-full">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: allCollections[bottomSheetPoint.collection_id] || '#ccc' }}
                          />
                          {[...collections, ...publicCollections].find((c) => c.id === bottomSheetPoint.collection_id)?.name || 'Неизвестная коллекция'}
                        </span>
                      </div>
                    )}
                    <div className="pt-4 border-t">
                      <p className="text-sm text-gray-500">
                        📍 Координаты: {bottomSheetPoint.lat.toFixed(6)}, {bottomSheetPoint.lng.toFixed(6)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ----------  MAP ---------- */}
      <MapContainer
        ref={setMap}
        center={[55.7558, 37.6173]}
        zoom={10}
        style={{ height: '100vh', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler />
        {centerPoint && <CenterMap point={centerPoint} onCentered={() => onCenterPointShown?.()} />}

        {filteredPoints.map((point) => {
          const icon = point.collection_id && allCollections[point.collection_id] ? createColoredIcon(allCollections[point.collection_id]) : defaultIcon;
          const isEditable = canEditPoint(point);
          return (
            <Marker
              key={point.id}
              position={[point.lat, point.lng]}
              icon={icon}
              draggable={isEditable && editingPoint?.id === point.id}
              eventHandlers={{
                add: e => {
                  if (point.id === openPopupId || point.id === 'virtual-new') {
                    e.target.openPopup();
                  }
                },
                click: () => {
                  if (isEditable) {
                    setEditingPoint(point);
                  }
                  if (point.id !== 'virtual-new') {
                    setOpenPopupId(point.id);
                  }
                  if (isMobile) {
                    setBottomSheetPoint(point);
                    setShowBottomSheet(true);
                  }
                },
                dragend: async (e) => {
                  const marker = e.target;
                  const newPosition = marker.getLatLng();
                  
                  if (editingPoint && editingPoint.id === point.id) {
                    setEditingPoint({
                      ...editingPoint,
                      lat: newPosition.lat,
                      lng: newPosition.lng
                    });
                  }
                  
                  try {
                    const updated = await updatePoint(point.id, {
                      lat: newPosition.lat,
                      lng: newPosition.lng
                    });
                    onPointsUpdate(points.map(p => (p.id === point.id ? updated : p)));
                    
                    const notification = document.createElement('div');
                    notification.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow z-[2000]';
                    notification.innerText = '✓ Местоположение обновлено';
                    document.body.appendChild(notification);
                    setTimeout(() => notification.remove(), 2000);
                  } catch (err) {
                    console.error('Error updating point position:', err);
                    alert('Ошибка при перемещении точки');
                  }
                }
              }}
            >
              {(!isMobile && (point.id === openPopupId || point.id === 'virtual-new')) && (
                <Popup closeButton={false} closeOnClick={false} closeOnEscapeKey={false}>
                  <div className="bg-white rounded-xl shadow-sm" style={{ minWidth: 300, margin: '-12px -12px' }}>
                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 rounded-t-xl flex justify-between items-center">
                      <h3 className="font-semibold">{isEditable ? 'Карточка объекта' : 'Просмотр объекта'}</h3>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCloseWithConfirm();
                        }}
                        className="text-white/80 hover:text-white transition-colors p-1"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="p-4">
                      {isEditable ? (
                        <>
                          <input
                            type="text"
                            placeholder="Название места"
                            className="w-full p-3 border border-gray-200 rounded-lg mb-3"
                            value={editingPoint?.id === point.id ? editingPoint.name : point.name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              if (!editingPoint || editingPoint.id !== point.id) setEditingPoint(point);
                              setEditingPoint((prev) => ({ ...prev!, name: e.target.value }));
                            }}
                          />
                          <textarea
                            placeholder="Описание"
                            className="w-full p-3 border border-gray-200 rounded-lg mb-3 resize-none"
                            rows={3}
                            value={editingPoint?.id === point.id ? editingPoint.description : point.description}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              if (!editingPoint || editingPoint.id !== point.id) setEditingPoint(point);
                              setEditingPoint((prev) => ({ ...prev!, description: e.target.value }));
                            }}
                          />

                          <div className="flex gap-2 mb-4">
                            <select
                              className="flex-1 p-3 border border-gray-200 rounded-lg"
                              value={editingPoint?.id === point.id ? editingPoint.collection_id || '' : point.collection_id || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                if (!editingPoint || editingPoint.id !== point.id) setEditingPoint(point);
                                setEditingPoint((prev) => ({ ...prev!, collection_id: e.target.value || undefined }));
                              }}
                            >
                              <option value="">⚪ Без коллекции</option>
                              {collections.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                  {c.is_public ? ' 🌐' : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowNewCollectionModal(true);
                              }}
                              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                              title="Создать новую коллекцию"
                            >
                              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>

                          <div className="flex gap-2">
                            <button
                              className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSave(point.id);
                              }}
                            >
                              Сохранить
                            </button>
                            {point.id !== 'virtual-new' && point.id !== 'editing-new' && (
                              <button
                                className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(point.id);
                                }}
                              >
                                Удалить
                              </button>
                            )}
                          </div>
                          {editingPoint?.id === point.id && (
                            <div className="mt-2 text-blue-600 font-medium text-sm">💡 Перетащите маркер для изменения местоположения</div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="mb-3">
                            <h4 className="font-semibold text-gray-900 mb-1">{point.name}</h4>
                            {point.description && <p className="text-gray-600 text-sm">{point.description}</p>}
                          </div>
                          {point.collection_id && (
                            <div className="mb-3">
                              <span className="inline-flex items-center gap-2 text-xs bg-gray-100 px-2 py-1 rounded-full">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: allCollections[point.collection_id] || '#ccc' }} />
                                {[...collections, ...publicCollections].find((c) => c.id === point.collection_id)?.name || 'Неизвестная коллекция'}
                              </span>
                            </div>
                          )}
                          <div className="text-xs text-gray-500 border-t pt-3">📍 {point.lat.toFixed(6)}, {point.lng.toFixed(6)}</div>
                        </>
                      )}
                    </div>
                  </div>
                </Popup>
              )}
            </Marker>
          );
        })}
      </MapContainer>

      {/* ----------  ZOOM BUTTONS ---------- */}
      <div className="fixed bottom-4 left-4 z-[999] flex flex-col space-y-2">
        <button
          onClick={() => map?.zoomIn()}
          className="bg-white w-10 h-10 rounded-lg shadow-lg flex items-center justify-center hover:shadow-xl transition-all duration-200"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={() => map?.zoomOut()}
          className="bg-white w-10 h-10 rounded-lg shadow-lg flex items-center justify-center hover:shadow-xl transition-all duration-200"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
      </div>

      {/* ----------  NEW COLLECTION MODAL ---------- */}
      {showNewCollectionModal && (
        <div className="fixed inset-0 bg-black/50 z-[2001] flex items-center justify-center p-4" onClick={() => setShowNewCollectionModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Новая коллекция</h3>
            <input
              type="text"
              placeholder="Название коллекции"
              className="w-full p-3 border border-gray-300 rounded-lg mb-3"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              autoFocus
            />
            <div className="mb-3">
              <label className="text-sm text-gray-700 mb-2 block">Цвет коллекции</label>
              <div className="flex gap-2">
                {['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280'].map((c) => (
                  <button
                    key={c}
                    className={`w-10 h-10 rounded-lg border-2 ${newCollectionColor === c ? 'border-gray-800' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewCollectionColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="new-collection-public"
                checked={newCollectionIsPublic}
                onChange={(e) => setNewCollectionIsPublic(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="new-collection-public" className="text-sm text-gray-700">
                🌐 Публичная коллекция
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!newCollectionName.trim()) return alert('Введите название коллекции');
                  try {
                    const newCol = await createCollection(newCollectionName.trim(), newCollectionColor, newCollectionIsPublic);
                    if (editingPoint) {
                      setEditingPoint({ ...editingPoint, collection_id: newCol.id });
                    }
                    onPointsUpdate(points);
                    setShowNewCollectionModal(false);
                    setNewCollectionName('');
                    setNewCollectionIsPublic(false);
                    const note = document.createElement('div');
                    note.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow z-[2000]';
                    note.innerText = '✓ Коллекция создана';
                    document.body.appendChild(note);
                    setTimeout(() => note.remove(), 2000);
                  } catch {
                    alert('Ошибка при создании коллекции');
                  }
                }}
                className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
              >
                Создать
              </button>
              <button
                onClick={() => {
                  setShowNewCollectionModal(false);
                  setNewCollectionName('');
                  setNewCollectionIsPublic(false);
                }}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

MapInner.displayName = 'MapInner';
export default MapInner;