/**
 * 场景管理模块
 * 负责初始化 Three.js 场景、添加天体模型、处理渲染循环等
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLANETS, MOON, calculatePlanetaryPosition, calculateLunarPosition, formatDate } from './astronomy.js';

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

// 缩放因子，用于将天文单位转换为场景单位
const SCALE_FACTOR = 10; // 1 AU = 10 场景单位
const PLANET_SCALE = 0.001; // 行星大小缩放因子
const SUN_SCALE = 0.0005; // 太阳大小缩放因子
const clock = new THREE.Clock();

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
  // 太阳几何体
  const sunRadius = 696340 * SUN_SCALE; // 太阳半径缩放
  const sunGeometry = new THREE.SphereGeometry(sunRadius, 64, 64);
  
  // 太阳材质（自发光）
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdd00
  });
  
  // 尝试加载纹理
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    '/textures/sun.jpg',
    (texture) => { sunMaterial.map = texture; sunMaterial.needsUpdate = true; },
    undefined,
    () => { console.log('太阳纹理加载失败，使用默认颜色'); }
  );
  
  sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sun.position.set(0, 0, 0);
  scene.add(sun);
  
  // 添加太阳光晕
  const sunGlowGeometry = new THREE.SphereGeometry(sunRadius * 1.2, 32, 32);
  const sunGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 0.3,
    side: THREE.BackSide
  });
  const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
  sun.add(sunGlow);
  
  // 存储天体信息
  celestialBodies.push({
    name: 'Sun',
    chineseName: '太阳',
    mesh: sun,
    radius: sunRadius,
    type: 'star'
  });
}

/**
 * 创建行星
 */
function createPlanets() {
  PLANETS.forEach((planetData, index) => {
    // 行星大小
    const radius = planetData.radius * PLANET_SCALE;
    
    // 几何体
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    
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
      const ringInnerRadius = radius * planetData.ringInnerRadius;
      const ringOuterRadius = radius * planetData.ringOuterRadius;
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
    
    // 创建轨道线
    const orbitPoints = [];
    const semiMajorAxis = planetData.semiMajorAxis * SCALE_FACTOR;
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
    
    // 存储天体信息
    celestialBodies.push({
      name: planetData.name,
      chineseName: planetData.chineseName,
      mesh: planet,
      ring: ring,
      orbit: orbit,
      data: planetData,
      radius: radius,
      type: 'planet'
    });
  });
}

/**
 * 创建月球
 */
function createMoon() {
  const radius = MOON.radius * PLANET_SCALE * 2; // 月球稍微放大一点以便可见
  
  const geometry = new THREE.SphereGeometry(radius, 32, 32);
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
  
  // 存储天体信息
  celestialBodies.push({
    name: 'Moon',
    chineseName: '月球',
    mesh: moon,
    data: MOON,
    radius: radius,
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
      
      // 转换为场景坐标
      const x = positionData.position.x * SCALE_FACTOR;
      const y = positionData.position.z * SCALE_FACTOR; // 交换 y 和 z 以适应 Three.js 坐标系
      const z = positionData.position.y * SCALE_FACTOR;
      
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
    const moonX = lunarPosition.position.x * SCALE_FACTOR * 0.5; // 缩放月球轨道以便可见
    const moonY = lunarPosition.position.z * SCALE_FACTOR * 0.5;
    const moonZ = lunarPosition.position.y * SCALE_FACTOR * 0.5;
    
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
  
  if (starfield) {
    starfield.geometry.dispose();
    starfield.material.dispose();
  }
  
  if (renderer) {
    renderer.dispose();
  }
}
