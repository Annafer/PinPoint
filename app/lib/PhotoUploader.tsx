'use client';
import { useRef } from 'react';
import { uploadPhoto, deletePhoto } from '../lib/database';

export function PhotoUploader({
  pointId,
  photos,
  onChange,
}: {
  pointId: string;
  photos: { id: string; url: string }[];
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPhoto(pointId, file);
    onChange();
    e.target.value = ''; // сброс
  };

  const remove = async (p: { id: string; url: string }) => {
    await deletePhoto(p.id, p.url);
    onChange();
  };

  return (
    <div className="space-y-2">
      {/* Превью */}
      <div className="flex gap-2 overflow-x-auto">
        {photos.map((p) => (
          <div key={p.id} className="relative group">
            <img src={p.url} alt="" className="w-20 h-20 object-cover rounded-md" />
            <button
              onClick={() => remove(p)}
              className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Скрытый input + кнопка */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1 text-sm text-blue-600"
      >
        📷 Добавить фото
      </button>
    </div>
  );
}