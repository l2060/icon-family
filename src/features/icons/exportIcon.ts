import { cleanSvg } from '../../components/SvgPreview';

export function exportSvg(source: string) {
  const document = new DOMParser().parseFromString(cleanSvg(source), 'image/svg+xml');
  const svg = document.documentElement;
  if (svg.localName !== 'svg') throw new Error('Invalid SVG');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const box = (svg.getAttribute('viewBox') || '0 0 1024 1024').split(/[\s,]+/).map(Number);
  svg.setAttribute('width', String(box[2] || 1024));
  svg.setAttribute('height', String(box[3] || 1024));
  svg.setAttribute('color', '#000000');
  return new XMLSerializer().serializeToString(svg);
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPng(svg: string, size: number) {
  const image = new Image();
  // The application CSP allows data images; blob images are intentionally
  // not required for rendering the sanitized SVG onto a canvas.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  const scale = Math.min(size / image.width, size / image.height);
  const width = image.width * scale,
    height = image.height * scale;
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))),
      'image/png',
    ),
  );
}
