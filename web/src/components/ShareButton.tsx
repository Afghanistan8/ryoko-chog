import { shareLinks, type ShareInput } from '../share';

/** "Post on X" with the post already written; the link previews as the Chog's share card. */
export function ShareButton({ input, variant = 'ghost', withImage = false }: { input: ShareInput; variant?: 'primary' | 'ghost'; withImage?: boolean }) {
  const { intent, image } = shareLinks(input);
  return (
    <span className="share">
      <a className={`btn ${variant === 'ghost' ? 'ghost' : ''} share-x`} href={intent} target="_blank" rel="noopener noreferrer">
        Post on X
      </a>
      {withImage && (
        <a className="small" href={image} target="_blank" rel="noopener noreferrer">
          Open the image
        </a>
      )}
    </span>
  );
}
