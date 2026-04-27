/**
 * 主入口文件
 * 整合所有模块，处理 UI 交互
 */

import { initScene, setTime, getTime, play, pause, reverse, isPlayingState, isReversingState, setTimeScale } from './scene.js';
import { formatDate, julianDay, dateFromJulianDay, searchAstronomicalEvents } from './astronomy.js';

// 应用状态
let currentTime = new Date();
let events = [];

// 时间范围（用于时间滑块）
const TIME_RANGE_YEARS = 50; // 从当前时间前后各 50 年
const startDate = new Date();
startDate.setFullYear(startDate.getFullYear() - TIME_RANGE_YEARS);

const endDate = new Date();
endDate.setFullYear(endDate.getFullYear() + TIME_RANGE_YEARS);

const startJd = julianDay(startDate);
const endJd = julianDay(endDate);
const totalRange = endJd - startJd;

// DOM 元素
let canvasContainer;
let timeSlider;
let currentTimeDisplay;
let playPauseBtn;
let reverseBtn;
let resetTimeBtn;
let speedSlider;
let speedValue;
let eventsContainer;
let helpBtn;
let helpPanel;
let helpCloseBtn;

/**
 * 初始化应用
 */
function init() {
  // 获取 DOM 元素
  canvasContainer = document.getElementById('canvas-container');
  timeSlider = document.getElementById('time-slider');
  currentTimeDisplay = document.getElementById('current-time');
  playPauseBtn = document.getElementById('play-pause');
  reverseBtn = document.getElementById('reverse');
  resetTimeBtn = document.getElementById('reset-time');
  speedSlider = document.getElementById('speed-slider');
  speedValue = document.getElementById('speed-value');
  eventsContainer = document.getElementById('events');
  helpBtn = document.getElementById('help-btn');
  helpPanel = document.getElementById('help-panel');
  helpCloseBtn = document.getElementById('help-close');
  
  // 初始化场景
  initScene(canvasContainer);
  
  // 设置初始时间
  currentTime = new Date();
  setTime(currentTime);
  updateTimeDisplay();
  
  // 搜索天文事件
  searchEvents();
  
  // 绑定事件监听
  bindEvents();
  
  // 设置时间更新回调
  window.onTimeUpdate = (time) => {
    currentTime = time;
    updateTimeDisplay();
    updateTimeSliderFromTime();
    checkNearbyEvents();
  };
}

/**
 * 搜索天文事件
 */
function searchEvents() {
  try {
    events = searchAstronomicalEvents(startJd, endJd, 1);
    displayEvents();
  } catch (error) {
    console.error('搜索天文事件失败:', error);
  }
}

/**
 * 显示事件列表
 */
function displayEvents() {
  if (!eventsContainer) return;
  
  eventsContainer.innerHTML = '';
  
  if (events.length === 0) {
    eventsContainer.innerHTML = '<p style="color: #888; font-size: 12px;">暂无天文事件</p>';
    return;
  }
  
  // 只显示最近和即将发生的事件
  const nowJd = julianDay(new Date());
  const sortedEvents = [...events].sort((a, b) => {
    const distA = Math.abs(a.julianDay - nowJd);
    const distB = Math.abs(b.julianDay - nowJd);
    return distA - distB;
  });
  
  const displayCount = Math.min(sortedEvents.length, 10);
  
  for (let i = 0; i < displayCount; i++) {
    const event = sortedEvents[i];
    const eventElement = createEventElement(event);
    eventsContainer.appendChild(eventElement);
  }
}

/**
 * 创建事件元素
 * @param {Object} event - 事件对象
 * @returns {HTMLElement} 事件 DOM 元素
 */
function createEventElement(event) {
  const element = document.createElement('div');
  element.className = `event-item ${event.type}`;
  
  let description = event.typeName;
  if (event.type === 'planetary-alignment' && event.planets) {
    description += ` (${event.planets.join(', ')})`;
  }
  
  element.innerHTML = `
    <div class="type">${description}</div>
    <div class="time">${formatDate(event.date)}</div>
  `;
  
  element.addEventListener('click', () => {
    jumpToEvent(event);
  });
  
  return element;
}

/**
 * 跳转到指定事件
 * @param {Object} event - 事件对象
 */
function jumpToEvent(event) {
  currentTime = event.date;
  setTime(currentTime);
  updateTimeDisplay();
  updateTimeSliderFromTime();
}

/**
 * 检查附近的事件
 */
