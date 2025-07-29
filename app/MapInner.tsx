'use client';

import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import { useState, useMemo, useEffect, forwardRef, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Point, Collection, FilterType, MyCollectionFilter } from './types';
import { createPoint, updatePoint, deletePoint, fetchPointsFromPublicCollections, fetchPointsByCollectionId } from './lib/database';
import { supabase } from './lib/supabase';

const createColoredIcon = (color: string) => {
  const markerHtmlStyles = `
    background-color: ${color};
    width: 25px;
    height: 25px;
    display: block;
    left: -12.5px;
    top: -25px;
    position: relative;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 2px solid #FFFFFF;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
  `;

  return L.divIcon({
    className: "custom-pin",
    iconAnchor: [0, 0],
    popupAnchor: [0, 0],
    html: `<span style="${markerHtmlStyles}" />`
  });
};

const defaultIcon = createColoredIcon('#9CA3AF');

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

function CenterMap({ point, onCentered }: { point: Point | null, onCentered: () => void }) {
  const map = useMap();
  
  useEffect(() => {
    if (point) {
      map.flyTo([point.lat, point.lng], 16, { duration: 1 });
      setTimeout(() => {
        // Открываем попап для центрированной точки
        map.eachLayer((layer: any) => {
          if (layer instanceof L.Marker && layer.getLatLng) {
            const latLng = layer.getLatLng();
            if (latLng.lat === point.lat && latLng.lng === point.lng) {
              layer.openPopup();
            }
          }
        });
        onCentered();
      }, 1100);
    }
  }, [point, map, onCentered]);
  
  return null;
}

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
    selectedPublicCollectionId
  } = props;

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

  // Проверяем, что мы на клиенте
  useEffect(() => {
    setIsClient(true);
  }, []);

  const [pendingPoint, setPendingPoint] = useState<{lat: number, lng: number} | null>(null);

  // Получаем текущего пользователя
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Функция для проверки, может ли пользователь редактировать точку
  const canEditPoint = useCallback((point: Point) => {
    return currentUserId && point.user_id === currentUserId;
  }, [currentUserId]);

  // Асинхронная функция для загрузки отфильтрованных точек
  const loadFilteredPoints = useCallback(async () => {
    console.log('Loading filtered points for:', { currentFilterType, currentMyCollectionFilter, currentPublicCollectionId });
    
    try {
      let filtered: Point[];
      
      switch (currentFilterType) {
        case 'all-public':
          console.log('Fetching all public points...');
          filtered = await fetchPointsFromPublicCollections();
          console.log('Received public points:', filtered.length);
          break;
        
        case 'my-collections':
          if (currentMyCollectionFilter === 'all-my') {
            filtered = points;
          } else if (currentMyCollectionFilter === 'no-collection') {
            filtered = points.filter(p => !p.collection_id);
          } else {
            filtered = points.filter(p => p.collection_id === currentMyCollectionFilter);
          }
          console.log('My collections filter result:', filtered.length);
          break;
        
        case 'public-collections':
          if (currentPublicCollectionId) {
            console.log('Fetching points for public collection:', currentPublicCollectionId);
            filtered = await fetchPointsByCollectionId(currentPublicCollectionId);
            console.log('Received points for collection:', filtered.length);
          } else {
            filtered = [];
            console.log('No public collection selected');
          }
          break;
        
        default:
          filtered = points;
      }
      
      console.log('Setting filtered points:', filtered.length);
      setFilteredPoints(filtered);
    } catch (error) {
      console.error('Error loading filtered points:', error);
      setFilteredPoints(points);
    }
  }, [currentFilterType, currentMyCollectionFilter, currentPublicCollectionId, points]);

  useEffect(() => {
    loadFilteredPoints();
  }, [loadFilteredPoints]);

  const allCollections = useMemo(() => {
    const map: { [k: string]: string } = {};
    [...collections, ...publicCollections].forEach(c => (map[c.id] = c.color));
    return map;
  }, [collections, publicCollections]);

  const centerPoint = useMemo(
    () => (centerPointId ? filteredPoints.find(p => p.id === centerPointId) || null : null),
    [centerPointId, filteredPoints]
  );

  const handleFilterChange = async (newFilterType: FilterType, newMyFilter?: MyCollectionFilter, newPublicId?: string, shouldClose: boolean = false) => {
    setCurrentFilterType(newFilterType);
    if (newMyFilter !== undefined) setCurrentMyCollectionFilter(newMyFilter);
    if (newPublicId !== undefined) setCurrentPublicCollectionId(newPublicId);
    
    if (shouldClose) {
      setShowFilters(false);
    }
    
    // Асинхронная фильтрация с API вызовами
    try {
      let filtered: Point[];
      const myFilter = newMyFilter !== undefined ? newMyFilter : currentMyCollectionFilter;
      const publicId = newPublicId !== undefined ? newPublicId : currentPublicCollectionId;
      
      switch (newFilterType) {
        case 'all-public':
          filtered = await fetchPointsFromPublicCollections();
          break;
        
        case 'my-collections':
          if (myFilter === 'all-my') {
            filtered = points;
          } else if (myFilter === 'no-collection') {
            filtered = points.filter(p => !p.collection_id);
          } else {
            filtered = points.filter(p => p.collection_id === myFilter);
          }
          break;
        
        case 'public-collections':
          if (publicId) {
            filtered = await fetchPointsByCollectionId(publicId);
          } else {
            filtered = [];
          }
          break;
        
        default:
          filtered = points;
      }
      
      setFilteredPoints(filtered);
    } catch (error) {
      console.error('Error loading filtered points:', error);
      setFilteredPoints(points);
    }
  };

  const MapClickHandler = () => {
    useMapEvents({
      click: async (e) => {
        if (ignoreNextClick) {
          setIgnoreNextClick(false);
          return;
        }
        
        // Проверяем, что мы на клиенте
        if (!isClient) return;
        
        // Только авторизованные пользователи могут создавать точки
        if (!currentUserId) {
          alert('Войдите в систему для создания точек');
          return;
        }
        
        const { lat, lng } = e.latlng;
        
        // Сохраняем координаты для последующего создания
        setPendingPoint({ lat, lng });
        
        // Создаем временный объект для редактирования (не добавляем в points)
        const tempEditingPoint: Point = {
          id: 'editing-new',
          user_id: currentUserId,
          name: 'Новая точка',
          description: '',
          lat,
          lng,
          collection_id: selectedCollectionId,
          created_at: new Date().toISOString()
        };
        
        setEditingPoint(tempEditingPoint);
        
        if (isMobile) {
          setBottomSheetPoint(tempEditingPoint);
          setShowBottomSheet(true);
        } else {
          // Создаем виртуальную точку только для отображения попапа на десктопе
          const virtualPoint: Point = {
            ...tempEditingPoint,
            id: 'virtual-new'
          };
          // Добавляем виртуальную точку временно для отображения попапа
          onPointsUpdate([...points, virtualPoint]);
          setOpenPopupId('virtual-new');
        }
      }
    });
    return null;
  };

  const handleSearch = async () => {
    const coordMatch = searchQuery.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        map?.flyTo([lat, lng], 16);
        setShowSearch(false);
        setSearchResults([]);
        return;
      }
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

