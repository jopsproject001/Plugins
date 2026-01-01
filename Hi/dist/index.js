export const manifest = {
  id: 'myplugin',
  name: 'My Plugin',
  version: '1.0.1',
  icon: '⚙️'
};

export async function mount(container, host) {
  container.innerHTML = `
    <div style="padding:20px;">
      <h2>${manifest.name}</h2>
      <p>This is my first Personal OS plugin 🎉</p>
      <button id="sayHi">Say hi</button>
    </div>
  `;
  container.querySelector('#sayHi').onclick = () => {
    host.ui.toast('Hello from my plugin!');
  };
}

export function unmount(container) {
  container.innerHTML = '';
}
