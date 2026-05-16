// Community Screen — active-turn highlight PIXI v7 overlay. No external module deps.

import { MODULE_ID } from "./module.mjs";
import { isTableUser } from "./identity.mjs";
import { get as getSetting } from "./settings.mjs";
import { logger } from "./lib/logger.mjs";

/**
 * Built-in PIXI v7 overlay for the active combatant. Uses .drawCircle() and
 * .lineStyle() — NOT PIXI v8's .circle() / strokeStyle.
 *
 * Four styles share the same shape vocabulary (outer ring + inner ring +
 * radial spokes) with different parameters; the `ornate` style adds an
 * outer pulse halo and a PIXI.BlurFilter glow for a richer effect without
 * needing Sequencer or JB2A.
 */
export class ActiveTurnHighlight {
  constructor() {
    /** @type {PIXI.Container | null} */
    this.gfx = null;
    /** @type {Function | null} */
    this.tick = null;
    /** @type {Token | null} */
    this.tok = null;
  }

  /**
   * Draw the highlight ring under a token.
   *
   * @param {Token} token
   * @param {{color?: number, large?: boolean, style?: string}} [opts]
   * @returns {void}
   */
  show(token, { color = 0xffd24a, large = false, style = "default" } = {}) {
    this.hide();
    if (!token || !canvas?.tokens) return;

    const baseRadius = Math.max(token.w, token.h) * (large ? 0.85 : 0.65);
    let radius;
    let lineWidth;
    let innerWidth;
    let spokes;
    let rotSpeed;
    let pulseAmp;
    let pulsePeriod;
    let glowBlur;
    let haloEnabled = false;

    switch (style) {
      case "subtle":
        radius = baseRadius * 0.85;
        lineWidth = 4;
        innerWidth = 2;
        spokes = 4;
        rotSpeed = 0.006;
        pulseAmp = 0.02;
        pulsePeriod = 600;
        glowBlur = 0;
        break;
      case "dramatic":
        radius = baseRadius * 1.1;
        lineWidth = 8;
        innerWidth = 4;
        spokes = 8;
        rotSpeed = 0.02;
        pulseAmp = 0.06;
        pulsePeriod = 300;
        glowBlur = 0;
        break;
      case "ornate":
        radius = baseRadius * 1.15;
        lineWidth = 7;
        innerWidth = 3;
        spokes = 12;
        rotSpeed = 0.014;
        pulseAmp = 0.05;
        pulsePeriod = 400;
        glowBlur = 6;
        haloEnabled = true;
        break;
      case "default":
      default:
        radius = baseRadius;
        lineWidth = 6;
        innerWidth = 3;
        spokes = 8;
        rotSpeed = 0.012;
        pulseAmp = 0.04;
        pulsePeriod = 350;
        glowBlur = 0;
        break;
    }

    const g = new PIXI.Container();

    // Optional outer halo (ornate). Drawn first so the ring stacks on top.
    let halo = null;
    if (haloEnabled) {
      halo = new PIXI.Graphics();
      halo.lineStyle(14, color, 0.25).drawCircle(0, 0, radius * 1.12);
      halo.lineStyle(8, 0xffffff, 0.18).drawCircle(0, 0, radius * 1.18);
      g.addChild(halo);
    }

    const ring = new PIXI.Graphics();
    ring.lineStyle(lineWidth, color, 0.9).drawCircle(0, 0, radius);
    ring.lineStyle(innerWidth, 0xffffff, 0.45).drawCircle(0, 0, radius * 0.86);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      ring
        .moveTo(Math.cos(a) * radius, Math.sin(a) * radius)
        .lineTo(Math.cos(a) * (radius - 14), Math.sin(a) * (radius - 14));
    }
    g.addChild(ring);

