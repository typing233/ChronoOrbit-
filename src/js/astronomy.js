/**
 * 天文计算模块
 * 提供基于开普勒轨道参数的行星位置计算，以及天文事件检测
 */

// 天文常数
const J2000 = 2451545.0; // J2000 儒略日
const AU = 149597870.7; // 天文单位（公里）
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const SECONDS_PER_DAY = 86400;
const EARTH_ORBITAL_PERIOD = 365.256363004; // 地球恒星年（天）

// 行星轨道参数（相对于 J2000.0）
// 数据来源：NASA 行星事实表
export const PLANETS = [
  {
    name: 'Mercury',
    chineseName: '水星',
    radius: 2439.7, // 公里
    orbitalPeriod: 87.9691, // 恒星日
    rotationPeriod: 58.6462, // 恒星日
    semiMajorAxis: 0.38709893, // AU
    eccentricity: 0.20563069,
    inclination: 7.00487, // 度
    longitudeOfAscendingNode: 48.33167, // 度
    longitudeOfPerihelion: 77.45645, // 度
    meanLongitudeAtEpoch: 252.25084, // 度
    color: 0xb5b5b5,
    texture: 'mercury.jpg'
  },
  {
    name: 'Venus',
    chineseName: '金星',
    radius: 6051.8,
    orbitalPeriod: 224.70069,
    rotationPeriod: -243.0187, // 负号表示逆向自转
    semiMajorAxis: 0.72333199,
    eccentricity: 0.00677323,
    inclination: 3.39471,
    longitudeOfAscendingNode: 76.68069,
    longitudeOfPerihelion: 131.53298,
    meanLongitudeAtEpoch: 181.97973,
    color: 0xffc649,
    texture: 'venus.jpg'
  },
  {
    name: 'Earth',
    chineseName: '地球',
    radius: 6371.0,
    orbitalPeriod: 365.256363004,
    rotationPeriod: 0.99726968, // 恒星日
    semiMajorAxis: 1.00000011,
    eccentricity: 0.01671022,
    inclination: 0.00005,
    longitudeOfAscendingNode: -11.26064,
    longitudeOfPerihelion: 102.94719,
    meanLongitudeAtEpoch: 100.46435,
    color: 0x6b93d6,
    texture: 'earth.jpg'
  },
  {
    name: 'Mars',
    chineseName: '火星',
    radius: 3389.5,
    orbitalPeriod: 686.97959,
    rotationPeriod: 1.02595675,
    semiMajorAxis: 1.52366231,
    eccentricity: 0.09341233,
    inclination: 1.85061,
    longitudeOfAscendingNode: 49.57854,
    longitudeOfPerihelion: 336.04084,
    meanLongitudeAtEpoch: 355.45332,
    color: 0xc1440e,
    texture: 'mars.jpg'
  },
  {
    name: 'Jupiter',
    chineseName: '木星',
    radius: 69911.0,
    orbitalPeriod: 4332.59,
    rotationPeriod: 0.41354,
    semiMajorAxis: 5.202603209,
    eccentricity: 0.04839266,
    inclination: 1.30530,
    longitudeOfAscendingNode: 100.55615,
    longitudeOfPerihelion: 14.75385,
    meanLongitudeAtEpoch: 34.40438,
    color: 0xd8ca9d,
    texture: 'jupiter.jpg'
  },
  {
    name: 'Saturn',
    chineseName: '土星',
    radius: 58232.0,
    orbitalPeriod: 10759.22,
    rotationPeriod: 0.44401,
    semiMajorAxis: 9.554909192,
    eccentricity: 0.05415060,
    inclination: 2.48446,
    longitudeOfAscendingNode: 113.71504,
    longitudeOfPerihelion: 92.43194,
    meanLongitudeAtEpoch: 49.94432,
    color: 0xece0c5,
    texture: 'saturn.jpg',
    hasRing: true,
    ringInnerRadius: 1.1,
    ringOuterRadius: 1.9,
    ringTexture: 'saturn-ring.jpg'
  },
  {
    name: 'Uranus',
    chineseName: '天王星',
    radius: 25362.0,
    orbitalPeriod: 30688.5,
    rotationPeriod: -0.71833, // 逆向自转
    semiMajorAxis: 19.218446061,
    eccentricity: 0.04716771,
    inclination: 0.76986,
    longitudeOfAscendingNode: 74.22988,
    longitudeOfPerihelion: 170.96424,
    meanLongitudeAtEpoch: 313.23218,
    color: 0xd1e7e7,
    texture: 'uranus.jpg'
  },
  {
    name: 'Neptune',
    chineseName: '海王星',
    radius: 24622.0,
    orbitalPeriod: 60182.0,
    rotationPeriod: 0.67125,
    semiMajorAxis: 30.110386869,
    eccentricity: 0.00858587,
    inclination: 1.76917,
    longitudeOfAscendingNode: 131.72169,
    longitudeOfPerihelion: 44.97135,
    meanLongitudeAtEpoch: 304.88003,
    color: 0x5b5ddf,
    texture: 'neptune.jpg'
  }
];

