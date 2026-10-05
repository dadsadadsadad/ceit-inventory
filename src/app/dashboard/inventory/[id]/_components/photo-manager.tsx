import { FeedbackForm } from "@/app/components/feedback-form";
import { ItemPhotoGallery } from "@/app/components/item-photo-gallery";
import { HoldSubmitButton } from "@/app/components/hold-submit-button";
import { SubmitButton } from "@/app/components/submit-button";

import { deleteInventoryItemPhoto, uploadInventoryItemPhoto } from "../../actions/photos";
import { displayDate } from "./item-fields";
import type { ItemRecord } from "./item-record";

// Upload up to four photos and remove them again.
export function PhotoManager({ item }: { item: ItemRecord }) {
  return (
    <>
      {/* Upload and manage item photos. */}
      <section className="divider mt-6 border-t pt-5" aria-labelledby="item-photos-heading">
        <h3 id="item-photos-heading" className="text-sm font-semibold">
          Item photos
        </h3>
        <p className="muted mt-2 text-xs leading-5">
          Add up to four JPEG, PNG, or WebP images, up to 3 MB each.
        </p>
        <FeedbackForm
          action={uploadInventoryItemPhoto}
          successMessage="Photo added."
          className="mt-4 space-y-3"
        >
          <input type="hidden" name="itemId" value={item.id} />
          <label className="block">
            <span className="sr-only">Choose item photo</span>
            <input
              required
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="field w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <SubmitButton
            pendingLabel="Uploading…"
            className="secondary-button rounded-lg px-3 py-2 text-sm font-semibold"
          >
            Add photo
          </SubmitButton>
        </FeedbackForm>
        {item.photos.length ? (
          <div className="mt-4 space-y-2">
            {item.photos.map((photo) => (
              <div
                key={photo.id}
                className="card-muted photo-editor-row flex items-center gap-3 rounded-lg p-2"
              >
                <ItemPhotoGallery
                  itemId={item.id}
                  itemName={item.name}
                  photos={item.photos.map((entry) => ({
                    id: entry.id,
                    fileName: entry.fileName,
                  }))}
                  photoId={photo.id}
                  variant="thumbnail"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{photo.fileName}</p>
                  <p className="muted mt-0.5 text-xs">
                    {Math.ceil(photo.byteSize / 1024)} KB · {displayDate(photo.createdAt)}
                  </p>
                </div>
                <FeedbackForm action={deleteInventoryItemPhoto}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="photoId" value={photo.id} />
                  <HoldSubmitButton
                    label="Remove photo"
                    pendingLabel="Removing…"
                    confirmation={`Remove ${photo.fileName}? This cannot be undone.`}
                  />
                </FeedbackForm>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
