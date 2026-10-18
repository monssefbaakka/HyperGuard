import { CHART_COLORS } from '../theme';

export interface CausalNode {
  id: string;
  title: string;
  metric: string;
  detail: string;
  /** The trigger reading itself, drawn with the error outline; correlated metrics draw neutral/primary. */
  role: 'root' | 'correlated';
}

export interface CausalEdge {
  from: string;
  to: string;
  /** Pearson |r| against the root metric's series, 0-1. */
  strength: number;
}

interface CausalGraphProps {
  nodes: CausalNode[];
  edges: CausalEdge[];
}

const NODE_W = 168;
const NODE_H = 70;
const ROOT_X = 16;
const LEAF_X = 340;
const ROW_H = 92;
const PAD_TOP = 16;

/**
 * Fan-out layout: the triggering metric on the left, every other metric present in the incident to
 * its right, one row each. Edge thickness/color encodes real Pearson correlation strength against
 * the root's series — not a trained causal model, so edges read "correlated with", not "causes".
 */
export function CausalGraph({ nodes, edges }: CausalGraphProps) {
  const root = nodes.find((node) => node.role === 'root');
  const leaves = nodes.filter((node) => node.role !== 'root');
  const height = Math.max(leaves.length * ROW_H + PAD_TOP, NODE_H + PAD_TOP * 2);
  const width = LEAF_X + NODE_W + 16;
  const rootY = height / 2 - NODE_H / 2;

  return (
    <svg
      className="w-full"
      viewBox={`0 0 ${width} ${height}`}
      style={{ maxHeight: 260 }}
      role="img"
      aria-label="Causal correlation graph"
    >
      {root
        ? leaves.map((leaf, index) => {
            const edge = edges.find((candidate) => candidate.to === leaf.id);
            const strength = edge?.strength ?? 0;
            const critical = strength >= 0.7;
            const leafY = PAD_TOP + index * ROW_H;
            const x0 = ROOT_X + NODE_W;
            const y0 = rootY + NODE_H / 2;
            const x1 = LEAF_X;
            const y1 = leafY + NODE_H / 2;
            const midX = (x0 + x1) / 2;
            const color = critical ? CHART_COLORS.error : CHART_COLORS.outline;
            return (
              <g key={leaf.id}>
                <path
                  d={`M ${x0} ${y0} C ${midX} ${y0}, ${midX} ${y1}, ${x1} ${y1}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={critical ? 2.5 : 1.5}
                  strokeDasharray={critical ? undefined : '4,4'}
                  markerEnd="url(#causal-arrow)"
                />
                <rect
                  x={midX - 26}
                  y={(y0 + y1) / 2 - 10}
                  width={52}
                  height={18}
                  rx={4}
                  className="fill-surface-container-lowest"
                />
                <text
                  x={midX}
                  y={(y0 + y1) / 2 + 4}
                  textAnchor="middle"
                  className={`font-mono text-[10px] font-semibold ${critical ? 'fill-error' : 'fill-on-surface-variant'}`}
                >
                  r={strength.toFixed(2)}
                </text>
              </g>
            );
          })
        : null}

      <defs>
        <marker id="causal-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse" viewBox="0 0 10 10">
          <path d="M 0 0 L 6 3 L 0 6 z" fill={CHART_COLORS.outline} />
        </marker>
      </defs>

      {root ? <CausalNodeBox node={root} x={ROOT_X} y={rootY} /> : null}
      {leaves.map((leaf, index) => (
        <CausalNodeBox key={leaf.id} node={leaf} x={LEAF_X} y={PAD_TOP + index * ROW_H} />
      ))}
    </svg>
  );
}

function CausalNodeBox({ node, x, y }: { node: CausalNode; x: number; y: number }) {
  const critical = node.role === 'root';
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width={NODE_W} height={NODE_H} rx={8} className="fill-surface-container-lowest" />
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={8}
        fill="none"
        stroke={critical ? CHART_COLORS.error : CHART_COLORS.primary}
        strokeWidth={1.5}
      />
      <text x={12} y={20} className="fill-on-surface text-[11px] font-semibold">
        {node.title}
      </text>
      <text x={12} y={38} className="fill-on-surface-variant font-mono text-[10px]">
        {node.metric}
      </text>
      <text x={12} y={56} className={`text-[10px] ${critical ? 'fill-error' : 'fill-primary'}`}>
        {node.detail}
      </text>
    </g>
  );
}