// 月球参数（简化模型）
export const MOON = {
  name: 'Moon',
  chineseName: '月球',
  radius: 1737.1, // 公里
  orbitalPeriod: 27.321661, // 恒星月（天）
  synodicPeriod: 29.530589, // 朔望月（天）
  rotationPeriod: 27.321661, // 潮汐锁定
  semiMajorAxis: 384400, // 公里
  eccentricity: 0.0549,
  inclination: 5.145, // 相对于黄道
  color: 0xaaaaaa,
  texture: 'moon.jpg'
};

/**
 * 计算儒略日
 * @param {Date} date - JavaScript Date 对象
 * @returns {number} 儒略日
 */
export function julianDay(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate() + 
              date.getUTCHours() / 24 + 
              date.getUTCMinutes() / 1440 + 
              date.getUTCSeconds() / 86400;

  let a = Math.floor((14 - month) / 12);
  let y = year + 4800 - a;
  let m = month + 12 * a - 3;

  let jdn = day + 
            Math.floor((153 * m + 2) / 5) + 
            365 * y + 
            Math.floor(y / 4) - 
            Math.floor(y / 100) + 
            Math.floor(y / 400) - 
            32045;

  return jdn;
}

/**
 * 从儒略日转换为 Date 对象
 * @param {number} jd - 儒略日
 * @returns {Date} JavaScript Date 对象
 */
export function dateFromJulianDay(jd) {
  let jdFloor = Math.floor(jd + 0.5);
  let f = (jd + 0.5) - jdFloor;

  if (jdFloor < 2299161) {
    // 儒略历
    var a = jdFloor;
  } else {
    // 格里高利历
    let alpha = Math.floor((jdFloor - 1867216.25) / 36524.25);
    a = jdFloor + 1 + alpha - Math.floor(alpha / 4);
  }

  let b = a + 1524;
  let c = Math.floor((b - 122.1) / 365.25);
  let d = Math.floor(365.25 * c);
  let e = Math.floor((b - d) / 30.6001);

  let day = b - d - Math.floor(30.6001 * e) + f;
  let month = e < 14 ? e - 1 : e - 13;
  let year = month > 2 ? c - 4716 : c - 4715;

  // 提取时间部分
  let dayFraction = day - Math.floor(day);
  let hours = Math.floor(dayFraction * 24);
  let minutes = Math.floor((dayFraction * 24 - hours) * 60);
  let seconds = Math.floor(((dayFraction * 24 - hours) * 60 - minutes) * 60);

  let date = new Date(Date.UTC(year, month - 1, Math.floor(day), hours, minutes, seconds));
  return date;
}

/**
 * 计算自 J2000 以来的儒略世纪数
 * @param {number} jd - 儒略日
 * @returns {number} 儒略世纪数
 */
export function julianCenturies(jd) {
  return (jd - J2000) / 36525.0;
}

/**
 * 计算平近点角
 * @param {number} t - 儒略世纪数
 * @param {Object} planet - 行星轨道参数
 * @returns {number} 平近点角（弧度）
 */
