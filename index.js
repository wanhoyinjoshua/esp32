const canvas = document.getElementById('canvas');
const graphCanvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');
const graphCtx = graphCanvas.getContext('2d');
const statusBar = document.getElementById('statusBar');
const burstSound = document.getElementById('burstSound');

let balloonColor = '#cc0000'; // default red
let pressure = 0;
let balloonSize = 50;
let timeInRange = 0;
let leakTime = 0;
let goodBreaths = 0;
let leakedBreaths = 0;
let crossedZero = false;
let leaked = false;
let modified = false;
let justStarted = true;
let balloonBurst = false;
let lastTime = performance.now();
let pressureHistory = [];
let breathTarget = 10;

// User settings
let lower_threshold_expand_pressure = 15;
let upper_threshold_expand_pressure = 20;

function leakcompensation(pressure, firstcomp = 2, secondcomp = 4) {
    if(pressure==0)return 0;
    if (pressure <= 10) return pressure + firstcomp;
  return pressure + secondcomp;
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  graphCanvas.width = window.innerWidth;
  graphCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();


function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + 255 * percent));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + 255 * percent));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + 255 * percent));
  return `rgb(${r}, ${g}, ${b})`;
}


function drawBalloon() {
 
 ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (balloonBurst) {
    ctx.fillStyle = 'green';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('CONGRATULATIONS!', canvas.width / 2, canvas.height * 0.2);
    return;
  }

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // Balloon gradient

  const gradient = ctx.createRadialGradient(
      centerX - balloonSize * 0.3,
      centerY - balloonSize * 0.3,
      balloonSize * 0.1,
      centerX,
      centerY,
      balloonSize
    );
  gradient.addColorStop(0, lightenColor(balloonColor, 0.4));


  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, balloonSize * 0.8, balloonSize, 0, 0, Math.PI * 2);
  ctx.fill();

  // Balloon knot
  ctx.fillStyle = '#cc0000';
  ctx.beginPath();
  ctx.moveTo(centerX - 5, centerY + balloonSize);
  ctx.lineTo(centerX + 5, centerY + balloonSize);
  ctx.lineTo(centerX, centerY + balloonSize + 10);
  ctx.closePath();
  ctx.fill();

  // Balloon string
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY + balloonSize + 10);
  ctx.lineTo(centerX, centerY + balloonSize + 50);
  ctx.stroke();

}

function drawGraph() {
  graphCtx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
  graphCtx.strokeStyle = 'blue';
  graphCtx.beginPath();
  pressureHistory.forEach((p, i) => {
    const x = i;
    const y = graphCanvas.height - p;
    if (i === 0) graphCtx.moveTo(x, y);
    else graphCtx.lineTo(x, y);
  });
  graphCtx.stroke();
}

function updateStats() {
  document.getElementById('pressure').textContent = `Pressure: ${Math.round(pressure)} mmHg`;
  document.getElementById('timeInRange').textContent = `Time in range: ${timeInRange.toFixed(2)} s`;
  document.getElementById('leakTime').textContent = `Leak time: ${leakTime.toFixed(2)} s`;
  document.getElementById('goodBreaths').textContent = `Good breaths: ${goodBreaths}`;
  document.getElementById('leakedBreaths').textContent = `Leaked breaths: ${leakedBreaths}`;
  document.getElementById('crossedZero').textContent = `Crossed zero: ${crossedZero}`;
  document.getElementById('leaked').textContent = `Leaked: ${leaked}`;
}

