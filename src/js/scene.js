/**
 * 场景管理模块
 * 负责初始化 Three.js 场景、添加天体模型、处理渲染循环等
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLANETS, MOON, SUN, AU_IN_KM, calculatePlanetaryPosition, calculateLunarPosition, formatDate } from './astronomy.js';

// 场景相关的变量
let scene, camera, renderer, controls;
let celestialBodies = [];
let sun, moon;
let starfield;
let currentTime = new Date();
let timeScale = 1; // 时间缩放因子
let isPlaying = true;
let isReversing = false;
let animationFrameId = null;

// 探测器相关变量
let probes = [];
let probeTrails = [];
const TRAIL_MAX_POINTS = 500; // 轨迹最大点数

// 缩放体系设计：
// 1. 轨道缩放 (ORBIT_SCALE): 控制行星轨道距离
// 2. 视觉缩放 (VISUAL_*): 控制天体显示大小（与轨道解耦）
// 3. 物理缩放: 基于真实质量比例，用于引力计算

const ORBIT_SCALE = 10; // 1 AU = 10 场景单位（轨道距离缩放）

// 视觉缩放因子 - 让天体看起来足够大但又合理
// 与轨道缩放完全解耦
const VISUAL_BASE_SCALE = 0.15; // 基础视觉缩放（地球基准大小）
const VISUAL_SUN_MULTIPLIER = 2.0; // 太阳额外放大倍数
const VISUAL_GIANT_PLANET_MULTIPLIER = 1.5; // 巨行星额外放大倍数

// 物理/引力计算常数
// 使用相对质量（以地球质量为 1 单位）
// 保持真实质量比例：太阳质量是地球的约 333,000 倍
const GRAVITY_CONSTANT = 30; // 地球引力基准（调优值）
// 太阳引力 = 30 * 333000 = 约 10,000,000（太大，需要调整）

// 实际上我们需要让引力在视觉上合理，所以：
// 太阳引力应该是主要的，木星其次，其他行星微弱
const SUN_GRAVITY_MULTIPLIER = 1000; // 太阳引力额外放大（让太阳引力主导）
const JUPITER_GRAVITY_MULTIPLIER = 50; // 木星引力放大
const OTHER_PLANET_MULTIPLIER = 5; // 其他行星引力

const clock = new THREE.Clock();

/**
 * 计算天体的视觉半径（用于显示）
 * 视觉缩放与轨道缩放解耦，让天体看起来合理
 * @param {number} realRadius - 真实半径（公里）
 * @param {string} type - 天体类型 ('star', 'planet')
 * @param {string} name - 天体名称
 * @returns {number} 视觉半径（场景单位）
 */