function meanAnomaly(t, planet) {
  // 简化模型：使用平均运动和 J2000 时刻的平经度
  const n = 360.0 / planet.orbitalPeriod; // 平均运动（度/天）
  const days = t * 36525.0;
  const M = (planet.meanLongitudeAtEpoch - planet.longitudeOfPerihelion + n * days) % 360;
  return (M < 0 ? M + 360 : M) * DEG_TO_RAD;
}

/**
 * 用牛顿-拉夫逊法求解偏近点角（开普勒方程）
 * @param {number} M - 平近点角（弧度）
 * @param {number} e - 偏心率
 * @param {number} tol - 容差
 * @returns {number} 偏近点角（弧度）
 */
function eccentricAnomaly(M, e, tol = 1e-8) {
  let E = M;
  let delta = 1;
  let iterations = 0;
  
  while (Math.abs(delta) > tol && iterations < 100) {
    delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    iterations++;
  }
  
  return E;
}

/**
 * 计算真近点角
 * @param {number} E - 偏近点角（弧度）
 * @param {number} e - 偏心率
 * @returns {number} 真近点角（弧度）
 */
function trueAnomaly(E, e) {
  let nu;
  if (e < 0.8) {
    nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
  } else {
    // 对于高偏心率轨道使用更稳定的公式
    const beta = e / (1 + Math.sqrt(1 - e * e));
    nu = E + 2 * Math.atan(beta * Math.sin(E) / (1 - beta * Math.cos(E)));
  }
  return nu;
}

/**
 * 计算行星在轨道平面内的位置（以太阳为原点）
 * @param {number} nu - 真近点角（弧度）
 * @param {number} a - 半长轴
 * @param {number} e - 偏心率
 * @returns {Object} 包含 x, y 坐标的对象
 */
function orbitalPosition(nu, a, e) {
  const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
  const x = r * Math.cos(nu);
  const y = r * Math.sin(nu);
  return { x, y, r };
}

/**
 * 将轨道平面坐标转换为黄道坐标
 * @param {Object} pos - 轨道平面坐标 { x, y }
 * @param {number} Omega - 升交点黄经（弧度）
 * @param {number} i - 轨道倾角（弧度）
 * @param {number} omega - 近地点幅角（弧度）
 * @returns {Object} 黄道坐标 { x, y, z }
 */
function eclipticCoordinates(pos, Omega, i, omega) {
  // 近地点幅角 = 近日点黄经 - 升交点黄经
  const argPeriapsis = omega - Omega;
  
  // 旋转矩阵：先绕 z 轴旋转 argPeriapsis，再绕 x 轴旋转 i，再绕 z 轴旋转 Omega
  const cosArgPeri = Math.cos(argPeriapsis);
  const sinArgPeri = Math.sin(argPeriapsis);
  const cosIncl = Math.cos(i);
  const sinIncl = Math.sin(i);
  const cosOmega = Math.cos(Omega);
  const sinOmega = Math.sin(Omega);
  
  // 第一步：在轨道平面内旋转 argPeriapsis
  let x1 = pos.x * cosArgPeri - pos.y * sinArgPeri;
  let y1 = pos.x * sinArgPeri + pos.y * cosArgPeri;
  let z1 = 0;
  
  // 第二步：绕 x 轴旋转 i（轨道倾角）
  let x2 = x1;
  let y2 = y1 * cosIncl - z1 * sinIncl;
  let z2 = y1 * sinIncl + z1 * cosIncl;
  
  // 第三步：绕 z 轴旋转 Omega（升交点黄经）
  let x = x2 * cosOmega - y2 * sinOmega;
  let y = x2 * sinOmega + y2 * cosOmega;
  let z = z2;
  
  return { x, y, z };
}

/**
 * 计算行星在指定时间的位置（相对于太阳）
 * @param {Object} planet - 行星轨道参数
 * @param {Date|number} time - 时间点，可以是 Date 对象或儒略日
 * @returns {Object} 包含位置、速度等信息的对象
 */
