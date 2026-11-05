#version 460 core

#include <flutter/runtime_effect.glsl>

precision highp float;

const float TAU = 6.28318530718;

uniform vec2 uSize;
// Seconds of ambient time; it stands still while motion is reduced or the window is hidden.
uniform float uTime;
// x: the ring's radius, y: its stroke width, z: the glow's reach, all in logical pixels;
// w: the scan sweep's head as a fraction of a turn, below 0 while no scan runs.
uniform vec4 uRing;
// Fractions of a turn, clockwise from the top: x ends the used space that stays, y ends what can be freed.
uniform vec2 uArcs;
// The lit share's accent: rgb, and in a the glow's strength from 0 to 1.
uniform vec4 uAccent;

out vec4 fragColor;

void main() {
  vec2 offset = FlutterFragCoord().xy - uSize * 0.5;
  float radius = uRing.x;
  float strokeWidth = uRing.y;
  float glowReach = uRing.z;
  float sweepHead = uRing.w;

  float distanceFromCenter = length(offset);
  float turn = fract(atan(offset.x, -offset.y) / TAU);
  float arcPixels = TAU * radius;
  float acrossBand = abs(distanceFromCenter - radius);
  float bandCoverage = clamp(0.5 - (acrossBand - strokeWidth * 0.5), 0.0, 1.0);
  float bandCenterLight = clamp(1.0 - acrossBand / (strokeWidth * 0.5), 0.0, 1.0);

  // The index gap at the top, a few pixels wide whatever the ring's size.
  float indexGap = smoothstep(1.0, 3.5, min(turn, 1.0 - turn) * arcPixels);

  float pixelOfTurn = 1.0 / arcPixels;
  float pastKept = smoothstep(uArcs.x - pixelOfTurn, uArcs.x + pixelOfTurn, turn);
  vec3 usedColor = mix(vec3(0.20, 0.23, 0.31), vec3(0.42, 0.47, 0.58), bandCenterLight);
  vec3 availableColor = mix(vec3(0.06, 0.07, 0.11), vec3(0.12, 0.14, 0.20), bandCenterLight);
  vec3 trackColor = mix(usedColor, availableColor, pastKept);
  float trackCoverage = bandCoverage * indexGap;

  vec3 premultiplied = trackColor * trackCoverage * 0.92;
  float alpha = trackCoverage * 0.92;

  // The lit share is a capsule with round caps, measured in pixels along and across the arc.
  float litWidth = uArcs.y - uArcs.x;
  float litPresent = smoothstep(0.0, 2.0 * pixelOfTurn, litWidth);
  float outsideArc = max(max(uArcs.x - turn, turn - uArcs.y), 0.0);
  float alongOutside = outsideArc * arcPixels;
  float capsuleDistance = length(vec2(alongOutside, acrossBand)) - strokeWidth * 0.5;
  float litCoverage = clamp(0.5 - capsuleDistance, 0.0, 1.0) * litPresent * indexGap;

  vec3 accent = uAccent.rgb;
  float shimmer = 0.85 + 0.15 * sin((turn * 6.0 - uTime * 0.3) * TAU);
  float headLight = exp(-pow((turn - uArcs.y) * arcPixels / (strokeWidth * 0.9), 2.0));
  vec3 litColor = accent * (0.75 + 0.5 * bandCenterLight) * shimmer;
  litColor += vec3(1.0) * pow(bandCenterLight, 6.0) * 0.35;
  litColor += mix(accent, vec3(1.0), 0.5) * headLight * 0.45;
  premultiplied = mix(premultiplied, litColor, litCoverage);
  alpha = mix(alpha, 1.0, litCoverage);

  float glowDistance = max(capsuleDistance, 0.0);
  float glow = exp(-glowDistance / glowReach) * 0.55 + exp(-glowDistance / (glowReach * 0.25)) * 0.35;
  glow *= litPresent * uAccent.a * (0.9 + 0.1 * shimmer) * (1.0 + headLight * 0.6);
  // Light added with less alpha than colour composites as an additive glow.
  premultiplied += accent * glow * 0.8;
  alpha += glow * 0.35;

  float sweepActive = step(0.0, sweepHead);
  float behindHead = fract(sweepHead - turn);
  float comet = exp(-behindHead * 9.0) * sweepActive;
  float cometLight = comet * (bandCoverage * 0.9 + exp(-max(acrossBand - strokeWidth * 0.5, 0.0) / glowReach) * 0.35);
  premultiplied += mix(accent, vec3(1.0), 0.35) * cometLight * indexGap;
  alpha += cometLight * 0.3 * indexGap;

  fragColor = vec4(min(premultiplied, vec3(1.0)), clamp(alpha, 0.0, 1.0));
}