function calculateVisualRadius(realRadius, type, name) {
  // 以地球半径为基准
  const earthRadius = 6371;
  const relativeRadius = realRadius / earthRadius;
  
  // 使用平方根缩放，让大小差异更明显但不过分
  let visualRadius = Math.sqrt(relativeRadius) * VISUAL_BASE_SCALE;
  
  // 额外调整
  if (type === 'star') {
    visualRadius *= VISUAL_SUN_MULTIPLIER;
  } else if (['Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(name)) {
    visualRadius *= VISUAL_GIANT_PLANET_MULTIPLIER;
  }
  
  return visualRadius;
}

/**
 * 计算天体的物理半径（用于碰撞检测和引力影响范围）
 * 基于视觉半径，但根据质量进行调整，保持与轨道缩放的合理比例
 * @param {number} realRadius - 真实半径（公里）
 * @param {number} mass - 真实质量（千克）
 * @param {number} visualRadius - 视觉半径（参考值）
 * @returns {number} 物理半径（场景单位）
 */
function calculatePhysicsRadius(realRadius, mass, visualRadius) {
  // 碰撞半径应该：
  // 1. 与视觉半径相关（让探测器看起来确实"撞到"了天体）
  // 2. 与质量相关（质量越大，影响范围越大）
  
  const earthMass = 5.972e24;
  const relativeMass = mass / earthMass;
  
  // 使用质量的对数缩放来调整碰撞半径
  // 质量越大，碰撞半径相对于视觉半径的放大倍数越大
  const massMultiplier = 1 + Math.log10(relativeMass + 1) * 0.3;
  
  // 基础碰撞半径 = 视觉半径 × 质量因子
  // 这样：
  // - 小天体：碰撞半径接近视觉半径
  // - 大天体（如木星）：碰撞半径比视觉半径大
  // - 太阳：碰撞半径最大
  let physicsRadius = visualRadius * massMultiplier;
  
  // 确保最小碰撞半径
  physicsRadius = Math.max(physicsRadius, 0.3);
  
  return physicsRadius;
}

/**
 * 计算相对质量（以地球为 1 单位）
 * @param {number} mass - 真实质量（千克）
 * @returns {number} 相对质量
 */
function calculateRelativeMass(mass) {
  const earthMass = 5.972e24;
  return mass / earthMass;
}

/**
 * 计算天体的引力质量参数（用于引力计算）
 * 保持真实质量比例，同时调整为视觉上合理的数值
 * @param {number} mass - 真实质量（千克）
 * @param {string} name - 天体名称
 * @returns {number} 引力质量参数
 */
function calculateGravityMass(mass, name) {
  // 以地球质量为基准的相对质量
  const earthMass = 5.972e24;
  const relativeToEarth = mass / earthMass;
  
  // 基础引力参数
  let gravityMass = relativeToEarth * GRAVITY_CONSTANT;
  
  // 根据天体类型应用额外的调整因子
  // 保持真实质量比例的同时，让效果更合理
  if (name === 'Sun') {
    // 太阳质量是地球的 333,000 倍
    // 我们用一个因子来让太阳引力主导
    // 但不直接用 333,000 倍（会太强）
    const sunRelative = 333000; // 太阳/地球 真实质量比
    // 使用对数缩放让效果更合理
    gravityMass = GRAVITY_CONSTANT * Math.log10(sunRelative) * SUN_GRAVITY_MULTIPLIER;
  } else if (name === 'Jupiter') {
    // 木星质量是地球的 318 倍
    const jupiterRelative = 318;
    gravityMass = GRAVITY_CONSTANT * Math.log10(jupiterRelative + 1) * JUPITER_GRAVITY_MULTIPLIER;
  } else if (['Saturn', 'Neptune', 'Uranus'].includes(name)) {
    // 其他巨行星
    // 土星: 95x, 海王星: 17x, 天王星: 14.5x
    gravityMass = GRAVITY_CONSTANT * Math.log10(relativeToEarth + 1) * OTHER_PLANET_MULTIPLIER * 2;
  } else {
    // 类地行星（水星、金星、地球、火星、月球）
    // 使用相对质量，但缩放为适合的值
    gravityMass = GRAVITY_CONSTANT * Math.log10(relativeToEarth + 1) * OTHER_PLANET_MULTIPLIER;
  }
  
  return gravityMass;
}

/**
 * 初始化 Three.js 场景
 * @param {HTMLElement} container - 容器元素
 */
export function initScene(container) {
  // 创建场景
  scene = new THREE.Scene();
  
  // 创建相机
  const aspect = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
  camera.position.set(0, 30, 60);
  
  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  
  // 创建轨道控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 10;
  controls.maxDistance = 500;
  
  // 创建星空背景
  createStarfield();
  
  // 创建太阳
  createSun();
  
  // 创建行星
  createPlanets();
  
  // 创建月球
  createMoon();
  
  // 添加光源
  addLights();
  
  // 窗口大小变化事件
  window.addEventListener('resize', onWindowResize);
  
  // 开始渲染循环
  animate();
}

/**
 * 创建星空背景
 */
function createStarfield() {
  const starsGeometry = new THREE.BufferGeometry();
  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.5,
    transparent: true,
    opacity: 0.8
  });
  
  const starsVertices = [];
  const starCount = 10000;
  
  for (let i = 0; i < starCount; i++) {
    // 在球形区域内随机生成星星位置
    const radius = 200 + Math.random() * 300;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    
    starsVertices.push(x, y, z);
  }
  
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
  starfield = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starfield);
}

/**
 * 创建太阳
 */
