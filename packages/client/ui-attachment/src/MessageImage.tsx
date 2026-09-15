import { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageLightbox } from './ImageLightbox.tsx'
import { dimensionsOf, singleFit } from './model/message-image.ts'
import type { ImageLoader, MessageImageLabels, MessageImageSpec } from './model/slots.ts'
import css from './MessageImage.module.css'

export type { ImageLoader, MessageImageLabels, MessageImageSpec } from './model/slots.ts'

/**
 * Compact history renderer with retryable loading and click-to-open original
 * preview. A lone image renders at its `singleFit` size; an image among
 * several renders as a fixed 64px square tile. The preview arm displays its
 * local URL directly — no loader round-trip, no failure/retry surface.
 *
 * @param props.image - the durable reference to load, or the local preview to display.
 * @param props.load - session-authorized URL loader for the durable arm.
 * @param props.variant - `single` for a message's lone image, `tile` otherwise.
 * @param props.labels - resolved strings (tooltip, loading, retry, lightbox).
 * @returns the bounded thumbnail button, or the retry control on failure.
 */
export function MessageImage({ image, load, variant, labels }: {
  image: MessageImageSpec
  load: ImageLoader
  variant: 'single' | 'tile'
  labels: MessageImageLabels
}) {
  const preview = 'preview' in image ? image.preview : undefined
  const attachment = 'attachment' in image ? image.attachment : undefined
  const [loaded, setLoaded] = useState<string | null>(() =>
    attachment === undefined ? null : (load.peek?.(attachment) ?? null))
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  // Retry re-arms the one load effect below, so every attempt — first load or
  // retry — runs under the same liveness guard and the same reset.
  const [attempt, setAttempt] = useState(0)
  const request = useCallback(() => { setAttempt(a => a + 1) }, [])
  const close = useCallback(() => { setOpen(false) }, [])
  const dimensions = useMemo(() => dimensionsOf(image), [image])
  const fit = useMemo(
    () => {
      if (variant !== 'single') return undefined
      // A preview whose intake probe has not resolved sizes as a square crop;
      // the durable replacement restores the exact fit.
      return dimensions === undefined
        ? { width: 240, height: 240, objectPosition: 'center' }
        : singleFit(dimensions)
    },
    [dimensions, variant],
  )

  useEffect(() => {
    if (attachment === undefined) return
    let live = true
    setError(false)
    setLoaded(load.peek?.(attachment) ?? null)
    void load(attachment).then((url) => { if (live) setLoaded(url) }).catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [attachment, load, attempt])

  const src = preview?.url ?? loaded
  const label = (preview?.name ?? attachment?.name) ?? labels.image
  if (error) return <button type="button" className={css.error} data-variant={variant} onClick={request}>{labels.loadFailed}</button>
  return (
    <>
      <button
        type="button"
        className={css.frame}
        data-variant={variant}
        style={fit === undefined ? undefined : { width: fit.width, height: fit.height }}
        title={labels.open}
        aria-label={labels.openNamed(label)}
        onClick={() => { if (src !== null) setOpen(true) }}
      >
        {src === null
          ? <span className={css.loading}>{labels.loading}</span>
          : <img src={src} alt={label} style={fit === undefined ? undefined : { objectPosition: fit.objectPosition }} />}
      </button>
      {open && src !== null && <ImageLightbox src={src} alt={label} labels={labels.lightbox} onClose={close} />}
    </>
  )
}

/** Wrapping image group shared by user and assistant history: a lone image
 * renders large unless its owning mixed-attachment row requests compact tiles. */
export function ImageGallery({ images, load, align, compact = false, labels }: {
  images: readonly MessageImageSpec[]
  load: ImageLoader
  align: 'start' | 'end'
  compact?: boolean
  labels: MessageImageLabels
}) {
  if (images.length === 0) return null
  const variant = compact || images.length > 1 ? 'tile' : 'single'
  return (
    <div className={css.gallery} data-align={align}>
      {images.map((image, index) => (
        <MessageImage
          key={`${'attachment' in image ? image.attachment.attachmentId : image.preview.url}:${index}`}
          image={image}
          load={load}
          variant={variant}
          labels={labels}
        />
      ))}
    </div>
  )
}