export function calculatePlanetaryPosition(planet, time) {
  let jd;
  if (time instanceof Date) {
    jd = julianDay(time);
  } else {
    jd = time;
  }
  
  const t = julianCenturies(jd);
  
  // 计算平近点角
  const M = meanAnomaly(t, planet);
  
  // 求解偏近点角
  const E = eccentricAnomaly(M, planet.eccentricity);
  
  // 计算真近点角
  const nu = trueAnomaly(E, planet.eccentricity);
  
  // 计算轨道平面内的位置
  const orbitalPos = orbitalPosition(nu, planet.semiMajorAxis, planet.eccentricity);
  
  // 转换角度为弧度
  const Omega = planet.longitudeOfAscendingNode * DEG_TO_RAD;
  const i = planet.inclination * DEG_TO_RAD;
  const omega = planet.longitudeOfPerihelion * DEG_TO_RAD;
  
  // 转换为黄道坐标
  const eclipticPos = eclipticCoordinates(orbitalPos, Omega, i, omega);
  
  // 计算自转角（基于自转周期）
  const days = (jd - J2000);
  const rotations = days / Math.abs(planet.rotationPeriod);
  const rotationAngle = (rotations % 1) * 2 * Math.PI;
  
  return {
    position: eclipticPos, // 黄道坐标，单位：AU
    distance: orbitalPos.r, // 到太阳的距离，单位：AU
    trueAnomaly: nu,
    eccentricAnomaly: E,
    meanAnomaly: M,
    rotationAngle: rotationAngle,
    julianDay: jd
  };
}

/**
 * 计算月球在指定时间的位置（相对于地球）
 * @param {Date|number} time - 时间点
 * @returns {Object} 月球位置信息
 */
export function calculateLunarPosition(time) {
  let jd;
  if (time instanceof Date) {
    jd = julianDay(time);
  } else {
    jd = time;
  }
  
  // 简化的月球轨道计算
  // 这里使用简化模型，实际月球轨道非常复杂
  
  const t = (jd - J2000) / 36525.0; // 儒略世纪数
  
  // 月球的平经度（简化）
  const L = (218.31617 + 481267.88134236 * t - 
             0.0013268 * t * t + t * t * t / 538841 - 
             t * t * t * t / 65194000) % 360;
  
  // 平近点角
  const M = (134.96292 + 477198.86750554 * t + 
             0.0087246 * t * t + t * t * t / 69699 - 
             t * t * t * t / 14712000) % 360;
  
  // 平交点月
  const F = (93.27283 + 483202.01873896 * t - 
             0.0035420 * t * t - t * t * t / 3526000 + 
             t * t * t * t / 863310000) % 360;
  
  // 简化的距离计算（公里）
  const distance = 384400 * (1 + 0.0549 * Math.cos(M * DEG_TO_RAD));
  
  // 简化的位置计算（相对于地球，单位：AU）
  const auDistance = distance / AU;
  
  // 计算相对于地球的位置（简化模型，假设在黄道平面内）
  const angle = L * DEG_TO_RAD;
  
  // 考虑月球轨道倾角（5.145 度）
  const inclination = 5.145 * DEG_TO_RAD;
  const z = auDistance * Math.sin(F * DEG_TO_RAD) * Math.sin(inclination);
  const rInPlane = auDistance * Math.cos(F * DEG_TO_RAD * Math.sin(inclination) * 0); // 简化
  
  return {
    position: {
      x: auDistance * Math.cos(angle),
      y: auDistance * Math.sin(angle),
      z: z * 0.1 // 简化，降低z分量以保持可见性
    },
    distance: auDistance,
    trueLongitude: L,
    trueAnomaly: M,
    julianDay: jd
  };
}

/**
 * 计算两个天体之间的角距离（从地球视角）
 * @param {Object} pos1 - 天体1位置 { x, y, z }
 * @param {Object} pos2 - 天体2位置 { x, y, z }
 * @returns {number} 角距离（度）
 */