function createSun() {
  // 计算视觉半径（用于显示）
  const visualRadius = calculateVisualRadius(SUN.radius, 'star', 'Sun');
  
  // 计算物理半径（用于碰撞检测）
  const physicsRadius = calculatePhysicsRadius(SUN.radius, SUN.mass, visualRadius);
  
  // 计算引力质量（用于引力计算）
  const gravityMass = calculateGravityMass(SUN.mass, 'Sun');
  
  // 太阳几何体 - 使用视觉半径
  const sunGeometry = new THREE.SphereGeometry(visualRadius, 64, 64);
  
  // 太阳材质（自发光）
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: SUN.color
  });
  
  // 尝试加载纹理
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    `/textures/${SUN.texture}`,
    (texture) => { sunMaterial.map = texture; sunMaterial.needsUpdate = true; },
    undefined,
    () => { console.log('太阳纹理加载失败，使用默认颜色'); }
  );
  
  sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sun.position.set(0, 0, 0);
  scene.add(sun);
  
  // 添加太阳光晕
  const sunGlowGeometry = new THREE.SphereGeometry(visualRadius * 1.5, 32, 32);
  const sunGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.3,
    side: THREE.BackSide
  });
  const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
  sun.add(sunGlow);
  
  // 存储天体信息 - 包含所有缩放相关的数据
  celestialBodies.push({
    name: SUN.name,
    chineseName: SUN.chineseName,
    mesh: sun,
    visualRadius: visualRadius,    // 视觉显示半径
    physicsRadius: physicsRadius,  // 物理/碰撞半径
    gravityMass: gravityMass,      // 引力计算质量参数
    realRadius: SUN.radius,        // 真实半径（公里）
    realMass: SUN.mass,            // 真实质量（千克）
    type: 'star'
  });
}

/**
 * 创建行星
 */
function createPlanets() {
  PLANETS.forEach((planetData, index) => {
    // 计算视觉半径（用于显示）
    const visualRadius = calculateVisualRadius(planetData.radius, 'planet', planetData.name);
    
    // 计算物理半径（用于碰撞检测）
    const physicsRadius = calculatePhysicsRadius(planetData.radius, planetData.mass, visualRadius);
    
    // 计算引力质量（用于引力计算）
    const gravityMass = calculateGravityMass(planetData.mass, planetData.name);
    
    // 几何体 - 使用视觉半径
    const geometry = new THREE.SphereGeometry(visualRadius, 32, 32);
    
    // 材质
    const material = new THREE.MeshStandardMaterial({
      color: planetData.color,
      roughness: 0.7,
      metalness: 0.1
    });
    
    // 尝试加载纹理
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      `/textures/${planetData.texture}`,
      (texture) => { material.map = texture; material.needsUpdate = true; },
      undefined,
      () => { console.log(`${planetData.name} 纹理加载失败，使用默认颜色`); }
    );
    
    const planet = new THREE.Mesh(geometry, material);
    planet.castShadow = true;
    planet.receiveShadow = true;
    
    scene.add(planet);
    
    // 为土星添加环
    let ring = null;
    if (planetData.hasRing) {
      const ringInnerRadius = visualRadius * planetData.ringInnerRadius;
      const ringOuterRadius = visualRadius * planetData.ringOuterRadius;
      const ringGeometry = new THREE.RingGeometry(ringInnerRadius, ringOuterRadius, 64);
      const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0xece0c5,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      
      // 尝试加载环纹理
      const ringTextureLoader = new THREE.TextureLoader();
      ringTextureLoader.load(
        `/textures/${planetData.ringTexture}`,
        (texture) => { ringMaterial.map = texture; ringMaterial.needsUpdate = true; },
        undefined,
        () => { console.log('土星光环纹理加载失败，使用默认颜色'); }
      );
      
      ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      planet.add(ring);
    }
    
    // 创建轨道线 - 使用轨道缩放
    const orbitPoints = [];
    const semiMajorAxis = planetData.semiMajorAxis * ORBIT_SCALE;
    const eccentricity = planetData.eccentricity;
    
    // 绘制椭圆轨道
    for (let i = 0; i <= 360; i += 1) {
      const angle = i * Math.PI / 180;
      const r = semiMajorAxis * (1 - eccentricity * eccentricity) / (1 + eccentricity * Math.cos(angle));
      orbitPoints.push(new THREE.Vector3(
        r * Math.cos(angle),
        0,
        r * Math.sin(angle)
      ));
    }
    
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMaterial = new THREE.LineBasicMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.5
    });
    const orbit = new THREE.Line(orbitGeometry, orbitMaterial);
    scene.add(orbit);
    
    // 存储天体信息 - 包含所有缩放相关的数据
    celestialBodies.push({
      name: planetData.name,
      chineseName: planetData.chineseName,
      mesh: planet,
      ring: ring,
      orbit: orbit,
      data: planetData,
      visualRadius: visualRadius,    // 视觉显示半径
      physicsRadius: physicsRadius,  // 物理/碰撞半径
      gravityMass: gravityMass,      // 引力计算质量参数
      realRadius: planetData.radius, // 真实半径（公里）
      realMass: planetData.mass,     // 真实质量（千克）
      type: 'planet'
    });
  });
}

