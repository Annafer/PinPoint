'use client';

import MapComponent from './Map';
import Auth from './Auth';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Point, Collection, FilterType, MyCollectionFilter } from './types';
import { supabase } from './lib/supabase';
import { 
  fetchCollections, 
  fetchPoints, 
  createCollection, 
  deleteCollection, 
  updateCollection, 
  deletePoint,
  fetchPublicCollections,
  fetchPointsFromPublicCollections,
  fetchPointsByCollectionId
} from './lib/database';

export default function Home() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [publicCollections, setPublicCollections] = useState<Collection[]>([]);
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<'points' | 'collections'>('points');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNewCollectionForm, setShowNewCollectionForm] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionColor, setNewCollectionColor] = useState('#3B82F6');
  const [newCollectionIsPublic, setNewCollectionIsPublic] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [centerPoint, setCenterPoint] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | undefined>(undefined);
  const [filterType, setFilterType] = useState<FilterType>('my-collections');
  const [myCollectionFilter, setMyCollectionFilter] = useState<MyCollectionFilter>('all-my');
  const [selectedPublicCollectionId, setSelectedPublicCollectionId] = useState<string | undefined>(undefined);
  const mapRef = useRef<any>(null);

useEffect(() => {
  const handleCollectionsUpdated = () => {
    if (user) loadUserData();
  };

  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user ?? null);
    if (session?.user) {
      loadUserData();
    }
    setLoading(false);
  });

  window.addEventListener('collectionsUpdated', handleCollectionsUpdated);

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
    if (session?.user) {
      loadUserData();
    } else {
      setPoints([]);
      setCollections([]);
      setPublicCollections([]);
    }
  });

  return () => {
    subscription.unsubscribe();
    window.removeEventListener('collectionsUpdated', handleCollectionsUpdated);
  };
}, [user]);

  const loadUserData = async () => {
    try {
      const [collectionsData, pointsData, publicCollectionsData] = await Promise.all([
        fetchCollections(),
        fetchPoints(),
        fetchPublicCollections()
      ]);
      setCollections(collectionsData);
      setPoints(pointsData); // Уже отфильтровано в функции fetchPoints
      setPublicCollections(publicCollectionsData.filter(c => c.user_id !== user?.id));
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handlePointsUpdate = (newPoints: Point[]) => {
    setPoints(newPoints);
  };

  const handlePointClick = (pointId: string) => {
    setCenterPoint(pointId);
    // на мобилке закрываем панель
    if (window.innerWidth < 768) {
      setShowSidebar(false);
    }
    // на десктопе панель остаётся открытой
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setPoints([]);
    setCollections([]);
    setPublicCollections([]);
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      alert('Введите название коллекции');
      return;
    }
    
    try {
      // Проверяем уникальность имени
      const nameExists = collections.some(c => 
        c.name.toLowerCase() === newCollectionName.trim().toLowerCase()
      );
      if (nameExists) {
        alert('Коллекция с таким именем уже существует');
        return;
      }
      
      const newCollection = await createCollection(newCollectionName.trim(), newCollectionColor, newCollectionIsPublic);
      setCollections([...collections, newCollection]);
      setNewCollectionName('');
      setNewCollectionIsPublic(false);
      setShowNewCollectionForm(false);
      
      // Перезагружаем публичные коллекции если создали публичную
      if (newCollectionIsPublic) {
        const publicCollectionsData = await fetchPublicCollections();
        setPublicCollections(publicCollectionsData);
      }
      
      const notification = document.createElement('div');
      notification.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-[2000]';
      notification.textContent = 'Коллекция создана!';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 2000);
    } catch (error) {
      console.error('Error creating collection:', error);
      alert('Ошибка при создании коллекции');
    }
  };

  const handleUpdateCollection = async () => {
    if (!editingCollection || !editingCollection.name.trim()) {
      alert('Введите название коллекции');
      return;
    }
    
    try {
      const updated = await updateCollection(editingCollection.id, {
        name: editingCollection.name,
        color: editingCollection.color,
        is_public: editingCollection.is_public
      });
      setCollections(collections.map(c => c.id === updated.id ? updated : c));
      setEditingCollection(null);
      // Перезагружаем публичные коллекции если изменился статус публичности
      const publicCollectionsData = await fetchPublicCollections();
      setPublicCollections(publicCollectionsData);
    } catch (error) {
      console.error('Error updating collection:', error);
      alert('Ошибка при обновлении коллекции');
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!confirm('Удалить коллекцию? Точки из неё не будут удалены.')) return;
    
    try {
      await deleteCollection(id);
      setCollections(collections.filter(c => c.id !== id));
      // Перезагружаем публичные коллекции
      const publicCollectionsData = await fetchPublicCollections();
      setPublicCollections(publicCollectionsData);
    } catch (error) {
      console.error('Error deleting collection:', error);
      alert('Ошибка при удалении коллекции');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth onSuccess={() => {}} />;
  }

    return (
    <main className="h-screen w-screen relative overflow-hidden">
      <MapComponent 
        ref={mapRef}
        points={points} 
        collections={collections}
        publicCollections={publicCollections}
        onPointsUpdate={handlePointsUpdate}
        onCollectionsUpdate={setCollections}
        centerPointId={centerPoint}
        onCenterPointShown={() => setCenterPoint(null)}
        selectedCollectionId={selectedCollectionId}
        filterType={filterType}
        myCollectionFilter={myCollectionFilter}
        selectedPublicCollectionId={selectedPublicCollectionId}
      />
      
      <button
        className="fixed bottom-6 right-6 z-[1000] bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 md:hidden"
        onClick={() => setShowSidebar(!showSidebar)}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {showSidebar ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      <button
        className="hidden md:block absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm p-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
        onClick={() => setShowSidebar(!showSidebar)}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {showSidebar && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      <div className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-2xl z-[1001] transform transition-transform duration-300 ease-out ${
        showSidebar ? 'translate-x-0' : 'translate-x-full'
      } md:absolute md:w-96`}>
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Мои места</h2>
            <button
              onClick={() => setShowSidebar(false)}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 bg-white/10 backdrop-blur rounded-lg p-3">
            <p className="text-xs opacity-90">Аккаунт</p>
            <p className="text-sm font-medium truncate">{user.email}</p>
            <button
              onClick={handleLogout}
              className="mt-2 text-xs text-white/80 hover:text-white transition-colors"
            >
              Выйти →
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider mb-2 block">
            Коллекция для новых точек
          </label>
          <div className="relative">
            <button
              type="button"
              className="w-full flex items-center justify-between p-2 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white"
              onClick={() => setShowCollectionDropdown(!showCollectionDropdown)}
            >
              <div className="flex items-center">
                {selectedCollectionId ? (
                  <>
                    <div
                      className="w-4 h-4 rounded-full mr-2"
                      style={{
                        backgroundColor:
                          collections.find(c => c.id === selectedCollectionId)?.color ||
                          '#9CA3AF',
                      }}
                    />
                    {collections.find(c => c.id === selectedCollectionId)?.name}
                  </>
                ) : (
                  <>
                    <div className="w-4 h-4 rounded-full mr-2 bg-gray-400" />
                    Без коллекции
                  </>
                )}
              </div>
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div
              id="collectionDropdown"
              className={`absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 ${showCollectionDropdown ? '' : 'hidden'}`}
            >
              <button
                type="button"
                className="w-full flex items-center p-2 text-sm text-gray-800 hover:bg-gray-100"
                onClick={() => {
                  setSelectedCollectionId(undefined);
                  setShowCollectionDropdown(false);
                }}
              >
                <div className="w-4 h-4 rounded-full mr-2 bg-gray-400" />
                Без коллекции
              </button>

              {collections.map(collection => (
                <button
                  key={collection.id}
                  type="button"
                  className="w-full flex items-center p-2 text-sm text-gray-800 hover:bg-gray-100"
                  onClick={() => {
                    setSelectedCollectionId(collection.id);
                    setShowCollectionDropdown(false);
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full mr-2"
                    style={{ backgroundColor: collection.color }}
                  />
                  {collection.name}
                  {collection.is_public && <span className="ml-1 text-xs text-blue-600">🌐</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 px-4 py-2">
          <div className="bg-white rounded-lg p-1 flex shadow-sm">
            <button 
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'points' 
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('points')}
            >
              Точки ({points.length})
            </button>
            <button 
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === 'collections' 
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab('collections')}
            >
              Коллекции ({collections.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-20" style={{ height: 'calc(100% - 300px)' }}>
          {activeTab === 'points' ? (
            <div className="space-y-3">
              {points.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-gray-500 text-sm">Нажмите на карту,<br/>чтобы добавить первое место</p>
                </div>
              ) : (
                points.map(point => (
                  <div 
                    key={point.id}
                    className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all duration-200 cursor-pointer group"
                    onClick={() => handlePointClick(point.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{point.name}</h3>
                        {point.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{point.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {point.collection_id && (
                          <div 
                            className="w-8 h-8 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: collections.find(c => c.id === point.collection_id)?.color || '#ccc' }}
                          />
                        )}
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm('Удалить точку?')) {
                              await deletePoint(point.id);
                              setPoints(points.filter(p => p.id !== point.id));
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {point.collection_id && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                          {collections.find(c => c.id === point.collection_id)?.name}
                        </span>
                        {collections.find(c => c.id === point.collection_id)?.is_public && (
                          <span className="text-xs text-blue-600">🌐 Публичная</span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {collections.map(collection => (
                <div key={collection.id}>
                  {editingCollection?.id === collection.id ? (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
                      <input
                        type="text"
                        className="w-full p-2 border border-gray-300 rounded-lg mb-2 text-gray-900"
                        value={editingCollection.name}
                        onChange={(e) => setEditingCollection({
                          ...editingCollection,
                          name: e.target.value
                        })}
                        autoFocus
                      />
                      <div className="flex items-center mb-3">
                        <span className="text-sm text-gray-700 mr-3">Цвет:</span>
                        <div className="flex space-x-2">
                          {['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280'].map(color => (
                            <button
                              key={color}
                              className={`w-8 h-8 rounded-lg border-2 ${editingCollection.color === color ? 'border-gray-800' : 'border-transparent'}`}
                              style={{ backgroundColor: color }}
                              onClick={() => setEditingCollection({
                                ...editingCollection,
                                color
                              })}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center mb-3">
                        <input
                          type="checkbox"
                          id="edit-public"
                          checked={editingCollection.is_public}
                          onChange={(e) => setEditingCollection({
                            ...editingCollection,
                            is_public: e.target.checked
                          })}
                          className="mr-2"
                        />
                        <label htmlFor="edit-public" className="text-sm text-gray-700">
                          🌐 Публичная коллекция
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdateCollection}
                          className="flex-1 bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600"
                        >
                          Сохранить
                        </button>
                        <button
                          onClick={() => setEditingCollection(null)}
                          className="flex-1 bg-gray-300 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-400"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all duration-200 group">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-1">
                          <div 
                            className="w-10 h-10 rounded-lg mr-3"
                            style={{ backgroundColor: collection.color }}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{collection.name}</span>
                              {collection.is_public && <span className="text-xs text-blue-600">🌐</span>}
                            </div>
                            <p className="text-sm text-gray-500">
                              {points.filter(p => p.collection_id === collection.id).length} мест
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCollection(collection);
                            }}
                            className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCollection(collection.id);
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {showNewCollectionForm ? (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
                  <input
                    type="text"
                    placeholder="Название коллекции"
                    className="w-full p-3 border border-gray-300 rounded-lg mb-3 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    autoFocus
                  />
                  <div className="flex items-center mb-3">
                    <span className="text-sm text-gray-700 mr-3">Цвет:</span>
                    <div className="flex space-x-2">
                      {['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280'].map(color => (
                        <button
                          key={color}
                          className={`w-8 h-8 rounded-lg border-2 ${newCollectionColor === color ? 'border-gray-800' : 'border-transparent'}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setNewCollectionColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center mb-3">
                    <input
                      type="checkbox"
                      id="new-public"
                      checked={newCollectionIsPublic}
                      onChange={(e) => setNewCollectionIsPublic(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="new-public" className="text-sm text-gray-700">
                      🌐 Публичная коллекция
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateCollection}
                      className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:shadow-lg transition-all"
                    >
                      Создать
                    </button>
                    <button
                      onClick={() => {
                        setShowNewCollectionForm(false);
                        setNewCollectionName('');
                        setNewCollectionIsPublic(false);
                      }}
                      className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setShowNewCollectionForm(true)}
                  className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-all duration-200 bg-gray-50"
                >
                  <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Создать коллекцию
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}