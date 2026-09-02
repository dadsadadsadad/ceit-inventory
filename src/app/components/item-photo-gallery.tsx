"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type ItemPhoto = { fileName: string; id: string };

type ItemPhotoGalleryProps = {
  itemId: string;
  itemName: string;
  photos: ItemPhoto[];
};

export function ItemPhotoGallery({ itemId, itemName, photos }: ItemPhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const selectedPhoto = selectedIndex === null ? null : photos[selectedIndex];

  useEffect(() => {
    if (selectedIndex === null) return;
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedIndex(null);
      if (photos.length < 2) return;
      if (event.key === "ArrowLeft") setSelectedIndex((index) => index === null ? index : (index - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight") setSelectedIndex((index) => index === null ? index : (index + 1) % photos.length);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photos.length, selectedIndex]);

  function imageUrl(photo: ItemPhoto) {
    return `/dashboard/inventory/${itemId}/photos/${photo.id}`;
  }

  function previousPhoto() {
    setSelectedIndex((index) => index === null ? index : (index - 1 + photos.length) % photos.length);
  }

  function nextPhoto() {
    setSelectedIndex((index) => index === null ? index : (index + 1) % photos.length);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:w-44">
        {photos.slice(0, 4).map((photo, index) => (
          <button key={photo.id} type="button" onClick={() => setSelectedIndex(index)} className="group relative overflow-hidden rounded-lg text-left focus:outline-none" aria-label={`Open photo ${index + 1} of ${itemName}`}>
            <img src={imageUrl(photo)} alt={`Photo ${index + 1} of ${itemName}`} className="h-20 w-full object-cover transition duration-200 group-hover:scale-105" loading="lazy" />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1 text-center text-[0.65rem] font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">View photo</span>
          </button>
        ))}
      </div>

      {selectedPhoto ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => setSelectedIndex(null)}>
          <section className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-[var(--surface)] shadow-2xl" role="dialog" aria-modal="true" aria-label={`Photo of ${itemName}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3 sm:px-5">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{selectedPhoto.fileName}</p><p className="muted mt-0.5 text-xs">Photo {(selectedIndex ?? 0) + 1} of {photos.length}</p></div>
              <button ref={closeButtonRef} type="button" onClick={() => setSelectedIndex(null)} className="secondary-button grid h-9 w-9 shrink-0 place-items-center rounded-lg" aria-label="Close photo viewer"><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <div className="relative grid min-h-0 flex-1 place-items-center bg-black/5 p-3 sm:p-5">
              <img src={imageUrl(selectedPhoto)} alt={`Photo ${(selectedIndex ?? 0) + 1} of ${itemName}`} className="max-h-[calc(100dvh-9rem)] max-w-full rounded-lg object-contain" />
              {photos.length > 1 ? <><button type="button" onClick={previousPhoto} className="secondary-button absolute left-4 grid h-10 w-10 place-items-center rounded-full" aria-label="Previous photo"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button><button type="button" onClick={nextPhoto} className="secondary-button absolute right-4 grid h-10 w-10 place-items-center rounded-full" aria-label="Next photo"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button></> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
