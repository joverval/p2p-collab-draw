// app.ts — composition root for p2p-collab-draw
// Wires shell controllers + Canvas placeholder

import './style.css';
import { $ } from './shared/dom';
import { ChatController } from './shell/chat/chat-controller';
import { ParticipantsController } from './shell/participants/participants-controller';
import { PanelController } from './shell/panels/panel-controller';
import { SessionController } from './shell/session-controller';

declare const __COMMIT_SHA__: string;
console.log('p2p-collab-draw — built', __COMMIT_SHA__);

export function createApplication() {
  const chat = new ChatController();
  const participants = new ParticipantsController();
  let isHost = false;
  const session = new SessionController();
  let p2pConnected = false;
  const panel = new PanelController(chat, participants, () => isHost, () => p2pConnected);

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
    chat.addLog('system', '🎨 Canvas ready');
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
    // ponytail: CanvasFeature wiring (v2)
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
  session.onFeatureData = (_data, _peerId) => {
    // ponytail: CanvasFeature.handleFeatureData (v2)
  };
  session.onControlMessage = (_text) => {
    // ponytail: CanvasFeature handleControlMessage (v2)
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