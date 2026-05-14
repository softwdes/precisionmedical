import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '40px',
        }}
      >
        <span
          style={{
            color: 'white',
            fontSize: '72px',
            fontWeight: 800,
            letterSpacing: '0.08em',
          }}
        >
          LM
        </span>
      </div>
    ),
    { ...size },
  );
}
