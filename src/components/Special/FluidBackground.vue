<template>
  <div class="fluid-wrap" ref="wrap">
    <canvas ref="glCanvas" />
    <img
      ref="probeImg"
      :src="src"
      crossorigin="anonymous"
      style="display: none"
      @load="onImageLoad"
    />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** 图片地址 */
    src: string;
    /** 速度 0.2 - 2.0 */
    speed?: number;
    /** 是否暂停 */
    paused?: boolean;
    /** 亮度修正 0.0 - 1.0 */
    brightness?: number;
  }>(),
  {
    speed: 0.5,
    paused: false,
    brightness: 0.1,
  },
);

const glCanvas = ref<HTMLCanvasElement | null>(null);
const probeImg = ref<HTMLImageElement | null>(null);

let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let rafId: number | null = null;
let startTime = performance.now();
let lastTime = 0;
let timeOffset = 0;

// GL Uniform Locations
interface ULocations {
  u_time: WebGLUniformLocation | null;
  u_resolution: WebGLUniformLocation | null;
  u_colors: WebGLUniformLocation | null; // vec3[6]
  u_seed: WebGLUniformLocation | null;
}

const uLocations: ULocations = {
  u_time: null,
  u_resolution: null,
  u_colors: null,
  u_seed: null,
};

// 默认颜色
let currentPalette: number[] = [
  255,
  50,
  50, // Red
  50,
  50,
  255, // Blue
  255,
  255,
  50, // Yellow
  50,
  255,
  255, // Cyan
  255,
  50,
  255, // Magenta
  50,
  255,
  50, // Green
];

