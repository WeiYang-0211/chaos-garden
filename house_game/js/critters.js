import * as THREE from 'three';
import { rand, std, interactive, say } from './util.js';

// Butterflies drifting over the garden. They are out from spring to autumn, hide under snow,
// at night and in heavy rain, and dart off faster for a moment when clicked.
const COLORS = [0xf6d24a, 0xf08a4b, 0x9ed0f0];
const LINES = ['花间小憩', '翩翩来去', '蝶舞庭院'];

// Wings are built flat in the XZ plane with the root at the origin, so rolling them about Z flaps.
const FORE = new THREE.CircleGeometry(0.2, 12).rotateX(-Math.PI / 2).scale(1, 1, 0.75).translate(0.2, 0, 0);
const HIND = new THREE.CircleGeometry(0.13, 12).rotateX(-Math.PI / 2).scale(1, 1, 0.9).translate(0.12, 0, -0.1);
const BODY = new THREE.CapsuleGeometry(0.03, 0.16, 3, 6).rotateX(Math.PI / 2);
const ANTENNA = new THREE.CylinderGeometry(0.004, 0.004, 0.16, 3).translate(0, 0.08, 0);
const bodyMat = std(0x2b2620, { roughness: 0.7 });
// Generous invisible hit target: at a distance the wings are only a few pixels across.
const HIT = new THREE.SphereGeometry(0.3, 8, 6);
const HIT_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

// Body points along +Z (the direction of travel). The right-hand pivot is mirrored with
// scale.x = -1, so it needs the opposite roll to beat in step with the left one.
function butterfly(color) {
  const root = new THREE.Group();
  const wingMat = std(color, { side: THREE.DoubleSide, roughness: 0.55, emissive: color, emissiveIntensity: 0.12 });
  root.add(new THREE.Mesh(BODY, bodyMat), new THREE.Mesh(HIT, HIT_MAT));
  for (const s of [1, -1]) {
    const antenna = new THREE.Mesh(ANTENNA, bodyMat);
    antenna.position.set(s * 0.02, 0.02, 0.1);
    antenna.rotation.set(0.5, 0, -s * 0.35);
    root.add(antenna);
  }
  const pivots = [1, -1].map((side) => {
    const p = new THREE.Group();
    p.scale.x = side;
    p.add(new THREE.Mesh(FORE, wingMat), new THREE.Mesh(HIND, wingMat));
    root.add(p);
    return { p, side };
  });
  return { root, pivots };
}

export function createCritters(ctx) {
  const ahead = new THREE.Vector3();

  // Lazy Lissajous loop over the lawn, kept clear of the pagoda, the trees and the walls.
  function along(st, a, out) {
    return out.set(
      Math.sin(a + st.ph) * 15 + Math.sin(a * 2.3 + st.ph) * 3,
      2.4 + Math.sin(a * 1.7 + st.ph) * 0.8 + Math.cos(a * 3.1) * 0.25,
      Math.sin(a * 2 + st.ph) * 6 + Math.cos(a * 0.7) * 2 + 1,
    );
  }

  const flock = COLORS.map((color, i) => {
    const { root, pivots } = butterfly(color);
    ctx.scene.add(root);
    const st = {
      root, pivots,
      ph: i * 2.1 + rand(0, 0.6), sp: rand(0.16, 0.24), a: rand(0, 6), flap: rand(0, 6),
      boost: 0, vis: 0,
    };
    interactive(ctx, root, {
      name: '蝴蝶', hint: '点击惊飞，它会加速飞一会儿',
      onClick: () => {
        if (st.vis < 0.5) return;
        st.boost = 2.5;
        ctx.sfx.tone(1320 + i * 110, 0.3, { type: 'sine', gain: 0.04 });
        say(ctx, root, LINES[(Math.random() * LINES.length) | 0], 0.9, 1.8);
      },
    });
    return st;
  });

  ctx.updaters.push((dt) => {
    const open = (1 - ctx.env.snow) * (1 - ctx.night * 0.9) * (1 - ctx.env.rain * 0.8);
    for (const st of flock) {
      st.vis += (open - st.vis) * Math.min(1, dt * 2);
      st.boost = Math.max(0, st.boost - dt);
      st.a += dt * st.sp * (1 + st.boost * 1.5);
      st.flap += dt * (5 + st.boost * 8);
      along(st, st.a, st.root.position);
      along(st, st.a + 0.02, ahead);
      st.root.lookAt(ahead);
      st.root.scale.setScalar(Math.max(0.001, st.vis));
      st.root.visible = st.vis > 0.02;
      const beat = 0.25 + Math.sin(st.flap) * 0.45;
      for (const { p, side } of st.pivots) p.rotation.z = side * beat;
    }
  });
  return flock;
}