const handleSave = async (id: string) => {
    if (!editingPoint) return;
    
    if (!editingPoint.name.trim() || editingPoint.name === 'Новая точка') {
      alert('Введите название точки');
      return;
    }
    
    try {
      // Если это новая точка (еще не сохранена в БД)
      if ((editingPoint.id === 'editing-new' || editingPoint.id === 'virtual-new') && pendingPoint) {
        const saved = await createPoint({
          name: editingPoint.name,
          description: editingPoint.description,
          lat: pendingPoint.lat,
          lng: pendingPoint.lng,
          collection_id: editingPoint.collection_id
        });
        
        // Удаляем виртуальную точку (если есть) и добавляем сохраненную
        let filteredPoints = points;
        if (!isMobile) {
          filteredPoints = points.filter(p => p.id !== 'virtual-new');
        }
        onPointsUpdate([...filteredPoints, saved]);
        setPendingPoint(null);
      } else {
        // Проверяем права на редактирование существующей точки
        if (!canEditPoint(editingPoint)) {
          alert('У вас нет прав для редактирования этой точки');
          return;
        }
        
        // Обновляем существующую точку
        const updated = await updatePoint(id, {
          name: editingPoint.name,
          description: editingPoint.description,
          collection_id: editingPoint.collection_id
        });
        onPointsUpdate(points.map(p => (p.id === id ? updated : p)));
      }
      
      // Сбрасываем все состояния и закрываем попап/bottomsheet
      setEditingPoint(null);
      setOpenPopupId(null);
      
      if (isMobile) {
        setShowBottomSheet(false);
        setBottomSheetPoint(null);
      } else {
        // Закрываем попап безопасно
        setTimeout(() => {
          try {
            const popups = document.querySelectorAll('.leaflet-popup');
            popups.forEach(popup => {
              try {
                popup.remove();
              } catch (e) {
                console.warn('Could not remove popup:', e);
              }
            });
          } catch (e) {
            console.warn('Error cleaning up popups:', e);
          }
        }, 0);
      }
      
      // Показываем уведомление
      const notification = document.createElement('div');
      notification.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow z-[2000]';
      notification.innerText = '✓ Сохранено';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 2000);
    } catch (err) {
      console.error('Error saving point:', err);
      alert('Ошибка при сохранении точки');
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    const pointToDelete = points.find(p => p.id === id) || filteredPoints.find(p => p.id === id);
    if (!pointToDelete) return;
    
    // Проверяем права на удаление
    if (!canEditPoint(pointToDelete)) {
      alert('У вас нет прав для удаления этой точки');
      return;
    }
    
    if (!confirm('Удалить точку?')) return;
    
    try {
      await deletePoint(id);
      onPointsUpdate(points.filter(p => p.id !== id));
      if (isMobile) {
        setShowBottomSheet(false);
        setBottomSheetPoint(null);
      }
    } catch (err) {
      console.error('Error deleting point:', err);
      alert('Ошибка при удалении точки');
    }
  };

  const handleCloseWithConfirm = () => {
    if (editingPoint && editingPoint.name === 'Новая точка') {
      if (!confirm('Вы уверены, что не хотите добавить объект?')) return;
    } else if (editingPoint && (editingPoint.name !== 'Новая точка' || editingPoint.description)) {
      if (!confirm('Вы уверены, что не хотите сохранить изменения?')) return;
    }
    
    // Если это была новая точка, очищаем состояния
    if (editingPoint?.id === 'editing-new') {
      // Удаляем виртуальную точку только если она есть (для десктопа)
      if (!isMobile) {
        onPointsUpdate(points.filter(p => p.id !== 'virtual-new'));
      }
      setPendingPoint(null);
    }
    
    // Сбрасываем все состояния
    setEditingPoint(null);
    setOpenPopupId(null);
    setIgnoreNextClick(true);
    setTimeout(() => setIgnoreNextClick(false), 300);
    
    if (isMobile) {
      setShowBottomSheet(false);
      setBottomSheetPoint(null);
    } else {
      // Принудительно закрываем все попапы
      setTimeout(() => {
        const popups = document.querySelectorAll('.leaflet-popup');
        popups.forEach(popup => {
          try {
            const closeBtn = popup.querySelector('.leaflet-popup-close-button') as HTMLElement;
            if (closeBtn) {
              closeBtn.click();
            } else {
              // Если кнопка закрытия не найдена, удаляем попап напрямую
              popup.remove();
            }
          } catch (e) {
            // Игнорируем ошибки при удалении попапов
            console.warn('Could not close popup:', e);
          }
        });
      }, 0);
    }
  };

  return (
    <>
      {/* Mobile: top-left pills */}
      <div className="fixed top-4 left-4 z-[1000] flex gap-3 md:hidden">
        <button
          onClick={() => setShowFilters(true)}
          className="bg-white/80 backdrop-blur-sm rounded-full shadow-lg p-3 hover:scale-110 transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
          </svg>
        </button>
        <button
          onClick={() => setShowSearch(true)}
          className="bg-white/80 backdrop-blur-sm rounded-full shadow-lg p-3 hover:scale-110 transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      {/* Desktop: filter and search */}
      <div className="absolute top-4 left-4 z-[1000] hidden md:flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-white/70 backdrop-blur-sm rounded-xl shadow-sm px-4 py-2 text-sm font-medium text-slate-800 flex items-center gap-2 hover:shadow-md transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46 22,3" />
            </svg>
            Фильтры
          </button>

          {showFilters && (
            <div className="absolute top-full mt-2 bg-white rounded-xl shadow-lg p-4 w-80">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Показать</label>
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => handleFilterChange('all-public', undefined, undefined, true)}
                  className={`w-full text-left p-3 rounded-lg transition-all ${
                    currentFilterType === 'all-public'
                      ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌐</span>
                    <div>
                      <div className="font-medium">Все доступные коллекции</div>
                      <div className="text-xs opacity-70">Публичные точки всех пользователей</div>
                    </div>
                  </div>
                </button>

                <div className={`border rounded-lg ${currentFilterType === 'my-collections' ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
                  <button
                    onClick={() => handleFilterChange('my-collections')}
                    className={`w-full text-left p-3 rounded-t-lg transition-all ${
                      currentFilterType === 'my-collections' ? 'text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
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
                        className={`w-full text-left p-2 rounded-md text-sm ${
                          currentMyCollectionFilter === 'all-my' ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        ✨ Все мои точки ({points.length})
                      </button>
                      
                      <button
                        onClick={() => handleFilterChange('my-collections', 'no-collection', undefined, true)}
                        className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 ${
                          currentMyCollectionFilter === 'no-collection' ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                        Без коллекции ({points.filter(p => !p.collection_id).length})
                      </button>

                      {collections.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleFilterChange('my-collections', c.id, undefined, true)}
                          className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 ${
                            currentMyCollectionFilter === c.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-100'
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
                    className={`w-full text-left p-3 rounded-t-lg transition-all ${
                      currentFilterType === 'public-collections' ? 'text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌍</span>
                      <div>
                        <div className="font-medium">Публичные коллекции</div>
                      </div>
                    </div>
                  </button>
                  
                  {currentFilterType === 'public-collections' && (
                    <div className="px-3 pb-3 space-y-1 max-h-40 overflow-y-auto">
                      {publicCollections.length === 0 ? (
                        <p className="text-sm text-gray-500 p-2">Нет публичных коллекций</p>
                      ) : (
                        publicCollections.map(c => (
                          <button
                            key={c.id}
                            onClick={() => handleFilterChange('public-collections', undefined, c.id, true)}
                            className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 ${
                              currentPublicCollectionId === c.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-100'
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
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="bg-white/70 backdrop-blur-sm rounded-xl shadow-sm px-4 py-2 text-sm font-medium text-slate-800 flex items-center gap-2 hover:shadow-md transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSearch()}
                />
                <button onClick={handleSearch} className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
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

      {/* Mobile filter bottom-sheet */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/40 z-[2000] md:hidden" onClick={() => setShowFilters(false)}>
          <div className="fixed top-0 left-0 right-0 bg-white rounded-b-2xl p-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="space-y-3">
              <button
                onClick={() => handleFilterChange('all-public', undefined, undefined, true)}
                className={`w-full text-left p-3 rounded-lg ${
                  currentFilterType === 'all-public' ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200' : 'text-gray-800 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🌐</span>
                  <div>
                    <div className="font-medium">Все доступные коллекции</div>
                    <div className="text-sm opacity-70">Публичные точки всех пользователей</div>
                  </div>
                </div>
              </button>

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
                    {publicCollections.length === 0 ? (
                      <p className="text-sm text-gray-500 p-2">Нет публичных коллекций</p>
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

      {/* Mobile search bottom-sheet */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/40 z-[2000] md:hidden" onClick={() => setShowSearch(false)}>
          <div className="fixed top-0 left-0 right-0 bg-white rounded-b-2xl p-4" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              placeholder="Координаты или название"
              className="w-full p-2 border border-gray-200 rounded-lg text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSearch()}
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

      {/* Map */}
      <MapContainer
        ref={setMap}
        center={[55.7558, 37.6173]}
        zoom={10}
        style={{ height: '100vh', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler />
        {centerPoint && (
          <CenterMap point={centerPoint} onCentered={() => onCenterPointShown?.()} />
        )}

        {filteredPoints.map(point => {
          const icon = point.collection_id && allCollections[point.collection_id]
            ? createColoredIcon(allCollections[point.collection_id])
            : defaultIcon;

          const isEditable = canEditPoint(point);

          return (
            <Marker
              key={point.id}
              position={[point.lat, point.lng]}
              icon={icon}
              eventHandlers={{
                add: e => {
                  // Открываем попап для обычных точек из openPopupId или для виртуальной новой точки
                  if (point.id === openPopupId || point.id === 'virtual-new') {
                    e.target.openPopup();
                  }
                },
                click: () => {
                  if (isEditable) {
                    setEditingPoint(point);
                  }
                  // Открываем попап для обычных точек (не виртуальных)
                  if (point.id !== 'virtual-new') {
                    setOpenPopupId(point.id);
                  }
                  if (isMobile) {
                    setBottomSheetPoint(point);
                    setShowBottomSheet(true);
                  }
                }
              }}
            >
              {(!isMobile && (point.id === openPopupId || point.id === 'virtual-new')) && (
                <Popup 
                  closeButton={false}
                  closeOnClick={false}
                  closeOnEscapeKey={false}
                >
                  <div className="bg-white rounded-xl shadow-sm" style={{ minWidth: '300px', margin: '-12px -12px' }}>
                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 rounded-t-xl flex justify-between items-center">
                      <h3 className="font-semibold">
                        {isEditable ? 'Карточка объекта' : 'Просмотр объекта'}
                      </h3>
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCloseWithConfirm();
                        }} 
                        className="text-white/80 hover:text-white transition-colors p-1 cursor-pointer"
                        type="button"
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
                            className="w-full p-3 border border-gray-200 rounded-lg mb-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            value={editingPoint?.id === point.id ? editingPoint.name : point.name}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                              if (!editingPoint || editingPoint.id !== point.id) setEditingPoint(point);
                              setEditingPoint(prev => ({ ...prev!, name: e.target.value }));
                            }}
                          />
                          <textarea
                            placeholder="Описание"
                            className="w-full p-3 border border-gray-200 rounded-lg mb-3 text-gray-900 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            rows={3}
                            value={editingPoint?.id === point.id ? editingPoint.description : point.description}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                              if (!editingPoint || editingPoint.id !== point.id) setEditingPoint(point);
                              setEditingPoint(prev => ({ ...prev!, description: e.target.value }));
                            }}
                          />

                          <select
                            className="w-full p-3 border border-gray-200 rounded-lg mb-4 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            value={editingPoint?.id === point.id ? editingPoint.collection_id || '' : point.collection_id || ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                              if (!editingPoint || editingPoint.id !== point.id) setEditingPoint(point);
                              setEditingPoint(prev => ({ ...prev!, collection_id: e.target.value || undefined }));
                            }}
                          >
                            <option value="">⚪ Без коллекции</option>
                            {collections.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name}{c.is_public ? ' 🌐' : ''}
                              </option>
                            ))}
                          </select>

                          <div className="flex gap-2">
                            <button
                              className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:shadow-lg transition-all"
                              onClick={e => {
                                e.stopPropagation();
                                handleSave(point.id);
                              }}
                            >
                              Сохранить
                            </button>
                            <button
                              className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg font-medium hover:shadow-lg transition-all"
                              onClick={e => {
                                e.stopPropagation();
                                handleDelete(point.id);
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-3">
                            <h4 className="font-semibold text-gray-900 mb-1">{point.name}</h4>
                            {point.description && (
                              <p className="text-gray-600 text-sm">{point.description}</p>
                            )}
                          </div>
                          
                          {point.collection_id && (
                            <div className="mb-3">
                              <span className="inline-flex items-center gap-2 text-xs bg-gray-100 px-2 py-1 rounded-full">
                                <div 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: allCollections[point.collection_id] || '#ccc' }}
                                />
                                {[...collections, ...publicCollections].find(c => c.id === point.collection_id)?.name || 'Неизвестная коллекция'}
                              </span>
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-500 border-t pt-3">
                            📍 {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                          </div>
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

      {/* Mobile bottom-sheet */}
      {isMobile && showBottomSheet && bottomSheetPoint && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[1999]" onClick={handleCloseWithConfirm} />
          <div
            className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[2000] transition-all duration-300 ${
              bottomSheetHeight === 'expanded' ? 'h-[90vh]' : 'h-auto max-h-[70vh]'
            }`}
            style={{ transform: isDragging ? 'none' : undefined }}
          >
            <div
              className="py-3 cursor-grab active:cursor-grabbing"
              onTouchStart={e => {
                setDragStartY(e.touches[0].clientY);
                setIsDragging(true);
              }}
              onTouchMove={e => {
                if (!isDragging) return;
                const deltaY = dragStartY - e.touches[0].clientY;
                if (deltaY > 50 && bottomSheetHeight === 'default') setBottomSheetHeight('expanded');
                if (deltaY < -50 && bottomSheetHeight === 'expanded') setBottomSheetHeight('default');
              }}
              onTouchEnd={() => setIsDragging(false)}
              onMouseDown={e => {
                setDragStartY(e.clientY);
                setIsDragging(true);
              }}
              onMouseMove={e => {
                if (!isDragging) return;
                const deltaY = dragStartY - e.clientY;
                if (deltaY > 50 && bottomSheetHeight === 'default') setBottomSheetHeight('expanded');
                if (deltaY < -50 && bottomSheetHeight === 'expanded') setBottomSheetHeight('default');
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
                      className="w-full p-3 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={editingPoint?.id === bottomSheetPoint.id ? editingPoint.name : bottomSheetPoint.name}
                      onChange={e => {
                        if (!editingPoint || editingPoint.id !== bottomSheetPoint.id) setEditingPoint(bottomSheetPoint);
                        setEditingPoint(prev => ({ ...prev!, name: e.target.value }));
                      }}
                    />
                    <textarea
                      placeholder="Описание"
                      className="w-full p-3 border border-gray-200 rounded-lg text-gray-900 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={bottomSheetHeight === 'expanded' ? 6 : 3}
                      value={editingPoint?.id === bottomSheetPoint.id ? editingPoint.description : bottomSheetPoint.description}
                      onChange={e => {
                        if (!editingPoint || editingPoint.id !== bottomSheetPoint.id) setEditingPoint(bottomSheetPoint);
                        setEditingPoint(prev => ({ ...prev!, description: e.target.value }));
                      }}
                    />

                    <select
                      className="w-full p-3 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={editingPoint?.id === bottomSheetPoint.id ? editingPoint.collection_id || '' : bottomSheetPoint.collection_id || ''}
                      onChange={e => {
                        if (!editingPoint || editingPoint.id !== bottomSheetPoint.id) setEditingPoint(bottomSheetPoint);
                        setEditingPoint(prev => ({ ...prev!, collection_id: e.target.value || undefined }));
                      }}
                    >
                      <option value="">⚪ Без коллекции</option>
                      {collections.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.is_public ? ' 🌐' : ''}
                        </option>
                      ))}
                    </select>

                    {bottomSheetHeight === 'expanded' && (
                      <div className="pt-4 border-t">
                        <h4 className="font-medium mb-2">Дополнительная информация</h4>
                        <p className="text-sm text-gray-600">📍 {bottomSheetPoint.lat.toFixed(6)}, {bottomSheetPoint.lng.toFixed(6)}</p>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button
                        className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 rounded-xl font-medium hover:shadow-lg transition-all"
                        onClick={() => handleSave(bottomSheetPoint.id === 'virtual-new' ? 'editing-new' : bottomSheetPoint.id)}
                      >
                        Сохранить
                      </button>
                      <button
                        className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-3 rounded-xl font-medium hover:shadow-lg transition-all"
                        onClick={() => handleDelete(bottomSheetPoint.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-gray-900 text-lg mb-2">{bottomSheetPoint.name}</h4>
                        {bottomSheetPoint.description && (
                          <p className="text-gray-600">{bottomSheetPoint.description}</p>
                        )}
                      </div>
                      
                      {bottomSheetPoint.collection_id && (
                        <div>
                          <span className="inline-flex items-center gap-2 text-sm bg-gray-100 px-3 py-1 rounded-full">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: allCollections[bottomSheetPoint.collection_id] || '#ccc' }}
                            />
                            {[...collections, ...publicCollections].find(c => c.id === bottomSheetPoint.collection_id)?.name || 'Неизвестная коллекция'}
                          </span>
                        </div>
                      )}
                      
                      <div className="pt-4 border-t">
                        <p className="text-sm text-gray-500">
                          📍 Координаты: {bottomSheetPoint.lat.toFixed(6)}, {bottomSheetPoint.lng.toFixed(6)}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Zoom buttons */}
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
    </>
  );
});

MapInner.displayName = 'MapInner';
export default MapInner;