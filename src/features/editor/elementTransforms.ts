export type TransformAction = 'tx' | 'ty' | 'rotation' | 'scale' | 'flipX' | 'flipY';
export function centeringDelta(
  element: SVGGraphicsElement,
  root: SVGSVGElement,
  axis: 'horizontal' | 'vertical',
) {
  const bounds = element.getBoundingClientRect();
  const canvas = root.getBoundingClientRect();
  const dx =
    axis === 'horizontal' ? canvas.left + canvas.width / 2 - bounds.left - bounds.width / 2 : 0;
  const dy =
    axis === 'vertical' ? canvas.top + canvas.height / 2 - bounds.top - bounds.height / 2 : 0;
  const parent = element.parentElement as unknown as SVGGraphicsElement;
  const matrix = parent.getScreenCTM();
  if (!matrix) throw new Error('Element has no coordinate system');
  const inverse = matrix.inverse();
  const start = new DOMPoint(0, 0).matrixTransform(inverse);
  const end = new DOMPoint(dx, dy).matrixTransform(inverse);
  return { x: end.x - start.x, y: end.y - start.y };
}

export function elementMatrix(element: SVGGraphicsElement) {
  const matrix = element.transform.baseVal.consolidate()?.matrix;
  return matrix
    ? new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f])
    : new DOMMatrix();
}
export function matrixText(matrix: DOMMatrix) {
  return `matrix(${[matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].map((n) => Number(n.toFixed(6))).join(' ')})`;
}
export function transformElement(
  element: SVGGraphicsElement,
  action: TransformAction,
  amount: number,
) {
  const matrix = elementMatrix(element);
  const box = element.getBBox();
  const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(
    matrix,
  );
  let delta = new DOMMatrix();
  if (action === 'tx' || action === 'ty')
    delta = delta.translate(action === 'tx' ? amount : 0, action === 'ty' ? amount : 0);
  else {
    delta = delta.translate(center.x, center.y);
    delta =
      action === 'rotation'
        ? delta.rotate(amount)
        : delta.scale(
            action === 'flipX' ? -1 : action === 'scale' ? amount : 1,
            action === 'flipY' ? -1 : action === 'scale' ? amount : 1,
          );
    delta = delta.translate(-center.x, -center.y);
  }
  return matrixText(delta.multiply(matrix));
}
