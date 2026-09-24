/* Ritual Goods support widget — AI-first replacement for the Deskly stock widget.
   Answers instantly from the real help center, knows the logged-in customer,
   escalates into the Deskly agent inbox, and brings agent replies back in-thread. */

(function () {
  "use strict";

  // Local dev talks to deskly.py on :8099 and to Anthropic with a local key. A hosted deploy
  // serves Deskly on the same origin and relays Claude calls through /api/claude, which holds
  // the site's key server-side, so visitors never need (or see) one.
  const HOSTED = !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const DESKLY = window.RITUAL_DESKLY || (HOSTED ? "/api/v2" : "http://localhost:8099/api/v2");
  const CLAUDE = HOSTED ? "/api/claude" : "https://api.anthropic.com/v1/messages";
  const MODEL = "claude-opus-5";
  const TODAY = new Date().toISOString().slice(0, 10); // live: a pinned date silently ages into a wrong one
  // Merchant-provided fallback for when the helpdesk can't be reached. This is config,
  // not something the model may infer — the help-center articles never name an address.
  const SUPPORT_EMAIL = "support@ritualgoods.com";

  // One config object = one re-skin per merchant.
  const THEME = {
    bg: "#faf7f2",
    ink: "#2d2a26",
    inkSoft: "#6d6558",
    muted: "#857c6d",
    accent: "#8a7a5c",
    hairline: "#e6ded2",
    surface: "#ffffff",
    ring: "rgba(45,42,38,.08)",   // hairline-as-shadow (semi-transparent edge, not a solid border)
    agentInk: "#4a6741",          // the team's voice: sender label + resolved rows
    danger: "#b3402e",
    serif: "Georgia, 'Times New Roman', serif",
    sans: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    easeOut: "cubic-bezier(0.23, 1, 0.32, 1)", // strong ease-out; built-in CSS easings are too weak for entrances
    easeIn: "cubic-bezier(0.4, 0, 1, 1)",      // exits only — and always shorter than the entrance
    // launcher ⇄ panel morph (Transitions.dev "plus to menu"): bouncy open, calm close
    morphOpen: "350ms",
    morphClose: "250ms",
    easeMorph: "cubic-bezier(0.34, 1.25, 0.64, 1)",
    easeMorphClose: "cubic-bezier(0.22, 1, 0.36, 1)",
  };

  // Deskly doesn't carry agent names, so the widget assigns a friendly (fictional) one
  // per ticket — "Connected to Maya" reads human; "connected to our team" reads like a queue.
  const AGENT_NAMES = ["Maya", "Priya", "Jonah", "Elena", "Marcus"];

  // The customer record read one way everywhere: the CSV booleans arrive as strings
  // ("True"), the order list is not guaranteed sorted, and VIP is a threshold, not a field.
  const isTrue = (v) => v === true || String(v) === "True";
  function facts(c) {
    const orders = [...(c.orders || [])].sort((a, b) => a.order_date.localeCompare(b.order_date));
    const ltv = parseFloat(c.profile.lifetime_value_usd) || 0;
    return { orders, last: orders[orders.length - 1] || null, ltv, isSub: isTrue(c.profile.is_subscriber), vip: ltv > 400 };
  }

  const state = {
    customer: window.RITUAL_CUSTOMER,
    agentName: null,    // assigned when a ticket is filed
    greetToken: 0,      // invalidates an in-flight greeting when the customer changes
    solved: false,      // ticket closed — by the customer here or by the agent in Deskly
    unread: 0,          // agent replies that arrived while the chat was collapsed
    unseen: 0,          // messages that landed while the reader was scrolled up
    articles: [],
    desklyOk: false,
    desklyCheckedAt: 0,
    healthTimer: null,
    handoffMissed: false, // an escalation the outage swallowed
    history: [],        // Claude conversation: [{role, content}]
    busy: false,
    ticketId: null,     // non-null → escalated mode
    pollTimer: null,
    pollCursor: 0,      // comments seen so far (Deskly comments carry no IDs)
  };

  /* ================= styles ================= */
  const T = THEME;
  const css = `
    /* launcher ⇄ panel morph: ONE surface animates size + corner radius (Transitions.dev
       "plus to menu"); the ✦ and the panel content cross-fade with a slide + blur.
       The panel keeps its full OPEN footprint inside the clipping container, so text
       never reflows mid-morph — the surface simply reveals it. */
    #rg-morph{position:fixed;bottom:24px;right:24px;z-index:9999;overflow:hidden;
      width:56px;height:56px;border-radius:28px;background:${T.bg};
      box-shadow:0 1px 2px rgba(45,42,38,.2),0 8px 24px rgba(45,42,38,.22);
      transition:width ${T.morphClose} ${T.easeMorphClose},height ${T.morphClose} ${T.easeMorphClose},
        border-radius ${T.morphClose} ${T.easeMorphClose},box-shadow ${T.morphClose} ${T.easeMorphClose},
        transform .18s ease-out}
    #rg-morph:not([data-open="true"]):active{transform:scale(.94)}
    #rg-morph[data-open="true"]{width:min(380px,100vw - 36px);height:min(620px,100dvh - 36px);border-radius:20px;
      box-shadow:0 0 0 1px ${T.ring},0 2px 6px rgba(45,42,38,.06),0 18px 48px -10px rgba(45,42,38,.28);
      transition:width ${T.morphOpen} ${T.easeMorph},height ${T.morphOpen} ${T.easeMorph},
        border-radius ${T.morphOpen} ${T.easeMorph},box-shadow ${T.morphOpen} ${T.easeMorph}}
    #rg-bubble{position:absolute;right:0;bottom:0;width:56px;height:56px;border-radius:50%;padding:0;border:none;
      background:${T.ink};color:${T.bg};cursor:pointer;display:grid;place-items:center;font-size:22px;line-height:1;
      transition:opacity .2s ${T.easeMorphClose}}
    #rg-bubble:focus-visible{outline-offset:-3px} /* ring stays inside the clipping surface */
    @media (hover:hover) and (pointer:fine){
      /* the surface lifts toward the pointer, shadow deepening with it */
      #rg-morph:not([data-open="true"]):hover{transform:translateY(-2px) scale(1.05);
        box-shadow:0 2px 4px rgba(45,42,38,.18),0 14px 32px rgba(45,42,38,.26)}
      #rg-morph:not([data-open="true"]):hover:active{transform:translateY(-1px) scale(.94)}
    }
    #rg-bubble svg{transition:transform ${T.morphOpen} ${T.easeMorphClose},filter .2s ${T.easeMorphClose}}
    #rg-morph[data-open="true"] #rg-bubble{opacity:0;pointer-events:none}
    #rg-morph[data-open="true"] #rg-bubble svg{transform:translateX(-40px) scale(.97) rotate(45deg);filter:blur(2px)}
    /* Transitions.dev "notification badge": slides in from the panel's direction, pops with a
       blur; collapses to nothing when read. Anchored inside the bubble (the morph surface clips). */
    /* Outside #rg-morph on purpose: that surface is a hard-clipped circle when closed,
       so a corner-anchored badge inside it gets sliced by the mask. */
    #rg-badge{position:fixed;right:23px;bottom:63px;z-index:10000;pointer-events:none;will-change:transform}
    #rg-badge[data-open="true"]{animation:rg-badge-slide 260ms cubic-bezier(0.22,1,0.36,1)}
    @keyframes rg-badge-slide{from{transform:translate(-8.2px,12.4px)}to{transform:translate(0,0)}}
    #rg-badge .rg-badge-dot{display:grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;
      background:${T.danger};color:#fff;font-size:11px;font-weight:600;line-height:1;
      transform-origin:center;transform:scale(1);opacity:1;filter:blur(0);will-change:transform,opacity,filter;
      transition:transform 500ms cubic-bezier(0.34,1.36,0.64,1),opacity 400ms cubic-bezier(0.34,1.36,0.64,1),
        filter 500ms cubic-bezier(0.34,1.36,0.64,1)}
    #rg-badge[data-open="false"] .rg-badge-dot{transform:scale(0);opacity:0;filter:blur(2px);
      transition:transform 180ms cubic-bezier(0.4,0,0.2,1),opacity 180ms cubic-bezier(0.4,0,0.2,1),
        filter 180ms cubic-bezier(0.4,0,0.2,1)}

    #rg-panel{position:absolute;right:0;bottom:0;width:min(380px,100vw - 36px);height:min(620px,100dvh - 36px);
      background:${T.bg};color:${T.ink};
      display:flex;flex-direction:column;overflow:hidden;font-family:${T.sans};
      visibility:hidden;opacity:0;transform:translateX(40px) scale(.97);pointer-events:none;
      transition:opacity .14s ${T.easeMorphClose},transform ${T.morphOpen} ${T.easeMorphClose},
        visibility 0s ${T.morphClose}}
    #rg-morph[data-open="true"] #rg-panel{visibility:visible;opacity:1;transform:none;pointer-events:auto;
      transition:opacity .14s ${T.easeMorphClose},transform ${T.morphOpen} ${T.easeMorphClose},visibility 0s}

    /* The three sections materialize INTO the growing surface rather than sitting in it
       pre-rendered: blur + lift resolving in a 40ms stagger, each landing just as the
       surface settles. Exit is instant and unstaggered — nobody waits to close. */
    #rg-head,#rg-body,#rg-foot{opacity:0;filter:blur(6px);transform:translateY(6px);
      will-change:opacity,filter,transform;
      transition:opacity .12s ${T.easeIn},filter .12s ${T.easeIn},transform .12s ${T.easeIn}}
    #rg-morph[data-open="true"] #rg-head,
    #rg-morph[data-open="true"] #rg-body,
    #rg-morph[data-open="true"] #rg-foot{opacity:1;filter:blur(0);transform:none;
      transition:opacity .2s ${T.easeOut},filter .2s ${T.easeOut},transform .2s ${T.easeOut}}
    #rg-morph[data-open="true"] #rg-head{transition-delay:40ms}
    #rg-morph[data-open="true"] #rg-body{transition-delay:80ms}
    #rg-morph[data-open="true"] #rg-foot{transition-delay:120ms}
    #rg-panel button{font-family:inherit}
    #rg-panel button:focus-visible,#rg-bubble:focus-visible{outline:2px solid ${T.accent};outline-offset:2px}

    #rg-head{background:${T.bg};color:${T.ink};padding:14px 52px 12px 18px;position:relative;flex:none;border-bottom:1px solid ${T.hairline}}
    #rg-head .rg-brand{font-family:${T.serif};font-size:15px;letter-spacing:.1em}
    #rg-head .rg-status{display:flex;align-items:center;gap:6px;font-size:11.5px;color:${T.muted};margin-top:4px;letter-spacing:.01em}
    #rg-head .rg-status.offline{color:${T.danger}}
    #rg-close{position:absolute;top:14px;right:12px;width:28px;height:28px;border-radius:50%;border:none;padding:0;
      background:rgba(45,42,38,.06);color:${T.inkSoft};display:grid;place-items:center;cursor:pointer;
      transition:transform .1s ease-out,background-color .15s ease}
    #rg-close:active{transform:scale(.92)}
    @media (hover:hover) and (pointer:fine){#rg-close:hover{background:rgba(45,42,38,.12);color:${T.ink}}}

    #rg-body{flex:1;min-height:0;position:relative;display:flex;flex-direction:column;background:${T.bg}}
    #rg-msgs{flex:1;min-height:0;overflow-y:auto;padding:14px 14px 8px;display:flex;flex-direction:column;align-items:flex-start;
      overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(45,42,38,.18) transparent;
      transition:-webkit-mask-image .15s ease}
    #rg-msgs.more-below{
      -webkit-mask-image:linear-gradient(#000,#000 calc(100% - 34px),rgba(0,0,0,.55) calc(100% - 14px),transparent);
      mask-image:linear-gradient(#000,#000 calc(100% - 34px),rgba(0,0,0,.55) calc(100% - 14px),transparent)}
    .rg-m{margin:0 0 10px;padding:9px 13px;border-radius:18px;max-width:80%;font-size:14px;line-height:1.45;
      white-space:pre-wrap;overflow-wrap:break-word;animation:rg-in .18s ${T.easeOut};transform-origin:bottom left}
    @keyframes rg-in{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
    @keyframes rg-fade{from{opacity:0}to{opacity:1}}
    .rg-bot{background:${T.surface};box-shadow:0 1px 2px rgba(45,42,38,.04);border-bottom-left-radius:6px}
    .rg-user{background:${T.ink};color:${T.bg};align-self:flex-end;transform-origin:bottom right;border-bottom-right-radius:6px}
    .rg-agent{background:${T.surface};box-shadow:0 1px 2px rgba(45,42,38,.04);border-bottom-left-radius:6px}
    /* grouping: consecutive bubbles from one sender sit tight, and only the last one wears the tail corner */
    .rg-bot+.rg-bot,.rg-user+.rg-user,.rg-agent+.rg-agent{margin-top:-7px}
    .rg-bot:has(+ .rg-bot),.rg-agent:has(+ .rg-agent){border-bottom-left-radius:18px}
    .rg-user:has(+ .rg-user){border-bottom-right-radius:18px}
    .rg-sender{font-size:11px;color:${T.muted};margin:2px 0 4px 12px;animation:rg-in .18s ${T.easeOut}}
    .rg-sender.team{color:${T.agentInk}}
    .rg-sys{align-self:stretch;display:flex;align-items:center;justify-content:center;gap:4px;margin:8px 2px 12px;
      font-size:11px;color:${T.muted};letter-spacing:.02em;text-align:center;animation:rg-in .18s ${T.easeOut}}
    .rg-sys b{font-weight:600}
    .rg-sys.stack{flex-direction:column;gap:2px}
    #rg-head .rg-status b{font-weight:600}
    .rg-sys.warn{color:${T.danger}}
    .rg-sys.ok{color:${T.agentInk}}
    .rg-sys.pending svg{flex:none}
    .rg-srcs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;white-space:normal}
    .rg-src{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:3px 9px 3px 7px;border-radius:999px;
      background:rgba(138,122,92,.1);color:${T.inkSoft};font-size:11px;line-height:1.4}
    .rg-src svg{flex:none}
    .rg-src span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .rg-typing{display:inline-flex;gap:4px;align-items:center;height:20px}
    .rg-typing i{width:6px;height:6px;border-radius:50%;background:${T.muted};opacity:.35;animation:rg-dot 1s infinite ease-in-out}
    .rg-typing i:nth-child(2){animation-delay:.12s}.rg-typing i:nth-child(3){animation-delay:.24s}
    @keyframes rg-dot{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}
    @keyframes rg-pulse{0%,60%,100%{opacity:.35}30%{opacity:1}}
    .rg-err{background:#fbf1ee;color:#7a2e21}
    .rg-err small{display:block;margin-top:6px;font-size:11px;opacity:.8;word-break:break-word}
    .rg-err .rg-pills{margin-top:8px}
    .rg-pills{display:flex;flex-wrap:wrap;gap:6px}
    /* key card: in-thread UI, not a chat bubble — square-ish, full width, quiet surface */
    .rg-key{align-self:stretch;margin:2px 0 12px;padding:12px 13px;border-radius:12px;background:${T.surface};
      box-shadow:0 0 0 1px ${T.ring};animation:rg-in .18s ${T.easeOut}}
    .rg-key b{display:block;font-size:12.5px;font-weight:600;margin-bottom:4px}
    .rg-key p{font-size:11.5px;line-height:1.5;color:${T.muted};margin:0 0 9px}
    .rg-key form{display:flex;gap:6px}
    .rg-key input{flex:1;min-width:0;font:inherit;font-size:12.5px;padding:8px 10px;border-radius:8px;
      border:1px solid ${T.hairline};background:${T.bg};color:${T.ink};outline:0;
      transition:border-color .15s ease}
    .rg-key input:focus{border-color:${T.ink}}
    .rg-key .rg-pill{flex:none}
    .rg-actions{margin:6px 0 12px;align-self:center;animation:rg-in .18s ${T.easeOut};transition:opacity .12s ease,transform .12s ease}
    #rg-chipbar{flex:none;display:flex;gap:6px;padding:2px 2px 2px;margin-bottom:8px;overflow-x:auto;scrollbar-width:none;
      -webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;background:${T.bg};
      transition:opacity .12s ease,transform .12s ease;
      }
    #rg-chipbar.can-right{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);
      mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}
    #rg-chipbar.can-left{-webkit-mask-image:linear-gradient(90deg,transparent,#000 28px);
      mask-image:linear-gradient(90deg,transparent,#000 28px)}
    #rg-chipbar.can-left.can-right{-webkit-mask-image:linear-gradient(90deg,transparent,#000 28px,#000 calc(100% - 28px),transparent);
      mask-image:linear-gradient(90deg,transparent,#000 28px,#000 calc(100% - 28px),transparent)}
    #rg-chipbar::-webkit-scrollbar{display:none}
    #rg-chipbar[hidden]{display:none}
    #rg-chipbar .rg-chip{flex:none;scroll-snap-align:start;white-space:nowrap}
    .rg-leaving{opacity:0;transform:scale(.98);pointer-events:none}
    .rg-pill{padding:7px 13px;border-radius:999px;border:none;background:${T.surface};box-shadow:0 1px 2px rgba(45,42,38,.06);
      font:inherit;font-size:12.5px;color:${T.ink};cursor:pointer;
      transition:transform .12s ease-out,background-color .15s ease,box-shadow .15s ease}
    .rg-pill:active{transform:scale(.96)}
    @media (hover:hover) and (pointer:fine){.rg-pill:hover{background:#f3ecdf}}
    .rg-pill.primary{background:${T.ink};color:${T.bg};box-shadow:none}
    @media (hover:hover) and (pointer:fine){.rg-pill.primary:hover{background:#3d3933;box-shadow:none}}
    /* Resolve is a commit action, not a chat bubble — square-ish corners, centered,
       and a quiet surface so it reads as UI. Green is reserved for the resolved state. */
    .rg-pill.resolve{border-radius:8px;padding:9px 14px;background:${T.surface};color:${T.inkSoft};
      border:1px solid ${T.hairline};box-shadow:none}
    @media (hover:hover) and (pointer:fine){.rg-pill.resolve:hover{background:#f3ecdf;color:${T.ink};border-color:${T.accent}}}
    .rg-chip{animation:rg-in .18s ${T.easeOut} both}
    #rg-new{position:absolute;left:50%;bottom:10px;transform:translateX(-50%) translateY(8px) scale(.96);opacity:0;pointer-events:none;
      display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;background:${T.ink};color:${T.bg};
      font-size:12px;font-weight:500;border:none;cursor:pointer;z-index:2;
      box-shadow:0 4px 14px rgba(45,42,38,.28);transition:opacity .16s ease,transform .16s ${T.easeOut}}
    #rg-new:active{transform:translateX(-50%) scale(.96)}
    #rg-new.show{opacity:1;transform:translateX(-50%);pointer-events:auto}

    #rg-foot{flex:none;padding:6px 12px 9px;background:${T.bg}}
    .rg-composer{display:flex;align-items:flex-end;gap:6px;padding:4px 4px 4px 14px;border-radius:22px;
      background:${T.surface};border:1px solid ${T.hairline};transition:border-color .15s ease}
    .rg-composer:focus-within{border-color:${T.ink}}
    #rg-in{flex:1;min-width:0;border:0;outline:0;background:none;resize:none;font:inherit;font-size:14px;line-height:1.4;
      padding:7px 0;margin:0;max-height:120px;color:${T.ink}}
    #rg-in::placeholder{color:#a09884}
    #rg-send{width:32px;height:32px;flex:none;border-radius:50%;background:${T.ink};color:${T.bg};display:grid;place-items:center;
      border:0;padding:0;cursor:pointer;transition:transform .12s ease-out,opacity .15s ease}
    #rg-send:active{transform:scale(.9)}
    .rg-composer.closed{opacity:.55}
    .rg-composer.closed #rg-send{display:none}
    .rg-composer:not(.has-text) #rg-send{opacity:.35;transform:scale(.92)}
    .rg-composer.busy #rg-send{opacity:.7}
    .rg-composer.busy .rg-ic-send,.rg-composer:not(.busy) .rg-ic-spin{display:none}
    .rg-ic-spin{animation:rg-spin .7s linear infinite}
    @keyframes rg-spin{to{transform:rotate(360deg)}}
    .rg-foot-note{font-size:10.5px;color:${T.muted};text-align:center;padding:7px 8px 0;letter-spacing:.01em}

    /* reduced motion = gentler, not zero: the surface snaps, the cross-fades stay */
    @media (prefers-reduced-motion:reduce){
      #rg-morph,#rg-morph[data-open="true"]{transition:box-shadow .15s ease}
      #rg-morph:not([data-open="true"]):active,#rg-morph:not([data-open="true"]):hover{transform:none}
      #rg-bubble{transition:opacity .15s ease}
      #rg-bubble svg,#rg-morph[data-open="true"] #rg-bubble svg{transform:none;filter:none;transition:none}
      #rg-panel{transform:none;transition:opacity .15s ease,visibility 0s .15s}
      #rg-head,#rg-body,#rg-foot,
      #rg-morph[data-open="true"] #rg-head,
      #rg-morph[data-open="true"] #rg-body,
      #rg-morph[data-open="true"] #rg-foot{filter:none;transform:none;transition-delay:0s;
        transition:opacity .15s ease}
      #rg-morph[data-open="true"] #rg-panel{transition:opacity .15s ease,visibility 0s}
      .rg-m,.rg-sys,.rg-sender,.rg-chip,.rg-actions{animation:rg-fade .15s ease}
      #rg-badge{animation:none !important}
      #rg-badge .rg-badge-dot{transform:scale(1);filter:none;transition:opacity .2s ease}
      .rg-typing i{animation:rg-pulse 1s infinite}
      #rg-new{transform:translateX(-50%)}
    }
    @media (prefers-contrast:more){.rg-bot,.rg-agent{box-shadow:0 0 0 1px ${T.ink}}.rg-composer{border-color:${T.ink}}}`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ================= DOM ================= */
  const ICON_COLLAPSE = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 5l4.5 4.5L11.5 5"/></svg>';
  const ICON_SEND = '<svg class="rg-ic-send" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 12V2M2.5 6.5L7 2l4.5 4.5"/></svg>';
  const ICON_SPIN = '<svg class="rg-ic-spin" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 1.5A5.5 5.5 0 1 1 1.5 7"/></svg>';
  const ICON_DOC = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 1.5h4l2.5 2.5V10.5H3z"/><path d="M7 1.5V4h2.5M4.5 6.5h3M4.5 8.5h3"/></svg>';

  const bubble = document.createElement("button");
  bubble.id = "rg-bubble";
  bubble.type = "button";
  bubble.setAttribute("aria-label", "Chat with Ritual Goods support");
  bubble.setAttribute("aria-expanded", "false");
  bubble.setAttribute("aria-controls", "rg-panel");
  bubble.setAttribute("aria-haspopup", "dialog");
  bubble.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v8a2.5 2.5 0 0 1-2.5 2.5h-7.7l-4.2 3.4c-.6.5-1.6.1-1.6-.7V17h-1.5A2.5 2.5 0 0 1 2 14.5v-8A2.5 2.5 0 0 1 4.5 4Z"/></svg>`;

  const badge = document.createElement("span");
  badge.id = "rg-badge";
  badge.dataset.open = "false";
  badge.innerHTML = '<span class="rg-badge-dot">1</span>';

  const panel = document.createElement("div");
  panel.id = "rg-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Ritual Goods support");
  panel.innerHTML = `
    <div id="rg-head">
      <div class="rg-brand">RITUALGOODS</div>
      <div class="rg-status" id="rg-who"><span></span></div>
      <button id="rg-close" type="button" aria-label="Collapse chat" title="Collapse">${ICON_COLLAPSE}</button>
    </div>
    <div id="rg-body">
      <div id="rg-msgs" role="log" aria-live="polite"></div>
      <button id="rg-new" type="button"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v8M2.5 6.5L6 10l3.5-3.5"/></svg><span>1 new message</span></button>
    </div>
    <div id="rg-foot">
      <div id="rg-chipbar" role="group" aria-label="Suggested questions" hidden></div>
      <form id="rg-form" class="rg-composer">
        <textarea id="rg-in" rows="1" placeholder="Ask about an order, returns, products…" autocomplete="off" enterkeyhint="send" aria-label="Message"></textarea>
        <button id="rg-send" type="submit" aria-label="Send">${ICON_SEND}${ICON_SPIN}</button>
      </form>
      <div class="rg-foot-note">Answers come straight from our help center.</div>
    </div>`;
  const morph = document.createElement("div");
  morph.id = "rg-morph";
  morph.dataset.open = "false";
  morph.appendChild(bubble);
  document.body.appendChild(badge);
  morph.appendChild(panel);
  document.body.appendChild(morph);

  const msgs = panel.querySelector("#rg-msgs");
  const input = panel.querySelector("#rg-in");
  const form = panel.querySelector("#rg-form");
  const who = panel.querySelector("#rg-who");
  const whoText = who.querySelector("span");
  const newPill = panel.querySelector("#rg-new");
  const chipbar = panel.querySelector("#rg-chipbar");
  chipbar.addEventListener("scroll", () => syncChipFade(), { passive: true });
  const closeBtn = panel.querySelector("#rg-close");

  const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ================= thread helpers ================= */
  const nearBottom = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 72;
  // follow = the reader is (or wants to be) at the bottom. Cleared only by a real user scroll-up,
  // never by our own programmatic scrolls — so a burst of messages in one tick doesn't lose the thread.
  let follow = true, ownScrollUntil = 0;
  // Content can still be growing (bubble entrance animations, an auto-grown composer),
  // so re-pin on the next frames as well — one scrollTo often lands short of the end.
  function scrollToBottom(smooth) {
    follow = true;
    state.unseen = 0;
    ownScrollUntil = Date.now() + 900;
    // Re-pin with the SAME behavior: an "auto" follow-up would cut a smooth scroll short.
    const behavior = smooth && !reducedMotion() ? "smooth" : "auto";
    const go = () => msgs.scrollTo({ top: msgs.scrollHeight, behavior });
    go();
    requestAnimationFrame(() => { if (follow) go(); });
    setTimeout(() => { if (follow) { go(); syncMsgFade(); } }, 320);
    newPill.classList.remove("show");
    syncMsgFade();
  }
  // The fade is an affordance for "there's more below" — it must never dim the last
  // message when the reader is already at the end.
  function syncMsgFade() {
    msgs.classList.toggle("more-below", msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight > 8);
  }
  // Only follow the thread if the reader is at the bottom — never yank someone who scrolled up.
  function append(node, opts) {
    const o = opts || {};
    const stick = o.force || follow || nearBottom();
    msgs.appendChild(node);
    if (stick) scrollToBottom(o.smooth);
    else {
      if (node.classList.contains("rg-m")) {
        state.unseen++;
        newPill.querySelector("span").textContent =
          state.unseen === 1 ? "1 new message" : `${state.unseen} new messages`;
        newPill.classList.add("show");
      }
      syncMsgFade();
    }
    return node;
  }
  msgs.addEventListener("scroll", () => {
    syncMsgFade();
    if (Date.now() < ownScrollUntil) return;
    follow = nearBottom();
    if (follow) { state.unseen = 0; newPill.classList.remove("show"); }
  }, { passive: true });
  newPill.addEventListener("click", () => scrollToBottom(true));

  // Text arrives the way a person sends it: short replies build word by word, longer
  // ones land a sentence at a time so a paragraph never appears all at once.
  const WORDS = (t) => t.match(/\S+\s*/g) || [t];
  const SENTENCES = (t) => t.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) || [t];
  async function revealInto(node, text, alive) {
    if (reducedMotion()) { node.textContent = text; return true; }
    const long = text.length > 90;
    const chunks = long ? SENTENCES(text) : WORDS(text);
    const step = long ? 170 : 38;
    node.textContent = "";
    let acc = "";
    for (const c of chunks) {
      if (alive && !alive()) return false;
      acc += c;
      node.textContent = acc;
      if (follow) msgs.scrollTop = msgs.scrollHeight;
      await new Promise((r) => setTimeout(r, step));
    }
    node.textContent = text;
    if (follow) scrollToBottom(false);
    return true;
  }

  function el(tag, cls, text) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function lastSender() {
    const n = msgs.lastElementChild;
    if (!n || !n.classList.contains("rg-m")) return null;
    return ["rg-bot", "rg-user", "rg-agent"].find((c) => n.classList.contains(c)) || null;
  }

  // cls: rg-bot | rg-user | rg-agent. Non-user bubbles get a sender row when the sender changes.
  function add(cls, text, opts) {
    if (cls !== "rg-user" && lastSender() !== cls) {
      const s = el("div", "rg-sender" + (cls === "rg-agent" ? " team" : ""),
        cls === "rg-agent" ? (state.agentName || "Ritual Goods team") : "Ritual Goods AI");
      msgs.appendChild(s);
    }
    const d = el("div", "rg-m " + cls, text);
    d.title = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return append(d, Object.assign({ smooth: true }, opts || {}));
  }
  function sys(text, kind) {
    return append(el("div", "rg-sys" + (kind ? " " + kind : ""), text), { smooth: true });
  }
  // A system row with a bold lead and a plain detail line — every divider in the thread.
  function sysRow(kind, lead, detail) {
    const row = sys("", kind);
    row.appendChild(el("b", null, lead));
    row.appendChild(document.createTextNode(detail));
    return row;
  }
  // Remove a bubble together with its sender label if that label would be left orphaned.
  function removeBubble(node) {
    const prev = node.previousElementSibling;
    node.remove();
    if (prev && prev.classList.contains("rg-sender") &&
        (!prev.nextElementSibling || !prev.nextElementSibling.classList.contains("rg-m"))) {
      prev.remove();
    }
  }
  function setStatus(text, mode) {
    whoText.textContent = text;
    who.className = "rg-status" + (mode ? " " + mode : "");
  }
  // Escalated mode: the header stops naming the AI and names the agent + ticket instead.
  function setAgentHeader(ticketId) {
    setStatus("");
    whoText.appendChild(el("b", null, state.agentName));
    whoText.appendChild(document.createTextNode(` Ticket #${ticketId}`));
  }
  function fadeOut(node) {
    if (!node) return;
    node.classList.add("rg-leaving");
    setTimeout(() => node.remove(), reducedMotion() ? 0 : 130);
  }

  /* ================= key management ================= */
  // Order: a machine-local key (window.RITUAL_AI_KEY, e.g. a gitignored config script)
  // → this browser's localStorage → ask. Never the repo: a key in source is a leaked key.
  function storedKey() {
    if (HOSTED) return "server-relay"; // the relay adds the site's key; nothing to store here
    let saved = "";
    try { saved = localStorage.getItem("anthropic_key") || ""; } catch { /* private mode */ }
    return String(window.RITUAL_AI_KEY || saved || "").trim();
  }

  // Keys that aren't scoped to a workspace must name one per request, from the local config
  // script (window.RITUAL_AI_WORKSPACE) or this browser's localStorage. Hosted: the relay does it.
  function claudeHeaders(key) {
    if (HOSTED) return { "content-type": "application/json" };
    const h = {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    let saved = "";
    try { saved = localStorage.getItem("anthropic_workspace") || ""; } catch { /* private mode */ }
    const ws = String(window.RITUAL_AI_WORKSPACE || saved).trim();
    if (ws) h["anthropic-workspace-id"] = ws;
    return h;
  }

  // Asked for in-thread, not through a native prompt() — on a fresh clone this is the
  // first thing anyone sees, and a browser dialog demanding a secret is not the product.
  function requestKey() {
    return new Promise((resolve) => {
      const open = panel.querySelector(".rg-key"); // a second send shouldn't stack a second card
      if (open) { open.querySelector("input").focus(); return resolve(""); }
      const card = el("div", "rg-key");
      card.appendChild(el("b", null, "One-time setup"));
      card.appendChild(el("p", null, "This demo calls Claude straight from the browser, so it needs an Anthropic API key. It stays in this browser and goes nowhere but api.anthropic.com."));
      const f = document.createElement("form");
      const inp = document.createElement("input");
      inp.type = "password";
      inp.placeholder = "sk-ant-…";
      inp.autocomplete = "off";
      inp.spellcheck = false;
      inp.setAttribute("aria-label", "Anthropic API key");
      const save = el("button", "rg-pill primary", "Save");
      save.type = "submit";
      f.appendChild(inp);
      f.appendChild(save);
      card.appendChild(f);
      append(card, { smooth: true });
      inp.focus();
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const k = inp.value.trim();
        if (!k) return inp.focus();
        try { localStorage.setItem("anthropic_key", k); } catch { /* key lives for this page only */ }
        card.remove();
        pingClaude(k); // immediate self-test so a bad key/org fails loudly, not mid-conversation
        resolve(k);
      });
    });
  }

  // Minimal auth/shape self-test — result lands in the chat as a system line.
  async function pingClaude(key) {
    try {
      const res = await fetch(CLAUDE, {
        method: "POST",
        headers: claudeHeaders(key),
        body: JSON.stringify({ model: MODEL, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      });
      if (res.ok) { sys("API key verified", "ok"); return; }
      const body = await res.text();
      console.error("[widget] key self-test failed:", res.status, body);
      const m = body.match(/"message"\s*:\s*"([^"]+)"/);
      sys(`Key self-test failed (${res.status}): ${(m ? m[1] : body).slice(0, 200)}`, "warn");
    } catch (e) {
      console.error("[widget] key self-test network error:", e);
      sys("Key self-test failed: " + String(e.message || e).slice(0, 200) + " — if this says 'Failed to fetch', the request never left the browser (network/CORS/extension blocking).", "warn");
    }
  }

  /* ================= customer snapshot (rides on the ticket) ================= */
  // The at-a-glance card the human agent sees in Deskly. Deskly stores `requester`
  // verbatim, so this rides along on the ticket — no API change, and older payloads
  // without it still render (the inbox falls back to name + id).
  function customerSnapshot() {
    const c = state.customer;
    const p = c.profile;
    const money = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;
    const { orders, last, ltv, isSub, vip } = facts(c);
    const chats = [...(c.chats || [])].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
    const trim = (o) => ({
      order_id: o.order_id,
      product: o.product,
      order_date: o.order_date,
      amount_usd: money(o.amount_usd),
      is_subscription_order: isTrue(o.is_subscription_order),
    });
    const lastChat = chats[chats.length - 1];
    const opener = lastChat && (lastChat.messages || []).find((m) => m.role === "customer");
    const unresolved = chats.filter((ch) => ch.resolved === false).length;
    const flags = [];
    if (vip) flags.push("vip");
    if (isSub) flags.push("subscriber");
    if (unresolved) flags.push("prior-unresolved");
    if (chats.some((ch) => ch.csat != null && ch.csat <= 2)) flags.push("low-csat");

    return {
      first_name: p.first_name,
      last_name: p.last_name,
      region: p.region,
      signup_date: p.signup_date,
      is_subscriber: isSub,
      lifetime_value_usd: money(ltv),
      vip,
      orders_count: orders.length,
      orders_total_usd: money(orders.reduce((s, o) => s + (parseFloat(o.amount_usd) || 0), 0)),
      last_order: last ? trim(last) : null,
      recent_orders: orders.slice(-4).reverse().map(trim),
      support: {
        chats: chats.length,
        unresolved,
        last: lastChat
          ? {
              chat_id: lastChat.chat_id,
              started_at: lastChat.started_at,
              agent_name: lastChat.agent_name,
              resolved: lastChat.resolved === true,
              csat: lastChat.csat == null ? null : lastChat.csat,
              opener: opener ? opener.text : "",
            }
          : null,
      },
      flags,
    };
  }

  /* ================= system prompt ================= */
  function buildSystemPrompt() {
    const c = state.customer;
    const p = c.profile;
    const { orders, last, ltv, isSub, vip } = facts(c);
    const badHistory = (c.chats || []).some((ch) => ch.resolved === false || (ch.csat != null && ch.csat <= 2));

    const articleText = state.articles.length
      ? state.articles.map((a) => `### [${a.id}] ${a.title}\n${a.body}`).join("\n\n")
      : "(The help center could not be loaded, so you have NO policy source right now. Do not answer any policy question from memory — say the help center is temporarily unreachable and offer to bring in a human.)";

    return `You are the support concierge for Ritual Goods, a DTC wellness brand, chatting with a logged-in customer on the storefront. Today's date is ${TODAY}.

# Voice
Warm, competent, and brief. Write like a person texting, not an essay: prefer commas, periods, and short sentences over em dashes (—), and use at most one in a whole reply. 1–3 short sentences for most answers — this is a chat window, not email. If an answer truly needs more, break it into short paragraphs separated by blank lines — lead with the direct answer, details after; never one dense block. Never use corporate filler ("Thank you for reaching out"). Use the customer's first name sparingly.

# The customer you are talking to
${JSON.stringify({ profile: p, orders, past_support_chats: c.chats }, null, 1)}

Notes: ${isSub ? "SUBSCRIBER" : "not a subscriber"}; lifetime value $${ltv.toFixed(2)}${vip ? " (VIP)" : ""}; latest order ${last ? `${last.order_id} — ${last.product}, placed ${last.order_date}` : "none"}${badHistory ? "; has a prior unresolved or poorly-rated support experience — acknowledge it if they bring up related frustration, and extend extra care. If their question is about the same thing that prior chat failed to resolve, say plainly that you can see it went unresolved last time, do NOT re-recite the self-serve step that already failed them, and lead with having the team handle it directly" : ""}.

Never ask for information you already have (name, email, order number). "Where's my order?" means their actual latest order — answer with its real details. Tracking links go out by email at shipment; the widget cannot show live tracking.

# Help center (the ONLY source of policy truth)
${articleText}

# Grounding rules — the cardinal rule
- Answer policy questions ONLY from the articles above. Quote specifics (numbers, timeframes) accurately.
- When an article answers the question, end your reply with a line: [source: <exact article title>]
- If the articles genuinely don't cover something, say so plainly in one sentence and offer to connect a human. NEVER invent a policy, price, ingredient, or promise. An honest "I don't know" is always correct; a confident guess is the one unforgivable error.
- Careful: some questions sound uncovered but are answerable (e.g. "Do you ship to Japan?" — the shipping article lists the only countries we ship to, so the answer is no). Reason from what the articles state and imply directly; do not stretch beyond that.
- A rule about one subject does not answer a question about a different subject. A promo-code rule is not a price-match policy; a return window is not a warranty. If the customer names a policy the articles never mention, say it isn't covered and offer a human — even when a related-sounding rule exists.
- Multi-part questions: answer each part on its own merits and say plainly which part you can't answer. Never let a covered part carry an uncovered one — a confident answer beside an unsupported one makes both look sourced.
- When a question could mean two different things and the articles answer them differently (e.g. "swap" = change a subscription product vs. exchange one already bought), cover both readings in one short line rather than silently picking one. Naming the ambiguity builds more trust than a confident guess at intent.

# Escalation — the escalate_to_human tool
Escalate (call the tool) when:
- The customer asks for a human — or says yes to your offer of one; consent counts as asking.
- The customer is clearly angry or frustrated — do not argue past two turns; with a VIP or prior bad experience, escalate on clear first-message anger. But calm concern is NOT anger: a polite question ("seems a bit delayed — any idea?") gets a grounded answer plus an offer, never an unprompted escalation.
- A damaged/defective/wrong item claim needs photo review or a replacement/refund actioned (policy says we handle it — but a human executes it).
- They push for something off-policy or an exception (discounts, overriding a rule) AFTER you've answered with what policy offers — first give the grounded answer; escalate only if they insist. But account changes only a human can perform (address changes, refunds) escalate right away. For subscription cancellation, give the self-serve path from the article, offer to have the team do it, and escalate when they say yes.
- The articles don't cover their question and it matters to them.
Do NOT escalate plain FAQ questions the articles answer, and do not offer escalation when a grounded answer fully resolves the question. When an article routes to support (e.g. tracking stalled 5+ business days), give the grounded answer first, then ask in one short sentence whether they'd like you to hand it to the team — escalate when they say yes.

Tool arguments:
- subject: specific and scannable, e.g. "Damaged Renew Serum — replacement requested (VIP)"
- priority: urgent = angry VIP/subscriber or time-critical; high = damaged items, billing errors, upset customer; normal = routine human requests; low = non-urgent feedback
- tags: 2–4 from: damaged, refund, return, subscription, cancellation, shipping, billing, product-question, angry-customer, vip, off-policy, other
- ai_summary: ONE paragraph a human can act on in 10 seconds, exactly this shape: "WHO: <name, id, $LTV, subscriber?, region>. ISSUE: <what happened>. WANTS: <what they want>. CONTEXT: <relevant order/history detail>. SUGGESTED ACTION: <specific next step + relevant policy>."
- customer_visible_message: 1–2 warm sentences shown to the customer right before the transfer: first validate their specific concern in plain words (acknowledge what happened and why it matters to them), then say transparently that you are connecting them with our team so they can help further. No corporate filler, no "please hold".

After calling the tool, do not write anything else — the widget takes over.${state.desklyOk ? "" : `

# Handoff is unavailable right now
Our helpdesk is unreachable, so you CANNOT reach a human and must NOT call escalate_to_human. Never say you are connecting them, transferring them, or that the team will reply here — promising a handoff you cannot deliver is worse than saying no. If they need a person, say in one short sentence that live handoff is temporarily down, then tell them to email ${SUPPORT_EMAIL} and we'll get back to them as soon as we can, or to check back shortly. Keep answering anything the articles cover.`}`;
  }

  /* ================= Claude call (streaming + tool use) ================= */
  const ESCALATE_TOOL = {
    name: "escalate_to_human",
    description: "File a ticket in the Deskly helpdesk so a human support agent takes over this conversation. Use according to the escalation rules.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        tags: { type: "array", items: { type: "string" } },
        ai_summary: {
          type: "string",
          description: "Handoff summary with all five labels, in this order, every time: WHO: … ISSUE: … WANTS: … CONTEXT: … SUGGESTED ACTION: …. Never drop a label: the agent inbox shows each one as its own row. If a part is unclear, say so after the label (e.g. \"WANTS: not stated yet\").",
        },
        customer_visible_message: { type: "string" },
      },
      required: ["subject", "priority", "tags", "ai_summary", "customer_visible_message"],
    },
  };

  function showError(bubbleEl, friendly, detail) {
    bubbleEl.classList.add("rg-err");
    bubbleEl.removeAttribute("aria-busy");
    bubbleEl.textContent = friendly;
    if (detail) bubbleEl.appendChild(el("small", null, detail));
    const bar = el("div", "rg-pills");
    const retry = el("button", "rg-pill", "Try again");
    retry.type = "button";
    retry.onclick = () => { bubbleEl.remove(); runTurn(); };
    bar.appendChild(retry);
    bubbleEl.appendChild(bar);
    if (follow) scrollToBottom(true);
  }

  async function askClaude() {
    await ensureArticles(); // never answer policy questions from memory
    const key = storedKey();
    if (!key) {
      add("rg-bot", "I need an API key to think — send again to enter one.");
      return;
    }

    const typing = add("rg-bot", "");
    typing.innerHTML = '<span class="rg-typing" aria-label="Thinking"><i></i><i></i><i></i></span>';
    typing.setAttribute("aria-busy", "true");

    let res;
    try {
      res = await fetch(CLAUDE, {
        method: "POST",
        headers: claudeHeaders(key),
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1600,
          output_config: { effort: "low" },
          // The system prompt carries all 11 articles (~3k tokens) and is byte-identical
          // across a conversation, so it is re-read from cache on every turn after the
          // first instead of re-sent. Tools render before system, so this covers both.
          system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
          tools: [ESCALATE_TOOL],
          messages: state.history,
          stream: true,
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    } catch (e) {
      console.error("[widget] Claude error:", e);
      // DEV: surface the real error so failures are debuggable. Swap for softer
      // copy before judging if desired — but honest errors beat mystery ones.
      let detail = String(e.message || e);
      const m = detail.match(/"message"\s*:\s*"([^"]+)"/);
      if (m) detail = m[1];
      detail = detail.slice(0, 300);
      if (detail.includes("401") || /authentication|invalid x-api-key/i.test(detail)) {
        try { localStorage.removeItem("anthropic_key"); } catch {}
        detail += window.RITUAL_AI_KEY
          ? " — the key in window.RITUAL_AI_KEY was rejected."
          : " — API key rejected; cleared from storage, you'll be asked for a new one.";
      }
      if (/^API 402/.test(String(e.message))) {
        showError(typing, "That's the end of this demo's AI budget for your visit.", detail);
        return;
      }
      showError(typing, "I couldn't reach our AI service just now.", detail);
      return;
    }

    // Stream SSE: accumulate the reply off-screen (the typing dots stay up while the
    // model writes), plus tool input into toolJson. The finished answer lands in one piece.
    let text = "";
    let tool = null;       // {name, json}
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop();
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "content_block_start" && ev.content_block.type === "tool_use") {
            tool = { name: ev.content_block.name, json: "" };
          } else if (ev.type === "content_block_delta") {
            if (ev.delta.type === "text_delta") {
              text += ev.delta.text;
            } else if (ev.delta.type === "input_json_delta" && tool) {
              tool.json += ev.delta.partial_json;
            }
          }
        }
      }
    } catch (e) {
      console.error("[widget] stream error:", e);
    }
    typing.removeAttribute("aria-busy");

    // Record the assistant turn (text only — after an escalation the Claude
    // conversation ends and the human thread takes over).
    if (text.trim()) state.history.push({ role: "assistant", content: text });

    if (tool) {
      removeBubble(typing); // escalation: the customer-visible line comes from the tool args (no orphan label)
      let args;
      try { args = JSON.parse(tool.json || "{}"); }
      catch { args = null; }
      if (args) await escalate(args);
      else add("rg-bot", "Let me connect you with our team — one moment.");
      return;
    }

    if (!text.trim()) { typing.textContent = "Sorry — I lost my train of thought. Could you say that again?"; return; }
    // One blob is hard to read: each paragraph becomes its own bubble, and the bubbles
    // land one at a time with a brief typing beat between them — paced like a person
    // sending consecutive messages, not a bot dumping a wall. Chips ride the last bubble.
    const { paras, titles } = splitAnswer(text);
    await revealInto(typing, paras[0]);
    let last = typing;
    for (let i = 1; i < paras.length; i++) {
      const b = add("rg-bot", "");
      b.innerHTML = '<span class="rg-typing" aria-hidden="true"><i></i><i></i><i></i></span>';
      await new Promise((r) => setTimeout(r, Math.min(450 + paras[i].length * 7, 1300)));
      await revealInto(b, paras[i]);
      last = b;
    }
    attachSources(last, titles);
    if (follow) scrollToBottom(true);
    const lastQ = [...state.history].reverse().find((m) => m.role === "user");
    report({ topic: titles[0] || null, question: lastQ ? lastQ.content.slice(0, 140) : "", turn: state.history.filter((m) => m.role === "user").length });
  }

  // Strip "[source: Title]" markers, then split the answer into paragraphs.
  // The marker often lands mid-answer between sections; only horizontal space is
  // eaten with it, so the line breaks around it survive and still separate the text
  // (eating the newlines too would run "…new order.Promo codes — …" together).
  function splitAnswer(text) {
    const re = /[ \t]*\[source:\s*([^\]]+)\][ \t]*/gi;
    const titles = [];
    const clean = text
      .replace(re, (_, t) => { titles.push(t.trim()); return ""; })
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    return { paras: paras.length ? paras : [clean], titles };
  }
  function attachSources(bubbleEl, titles) {
    if (!titles.length) return;
    const wrap = el("div", "rg-srcs");
    for (const t of titles) {
      const chip = el("span", "rg-src");
      chip.innerHTML = ICON_DOC;
      chip.appendChild(el("span", null, t));
      chip.title = t;
      wrap.appendChild(chip);
    }
    bubbleEl.appendChild(wrap);
  }

  /* ================= escalation → Deskly ticket ================= */
  async function escalate(args) {
    const p = state.customer.profile;
    const transcript = state.history
      .map((m) => `${m.role === "user" ? "customer" : "ai"}: ${splitAnswer(m.content).paras.join("\n\n")}`)
      .join("\n\n");

    // 1. Validate + transparent transfer (model-written), before anything is filed.
    await revealInto(add("rg-bot", ""), args.customer_visible_message ||
      `I hear you, ${p.first_name}. This deserves a human's attention, so I'm connecting you with our team.`);
    // 2. Visible progress: request sent → pending → connected.
    const pend = sys("", "pending");
    pend.innerHTML = `${ICON_SPIN}<span>Sending your request to our team…</span>`;
    const t0 = Date.now();

    let ticket;
    try {
      const res = await fetch(`${DESKLY}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: {
            subject: args.subject,
            priority: args.priority,
            tags: args.tags,
            requester: {
              name: `${p.first_name} ${p.last_name}`,
              customer_id: p.customer_id,
              turns: state.history.filter((m) => m.role === "user").length, // customer messages before handoff (dashboard)
              profile: customerSnapshot(), // extra key Deskly stores verbatim → the inbox's customer panel
            },
            ai_summary: args.ai_summary,
            comment: { body: transcript, author: "customer" },
          },
        }),
      });
      if (!res.ok) throw new Error(`Deskly ${res.status}`);
      ticket = (await res.json()).ticket;
    } catch (e) {
      console.error("[widget] escalation failed:", e);
      pend.remove();
      state.handoffMissed = true;
      await revealInto(add("rg-bot", ""), `Our support system is offline, so this didn't reach the team. Email ${SUPPORT_EMAIL} and they'll pick it up, or stay here and I'll let you know the moment it's back.`);
      return;
    }

    // Hold the pending state just long enough to read as real progress, not a flicker.
    await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - t0))));
    state.agentName = AGENT_NAMES[ticket.id % AGENT_NAMES.length];
    pend.remove(); // the spinner's job is done; the handover reads in narrative order below

    state.ticketId = ticket.id;
    state.pollCursor = ticket.comments.length;
    setAgentHeader(ticket.id);
    // 1) Ritual Goods AI hands over in its own voice, 2) the divider records that it happened.
    await revealInto(add("rg-bot", ""), `I've passed this to ${state.agentName} on our team with your full conversation, they'll reply right here shortly, ${p.first_name}.`);
    sysRow("stack", `Connected to ${state.agentName}`, `Ticket #${ticket.id}`);
    input.placeholder = "Message our support team…";
    saveSession();
    startPolling();
  }

  /* ================= escalated mode: thread + polling ================= */
  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(poll, 2000);
  }
  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  async function poll() {
    if (!state.ticketId) return;
    let ticket;
    try {
      const r = await fetch(`${DESKLY}/tickets/${state.ticketId}`);
      if (r.status === 404) { // helpdesk restarted — the thread is gone, say so once
        stopPolling();
        sys("This conversation is no longer available in our helpdesk", "warn");
        return;
      }
      ticket = (await r.json()).ticket;
    } catch { return; } // transient — keep polling
    if (!ticket) return;
    // Customer messages render locally at send time; only agent replies come from polls.
    const cs = ticket.comments || [];
    let fresh = false;
    try {
      for (let i = state.pollCursor; i < cs.length; i++) {
        if (cs[i].author === "agent") { renderAgentReply(cs[i].body); fresh = true; }
      }
    } finally {
      const moved = state.pollCursor !== cs.length;
      state.pollCursor = cs.length; // advance regardless, or a render error replays it every tick
      if (moved) saveSession();
    }
    if (fresh) { offerResolve(); saveSession(); }
    // The agent can also close the ticket from their side — say so here, once.
    if (ticket.status === "solved" && !state.solved) markSolved();
  }

  // Shown whether the customer tapped "That solved it" or the agent closed it in Deskly.
  // A resolved ticket is a finished conversation: the thread goes read-only on both
  // sides, and the only way forward is a fresh session.
  function markSolved() {
    if (state.solved) return;
    state.solved = true;
    stopPolling();
    fadeOut(panel.querySelector(".rg-actions"));
    sys(`Ticket #${state.ticketId} resolved`, "ok");
    form.classList.add("closed");
    input.disabled = true;
    input.value = "";
    syncComposer();
    input.placeholder = "This conversation is closed";
    offerNewChat();
    clearSession(); // a closed ticket shouldn't be resumed on the next page load
  }

  function offerNewChat() {
    const bar = el("div", "rg-actions rg-pills");
    const again = el("button", "rg-pill resolve", "Start a new chat");
    again.type = "button";
    again.onclick = () => greet(true);
    bar.appendChild(again);
    append(bar, { smooth: true });
  }

  function renderAgentReply(body) {
    if (state.solved) return; // resolved threads are closed to further replies
    const bar = panel.querySelector(".rg-actions");
    if (bar) bar.remove(); // never let it sit between two of the agent's messages
    add("rg-agent", body);
    if (!isOpen()) {
      state.unread++;
      badge.querySelector(".rg-badge-dot").textContent = String(state.unread);
      badge.dataset.open = "true";
    }
  }

  // Proactive resolve: one tap closes the loop. The offer always trails the newest
  // agent message — if more replies land, it moves down rather than stranding mid-thread.
  // ("I still need help" is just… keep typing, so it isn't a button.)
  function offerResolve() {
    const existing = panel.querySelector(".rg-actions");
    if (existing) existing.remove(); // re-anchor below the latest reply
    const bar = el("div", "rg-actions rg-pills");
    const yes = el("button", "rg-pill resolve", "That solved it ✓");
    yes.type = "button";
    bar.appendChild(yes);
    append(bar, { smooth: true });
    yes.onclick = async () => {
      fadeOut(bar);
      const id = state.ticketId;
      const first = state.customer.profile.first_name;
      state.pollCursor++; // our own confirmation — don't echo it back as an agent reply
      add("rg-bot", `Glad that sorted it, ${first}. Thanks for confirming, we're here whenever you need us.`);
      markSolved(); // divider + "Start a new chat", in that order, after the message
      try {
        // Tell the agent too: the confirmation lands in their thread, then the ticket closes.
        await fetch(`${DESKLY}/tickets/${id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: { body: "✓ Customer confirmed this resolved their issue.", author: "customer" } }),
        });
        await fetch(`${DESKLY}/tickets/${id}/solve`, { method: "POST" });
      } catch { /* non-fatal */ }
    };
  }

  async function sendToTicket(text) {
    try {
      await fetch(`${DESKLY}/tickets/${state.ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: { body: text, author: "customer" } }),
      });
    } catch {
      sysRow("warn stack", "Message not delivered", "Support system offline");
    }
  }

  /* ================= deflection reporting → Deskly dashboard ================= */
  // Deskly already sees every escalation (the ticket). The one thing it can't see is a
  // conversation the AI handled alone — so that's the only event we report. Best-effort.
  function report(extra) {
    try {
      fetch(`${DESKLY}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: Object.assign({ kind: "ai_answered", customer_id: state.customer.profile.customer_id }, extra) }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* stats are best-effort */ }
  }

  /* ================= session survival (refresh mid-ticket) ================= */
  // A reload must not drop the customer out of a live handoff while the agent types
  // into a ticket nobody is watching. Only the ticket id is stored — the thread itself
  // is rebuilt from Deskly, which is the source of truth for it.
  const SESSION_KEY = "rg_session";
  function saveSession() {
    try {
      if (!state.ticketId) return localStorage.removeItem(SESSION_KEY);
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        ticketId: state.ticketId,
        customerId: state.customer.profile.customer_id,
        seen: state.pollCursor, // anything past this arrived while they were away
      }));
    } catch { /* private mode — the session just won't survive a reload */ }
  }
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch {} }

  async function restoreSession() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return false; }
    if (!saved || saved.customerId !== state.customer.profile.customer_id) return false;
    let ticket;
    try {
      const r = await fetch(`${DESKLY}/tickets/${saved.ticketId}`);
      if (!r.ok) throw new Error("gone");
      ticket = (await r.json()).ticket;
    } catch { clearSession(); return false; } // helpdesk restarted, or the ticket is gone
    if (!ticket) { clearSession(); return false; }

    state.ticketId = ticket.id;
    state.agentName = AGENT_NAMES[ticket.id % AGENT_NAMES.length];
    const cs = ticket.comments || [];
    sysRow("", "Earlier", "continued");
    cs.forEach((c, i) => {
      // The first comment is the pre-escalation transcript; unpack it back into bubbles.
      if (i === 0 && /^(customer|ai):\s/.test(c.body)) {
        c.body.split(/\n\n(?=(?:customer|ai):\s)/).forEach((seg) => {
          const m = seg.match(/^(customer|ai):\s*([\s\S]*)$/);
          if (m && m[2].trim()) add(m[1] === "customer" ? "rg-user" : "rg-bot", m[2].trim(), { force: true });
        });
        sysRow("stack", `Connected to ${state.agentName}`, `Ticket #${ticket.id}`);
        return;
      }
      if (c.author === "agent") add("rg-agent", c.body, { force: true });
      else if (c.author === "customer") add("rg-user", c.body, { force: true });
    });
    state.pollCursor = cs.length;
    // Replies that landed while the page was closed or reloading are still unread.
    const seen = Number.isInteger(saved.seen) ? saved.seen : cs.length;
    const missed = cs.slice(seen).filter((c) => c.author === "agent").length;
    if (missed && !isOpen()) {
      state.unread = missed;
      badge.querySelector(".rg-badge-dot").textContent = String(missed);
      badge.dataset.open = "true";
    }
    setAgentHeader(ticket.id);
    input.placeholder = "Message our support team…";
    if (ticket.status === "solved") markSolved();
    else { offerResolve(); startPolling(); }
    scrollToBottom(false);
    return true;
  }

  /* ================= conversation lifecycle ================= */
  // Grounded answers are impossible without the articles, so this is retried on every
  // opportunity (panel open, each message) rather than only once at page load — the
  // storefront is often open before Deskly is running.
  async function ensureArticles(force) {
    if (!force && state.articles.length && state.desklyOk && Date.now() - state.desklyCheckedAt < 8000) return true;
    try {
      const r = await fetch(`${DESKLY}/help_center/articles`);
      if (!r.ok) throw new Error(`Deskly ${r.status}`);
      const d = await r.json();
      if (!d.articles || !d.articles.length) throw new Error("no articles");
      state.articles = d.articles;
      state.desklyCheckedAt = Date.now();
      const wasOffline = !state.desklyOk;
      state.desklyOk = true;
      console.log(`[widget] connected to Deskly — ${d.count} help-center articles loaded`);
      if (wasOffline && msgs.children.length) {
        if (!state.ticketId) setStatus("Ritual Goods AI", ""); // escalated header keeps its agent + ticket
        sys("Support system back online", "ok");
        // If the outage swallowed a handoff, close that loop instead of leaving them waiting.
        if (state.handoffMissed && !state.ticketId) {
          state.handoffMissed = false;
          add("rg-bot", "Our support system is back. Want me to pass this to the team now?");
        }
      }
      return true;
    } catch (e) {
      const wasOnline = state.desklyOk;
      state.desklyOk = false;
      state.desklyCheckedAt = Date.now();
      if (wasOnline && msgs.children.length) {
        if (!state.ticketId) setStatus("Ritual Goods AI · offline", "offline");
        sysRow("warn stack", "Support system offline", `Email ${SUPPORT_EMAIL}`);
      }
      console.warn("[widget] Deskly unreachable — start it with: cd helpdesk && python3 deskly.py", e);
      startHealthWatch(); // recover on our own; the customer shouldn't have to probe by sending a message
      return false;
    }
  }
  async function init() {
    await ensureArticles();
    await restoreSession(); // resume a live ticket even if the panel is never opened
  }

  // Runs the whole time the chat is open: catches the helpdesk going down AND coming
  // back, so the customer never has to send a message to discover either.
  function startHealthWatch() {
    if (state.healthTimer) return;
    state.healthTimer = setInterval(() => { if (!state.busy) ensureArticles(true); }, 5000);
  }
  function stopHealthWatch() {
    if (state.healthTimer) { clearInterval(state.healthTimer); state.healthTimer = null; }
  }

  function reset() {
    stopPolling();
    state.history = [];
    state.ticketId = null;
    state.agentName = null;
    state.handoffMissed = false;
    state.solved = false;
    state.pollCursor = 0;
    state.busy = false;
    chipbar.hidden = true;
    form.classList.remove("busy");
    form.classList.remove("closed");
    input.disabled = false;
    msgs.innerHTML = "";
    follow = true;
    newPill.classList.remove("show");
    input.placeholder = "Ask about an order, returns, products…";
  }

  function showChips() {
    const p = state.customer.profile;
    const isSub = isTrue(p.is_subscriber);
    const labels = [
      "Where's my order?",
      "Returns & refunds",
      isSub ? "Manage my subscription" : "Shipping times & costs",
      "Do you ship to my country?",
      "Promo codes & store credit",
      "Talk to a person",
    ];
    chipbar.innerHTML = "";
    labels.forEach((t, i) => {
      const b = el("button", "rg-pill rg-chip", t);
      b.type = "button";
      b.style.animationDelay = (i * 40) + "ms";
      b.onclick = () => { input.value = t; syncComposer(); form.requestSubmit(); };
      chipbar.appendChild(b);
    });
    chipbar.classList.remove("rg-leaving");
    chipbar.hidden = false;
    chipbar.scrollLeft = 0;
    syncChipFade();
  }
  // Edge fades are an affordance for "more chips this way" — each side fades only
  // while there is actually content hiding beyond it.
  function syncChipFade() {
    chipbar.classList.toggle("can-left", chipbar.scrollLeft > 4);
    chipbar.classList.toggle("can-right",
      chipbar.scrollWidth - chipbar.clientWidth - chipbar.scrollLeft > 4);
  }
  function clearChips() {
    if (chipbar.hidden) return;
    chipbar.classList.add("rg-leaving");
    setTimeout(() => { chipbar.hidden = true; }, reducedMotion() ? 0 : 130);
  }

  async function greet(fresh) {
    reset();
    if (fresh) clearSession();
    else if (await restoreSession()) return;
    const token = ++state.greetToken; // a customer switch mid-greeting cancels this one
    const p = state.customer.profile;
    sysRow("", "Today", new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/[\s\u202f]/g, ""));
    setStatus("Ritual Goods AI", state.desklyOk ? "" : "offline");
    const last = facts(state.customer).last;
    // Greet, flag anything broken, then hand the turn over. The question lands last so
    // the greeting ends on an invitation rather than a fact or an apology.
    const lines = [`Hi ${p.first_name}!`];
    if (!state.desklyOk) {
      lines.push(state.articles.length
        ? `Our support system is offline right now, so I can't connect you with a person. I can still answer anything from our help center. For anything urgent, email ${SUPPORT_EMAIL}.`
        : `Our support system is offline right now, so I can't connect you with a person or answer policy questions. Email ${SUPPORT_EMAIL} and the team will reply as soon as they can.`);
    }
    lines.push(last
      ? `I can see your latest order (${last.product}, ${last.order_date}). How can I help you today?`
      : "How can I help you today?");

    const alive = () => token === state.greetToken;
    const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion() ? 0 : ms));
    await wait(420); // let the panel finish materializing before anyone "starts typing"
    for (const line of lines) {
      if (!alive()) return;
      const b = add("rg-bot", "", { force: true });
      b.innerHTML = '<span class="rg-typing" aria-label="Typing"><i></i><i></i><i></i></span>';
      await wait(Math.min(400 + line.length * 6, 1100));
      if (!alive()) { b.remove(); return; }
      if (!(await revealInto(b, line, alive))) return;
    }
    if (!alive()) return;
    // The status row closes the greeting: it stays as the standing marker of the outage.
    if (!state.desklyOk) {
      sysRow("warn stack", "Support system offline", `Email ${SUPPORT_EMAIL}`);
    }
    showChips();
  }

  /* ================= open / close ================= */
  const isOpen = () => morph.dataset.open === "true";
  function openPanel() {
    ensureArticles();
    startHealthWatch();
    morph.dataset.open = "true";
    state.unread = 0;
    badge.dataset.open = "false";
    bubble.setAttribute("aria-expanded", "true");
    if (!msgs.children.length) greet();
    input.focus({ preventScroll: true });
  }
  function closePanel() {
    stopHealthWatch(); // nothing to announce to a closed panel
    morph.dataset.open = "false";
    bubble.setAttribute("aria-expanded", "false");
  }
  bubble.addEventListener("click", () => {
    if (isOpen()) closePanel(); else openPanel();
  });
  closeBtn.addEventListener("click", () => { closePanel(); bubble.focus(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen() && panel.contains(document.activeElement)) {
      closePanel();
      bubble.focus();
    }
  });

  window.addEventListener("ritual:customer-changed", (e) => {
    state.customer = e.detail;
    if (isOpen()) greet();
    else reset();
  });

  /* ================= composer ================= */
  function syncComposer() {
    if (follow) scrollToBottom(false); else syncMsgFade();
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
    form.classList.toggle("has-text", !!input.value.trim());
  }
  input.addEventListener("input", syncComposer);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  async function runTurn() {
    if (state.busy) return;
    if (!storedKey() && !(await requestKey())) return;
    state.busy = true;
    form.classList.add("busy");
    try { await askClaude(); }
    finally { state.busy = false; form.classList.remove("busy"); }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || state.busy) return;
    clearChips();
    add("rg-user", q, { force: true });
    input.value = "";
    syncComposer();

    if (state.ticketId) { // escalated: straight to the human thread
      fadeOut(panel.querySelector(".rg-actions")); // question re-opened — hide the resolve offer
      await sendToTicket(q);
      return;
    }

    state.history.push({ role: "user", content: q });
    await runTurn();
  });

  init();
})();