    // Ornate-only: a third concentric ring and procedural "runic" glyph
    // marks at each spoke, plus a counter-rotating glyph-decoration layer.
    // Replaces what the optional JB2A rune-circle asset used to provide,
    // entirely in native PIXI v7.
    let glyphLayer = null;
    if (style === "ornate") {
      ring
        .lineStyle(2, color, 0.5)
        .drawCircle(0, 0, radius * 0.72)
        .lineStyle(1, 0xffffff, 0.3)
        .drawCircle(0, 0, radius * 0.66);

      glyphLayer = new PIXI.Graphics();
      const glyphRadius = radius * 0.93;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const cx = Math.cos(a) * glyphRadius;
        const cy = Math.sin(a) * glyphRadius;
        drawGlyph(glyphLayer, cx, cy, a, 10, color);
      }
      g.addChild(glyphLayer);
    }

    if (glowBlur > 0) {
      try {
        const blur = new PIXI.BlurFilter(glowBlur, 4);
        ring.filters = [blur];
      } catch (err) {
        logger.debug("PIXI.BlurFilter unavailable; skipping glow:", err);
      }
    }

    g.position.set(token.center.x, token.center.y);
    g.zIndex = -1;
    canvas.tokens.sortableChildren = true;
    canvas.tokens.addChild(g);
    canvas.tokens.sortChildren?.();

    this.gfx = g;
    this.tok = token;

    this.tick = (delta) => {
      if (!this.gfx) return;
      this.gfx.rotation += rotSpeed * delta;
      const s = 1 + Math.sin(performance.now() / pulsePeriod) * pulseAmp;
      this.gfx.scale.set(s, s);
      if (halo) {
        // Counter-rotate the halo for a richer feel.
        halo.rotation -= rotSpeed * 0.5 * delta;
      }
      if (glyphLayer) {
        // Counter-rotate the runic glyph layer relative to the parent,
        // and gently pulse its alpha so the glyphs feel "alive".
        glyphLayer.rotation -= rotSpeed * 1.2 * delta;
        glyphLayer.alpha = 0.65 + Math.sin(performance.now() / 220) * 0.25;
      }
      if (this.tok?.center) this.gfx.position.set(this.tok.center.x, this.tok.center.y);
    };
    canvas.app?.ticker?.add(this.tick);
  }

  /**
   * Remove the highlight and stop the ticker callback.
   *
   * @returns {void}
   */
  hide() {
    if (this.gfx) {
      this.gfx.parent?.removeChild(this.gfx);
      try {
        this.gfx.destroy({ children: true });
      } catch {
        // ignore
      }
      this.gfx = null;
    }
    if (this.tick) {
      canvas.app?.ticker?.remove(this.tick);
      this.tick = null;
    }
    this.tok = null;
  }
}

/**
 * Draw a small procedural "rune" glyph at (cx, cy) on the given PIXI.Graphics,
 * oriented along `tangentAngle` (so the glyph points outward from the ring
 * center). Uses a deterministic shape seed derived from the position so each
 * spoke has a distinct-looking mark without needing bundled assets.
 *
 * Pure PIXI v7 line drawing. Replaces the visual that JB2A's rune-circle
 * sprite used to provide via Sequencer.
 *
 * @param {PIXI.Graphics} g
 * @param {number} cx
 * @param {number} cy
 * @param {number} tangentAngle - Radians; the angle from the ring center to (cx, cy).
 * @param {number} size - Approximate glyph size in canvas pixels.
 * @param {number} color
 * @returns {void}
 */
