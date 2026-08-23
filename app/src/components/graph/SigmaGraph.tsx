import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Graph from 'graphology';
import Sigma from 'sigma';
import type { NodeHoverDrawingFunction, NodeLabelDrawingFunction } from 'sigma/rendering';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { createNodeBorderProgram } from '@sigma/node-border';
import {
  buildLocationColorMap,
  getCharacterColor,
  getRelationColor,
  hexToRgba,
  nodeSize,
  MENACE_NODE_COLOR,
  DISCOVERY_NODE_COLOR,
} from '@/lib/graphPalette';
import { getRelationType } from '@/lib/constants';
import { followerOf, isFollower } from '@/lib/character/statblock';
import { resolveGroupMembers } from '@/lib/character/groupMembers';
import {
  groupDiscRadius,
  pointInCircle,
  type BubbleCircle,
} from '@/lib/character/groupBubble';
import { useT } from '@/i18n';
import type { Character, Location, Relation } from '@/types';

import type { ForceSettings } from './forceSettings';

export type { ForceSettings } from './forceSettings';
export { DEFAULT_FORCE_SETTINGS } from './forceSettings';

interface SigmaGraphProps {
  characters: Character[];
  relations: Relation[];
  locations: Location[];
  visibleCharacterIds?: Set<string>;
  visibleRelationTypes?: Set<string>;
  forces: ForceSettings;
  reseedToken?: number;
  /**
   * The node currently selected (controlled by the parent). Used to drive the
   * highlight from outside — e.g. when the mobile panel closes (`null`) or a
   * node is reselected. `undefined` = uncontrolled.
   */
  selectedNodeId?: string | null;
  /**
   * Called when the user taps a node (mobile) → the parent opens the links
   * panel. `null` when tapping the background to deselect.
   */
  onSelectNode?: (id: string | null) => void;
}


// Labels: centred UNDER the node with a paper-coloured halo, instead of the
// white rectangle glued to the right that Sigma draws by default. The halo
// (strokeText) keeps the text legible where it crosses edges.
const LABEL_MAX_CHARS = 22;

// Canvas colours: read from the CSS tokens (--graph-*) at first render — the
// canvas cannot resolve var() itself. Falls back to the historical values if a
// token is missing.
const GRAPH_COLORS = {
  label: '#2C2C2C',
  nodeDefault: '#9C9385',
  edgeDefault: '#999088',
  pcBorder: '#A87C24',
  groupBorder: '#8C8279',
  gmAccent: '#6b4d7a',
  labelHalo: 'rgba(235, 229, 218, 0.9)', // --bg-primary at 90%
};
let graphColorsLoaded = false;
function loadGraphColors() {
  if (graphColorsLoaded || typeof window === 'undefined') return;
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  GRAPH_COLORS.label = read('--graph-label', GRAPH_COLORS.label);
  GRAPH_COLORS.nodeDefault = read('--graph-node-default', GRAPH_COLORS.nodeDefault);
  GRAPH_COLORS.edgeDefault = read('--graph-edge-default', GRAPH_COLORS.edgeDefault);
  GRAPH_COLORS.pcBorder = read('--graph-accent-pc', GRAPH_COLORS.pcBorder);
  GRAPH_COLORS.groupBorder = read('--graph-accent-group', GRAPH_COLORS.groupBorder);
  GRAPH_COLORS.gmAccent = read('--gm-accent', GRAPH_COLORS.gmAccent);
  GRAPH_COLORS.labelHalo = hexToRgba(read('--bg-primary', '#EBE5DA'), 0.9);
  graphColorsLoaded = true;
}

const drawNodeLabel: NodeLabelDrawingFunction = (context, data, settings) => {
  if (!data.label) return;
  let label = data.label;
  if (label.length > LABEL_MAX_CHARS) label = `${label.slice(0, LABEL_MAX_CHARS - 1)}…`;

  context.font = `${settings.labelWeight} ${settings.labelSize}px ${settings.labelFont}`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.lineJoin = 'round';
  context.lineWidth = 5;
  context.strokeStyle = GRAPH_COLORS.labelHalo;
  context.strokeText(label, data.x, data.y + data.size + 3);
  context.fillStyle = GRAPH_COLORS.label;
  context.fillText(label, data.x, data.y + data.size + 3);
  // Sigma shares this 2D context with the other labels (edges, hover), which
  // assume the default alignment — so we restore it.
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
};

// On hover, Sigma draws a white frame with the label to the right by default —
// inconsistent with our labels under the node. We keep the same rendering, just
// underlined by a light halo around the node.
const drawNodeHover: NodeHoverDrawingFunction = (context, data, settings) => {
  context.beginPath();
  context.arc(data.x, data.y, data.size + 4, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 255, 255, 0.45)';
  context.fill();
  drawNodeLabel(context, data, settings);
};

const EDGE_SIZE_BASE = 2.5;
const EDGE_SIZE_FOCUS = 5;
const EDGE_ALPHA_BASE = 0.85;
const EDGE_ALPHA_FADE = 0.04;
const NODE_ALPHA_FADE = 0.15;


interface SimNode extends SimulationNodeDatum {
  id: string;
}
type SimLink = SimulationLinkDatum<SimNode>;


