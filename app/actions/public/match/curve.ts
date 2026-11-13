// A smooth SVG area between a series of points and a baseline. The curve is monotone between
// points (Fritsch–Carlson, like d3's curveMonotoneX), so it never overshoots a peak or crosses
// the baseline where the data doesn't.

type Point = { x: number; y: number };

const round = (n: number) => Math.round(n * 100) / 100;

function tangents(points: Point[]) {
  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    slopes.push((points[i + 1]!.y - points[i]!.y) / (points[i + 1]!.x - points[i]!.x));
  }
  const out = new Array<number>(n);
  out[0] = slopes[0] ?? 0;
  out[n - 1] = slopes[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const s0 = slopes[i - 1]!;
    const s1 = slopes[i]!;
    if (s0 * s1 <= 0) {
      out[i] = 0;
      continue;
    }
    const h0 = points[i]!.x - points[i - 1]!.x;
    const h1 = points[i + 1]!.x - points[i]!.x;
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    out[i] = Math.sign(s0) * Math.min(Math.abs(s0), Math.abs(s1), Math.abs(p) / 2) * 2;
  }
  return out;
}

/** The `d` of a closed path running along the baseline under the curve through `points`. */
export function areaPath(points: Point[], baseline: number): string {
  if (points.length < 2) return '';
  const m = tangents(points);
  const first = points[0]!;
  const last = points.at(-1)!;
  let d = `M${round(first.x)} ${baseline}L${round(first.x)} ${round(first.y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const h = (b.x - a.x) / 3;
    d += `C${round(a.x + h)} ${round(a.y + m[i]! * h)} ${round(b.x - h)} ${round(b.y - m[i + 1]! * h)} ${round(b.x)} ${round(b.y)}`;
  }
  return `${d}L${round(last.x)} ${baseline}Z`;
}
