export const manifest = {
  id: 'calculator',
  name: 'Calculator',
  version: '1.0.0',
  icon: '🧮'
};

export async function mount(container, host) {
  container.innerHTML = `
    <div style="max-width:360px;">
      <input id="disp" placeholder="0" style="width:100%; padding:14px; font-size:22px; border-radius:12px; border:1px solid rgba(255,255,255,0.1); background:#0c0f1d; color:#fff; margin-bottom:10px;" />
      <div id="keys" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;"></div>
    </div>
  `;
  const keys = ['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+','C','⌫','(',')'];
  const grid = container.querySelector('#keys');
  const disp = container.querySelector('#disp');
  keys.forEach(k => {
    const b = document.createElement('button');
    b.textContent = k;
    b.className = 'ghost';
    b.style.padding = '12px';
    b.style.fontSize = '16px';
    b.addEventListener('click', () => {
      if (k === '=') {
        try {
          // Basic, not for untrusted input; demo purposes only.
          const val = Function(`"use strict"; return (${disp.value})`)();
          disp.value = String(val);
        } catch { host.ui.toast('Invalid expression'); }
      } else if (k === 'C') {
        disp.value = '';
      } else if (k === '⌫') {
        disp.value = disp.value.slice(0, -1);
      } else {
        disp.value += k;
      }
    });
    grid.appendChild(b);
  });
}

export function unmount(container) { container.innerHTML = ''; }

