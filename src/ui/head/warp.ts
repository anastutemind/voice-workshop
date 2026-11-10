/**
 * The painted plate as one sheet of tissue that the model stretches.
 *
 * A fine grid is laid over the plate where it moves (the mouth, the jaw, the
 * floor of the mouth and the front of the neck). Each knot of the grid is
 * either held (the skull, the palate and the upper teeth do not move; the
 * mandible and the lower teeth turn with the jaw: rigid bone) or free: soft
 * tissue, which takes the smoothest shape between what holds it (it solves
 * Laplace's equation, as a membrane stretched between its attachments does).
 * A few points of the soft tissue are led as well: the surface of the tongue
 * onto the model's tongue, the profile and the edges of each lip onto the
 * model's lips. So the floor of the mouth stretches between the chin and the
 * hyoid as the jaw opens, the tongue's muscles fan out as the tongue rises,
 * and a lip carries the skin round it along: one continuous deformation, with
 * no band, no patch and no edge where one part of the painting meets another.
 *
 * Tissue does part in a few places, where it only touches: the lips meet
 * along a line, and lie on the teeth. There the sheet is cut: each cell of the
 * grid that a cut crosses is drawn twice, once for each side, each with its
 * own copies of the cell's knots (the "virtual node" method), and each copy
 * only on its side of the cut. Everywhere else neighbouring cells share their
 * knots, so nothing can open between them.
 *
 * The solution is linear in what leads it, so the system is factored once
 * (a banded Cholesky factor) and each posture costs two back-substitutions.
 * Everything here is in canonical centimetres of the plate, before the
 * speaker's size and the stretch of the pharynx (the caller applies those).
 */

export interface WarpSpec {
  /** the grid: its lower left knot, its spacing, and how many knots across and up */
  x0: number; y0: number; h: number; nx: number; ny: number;
  /** where tissue may move (canonical polygons, even-odd): knots outside every one of them and outside `jaw` hold still */
  free: number[][];
  /** the bone that turns with the jaw: knots inside are rigid with it */
  jaw: number[][];
  /** where the painting has air at rest: its cells are drawn first, so that tissue covers any of them folded under it */
  air?: number[][];
  /** where tissue parts: open polylines */
  cuts: number[][];
  /** points of the tissue led by the model (canonical, at rest), and how firmly each */
  anchors: number[];
  weights: number[];
  /** the point the jaw turns about */
  pivot: [number, number];
}

/** One part of a cell: a whole cell, or one side of a cell that a cut crosses. */
export interface Piece {
  /** the cell's four corners (copies of knots), counterclockwise from the lower left */
  k: [number, number, number, number];
  /** for a part of a cut cell: up to two lines a x + b y + c (canonical, a² + b² = 1); the piece is where all are >= 0 */
  lines: number[];
  /** what the cell is at its middle: 0 soft tissue, 1 jaw, 2 still, 3 air (painted) */
  kind: number;
  /** the part of a cut cell that takes what the others leave: drawn first, reaching a pixel past its edge */
  takesRest?: boolean;
}

export interface Warp {
  spec: WarpSpec;
  /** knot copies: their places at rest (canonical cm) */
  rest: Float64Array;
  /** 0 free, 1 still, 2 jaw */
  kind: Uint8Array;
  /** whole cells (in the order they are drawn: air, soft tissue, jaw, still), and the parts of cut cells, drawn
   *  after the first `soft` whole cells (air and soft tissue) and before the rest (bone and teeth over them) */
  whole: Piece[];
  parts: Piece[];
  soft: number;
  /** displacements (canonical cm) of every copy for a jaw turn and the anchors' targets (canonical); `out` has 2 per copy */
  solve(jawTurn: number, targets: ArrayLike<number>, out?: Float64Array): Float64Array;
  /** the piece and the bilinear weights of a canonical point (null outside the grid) */
  locate(x: number, y: number): { piece: Piece; w: [number, number, number, number] } | null;
  /** how big the system is: the free knot copies, and how far from the diagonal it reaches */
  size: { unknowns: number; band: number };
}

/** Even-odd point in polygon. */
export function inPoly(x: number, y: number, p: number[]): boolean {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) c = !c;
  }
  return c;
}

/** Where segment a-b crosses segment c-d: the parameter along a-b, or -1. */
function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return -1;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