function checkNearbyEvents() {
  const currentJd = julianDay(currentTime);
  const threshold = 1; // 1 天内
  
  const nearbyEvent = events.find(event => 
    Math.abs(event.julianDay - currentJd) < threshold
  );
  
  if (nearbyEvent) {
    // 可以在这里添加高亮效果
    console.log('附近有天文事件:', nearbyEvent.typeName);
  }
}

/**
 * 更新时间显示
 */
function updateTimeDisplay() {
  if (currentTimeDisplay) {
    currentTimeDisplay.textContent = formatDate(currentTime);
  }
}

/**
 * 从时间更新滑块
 */
function updateTimeSliderFromTime() {
  if (!timeSlider) return;
  
  const currentJd = julianDay(currentTime);
  const position = ((currentJd - startJd) / totalRange) * 100;
  timeSlider.value = Math.max(0, Math.min(100, position));
}

/**
 * 从滑块更新时间
 * @param {number} value - 滑块值 (0-100)
 */
function updateTimeFromSlider(value) {
  const jd = startJd + (value / 100) * totalRange;
  currentTime = dateFromJulianDay(jd);
  setTime(currentTime);
  updateTimeDisplay();
  checkNearbyEvents();
}

/**
 * 绑定事件监听
 */
function bindEvents() {
  // 时间滑块
  if (timeSlider) {
    timeSlider.addEventListener('input', (e) => {
      const isPlaying = isPlayingState();
      if (isPlaying) {
        pause();
        updatePlayPauseButton();
      }
      updateTimeFromSlider(parseFloat(e.target.value));
    });
  }
  
  // 播放/暂停按钮
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      if (isPlayingState()) {
        pause();
      } else {
        play();
      }
      updatePlayPauseButton();
    });
  }
  
  // 倒放按钮
  if (reverseBtn) {
    reverseBtn.addEventListener('click', () => {
      reverse();
      updatePlayPauseButton();
    });
  }
  
  // 重置时间按钮
  if (resetTimeBtn) {
    resetTimeBtn.addEventListener('click', () => {
      currentTime = new Date();
      setTime(currentTime);
      updateTimeDisplay();
      updateTimeSliderFromTime();
    });
  }
  
  // 速度滑块
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      const scale = Math.pow(10, value);
      setTimeScale(scale);
      updateSpeedDisplay(value);
    });
  }
  
  // 帮助按钮
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      if (helpPanel) {
        helpPanel.style.display = 'block';
      }
    });
  }
  
  // 关闭帮助按钮
  if (helpCloseBtn) {
    helpCloseBtn.addEventListener('click', () => {
      if (helpPanel) {
        helpPanel.style.display = 'none';
      }
    });
  }
  
  // 点击帮助面板外部关闭
  if (helpPanel) {
    helpPanel.addEventListener('click', (e) => {
      if (e.target === helpPanel) {
        helpPanel.style.display = 'none';
      }
    });
  }
  
  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (isPlayingState()) {
          pause();
        } else {
          play();
        }
        updatePlayPauseButton();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        reverse();
        updatePlayPauseButton();
        break;
      case 'ArrowRight':
        e.preventDefault();
        play();
        updatePlayPauseButton();
        break;
      case 'r':
      case 'R':
        currentTime = new Date();
        setTime(currentTime);
        updateTimeDisplay();
        updateTimeSliderFromTime();
        break;
    }
  });
}

/**
 * 更新播放/暂停按钮状态
 */
function updatePlayPauseButton() {
  if (!playPauseBtn || !reverseBtn) return;
  
  const isPlaying = isPlayingState();
  const isReversing = isReversingState();
  
  if (!isPlaying) {
    playPauseBtn.textContent = '播放';
    playPauseBtn.classList.remove('active');
    reverseBtn.classList.remove('active');
  } else {
    if (isReversing) {
      playPauseBtn.textContent = '暂停';
      playPauseBtn.classList.add('active');
      reverseBtn.classList.add('active');
    } else {
      playPauseBtn.textContent = '暂停';
      playPauseBtn.classList.add('active');
      reverseBtn.classList.remove('active');
    }
  }
}

/**
 * 更新速度显示
 * @param {number} sliderValue - 滑块值 (-5 到 5)
 */
function updateSpeedDisplay(sliderValue) {
  if (!speedValue) return;
  
  const scale = Math.pow(10, sliderValue);
  let displayText;
  
  if (scale >= 1) {
    displayText = `${scale}x`;
  } else {
    displayText = `1/${Math.round(1/scale)}x`;
  }
  
  speedValue.textContent = displayText;
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', init);
