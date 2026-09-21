 import { useState } from 'react';
import { buildImageUrl } from '../utils/csvParser';

export default function StudentPhoto({ regno, initials, size = 36, color = '#3B82F6', flagged = false }) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = buildImageUrl(regno);

  const containerStyle = {
    width: size, height: size, borderRadius: size * 0.28,
    border: `2px solid ${flagged ? '#EF4444' : color}50`,
    overflow: 'hidden', flexShrink: 0, position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  if (url && !imgFailed) {
    return (
      <div style={containerStyle}>
        <img src={url} alt={initials}
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        {flagged && (
          <div style={{ position: 'absolute', top: -4, right: -4,
            width: 11, height: 11, borderRadius: '50%',
            background: '#EF4444', border: '2px solid #0D1117' }}/>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...containerStyle, background: `${color}28`,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: size * 0.32, fontWeight: 700, color }}>
      {initials}
      {flagged && (
        <div style={{ position: 'absolute', top: -4, right: -4,
          width: 11, height: 11, borderRadius: '50%',
          background: '#EF4444', border: '2px solid #0D1117' }}/>
      )}
    </div>
  );
}