/**
 * 创建月球
 */
function createMoon() {
  // 计算视觉半径（用于显示）
  // 月球比地球小，使用类似的视觉缩放
  const visualRadius = calculateVisualRadius(MOON.radius, 'planet', 'Moon') * 1.5;
  
  // 计算物理半径（用于碰撞检测）
  const physicsRadius = calculatePhysicsRadius(MOON.radius, MOON.mass, visualRadius);
  
  // 计算引力质量（用于引力计算）
  const gravityMass = calculateGravityMass(MOON.mass, 'Moon');
  
  const geometry = new THREE.SphereGeometry(visualRadius, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: MOON.color,
    roughness: 0.9,
    metalness: 0.05
  });
  
  // 尝试加载纹理
  const moonTextureLoader = new THREE.TextureLoader();
  moonTextureLoader.load(
    `/textures/${MOON.texture}`,
    (texture) => { material.map = texture; material.needsUpdate = true; },
    undefined,
    () => { console.log('月球纹理加载失败，使用默认颜色'); }
  );
  
  moon = new THREE.Mesh(geometry, material);
  moon.castShadow = true;
  moon.receiveShadow = true;
  
  scene.add(moon);
  
  // 存储天体信息 - 包含所有缩放相关的数据
  celestialBodies.push({
    name: 'Moon',
    chineseName: '月球',
    mesh: moon,
    data: MOON,
    visualRadius: visualRadius,    // 视觉显示半径
    physicsRadius: physicsRadius,  // 物理/碰撞半径
    gravityMass: gravityMass,      // 引力计算质量参数
    realRadius: MOON.radius,       // 真实半径（公里）
    realMass: MOON.mass,           // 真实质量（千克）
    type: 'moon'
  });
}

/**
 * 添加光源
 */
function addLights() {
  // 点光源（太阳光）
  const sunLight = new THREE.PointLight(0xffffff, 1.5, 500);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);
  
  // 环境光（微弱）
  const ambientLight = new THREE.AmbientLight(0x222222);
  scene.add(ambientLight);
}

/**
 * 窗口大小变化处理
 */
