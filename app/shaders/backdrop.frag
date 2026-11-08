#version 460 core

#include <flutter/runtime_effect.glsl>

precision highp float;

uniform vec2 uSize;
// Seconds of ambient time; it stands still while motion is reduced or the window is hidden.
uniform float uTime;
// The accent of the page in view: rgb, and in a its strength from 0 to 1.
uniform vec4 uAccent;

out vec4 fragColor;

float hashCell(vec2 cell) {
  vec2 scrambled = fract(cell * vec2(123.34, 456.21));
  scrambled += dot(scrambled, scrambled + 45.32);
  return fract(scrambled.x * scrambled.y);
}

float valueNoise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  vec2 eased = local * local * (3.0 - 2.0 * local);
  float bottomLeft = hashCell(cell);
  float bottomRight = hashCell(cell + vec2(1.0, 0.0));
  float topLeft = hashCell(cell + vec2(0.0, 1.0));
  float topRight = hashCell(cell + vec2(1.0, 1.0));
  return mix(mix(bottomLeft, bottomRight, eased.x), mix(topLeft, topRight, eased.x), eased.y);
}

float fractalNoise(vec2 position) {
  float sum = 0.0;
  float amplitude = 0.5;
  vec2 octave = position;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * valueNoise(octave);
    octave = octave * 2.03 + vec2(17.1, 9.2);
    amplitude *= 0.5;
  }
  return sum;
}

// One layer of dust motes on a grid that scrolls upward; most cells stay empty.
float dustLayer(vec2 position, float cellsPerUnit, float riseSpeed, float seed) {
  vec2 grid = position * cellsPerUnit + vec2(0.0, uTime * riseSpeed);
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float chance = hashCell(cell + seed);
  vec2 offset = vec2(hashCell(cell + seed + 1.7), hashCell(cell + seed + 4.3)) - 0.5;
  offset *= 0.7;
  offset.x += sin(uTime * 0.3 + chance * 6.2832) * 0.08;
  float moteRadius = mix(0.018, 0.06, chance * chance);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.5 + chance) + chance * 40.0);
  float present = step(0.74, chance);
  return present * twinkle * smoothstep(moteRadius, 0.0, length(local - offset));
}

void main() {
  vec2 fragCoord = FlutterFragCoord().xy;
  vec2 uv = fragCoord / uSize;
  float aspect = uSize.x / uSize.y;
  vec2 position = vec2(uv.x * aspect, uv.y);

  vec3 color = mix(vec3(0.030, 0.038, 0.078), vec3(0.008, 0.010, 0.024), smoothstep(0.0, 1.0, uv.y));

  vec2 keyLight = vec2(0.78 * aspect, -0.2);
  vec2 fromKeyLight = position - keyLight;
  float keyDistance = length(fromKeyLight);
  color += vec3(0.20, 0.26, 0.46) * exp(-keyDistance * keyDistance * 2.2) * 0.55;

  float shaftAngle = atan(fromKeyLight.x, fromKeyLight.y);
  float shafts = valueNoise(vec2(shaftAngle * 9.0, uTime * 0.05)) * valueNoise(vec2(shaftAngle * 23.0 + 3.0, uTime * 0.03));
  color += vec3(0.30, 0.36, 0.62) * shafts * exp(-keyDistance * 1.6) * 0.24;

  vec2 drift = vec2(uTime * 0.012, -uTime * 0.008);
  float cloud = fractalNoise(position * 1.6 + drift + fractalNoise(position * 2.4 - drift) * 0.9);
  float accentPool = 0.35 + 0.65 * smoothstep(1.3, 0.0, length(position - vec2(0.18 * aspect, 1.05)));
  color += uAccent.rgb * smoothstep(0.35, 0.95, cloud) * accentPool * 0.17 * uAccent.a;
  color += vec3(0.18, 0.12, 0.42) * smoothstep(0.45, 1.0, cloud) * 0.10;

  float dust = dustLayer(position, 18.0, 0.18, 0.0) * 0.6 + dustLayer(position, 34.0, 0.11, 7.0) * 0.35;
  vec3 dustColor = mix(vec3(0.75, 0.82, 1.0), uAccent.rgb, 0.35 * uAccent.a);
  color += dustColor * dust * (0.18 + 0.5 * exp(-keyDistance * 1.2));

  float vignette = smoothstep(1.25, 0.25, length((uv - 0.5) * vec2(aspect * 0.9, 1.0)));
  color *= mix(0.55, 1.0, vignette);

  // Grain also breaks up the banding a dark gradient shows on an 8-bit surface.
  float grain = hashCell(fragCoord + fract(uTime * 7.0) * 100.0) - 0.5;
  color += grain * 0.012;

  fragColor = vec4(color, 1.0);
}