function angularDistance(pos1, pos2) {
  // 计算两个向量的点积
  const dot = pos1.x * pos2.x + pos1.y * pos2.y + pos1.z * pos2.z;
  const mag1 = Math.sqrt(pos1.x * pos1.x + pos1.y * pos1.y + pos1.z * pos1.z);
  const mag2 = Math.sqrt(pos2.x * pos2.x + pos2.y * pos2.y + pos2.z * pos2.z);
  
  if (mag1 === 0 || mag2 === 0) return 0;
  
  const cosAngle = dot / (mag1 * mag2);
  // 限制在 [-1, 1] 范围内
  const clamped = Math.max(-1, Math.min(1, cosAngle));
  return Math.acos(clamped) * RAD_TO_DEG;
}

/**
 * 计算月球的相位角
 * @param {number} jd - 儒略日
 * @returns {number} 相位角（度），0 = 新月，180 = 满月
 */
export function lunarPhase(jd) {
  // 简化的相位计算
  // 相位角 = 月球平经度 - 太阳平经度
  
  const t = (jd - J2000) / 36525.0;
  
  // 太阳平经度
  const sunLongitude = (280.46646 + 36000.76983 * t + 0.0003032 * t * t) % 360;
  
  // 月球平经度
  const moonLongitude = (218.31617 + 481267.88134236 * t) % 360;
  
  let phase = (moonLongitude - sunLongitude) % 360;
  if (phase < 0) phase += 360;
  
  return phase;
}

/**
 * 检测日食
 * @param {number} jd - 儒略日
 * @returns {Object|null} 如果检测到日食，返回事件对象，否则返回 null
 */
export function detectSolarEclipse(jd) {
  // 简化的日食检测
  // 日食发生条件：
  // 1. 新月（相位接近 0 度）
  // 2. 月球在黄道附近（升交点或降交点附近）
  // 3. 视直径条件（简化）
  
  const phase = lunarPhase(jd);
  const t = (jd - J2000) / 36525.0;
  
  // 月球平交点月
  const F = (93.27283 + 483202.01873896 * t) % 360;
  
  // 检查是否接近新月（相位在 0 或 360 附近）
  const isNewMoon = Math.abs(phase) < 10 || Math.abs(phase - 360) < 10;
  
  // 检查是否在交点附近（F 接近 0 或 180 度）
  const isNearNode = (Math.abs(F) < 15 || Math.abs(F - 180) < 15 || 
                      Math.abs(F - 360) < 15);
  
  if (isNewMoon && isNearNode) {
    return {
      type: 'solar-eclipse',
      typeName: '日食',
      julianDay: jd,
      date: dateFromJulianDay(jd),
      description: '月球运行到太阳和地球之间，遮挡部分或全部太阳光'
    };
  }
  
  return null;
}

/**
 * 检测月食
 * @param {number} jd - 儒略日
 * @returns {Object|null} 如果检测到月食，返回事件对象，否则返回 null
 */
export function detectLunarEclipse(jd) {
  // 简化的月食检测
  // 月食发生条件：
  // 1. 满月（相位接近 180 度）
  // 2. 月球在黄道附近（升交点或降交点附近）
  
  const phase = lunarPhase(jd);
  const t = (jd - J2000) / 36525.0;
  
  // 月球平交点月
  const F = (93.27283 + 483202.01873896 * t) % 360;
  
  // 检查是否接近满月（相位接近 180 度）
  const isFullMoon = Math.abs(phase - 180) < 10;
  
  // 检查是否在交点附近
  const isNearNode = (Math.abs(F) < 15 || Math.abs(F - 180) < 15 || 
                      Math.abs(F - 360) < 15);
  
  if (isFullMoon && isNearNode) {
    return {
      type: 'lunar-eclipse',
      typeName: '月食',
      julianDay: jd,
      date: dateFromJulianDay(jd),
      description: '地球运行到太阳和月球之间，遮挡照射到月球的太阳光'
    };
  }
  
  return null;
}

/**
 * 检测行星连珠
 * @param {number} jd - 儒略日
 * @param {number} threshold - 角距离阈值（度）
 * @returns {Object|null} 如果检测到行星连珠，返回事件对象，否则返回 null
 */