function loop() {
  const now = performance.now();
  const deltaTime = (now - lastTime) / 1000;
  lastTime = now;

  pressureHistory.push(pressure);
  if (pressureHistory.length > graphCanvas.width) pressureHistory.shift();

  if (pressure < 0 && !justStarted) {
    crossedZero = true;
    modified = leaked ? true : false;
  }

  if (!balloonBurst && pressure >= lower_threshold_expand_pressure && pressure <= upper_threshold_expand_pressure) {
    justStarted = false;
    timeInRange += deltaTime;
    leaked = false;
    if (!leaked && crossedZero && !modified) {
      goodBreaths++;
      modified = true;
    }
    balloonSize += deltaTime * 30;
    balloonSize = Math.min(balloonSize, Math.min(canvas.width, canvas.height) * 0.75);
  }

  if (!balloonBurst && pressure >= -2 && pressure <= 2 && !justStarted) {
    leakTime += deltaTime;
    if (leakTime >= 0.5) {
      leaked = true;
      if (!modified) {
        leakedBreaths++;
        modified = true;
      }
      balloonSize -= 50;
      balloonSize = Math.max(balloonSize, 50);
    }
  } else {
    leakTime = 0;
  }

  if (goodBreaths === breathTarget && !balloonBurst) {
    balloonBurst = true;
    burstSound.play();
  }

  drawBalloon();
  drawGraph();
  updateStats();
  requestAnimationFrame(loop);
}
loop();

document.getElementById('connectBtn').addEventListener('click', async () => {
  const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
  const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'BMP085 Sensor' }],
      optionalServices: [SERVICE_UUID]
    });

    statusBar.textContent = `Status: Connecting to ${device.name || 'Unknown device'}...`;

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const value = new TextDecoder().decode(event.target.value);
      pressure = leakcompensation(parseFloat(value));
    });

    document.getElementById('connectBtn').textContent = 'Connected';
    document.getElementById('connectBtn').disabled = true;
    statusBar.textContent = `Status: Connected to ${device.name || 'Unknown device'}`;

    device.addEventListener('gattserverdisconnected', () => {
      statusBar.textContent = 'Status: Disconnected';
      document.getElementById('connectBtn').textContent = 'Reconnect';
      document.getElementById('connectBtn').disabled = false;
    });

  } catch (error) {
    console.error('BLE connection failed:', error);
    statusBar.textContent = 'Status: Connection failed';
    alert('Connection failed. Make sure your ESP32 is powered and advertising.');
  }
});

// Existing variables and setup...

// Event handlers for settings inputs
document.getElementById('targetBreathsInput').addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    // TODO: handle target breath change
  });
  
  document.getElementById('compensationSelect').addEventListener('change', (e) => {
    const value = parseInt(e.target.value, 10);
    // TODO: handle compensation change
  });
  
  document.getElementById('balloonColorPicker').addEventListener('input', (e) => {
   balloonColor = e.target.value;
    // TODO: handle balloon color change
  });
  
  document.getElementById('balloonImageUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    // TODO: handle balloon image upload
  });
  

  
  // Other existing JS logic...

document.getElementById('toggleStatsBtn').addEventListener('click', () => {
  const panel = document.getElementById('statsPanel');
  panel.classList.toggle('collapsed');
  document.getElementById('toggleStatsBtn').textContent =
    panel.classList.contains('collapsed') ? 'Show Stats' : 'Hide Stats';
});

document.getElementById('toggleSettingsBtn').addEventListener('click', () => {
  const panel = document.getElementById('settingsPanel');
  panel.classList.toggle('setting_shown');
  document.getElementById('toggleSettingsBtn').textContent =
    panel.classList.contains('setting_shown') ? 'Hide Settings' : 'Show Settings';
});

document.getElementById('resetBtn').addEventListener('click', () => {
  pressure = 0;
  balloonSize = 50;
  timeInRange = 0;
  leakTime = 0;
  goodBreaths = 0;
  leakedBreaths = 0;
  crossedZero = false;
  leaked = false;
  modified = false;
  justStarted = true;
  balloonBurst = false;
  pressureHistory = [];
  burstSound.pause();
  burstSound.currentTime = 0;
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const csv = [
    ['Time (s)', 'Pressure'],
    ...pressureHistory.map((p, i) => [i, p])
  ].map(row => row.join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pressure_data.csv';
  a.click();
  URL.revokeObjectURL(url);
});