// 顶点着色器
const VS = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// 片段着色器
const FS = `
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_colors[6];
uniform float u_seed;

// 简单的伪随机函数
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 平滑噪声
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 分形噪声 (FBM)
float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;

    // 以中心为原点
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float t = u_time * 0.1;

    // 对坐标进行扭曲，产生不规则的边界
    float warpStrength = 0.5;
    float warpFreq = 1.2;

    vec2 warp = vec2(
        fbm(p * warpFreq + t * 0.4 + u_seed),
        fbm(p * warpFreq + t * 0.4 + u_seed + 50.0)
    );

    vec2 warp2 = vec2(
        fbm(p * 0.6 + t * 0.25 + u_seed + 100.0),
        fbm(p * 0.6 + t * 0.25 + u_seed + 150.0)
    );

    vec2 warpedP = p + (warp - 0.5) * warpStrength + (warp2 - 0.5) * 0.3;

    // 6 个色块，使用噪声驱动的随机漂移
    vec2 centers[6];

    // 统一的运动幅度
    float radius = 0.32;

    // 使用噪声函数生成平滑随机的位置
    // 每个点有独立的噪声种子，但运动速度一致
    float noiseSpeed = t * 0.4;

    // 点0
    centers[0] = vec2(
        (noise(vec2(noiseSpeed, 0.0)) - 0.5) * 2.0 * radius,
        (noise(vec2(noiseSpeed, 10.0)) - 0.5) * 2.0 * radius
    );
    // 点1
    centers[1] = vec2(
        (noise(vec2(noiseSpeed, 20.0)) - 0.5) * 2.0 * radius,
        (noise(vec2(noiseSpeed, 30.0)) - 0.5) * 2.0 * radius
    );
    // 点2
    centers[2] = vec2(
        (noise(vec2(noiseSpeed, 40.0)) - 0.5) * 2.0 * radius,
        (noise(vec2(noiseSpeed, 50.0)) - 0.5) * 2.0 * radius
    );
    // 点3
    centers[3] = vec2(
        (noise(vec2(noiseSpeed, 60.0)) - 0.5) * 2.0 * radius,
        (noise(vec2(noiseSpeed, 70.0)) - 0.5) * 2.0 * radius
    );
    // 点4
    centers[4] = vec2(
        (noise(vec2(noiseSpeed, 80.0)) - 0.5) * 2.0 * radius,
        (noise(vec2(noiseSpeed, 90.0)) - 0.5) * 2.0 * radius
    );
    // 点5
    centers[5] = vec2(
        (noise(vec2(noiseSpeed, 100.0)) - 0.5) * 2.0 * radius,
        (noise(vec2(noiseSpeed, 110.0)) - 0.5) * 2.0 * radius
    );

    // Voronoi: 用扭曲后的坐标找最近的中心点
    float minDist = 999.0;
    int closestIdx = 0;

    for (int i = 0; i < 6; i++) {
        float d = length(warpedP - centers[i]);
        if (d < minDist) {
            minDist = d;
            closestIdx = i;
        }
    }

    // 直接使用最近点的颜色
    vec3 finalColor = u_colors[0];
    for (int i = 0; i < 6; i++) {
        if (i == closestIdx) {
            finalColor = u_colors[i];
        }
    }

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

const compileShader = (gl: WebGLRenderingContext, src: string, type: number) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (gl: WebGLRenderingContext, vsSrc: string, fsSrc: string) => {
  const vs = compileShader(gl, vsSrc, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fsSrc, gl.FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
};

const initGL = () => {
  const canvas = glCanvas.value;
  if (!canvas) return;

  // 尝试获取 webgl 上下文，处理兼容性
  gl =
    canvas.getContext("webgl") ||
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext);
  if (!gl) return;

  program = createProgram(gl, VS, FS);
  if (!program) return;

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const aPos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  uLocations.u_time = gl.getUniformLocation(program, "u_time");
  uLocations.u_resolution = gl.getUniformLocation(program, "u_resolution");
  uLocations.u_colors = gl.getUniformLocation(program, "u_colors");
  uLocations.u_seed = gl.getUniformLocation(program, "u_seed");
};

const render = (time: number) => {
  if (!gl || !program || !glCanvas.value) return;

  const canvas = glCanvas.value;
  // 降低分辨率以提高性能和获得更柔和的效果
  const dpr = window.devicePixelRatio || 1;
  // 可以适当降低渲染分辨率，例如除以2
  const displayWidth = Math.floor(canvas.clientWidth * dpr);
  const displayHeight = Math.floor(canvas.clientHeight * dpr);

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    gl.viewport(0, 0, displayWidth, displayHeight);
  }

  if (!props.paused) {
    lastTime = (time - startTime) / 1000 + timeOffset;
  } else {
    startTime = time - (lastTime - timeOffset) * 1000;
  }

  gl.uniform1f(uLocations.u_time!, lastTime * props.speed);
  gl.uniform2f(uLocations.u_resolution!, canvas.width, canvas.height);
  gl.uniform1f(uLocations.u_seed!, 1.0);

  const floatColors: number[] = [];
  for (let i = 0; i < currentPalette.length; i++) {
    floatColors[i] = currentPalette[i] / 255.0;
  }
  while (floatColors.length < 18) {
    floatColors.push(0, 0, 0);
  }
  gl.uniform3fv(uLocations.u_colors!, new Float32Array(floatColors));

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  rafId = requestAnimationFrame(render);
};

// 颜色提取算法 (基于 Canvas)
const extractColors = (img: HTMLImageElement) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 使用较小的尺寸进行采样
  const w = 50;
  const h = 50;
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h).data;
  const colors: number[] = [];

  // 6个采样中心点 (x, y) 归一化坐标
  const centers = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.5, y: 0.5 },
    { x: 0.2, y: 0.8 },
    { x: 0.8, y: 0.8 },
    { x: 0.5, y: 0.2 },
  ];

  centers.forEach((center) => {
    const cx = Math.floor(center.x * w);
    const cy = Math.floor(center.y * h);
    // 取周围 10x10 区域平均值
    let r = 0,
      g = 0,
      b = 0,
      count = 0;
    for (let i = -5; i < 5; i++) {
      for (let j = -5; j < 5; j++) {
        const x = Math.min(Math.max(cx + i, 0), w - 1);
        const y = Math.min(Math.max(cy + j, 0), h - 1);
        const idx = (y * w + x) * 4;
        r += imgData[idx];
        g += imgData[idx + 1];
        b += imgData[idx + 2];
        count++;
      }
    }
    // 平均值
    let rr = r / count;
    let gg = g / count;
    let bb = b / count;

    // 增强饱和度与亮度
    // const max = Math.max(rr, gg, bb);
    // const min = Math.min(rr, gg, bb);
    // const delta = max - min;
    // const l = (max + min) / 2;

    const sat = 1.6; // 饱和度倍数
    const gray = 0.299 * rr + 0.587 * gg + 0.114 * bb;

    rr = gray + (rr - gray) * sat;
    gg = gray + (gg - gray) * sat;
    bb = gray + (bb - gray) * sat;

    // 亮度增强
    rr += props.brightness * 255;
    gg += props.brightness * 255;
    bb += props.brightness * 255;

    colors.push(
      Math.min(255, Math.max(0, rr)),
      Math.min(255, Math.max(0, gg)),
      Math.min(255, Math.max(0, bb)),
    );
  });

  currentPalette = colors;
};

const onImageLoad = () => {
  if (probeImg.value) {
    if (probeImg.value.complete) {
      extractColors(probeImg.value);
    } else {
      probeImg.value.onload = () => extractColors(probeImg.value!);
    }
  }
};

watch(
  () => props.src,
  (val) => {
    if (probeImg.value) {
      probeImg.value.src = val;
    }
  },
);

onMounted(() => {
  initGL();
  if (probeImg.value && probeImg.value.complete && probeImg.value.src) {
    extractColors(probeImg.value);
  }
  rafId = requestAnimationFrame(render);
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  gl = null;
});
</script>

<style scoped lang="scss">
.fluid-wrap {
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    filter: blur(40px) contrast(1.2) brightness(0.6);
    transform: scale(1.2);
  }
}
</style>