export function detectPlanetaryAlignment(jd, threshold = 15) {
  // 简化的行星连珠检测
  // 检查从地球视角看，多个行星是否在相近的方向上
  
  // 计算所有行星在指定时间的位置
  const planetaryPositions = PLANETS.map(planet => ({
    name: planet.name,
    chineseName: planet.chineseName,
    ...calculatePlanetaryPosition(planet, jd)
  }));
  
  // 从地球视角计算各行星的方向
  // 简化：直接使用行星相对于太阳的位置
  // 更准确的方法应该计算从地球看各行星的黄经
  
  const earthPos = planetaryPositions.find(p => p.name === 'Earth');
  
  if (!earthPos) return null;
  
  // 计算各行星相对于地球的位置
  const relativePositions = planetaryPositions
    .filter(p => p.name !== 'Earth')
    .map(p => ({
      name: p.name,
      chineseName: p.chineseName,
      position: {
        x: p.position.x - earthPos.position.x,
        y: p.position.y - earthPos.position.y,
        z: p.position.z - earthPos.position.z
      }
    }));
  
  // 检查是否有足够多的行星在相近方向上
  // 简化方法：计算所有行星两两之间的角距离，看是否有一群行星聚集
  
  const planetNames = relativePositions.map(p => p.name);
  const alignmentThreshold = threshold; // 度
  let maxAligned = 1;
  let alignedPlanets = [];
  
  // 对于每个行星，计算有多少其他行星在它附近
  for (let i = 0; i < relativePositions.length; i++) {
    const current = relativePositions[i];
    const nearbyPlanets = [current.chineseName];
    
    for (let j = 0; j < relativePositions.length; j++) {
      if (i === j) continue;
      
      const other = relativePositions[j];
      const dist = angularDistance(current.position, other.position);
      
      if (dist < alignmentThreshold) {
        nearbyPlanets.push(other.chineseName);
      }
    }
    
    if (nearbyPlanets.length > maxAligned) {
      maxAligned = nearbyPlanets.length;
      alignedPlanets = nearbyPlanets;
    }
  }
  
  // 如果有 3 个或更多行星在相近方向上，认为是连珠
  if (maxAligned >= 3) {
    return {
      type: 'planetary-alignment',
      typeName: '行星连珠',
      julianDay: jd,
      date: dateFromJulianDay(jd),
      description: `${maxAligned}颗行星在天空中相近的方向上排列`,
      planets: alignedPlanets,
      count: maxAligned
    };
  }
  
  return null;
}

/**
 * 在指定时间范围内搜索天文事件
 * @param {number} startJd - 开始儒略日
 * @param {number} endJd - 结束儒略日
 * @param {number} step - 搜索步长（天）
 * @returns {Array} 事件数组
 */
export function searchAstronomicalEvents(startJd, endJd, step = 1) {
  const events = [];
  const minStep = Math.min(step, 1); // 至少每天检查一次
  
  for (let jd = startJd; jd <= endJd; jd += minStep) {
    // 检查日食
    const solarEclipse = detectSolarEclipse(jd);
    if (solarEclipse) {
      // 避免重复记录（检查是否已经有非常接近的事件）
      const existing = events.find(e => 
        e.type === 'solar-eclipse' && Math.abs(e.julianDay - jd) < 30
      );
      if (!existing) {
        events.push(solarEclipse);
      }
    }
    
    // 检查月食
    const lunarEclipse = detectLunarEclipse(jd);
    if (lunarEclipse) {
      const existing = events.find(e => 
        e.type === 'lunar-eclipse' && Math.abs(e.julianDay - jd) < 30
      );
      if (!existing) {
        events.push(lunarEclipse);
      }
    }
    
    // 检查行星连珠（减少检查频率，因为比较少见）
    if ((jd - startJd) % 7 === 0) { // 每周检查一次
      const alignment = detectPlanetaryAlignment(jd);
      if (alignment) {
        const existing = events.find(e => 
          e.type === 'planetary-alignment' && Math.abs(e.julianDay - jd) < 30
        );
        if (!existing) {
          events.push(alignment);
        }
      }
    }
  }
  
  // 按时间排序
  events.sort((a, b) => a.julianDay - b.julianDay);
  
  return events;
}

/**
 * 格式化日期为可读字符串
 * @param {Date} date - JavaScript Date 对象
 * @returns {string} 格式化的日期字符串
 */
export function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}