function drawGlyph(g, cx, cy, tangentAngle, size, color) {
  // Pick one of four glyph patterns based on a stable seed from the position.
  const seed = Math.abs(Math.round(Math.cos(tangentAngle * 7.3) * 1000)) % 4;
  const cos = Math.cos(tangentAngle);
  const sin = Math.sin(tangentAngle);
  // Local axes: along = outward from ring center; across = tangent.
  const ax = cos;
  const ay = sin;
  const bx = -sin;
  const by = cos;
  const point = (a, b) => [cx + a * ax + b * bx, cy + a * ay + b * by];
  g.lineStyle(1.5, color, 0.9);

  switch (seed) {
    case 0: {
      // Vertical bar with crossbar (rune-like "T")
      const [x1, y1] = point(-size / 2, 0);
      const [x2, y2] = point(size / 2, 0);
      const [x3, y3] = point(size / 2 - 2, -size / 3);
      const [x4, y4] = point(size / 2 - 2, size / 3);
      g.moveTo(x1, y1).lineTo(x2, y2);
      g.moveTo(x3, y3).lineTo(x4, y4);
      break;
    }
    case 1: {
      // Triangle pointing outward
      const [x1, y1] = point(size / 2, 0);
      const [x2, y2] = point(-size / 2, size / 3);
      const [x3, y3] = point(-size / 2, -size / 3);
      g.moveTo(x1, y1).lineTo(x2, y2).lineTo(x3, y3).lineTo(x1, y1);
      break;
    }
    case 2: {
      // Diamond
      const [x1, y1] = point(size / 2, 0);
      const [x2, y2] = point(0, size / 2);
      const [x3, y3] = point(-size / 2, 0);
      const [x4, y4] = point(0, -size / 2);
      g.moveTo(x1, y1).lineTo(x2, y2).lineTo(x3, y3).lineTo(x4, y4).lineTo(x1, y1);
      break;
    }
    default: {
      // Two short parallel strokes (rune-like "II")
      const [x1, y1] = point(-size / 3, -size / 3);
      const [x2, y2] = point(size / 3, -size / 3);
      const [x3, y3] = point(-size / 3, size / 3);
      const [x4, y4] = point(size / 3, size / 3);
      g.moveTo(x1, y1).lineTo(x2, y2);
      g.moveTo(x3, y3).lineTo(x4, y4);
      break;
    }
  }
}

const highlight = new ActiveTurnHighlight();

/**
 * @returns {Token | null} The token for the active combatant on the current scene.
 */
function activeCombatToken() {
  const c = game.combats?.active;
  if (!c?.started) return null;
  const tokenId = c.combatant?.tokenId;
  if (!tokenId) return null;
  return canvas?.tokens?.get(tokenId) ?? null;
}

/**
 * Compute the ring color for a token based on disposition and the
 * `highlight-use-disposition` setting.
 *
 * @param {Token} token
 * @returns {number}
 */
function pickColor(token) {
  if (!getSetting("highlight-use-disposition", true)) return 0xffd24a;
  const d = token.document?.disposition ?? 0;
  if (d < 0) return 0xc94c4c; // hostile
  if (d > 0) return 0xffd24a; // friendly
  return 0x88aabb; // neutral / secret
}

/**
 * Refresh the highlight: show on the active combatant if appropriate,
 * else hide.
 *
 * @returns {void}
 */
function refresh() {
  if (!getSetting("highlight-enabled", isTableUser())) {
    highlight.hide();
    return;
  }
  const tok = activeCombatToken();
  if (!tok) {
    highlight.hide();
    return;
  }
  if (tok.document?.hidden) {
    highlight.hide();
    return;
  }
  // v14 Scene Levels guard.
  const tokenLevel = tok.document?.level;
  if (tokenLevel !== undefined && tokenLevel !== canvas?.viewedLevel) {
    highlight.hide();
    return;
  }
  const style = getSetting("highlight-style", "default");
  highlight.show(tok, { color: pickColor(tok), large: true, style });
}

/**
 * Register hooks.
 *
 * @returns {void}
 */
export function init() {
  for (const h of ["updateCombat", "combatStart", "combatTurn", "combatRound", "canvasReady"]) {
    Hooks.on(h, () => refresh());
  }
  for (const h of ["combatEnd", "deleteCombat"]) {
    Hooks.on(h, () => highlight.hide());
  }
  Hooks.on("deleteToken", (doc) => {
    if (doc?.id === game.combats?.active?.combatant?.tokenId) {
      highlight.hide();
    }
  });
  Hooks.on("updateToken", () => refresh());

  // React to setting changes (style toggle, disposition toggle).
  Hooks.on("clientSettingChanged", (key) => {
    if (key?.startsWith?.(`${MODULE_ID}.highlight-`)) refresh();
  });
}