function onWindowResize() {
  const container = renderer.domElement.parentElement;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

/**
 * 更新天体位置
 * @param {Date} time - 时间点
 */
function updateCelestialPositions(time) {
  currentTime = time;
  
  // 更新行星位置
  celestialBodies.forEach(body => {
    if (body.type === 'planet') {
      const positionData = calculatePlanetaryPosition(body.data, time);
      
      // 转换为场景坐标 - 使用轨道缩放
      const x = positionData.position.x * ORBIT_SCALE;
      const y = positionData.position.z * ORBIT_SCALE; // 交换 y 和 z 以适应 Three.js 坐标系
      const z = positionData.position.y * ORBIT_SCALE;
      
      body.mesh.position.set(x, y, z);
      
      // 自转角
      body.mesh.rotation.y = positionData.rotationAngle;
    }
  });
  
  // 更新月球位置
  const earthBody = celestialBodies.find(b => b.name === 'Earth');
  if (earthBody && moon) {
    const lunarPosition = calculateLunarPosition(time);
    
    // 月球相对于地球的位置
    // 月球轨道用公里表示，需要转换为场景单位
    // AU_IN_KM 公里 = ORBIT_SCALE 场景单位
    // 所以：1 公里 = ORBIT_SCALE / AU_IN_KM 场景单位
    const kmToSceneUnit = ORBIT_SCALE / AU_IN_KM;
    const moonOrbitScale = 1000; // 额外放大月球轨道以便可见
    
    const moonX = lunarPosition.position.x * kmToSceneUnit * moonOrbitScale;
    const moonY = lunarPosition.position.z * kmToSceneUnit * moonOrbitScale;
    const moonZ = lunarPosition.position.y * kmToSceneUnit * moonOrbitScale;
    
    // 月球位置 = 地球位置 + 相对位置
    moon.position.set(
      earthBody.mesh.position.x + moonX,
      earthBody.mesh.position.y + moonY,
      earthBody.mesh.position.z + moonZ
    );
    
    // 月球自转（潮汐锁定，始终同一面朝向地球）
    moon.rotation.y = lunarPosition.trueLongitude * Math.PI / 180;
  }
  
  // 太阳自转
  if (sun) {
    const days = (time - new Date(2000, 0, 1)) / (1000 * 60 * 60 * 24);
    sun.rotation.y = (days / 25) * 2 * Math.PI; // 太阳自转周期约 25 天
  }
}

/**
 * 渲染循环
 */
function animate() {
  animationFrameId = requestAnimationFrame(animate);
  
  const deltaSeconds = clock.getDelta(); // 距上一帧的真实时间（秒）
  
  // 更新时间
  if (isPlaying) {
    const direction = isReversing ? -1 : 1;
    // timeScale 天/秒 × deltaSeconds 秒 = 模拟天数，再 × 86400000 转换为毫秒
    const timeChange = direction * timeScale * deltaSeconds * 86400 * 1000;
    
    currentTime = new Date(currentTime.getTime() + timeChange);
    updateCelestialPositions(currentTime);
    
    // 触发时间更新事件
    if (window.onTimeUpdate) {
      window.onTimeUpdate(currentTime);
    }
  }
  
  // 更新探测器物理（独立于天文时间，始终运行）
  // 使用一个独立的时间因子，让探测器飞行速度看起来合理
  const probeTimeFactor = 2.0; // 探测器模拟速度因子
  updateProbes(deltaSeconds * probeTimeFactor);
  
  controls.update();
  renderer.render(scene, camera);
}

/**
 * 设置当前时间
 * @param {Date} time - 时间点
 */
export function setTime(time) {
  currentTime = time;
  updateCelestialPositions(time);
}

/**
 * 获取当前时间
 * @returns {Date} 当前时间
 */
export function getTime() {
  return currentTime;
}

/**
 * 开始播放
 */
export function play() {
  isPlaying = true;
  isReversing = false;
}

/**
 * 暂停
 */
export function pause() {
  isPlaying = false;
}

/**
 * 倒放
 */
export function reverse() {
  isPlaying = true;
  isReversing = true;
}

/**
 * 检查是否正在播放
 * @returns {boolean} 是否正在播放
 */
export function isPlayingState() {
  return isPlaying;
}

/**
 * 检查是否正在倒放
 * @returns {boolean} 是否正在倒放
 */
export function isReversingState() {
  return isReversing;
}

/**
 * 设置时间缩放因子
 * @param {number} scale - 时间缩放因子
 */
export function setTimeScale(scale) {
  timeScale = scale;
}

/**
 * 获取时间缩放因子
 * @returns {number} 时间缩放因子
 */
export function getTimeScale() {
  return timeScale;
}

/**
 * 获取所有天体
 * @returns {Array} 天体数组
 */
export function getCelestialBodies() {
  return celestialBodies;
}

/**
 * 清理场景资源
 */
export function dispose() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  window.removeEventListener('resize', onWindowResize);
  
  // 释放几何体和材质
  celestialBodies.forEach(body => {
    if (body.mesh) {
      body.mesh.geometry.dispose();
      if (body.mesh.material) {
        if (Array.isArray(body.mesh.material)) {
          body.mesh.material.forEach(m => m.dispose());
        } else {
          body.mesh.material.dispose();
        }
      }
    }
    if (body.ring) {
      body.ring.geometry.dispose();
      body.ring.material.dispose();
    }
    if (body.orbit) {
      body.orbit.geometry.dispose();
      body.orbit.material.dispose();
    }
  });
  
  // 清理探测器
  probes.forEach(probe => {
    if (probe.mesh) {
      probe.mesh.geometry.dispose();
      probe.mesh.material.dispose();
    }
  });
  probes = [];
  
  // 清理轨迹线
  probeTrails.forEach(trail => {
    if (trail.line) {
      trail.line.geometry.dispose();
      trail.line.material.dispose();
    }
  });
  probeTrails = [];
  
  if (starfield) {
    starfield.geometry.dispose();
    starfield.material.dispose();
  }
  
  if (renderer) {
    renderer.dispose();
  }
}

