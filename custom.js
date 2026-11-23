/**
 * user/custom.js — Antigravity 一键上下文压缩按钮扩展
 * 依赖：chuanban-antigravity-theme-patch（user/custom.js 前端扩展钩子）
 * 功能：在输入框底栏右侧挂载「压缩」按钮，点击自动触发 /compact 并提交，
 *       结合生成态生命周期追踪与 Ctx 指标监控，压缩完成后弹窗反馈。
 */
(function () {
  if (typeof window.__ag_user_custom_cleanup === 'function') {
    try {
      window.__ag_user_custom_cleanup();
    } catch (e) {}
  }

  const BTN_ATTR = 'data-ag-compact-btn';
  const HIDDEN_STEP_ATTR = 'data-ag-compact-hidden';
  const TT_ID = 'ag-compact-ctx-tooltip';
  const TOAST_ID = 'ag-compact-ctx-toast';
  const TT_TEXT = '（压缩上下文）';
  let disposed = false;
  let rafId = 0;
  let stepTimers = [];
  let toastHideTimer = 0;
  let monitorTimer = 0;

  function clearStepTimers() {
    while (stepTimers.length > 0) {
      clearTimeout(stepTimers.pop());
    }
  }

  function clearMonitorTimer() {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = 0;
    }
  }

  function parseTokenCount(raw) {
    const m = String(raw || '').trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([kKmM]?)$/);
    if (!m) return NaN;
    const val = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    if (unit === 'k') return val * 1000;
    if (unit === 'm') return val * 1000000;
    return val;
  }

  function readCtxMetrics(box) {
    const pill =
      (box && box.querySelector('[data-ag-metrics-pill="1"], .ag-live-metrics-pill, #ag-live-metrics-pill')) ||
      document.querySelector('[data-ag-metrics-pill="1"], .ag-live-metrics-pill, #ag-live-metrics-pill');
    if (!pill) return null;
    const text = String(pill.textContent || '');
    const m = text.match(/Ctx\s+([0-9.]+[kKmM]?)\s*\/\s*([0-9.]+[kKmM]?)\s*\((\d+(?:\.\d+)?)%\)/i);
    if (!m) return null;
    return {
      usedRaw: m[1],
      maxRaw: m[2],
      tokens: parseTokenCount(m[1]),
      pct: parseFloat(m[3]),
      pctText: m[3] + '%'
    };
  }

  function ensureToast() {
    if (!document.body) return null;
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.setAttribute('data-ag-token-ui', '1');
      const dot = document.createElement('span');
      dot.className = 'ag-toast-dot';
      const label = document.createElement('span');
      label.className = 'ag-toast-text';
      toast.appendChild(dot);
      toast.appendChild(label);
      document.body.appendChild(toast);
    }
    return toast;
  }

  function showToast(state, message, durationMs) {
    if (disposed) return;
    const toast = ensureToast();
    if (!toast) return;
    if (toastHideTimer) {
      clearTimeout(toastHideTimer);
      toastHideTimer = 0;
    }
    toast.setAttribute('data-state', state || 'info');
    const label = toast.querySelector('.ag-toast-text');
    if (label) label.textContent = message;
    toast.setAttribute('data-visible', '1');
    if (durationMs && durationMs > 0) {
      toastHideTimer = setTimeout(() => {
        toastHideTimer = 0;
        const el = document.getElementById(TOAST_ID);
        if (el) el.removeAttribute('data-visible');
      }, durationMs);
    }
  }

  function hideCompactUserSteps() {
    if (disposed) return;
    const steps = document.querySelectorAll('[data-testid="user-input-step"]');
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.hasAttribute(HIDDEN_STEP_ATTR)) continue;
      const bubble = step.querySelector('[data-testid="user-message-bubble"]');
      const content = step.querySelector('[data-testid="user-message-content"]');
      if (!bubble || !content) continue;
      const txt = String(content.textContent || '').trim().toLowerCase();
      if ((txt === 'compact' || txt === '/compact') && bubble.children.length <= 1) {
        step.setAttribute(HIDDEN_STEP_ATTR, '1');
      }
    }
  }

  function findFooterRow(box) {
    if (!box || !box.querySelector) return null;
    const directFooter = box.querySelector('.agy-composer-footer');
    if (directFooter && directFooter.children.length >= 2) {
      return directFooter;
    }
    const rows = box.querySelectorAll('div.flex.w-full.items-center.justify-between');
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.getAttribute('data-testid') === 'input-box-bottom-toolbar') continue;
      if (r.querySelector('[data-testid="model-selector-trigger"], [data-testid="send-button"]')) {
        return r;
      }
    }
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.getAttribute('data-testid') !== 'input-box-bottom-toolbar') return r;
    }
    return directFooter || null;
  }

  function ensureTooltip() {
    if (!document.body) return null;
    let tt = document.getElementById(TT_ID);
    if (!tt) {
      tt = document.createElement('div');
      tt.id = TT_ID;
      tt.setAttribute('data-ag-token-ui', '1');
      tt.textContent = TT_TEXT;
      document.body.appendChild(tt);
    } else if (tt.textContent !== TT_TEXT) {
      tt.textContent = TT_TEXT;
    }
    return tt;
  }

  function showTooltip(btn, text) {
    if (disposed || !btn || !btn.isConnected) return;
    const tt = ensureTooltip();
    if (!tt) return;
    tt.textContent = text || TT_TEXT;
    const rect = btn.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return;
    tt.style.left = Math.round(rect.left + rect.width / 2) + 'px';
    tt.style.bottom = Math.max(8, Math.round(window.innerHeight - rect.top + 6)) + 'px';
    tt.setAttribute('data-visible', '1');
  }

  function hideTooltip() {
    const tt = document.getElementById(TT_ID);
    if (tt) {
      tt.removeAttribute('data-visible');
    }
  }

  function isGeneratingNow(box) {
    return Boolean(
      (box && box.querySelector('button[data-testid="input-cancel-button"]')) ||
      document.querySelector('button[data-testid="input-cancel-button"]')
    );
  }

  function startCompactMonitor(box, before) {
    clearMonitorTimer();
    const startAt = Date.now();
    const maxStartWaitMs = 20000;
    const maxRunWaitMs = 180000;
    const settleDelayMs = 1600;
    let hasStartedGenerating = isGeneratingNow(box);
    let finishedAt = 0;

    monitorTimer = setInterval(() => {
      if (disposed) {
        clearMonitorTimer();
        return;
      }
      hideCompactUserSteps();
      const after = readCtxMetrics(box);
      const elapsed = Date.now() - startAt;

      if (before && after) {
        const dropped = after.tokens < before.tokens * 0.85 || after.pct <= before.pct - 3;
        if (dropped) {
          clearMonitorTimer();
          showToast('success', '上下文压缩成功（' + before.pctText + ' → ' + after.pctText + '）', 4500);
          return;
        }
      }

      const running = isGeneratingNow(box);
      if (running) {
        hasStartedGenerating = true;
        finishedAt = 0;
      } else if (hasStartedGenerating) {
        if (!finishedAt) {
          finishedAt = Date.now();
        }
        if (Date.now() - finishedAt >= settleDelayMs) {
          clearMonitorTimer();
          if (before && after && after.tokens >= before.tokens * 0.95) {
            showToast('success', '上下文压缩已完成（Ctx 指标将在下轮对话刷新）', 4500);
          } else {
            showToast('success', '上下文压缩已完成（当前 ' + (after ? after.pctText : '未知') + '）', 4500);
          }
          return;
        }
      }

      const timeoutLimit = hasStartedGenerating ? maxRunWaitMs : maxStartWaitMs;
      if (elapsed >= timeoutLimit) {
        clearMonitorTimer();
        if (!before && after) {
          showToast('success', '压缩指令已执行（当前 ' + after.pctText + '）', 4500);
        } else if (hasStartedGenerating) {
          showToast('warn', '压缩运行超时（当前 ' + (after ? after.pctText : '未知') + '）', 5000);
        } else {
          showToast('warn', '压缩未启动或已超时（当前 ' + (after ? after.pctText : '未知') + '）', 5000);
        }
      }
    }, 400);
  }

  function triggerCompactForBox(box) {
    if (!box) return;
    clearStepTimers();
    clearMonitorTimer();
    const editor = box.querySelector('[data-lexical-editor="true"], [contenteditable="true"], textarea');
    if (!editor) {
      showToast('error', '压缩触发失败：未找到输入框', 4000);
      return;
    }

    const before = readCtxMetrics(box);

    editor.focus();

    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
    } catch (e) {}

    try {
      document.execCommand('insertText', false, '/compact');
    } catch (e) {}

    function findSendButton() {
      return box.querySelector(
        'button[data-testid="send-button"]:not([disabled]), ' +
        'button[data-testid="input-send-button"]:not([disabled]), ' +
        'button[data-testid*="send"]:not([disabled]):not(.ag-compact-ctx-btn), ' +
        'button[aria-label*="发送"]:not([disabled]), ' +
        'button[aria-label*="Send"]:not([disabled]), ' +
        '.agy-send-button:not([disabled])'
      );
    }

    function clickSendAndMonitor() {
      const sendBtn = findSendButton();
      if (sendBtn) {
        sendBtn.click();
        showToast('loading', '正在压缩上下文…', 0);
        startCompactMonitor(box, before);
        return true;
      }
      return false;
    }

    function dispatchSendWithRetry(tryCount) {
      if (disposed) return;
      if (clickSendAndMonitor()) return;
      if (tryCount < 15) {
        const tRetry = setTimeout(() => dispatchSendWithRetry(tryCount + 1), 45);
        stepTimers.push(tRetry);
        return;
      }
      try {
        editor.focus();
        editor.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
        showToast('loading', '正在压缩上下文…', 0);
        startCompactMonitor(box, before);
      } catch (e) {
        showToast('error', '压缩触发失败：未找到可用发送按钮', 4000);
      }
    }

    function findCompactPill() {
      return box.querySelector(
        '[data-uri="slashCommand:compact"], [data-beautiful-mention="/compact"], [data-uri*="compact"]'
      );
    }

    function waitPillAndSend(tryCount) {
      if (disposed) return;
      if (findCompactPill()) {
        dispatchSendWithRetry(0);
        return;
      }
      if (tryCount < 12) {
        const tPill = setTimeout(() => waitPillAndSend(tryCount + 1), 45);
        stepTimers.push(tPill);
      } else {
        showToast('error', '压缩触发失败：未生成 /compact 胶囊', 4000);
      }
    }

    let attempts = 0;
    function pollAndSelectOption() {
      if (disposed) return;
      attempts++;

      if (findCompactPill()) {
        dispatchSendWithRetry(0);
        return;
      }

      const labels = document.querySelectorAll(
        '[data-mention-menu] [data-testid="menu-option-label"], #typeahead-menu [data-testid="menu-option-label"], [role="listbox"] [data-testid="menu-option-label"]'
      );
      let targetLabel = null;
      for (let i = 0; i < labels.length; i++) {
        const txt = String(labels[i].textContent || '').trim().toLowerCase();
        if (txt === 'compact' || txt === '/compact') {
          targetLabel = labels[i];
          break;
        }
      }

      if (targetLabel) {
        targetLabel.click();
        const tSend = setTimeout(() => waitPillAndSend(0), 60);
        stepTimers.push(tSend);
        return;
      }

      if (attempts < 18) {
        const tNext = setTimeout(pollAndSelectOption, 35);
        stepTimers.push(tNext);
      } else {
        showToast('error', '压缩触发失败：未找到 /compact 选项', 4000);
      }
    }

    const t0 = setTimeout(pollAndSelectOption, 40);
    stepTimers.push(t0);
  }

  function createCompactButton(box) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ag-compact-ctx-btn';
    btn.setAttribute(BTN_ATTR, '1');
    btn.setAttribute('data-ag-token-ui', '1');
    btn.setAttribute('aria-label', '压缩上下文');
    btn.textContent = '压缩';

    btn.addEventListener('mouseenter', () => showTooltip(btn));
    btn.addEventListener('mouseleave', hideTooltip);
    btn.addEventListener('blur', hideTooltip);
    btn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      hideTooltip();
    });
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hideTooltip();
      triggerCompactForBox(box);
    });

    return btn;
  }

  function syncCompactButtons() {
    if (disposed) return;
    const boxes = document.querySelectorAll('[id="antigravity.agentSidePanelInputBox"]');
    let mountedNew = false;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const footerRow = findFooterRow(box);
      if (!footerRow || footerRow.children.length < 2) continue;
      const rightGroup = footerRow.children[1];
      if (!rightGroup) continue;

      let btn = rightGroup.querySelector('[' + BTN_ATTR + '="1"]');
      if (!btn) {
        btn = createCompactButton(box);
        rightGroup.insertBefore(btn, rightGroup.firstChild);
        mountedNew = true;
      } else if (rightGroup.firstElementChild !== btn) {
        rightGroup.insertBefore(btn, rightGroup.firstChild);
      }
    }
    if (mountedNew && typeof ctx !== 'undefined' && ctx && typeof ctx.ensureMetricsPill === 'function') {
      try {
        ctx.ensureMetricsPill(true);
      } catch (e) {}
    }
  }

  function scheduleSync() {
    if (disposed || rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      syncCompactButtons();
      hideCompactUserSteps();
    });
  }

  syncCompactButtons();
  hideCompactUserSteps();

  const observer =
    typeof MutationObserver !== 'undefined' && document.body
      ? new MutationObserver((mutations) => {
          for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            if (m.type !== 'childList') continue;
            const t = m.target;
            if (
              t instanceof Element &&
              (t.hasAttribute(BTN_ATTR) ||
                t.id === TT_ID ||
                t.id === TOAST_ID ||
                t.closest('#' + TOAST_ID) ||
                t.hasAttribute('data-ag-metrics-pill'))
            ) {
              continue;
            }
            scheduleSync();
            break;
          }
        })
      : null;

  if (observer && document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function cleanupAll() {
    if (disposed) return;
    disposed = true;
    if (observer) observer.disconnect();
    if (rafId) cancelAnimationFrame(rafId);
    clearStepTimers();
    clearMonitorTimer();
    if (toastHideTimer) {
      clearTimeout(toastHideTimer);
      toastHideTimer = 0;
    }
    hideTooltip();
    const tt = document.getElementById(TT_ID);
    if (tt) tt.remove();
    const toast = document.getElementById(TOAST_ID);
    if (toast) toast.remove();
    document.querySelectorAll('[' + HIDDEN_STEP_ATTR + '="1"]').forEach((el) => {
      el.removeAttribute(HIDDEN_STEP_ATTR);
    });
    document.querySelectorAll('[' + BTN_ATTR + '="1"]').forEach((el) => el.remove());
  }

  window.__ag_user_custom_cleanup = cleanupAll;

  if (typeof ctx !== 'undefined' && ctx && typeof ctx.onCleanup === 'function') {
    ctx.onCleanup(cleanupAll);
  }
})();
