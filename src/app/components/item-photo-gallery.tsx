"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type ItemPhoto = { fileName: string; id: string };

type ItemPhotoGalleryProps = {
  itemId: string;
  itemName: string;
  photos: ItemPhoto[];
  photoId?: string;
  variant?: "gallery" | "thumbnail";
};

const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function ItemPhotoGallery({ itemId, itemName, photos, photoId, variant = "gallery" }: ItemPhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const titleId = useId();
  const selectedPhoto = selectedIndex === null ? null : photos[selectedIndex];

  function imageUrl(photo: ItemPhoto) {
    return `/dashboard/inventory/${itemId}/photos/${photo.id}`;
  }

  function closeViewer() {
    setSelectedIndex(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }

  function openViewer(index: number, opener: HTMLButtonElement) {
    openerRef.current = opener;
    setSelectedIndex(index);
  }

  function previousPhoto() {
    setSelectedIndex((index) => index === null ? index : (index - 1 + photos.length) % photos.length);
  }

  function nextPhoto() {
    setSelectedIndex((index) => index === null ? index : (index + 1) % photos.length);
  }

  useEffect(() => {
    if (selectedIndex === null) return;

    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedIndex(null);
        window.requestAnimationFrame(() => openerRef.current?.focus());
        return;
      }

      if (event.key === "ArrowLeft" && photos.length > 1) {
        event.preventDefault();
        setSelectedIndex((index) => index === null ? index : (index - 1 + photos.length) % photos.length);
        return;
      }

      if (event.key === "ArrowRight" && photos.length > 1) {
        event.preventDefault();
        setSelectedIndex((index) => index === null ? index : (index + 1) % photos.length);
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = document.getElementById(dialogId);
      const focusable = dialog ? [...dialog.querySelectorAll<HTMLElement>(focusableSelector)] : [];
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [dialogId, photos.length, selectedIndex]);

  if (!photos.length) return null;

  const photoIndex = photoId ? photos.findIndex((photo) => photo.id === photoId) : -1;
  const selectedThumbnailIndex = photoIndex >= 0 ? photoIndex : 0;

  return (
    <>
      {variant === "thumbnail" ? (
        <button
          type="button"
          onClick={(event) => openViewer(selectedThumbnailIndex, event.currentTarget)}
          className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label={`Open ${photos[selectedThumbnailIndex].fileName}`}
        >
          <img src={imageUrl(photos[selectedThumbnailIndex])} alt={`Photo of ${itemName}`} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" loading="lazy" />
          <span className="absolute inset-0 grid place-items-center bg-black/55 text-[0.6rem] font-bold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">View</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:w-44">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={(event) => openViewer(index, event.currentTarget)}
              className="group relative overflow-hidden rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              aria-label={`Open photo ${index + 1} of ${itemName}`}
            >
              <img src={imageUrl(photo)} alt={`Photo ${index + 1} of ${itemName}`} className="h-20 w-full object-cover transition duration-200 group-hover:scale-105" loading="lazy" />
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1 text-center text-[0.65rem] font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">View photo</span>
            </button>
          ))}
        </div>
      )}

      {selectedPhoto ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) closeViewer(); }}>
          <style>{"body { overflow: hidden; }"}</style>
          <section id={dialogId} className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-[var(--surface)] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3 sm:px-5">
              <div className="min-w-0"><p id={titleId} className="truncate text-sm font-semibold">{selectedPhoto.fileName}</p><p className="muted mt-0.5 text-xs">Photo {(selectedIndex ?? 0) + 1} of {photos.length}</p></div>
              <button ref={closeButtonRef} type="button" onClick={closeViewer} className="secondary-button grid h-9 w-9 shrink-0 place-items-center rounded-lg" aria-label="Close photo viewer"><X className="h-4 w-4" aria-hidden="true" /></button>
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
