import { t } from '../i18n';
import { PRODUCTS } from '../game/shop';
import type { AnalyticsParams, ProductId, Services } from './types';

/**
 * Pretend ads, checkout and analytics for the web build: a panel over the game with a short countdown
 * instead of an ad, a confirm/cancel panel instead of Google Play, and a log instead of Firebase.
 */

/** Analytics events of this session, newest last (?debug=1 exposes it as __dm.events). */
export const eventLog: { event: string; params?: AnalyticsParams }[] = [];

const FAKE_AD_SECONDS = 3;
/** Non-consumables "bought" on this browser, so restore purchases has something to find. */
const FAKE_STORE_KEY = 'dead-march.fakestore';

function readFakeStore(): ProductId[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(FAKE_STORE_KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? (list.filter((id) => typeof id === 'string') as ProductId[]) : [];
  } catch {
    return [];
  }
}

function writeFakeStore(ids: ProductId[]): void {
  try {
    window.localStorage.setItem(FAKE_STORE_KEY, JSON.stringify(ids));
  } catch {
    // storage disabled: restore just finds nothing
  }
}

interface Panel {
  root: HTMLDivElement;
  text: HTMLDivElement;
  buttons: HTMLDivElement;
  close: () => void;
}

/**
 * Full-screen panel over the canvas. Phaser also listens for touches on the whole window, so the
 * panel cancels them (Phaser skips cancelled events) and its buttons react to pointerup instead.
 */
function panel(title: string): Panel {
  const root = document.createElement('div');
  root.dataset.fake = 'panel';
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '20',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    padding: '24px',
    background: 'rgba(6, 8, 10, 0.94)',
    color: '#f2f5ef',
    font: 'bold 22px system-ui, sans-serif',
    textAlign: 'center',
  } satisfies Partial<CSSStyleDeclaration>);
  for (const type of ['touchstart', 'touchend', 'mousedown', 'mouseup']) {
    root.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.fontSize = '28px';
  heading.style.color = '#ffd27a';
  const text = document.createElement('div');
  text.style.whiteSpace = 'pre-line';
  text.style.fontWeight = 'normal';
  const buttons = document.createElement('div');
  Object.assign(buttons.style, { display: 'flex', gap: '14px' } satisfies Partial<CSSStyleDeclaration>);
  root.append(heading, text, buttons);
  document.body.appendChild(root);
  return { root, text, buttons, close: () => root.remove() };
}

function addButton(p: Panel, label: string, primary: boolean, onPress: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.dataset.fake = primary ? 'primary' : 'secondary';
  Object.assign(b.style, {
    minWidth: '140px',
    minHeight: '52px',
    padding: '0 20px',
    border: '0',
    borderRadius: '12px',
    font: 'bold 20px system-ui, sans-serif',
    color: '#fff',
    background: primary ? '#3fa34d' : '#3a4250',
  } satisfies Partial<CSSStyleDeclaration>);
  b.addEventListener('pointerup', onPress);
  p.buttons.appendChild(b);
  return b;
}

export const webServices: Services = {
  ads: {
    showRewarded() {
      return new Promise((resolve) => {
        const p = panel(t('fake.adTitle'));
        let left = FAKE_AD_SECONDS;
        p.text.textContent = t('fake.adBody', { n: left });
        const finish = (watched: boolean) => {
          clearInterval(timer);
          p.close();
          resolve(watched);
        };
        addButton(p, t('fake.skip'), false, () => finish(false));
        const timer = setInterval(() => {
          left--;
          if (left > 0) {
            p.text.textContent = t('fake.adBody', { n: left });
            return;
          }
          clearInterval(timer);
          p.text.textContent = t('fake.adDone');
          addButton(p, t('fake.claim'), true, () => finish(true));
        }, 1000);
      });
    },
    privacyOptionsRequired: () => false,
    showPrivacyOptions: () => Promise.resolve(),
  },

  purchases: {
    products: () => Promise.resolve(PRODUCTS.map((p) => ({ id: p.id, price: p.webPrice }))),
    buy(id) {
      return new Promise((resolve) => {
        const def = PRODUCTS.find((p) => p.id === id);
        const p = panel(t('fake.payTitle'));
        p.text.textContent = t('fake.payBody', { name: t(`shop.${id}.name`), price: def?.webPrice ?? '' });
        addButton(p, t('fake.cancel'), false, () => {
          p.close();
          resolve(false);
        });
        addButton(p, t('fake.buy'), true, () => {
          p.close();
          if (def?.type === 'nonConsumable') writeFakeStore([...new Set([...readFakeStore(), id])]);
          resolve(true);
        });
      });
    },
    restore: () => Promise.resolve(readFakeStore()),
  },

  analytics: {
    log(event, params) {
      eventLog.push(params ? { event, params } : { event });
      if (eventLog.length > 200) eventLog.shift();
    },
  },
};
