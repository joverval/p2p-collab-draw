// app.ts — composition root for p2p-collab-draw
// Wires shell controllers + Canvas placeholder

import './style.css';
import { $ } from './shared/dom';
import { ChatController } from './shell/chat/chat-controller';
import { ParticipantsController } from './shell/participants/participants-controller';
import { PanelController } from './shell/panels/panel-controller';
import { SessionController } from './shell/session-controller';
import { CanvasFeature } from './features/canvas/canvas-feature';
import { renderSvg } from './features/canvas/svg-renderer';
import { setupToolHandler } from './features/canvas/tool-handler';
import type { DrawElement } from './shared/types';

declare const __COMMIT_SHA__: string;
console.log('p2p-collab-draw — built', __COMMIT_SHA__);

export function createApplication() {
  const chat = new ChatController();
  const participants = new ParticipantsController();
  let isHost = false;
  const session = new SessionController();
  let p2pConnected = false;
  const panel = new PanelController(chat, participants, () => isHost, () => p2pConnected);
  const canvas = new CanvasFeature();

  let email = '';
  let canvasReady = false;

  // ── P2P connected state ──
  session.setConnected = (v) => {
    p2pConnected = v;
    if (v) ensureCanvasVisible();
  };

  // ── Helper ──
  function setTextContent(id: string, text: string) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ── Chat send wiring ──
  panel.setSendChat((text: string) => {
    chat.addLog(isHost ? 'host' : 'peer', text, email);
    session.sendChatMessage(text);
  });

  function updateTopBar() {
    $('topbar').style.display = 'flex';
    ($('user-count') as HTMLElement).textContent = String(participants.userCount());
  }

  function applyRoleState(host: boolean, _hostEmail: string) {
    isHost = host;

    ($('copy-invite-btn') as HTMLButtonElement).style.display = host ? '' : 'none';
    ($('manual-answer-input') as HTMLInputElement).style.display = host ? '' : 'none';
    ($('manual-answer-btn') as HTMLButtonElement).style.display = host ? '' : 'none';

    ($('create-room-btn') as HTMLButtonElement).style.display = 'none';
    ($('email-input') as HTMLInputElement).disabled = true;

    setTextContent('topbar-role', host ? '👑 Host' : '👤 Peer');

    panel.refresh();
    ensureCanvasVisible();
  }

  function ensureCanvasVisible() {
    if (canvasReady) return;
    canvasReady = true;
    $('canvas-section').style.display = 'block';
    // Set explicit dimensions on SVGs once visible
    const stack = $('canvas-stack');
    const bg = $('bg-canvas') as unknown as SVGSVGElement;
    const fg = $('fg-canvas') as unknown as SVGSVGElement;
    bg.setAttribute('viewBox', `0 0 ${stack.clientWidth} ${stack.clientHeight}`);
    fg.setAttribute('viewBox', `0 0 ${stack.clientWidth} ${stack.clientHeight}`);

    // ── Tool handler setup ──
    const handler = setupToolHandler(
      bg as unknown as HTMLElement,
      fg,
      (el: DrawElement) => {
        el.peerId = email;
        canvas.commitElement(el);
      },
      bg,
    );

    // Wire tool selector buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = (btn as HTMLElement).dataset.tool!;
        handler.setTool(tool as any);
        ($('brush-size') as HTMLInputElement).value = String(handler.getStrokeWidth());
        ($('brush-size-val') as HTMLElement).textContent = String(handler.getStrokeWidth());
      });
    });

    // Wire color picker
    ($('color-picker') as HTMLInputElement).addEventListener('input', () => {
      handler.setColor(($('color-picker') as HTMLInputElement).value);
    });

    // Wire brush size slider
    ($('brush-size') as HTMLInputElement).addEventListener('input', () => {
      const w = Number(($('brush-size') as HTMLInputElement).value);
      handler.setStrokeWidth(w);
      ($('brush-size-val') as HTMLElement).textContent = String(w);
    });

    chat.addLog('system', '🎨 Canvas ready');

    // Start CanvasFeature with FeatureContext — delegates send/receive to SessionController
    canvas.start({
      isHost: () => isHost,
      isConnected: () => p2pConnected,
      sendFeatureData: (data) => session.sendFeature(data),
      sendFeatureDataToPeer: (peerId, data) => session.sendFeatureDataToPeer(peerId, data),
      sendControlMessage: (msg) => session.sendControl(msg),
      reportStatus: (msg) => chat.addLog('system', msg),
    });
  }

  // ── Wire session → controllers ──
  session.onRoomState = (snapshot) => {
    participants.replaceSnapshot(snapshot);
    updateTopBar();
    panel.refreshIfOpen('users');
  };

  session.onLog = (type, text) => chat.addLog(type as 'host' | 'peer' | 'system', text);

  session.onPendingRequest = (req) => {
    participants.pendingPeerEmail = req.email;
    ($('toast-msg') as HTMLElement).textContent = `🔔 ${req.email}`;
    $('toast').style.display = 'flex';
    ($('toast-approve') as HTMLButtonElement).onclick = () => {
      session.approvePeer({ email: req.email, token: req.token, offerId: req.offerId, answerB64: req.answerB64 });
      $('toast').style.display = 'none';
    };
    ($('toast-reject') as HTMLButtonElement).onclick = () => {
      session.rejectPeer(req.token);
      $('toast').style.display = 'none';
    };
  };

  session.onPeerJoin = (_peerId, _peerEmail) => {
    canvas.onPeerJoined?.(_peerId);
  };
  session.onPeerLeave = (_peerEmail) => {
    // ponytail: CanvasFeature wiring (v2)
  };
  session.onConnected = (route) => {
    chat.addLog('system', `📡 Connected — ${route}`);
    setTextContent('connection-route', route);
    setTextContent('connection-state', 'connected');
    ensureCanvasVisible();
  };
  session.onRoleChanged = (host, hostEmail) => {
    applyRoleState(host, hostEmail);
  };
  session.onFeatureData = (data, peerId) => canvas.handleFeatureData(data, peerId);
  canvas.onElementsChanged = (elements) => {
    const bg = $('bg-canvas') as unknown as SVGSVGElement;
    if (bg) renderSvg(bg, elements);
  };
  session.onControlMessage = (_text) => {
    // ponytail: control messages routed via CanvasFeature (v2)
  };
  session.onChatMessage = (sender, text, senderRole) => {
    const role: 'host' | 'peer' | 'system' = (senderRole === 'host' || senderRole === 'peer' || senderRole === 'system') ? senderRole : 'peer';
    chat.addLog(role, text, sender);
  };

  session.getEmail = () => email;

  // ── Promote button ──
  participants.onPromote = async (targetEmail) => {
    await session.promotePeer(targetEmail);
  };

  // ── Panel open/close ──
  $('panel-close').addEventListener('click', () => panel.close());
  document.querySelectorAll('.panel-btn').forEach(btn => btn.addEventListener('click', () => panel.open((btn as HTMLElement).dataset.panel!)));

  // ── File dropdown ──
  ($('file-menu-btn') as HTMLElement)?.addEventListener('click', (e) => {
    e.stopPropagation();
    ($('file-dropdown') as HTMLElement)?.classList.toggle('show');
  });
  document.addEventListener('click', () => ($('file-dropdown') as HTMLElement)?.classList.remove('show'));

  // ── Keyboard shortcut: Ctrl+Z (undo) ──
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.key !== 'z') return;
    const t = e.target as HTMLElement;
    // Don't swallow Ctrl+Z when user is typing in inputs or contentEditable
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    e.preventDefault();
    canvas.undoLastElement();
  });

  // ── Export SVG ──
  ($('save-svg-btn') as HTMLButtonElement)?.addEventListener('click', () => {
    ($('file-dropdown') as HTMLElement)?.classList.remove('show');
    const svg = document.getElementById('bg-canvas');
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    // Set explicit dimensions so the file is self-contained
    const rect = svg.getBoundingClientRect();
    clone.setAttribute('width', String(rect.width));
    clone.setAttribute('height', String(rect.height));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const data = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawing.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  });

  // ── Export PNG ──
  ($('save-png-btn') as HTMLButtonElement)?.addEventListener('click', () => {
    ($('file-dropdown') as HTMLElement)?.classList.remove('show');
    const svg = document.getElementById('bg-canvas');
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    clone.setAttribute('width', String(rect.width));
    clone.setAttribute('height', String(rect.height));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const data = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    const svgBlob = new Blob([data], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d')!;
      // ponytail: fill white background so PNG isn't transparent
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const url = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'drawing.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }, 'image/png');
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  });

  // ── Clear Canvas ──
  ($('clear-canvas-btn') as HTMLButtonElement)?.addEventListener('click', () => {
    ($('file-dropdown') as HTMLElement)?.classList.remove('show');
    if (!confirm('Clear the canvas? This removes all drawings for everyone.')) return;
    canvas.clearElements();
  });

  // ── Create Room ──
  ($('create-room-btn') as HTMLButtonElement).addEventListener('click', async () => {
    email = ($('email-input') as HTMLInputElement).value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { chat.addLog('system', 'ERROR: Please enter a valid email'); return; }
    isHost = true;
    ($('email-input') as HTMLInputElement).disabled = true;

    const useRelay = await session.createRoom(email);
    ($('copy-invite-btn') as HTMLButtonElement).style.display = '';
    ($('copy-invite-btn') as HTMLButtonElement).onclick = () => {
      navigator.clipboard.writeText(session.shareUrl).then(() => { ($('invite-copied') as HTMLElement).style.display = 'inline'; setTimeout(() => ($('invite-copied') as HTMLElement).style.display = 'none', 2000); });
    };
    session.onInviteChanged = (_token, url) => {
      ($('copy-invite-btn') as HTMLButtonElement).onclick = () => {
        navigator.clipboard.writeText(url).then(() => { ($('invite-copied') as HTMLElement).style.display = 'inline'; setTimeout(() => ($('invite-copied') as HTMLElement).style.display = 'none', 2000); });
      };
    };

    ensureCanvasVisible();

    if (!useRelay) {
      ($('manual-answer-input') as HTMLInputElement).style.display = '';
      ($('manual-answer-btn') as HTMLButtonElement).style.display = '';
      ($('manual-answer-btn') as HTMLButtonElement).onclick = () => {
        session.manualAcceptAnswer(session.currentOfferId, ($('manual-answer-input') as HTMLInputElement).value.trim());
      };
    }
  });

  // ── Join Room ──
  const parsed = session.parseRoomFromUrl();
  if (parsed) {
    ($('create-room-btn') as HTMLButtonElement).textContent = 'Join Room';
    ($('create-room-btn') as HTMLButtonElement).replaceWith(($('create-room-btn') as HTMLButtonElement).cloneNode(true));
    ($('create-room-btn') as HTMLButtonElement).addEventListener('click', async () => {
      email = ($('email-input') as HTMLInputElement).value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { chat.addLog('system', 'ERROR: Please enter a valid email'); return; }
      ($('email-input') as HTMLInputElement).disabled = true;
      await session.peerAutoJoin(parsed, email);
    });
  }
}