export function SigmaGraph({
  characters,
  relations,
  locations,
  visibleCharacterIds,
  visibleRelationTypes,
  forces,
  reseedToken = 0,
  selectedNodeId,
  onSelectNode,
}: SigmaGraphProps) {
  const t = useT();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodesRef = useRef<Map<string, SimNode>>(new Map());
  const hoveredRef = useRef<string | null>(null);
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  const draggedNodeRef = useRef<string | null>(null);
  // Ancres des groupes avec membres — neutres pour la charge (manyBody).
  const groupAnchorIdsRef = useRef<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  // Mobile: a single tap on a node selects it (= highlight its direct links +
  // the parent opens the panel). No more double-tap.
  // Refs mirroring the props so the native handlers can read them without
  // re-running the big graph-construction useEffect.
  const onSelectNodeRef = useRef(onSelectNode);
  const selectedNodeIdRef = useRef<string | null | undefined>(selectedNodeId);
  // The gesture's start position (touch or mouse) — feeds the movement
  // threshold that tells a TAP from a DRAG. Without that threshold, the
  // involuntary micro-movement of a finger between touchstart and touchend
  // (always 2-3 px in practice) wrongly flags `isDraggingRef = true` and
  // breaks double-tap detection.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);





  const forcesRef = useRef<ForceSettings>(forces);
  useEffect(() => {
    forcesRef.current = forces;
  }, [forces]);

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

  // Parent-driven selection → sync the internal highlight. When the panel
  // closes (selectedNodeId = null) we clear the highlight. `undefined` =
  // uncontrolled mode (desktop), which we leave alone.
  useEffect(() => {
    if (selectedNodeId === undefined) return;
    selectedNodeIdRef.current = selectedNodeId;
    hoveredRef.current = selectedNodeId;
    sigmaRef.current?.refresh();
  }, [selectedNodeId]);


  useEffect(() => {
    if (!containerRef.current) return;

  
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }
    if (simRef.current) {
      simRef.current.stop();
      simRef.current = null;
    }

    loadGraphColors();
    const colorMap = buildLocationColorMap(locations);
    const g = new Graph({ multi: false, type: 'undirected' });
    const charById = new Map(characters.map((c) => [c.id, c]));

    const visible = visibleCharacterIds ?? new Set(characters.map((c) => c.id));

    const visibleChars = characters.filter((c) => visible.has(c.id));

    const visibleRelations = relations.filter((r) => {
      if (!visible.has(r.from_character_id) || !visible.has(r.to_character_id)) return false;
      if (visibleRelationTypes && !visibleRelationTypes.has(r.relation_type)) return false;
      return true;
    });

    // Visible memberships: the bubble replaces the `membre` edge.
    const { members: groupMembers, membershipRelationIds } = resolveGroupMembers(
      visibleChars,
      visibleRelations,
    );
    groupAnchorIdsRef.current = new Set(groupMembers.keys());


    const adjacency = new Map<string, Set<string>>();
    visibleRelations.forEach((r) => {
      if (!adjacency.has(r.from_character_id)) adjacency.set(r.from_character_id, new Set());
      if (!adjacency.has(r.to_character_id)) adjacency.set(r.to_character_id, new Set());
      adjacency.get(r.from_character_id)!.add(r.to_character_id);
      adjacency.get(r.to_character_id)!.add(r.from_character_id);
    });
    adjacencyRef.current = adjacency;

   
    const degree = new Map<string, number>();
    visibleRelations.forEach((r) => {
      degree.set(r.from_character_id, (degree.get(r.from_character_id) || 0) + 1);
      degree.set(r.to_character_id, (degree.get(r.to_character_id) || 0) + 1);
    });


    const simNodes: SimNode[] = [];
    const simNodeMap = new Map<string, SimNode>();

    visibleChars.forEach((c, i) => {
      const angle = (i / Math.max(visibleChars.length, 1)) * Math.PI * 2;
      const radius = 200;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const isPJ = c.type === 'PJ';
      const isGroup = c.type === 'GROUPE';
      const isMenace = c.type === 'MENACE';
      const isDiscovery = c.type === 'DISCOVERY';
      const memberCount = isGroup ? (groupMembers.get(c.id)?.length ?? 0) : 0;
      // An ember red reserved for threats and a verdigris for discoveries:
      // both recognisable at a glance, whatever the tint of the location they
      // might be attached to.
      const color = isMenace
        ? MENACE_NODE_COLOR
        : isDiscovery
          ? DISCOVERY_NODE_COLOR
          : getCharacterColor(c, colorMap);
      const attrs: Record<string, unknown> = {
        // GM suffix on the label (i18n gm.badge) — reused as-is in the canvas
        // tooltip/label, since no React component is possible here.
        label: c.gm_only ? `${c.name} (${t('gm.badge')})` : c.name,
        x,
        y,
        size: nodeSize(degree.get(c.id) || 0, c.type),
        color,
        nodeKind: c.type,
        location: c.location,
        // Bubble tint: kept even when the node becomes transparent.
        groupColor: color,
      };
      if (isPJ) {
        attrs.type = 'circle-border';
        attrs.borderColor = GRAPH_COLORS.pcBorder;
      } else if (isGroup) {
        if (memberCount > 0) {
          // The bubble replaces the node: an invisible anchor that stays in the
          // simulation (group-level edge attachment + clustering).
          attrs.size = 0.1;
          attrs.label = '';
          attrs.color = 'rgba(0, 0, 0, 0)';
        } else {
          // A group with no members: a visible node with a grey border,
          // otherwise it would become unreachable.
          attrs.type = 'circle-border';
          attrs.borderColor = GRAPH_COLORS.groupBorder;
        }
      }
      // GM marker: a border tinted --gm-accent, taking priority over the
      // PC/group border above (a gm_only node must always stand out). The
      // `circle-border` program (@sigma/node-border) is already wired up for
      // PC/group — we reuse it rather than falling back to a colour blend (the
      // fallback planned for if borders were unsupported, which they are not
      // here). Excluded for groups with members: their node is an invisible
      // anchor (size 0.1, transparent colour) replaced on screen by the
      // bubble — a border drawn on it would leave a stray plum dot at the
      // centre.
      if (c.gm_only && !(isGroup && memberCount > 0)) {
        attrs.type = 'circle-border';
        attrs.borderColor = GRAPH_COLORS.gmAccent;
      }
      g.addNode(c.id, attrs);


      const simNode: SimNode = { id: c.id, x, y };
      simNodes.push(simNode);
      simNodeMap.set(c.id, simNode);
    });

    simNodesRef.current = simNodeMap;

    
    const simLinks: SimLink[] = [];
    visibleRelations.forEach((r) => {
      const from = charById.get(r.from_character_id);
      const to = charById.get(r.to_character_id);
      if (!from || !to) return;
      if (g.hasEdge(r.from_character_id, r.to_character_id)) return;
      const key = [r.from_character_id, r.to_character_id].sort().join('|');
      const baseColor = getRelationColor(r);
      const typeLabel = getRelationType(r.relation_type).label;
      const detail = r.relation_detail?.trim() || typeLabel;
      g.addEdgeWithKey(key, r.from_character_id, r.to_character_id, {
        _label: detail,
        _baseColor: baseColor,
        color: hexToRgba(baseColor, EDGE_ALPHA_BASE),
        size: EDGE_SIZE_BASE,
        relationType: r.relation_type,
        // The membership edge stays in graphology (adjacency, highlighting)
        // but does not appear on screen: the bubble is what makes it visible.
        hidden: membershipRelationIds.has(r.id),
      });
      // Memberships have NO spring in the simulation: the container force
      // handles them. A spring at linkDistance (~200 gu) would hold members on
      // a ring far OUTSIDE the disc (~60 gu) — it would fight the container
      // instead of helping it.
      if (!membershipRelationIds.has(r.id)) {
        simLinks.push({
          source: simNodeMap.get(r.from_character_id)!,
          target: simNodeMap.get(r.to_character_id)!,
        });
      }
    });

    // Follower → leader edges, DERIVED from follower.leaderId (no relations
    // row — single source of truth, cf. spec §5). Stable key
    // `follower:<id>`. No role guard to add here: the `follower` field is
    // precisely the one a player MUST see (it is what makes the sheet public —
    // cf. types/index.ts: a player must see their own follower's leash), and
    // the `characters` array received in props is already filtered upstream
    // (filterCharactersForRole, parity with app_character_row_for_role on the
    // server) for everything else. This loop only reads what it is given. The
    // edges join the simulation's NORMAL spring branch, like an ordinary
    // relation — this is not a group membership.
    for (const c of visibleChars) {
      // `isFollower` first: a MENACE is never one, even if its row still
      // carries a follower block — no "follows" edge from a threat.
      const leaderId = isFollower(c) ? followerOf(c)?.leaderId : null;
      if (!leaderId || c.id === leaderId) continue; // no specific leader, or a self-loop
      if (!g.hasNode(leaderId)) continue; // meneur hors du graphe visible
      // Non-multi graph ({ multi: false }): a second addEdgeWithKey between the
      // same pair of nodes would throw if a relation already connects them. We
      // respect the existing edge rather than duplicating it.
      if (g.hasEdge(c.id, leaderId)) continue;
      const key = `follower:${c.id}`;
      g.addEdgeWithKey(key, c.id, leaderId, {
        _label: t('graph.follows'),
        _baseColor: GRAPH_COLORS.pcBorder,
        color: hexToRgba(GRAPH_COLORS.pcBorder, EDGE_ALPHA_BASE),
        size: EDGE_SIZE_BASE,
      });
      simLinks.push({
        source: simNodeMap.get(c.id)!,
        target: simNodeMap.get(leaderId)!,
      });
      // adjacencyRef feeds the nodeReducer's hover fade (~388-403): without
      // this entry, hovering a follower whose ONLY link to its leader is this
      // derived edge would grey out the leader node (0 in the adjacency Set)
      // while the edge itself stayed lit.
      if (!adjacency.has(c.id)) adjacency.set(c.id, new Set());
      if (!adjacency.has(leaderId)) adjacency.set(leaderId, new Set());
      adjacency.get(c.id)!.add(leaderId);
      adjacency.get(leaderId)!.add(c.id);
    }

    graphRef.current = g;

    if (g.order === 0) return;

    
    const renderer = new Sigma(g, containerRef.current, {
      renderEdgeLabels: true,
      defaultNodeColor: GRAPH_COLORS.nodeDefault,
      defaultEdgeColor: GRAPH_COLORS.edgeDefault,
      labelColor: { color: GRAPH_COLORS.label },
      edgeLabelColor: { color: GRAPH_COLORS.label },
      labelSize: 13,
      edgeLabelSize: 12,
      labelFont: "'Alegreya Sans', system-ui, sans-serif",
      edgeLabelFont: "'Alegreya Sans', system-ui, sans-serif",
      labelWeight: '500',
      edgeLabelWeight: '600',
      // High density + low threshold → names stay visible from the overview
      // zoom instead of only appearing when zoomed right in.
      labelDensity: 3,
      labelGridCellSize: 80,
      labelRenderedSizeThreshold: 3,
      defaultDrawNodeLabel: drawNodeLabel,
      defaultDrawNodeHover: drawNodeHover,
      enableEdgeEvents: false,
      nodeProgramClasses: {
        'circle-border': createNodeBorderProgram({
          borders: [
            { size: { value: 2 }, color: { attribute: 'borderColor' } },
            { size: { fill: true }, color: { attribute: 'color' } },
          ],
        }),
      },
      nodeReducer: (key, attrs) => {
        const out: Record<string, unknown> = { ...attrs };
        // Invisible group anchors: nothing to fade.
        if (typeof attrs.color === 'string' && attrs.color.startsWith('rgba')) return out;
        const hovered = hoveredRef.current;
        if (hovered) {
          const focus = key === hovered || adjacencyRef.current.get(hovered)?.has(key);
          if (!focus) {
            out.color = hexToRgba((attrs.color as string) || GRAPH_COLORS.nodeDefault, NODE_ALPHA_FADE);
            out.label = '';
          } else if (key === hovered) {
            out.zIndex = 2;
          }
        }
        return out;
      },
      edgeReducer: (key, attrs) => {
        const out: Record<string, unknown> = { ...attrs };
        const hovered = hoveredRef.current;
        const baseColor = (attrs._baseColor as string) || GRAPH_COLORS.edgeDefault;
        if (hovered) {
          const [s, t] = g.extremities(key);
          const involves = s === hovered || t === hovered;
          if (involves) {
            out.color = hexToRgba(baseColor, 1);
            out.size = EDGE_SIZE_FOCUS;
            out.label = (attrs._label as string) || '';
            out.forceLabel = true;
            out.zIndex = 3;
          } else {
            out.color = hexToRgba(baseColor, EDGE_ALPHA_FADE);
            out.size = EDGE_SIZE_BASE * 0.5;
            out.label = '';
          }
        } else {
          out.color = hexToRgba(baseColor, EDGE_ALPHA_BASE);
          out.size = EDGE_SIZE_BASE;
          out.label = '';
        }
        return out;
      },
    });

    sigmaRef.current = renderer;

    const camera = renderer.getCamera();

    // ----- Group bubbles -------------------------------------------------
    // A 2D canvas inserted UNDER the Sigma layers (first child of the
    // container): the bubbles draw behind edges and nodes, recomputed every
    // frame (afterRender follows both the d3 tick AND camera movement).
    const el = containerRef.current!;
    const bubbleCanvas = document.createElement('canvas');
    bubbleCanvas.style.position = 'absolute';
    bubbleCanvas.style.inset = '0';
    // Replaced element: without explicit CSS width/height, the box takes the
    // size of the backing store (×dpr on Retina) instead of the container's.
    bubbleCanvas.style.width = '100%';
    bubbleCanvas.style.height = '100%';
    bubbleCanvas.style.pointerEvents = 'none';
    el.insertBefore(bubbleCanvas, el.firstChild);

    interface BubbleShape {
      groupId: string;
      /** Cercle en px viewport. */
      circle: BubbleCircle;
    }
    let bubbleShapes: BubbleShape[] = [];
    let hoveredBubbleId: string | null = null;

    const BUBBLE_FILL_ALPHA = 0.16;
    const BUBBLE_FILL_ALPHA_HOVER = 0.26;
    const BUBBLE_RIM_ALPHA = 0.55;

    // Container size cached: a getBoundingClientRect every frame forced a
    // synchronous layout ~60×/s for the whole settle AND on every pan/zoom.
    // Only the SIZE is needed here — a ResizeObserver keeps it current without
    // ever reading layout from the render loop.
    let elWidth = el.clientWidth;
    let elHeight = el.clientHeight;
    const sizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || (box.width === elWidth && box.height === elHeight)) return;
      elWidth = box.width;
      elHeight = box.height;
      // A corrective render is MANDATORY: ResizeObserver callbacks run AFTER
      // the rAFs of the same turn — so the resize frame's drawBubbles read the
      // old size, and once the simulation has settled nothing redraws again
      // (especially on mobile: no hover). Sigma only listens to window.resize;
      // scheduleRender() also resyncs its own dimensions (render → resize())
      // when only the container moved (rotation, sidebar animation), then
      // replays drawBubbles via afterRender.
      renderer.scheduleRender();
    });
    sizeObserver.observe(el);

    const drawBubbles = () => {
      const ctx = bubbleCanvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(elWidth * dpr);
      const h = Math.round(elHeight * dpr);
      if (bubbleCanvas.width !== w || bubbleCanvas.height !== h) {
        bubbleCanvas.width = w;
        bubbleCanvas.height = h;
      }
      // All drawing in CSS px; the dpr scale is carried by the transform.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, elWidth, elHeight);

      const shapes: BubbleShape[] = [];
      groupMembers.forEach((memberIds, groupId) => {
        if (!g.hasNode(groupId) || memberIds.length === 0) return;
        // A FIXED-radius disc (graph units) centred on the anchor. The
        // container force (cf. simulation) pulls members in and expels
        // outsiders — the drawn circle matches the forces' contract.
        const ax = g.getNodeAttribute(groupId, 'x') as number;
        const ay = g.getNodeAttribute(groupId, 'y') as number;
        const R = groupDiscRadius(memberIds.length);
        const c = renderer.graphToViewport({ x: ax, y: ay });
        const edge = renderer.graphToViewport({ x: ax + R, y: ay });
        const r = Math.hypot(edge.x - c.x, edge.y - c.y);
        shapes.push({ groupId, circle: { cx: c.x, cy: c.y, r } });
      });

      // Large bubbles drawn first (underneath), small ones on top.
      shapes.sort((a, b) => b.circle.r - a.circle.r);
      bubbleShapes = shapes;

      for (const shape of shapes) {
        const color =
          (g.getNodeAttribute(shape.groupId, 'groupColor') as string) ||
          GRAPH_COLORS.nodeDefault;
        const hovered = shape.groupId === hoveredBubbleId;
        const { cx, cy, r } = shape.circle;

        // 1. Disc + border. A plain circle does not have the old star shape's
        //    stroke/fill overprinting problem: we can draw straight in
        //    semi-transparency, with no scratch canvas.
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, hovered ? BUBBLE_FILL_ALPHA_HOVER : BUBBLE_FILL_ALPHA);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = hexToRgba(color, hovered ? 0.85 : BUBBLE_RIM_ALPHA);
        ctx.stroke();

        // 2. Group name: a watermark at the centre of the disc — large, serif
        //    display, in the group's colour at low alpha. It blends into the
        //    tint and stays legible through sheer size even when nodes/labels
        //    pass over it (it is drawn underneath).
        const label = charById.get(shape.groupId)?.name ?? '';
        if (label) {
          // Proportional to the disc (so to the zoom), bounded.
          const fontSize = Math.max(13, Math.min(44, r * 0.32));
          ctx.font = `700 ${fontSize}px 'Playfair Display', Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = hexToRgba(color, hovered ? 0.62 : 0.42);
          ctx.fillText(label, cx, cy);
        }
      }
    };
    renderer.on('afterRender', drawBubbles);

    /** Bulle sous le point (px viewport) — la plus petite gagne. */
    const bubbleAt = (x: number, y: number): string | null => {
      let best: BubbleShape | null = null;
      for (const s of bubbleShapes) {
        if (pointInCircle({ x, y }, s.circle)) {
          if (!best || s.circle.r < best.circle.r) best = s;
        }
      }
      return best ? best.groupId : null;
    };

    // ----- Simulation d3-force ---------------------------------------
    const f = forcesRef.current;
    const sim = forceSimulation<SimNode, SimLink>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((n) => n.id)
          .distance(f.linkDistance)
          .strength(f.linkForce)
      )
      // Group anchors do not EMIT charge (an anchor that repels everyone
      // chases away its own disc). They still RECEIVE it — it is the
      // container's vx/vy = 0 (registered last) that cancels that reception
      // before integration.
      .force(
        'charge',
        forceManyBody<SimNode>().strength((n) =>
          groupAnchorIdsRef.current.has(n.id) ? 0 : -f.repelForce
        )
      )
      .force('center', forceCenter(0, 0).strength(f.centerForce))
      // collision, to avoid visual overlap
      .force('collide', forceCollide<SimNode>(12))
      // alphaDecay 0.0228 by default → ~300 ticks ≈ 5 s before it settles
      .alphaDecay(0.03)
      .alphaMin(0.005);

    // The groups' "container" constraint: each group is a fixed-radius disc
    // (groupDiscRadius) around its anchor; members live inside, outsiders
    // outside — "in the circle" = "a member".
    //
    // A POSITION constraint (like forceCollide), not a velocity one: velocity
    // corrections ∝ alpha systematically lose the tug of war against the charge
    // (~800) and the springs (distance ~200) — members used to stall on the
    // edge of the disc (a bug seen twice). Moving positions by a fraction of
    // the excess each tick is insensitive to the balance of forces: the springs
    // stretch as far as they need to. Pinned nodes (a drag in progress) are
    // unaffected: d3's integration reimposes fx/fy after the forces.
    const GROUP_MEMBER_CLAMP = 0.25; // fraction of the excess corrected per tick
    const GROUP_STRANGER_CLAMP = 0.25;
    const GROUP_ANCHOR_CHASE = 0.2; // the anchor follows the members' centroid
    const GROUP_KEEP_OUT_MARGIN = 14; // margin (gu) beyond the drawn edge
    const groupDiscs = [...groupMembers.entries()].map(([groupId, memberIds]) => ({
      groupId,
      memberIds,
      memberSet: new Set(memberIds),
      radius: groupDiscRadius(memberIds.length),
    }));
    sim.force('groupContainer', () => {
      for (const { groupId, memberIds, memberSet, radius } of groupDiscs) {
        const anchor = simNodeMap.get(groupId);
        if (!anchor || anchor.x === undefined || anchor.y === undefined) continue;

        // 1. The anchor chases the members' centroid (direct position: it is
        //    charge-neutral and spring-free, so nothing else governs it).
        let cx = 0;
        let cy = 0;
        let count = 0;
        for (const mid of memberIds) {
          const m = simNodeMap.get(mid);
          if (!m || m.x === undefined || m.y === undefined) continue;
          cx += m.x;
          cy += m.y;
          count++;
        }
        if (count > 0) {
          anchor.x += (cx / count - anchor.x) * GROUP_ANCHOR_CHASE;
          anchor.y += (cy / count - anchor.y) * GROUP_ANCHOR_CHASE;
          anchor.vx = 0;
          anchor.vy = 0;
        }

        const innerRing = radius * 0.7;
        const keepOut = radius + GROUP_KEEP_OUT_MARGIN;
        for (const n of simNodes) {
          if (n === anchor || n.x === undefined || n.y === undefined) continue;
          const dx = n.x - anchor.x;
          const dy = n.y - anchor.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          if (memberSet.has(n.id)) {
            // 2. A member beyond the inner ring → pulled back inside.
            if (d > innerRing) {
              const shift = ((d - innerRing) / d) * GROUP_MEMBER_CLAMP;
              n.x -= dx * shift;
              n.y -= dy * shift;
            }
          } else if (d < keepOut) {
            // 3. An outsider inside the disc (+ margin) → expelled radially.
            const shift = ((keepOut - d) / d) * GROUP_STRANGER_CLAMP;
            n.x += dx * shift;
            n.y += dy * shift;
          }
        }
      }
    });

    sim.on('tick', () => {
      simNodes.forEach((n) => {
        if (n.x !== undefined) g.setNodeAttribute(n.id, 'x', n.x);
        if (n.y !== undefined) g.setNodeAttribute(n.id, 'y', n.y);
      });
      // Only x/y changed: a bare refresh() re-indexes every node and edge,
      // ~60×/s for the whole settle. skipIndexation is sigma's documented
      // fast path for position-only updates.
      renderer.refresh({ skipIndexation: true });
    });

   
    if (f.frozen) sim.alpha(0).stop();

    simRef.current = sim;

   

    // `clickNode` is emitted reliably by Sigma on desktop AND mobile (on mobile
    // it is the synthetic post-touchend "ghost click"). We use it as the single
    // source of truth for click/tap on a node, with Sigma's native hit-test
    // (pixel-perfect) rather than our home-grown one, which proved unreliable
    // on touch.
    //   - Controlled mode (mobile, onSelectNode defined) → selection = open the
    //     links panel (no direct navigation).
    //   - Otherwise (desktop) → navigate to the sheet.
    renderer.on('clickNode', ({ node }) => {
      // Prevents a stray click after a real drag
      if (isDraggingRef.current) return;
      const onSelect = onSelectNodeRef.current;
      if (onSelect) {
        hoveredRef.current = node;
        selectedNodeIdRef.current = node;
        renderer.refresh();
        onSelect(node);
      } else {
        navigate(`/character/${node}`);
      }
    });

    // Click on a bubble (the background, not a node) → the group's
    // sheet/selection. `clickNode` takes priority: Sigma only emits clickStage
    // outside a node.
    renderer.on('clickStage', ({ event }) => {
      if (isDraggingRef.current) return;
      const groupId = bubbleAt(event.x, event.y);
      if (!groupId) return;
      const onSelect = onSelectNodeRef.current;
      if (onSelect) {
        hoveredRef.current = groupId;
        selectedNodeIdRef.current = groupId;
        renderer.refresh();
        onSelect(groupId);
      } else {
        navigate(`/character/${groupId}`);
      }
    });


    renderer.on('enterNode', ({ node }) => {
      hoveredRef.current = node;
      renderer.refresh();
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });

    renderer.on('leaveNode', () => {
      if (containerRef.current) containerRef.current.style.cursor = 'default';
      // Locked selection (mobile tap, panel open): we do not clear it on a
      // stray leaveNode, otherwise the highlight vanishes while the panel is
      // still showing.
      if (selectedNodeIdRef.current && hoveredRef.current === selectedNodeIdRef.current) return;
      hoveredRef.current = null;
      renderer.refresh();
    });


    const beginDragOn = (node: string) => {
      draggedNodeRef.current = node;
      isDraggingRef.current = false;
      const sn = simNodesRef.current.get(node);
      if (sn) {
        sn.fx = sn.x;
        sn.fy = sn.y;
      }
      camera.enabledPanning = false;          // <- blocks the camera pan
      const s = simRef.current;
      if (s && !forcesRef.current.frozen) {
        s.alphaTarget(0.3).restart();
      }
    };

    // Viewport-pixel threshold telling a TAP from a DRAG. Below it we do NOT
    // set isDraggingRef and do NOT move the node — it is a tap (or a motionless
    // long-press). Above it, it is a drag.
    const DRAG_THRESHOLD_PX = 10;

    renderer.on('downNode', ({ node, event }) => {
      beginDragOn(node);
      // Records the start position so the threshold can be applied on the next
      // mousemovebody (same as for touch).
      dragStartRef.current = { x: event.x, y: event.y };
      event.preventSigmaDefault();
      event.original.preventDefault();
      event.original.stopPropagation();
    });


     const mouseCaptor = renderer.getMouseCaptor();

    const onMouseMove = (e: { x: number; y: number; preventSigmaDefault: () => void }) => {
      if (!draggedNodeRef.current) return;
      const start = dragStartRef.current;
      if (start) {
        const dx = e.x - start.x;
        const dy = e.y - start.y;
        // Sous le seuil → on ignore (c'est un click immobile, pas un drag)
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
          e.preventSigmaDefault();
          return;
        }
      }
      isDraggingRef.current = true;
      const pos = renderer.viewportToGraph({ x: e.x, y: e.y });
      const sn = simNodesRef.current.get(draggedNodeRef.current);
      if (sn) {
        sn.fx = pos.x;
        sn.fy = pos.y;
      }
      e.preventSigmaDefault();
    };
    mouseCaptor.on('mousemovebody', onMouseMove);

    // Survol d'une bulle (hors nœud) : curseur pointeur + emphase du fond.
    const onMouseMoveBubbles = (e: { x: number; y: number }) => {
      if (draggedNodeRef.current) return;
      const gid = hoveredRef.current ? null : bubbleAt(e.x, e.y);
      if (gid !== hoveredBubbleId) {
        hoveredBubbleId = gid;
        drawBubbles();
      }
      // Do not overwrite the cursor set by enterNode/leaveNode.
      if (!hoveredRef.current && containerRef.current) {
        containerRef.current.style.cursor = gid ? 'pointer' : 'default';
      }
    };
    mouseCaptor.on('mousemovebody', onMouseMoveBubbles);


    const stopDrag = () => {
      const id = draggedNodeRef.current;
      // We ALWAYS re-enable panning, even with no active drag — this stops the
      // camera being stuck if an exception interrupts the flow.
      camera.enabledPanning = true;
      if (!id) return;
      const sn = simNodesRef.current.get(id);
      if (sn) {
        sn.fx = null;
        sn.fy = null;
      }
      const s = simRef.current;
      if (s) s.alphaTarget(0);
      draggedNodeRef.current = null;

      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
    };

     mouseCaptor.on('mouseup', stopDrag);
    
    window.addEventListener('mouseup', stopDrag);

    // -------------------------------------------------------------------
    // Touch support — a complete bypass of Sigma's TouchCaptor.
    //
    // Sigma v3's event API (`touchmovebody`, `touchdown`, …) is unreliable
    // across builds: variable payloads, events sometimes not emitted. So we
    // wire the native DOM events straight onto the canvas container. Upsides:
    //   - native `touchmove` fires every frame, unfiltered
    //   - native `preventDefault()` cleanly blocks the TouchCaptor pan
    //     UPSTREAM (provided the listener is `passive: false`)
    //   - 100% predictable across Sigma versions
    // -------------------------------------------------------------------

    // Converts a Touch into coordinates *relative to the canvas* (those are
    // what Sigma expects, not absolute clientX/Y).
    const getTouchPoint = (touch: Touch) => {
      const rect = el.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    // Hit-test: finds the node under the finger (radius scaled to the zoom).
    const hitTestAt = (viewportX: number, viewportY: number): string | null => {
      const graphPos = renderer.viewportToGraph({ x: viewportX, y: viewportY });
      const ratio = camera.getState().ratio;
      // 25 graph units at zoom 1, bounded to avoid extremes.
      const HIT_RADIUS = Math.max(15, Math.min(80, 25 * ratio));
      const hr2 = HIT_RADIUS * HIT_RADIUS;
      let nearest: string | null = null;
      let minD2 = hr2;
      simNodesRef.current.forEach((sn, id) => {
        if (sn.x === undefined || sn.y === undefined) return;
        // The invisible group anchors are not touch targets: grabbing them
        // would block the camera pan from inside a bubble. Tapping a bubble
        // goes through clickStage/bubbleAt.
        if (groupAnchorIdsRef.current.has(id)) return;
        const dx = sn.x - graphPos.x;
        const dy = sn.y - graphPos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD2) { minD2 = d2; nearest = id; }
      });
      return nearest;
    };

    const onTouchStartNative = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        // Pinch → we let Sigma handle the zoom, but we settle any drag in
        // progress: otherwise `isDraggingRef` can stay stuck at true and the
        // `clickNode` guard then swallows every tap until remount.
        stopDrag();
        isDraggingRef.current = false;
        dragStartRef.current = null;
        return;
      }
      const { x, y } = getTouchPoint(e.touches[0]);
      const node = hitTestAt(x, y);
      if (node) {
        // We block the TouchCaptor pan FROM THE START: without this, Sigma
        // already records startCameraState and begins panning right after.
        // preventDefault() also prevents text selection.
        e.preventDefault();
        e.stopPropagation();
        beginDragOn(node);
        // Records the start position for the DRAG_THRESHOLD_PX threshold.
        dragStartRef.current = { x, y };
      } else if (hoveredRef.current) {
        // Tap on the background with an active selection → deselect, UNLESS
        // the tap is inside a bubble: the ghost clickStage will select the
        // group (deselecting here would make the panel flicker).
        if (!bubbleAt(x, y)) {
          hoveredRef.current = null;
          renderer.refresh();
          onSelectNodeRef.current?.(null);
        }
      }
    };


    const onTouchMoveNative = (e: TouchEvent) => {
      if (!draggedNodeRef.current) return;
      if (e.touches.length !== 1) return;
      // CRUCIAL: preventDefault() only works because the listener is added
      // with `{ passive: false }` (see below).
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = getTouchPoint(e.touches[0]);

      // Movement threshold: we only treat it as a drag beyond
      // DRAG_THRESHOLD_PX. Below that it is involuntary finger micro-movement —
      // the node stays put and `isDraggingRef` stays `false` so that
      // `touchend` handles it as a tap.
      const start = dragStartRef.current;
      if (start) {
        const dx = x - start.x;
        const dy = y - start.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      }

      const pos = renderer.viewportToGraph({ x, y });
      const sn = simNodesRef.current.get(draggedNodeRef.current);
      if (sn) {
        sn.fx = pos.x;
        sn.fy = pos.y;
      }
      isDraggingRef.current = true;
    };


    // -------------------------------------------------------------------
    // Mobile tap = selection (the equivalent of desktop hover):
    //  - tap a node → highlight its direct links + open the panel (the parent
    //    shows the list of links, clickable to open the NPC's sheet). No more
    //    double-tap.
    //  - tap the background → deselect (handled in onTouchStartNative).
    //  - drag → not a tap, triggers nothing.
    // -------------------------------------------------------------------
    const onTouchEndNative = (e: TouchEvent) => {
      const wasDragging = isDraggingRef.current;
      const id = draggedNodeRef.current;
      stopDrag();

      // A real drag, or a finger lifted off a node → we do nothing.
      // SELECTION itself is handled by Sigma's `clickNode` handler (reliable
      // hit-test); we still keep a fallback selection here in case the
      // synthetic `clickNode` is not emitted on some mobile browsers.
      if (!id || wasDragging) return;

      e.preventDefault();
      hoveredRef.current = id;
      selectedNodeIdRef.current = id;
      renderer.refresh();
      onSelectNodeRef.current?.(id);
    };


    
    const opts = { passive: false, capture: true } as AddEventListenerOptions;
    el.addEventListener('touchstart', onTouchStartNative, opts);
    el.addEventListener('touchmove', onTouchMoveNative, opts);
    el.addEventListener('touchend', onTouchEndNative, opts);
    el.addEventListener('touchcancel', onTouchEndNative, opts);


  
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);

    return () => {
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('touchcancel', stopDrag);
      // `capture` is part of a listener's identity: without `opts`,
      // removeEventListener removes nothing and the handlers stack up on every
      // filter change.
      el.removeEventListener('touchstart', onTouchStartNative, opts);
      el.removeEventListener('touchmove', onTouchMoveNative, opts);
      el.removeEventListener('touchend', onTouchEndNative, opts);
      el.removeEventListener('touchcancel', onTouchEndNative, opts);
      sim.stop();
      simRef.current = null;
      sizeObserver.disconnect();
      bubbleCanvas.remove();
      renderer.kill();
      sigmaRef.current = null;
    };


  }, [
    characters,
    relations,
    locations,
    visibleCharacterIds,
    visibleRelationTypes,
    navigate,
    t,
  ]);

 
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;

    // forceLink
    const linkForceObj = sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>> | undefined;
    if (linkForceObj) {
      linkForceObj.distance(forces.linkDistance).strength(forces.linkForce);
    }
   
    const chargeForceObj = sim.force('charge') as
      | ReturnType<typeof forceManyBody<SimNode>>
      | undefined;
    if (chargeForceObj) {
      // Same rule as at creation: group anchors stay neutral.
      chargeForceObj.strength((n) =>
        groupAnchorIdsRef.current.has(n.id) ? 0 : -forces.repelForce
      );
    }
   
    const centerForceObj = sim.force('center') as ReturnType<typeof forceCenter> | undefined;
    if (centerForceObj) {
      centerForceObj.strength(forces.centerForce);
    }

    if (forces.frozen) {
      sim.alpha(0).stop();
    } else {
      sim.alpha(Math.max(sim.alpha(), 0.2)).restart();
    }
  }, [forces]);

 
  useEffect(() => {
    if (reseedToken === 0) return;
    const g = graphRef.current;
    const sim = simRef.current;
    if (!g || !sim) return;

    simNodesRef.current.forEach((n) => {
      n.x = (Math.random() - 0.5) * 400;
      n.y = (Math.random() - 0.5) * 400;
      n.vx = 0;
      n.vy = 0;
      
      n.fx = null;
      n.fy = null;
      g.setNodeAttribute(n.id, 'x', n.x);
      g.setNodeAttribute(n.id, 'y', n.y);
    });
    sigmaRef.current?.refresh();
    if (!forcesRef.current.frozen) {
      sim.alpha(1).restart();
    }
  }, [reseedToken]);

  if (characters.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--text-muted)] font-body italic">
        {t('graph.empty')}

      </div>
    );
  }

  return (
    // A purely visual view (WebGL canvas, not keyboard-drivable): we at least
    // give it an accessible name. The same data stays reachable as lists
    // (grimoire, sheets, mobile panel) for screen readers and keyboards.
    <div
      ref={containerRef}
      role="img"
      aria-label={t('graph.title')}
      className="w-full h-full relative"
      style={{ cursor: 'default', touchAction: 'none' }}
    />
  );

}