/**
 * 创建探测器模型
 * @param {THREE.Vector3} position - 初始位置
 * @param {THREE.Color} color - 探测器颜色
 * @returns {THREE.Mesh} 探测器模型
 */
function createProbeMesh(position, color = 0x00ffff) {
  // 创建探测器几何体（小的四面体或球体）
  const geometry = new THREE.SphereGeometry(0.15, 8, 8);
  const material = new THREE.MeshBasicMaterial({
    color: color,
    emissive: color
  });
  
  const probe = new THREE.Mesh(geometry, material);
  probe.position.copy(position);
  
  // 添加发光效果
  const glowGeometry = new THREE.SphereGeometry(0.25, 8, 8);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.4
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  probe.add(glow);
  
  return probe;
}

/**
 * 创建轨迹线
 * @param {THREE.Vector3} initialPosition - 初始位置
 * @param {THREE.Color} color - 轨迹线颜色
 * @returns {Object} 包含轨迹线和点数组的对象
 */
function createTrail(initialPosition, color = 0x00ffff) {
  const geometry = new THREE.BufferGeometry();
  const points = [initialPosition.clone()];
  
  const positions = new Float32Array(TRAIL_MAX_POINTS * 3);
  positions[0] = initialPosition.x;
  positions[1] = initialPosition.y;
  positions[2] = initialPosition.z;
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 1);
  
  const material = new THREE.LineBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.8
  });
  
  const line = new THREE.Line(geometry, material);
  
  return {
    line: line,
    points: points,
    color: color
  };
}

/**
 * 计算天体对探测器的引力加速度
 * 使用真实质量比例计算
 * @param {THREE.Vector3} probePosition - 探测器位置（场景单位）
 * @returns {THREE.Vector3} 加速度向量（场景单位/模拟秒^2）
 */
function calculateGravitationalAcceleration(probePosition) {
  const acceleration = new THREE.Vector3(0, 0, 0);
  
  celestialBodies.forEach(body => {
    if (body.type === 'star' || body.type === 'planet' || body.type === 'moon') {
      // 跳过没有引力质量的天体
      if (!body.gravityMass || body.gravityMass <= 0) return;
      
      // 获取天体位置
      const bodyPosition = body.mesh.position.clone();
      
      // 计算从探测器指向天体的向量
      const direction = new THREE.Vector3().subVectors(bodyPosition, probePosition);
      const distance = direction.length();
      
      // 最小距离限制（避免天体表面附近引力过大）
      const minDistance = Math.max(body.physicsRadius || 0.1, 0.5);
      
      if (distance > minDistance) {
        // 使用预计算的 gravityMass（保持真实质量比例）
        // 计算加速度大小：a = GM / r²
        const accelerationMagnitude = body.gravityMass / (distance * distance);
        
        // 归一化方向并乘以加速度大小
        direction.normalize();
        direction.multiplyScalar(accelerationMagnitude);
        
        acceleration.add(direction);
      }
    }
  });
  
  return acceleration;
}

/**
 * 发射一个新的探测器
 * 从地球位置向相机方向发射
 */