/** Union-find over integers. */
class Sets {
  p: Int32Array;
  constructor(n: number) { this.p = new Int32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
  find(a: number): number { while (this.p[a] !== a) { this.p[a] = this.p[this.p[a]]; a = this.p[a]; } return a; }
  join(a: number, b: number): void { a = this.find(a); b = this.find(b); if (a !== b) this.p[Math.max(a, b)] = Math.min(a, b); }
}

/**
 * A symmetric positive definite matrix in a band (lower half, at most `bw` below the diagonal), each row from its
 * first entry that is not zero (its "skyline": the factor has nothing to the left of it either), factored in
 * place as L Lᵀ.
 */
class Band {
  a: Float64Array;
  first: Int32Array;
  constructor(public n: number, public bw: number) { this.a = new Float64Array(n * (bw + 1)); this.first = new Int32Array(n).map((_, i) => i); }
  /** entry (i, j), i >= j, i - j <= bw */
  add(i: number, j: number, v: number): void {
    if (i < j) { const t = i; i = j; j = t; }
    this.a[i * (this.bw + 1) + (i - j)] += v;
    if (j < this.first[i]) this.first[i] = j;
  }
  factor(): void {
    const { n, bw, a, first } = this;
    const W = bw + 1;
    for (let i = 0; i < n; i++) {
      const fi = first[i], ri = i * W + i;
      for (let j = fi; j <= i; j++) {
        // sum over k < j of L[i][k] L[j][k]
        const rj = j * W + j;
        let s = a[ri - j];
        for (let k = Math.max(fi, first[j]); k < j; k++) s -= a[ri - k] * a[rj - k];
        if (j === i) a[i * W] = Math.sqrt(Math.max(s, 1e-12));
        else a[ri - j] = s / a[j * W];
      }
    }
  }
  /** solves (L Lᵀ) x = b for two right-hand sides at once, in place (both sweeps run along the rows of L) */
  solve2(b: Float64Array, c: Float64Array): void {
    const { n, bw, a, first } = this;
    const W = bw + 1;
    for (let i = 0; i < n; i++) {
      let s = b[i], t = c[i];
      const ri = i * W + i;
      for (let k = first[i]; k < i; k++) { const l = a[ri - k]; s -= l * b[k]; t -= l * c[k]; }
      const d = a[i * W];
      b[i] = s / d; c[i] = t / d;
    }
    for (let i = n - 1; i >= 0; i--) {
      const d = a[i * W];
      const x = b[i] / d, y = c[i] / d;
      b[i] = x; c[i] = y;
      const ri = i * W + i;
      for (let k = first[i]; k < i; k++) { const l = a[ri - k]; b[k] -= l * x; c[k] -= l * y; }
    }
  }
}

export function buildWarp(spec: WarpSpec): Warp {
  const { x0, y0, h, nx, ny } = spec;
  const cx = nx - 1, cy = ny - 1;
  const X = (i: number) => x0 + i * h, Y = (j: number) => y0 + j * h;

  // ---- which edges of the grid a cut crosses, and where
  const segs: number[] = [];
  for (const c of spec.cuts) for (let i = 0; i + 3 < c.length; i += 2) segs.push(c[i], c[i + 1], c[i + 2], c[i + 3]);
  /** crossing parameter along each horizontal edge (i,j)-(i+1,j) and vertical edge (i,j)-(i,j+1), -1 if none */
  const hx = new Float64Array(cx * ny).fill(-1), vx = new Float64Array(nx * cy).fill(-1);
  for (let s = 0; s < segs.length; s += 4) {
    const [ax, ay, bx, by] = [segs[s], segs[s + 1], segs[s + 2], segs[s + 3]];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - x0) / h) - 1), i1 = Math.min(cx, Math.ceil((Math.max(ax, bx) - x0) / h) + 1);
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - y0) / h) - 1), j1 = Math.min(cy, Math.ceil((Math.max(ay, by) - y0) / h) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (i < cx) { const t = cross(X(i), Y(j), X(i + 1), Y(j), ax, ay, bx, by); if (t >= 0) hx[j * cx + i] = t; }
      if (j < cy) { const t = cross(X(i), Y(j), X(i), Y(j + 1), ax, ay, bx, by); if (t >= 0) vx[j * nx + i] = t; }
    }
  }
  /** whether a straight path between two points crosses a cut */
  const blocked = (px: number, py: number, qx: number, qy: number) => {
    for (let s = 0; s < segs.length; s += 4) if (cross(px, py, qx, qy, segs[s], segs[s + 1], segs[s + 2], segs[s + 3]) >= 0) return true;
    return false;
  };

  // ---- the parts of each cell: its corners joined along the edges no cut crosses
  // corners 0 (i,j), 1 (i+1,j), 2 (i+1,j+1), 3 (i,j+1); edges 0: 0-1, 1: 1-2, 2: 3-2, 3: 0-3
  const EDGE: [number, number][] = [[0, 1], [1, 2], [3, 2], [0, 3]];
  const edgeT = (i: number, j: number, e: number) => (e === 0 ? hx[j * cx + i] : e === 1 ? vx[j * nx + i + 1] : e === 2 ? hx[(j + 1) * cx + i] : vx[j * nx + i]);
  const nCells = cx * cy;
  const comp = new Int8Array(4 * nCells);
  const nComp = new Int8Array(nCells);
  const base = new Int32Array(nCells + 1);
  for (let c = 0; c < nCells; c++) {
    const i = c % cx, j = (c - i) / cx;
    const lab = [0, 1, 2, 3];
    const root = (a: number): number => (lab[a] === a ? a : (lab[a] = root(lab[a])));
    for (let e = 0; e < 4; e++) if (edgeT(i, j, e) < 0) { const [a, b] = EDGE[e]; const ra = root(a), rb = root(b); if (ra !== rb) lab[Math.max(ra, rb)] = Math.min(ra, rb); }
    const ids: number[] = [];
    for (let k = 0; k < 4; k++) { const r = root(k); let q = ids.indexOf(r); if (q < 0) { q = ids.length; ids.push(r); } comp[4 * c + k] = q; }
    nComp[c] = ids.length;
    base[c + 1] = base[c] + 4 * ids.length;
  }
  // ---- copies of the knots: one for each (cell, part, corner), joined where parts of neighbouring cells meet
  const sets = new Sets(base[nCells]);
  const inc = (c: number, p: number, k: number) => base[c] + 4 * p + k;
  const joinEdge = (A: number, a1: number, a2: number, B: number, b1: number, b2: number, cut: boolean) => {
    const pA1 = comp[4 * A + a1], pA2 = comp[4 * A + a2], pB1 = comp[4 * B + b1], pB2 = comp[4 * B + b2];
    const link = (pA: number, pB: number) => { sets.join(inc(A, pA, a1), inc(B, pB, b1)); sets.join(inc(A, pA, a2), inc(B, pB, b2)); };
    if (!cut) { link(pA1, pB1); return; }
    link(pA1, pB1);
    link(pA2, pB2);
  };
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const c = j * cx + i;
    if (i + 1 < cx) joinEdge(c, 1, 2, c + 1, 0, 3, vx[j * nx + i + 1] >= 0);
    if (j + 1 < cy) joinEdge(c, 3, 2, c + cx, 0, 1, hx[(j + 1) * cx + i] >= 0);
  }
  const KI = [0, 1, 1, 0], KJ = [0, 0, 1, 1];
  const ids = new Int32Array(base[nCells]).fill(-1);
  const restL: number[] = [], kindL: number[] = [];
  const inAny = (x: number, y: number, ps: number[][]) => ps.some((p) => inPoly(x, y, p));
  const cls = (x: number, y: number) => (inAny(x, y, spec.jaw) ? 2 : inAny(x, y, spec.free) ? 0 : 1);
  const edge = (i: number, j: number) => i === 0 || j === 0 || i === cx || j === cy;
  for (let c = 0; c < nCells; c++) {
    const i = c % cx, j = (c - i) / cx;
    for (let p = 0; p < nComp[c]; p++) for (let k = 0; k < 4; k++) {
      const r = sets.find(inc(c, p, k));
      if (ids[r] < 0) {
        ids[r] = restL.length / 2;
        const gi = i + KI[k], gj = j + KJ[k];
        restL.push(X(gi), Y(gj));
        kindL.push(-1);
      }
      const id = ids[r];
      // a copy that is the knot's own (not one made for the far side of a cut) takes what the knot is
      if (comp[4 * c + k] === p) {
        const gi = i + KI[k], gj = j + KJ[k];
        kindL[id] = edge(gi, gj) ? 1 : cls(X(gi), Y(gj));
      }
    }
  }
  const nNodes = restL.length / 2;
  const rest = new Float64Array(restL);
  const kind = new Uint8Array(nNodes);
  for (let n = 0; n < nNodes; n++) kind[n] = kindL[n] < 0 ? 0 : kindL[n];

  // ---- the pieces, with the lines that bound the parts of cut cells
  const whole: Piece[] = [], parts: Piece[] = [];
  const cellPieces: Piece[][] = new Array(nCells);
  for (let c = 0; c < nCells; c++) {
    const i = c % cx, j = (c - i) / cx;
    const m = nComp[c];
    const corners = (p: number): [number, number, number, number] => [0, 1, 2, 3].map((k) => ids[sets.find(inc(c, p, k))]) as [number, number, number, number];
    const mx = X(i) + h / 2, my = Y(j) + h / 2;
    const ck = cls(mx, my);
    const cellKind = ck === 2 ? 1 : ck === 1 ? 2 : spec.air && inAny(mx, my, spec.air) ? 3 : 0;
    if (m === 1) { const pc: Piece = { k: corners(0), lines: [], kind: cellKind }; whole.push(pc); cellPieces[c] = [pc]; continue; }
    // the crossing of each edge whose two ends lie in different parts
    const at: ([number, number] | null)[] = EDGE.map(([a, b], e) => {
      if (comp[4 * c + a] === comp[4 * c + b]) return null;
      const t = edgeT(i, j, e);
      return [X(i + KI[a]) + (X(i + KI[b]) - X(i + KI[a])) * t, Y(j + KJ[a]) + (Y(j + KJ[b]) - Y(j + KJ[a])) * t];
    });
    // each part's own line: through the two crossings on the edges that leave it, its corners on the positive side
    const own: number[][] = [];
    for (let p = 0; p < m; p++) {
      const q: [number, number][] = [];
      EDGE.forEach(([a, b], e) => { const pa = comp[4 * c + a] === p, pb = comp[4 * c + b] === p; if (pa !== pb && at[e]) q.push(at[e]!); });
      if (q.length < 2) { own.push([]); continue; }
      let la = -(q[1][1] - q[0][1]), lb = q[1][0] - q[0][0];
      const L = Math.hypot(la, lb) || 1;
      la /= L; lb /= L;
      let lc = -(la * q[0][0] + lb * q[0][1]);
      // which side its corners are on
      let s = 0;
      for (let k = 0; k < 4; k++) if (comp[4 * c + k] === p) s += la * X(i + KI[k]) + lb * Y(j + KJ[k]) + lc;
      if (s < 0) { la = -la; lb = -lb; lc = -lc; }
      own.push([la, lb, lc]);
    }
    // the part with most corners takes what the others leave (so the parts tile the cell, and meet without a gap);
    // the others keep to their own lines
    let big = 0;
    for (let p = 1; p < m; p++) if (comp.slice(4 * c, 4 * c + 4).filter((v) => v === p).length > comp.slice(4 * c, 4 * c + 4).filter((v) => v === big).length) big = p;
    const list: Piece[] = [];
    for (let p = 0; p < m; p++) {
      let lines: number[] = [];
      if (p === big) {
        for (let q = 0; q < m && lines.length < 6; q++) if (q !== p && own[q].length) lines.push(-own[q][0], -own[q][1], -own[q][2]);
      } else lines = own[p];
      const pc: Piece = { k: corners(p), lines, kind: cellKind, takesRest: p === big };
      list.push(pc);
    }
    // (the big part first: the others are drawn over its edge)
    list.sort((a, b) => (a === list[big] ? -1 : b === list[big] ? 1 : 0));
    parts.push(...list);
    cellPieces[c] = list;
  }

  const RANK = [1, 2, 3, 0];
  whole.sort((a, b) => RANK[a.kind] - RANK[b.kind]);

  // ---- locating a point: its cell, and the part of it on its side of any cut
  const locate = (x: number, y: number): { piece: Piece; w: [number, number, number, number] } | null => {
    const fi = (x - x0) / h, fj = (y - y0) / h;
    if (fi < 0 || fj < 0 || fi > cx || fj > cy) return null;
    const i = Math.min(cx - 1, Math.floor(fi)), j = Math.min(cy - 1, Math.floor(fj));
    const u = fi - i, v = fj - j;
    const c = j * cx + i;
    const list = cellPieces[c];
    let piece = list[0];
    if (list.length > 1) {
      for (let k = 0; k < 4; k++) {
        if (!blocked(x, y, X(i + KI[k]), Y(j + KJ[k]))) {
          const want = ids[sets.find(inc(c, comp[4 * c + k], k))];
          piece = list.find((pc) => pc.k[k] === want) ?? piece;
          break;
        }
      }
    }
    return { piece, w: [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v] };
  };

  // ---- the system: the membrane over the free copies, and the anchors
  const unk = new Int32Array(nNodes).fill(-1);
  const order: number[] = [];
  for (let n = 0; n < nNodes; n++) if (kind[n] === 0) order.push(n);
  order.sort((a, b) => (rest[2 * a + 1] - rest[2 * b + 1]) || (rest[2 * a] - rest[2 * b]) || a - b);
  order.forEach((n, q) => { unk[n] = q; });
  const nU = order.length;
  // couplings: free-free (matrix), free-jaw (right-hand side; still knots have no displacement)
  const pairs = new Map<number, number>();
  const toJaw: number[] = [];
  const couple = (a: number, b: number, w: number) => {
    const ua = unk[a], ub = unk[b];
    if (ua >= 0) pairs.set(ua * nU + ua, (pairs.get(ua * nU + ua) ?? 0) + w);
    if (ub >= 0) pairs.set(ub * nU + ub, (pairs.get(ub * nU + ub) ?? 0) + w);
    if (ua >= 0 && ub >= 0) { const key = Math.max(ua, ub) * nU + Math.min(ua, ub); pairs.set(key, (pairs.get(key) ?? 0) - w); }
    else if (ua >= 0 && kind[b] === 2) toJaw.push(ua, b, w);
    else if (ub >= 0 && kind[a] === 2) toJaw.push(ub, a, w);
  };
  for (const pc of [...whole, ...parts]) for (const [a, b] of EDGE) couple(pc.k[a], pc.k[b], 0.5);
  // anchors: w (sum b_k x_k - t)^2
  interface Anchor { u: number[]; ub: number[]; jaw: number[]; jb: number[]; w: number }
  const anchors: Anchor[] = [];
  for (let q = 0; q < spec.anchors.length; q += 2) {
    const loc = locate(spec.anchors[q], spec.anchors[q + 1]);
    const w = spec.weights[q / 2];
    const an: Anchor = { u: [], ub: [], jaw: [], jb: [], w };
    anchors.push(an);
    if (!loc) continue;
    for (let k = 0; k < 4; k++) {
      const n = loc.piece.k[k], b = loc.w[k];
      if (b < 1e-9) continue;
      if (unk[n] >= 0) { an.u.push(unk[n]); an.ub.push(b); } else if (kind[n] === 2) { an.jaw.push(n); an.jb.push(b); }
    }
    for (let p = 0; p < an.u.length; p++) for (let r = 0; r <= p; r++) {
      const a = an.u[p], b = an.u[r];
      const key = Math.max(a, b) * nU + Math.min(a, b);
      pairs.set(key, (pairs.get(key) ?? 0) + w * an.ub[p] * an.ub[r]);
    }
  }
  let bw = 0;
  for (const key of pairs.keys()) { const i = Math.floor(key / nU), j = key - i * nU; bw = Math.max(bw, i - j); }
  const A = new Band(nU, bw);
  for (const [key, v] of pairs) { const i = Math.floor(key / nU), j = key - i * nU; A.add(i, j, v); }
  for (let i = 0; i < nU; i++) A.add(i, i, 1e-9);
  A.factor();

  const jawNodes: number[] = [];
  for (let n = 0; n < nNodes; n++) if (kind[n] === 2) jawNodes.push(n);
  const bx = new Float64Array(nU), by = new Float64Array(nU);
  const [JX, JY] = spec.pivot;

  const solve = (jawTurn: number, targets: ArrayLike<number>, out = new Float64Array(2 * nNodes)): Float64Array => {
    out.fill(0);
    const ca = Math.cos(jawTurn) - 1, sa = Math.sin(jawTurn);
    for (const n of jawNodes) {
      const dx = rest[2 * n] - JX, dy = rest[2 * n + 1] - JY;
      out[2 * n] = ca * dx - sa * dy;
      out[2 * n + 1] = sa * dx + ca * dy;
    }
    bx.fill(0); by.fill(0);
    for (let q = 0; q < toJaw.length; q += 3) { const u = toJaw[q], n = toJaw[q + 1], w = toJaw[q + 2]; bx[u] += w * out[2 * n]; by[u] += w * out[2 * n + 1]; }
    for (let q = 0; q < anchors.length; q++) {
      const an = anchors[q];
      if (!an.u.length) continue;
      let tx = targets[2 * q] - spec.anchors[2 * q], ty = targets[2 * q + 1] - spec.anchors[2 * q + 1];
      for (let p = 0; p < an.jaw.length; p++) { tx -= an.jb[p] * out[2 * an.jaw[p]]; ty -= an.jb[p] * out[2 * an.jaw[p] + 1]; }
      for (let p = 0; p < an.u.length; p++) { bx[an.u[p]] += an.w * an.ub[p] * tx; by[an.u[p]] += an.w * an.ub[p] * ty; }
    }
    A.solve2(bx, by);
    for (let q = 0; q < nU; q++) { const n = order[q]; out[2 * n] = bx[q]; out[2 * n + 1] = by[q]; }
    return out;
  };

  const soft = whole.filter((pc) => pc.kind === 0 || pc.kind === 3).length;
  return { spec, rest, kind, whole, parts, soft, solve, locate, size: { unknowns: nU, band: bw } };
}
