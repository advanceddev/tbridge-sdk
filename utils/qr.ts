/**
 * QR rendering for connect links.
 * Encoding via `qr` (paulmillr) — audited 0-dep ISO implementation.
 * We only draw the matrix to canvas / data URL.
 */

import encodeQR from 'qr';

export type QrMatrix = boolean[][];

/**
 * Encode text to QR matrix (boolean[][]).
 * Returns null on failure.
 * Uses 'high' ECC to allow logo overlay (up to 30% error correction).
 */
export function encodeQrMatrix(text: string): QrMatrix | null {
  try {
    if (!text || typeof text !== 'string') return null;
    // high ECC — allows up to 30% error correction for logo overlay
    const matrix = encodeQR(text, 'raw', { ecc: 'high' });
    if (!matrix?.length) return null;
    return matrix;
  } catch {
    return null;
  }
}

/**
 * Draw QR matrix onto a canvas. Returns PNG data URL or null.
 * If logoUrl is provided, it will be drawn as a circle at the center.
 */
export async function renderQrToDataUrl(
  text: string,
  opts?: {
    moduleSize?: number;
    margin?: number;
    dark?: string;
    light?: string;
    logoUrl?: string;
    logoSize?: number;
  },
): Promise<string | null> {
  try {
    const matrix = encodeQrMatrix(text);
    if (!matrix || typeof document === 'undefined') return null;

    const moduleSize = opts?.moduleSize ?? 4;
    const margin = opts?.margin ?? 2;
    const dark = opts?.dark ?? '#000000';
    const light = opts?.light ?? '#ffffff';
    const n = matrix.length;
    const px = (n + margin * 2) * moduleSize;

    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);

    ctx.fillStyle = dark;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (matrix[y]![x]) {
          ctx.fillRect(
            (x + margin) * moduleSize,
            (y + margin) * moduleSize,
            moduleSize,
            moduleSize,
          );
        }
      }
    }

    if (opts?.logoUrl) {
      const logoSize = opts.logoSize ?? Math.floor(px * 0.22);
      const logo = new Image();
      logo.crossOrigin = 'anonymous';

      return new Promise<string>((resolve) => {
        logo.addEventListener(
          'load',
          () => {
            try {
              const centerX = px / 2;
              const centerY = px / 2;
              const outerRadius = logoSize / 2 + 6;
              const innerRadius = logoSize / 2;

              ctx.save();

              ctx.beginPath();
              ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
              ctx.fillStyle = light;
              ctx.fill();

              ctx.beginPath();
              ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
              ctx.clip();
              ctx.drawImage(
                logo,
                centerX - innerRadius,
                centerY - innerRadius,
                innerRadius * 2,
                innerRadius * 2,
              );

              ctx.restore();
              resolve(canvas.toDataURL('image/png'));
            } catch {
              // SecurityError when logo host lacks CORS — fall back to QR without logo
              try {
                resolve(canvas.toDataURL('image/png'));
              } catch {
                resolve('');
              }
            }
          },
          { once: true },
        );

        logo.addEventListener(
          'error',
          () => {
            try {
              resolve(canvas.toDataURL('image/png'));
            } catch {
              resolve('');
            }
          },
          { once: true },
        );

        logo.src = opts.logoUrl!;
      });
    }

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