export function launchProbe() {
  // 找到地球
  const earthBody = celestialBodies.find(b => b.name === 'Earth');
  if (!earthBody) {
    console.warn('未找到地球，无法发射探测器');
    return;
  }
  
  // 从地球附近发射
  const launchPosition = earthBody.mesh.position.clone();
  
  // 计算发射方向（从地球指向相机方向的垂直方向）
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  cameraDirection.normalize();
  
  // 计算垂直于相机方向的发射方向（模拟轨道发射）
  const up = new THREE.Vector3(0, 1, 0);
  const launchDirection = new THREE.Vector3();
  launchDirection.crossVectors(cameraDirection, up).normalize();
  
  // 如果叉积结果为零向量（相机方向与上方向平行），使用备用方向
  if (launchDirection.length() < 0.1) {
    launchDirection.set(1, 0, 0);
  }
  
  // 从地球表面稍高位置发射（使用视觉半径）
  const earthRadius = earthBody.visualRadius;
  launchPosition.add(launchDirection.clone().multiplyScalar(earthRadius * 3));
  
  // 创建探测器（每个探测器用不同的颜色）
  const colors = [0x00ffff, 0xff00ff, 0xffff00, 0x00ff00, 0xff6600];
  const colorIndex = probes.length % colors.length;
  const color = colors[colorIndex];
  
  const probeMesh = createProbeMesh(launchPosition, color);
  scene.add(probeMesh);
  
  // 创建轨迹线
  const trail = createTrail(launchPosition, color);
  scene.add(trail.line);
  probeTrails.push(trail);
  
  // 初始速度（相对于地球的切线方向）
  const initialSpeed = 0.8; // 场景单位/模拟秒
  const velocity = launchDirection.clone().multiplyScalar(initialSpeed);
  
  // 添加到探测器数组
  const probe = {
    mesh: probeMesh,
    position: launchPosition.clone(),
    velocity: velocity,
    trailIndex: probeTrails.length - 1,
    active: true,
    lifetime: 0
  };
  
  probes.push(probe);
  
  console.log('探测器已发射！当前探测器数量:', probes.length);
}

/**
 * 更新所有探测器的位置和物理
 * @param {number} deltaSeconds - 时间步长（秒）
 */
function updateProbes(deltaSeconds) {
  if (probes.length === 0) return;
  
  // 时间步长（使用更小的步长以获得更稳定的物理模拟）
  const dt = Math.min(deltaSeconds, 0.1);
  
  for (let i = probes.length - 1; i >= 0; i--) {
    const probe = probes[i];
    
    if (!probe.active) continue;
    
    // 计算引力加速度
    const acceleration = calculateGravitationalAcceleration(probe.position);
    
    // 更新速度：v = v0 + a * dt
    probe.velocity.add(acceleration.clone().multiplyScalar(dt));
    
    // 更新位置：p = p0 + v * dt
    const positionChange = probe.velocity.clone().multiplyScalar(dt);
    probe.position.add(positionChange);
    
    // 更新 mesh 位置
    probe.mesh.position.copy(probe.position);
    
    // 让探测器朝向运动方向
    if (probe.velocity.length() > 0.01) {
      const lookAtPosition = probe.position.clone().add(probe.velocity);
      probe.mesh.lookAt(lookAtPosition);
    }
    
    // 更新轨迹线
    const trail = probeTrails[probe.trailIndex];
    if (trail) {
      // 添加新点
      trail.points.push(probe.position.clone());
      
      // 限制轨迹点数
      if (trail.points.length > TRAIL_MAX_POINTS) {
        trail.points.shift();
      }
      
      // 更新几何体
      const positions = trail.line.geometry.attributes.position.array;
      const pointCount = trail.points.length;
      
      for (let j = 0; j < pointCount; j++) {
        positions[j * 3] = trail.points[j].x;
        positions[j * 3 + 1] = trail.points[j].y;
        positions[j * 3 + 2] = trail.points[j].z;
      }
      
      trail.line.geometry.attributes.position.needsUpdate = true;
      trail.line.geometry.setDrawRange(0, pointCount);
    }
    
    // 更新生命周期
    probe.lifetime += dt;
    
    // 检查是否飞出太远（超过太阳系范围）
    const maxDistance = 500; // 场景单位
    if (probe.position.length() > maxDistance) {
      // 标记为非活动状态，不立即移除，让轨迹保留一段时间
      probe.active = false;
      console.log('探测器已飞出太阳系范围');
    }
    
    // 检查与天体碰撞 - 使用物理半径
    celestialBodies.forEach(body => {
      if (body.type === 'star' || body.type === 'planet' || body.type === 'moon') {
        const distance = probe.position.distanceTo(body.mesh.position);
        // 使用物理半径，添加一点额外余量
        const collisionRadius = body.physicsRadius || body.visualRadius || 0.5;
        
        if (distance < collisionRadius) {
          probe.active = false;
          console.log(`探测器与 ${body.chineseName} 碰撞`);
        }
      }
    });
  }
  
  // 清理非活动的探测器（保留一段时间后再移除）
  // 这里暂时不立即移除，让轨迹可以看到
}
