// Share Modal - Share puzzle link and video
import { ModalBase } from '../../../components/ModalBase';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzleUrl: string;
  puzzleName?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  puzzleUrl,
  puzzleName = 'My Puzzle'
}) => {
  const handleCopyLink = () => {
    navigator.clipboard.writeText(puzzleUrl);
    alert('Link copied to clipboard!');
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(`Check out my puzzle: ${puzzleName}`);
    const url = encodeURIComponent(puzzleUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

  const handleShareFacebook = () => {
    const url = encodeURIComponent(puzzleUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  };

  const handleShareReddit = () => {
    const title = encodeURIComponent(puzzleName);
    const url = encodeURIComponent(puzzleUrl);
    window.open(`https://reddit.com/submit?title=${title}&url=${url}`, '_blank');
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={500}
      surface="#fff"
      bodyColor="#000"
      footer={
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: '#6c757d',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          Done
        </button>
      }
    >
      <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: 600 }}>
        📤 Share Your Puzzle
      </h2>

      {/* Puzzle Link */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.5rem' }}>
          Puzzle Link
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={puzzleUrl}
            readOnly
            style={{
              flex: 1,
              padding: '0.75rem',
              border: '2px solid #e0e0e0',
              borderRadius: '6px',
              fontSize: '0.875rem',
              backgroundColor: '#f5f5f5'
            }}
          />
          <button
            onClick={handleCopyLink}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#007bff',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 500,
              whiteSpace: 'nowrap'
            }}
          >
            📋 Copy
          </button>
        </div>
      </div>

      {/* Social Media Buttons */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.75rem' }}>
          Share to Social Media
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            onClick={handleShareTwitter}
            style={{
              padding: '0.75rem',
              border: '1px solid #1DA1F2',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: '#1DA1F2',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            🐦 Twitter
          </button>
          <button
            onClick={handleShareFacebook}
            style={{
              padding: '0.75rem',
              border: '1px solid #4267B2',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: '#4267B2',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            📘 Facebook
          </button>
          <button
            onClick={handleShareReddit}
            style={{
              padding: '0.75rem',
              border: '1px solid #FF4500',
              borderRadius: '6px',
              backgroundColor: '#fff',
              color: '#FF4500',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            🔴 Reddit
          </button>
        </div>
      </div>
    </ModalBase>
  );
};
